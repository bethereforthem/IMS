-- ============================================================
-- IMS v3.0 — Complete PostgreSQL Schema
-- Classification: RESTRICTED — Law Enforcement Use Only
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";          -- pgvector for face embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- trigram search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE institution_type AS ENUM (
  'RNP', 'RIB', 'RDF', 'NISS', 'RCS', 'VILLAGE_LEADER', 'INTERNATIONAL'
);

CREATE TYPE user_role AS ENUM (
  'NISS_DIRECTOR', 'NISS_OFFICER',
  'RNP_COMMANDER', 'RNP_DETECTIVE', 'RNP_PATROL',
  'RIB_INVESTIGATOR', 'RIB_ANALYST',
  'RDF_COMMANDER', 'RDF_BORDER_OFFICER',
  'RCS_SUPERINTENDENT', 'RCS_OFFICER',
  'VILLAGE_LEADER',
  'SYSTEM_ADMIN', 'SIEM_ANALYST'
);

CREATE TYPE clearance_level AS ENUM (
  'UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'
);

CREATE TYPE source_tag AS ENUM (
  'CCTV_NODE', 'FACE_SCAN', 'NID_SCAN', 'NID_MANUAL',
  'INTERPOL_FEED', 'PARTNER_QUERY', 'OFFICER_REPORT', 'SYSTEM_ALERT'
);

CREATE TYPE nid_method AS ENUM ('NID_SCAN', 'NID_MANUAL');

CREATE TYPE suspect_status AS ENUM (
  'ACTIVE', 'WANTED', 'ARRESTED', 'IN_CUSTODY', 'CONVICTED',
  'RELEASED', 'DECEASED', 'CLEARED', 'INTERPOL_FLAGGED'
);

CREATE TYPE crime_category AS ENUM (
  'HOMICIDE', 'ROBBERY', 'FRAUD', 'CYBERCRIME', 'TERRORISM',
  'ORGANIZED_CRIME', 'TRAFFICKING', 'CORRUPTION', 'SEXUAL_OFFENSE',
  'DRUG_OFFENSE', 'BORDER_VIOLATION', 'OTHER'
);

CREATE TYPE case_status AS ENUM (
  'OPEN', 'UNDER_INVESTIGATION', 'PROSECUTION', 'CLOSED', 'COLD'
);

CREATE TYPE warrant_type AS ENUM ('ARREST', 'SEARCH', 'EXTRADITION');

CREATE TYPE alert_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE interpol_notice_color AS ENUM (
  'RED', 'ORANGE', 'BLUE', 'GREEN', 'YELLOW', 'BLACK', 'PURPLE', 'INTERPOL_DIFFUSION'
);

CREATE TYPE custody_status AS ENUM (
  'PRE_TRIAL', 'SENTENCED', 'TRANSFERRED', 'RELEASED', 'ESCAPED', 'DECEASED'
);

CREATE TYPE revocation_scope AS ENUM (
  'USER', 'GROUP', 'INSTITUTION', 'SERVICE', 'CAMERA_NODE', 'INTERNATIONAL_PARTNER'
);

-- ============================================================
-- INSTITUTIONS & USERS
-- ============================================================

CREATE TABLE institutions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          institution_type NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  contact_email VARCHAR(255),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  role                  user_role NOT NULL,
  clearance_level       clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  badge_number          VARCHAR(50) UNIQUE NOT NULL,
  full_name             VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  phone                 VARCHAR(20),
  password_hash         TEXT NOT NULL,
  totp_secret           TEXT,                   -- encrypted TOTP seed
  fingerprint_template  TEXT,                   -- encrypted ISO 19794-2 minutiae hash
  fido2_credential_id   TEXT,                   -- for admin hardware keys
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  locked                BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_failures          INTEGER NOT NULL DEFAULT 0,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  last_login_country    CHAR(2),
  password_changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  device_id     VARCHAR(255),
  ip_address    INET,
  country       CHAR(2),
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);

-- ============================================================
-- SUSPECTS & CRIMINAL RECORDS
-- ============================================================

CREATE TABLE suspects (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ims_reference       VARCHAR(30) UNIQUE NOT NULL,  -- e.g. RWA-IMS-2026-00001
  status              suspect_status NOT NULL DEFAULT 'ACTIVE',
  clearance_level     clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  -- Identity
  first_name          VARCHAR(100),
  last_name           VARCHAR(100),
  aliases             TEXT[],
  date_of_birth       DATE,
  gender              CHAR(1),
  nationality         CHAR(3),                       -- ISO 3166-1 alpha-3
  national_id_hash    VARCHAR(64),                   -- SHA-256 of national ID
  passport_number     VARCHAR(30),
  -- Physical
  height_cm           INTEGER,
  weight_kg           INTEGER,
  eye_color           VARCHAR(20),
  distinguishing_marks TEXT,
  -- Biometric
  face_embedding      vector(512),                   -- ArcFace 512-d embedding
  mugshot_sha256      VARCHAR(64),                   -- integrity hash of mugshot
  -- Metadata
  created_by          UUID REFERENCES users(id),
  owning_institution  institution_type NOT NULL,
  interpol_file_no    VARCHAR(50),
  interpol_notice     interpol_notice_color,
  threat_level        INTEGER CHECK (threat_level BETWEEN 1 AND 5),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suspects_status ON suspects(status);
CREATE INDEX idx_suspects_national_id_hash ON suspects(national_id_hash);
CREATE INDEX idx_suspects_name ON suspects USING GIN (
  to_tsvector('english', COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))
);
CREATE INDEX idx_suspects_face_embedding ON suspects
  USING ivfflat (face_embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE warrants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suspect_id      UUID NOT NULL REFERENCES suspects(id),
  warrant_type    warrant_type NOT NULL DEFAULT 'ARREST',
  issued_by       institution_type NOT NULL,
  issued_by_court VARCHAR(255),
  case_reference  VARCHAR(50),
  charges         TEXT NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  executed_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warrants_suspect_id ON warrants(suspect_id);
CREATE INDEX idx_warrants_active ON warrants(active) WHERE active = TRUE;

-- ============================================================
-- CASES
-- ============================================================

CREATE TABLE cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_reference  VARCHAR(30) UNIQUE NOT NULL,       -- RWA-RNP-2026-00001
  title           VARCHAR(255) NOT NULL,
  category        crime_category NOT NULL,
  status          case_status NOT NULL DEFAULT 'OPEN',
  clearance_level clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  owning_institution institution_type NOT NULL,
  lead_officer_id UUID REFERENCES users(id),
  summary         TEXT,
  incident_date   TIMESTAMPTZ,
  location_lat    DECIMAL(10, 7),
  location_lng    DECIMAL(10, 7),
  location_name   VARCHAR(255),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE case_suspects (
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  suspect_id  UUID NOT NULL REFERENCES suspects(id) ON DELETE CASCADE,
  role        VARCHAR(100),                           -- PRIMARY_SUSPECT, ACCOMPLICE, etc.
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by    UUID REFERENCES users(id),
  PRIMARY KEY (case_id, suspect_id)
);

CREATE TABLE case_officers (
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(100) DEFAULT 'INVESTIGATOR',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, officer_id)
);

-- ============================================================
-- INTELLIGENCE EVENTS (central v3.0 table)
-- ============================================================

CREATE TABLE intelligence_events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_tag            source_tag NOT NULL,
  source_device_id      VARCHAR(255),             -- Pi camera ID or device fingerprint
  officer_id            UUID REFERENCES users(id),
  institution           institution_type,
  suspect_id            UUID REFERENCES suspects(id),
  -- Location (stored ONLY when criminal_record_found = TRUE)
  location_lat          DECIMAL(10, 7),
  location_lng          DECIMAL(10, 7),
  location_accuracy_m   INTEGER,
  -- Classification
  classification        clearance_level NOT NULL DEFAULT 'UNCLASSIFIED',
  criminal_record_found BOOLEAN NOT NULL DEFAULT FALSE,
  confidence            DECIMAL(4, 3),            -- AI confidence 0.000-1.000
  -- Source chain
  linked_event_ids      UUID[],
  -- Face data (hashes only, never raw)
  face_frame_hash       VARCHAR(64),              -- SHA-256 of captured frame
  -- Metadata
  notes                 TEXT,
  event_timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intel_events_suspect ON intelligence_events(suspect_id);
CREATE INDEX idx_intel_events_source ON intelligence_events(source_tag);
CREATE INDEX idx_intel_events_officer ON intelligence_events(officer_id);
CREATE INDEX idx_intel_events_timestamp ON intelligence_events(event_timestamp DESC);
CREATE INDEX idx_intel_events_criminal ON intelligence_events(criminal_record_found)
  WHERE criminal_record_found = TRUE;

-- ============================================================
-- NID VERIFICATIONS (DIV App)
-- ============================================================

CREATE TABLE nid_verifications (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  method                nid_method NOT NULL,
  officer_id            UUID NOT NULL REFERENCES users(id),
  national_id_hash      VARCHAR(64) NOT NULL,     -- SHA-256 only, never plain text
  nida_match            BOOLEAN,
  ims_criminal_record   BOOLEAN NOT NULL DEFAULT FALSE,
  suspect_id_linked     UUID REFERENCES suspects(id),
  -- Location stored ONLY if criminal record found
  location_lat          DECIMAL(10, 7),
  location_lng          DECIMAL(10, 7),
  classification        clearance_level NOT NULL DEFAULT 'UNCLASSIFIED',
  citizen_data_retained BOOLEAN NOT NULL DEFAULT FALSE,
  intelligence_event_id UUID REFERENCES intelligence_events(id),
  verified_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nid_verif_officer ON nid_verifications(officer_id);
CREATE INDEX idx_nid_verif_timestamp ON nid_verifications(verified_at DESC);
CREATE INDEX idx_nid_verif_criminal ON nid_verifications(ims_criminal_record)
  WHERE ims_criminal_record = TRUE;

-- ============================================================
-- LOCATION INTELLIGENCE (TOP SECRET)
-- ============================================================

CREATE TABLE location_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intelligence_event_id UUID NOT NULL REFERENCES intelligence_events(id),
  suspect_id          UUID NOT NULL REFERENCES suspects(id),
  location_lat        DECIMAL(10, 7) NOT NULL,
  location_lng        DECIMAL(10, 7) NOT NULL,
  location_alt_m      DECIMAL(8, 2),
  accuracy_m          INTEGER,
  source_tag          source_tag NOT NULL,
  detecting_officer_id UUID REFERENCES users(id),
  detecting_node_id   VARCHAR(255),               -- camera node ID for CCTV_NODE
  classification      clearance_level NOT NULL DEFAULT 'TOP_SECRET',
  authorized_institutions institution_type[],
  detection_timestamp TIMESTAMPTZ NOT NULL,
  retention_expires_at TIMESTAMPTZ NOT NULL,       -- auto-purge date
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_location_suspect ON location_records(suspect_id);
CREATE INDEX idx_location_timestamp ON location_records(detection_timestamp DESC);

-- ============================================================
-- CORRECTIONS (RCS Integration)
-- ============================================================

CREATE TABLE corrections_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suspect_id          UUID NOT NULL REFERENCES suspects(id),
  case_id             UUID REFERENCES cases(id),
  facility_name       VARCHAR(255) NOT NULL,
  facility_code       VARCHAR(50),
  custody_status      custody_status NOT NULL DEFAULT 'PRE_TRIAL',
  intake_date         TIMESTAMPTZ NOT NULL,
  intake_verified_by  UUID REFERENCES users(id),
  sentence_start      DATE,
  sentence_end        DATE,
  offense_description TEXT,
  court_name          VARCHAR(255),
  judge_name          VARCHAR(100),
  release_date        DATE,
  actual_release_at   TIMESTAMPTZ,
  escape_reported_at  TIMESTAMPTZ,
  escape_recaptured_at TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corrections_suspect ON corrections_records(suspect_id);
CREATE INDEX idx_corrections_status ON corrections_records(custody_status);
CREATE INDEX idx_corrections_release ON corrections_records(sentence_end)
  WHERE custody_status = 'SENTENCED';

-- ============================================================
-- CCTV / EDGE NODES
-- ============================================================

CREATE TABLE camera_nodes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id         VARCHAR(50) UNIQUE NOT NULL,      -- e.g. GTN-BORDER-04
  name            VARCHAR(255) NOT NULL,
  location_name   VARCHAR(255),
  location_lat    DECIMAL(10, 7) NOT NULL,
  location_lng    DECIMAL(10, 7) NOT NULL,
  institution     institution_type NOT NULL,
  tls_cert_hash   VARCHAR(64),
  last_heartbeat  TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at      TIMESTAMPTZ,
  firmware_version VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_camera_nodes_last_heartbeat ON camera_nodes(last_heartbeat);
CREATE INDEX idx_camera_nodes_active ON camera_nodes(active) WHERE active = TRUE;

-- ============================================================
-- INTERPOL RECORDS
-- ============================================================

CREATE TABLE interpol_notices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_number     VARCHAR(50) UNIQUE NOT NULL,
  notice_color    interpol_notice_color NOT NULL,
  subject_name    VARCHAR(255),
  subject_dob     DATE,
  subject_nationality CHAR(3),
  charges         TEXT,
  issuing_country CHAR(3),
  issued_at       DATE,
  expires_at      DATE,
  face_embedding  vector(512),
  suspect_id      UUID REFERENCES suspects(id),     -- linked when matched locally
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpol_face ON interpol_notices
  USING ivfflat (face_embedding vector_cosine_ops) WITH (lists = 50);

-- ============================================================
-- INTERNATIONAL PARTNER QUERIES
-- ============================================================

CREATE TABLE international_partners (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code    CHAR(3) NOT NULL UNIQUE,
  country_name    VARCHAR(100) NOT NULL,
  api_key_hash    VARCHAR(64),                      -- SHA-256 of API key
  tls_cert_hash   VARCHAR(64),
  mou_includes_identity BOOLEAN NOT NULL DEFAULT FALSE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE partner_queries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id      UUID NOT NULL REFERENCES international_partners(id),
  query_image_hash VARCHAR(64),                     -- SHA-256 of submitted image
  match_returned  BOOLEAN,
  niss_reviewer_id UUID REFERENCES users(id),
  response_released_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ALERTS
-- ============================================================

CREATE TABLE alerts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intelligence_event_id UUID NOT NULL REFERENCES intelligence_events(id),
  suspect_id          UUID REFERENCES suspects(id),
  priority            alert_priority NOT NULL DEFAULT 'HIGH',
  classification      clearance_level NOT NULL DEFAULT 'TOP_SECRET',
  source_tag          source_tag NOT NULL,
  title               TEXT NOT NULL,
  message             TEXT NOT NULL,
  target_institutions institution_type[],
  acknowledged        BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by     UUID REFERENCES users(id),
  acknowledged_at     TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_unacked ON alerts(acknowledged, created_at DESC)
  WHERE acknowledged = FALSE;
CREATE INDEX idx_alerts_suspect ON alerts(suspect_id);

-- ============================================================
-- AUDIT LOG (append-only, immutable)
-- ============================================================

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  actor_id        UUID,                             -- null for system events
  actor_role      user_role,
  actor_institution institution_type,
  target_type     VARCHAR(100),                     -- 'suspect', 'case', 'location_record', etc.
  target_id       UUID,
  action          VARCHAR(100) NOT NULL,            -- 'READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'
  before_state    JSONB,
  after_state     JSONB,
  ip_address      INET,
  device_id       VARCHAR(255),
  justification   TEXT,                             -- mandatory for sensitive record access
  classification  clearance_level,
  session_id      UUID,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor_id, event_timestamp DESC);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_timestamp ON audit_log(event_timestamp DESC);

-- ============================================================
-- SIEM EVENTS & REVOCATIONS
-- ============================================================

CREATE TABLE siem_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id         VARCHAR(100) NOT NULL,
  severity        VARCHAR(20) NOT NULL,             -- LOW/MEDIUM/HIGH/CRITICAL
  actor_id        UUID REFERENCES users(id),
  actor_institution institution_type,
  description     TEXT NOT NULL,
  raw_data        JSONB,
  auto_actioned   BOOLEAN NOT NULL DEFAULT FALSE,
  action_taken    TEXT,
  reviewed        BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE access_revocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope           revocation_scope NOT NULL,
  target_user_id  UUID REFERENCES users(id),
  target_role     user_role,
  target_institution institution_type,
  target_service  VARCHAR(100),
  target_node_id  VARCHAR(50),
  target_partner_id UUID REFERENCES international_partners(id),
  revoked_by      UUID NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  siem_event_id   UUID REFERENCES siem_events(id),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  reinstated_by   UUID REFERENCES users(id),
  reinstated_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WATCHLISTS
-- ============================================================

CREATE TABLE watchlists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  owning_institution institution_type NOT NULL,
  clearance_level clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE watchlist_entries (
  watchlist_id    UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  suspect_id      UUID NOT NULL REFERENCES suspects(id) ON DELETE CASCADE,
  added_by        UUID REFERENCES users(id),
  priority        alert_priority NOT NULL DEFAULT 'MEDIUM',
  notes           TEXT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (watchlist_id, suspect_id)
);

-- ============================================================
-- IMMUTABILITY TRIGGERS (audit log cannot be modified)
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable — modification is prohibited';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Location records cannot be modified (only purged by scheduled job)
CREATE OR REPLACE FUNCTION prevent_location_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Location records are immutable — modification is prohibited';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER location_records_immutable
  BEFORE UPDATE ON location_records
  FOR EACH ROW EXECUTE FUNCTION prevent_location_modification();

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_suspects_updated_at
  BEFORE UPDATE ON suspects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_corrections_updated_at
  BEFORE UPDATE ON corrections_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- IMS REFERENCE SEQUENCE
-- ============================================================

CREATE SEQUENCE ims_reference_seq START 1;

CREATE OR REPLACE FUNCTION generate_ims_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ims_reference = 'RWA-IMS-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                      LPAD(NEXTVAL('ims_reference_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suspects_generate_reference
  BEFORE INSERT ON suspects
  FOR EACH ROW
  WHEN (NEW.ims_reference IS NULL OR NEW.ims_reference = '')
  EXECUTE FUNCTION generate_ims_reference();

-- ============================================================
-- AUTOMATIC LOCATION RECORD FROM INTELLIGENCE EVENT
-- ============================================================

CREATE OR REPLACE FUNCTION create_location_record_on_match()
RETURNS TRIGGER AS $$
DECLARE
  retention_years INTEGER;
BEGIN
  IF NEW.criminal_record_found = TRUE
     AND NEW.location_lat IS NOT NULL
     AND NEW.location_lng IS NOT NULL
  THEN
    -- Serious crimes get 10-year retention; default 5 years
    retention_years := 10;

    INSERT INTO location_records (
      intelligence_event_id, suspect_id,
      location_lat, location_lng, accuracy_m,
      source_tag, detecting_officer_id, detecting_node_id,
      classification, detection_timestamp,
      retention_expires_at
    ) VALUES (
      NEW.id, NEW.suspect_id,
      NEW.location_lat, NEW.location_lng, NEW.location_accuracy_m,
      NEW.source_tag, NEW.officer_id, NEW.source_device_id,
      'TOP_SECRET', NEW.event_timestamp,
      NEW.event_timestamp + (retention_years || ' years')::INTERVAL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_create_location_record
  AFTER INSERT ON intelligence_events
  FOR EACH ROW EXECUTE FUNCTION create_location_record_on_match();

-- ============================================================
-- AUDIT TRIGGER HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION log_audit_event(
  p_event_type TEXT, p_actor_id UUID, p_target_type TEXT,
  p_target_id UUID, p_action TEXT, p_classification clearance_level DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_log (event_type, actor_id, target_type, target_id, action, classification)
  VALUES (p_event_type, p_actor_id, p_target_type, p_target_id, p_action, p_classification);
END;
$$ LANGUAGE plpgsql;
