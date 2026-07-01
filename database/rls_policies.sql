-- ============================================================
-- IMS v3.0 — Row Level Security Policies
-- Enforces RBAC at the database layer
-- ============================================================

-- Enable RLS on all sensitive tables
ALTER TABLE suspects ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nid_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE warrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper: current user's institution from session variable
CREATE OR REPLACE FUNCTION current_user_institution()
RETURNS institution_type AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_institution', TRUE), '')::institution_type;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_role', TRUE), '')::user_role;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_user_clearance()
RETURNS clearance_level AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_clearance', TRUE), '')::clearance_level;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: clearance level ordering for comparison
CREATE OR REPLACE FUNCTION clearance_rank(lvl clearance_level)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE lvl
    WHEN 'UNCLASSIFIED' THEN 0
    WHEN 'CONFIDENTIAL' THEN 1
    WHEN 'SECRET' THEN 2
    WHEN 'TOP_SECRET' THEN 3
    ELSE -1
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- SUSPECTS — access by clearance + institution
-- ============================================================

CREATE POLICY suspects_select ON suspects FOR SELECT
  USING (
    -- NISS sees everything
    current_user_institution() = 'NISS'
    -- Other institutions see suspects up to their clearance level
    OR (
      current_user_institution() IN ('RNP', 'RIB', 'RDF', 'RCS')
      AND clearance_rank(clearance_level) <= clearance_rank(current_user_clearance())
    )
    -- RDF: only security-related records (owning_institution filter at app layer)
    -- RCS: only in-custody suspects
  );

CREATE POLICY suspects_insert ON suspects FOR INSERT
  WITH CHECK (
    current_user_institution() IN ('NISS', 'RNP', 'RIB', 'RDF')
  );

CREATE POLICY suspects_update ON suspects FOR UPDATE
  USING (
    current_user_institution() = 'NISS'
    OR owning_institution = current_user_institution()
  )
  WITH CHECK (
    current_user_institution() = 'NISS'
    OR owning_institution = current_user_institution()
  );

-- ============================================================
-- LOCATION RECORDS — TOP SECRET, strictly controlled
-- ============================================================

CREATE POLICY location_select ON location_records FOR SELECT
  USING (
    -- NISS: full access
    current_user_institution() = 'NISS'
    -- RNP commanders/detectives: only WANTED suspects
    OR (
      current_user_institution() = 'RNP'
      AND current_user_role() IN ('RNP_COMMANDER', 'RNP_DETECTIVE')
      AND suspect_id IN (
        SELECT id FROM suspects WHERE status IN ('WANTED', 'ACTIVE')
      )
    )
    -- RIB: suspects linked to their cases
    OR (
      current_user_institution() = 'RIB'
      AND current_user_role() IN ('RIB_INVESTIGATOR', 'RIB_ANALYST')
      AND suspect_id IN (
        SELECT cs.suspect_id FROM case_suspects cs
        JOIN case_officers co ON co.case_id = cs.case_id
        WHERE co.officer_id = current_user_id()
      )
    )
    -- RDF: border/security suspects only
    OR (
      current_user_institution() = 'RDF'
      AND current_user_role() = 'RDF_COMMANDER'
      AND suspect_id IN (
        SELECT id FROM suspects
        WHERE owning_institution = 'RDF'
           OR clearance_level = 'TOP_SECRET'
      )
    )
  );

-- Location records are INSERT-only (triggers create them automatically)
CREATE POLICY location_insert ON location_records FOR INSERT
  WITH CHECK (FALSE);  -- only triggers insert; direct INSERT denied

-- ============================================================
-- INTELLIGENCE EVENTS
-- ============================================================

CREATE POLICY intel_events_select ON intelligence_events FOR SELECT
  USING (
    current_user_institution() = 'NISS'
    OR (
      current_user_institution() IN ('RNP', 'RIB', 'RDF')
      AND clearance_rank(classification) <= clearance_rank(current_user_clearance())
    )
    OR (
      current_user_institution() = 'RCS'
      AND source_tag = 'NID_SCAN'  -- RCS sees intake scans only
    )
    -- Officers can always see their own events
    OR officer_id = current_user_id()
  );

-- ============================================================
-- CASES
-- ============================================================

CREATE POLICY cases_select ON cases FOR SELECT
  USING (
    current_user_institution() = 'NISS'
    OR owning_institution = current_user_institution()
    OR id IN (
      SELECT case_id FROM case_officers
      WHERE officer_id = current_user_id()
    )
    -- RCS can see corrections-linked cases
    OR (
      current_user_institution() = 'RCS'
      AND id IN (SELECT case_id FROM corrections_records WHERE case_id IS NOT NULL)
    )
  );

-- ============================================================
-- CORRECTIONS RECORDS
-- ============================================================

CREATE POLICY corrections_select ON corrections_records FOR SELECT
  USING (
    current_user_institution() IN ('NISS', 'RCS', 'RNP', 'RIB')
  );

CREATE POLICY corrections_insert ON corrections_records FOR INSERT
  WITH CHECK (current_user_institution() IN ('RCS', 'NISS'));

CREATE POLICY corrections_update ON corrections_records FOR UPDATE
  USING (current_user_institution() IN ('RCS', 'NISS'));

-- ============================================================
-- NID VERIFICATIONS
-- ============================================================

CREATE POLICY nid_verif_select ON nid_verifications FOR SELECT
  USING (
    current_user_institution() = 'NISS'
    OR officer_id = current_user_id()
    OR (
      current_user_institution() IN ('RNP', 'RIB', 'RDF', 'RCS')
      AND current_user_role() IN (
        'RNP_COMMANDER', 'RNP_DETECTIVE', 'RIB_INVESTIGATOR',
        'RDF_COMMANDER', 'RCS_SUPERINTENDENT', 'SIEM_ANALYST'
      )
    )
  );

-- ============================================================
-- ALERTS
-- ============================================================

CREATE POLICY alerts_select ON alerts FOR SELECT
  USING (
    current_user_institution() = 'NISS'
    OR current_user_institution() = ANY(target_institutions)
    OR (
      clearance_rank(classification) <= clearance_rank(current_user_clearance())
    )
  );

-- ============================================================
-- AUDIT LOG — read-only for authorized roles; no write via RLS
-- ============================================================

CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (
    current_user_institution() = 'NISS'
    OR current_user_role() IN ('SIEM_ANALYST', 'SYSTEM_ADMIN', 'RNP_COMMANDER')
    OR actor_id = current_user_id()  -- users can always see their own audit trail
  );

CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (TRUE);  -- inserts only via triggers and system; app-level restricts further

-- ============================================================
-- WARRANTS
-- ============================================================

CREATE POLICY warrants_select ON warrants FOR SELECT
  USING (
    current_user_institution() IN ('NISS', 'RNP', 'RIB', 'RDF', 'RCS')
  );

-- ============================================================
-- PARTNER QUERIES — NISS only
-- ============================================================

CREATE POLICY partner_queries_all ON partner_queries
  USING (current_user_institution() = 'NISS')
  WITH CHECK (current_user_institution() = 'NISS');
