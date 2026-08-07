-- ============================================================================
-- Corrections custody columns
--
-- `database/schema.sql` defines corrections_records with escape timestamps, a
-- facility code, the officer who verified the intake and the trial judge.
-- `database/supabase_migration.sql` — the file that was actually deployed —
-- omits all five, so the deployed table has never had them.
--
-- The escape columns are the ones that matter: the Custody Overview page
-- advertises an escape protocol, and the API now writes escape_reported_at /
-- escape_recaptured_at on a custody-status change and reads them back into the
-- custody events feed. Without this migration those writes are silently
-- dropped (the API filters unknown columns rather than failing) and an escape
-- shows up only as a status change.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE public.corrections_records
  ADD COLUMN IF NOT EXISTS facility_code        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS intake_verified_by   UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS judge_name           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS escape_reported_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escape_recaptured_at TIMESTAMPTZ;

-- The custody events feed and the "upcoming reviews" panels both scan by
-- review date restricted to inmates still inside, and the roster sorts by
-- intake. Neither had an index.
CREATE INDEX IF NOT EXISTS idx_corrections_next_review
  ON public.corrections_records(next_review)
  WHERE custody_status IN ('PRE_TRIAL', 'SENTENCED');

CREATE INDEX IF NOT EXISTS idx_corrections_intake_date
  ON public.corrections_records(intake_date DESC);

CREATE INDEX IF NOT EXISTS idx_corrections_facility
  ON public.corrections_records(facility_name);

-- The custody events feed reads audit_log filtered by target_type and ordered
-- by timestamp; without this it is a sequential scan over the whole trail.
CREATE INDEX IF NOT EXISTS idx_audit_target_type_ts
  ON public.audit_log(target_type, event_timestamp DESC);
