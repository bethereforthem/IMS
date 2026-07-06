-- ============================================================================
-- AI Intelligence Assistant Migration
-- Run after admin_portal_migration.sql
-- ============================================================================

-- ── ai_prediction_runs ────────────────────────────────────────────────────────
-- Groups a set of predictions generated in one analysis pass.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prediction_runs (
  id                       UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_by             UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  triggered_by_badge       TEXT,
  institution              TEXT,
  total_incidents_analyzed INTEGER       NOT NULL DEFAULT 0,
  time_window_days         INTEGER       NOT NULL DEFAULT 90,
  model_version            TEXT          NOT NULL DEFAULT 'v1.0',
  claude_model             TEXT,
  status                   TEXT          NOT NULL DEFAULT 'RUNNING'
                             CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  error_message            TEXT,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_institution
  ON public.ai_prediction_runs(institution, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_status
  ON public.ai_prediction_runs(status, created_at DESC);

-- ── ai_predictions ────────────────────────────────────────────────────────────
-- Individual predicted crime hotspot zones.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id                UUID          NOT NULL REFERENCES public.ai_prediction_runs(id) ON DELETE CASCADE,
  rank                  INTEGER       NOT NULL DEFAULT 1,   -- 1 = highest priority
  center_lat            DECIMAL(10,7) NOT NULL,
  center_lng            DECIMAL(10,7) NOT NULL,
  radius_km             DECIMAL(5,2)  NOT NULL DEFAULT 2.0,
  district              TEXT,
  province              TEXT,
  confidence_score      INTEGER       NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  risk_level            TEXT          NOT NULL
                          CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  dominant_categories   TEXT[]        NOT NULL DEFAULT '{}',
  peak_hours            INTEGER[]     NOT NULL DEFAULT '{}',  -- 0-23
  peak_days             TEXT[]        NOT NULL DEFAULT '{}',  -- MON..SUN
  trend_direction       TEXT          NOT NULL DEFAULT 'STABLE'
                          CHECK (trend_direction IN ('INCREASING','STABLE','DECREASING')),
  incident_count_90d    INTEGER       NOT NULL DEFAULT 0,
  incident_count_30d    INTEGER       NOT NULL DEFAULT 0,
  incident_count_7d     INTEGER       NOT NULL DEFAULT 0,
  severity_score        DECIMAL(5,2)  NOT NULL DEFAULT 0,   -- weighted by priority
  explanation           TEXT          NOT NULL,
  patrol_recommendation TEXT,
  preventive_actions    TEXT[]        NOT NULL DEFAULT '{}',
  data_points_used      INTEGER       NOT NULL DEFAULT 0,
  institution           TEXT,
  valid_until           TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_predictions_run
  ON public.ai_predictions(run_id, rank);

CREATE INDEX IF NOT EXISTS idx_ai_predictions_location
  ON public.ai_predictions(center_lat, center_lng);

CREATE INDEX IF NOT EXISTS idx_ai_predictions_active
  ON public.ai_predictions(valid_until, confidence_score DESC);

-- ── ai_prediction_feedback ────────────────────────────────────────────────────
-- Commanders confirm or refute predictions — drives continuous improvement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prediction_feedback (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id    UUID        NOT NULL REFERENCES public.ai_predictions(id) ON DELETE CASCADE,
  run_id           UUID        REFERENCES public.ai_prediction_runs(id) ON DELETE SET NULL,
  submitted_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  badge_number     TEXT,
  institution      TEXT,
  accurate         BOOLEAN     NOT NULL,
  accuracy_rating  INTEGER     CHECK (accuracy_rating BETWEEN 1 AND 5),
  notes            TEXT,
  actual_event_id  UUID        REFERENCES public.intelligence_events(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prediction_id, submitted_by)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_prediction
  ON public.ai_prediction_feedback(prediction_id);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_run
  ON public.ai_prediction_feedback(run_id);

-- ── ai_insight_cache ──────────────────────────────────────────────────────────
-- Caches Claude-generated free-form insights (system-wide trends, anomalies).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_insight_cache (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id         UUID        REFERENCES public.ai_prediction_runs(id) ON DELETE CASCADE,
  institution    TEXT,
  insight_type   TEXT        NOT NULL CHECK (insight_type IN (
                   'TREND_SUMMARY','ANOMALY_ALERT','SEASONAL_PATTERN',
                   'PATROL_STRATEGY','RISK_OVERVIEW'
                 )),
  title          TEXT        NOT NULL,
  content        TEXT        NOT NULL,
  priority       TEXT        NOT NULL DEFAULT 'MEDIUM'
                   CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  UNIQUE (run_id, institution, insight_type, title)
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_institution
  ON public.ai_insight_cache(institution, expires_at DESC, priority DESC);
