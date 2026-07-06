-- ============================================================================
-- Audit Log Enhancement Migration
-- Adds actor_name, actor_badge, GPS, and device columns to audit_log.
-- Run after schema.sql
-- ============================================================================

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_name   TEXT,
  ADD COLUMN IF NOT EXISTS actor_badge  TEXT,
  ADD COLUMN IF NOT EXISTS gps_lat      DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS gps_lng      DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS device_info  TEXT;

-- Full-text search index on actor name for admin search
CREATE INDEX IF NOT EXISTS idx_audit_actor_name
  ON public.audit_log USING GIN (to_tsvector('simple', COALESCE(actor_name, '')));

-- Date range + event_type index for admin filtering
CREATE INDEX IF NOT EXISTS idx_audit_event_type
  ON public.audit_log(event_type, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_institution_event
  ON public.audit_log(actor_institution, event_timestamp DESC);
