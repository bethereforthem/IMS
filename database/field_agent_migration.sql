-- ============================================================================
-- Field Agent Intelligence Mobile — DB Migration
-- Run in Supabase SQL Editor after supabase_migration.sql
-- ============================================================================

-- ── field_reports ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_reports (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id              UUID          NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  title                 TEXT          NOT NULL,
  category              TEXT          NOT NULL,
  description           TEXT          NOT NULL,
  priority              TEXT          NOT NULL DEFAULT 'MEDIUM'
                          CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  incident_date         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  notes                 TEXT,
  location_lat          DECIMAL(10,7),
  location_lng          DECIMAL(10,7),
  location_description  TEXT,
  assigned_to           TEXT[]        DEFAULT '{}',  -- e.g. ['NISS','RNP','RDF']
  status                TEXT          NOT NULL DEFAULT 'OPEN'
                          CHECK (status IN ('OPEN','ASSIGNED','INVESTIGATING','CLOSED','PAUSED')),
  alert_id              UUID          REFERENCES public.alerts(id),
  intelligence_event_id UUID          REFERENCES public.intelligence_events(id),
  tracking_session_id   UUID,         -- set after session created
  media_urls            TEXT[]        DEFAULT '{}',
  offline_id            TEXT,         -- client-generated UUID for dedup on sync
  synced_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_field_report_offline_id
  ON public.field_reports(offline_id) WHERE offline_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_reports_agent
  ON public.field_reports(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_reports_status
  ON public.field_reports(status);

CREATE INDEX IF NOT EXISTS idx_field_reports_priority
  ON public.field_reports(priority);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_field_reports_updated_at
    BEFORE UPDATE ON public.field_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── agent_tracking_sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_tracking_sessions (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  field_report_id  UUID        REFERENCES public.field_reports(id),
  status           TEXT        NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','PAUSED','CLOSED')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at        TIMESTAMPTZ,
  resumed_at       TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  closed_by        UUID        REFERENCES public.users(id),
  total_pings      INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_agent
  ON public.agent_tracking_sessions(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_report
  ON public.agent_tracking_sessions(field_report_id);

-- ── agent_location_pings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_location_pings (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID          NOT NULL REFERENCES public.agent_tracking_sessions(id) ON DELETE CASCADE,
  agent_id    UUID          NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  accuracy_m  INTEGER,
  heading     DECIMAL(5,2),
  speed_ms    DECIMAL(8,3),
  pinged_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pings_session
  ON public.agent_location_pings(session_id, pinged_at DESC);

CREATE INDEX IF NOT EXISTS idx_pings_agent
  ON public.agent_location_pings(agent_id, pinged_at DESC);

-- Back-reference: allow field_reports to point to its tracking session
ALTER TABLE public.field_reports
  ADD CONSTRAINT fk_field_report_session
  FOREIGN KEY (tracking_session_id)
  REFERENCES public.agent_tracking_sessions(id)
  ON DELETE SET NULL
  NOT VALID;
