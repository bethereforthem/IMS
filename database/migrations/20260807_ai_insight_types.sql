-- ============================================================================
-- AI insight types: allow the analysis types the analyzer actually writes
--
-- `ai_insight_cache.insight_type` was constrained to five operational types:
--   TREND_SUMMARY, ANOMALY_ALERT, SEASONAL_PATTERN, PATROL_STRATEGY, RISK_OVERVIEW
--
-- but /api/v1/ai-intelligence/analyze also writes the five WHO/WHEN/WHERE/HOW/
-- CRIME_PREDICTIONS rows that the AI Intelligence panel's "Crime Analysis" tab
-- is built from. Those rows violated the CHECK, and because every insight was
-- written in a single batch insert, one rejected row discarded the whole batch.
--
-- The result: `ai_insight_cache` stayed empty for every institution, so the
-- Insights and Crime Analysis tabs were permanently blank even after a run
-- completed successfully — and the insert error was discarded, so no run was
-- ever marked failed for it.
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

ALTER TABLE public.ai_insight_cache
  DROP CONSTRAINT IF EXISTS ai_insight_cache_insight_type_check;

ALTER TABLE public.ai_insight_cache
  ADD CONSTRAINT ai_insight_cache_insight_type_check
  CHECK (insight_type IN (
    -- Operational insights
    'TREND_SUMMARY', 'ANOMALY_ALERT', 'SEASONAL_PATTERN',
    'PATROL_STRATEGY', 'RISK_OVERVIEW',
    -- Crime analysis breakdown rendered by the Crime Analysis tab
    'WHO_ANALYSIS', 'WHEN_ANALYSIS', 'WHERE_ANALYSIS', 'HOW_ANALYSIS',
    'CRIME_PREDICTIONS'
  ));

-- The predictions endpoint reads insights by run and drops expired ones; the
-- existing index is on (institution, expires_at, priority), which does not
-- serve that lookup.
CREATE INDEX IF NOT EXISTS idx_ai_insights_run_expiry
  ON public.ai_insight_cache(run_id, expires_at DESC);

-- The suspect 360° view joins case_suspects by suspect_id. The primary key is
-- (case_id, suspect_id), so lookups from the suspect side had no index.
CREATE INDEX IF NOT EXISTS idx_case_suspects_suspect
  ON public.case_suspects(suspect_id);

-- Case search filters on title/summary with ILIKE. Trigram indexes turn those
-- from a sequential scan into an index scan as the table grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_cases_title_trgm
  ON public.cases USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_suspects_full_name_trgm
  ON public.suspects USING gin (full_name gin_trgm_ops);
