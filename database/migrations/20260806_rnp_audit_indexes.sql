-- ============================================================================
-- 20260806_rnp_audit_indexes.sql
--
-- Indexes supporting the RNP dashboard read paths.
--
-- Two things changed in the application that these back:
--
--  1. `suspects`, `cases` and `intelligence_events` list endpoints now filter on
--     the caller's clearance (`.in('clearance_level', …)`). That filter runs on
--     every list request and had no index behind it.
--
--  2. The list endpoints order by their timestamp column and take a page from
--     the top. Without an index that is a full sort of the table on every call.
--
-- `cases` had no indexes at all beyond its primary key, despite being filtered
-- by status, lead institution and clearance on every Cases page load.
--
-- All statements are IF NOT EXISTS, so this is safe to re-run.
-- ============================================================================

-- ── suspects ────────────────────────────────────────────────────────────────
-- Clearance filter, then the created_at ordering the list endpoint applies.
CREATE INDEX IF NOT EXISTS idx_suspects_clearance_created
  ON public.suspects(clearance_level, created_at DESC);

-- Wanted Suspects filters by status and sorts by threat; status already has its
-- own index, this covers the combination the page actually asks for.
CREATE INDEX IF NOT EXISTS idx_suspects_status_threat
  ON public.suspects(status, threat_level DESC);

-- ── cases ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cases_clearance_created
  ON public.cases(clearance_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_status
  ON public.cases(status);

CREATE INDEX IF NOT EXISTS idx_cases_lead_institution
  ON public.cases(lead_institution);

-- Case reference is the human-facing identifier operators search on.
CREATE INDEX IF NOT EXISTS idx_cases_reference
  ON public.cases(case_reference);

-- ── intelligence_events ─────────────────────────────────────────────────────
-- Classification filter plus the event_timestamp DESC ordering every list uses.
CREATE INDEX IF NOT EXISTS idx_events_classification_timestamp
  ON public.intelligence_events(classification, event_timestamp DESC);

-- The Patrol Map scopes location records through this column.
CREATE INDEX IF NOT EXISTS idx_events_institution
  ON public.intelligence_events(institution);

-- ── warrants ────────────────────────────────────────────────────────────────
-- The registry lists by issue date; `active` alone is already indexed.
CREATE INDEX IF NOT EXISTS idx_warrants_issued_at
  ON public.warrants(issued_at DESC);

-- ── location_records ────────────────────────────────────────────────────────
-- /location/recent orders by detection_timestamp and now resolves institution
-- scope through intelligence_event_id.
CREATE INDEX IF NOT EXISTS idx_location_detection_timestamp
  ON public.location_records(detection_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_location_event
  ON public.location_records(intelligence_event_id);

-- ── camera_nodes ────────────────────────────────────────────────────────────
-- Camera lists are scoped by institution; liveness is judged on last_heartbeat.
CREATE INDEX IF NOT EXISTS idx_camera_institution_heartbeat
  ON public.camera_nodes(institution, last_heartbeat DESC);
