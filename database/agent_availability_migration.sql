-- ============================================================================
-- Agent Availability & Offline Monitoring Migration
-- Run after field_agent_migration.sql
-- ============================================================================

-- ── agent_availability ────────────────────────────────────────────────────────
-- One row per agent. Upserted on every heartbeat.
-- Tracks live device reachability independent of tracking sessions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_availability (
  agent_id           UUID          PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  status             TEXT          NOT NULL DEFAULT 'ONLINE'
                       CHECK (status IN ('ONLINE', 'OFFLINE', 'GPS_DISABLED')),
  offline_reason     TEXT
                       CHECK (offline_reason IN (
                         'PHONE_OFF', 'NO_NETWORK', 'GPS_DISABLED',
                         'APP_TERMINATED', 'TIMEOUT'
                       )),
  last_heartbeat_at  TIMESTAMPTZ,
  last_known_lat     DECIMAL(10,7),
  last_known_lng     DECIMAL(10,7),
  last_known_at      TIMESTAMPTZ,
  offline_since      TIMESTAMPTZ,
  last_alert_id      UUID          REFERENCES public.alerts(id) ON DELETE SET NULL,
  -- Denormalized for fast queries without joins
  institution        TEXT,
  agent_name         TEXT,
  agent_badge        TEXT,
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_availability_status
  ON public.agent_availability(status);

CREATE INDEX IF NOT EXISTS idx_agent_availability_institution
  ON public.agent_availability(institution, status);

CREATE INDEX IF NOT EXISTS idx_agent_availability_heartbeat
  ON public.agent_availability(last_heartbeat_at DESC NULLS LAST);

-- ── agent_offline_events ──────────────────────────────────────────────────────
-- Immutable audit log of every offline/restore transition.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_offline_events (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type      TEXT          NOT NULL CHECK (event_type IN ('OFFLINE', 'RESTORED')),
  offline_reason  TEXT          CHECK (offline_reason IN (
                    'PHONE_OFF', 'NO_NETWORK', 'GPS_DISABLED',
                    'APP_TERMINATED', 'TIMEOUT'
                  )),
  last_known_lat  DECIMAL(10,7),
  last_known_lng  DECIMAL(10,7),
  occurred_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  alert_id        UUID          REFERENCES public.alerts(id) ON DELETE SET NULL,
  institution     TEXT,
  agent_name      TEXT,
  agent_badge     TEXT
);

CREATE INDEX IF NOT EXISTS idx_offline_events_agent
  ON public.agent_offline_events(agent_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_offline_events_institution
  ON public.agent_offline_events(institution, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_offline_events_type
  ON public.agent_offline_events(event_type, occurred_at DESC);
