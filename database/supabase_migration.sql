-- ============================================================================
-- IMS v3.0 — Supabase Migration Script
-- Rwanda Intelligence Management System
-- Classification: RESTRICTED — Law Enforcement Use Only
-- Target: https://euifbienxyqhgeqapajd.supabase.co
--
-- PURPOSE: Single-file migration that can be pasted directly into the Supabase
--          SQL Editor and run top-to-bottom. Creates all extensions, enums,
--          tables, indexes, triggers, RLS policies, and seed data.
--
-- RE-RUNNABLE: All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING,
--              so this script can be safely re-executed without duplication.
--
-- INSTITUTIONS COVERED:
--   NISS           — National Intelligence and Security Service
--   RNP            — Rwanda National Police
--   RIB            — Rwanda Investigation Bureau
--   RDF            — Rwanda Defence Force
--   RCS            — Rwanda Correctional Service
--   VILLAGE_LEADER — Community intelligence reporting (village leaders)
--
-- RE-RUNNABLE ON EXISTING DATABASES:
--   If you already ran the old migration with IRONDO/DASSO, this script will:
--   1. Add VILLAGE_LEADER to the enums (ALTER TYPE … ADD VALUE IF NOT EXISTS)
--   2. Migrate existing IRONDO/DASSO users to VILLAGE_LEADER
--   3. Skip inserts that already exist (ON CONFLICT DO NOTHING)
-- ============================================================================


-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- pgvector for face embeddings — enable in Supabase dashboard first, then uncomment:
-- CREATE EXTENSION IF NOT EXISTS "vector";


-- ============================================================================
-- SECTION 2: ENUMS
-- Uses the DO/EXCEPTION pattern so re-runs are safe.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.institution_type AS ENUM (
    'RNP', 'RIB', 'RDF', 'NISS', 'RCS', 'VILLAGE_LEADER', 'INTERNATIONAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- For existing databases that have IRONDO/DASSO: add VILLAGE_LEADER without error
ALTER TYPE public.institution_type ADD VALUE IF NOT EXISTS 'VILLAGE_LEADER';
-- COMMIT required: new enum values cannot be used in the same transaction they are added
COMMIT;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'NISS_DIRECTOR', 'NISS_OFFICER',
    'RNP_COMMANDER', 'RNP_DETECTIVE', 'RNP_PATROL',
    'RIB_INVESTIGATOR', 'RIB_ANALYST',
    'RDF_COMMANDER', 'RDF_BORDER_OFFICER',
    'RCS_SUPERINTENDENT', 'RCS_OFFICER',
    'VILLAGE_LEADER',
    'SYSTEM_ADMIN', 'SIEM_ANALYST'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- For existing databases that have IRONDO_PATROL/DASSO_OFFICER: add VILLAGE_LEADER without error
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'VILLAGE_LEADER';
COMMIT;

DO $$ BEGIN
  CREATE TYPE public.clearance_level AS ENUM (
    'UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.source_tag AS ENUM (
    'CCTV_NODE', 'FACE_SCAN', 'NID_SCAN', 'NID_MANUAL',
    'INTERPOL_FEED', 'PARTNER_QUERY', 'OFFICER_REPORT', 'SYSTEM_ALERT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.suspect_status AS ENUM (
    'ACTIVE', 'WANTED', 'ARRESTED', 'IN_CUSTODY', 'CONVICTED',
    'RELEASED', 'DECEASED', 'INTERPOL_FLAGGED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.case_status AS ENUM (
    'OPEN', 'UNDER_INVESTIGATION', 'PROSECUTION', 'CLOSED', 'COLD'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.alert_priority AS ENUM (
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.custody_status AS ENUM (
    'PRE_TRIAL', 'SENTENCED', 'TRANSFERRED', 'RELEASED', 'ESCAPED', 'DECEASED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.nid_method AS ENUM ('NID_SCAN', 'NID_MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.crime_category AS ENUM (
    'HOMICIDE', 'ROBBERY', 'FRAUD', 'CYBERCRIME', 'TERRORISM',
    'ORGANIZED_CRIME', 'TRAFFICKING', 'CORRUPTION', 'SEXUAL_OFFENSE',
    'DRUG_OFFENSE', 'BORDER_VIOLATION', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.interpol_notice_color AS ENUM (
    'RED', 'ORANGE', 'BLUE', 'GREEN', 'YELLOW', 'BLACK', 'PURPLE', 'INTERPOL_DIFFUSION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.revocation_scope AS ENUM (
    'USER', 'GROUP', 'INSTITUTION', 'SERVICE', 'CAMERA_NODE', 'INTERNATIONAL_PARTNER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Upgrade suspect_status: add CLEARED value (schema.sql feature)
ALTER TYPE public.suspect_status ADD VALUE IF NOT EXISTS 'CLEARED';
COMMIT;


-- ============================================================================
-- SECTION 3: TABLES (in dependency order)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3a. users
-- App-level user table. Supabase Auth (auth.users) is separate.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution       institution_type NOT NULL,
  role              user_role   NOT NULL,
  clearance_level   clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  badge_number      VARCHAR(50) UNIQUE NOT NULL,
  full_name         VARCHAR(255) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  phone             VARCHAR(20),
  password_hash     TEXT        NOT NULL,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  locked            BOOLEAN     NOT NULL DEFAULT FALSE,
  mfa_failures      INTEGER     NOT NULL DEFAULT 0,
  last_login_at     TIMESTAMPTZ,
  last_login_ip     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3b. otp_verifications — email OTP codes for 2-FA login
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  otp_hash    TEXT        NOT NULL,   -- SHA-256 of the 6-digit OTP code
  purpose     VARCHAR(50) NOT NULL DEFAULT 'LOGIN',
  used        BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_user
  ON public.otp_verifications(user_id, expires_at DESC);

-- ----------------------------------------------------------------------------
-- 3c. user_sessions — refresh token store
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT        NOT NULL,
  device_id           TEXT,
  ip_address          TEXT,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked             BOOLEAN     NOT NULL DEFAULT FALSE,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON public.user_sessions(refresh_token_hash);

-- ----------------------------------------------------------------------------
-- 3d. suspects — core criminal intelligence records
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suspects (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  ims_reference         VARCHAR(30)   UNIQUE NOT NULL,  -- e.g. RWA-IMS-2026-00001
  status                suspect_status NOT NULL DEFAULT 'ACTIVE',
  clearance_level       clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  -- Identity
  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  full_name             VARCHAR(255) GENERATED ALWAYS AS (
                          TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
                        ) STORED,
  aliases               TEXT[],
  date_of_birth         DATE,
  gender                CHAR(1),
  nationality           CHAR(3),           -- ISO 3166-1 alpha-3
  national_id_hash      VARCHAR(64),       -- SHA-256 of the 16-digit NID (never plain text)
  passport_number       VARCHAR(30),
  -- Physical
  height_cm             INTEGER,
  distinguishing_marks  TEXT,
  physical_description  TEXT,
  -- Intelligence metadata
  owning_institution    institution_type NOT NULL,
  interpol_file_no      VARCHAR(50),
  interpol_notice       TEXT,              -- 'RED', 'BLUE', 'ORANGE', etc.
  threat_level          INTEGER           CHECK (threat_level BETWEEN 1 AND 5),
  known_associates      TEXT[],
  notes                 TEXT,
  created_by            UUID              REFERENCES public.users(id),
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspects_status
  ON public.suspects(status);
CREATE INDEX IF NOT EXISTS idx_suspects_nid
  ON public.suspects(national_id_hash);
CREATE INDEX IF NOT EXISTS idx_suspects_institution
  ON public.suspects(owning_institution);

-- ----------------------------------------------------------------------------
-- 3e. warrants
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warrants (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  suspect_id      UUID          NOT NULL REFERENCES public.suspects(id),
  warrant_type    TEXT          NOT NULL DEFAULT 'ARREST',  -- ARREST | SEARCH | EXTRADITION
  issued_by       institution_type NOT NULL,
  issued_by_court VARCHAR(255),
  case_reference  VARCHAR(50),
  charges         TEXT          NOT NULL,
  issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  active          BOOLEAN       NOT NULL DEFAULT TRUE,
  executed_at     TIMESTAMPTZ,
  priority        alert_priority NOT NULL DEFAULT 'HIGH',
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warrants_suspect
  ON public.warrants(suspect_id);
CREATE INDEX IF NOT EXISTS idx_warrants_active
  ON public.warrants(active) WHERE active = TRUE;

-- ----------------------------------------------------------------------------
-- 3f. cases
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cases (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_reference    VARCHAR(30)   UNIQUE NOT NULL,
  title             VARCHAR(255)  NOT NULL,
  category          TEXT          NOT NULL DEFAULT 'OTHER',
  status            case_status   NOT NULL DEFAULT 'OPEN',
  clearance_level   clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  lead_institution  institution_type NOT NULL,
  lead_officer_id   UUID          REFERENCES public.users(id),
  summary           TEXT,
  incident_date     TIMESTAMPTZ,
  location_name     VARCHAR(255),
  created_by        UUID          REFERENCES public.users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3g. case_suspects — many-to-many
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_suspects (
  case_id     UUID  NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  suspect_id  UUID  NOT NULL REFERENCES public.suspects(id) ON DELETE CASCADE,
  role        TEXT  DEFAULT 'SUSPECT',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, suspect_id)
);

-- ----------------------------------------------------------------------------
-- 3h. intelligence_events — central v3.0 table (all 8 source tags feed into this)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intelligence_events (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_tag            source_tag    NOT NULL,
  source_device_id      TEXT,                      -- camera node ID or device fingerprint
  officer_id            UUID          REFERENCES public.users(id),
  institution           institution_type,
  suspect_id            UUID          REFERENCES public.suspects(id),
  -- Location stored ONLY when criminal_record_found = TRUE
  location_lat          DECIMAL(10,7),
  location_lng          DECIMAL(10,7),
  location_description  TEXT,
  -- Classification
  classification        clearance_level NOT NULL DEFAULT 'UNCLASSIFIED',
  criminal_record_found BOOLEAN       NOT NULL DEFAULT FALSE,
  alert_generated       BOOLEAN       NOT NULL DEFAULT FALSE,
  confidence            DECIMAL(4,3),              -- AI confidence 0.000 – 1.000
  camera_node_id        TEXT,                      -- denormalised from source_device_id for CCTV_NODE
  notes                 TEXT,
  event_timestamp       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_suspect
  ON public.intelligence_events(suspect_id);
CREATE INDEX IF NOT EXISTS idx_events_source
  ON public.intelligence_events(source_tag);
CREATE INDEX IF NOT EXISTS idx_events_officer
  ON public.intelligence_events(officer_id);
CREATE INDEX IF NOT EXISTS idx_events_ts
  ON public.intelligence_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_record
  ON public.intelligence_events(criminal_record_found) WHERE criminal_record_found = TRUE;

-- ----------------------------------------------------------------------------
-- 3i. location_records — TOP SECRET, auto-created by trigger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.location_records (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  intelligence_event_id UUID          NOT NULL REFERENCES public.intelligence_events(id),
  suspect_id            UUID          NOT NULL REFERENCES public.suspects(id),
  location_lat          DECIMAL(10,7) NOT NULL,
  location_lng          DECIMAL(10,7) NOT NULL,
  accuracy_m            INTEGER,
  source_tag            source_tag    NOT NULL,
  detecting_officer_id  UUID          REFERENCES public.users(id),
  detecting_node_id     TEXT,
  classification        clearance_level NOT NULL DEFAULT 'TOP_SECRET',
  detection_timestamp   TIMESTAMPTZ   NOT NULL,
  retention_expires_at  TIMESTAMPTZ   NOT NULL,    -- auto-purge date (5 years by default)
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_suspect
  ON public.location_records(suspect_id);
CREATE INDEX IF NOT EXISTS idx_location_ts
  ON public.location_records(detection_timestamp DESC);

-- ----------------------------------------------------------------------------
-- 3j. corrections_records — RCS integration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corrections_records (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  suspect_id          UUID          NOT NULL REFERENCES public.suspects(id),
  case_id             UUID          REFERENCES public.cases(id),
  facility_name       VARCHAR(255)  NOT NULL,
  cell_block          VARCHAR(50),
  custody_status      custody_status NOT NULL DEFAULT 'PRE_TRIAL',
  intake_date         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  sentence_start      DATE,
  sentence_end        DATE,
  sentence_years      INTEGER,
  offense_description TEXT,
  court_name          VARCHAR(255),
  next_review         DATE,
  release_date        DATE,
  actual_release_at   TIMESTAMPTZ,
  threat_level        INTEGER       CHECK (threat_level BETWEEN 1 AND 5) DEFAULT 1,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_suspect
  ON public.corrections_records(suspect_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status
  ON public.corrections_records(custody_status);

-- ----------------------------------------------------------------------------
-- 3k. camera_nodes — Raspberry Pi 4 edge nodes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camera_nodes (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_identifier   VARCHAR(50)   UNIQUE NOT NULL,   -- e.g. GTN-BORDER-04
  location_name     VARCHAR(255),
  institution       institution_type NOT NULL,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  last_heartbeat    TIMESTAMPTZ,
  latitude          DECIMAL(10,7),
  longitude         DECIMAL(10,7),
  firmware_version  VARCHAR(20),
  revoked           BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cameras_active
  ON public.camera_nodes(is_active) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 3l. alerts — operational notifications broadcast to institutions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  intelligence_event_id UUID          REFERENCES public.intelligence_events(id),
  suspect_id            UUID          REFERENCES public.suspects(id),
  severity              alert_priority NOT NULL DEFAULT 'HIGH',
  source_tag            source_tag    NOT NULL,
  title                 TEXT          NOT NULL,
  message               TEXT          NOT NULL,
  target_institutions   institution_type[],
  is_read               BOOLEAN       NOT NULL DEFAULT FALSE,
  read_by               UUID          REFERENCES public.users(id),
  read_at               TIMESTAMPTZ,
  requires_action       BOOLEAN       NOT NULL DEFAULT FALSE,
  suspect_name          TEXT,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_unread
  ON public.alerts(is_read, created_at DESC) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_alerts_suspect
  ON public.alerts(suspect_id);

-- ----------------------------------------------------------------------------
-- 3m. siem_events — Security Information and Event Management
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siem_events (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name         VARCHAR(100)  NOT NULL,
  severity          alert_priority NOT NULL DEFAULT 'MEDIUM',
  actor_id          UUID          REFERENCES public.users(id),
  actor_institution institution_type,
  description       TEXT          NOT NULL,
  raw_data          JSONB,
  auto_action       TEXT,
  auto_actioned     BOOLEAN       NOT NULL DEFAULT FALSE,
  reviewed          BOOLEAN       NOT NULL DEFAULT FALSE,
  reviewed_by       UUID          REFERENCES public.users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3n. audit_log — append-only, immutable (trigger enforced)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id                BIGSERIAL     PRIMARY KEY,
  event_type        VARCHAR(100)  NOT NULL,
  actor_id          UUID,
  actor_role        user_role,
  actor_institution institution_type,
  target_type       VARCHAR(100),
  target_id         UUID,
  action            VARCHAR(100)  NOT NULL,
  before_state      JSONB,
  after_state       JSONB,
  ip_address        TEXT,
  device_id         TEXT,
  justification     TEXT,
  classification    clearance_level,
  session_id        UUID,
  event_timestamp   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON public.audit_log(actor_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target
  ON public.audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts
  ON public.audit_log(event_timestamp DESC);

-- ----------------------------------------------------------------------------
-- 3o. international_partners
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.international_partners (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code          CHAR(3)     NOT NULL UNIQUE,
  country_name          VARCHAR(100) NOT NULL,
  flag_emoji            VARCHAR(10),
  status                TEXT        NOT NULL DEFAULT 'ACTIVE',
  mou_includes_identity BOOLEAN     NOT NULL DEFAULT FALSE,
  mou_expires           DATE,
  recent_queries        INTEGER     NOT NULL DEFAULT 0,
  active                BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade international_partners: additional columns from schema.sql
ALTER TABLE public.international_partners ADD COLUMN IF NOT EXISTS api_key_hash  VARCHAR(64);
ALTER TABLE public.international_partners ADD COLUMN IF NOT EXISTS tls_cert_hash VARCHAR(64);
ALTER TABLE public.international_partners ADD COLUMN IF NOT EXISTS revoked        BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE public.international_partners ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMPTZ;


-- ============================================================================
-- SECTION 3p: COLUMN UPGRADES FOR EXISTING TABLES
-- Adds columns present in schema.sql but missing from the original migration.
-- All use ADD COLUMN IF NOT EXISTS — safe to re-run.
-- ============================================================================

-- users: extended auth fields
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS totp_secret           TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fingerprint_template  TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fido2_credential_id   TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_country    CHAR(2);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- suspects: extended physical / biometric fields
ALTER TABLE public.suspects ADD COLUMN IF NOT EXISTS weight_kg           INTEGER;
ALTER TABLE public.suspects ADD COLUMN IF NOT EXISTS eye_color           VARCHAR(20);
ALTER TABLE public.suspects ADD COLUMN IF NOT EXISTS mugshot_sha256      VARCHAR(64);


-- ============================================================================
-- SECTION 3q: ADDITIONAL TABLES FROM SCHEMA.SQL
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3q-i. nid_verifications — NID scan / manual check log (DIV App)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nid_verifications (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  method                nid_method    NOT NULL,
  officer_id            UUID          NOT NULL REFERENCES public.users(id),
  national_id_hash      VARCHAR(64)   NOT NULL,
  nida_match            BOOLEAN,
  ims_criminal_record   BOOLEAN       NOT NULL DEFAULT FALSE,
  suspect_id_linked     UUID          REFERENCES public.suspects(id),
  location_lat          DECIMAL(10,7),
  location_lng          DECIMAL(10,7),
  classification        clearance_level NOT NULL DEFAULT 'UNCLASSIFIED',
  citizen_data_retained BOOLEAN       NOT NULL DEFAULT FALSE,
  intelligence_event_id UUID          REFERENCES public.intelligence_events(id),
  verified_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nid_verif_officer   ON public.nid_verifications(officer_id);
CREATE INDEX IF NOT EXISTS idx_nid_verif_ts        ON public.nid_verifications(verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_nid_verif_criminal  ON public.nid_verifications(ims_criminal_record)
  WHERE ims_criminal_record = TRUE;

-- ----------------------------------------------------------------------------
-- 3q-ii. case_officers — officers assigned to a case (many-to-many)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_officers (
  case_id     UUID NOT NULL REFERENCES public.cases(id)   ON DELETE CASCADE,
  officer_id  UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  role        VARCHAR(100) DEFAULT 'INVESTIGATOR',
  assigned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, officer_id)
);

-- ----------------------------------------------------------------------------
-- 3q-iii. interpol_notices — ingested Red/Orange/Blue notices
-- (face_embedding column omitted — enable pgvector in Supabase then add manually)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interpol_notices (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_number         VARCHAR(50)   UNIQUE NOT NULL,
  notice_color        interpol_notice_color NOT NULL,
  subject_name        VARCHAR(255),
  subject_dob         DATE,
  subject_nationality CHAR(3),
  charges             TEXT,
  issuing_country     CHAR(3),
  issued_at           DATE,
  expires_at          DATE,
  suspect_id          UUID          REFERENCES public.suspects(id),
  last_synced_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  active              BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3q-iv. partner_queries — bilateral query log for international partners
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_queries (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id           UUID          NOT NULL REFERENCES public.international_partners(id),
  query_image_hash     VARCHAR(64),
  match_returned       BOOLEAN,
  niss_reviewer_id     UUID          REFERENCES public.users(id),
  response_released_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3q-v. watchlists and watchlist_entries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.watchlists (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               VARCHAR(255)  NOT NULL,
  description        TEXT,
  owning_institution institution_type NOT NULL,
  clearance_level    clearance_level NOT NULL DEFAULT 'CONFIDENTIAL',
  active             BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.watchlist_entries (
  watchlist_id UUID          NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  suspect_id   UUID          NOT NULL REFERENCES public.suspects(id)   ON DELETE CASCADE,
  added_by     UUID          REFERENCES public.users(id),
  priority     alert_priority NOT NULL DEFAULT 'MEDIUM',
  notes        TEXT,
  added_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (watchlist_id, suspect_id)
);

-- ----------------------------------------------------------------------------
-- 3q-vi. access_revocations — SIEM-driven revocation log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_revocations (
  id                  UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  scope               revocation_scope  NOT NULL,
  target_user_id      UUID              REFERENCES public.users(id),
  target_role         user_role,
  target_institution  institution_type,
  target_service      VARCHAR(100),
  target_node_id      VARCHAR(50),
  target_partner_id   UUID              REFERENCES public.international_partners(id),
  revoked_by          UUID              NOT NULL REFERENCES public.users(id),
  reason              TEXT              NOT NULL,
  siem_event_id       UUID              REFERENCES public.siem_events(id),
  active              BOOLEAN           NOT NULL DEFAULT TRUE,
  reinstated_by       UUID              REFERENCES public.users(id),
  reinstated_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- SECTION 4: TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4a. updated_at auto-update
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to users
DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Apply to suspects
DO $$ BEGIN
  CREATE TRIGGER trg_suspects_updated_at
    BEFORE UPDATE ON public.suspects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Apply to cases
DO $$ BEGIN
  CREATE TRIGGER trg_cases_updated_at
    BEFORE UPDATE ON public.cases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Apply to corrections_records
DO $$ BEGIN
  CREATE TRIGGER trg_corrections_updated_at
    BEFORE UPDATE ON public.corrections_records
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4b. Audit log immutability — prevents any UPDATE or DELETE on audit_log
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable — modification is prohibited';
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_audit_immutable
    BEFORE UPDATE OR DELETE ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_modification();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4c. Auto-create location_record when intelligence_event has criminal match + location
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_create_location_record()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.criminal_record_found = TRUE
     AND NEW.location_lat IS NOT NULL
     AND NEW.suspect_id IS NOT NULL
  THEN
    INSERT INTO public.location_records (
      intelligence_event_id, suspect_id,
      location_lat, location_lng,
      source_tag, detecting_officer_id, detecting_node_id,
      classification, detection_timestamp, retention_expires_at
    ) VALUES (
      NEW.id, NEW.suspect_id,
      NEW.location_lat, NEW.location_lng,
      NEW.source_tag, NEW.officer_id, NEW.source_device_id,
      'TOP_SECRET', NEW.event_timestamp,
      NEW.event_timestamp + INTERVAL '5 years'
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_auto_location
    AFTER INSERT ON public.intelligence_events
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_location_record();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4d. IMS reference auto-generation for suspects
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.ims_reference_seq START 13;  -- starts after seed data

CREATE OR REPLACE FUNCTION public.generate_ims_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ims_reference IS NULL OR NEW.ims_reference = '' THEN
    NEW.ims_reference := 'RWA-IMS-' || TO_CHAR(NOW(), 'YYYY') || '-'
                         || LPAD(NEXTVAL('public.ims_reference_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_suspects_ims_ref
    BEFORE INSERT ON public.suspects
    FOR EACH ROW EXECUTE FUNCTION public.generate_ims_reference();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4e. Location records immutability — no modifications allowed (purge only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_location_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Location records are immutable — modification is prohibited';
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_location_immutable
    BEFORE UPDATE ON public.location_records
    FOR EACH ROW EXECUTE FUNCTION public.prevent_location_modification();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4f. Audit event helper — convenience function for the API layer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type    TEXT,
  p_actor_id      UUID,
  p_target_type   TEXT,
  p_target_id     UUID,
  p_action        TEXT,
  p_classification clearance_level DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.audit_log (event_type, actor_id, target_type, target_id, action, classification)
  VALUES (p_event_type, p_actor_id, p_target_type, p_target_id, p_action, p_classification);
END;
$$;


-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- The API exclusively uses the service_role key (which bypasses RLS).
-- Permission enforcement is done in the Next.js API layer.
-- These policies simply block unauthenticated (anon) direct access.
-- ============================================================================

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warrants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_suspects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrections_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_nodes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siem_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.international_partners ENABLE ROW LEVEL SECURITY;

-- Deny all direct anon access. All application access goes through the
-- authenticated Next.js API using the service_role key.
DO $$ BEGIN
  CREATE POLICY "deny_anon_users"        ON public.users               FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_suspects"     ON public.suspects            FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_warrants"     ON public.warrants            FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_cases"        ON public.cases               FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_case_suspects" ON public.case_suspects      FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_events"       ON public.intelligence_events FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_location"     ON public.location_records    FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_corrections"  ON public.corrections_records FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_cameras"      ON public.camera_nodes        FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_alerts"       ON public.alerts              FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_siem"         ON public.siem_events         FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_audit"        ON public.audit_log           FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_sessions"     ON public.user_sessions       FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_otp"          ON public.otp_verifications   FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_partners"     ON public.international_partners FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS for new tables
ALTER TABLE public.nid_verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_officers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interpol_notices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_queries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_revocations  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "deny_anon_nid_verif"    ON public.nid_verifications   FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_case_off"     ON public.case_officers        FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_interpol"     ON public.interpol_notices     FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_pq"           ON public.partner_queries      FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_watchlists"   ON public.watchlists           FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_wl_entries"   ON public.watchlist_entries    FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "deny_anon_revocations"  ON public.access_revocations   FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 6: SEED DATA
-- All names, IDs, NID numbers, case references, and biographical data are
-- ENTIRELY FICTIONAL and created for development/testing purposes only.
--
-- Fixed UUIDs are used throughout so foreign keys cross-reference correctly
-- and the script is idempotent (re-runnable without duplicating data).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 6a. USERS
-- Password for ALL sample accounts: IMS@Sample2026!
-- bcrypt hash (12 rounds): $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O
-- ----------------------------------------------------------------------------

-- NISS (National Intelligence and Security Service)
INSERT INTO public.users (id, institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  ('a0000001-0000-0000-0000-000000000001', 'NISS', 'NISS_DIRECTOR',  'TOP_SECRET',    'NISS-DIR-001',  'Jean-Pierre Habimana',              'jp.habimana@niss.gov.rw',       '+250788100001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000001-0000-0000-0000-000000000002', 'NISS', 'NISS_DIRECTOR',  'TOP_SECRET',    'NISS-DIR-002',  'Aimable Nzeyimana',                 'a.nzeyimana@niss.gov.rw',       '+250788100002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000001-0000-0000-0000-000000000003', 'NISS', 'NISS_OFFICER',   'TOP_SECRET',    'NISS-OFF-003',  'Claudine Mukasine',                 'c.mukasine@niss.gov.rw',        '+250788100003', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000001-0000-0000-0000-000000000004', 'NISS', 'NISS_OFFICER',   'SECRET',        'NISS-OFF-004',  'Patrick Rwigamba',                  'p.rwigamba@niss.gov.rw',        '+250788100004', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000001-0000-0000-0000-000000000005', 'NISS', 'SIEM_ANALYST',   'SECRET',        'NISS-SIEM-005', 'Diane Ingabire',                    'd.ingabire@niss.gov.rw',        '+250788100005', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE)
ON CONFLICT (badge_number) DO NOTHING;

-- RNP (Rwanda National Police)
INSERT INTO public.users (id, institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  ('a0000002-0000-0000-0000-000000000001', 'RNP', 'RNP_COMMANDER',  'SECRET',        'RNP-CMD-001',  'Commissaire Bernard Nkurunziza',     'b.nkurunziza@rnp.gov.rw',       '+250788200001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000002', 'RNP', 'RNP_COMMANDER',  'SECRET',        'RNP-CMD-002',  'Commissaire Alice Mukamana',          'a.mukamana@rnp.gov.rw',         '+250788200002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000003', 'RNP', 'RNP_DETECTIVE',  'SECRET',        'RNP-DET-003',  'Inspecteur Théogène Bizimana',        't.bizimana@rnp.gov.rw',         '+250788200003', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000004', 'RNP', 'RNP_DETECTIVE',  'CONFIDENTIAL',  'RNP-DET-004',  'Inspecteur Grace Uwimana',            'g.uwimana@rnp.gov.rw',          '+250788200004', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000005', 'RNP', 'RNP_DETECTIVE',  'CONFIDENTIAL',  'RNP-DET-005',  'Inspecteur Emmanuel Nshimiyimana',    'e.nshimiyimana@rnp.gov.rw',     '+250788200005', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000006', 'RNP', 'RNP_PATROL',     'UNCLASSIFIED',  'RNP-PAT-006',  'Agent Jacqueline Mukamurenzi',        'j.mukamurenzi@rnp.gov.rw',      '+250788200006', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000007', 'RNP', 'RNP_PATROL',     'UNCLASSIFIED',  'RNP-PAT-007',  'Agent François Nzabonimpa',           'f.nzabonimpa@rnp.gov.rw',       '+250788200007', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000008', 'RNP', 'RNP_PATROL',     'UNCLASSIFIED',  'RNP-PAT-008',  'Agent Solange Uwera',                 's.uwera@rnp.gov.rw',            '+250788200008', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000002-0000-0000-0000-000000000009', 'RNP', 'SYSTEM_ADMIN',   'SECRET',        'RNP-ADM-009',  'Ingénieur Oscar Karangwa',            'o.karangwa@rnp.gov.rw',         '+250788200009', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE)
ON CONFLICT (badge_number) DO NOTHING;

-- RIB (Rwanda Investigation Bureau)
INSERT INTO public.users (id, institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  ('a0000003-0000-0000-0000-000000000001', 'RIB', 'RIB_INVESTIGATOR','SECRET',        'RIB-INV-001',  'Investigateur Pascal Habimana',       'p.habimana@rib.gov.rw',         '+250788300001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000003-0000-0000-0000-000000000002', 'RIB', 'RIB_INVESTIGATOR','SECRET',        'RIB-INV-002',  'Investigatrice Rose Kayitesi',         'r.kayitesi@rib.gov.rw',         '+250788300002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000003-0000-0000-0000-000000000003', 'RIB', 'RIB_INVESTIGATOR','SECRET',        'RIB-INV-003',  'Investigateur Sylvain Ndayisaba',      's.ndayisaba@rib.gov.rw',        '+250788300003', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000003-0000-0000-0000-000000000004', 'RIB', 'RIB_ANALYST',    'CONFIDENTIAL',  'RIB-ANA-004',  'Analyste Martine Uwiringiyimana',      'm.uwiringiyimana@rib.gov.rw',   '+250788300004', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000003-0000-0000-0000-000000000005', 'RIB', 'RIB_ANALYST',    'CONFIDENTIAL',  'RIB-ANA-005',  'Analyste Christian Niyonsenga',        'c.niyonsenga@rib.gov.rw',       '+250788300005', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE)
ON CONFLICT (badge_number) DO NOTHING;

-- RDF (Rwanda Defence Force)
INSERT INTO public.users (id, institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  ('a0000004-0000-0000-0000-000000000001', 'RDF', 'RDF_COMMANDER',       'SECRET',        'RDF-CMD-001',  'Colonel Théophile Buregeya',          't.buregeya@rdf.mil.rw',         '+250788400001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000004-0000-0000-0000-000000000002', 'RDF', 'RDF_COMMANDER',       'SECRET',        'RDF-CMD-002',  'Lieutenant-Colonel Vénuste Hakizimana','v.hakizimana@rdf.mil.rw',       '+250788400002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000004-0000-0000-0000-000000000003', 'RDF', 'RDF_BORDER_OFFICER',  'CONFIDENTIAL',  'RDF-BRD-003',  'Sergent Janvier Nkurikiyimana',       'j.nkurikiyimana@rdf.mil.rw',    '+250788400003', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000004-0000-0000-0000-000000000004', 'RDF', 'RDF_BORDER_OFFICER',  'CONFIDENTIAL',  'RDF-BRD-004',  'Sergent Espérance Murorunkwere',      'e.murorunkwere@rdf.mil.rw',     '+250788400004', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000004-0000-0000-0000-000000000005', 'RDF', 'RDF_BORDER_OFFICER',  'CONFIDENTIAL',  'RDF-BRD-005',  'Caporal John Rugamba',                'j.rugamba@rdf.mil.rw',          '+250788400005', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE)
ON CONFLICT (badge_number) DO NOTHING;

-- RCS (Rwanda Correctional Service)
INSERT INTO public.users (id, institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  ('a0000005-0000-0000-0000-000000000001', 'RCS', 'RCS_SUPERINTENDENT','CONFIDENTIAL',  'RCS-SUP-001',  'Surintendant Joseph Muvunyi',         'j.muvunyi@rcs.gov.rw',          '+250788500001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000005-0000-0000-0000-000000000002', 'RCS', 'RCS_SUPERINTENDENT','CONFIDENTIAL',  'RCS-SUP-002',  'Surintendante Chantal Nyiransabimana', 'c.nyiransabimana@rcs.gov.rw',   '+250788500002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000005-0000-0000-0000-000000000003', 'RCS', 'RCS_OFFICER',       'UNCLASSIFIED',  'RCS-OFF-003',  'Agent de correction Didier Rutagengwa','d.rutagengwa@rcs.gov.rw',       '+250788500003', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000005-0000-0000-0000-000000000004', 'RCS', 'RCS_OFFICER',       'UNCLASSIFIED',  'RCS-OFF-004',  'Agente de correction Immaculée Mukandori','i.mukandori@rcs.gov.rw',    '+250788500004', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE)
ON CONFLICT (badge_number) DO NOTHING;

-- VILLAGE LEADERS (community intelligence reporting — limited access)
-- Upgrade path: migrate any existing IRONDO/DASSO users to VILLAGE_LEADER first
UPDATE public.users SET
  institution  = 'VILLAGE_LEADER',
  role         = 'VILLAGE_LEADER',
  badge_number = CASE badge_number
    WHEN 'IRO-PAT-001' THEN 'VL-001'
    WHEN 'IRO-PAT-002' THEN 'VL-002'
    WHEN 'DAS-OFF-001' THEN 'VL-003'
    WHEN 'DAS-OFF-002' THEN 'VL-004'
    ELSE badge_number
  END,
  email = CASE email
    WHEN 'a.harerimana@irondo.gov.rw'  THEN 'a.harerimana@village.gov.rw'
    WHEN 'f.mukabagwiza@irondo.gov.rw' THEN 'f.mukabagwiza@village.gov.rw'
    WHEN 'r.nsengimana@dasso.gov.rw'   THEN 'r.nsengimana@village.gov.rw'
    WHEN 'v.umulisa@dasso.gov.rw'      THEN 'v.umulisa@village.gov.rw'
    ELSE email
  END
WHERE institution IN ('IRONDO', 'DASSO');

-- Fresh insert for new databases (skipped automatically if upgrade above already ran)
INSERT INTO public.users (id, institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  ('a0000006-0000-0000-0000-000000000001', 'VILLAGE_LEADER', 'VILLAGE_LEADER', 'UNCLASSIFIED', 'VL-001', 'Augustin Harerimana',  'a.harerimana@village.gov.rw',  '+250788600001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000006-0000-0000-0000-000000000002', 'VILLAGE_LEADER', 'VILLAGE_LEADER', 'UNCLASSIFIED', 'VL-002', 'Félicité Mukabagwiza', 'f.mukabagwiza@village.gov.rw', '+250788600002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000007-0000-0000-0000-000000000001', 'VILLAGE_LEADER', 'VILLAGE_LEADER', 'UNCLASSIFIED', 'VL-003', 'Révérien Nsengimana',  'r.nsengimana@village.gov.rw',  '+250788700001', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE),
  ('a0000007-0000-0000-0000-000000000002', 'VILLAGE_LEADER', 'VILLAGE_LEADER', 'UNCLASSIFIED', 'VL-004', 'Vestine Umulisa',      'v.umulisa@village.gov.rw',     '+250788700002', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniuM4UMpaSMVNpQHs5z3z2B0O', TRUE)
ON CONFLICT (badge_number) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6b. SUSPECTS
-- Fixed UUIDs: b0000000-0000-0000-0000-0000000000XX  (XX = 01..12)
-- NID hashes: SHA-256 of fictional 16-digit NID strings (via encode/sha256 if pgcrypto available)
-- ----------------------------------------------------------------------------

INSERT INTO public.suspects (
  id, ims_reference, status, clearance_level,
  first_name, last_name, aliases, date_of_birth, gender, nationality,
  national_id_hash, height_cm, distinguishing_marks, physical_description,
  owning_institution, interpol_file_no, interpol_notice,
  threat_level, known_associates, notes, created_by
)
VALUES

-- S1: Alexis Mugisha — WANTED, armed robbery & terrorism links (Threat 5)
(
  'b0000000-0000-0000-0000-000000000001',
  'RWA-IMS-2024-00001', 'WANTED', 'TOP_SECRET',
  'Alexis', 'Mugisha',
  ARRAY['Alex M', 'The Shadow', 'Umukozi'],
  '1978-03-14', 'M', 'RWA',
  encode(sha256('1199780012345001'::bytea), 'hex'),
  178,
  'Scar on left cheek (5 cm), tattoo of eagle on right forearm',
  'Male, 178 cm, athletic build, scar on left cheek, eagle tattoo on right forearm',
  'RNP', NULL, NULL, 5,
  ARRAY['Eric Ndayambaje', 'Vital Bizimungu'],
  'Primary suspect in Kigali CBD armed robbery series (2023-2024). Suspected links to cross-border criminal network. Approach with extreme caution.',
  'a0000002-0000-0000-0000-000000000003'
),

-- S2: Christine Uwimana — IN_CUSTODY, financial fraud (Threat 3)
(
  'b0000000-0000-0000-0000-000000000002',
  'RWA-IMS-2024-00002', 'IN_CUSTODY', 'CONFIDENTIAL',
  'Christine', 'Uwimana',
  ARRAY['Chris U', 'Mama Finance'],
  '1985-07-22', 'F', 'RWA',
  encode(sha256('1198560023456002'::bytea), 'hex'),
  162,
  NULL,
  'Female, 162 cm, brown eyes, medium build',
  'RIB', NULL, NULL, 3,
  NULL,
  'Accused of defrauding Umurenge SACCOs across 5 districts. Estimated losses: RWF 450 million. Currently at Mageragere Prison.',
  'a0000003-0000-0000-0000-000000000001'
),

-- S3: Pierre Nsengiyumva — CONVICTED, homicide (Threat 4)
(
  'b0000000-0000-0000-0000-000000000003',
  'RWA-IMS-2023-00001', 'CONVICTED', 'CONFIDENTIAL',
  'Pierre', 'Nsengiyumva',
  NULL,
  '1970-11-05', 'M', 'RWA',
  encode(sha256('1197040034567003'::bytea), 'hex'),
  172,
  'Missing tip of right index finger, shaved head',
  'Male, 172 cm, shaved head, missing tip of right index finger',
  'RNP', NULL, NULL, 4,
  NULL,
  'Convicted of murder in Nyamirambo (2022). Sentence: 25 years. Currently serving at Mpanga Central Prison.',
  'a0000002-0000-0000-0000-000000000003'
),

-- S4: Dieudonne Kabera — ACTIVE, cybercrime (Threat 3)
(
  'b0000000-0000-0000-0000-000000000004',
  'RWA-IMS-2025-00001', 'ACTIVE', 'SECRET',
  'Dieudonne', 'Kabera',
  ARRAY['DieuK', 'GhostByte', 'D-Code', 'admin_rw'],
  '1992-04-17', 'M', 'RWA',
  encode(sha256('1199920045678004'::bytea), 'hex'),
  168,
  NULL,
  'Male, 168 cm, wears glasses, slim build',
  'RIB', NULL, NULL, 3,
  NULL,
  'Suspected operator of phishing ring targeting Rwandan banking apps. IP traces to Kigali, Nairobi, and Kampala. Under active surveillance.',
  'a0000003-0000-0000-0000-000000000002'
),

-- S5: Goreth Mukamana — WANTED, human trafficking (Threat 4)
(
  'b0000000-0000-0000-0000-000000000005',
  'RWA-IMS-2024-00003', 'WANTED', 'SECRET',
  'Goreth', 'Mukamana',
  ARRAY['Mama Goreth', 'Madame G'],
  '1980-09-30', 'F', 'RWA',
  encode(sha256('1198800056789005'::bytea), 'hex'),
  165,
  'Birthmark above left eyebrow, gold tooth (upper right)',
  'Female, 165 cm, braided hair, gold tooth (upper right), birthmark above left eyebrow',
  'RIB', NULL, NULL, 4,
  NULL,
  'Suspected leader of trafficking network operating Rwanda-Uganda-Middle East corridor. Last seen Kigali, June 2026.',
  'a0000003-0000-0000-0000-000000000001'
),

-- S6: Jean Niyongabo — INTERPOL_FLAGGED, Red Notice (Threat 5)
(
  'b0000000-0000-0000-0000-000000000006',
  'RWA-IMS-2025-00002', 'INTERPOL_FLAGGED', 'TOP_SECRET',
  'Jean', 'Niyongabo',
  ARRAY['Johnny N', 'Black Eagle', 'Le Fantôme'],
  '1965-02-18', 'M', 'RWA',
  encode(sha256('1196560067890006'::bytea), 'hex'),
  183,
  'Vertical scar on right temple, tribal markings on neck, partially deaf in left ear',
  'Male, 183 cm, tribal markings on neck, vertical scar on right temple',
  'NISS', 'A-5674/2-2025', 'RED', 5,
  NULL,
  'Subject of Interpol Red Notice issued by DRC authorities for war crimes and financial crimes. May be traveling under false documents. NISS-only access.',
  'a0000001-0000-0000-0000-000000000003'
),

-- S7: Fidele Hakizimana — ARRESTED, corruption (Threat 2)
(
  'b0000000-0000-0000-0000-000000000007',
  'RWA-IMS-2026-00001', 'ARRESTED', 'CONFIDENTIAL',
  'Fidele', 'Hakizimana',
  NULL,
  '1976-06-12', 'M', 'RWA',
  encode(sha256('1197660078901007'::bytea), 'hex'),
  175,
  NULL,
  'Male, 170 cm, stocky build',
  'RIB', NULL, NULL, 2,
  NULL,
  'Former civil servant. Arrested June 2026 for solicitation of bribes at Kigali sector office. Under RIB investigation.',
  'a0000003-0000-0000-0000-000000000002'
),

-- S8: Solange Uwera — RELEASED, completed sentence (Threat 1)
(
  'b0000000-0000-0000-0000-000000000008',
  'RWA-IMS-2022-00001', 'RELEASED', 'UNCLASSIFIED',
  'Solange', 'Uwera',
  NULL,
  '1991-12-03', 'F', 'RWA',
  encode(sha256('1199100089012008'::bytea), 'hex'),
  160,
  NULL,
  'Female, 160 cm, slim build',
  'RCS', NULL, NULL, 1,
  NULL,
  'Completed 3-year sentence for armed robbery (Remera, 2021). Released March 2025. On conditional supervision.',
  'a0000002-0000-0000-0000-000000000003'
),

-- S9: Vital Bizimungu — ACTIVE, border violations / smuggling (Threat 3)
(
  'b0000000-0000-0000-0000-000000000009',
  'RWA-IMS-2025-00003', 'ACTIVE', 'SECRET',
  'Vital', 'Bizimungu',
  ARRAY['Vito', 'Vee-B', 'Smuggler V'],
  '1983-08-25', 'M', 'RWA',
  encode(sha256('1198340090123009'::bytea), 'hex'),
  169,
  'Noticeable limp in left leg, thin beard',
  'Male, 169 cm, thin beard, limp in left leg',
  'RDF', NULL, NULL, 3,
  NULL,
  'Suspected of systematic smuggling at Gatuna border post. Linked to 7 border incidents 2024-2025.',
  'a0000004-0000-0000-0000-000000000001'
),

-- S10: Eric Ndayambaje — WANTED, drug trafficking (Threat 4)
(
  'b0000000-0000-0000-0000-000000000010',
  'RWA-IMS-2025-00004', 'WANTED', 'SECRET',
  'Eric', 'Ndayambaje',
  ARRAY['Rico', 'E-Money', 'The Mule', 'Mwenda'],
  '1989-05-07', 'M', 'RWA',
  encode(sha256('1199560001234010'::bytea), 'hex'),
  177,
  'Cross scar on left hand, three dots tattooed between left index finger and thumb',
  'Male, 177 cm, cross scar on left hand',
  'RNP', NULL, NULL, 4,
  ARRAY['Alexis Mugisha'],
  'Wanted for drug trafficking — cannabis and heroin. Active in Kimironko and Kacyiru. Known to carry weapons. Arrest warrant issued 2025.',
  'a0000002-0000-0000-0000-000000000003'
),

-- S11: Théodore Karangwa — CONVICTED (Threat 3)
(
  'b0000000-0000-0000-0000-000000000011',
  'RWA-IMS-2023-00002', 'CONVICTED', 'CONFIDENTIAL',
  'Théodore', 'Karangwa',
  NULL,
  '1969-01-19', 'M', 'RWA',
  encode(sha256('1196820012345011'::bytea), 'hex'),
  165,
  NULL,
  'Male, 165 cm, medium build',
  'RCS', NULL, NULL, 3,
  NULL,
  'Convicted 2023 for aggravated sexual assault. Sentence: 20 years. Serving at Nyarugenge facility.',
  'a0000002-0000-0000-0000-000000000003'
),

-- S12: Cécile Iradukunda — ACTIVE, organised crime (Threat 5)
(
  'b0000000-0000-0000-0000-000000000012',
  'RWA-IMS-2026-00002', 'ACTIVE', 'TOP_SECRET',
  'Cécile', 'Iradukunda',
  ARRAY['La Patronne', 'CC', 'Ice Queen', 'Mama Réseau'],
  '1975-10-28', 'F', 'RWA',
  encode(sha256('1199240023456012'::bytea), 'hex'),
  160,
  'Distinctive cornrow hairstyle, silver bracelet on right wrist, always wears dark glasses in public',
  'Female, 160 cm, short natural hair / cornrows, silver bracelet on right wrist',
  'NISS', NULL, NULL, 5,
  NULL,
  'Suspected organizer of cross-border organised crime syndicate. Connections to Kenya, Uganda, Burundi. NISS-classified. Maintain covert surveillance.',
  'a0000001-0000-0000-0000-000000000003'
)

ON CONFLICT (ims_reference) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6c. WARRANTS
-- Fixed UUIDs: c0000000-0000-0000-0000-0000000000XX
-- ----------------------------------------------------------------------------
INSERT INTO public.warrants (id, suspect_id, warrant_type, issued_by, issued_by_court, case_reference, charges, issued_at, active, priority)
VALUES

-- W1: Mugisha Alexis — arrest warrant (WANTED, threat 5)
(
  'c0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'ARREST', 'RNP', 'Tribunal de Grande Instance de Kigali',
  'RWA-RNP-2024-00034',
  'Armed robbery (6 counts); illegal possession of firearms; assault causing grievous bodily harm',
  '2024-09-15 10:00:00+02', TRUE, 'CRITICAL'
),

-- W2: Mukamana Goreth — arrest warrant (WANTED, trafficking)
(
  'c0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000005',
  'ARREST', 'RIB', 'Tribunal de Grande Instance de Kigali',
  'RWA-RIB-2024-00019',
  'Human trafficking (aggravated); exploitation of persons; conspiracy to traffic persons across international borders',
  '2024-11-20 09:00:00+02', TRUE, 'HIGH'
),

-- W3: Ndayambaje Eric — arrest warrant (WANTED, drugs)
(
  'c0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000010',
  'ARREST', 'RNP', 'Tribunal de Grande Instance de Kigali',
  'RWA-RNP-2025-00056',
  'Drug trafficking; illegal possession of controlled substances; illegal possession of a firearm',
  '2025-08-01 08:00:00+02', TRUE, 'HIGH'
),

-- W4: Niyongabo Jean — extradition warrant (Interpol Red Notice)
(
  'c0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000006',
  'EXTRADITION', 'NISS', 'High Court of Rwanda',
  'RWA-NISS-2026-00003',
  'War crimes (count 1); financial crimes — grand larceny of public funds; crimes against humanity (per DRC authorities and Interpol Red Notice A-5674/2-2025)',
  '2025-12-01 00:00:00+02', TRUE, 'CRITICAL'
),

-- W5: Kabera Dieudonne — search warrant (cybercrime investigation)
(
  'c0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000004',
  'SEARCH', 'RIB', 'Tribunal de Grande Instance de Kigali',
  'RWA-RIB-2025-00007',
  'Search of premises — Kigali residence and Kimihurura office: electronic devices, servers, and financial records related to banking phishing operation',
  '2025-09-10 14:00:00+02', TRUE, 'MEDIUM'
),

-- W6: Iradukunda Cécile — arrest warrant (organised crime, NISS)
(
  'c0000000-0000-0000-0000-000000000006',
  'b0000000-0000-0000-0000-000000000012',
  'ARREST', 'NISS', 'High Court of Rwanda',
  'RWA-NISS-2026-00003',
  'Directing a criminal organisation; money laundering; smuggling; extortion across Rwanda-Kenya-Uganda-Burundi corridor',
  '2026-03-01 00:00:00+02', TRUE, 'CRITICAL'
),

-- W7: Bizimungu Vital — arrest warrant (border smuggling)
(
  'c0000000-0000-0000-0000-000000000007',
  'b0000000-0000-0000-0000-000000000009',
  'ARREST', 'RDF', 'Tribunal de Grande Instance de Kigali',
  'RWA-RDF-2025-00003',
  'Systematic smuggling at international border; customs fraud; possession of contraband goods (7 documented incidents)',
  '2025-10-15 09:00:00+02', TRUE, 'HIGH'
)

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6d. CASES
-- Fixed UUIDs: d0000000-0000-0000-0000-0000000000XX
-- ----------------------------------------------------------------------------
INSERT INTO public.cases (id, case_reference, title, category, status, clearance_level, lead_institution, lead_officer_id, summary, incident_date, location_name, created_by, created_at)
VALUES

-- C1: Armed robbery series, Kigali CBD
(
  'd0000000-0000-0000-0000-000000000001',
  'RIB-2024-CR-00147', 'Kigali CBD Armed Robbery Series',
  'ROBBERY', 'UNDER_INVESTIGATION', 'SECRET', 'RNP',
  'a0000002-0000-0000-0000-000000000003',
  'Series of 6 armed robberies in Kigali Central Business District (March–August 2024). Primary suspect: Alexis Mugisha.',
  '2024-03-11 21:30:00+02', 'Kigali CBD, near KCC',
  'a0000002-0000-0000-0000-000000000001', '2024-03-15 08:00:00Z'
),

-- C2: SACCO fraud — Musanze
(
  'd0000000-0000-0000-0000-000000000002',
  'RIB-2024-FR-00031', 'Umurenge SACCO Financial Fraud Network',
  'FRAUD', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'RIB',
  'a0000003-0000-0000-0000-000000000001',
  'Systematic fraud targeting Umurenge SACCOs across Musanze, Burera, and Rulindo. RWF 450 million estimated loss. Primary suspect: Christine Uwimana.',
  '2023-01-15 00:00:00+02', 'Musanze District SACCO offices',
  'a0000003-0000-0000-0000-000000000001', '2024-05-22 09:30:00Z'
),

-- C3: Drug trafficking — Northern border
(
  'd0000000-0000-0000-0000-000000000003',
  'RIB-2025-DT-00008', 'Northern Border Drug Trafficking Route',
  'DRUG_OFFENSE', 'UNDER_INVESTIGATION', 'SECRET', 'RDF',
  'a0000004-0000-0000-0000-000000000001',
  'Drug distribution network using Rwanda-Uganda border routes. Cannabis and heroin. Linked to Ndayambaje Eric.',
  '2025-01-07 11:00:00+02', 'Gatuna Border Post and Kigali distribution',
  'a0000002-0000-0000-0000-000000000001', '2025-01-07 11:00:00Z'
),

-- C4: Cross-border organised crime — NISS (TOP SECRET)
(
  'd0000000-0000-0000-0000-000000000004',
  'RIB-2025-OC-00022', 'Cross-Border Organised Crime Cell',
  'ORGANIZED_CRIME', 'UNDER_INVESTIGATION', 'TOP_SECRET', 'NISS',
  'a0000001-0000-0000-0000-000000000003',
  'Intelligence-led investigation into transnational organised crime network. Money laundering, smuggling, extortion. Primary suspect: Iradukunda Cécile.',
  '2025-04-10 13:00:00+02', 'Multiple classified locations',
  'a0000001-0000-0000-0000-000000000003', '2025-04-10 13:00:00Z'
),

-- C5: Homicide — Gitarama / Nyamirambo (CLOSED)
(
  'd0000000-0000-0000-0000-000000000005',
  'RIB-2023-HO-00003', 'Gitarama Homicide — Pierre Nsengiyumva',
  'HOMICIDE', 'CLOSED', 'SECRET', 'RNP',
  'a0000002-0000-0000-0000-000000000004',
  'Murder in Nyamirambo sector, 2022. Perpetrator Pierre Nsengiyumva convicted 2023. 25-year sentence.',
  '2022-08-03 23:15:00+02', 'Nyamirambo Sector, Kigali',
  'a0000002-0000-0000-0000-000000000001', '2023-11-05 07:00:00Z'
),

-- C6: Corruption — Customs / Port of Kigali
(
  'd0000000-0000-0000-0000-000000000006',
  'RIB-2026-CO-00011', 'Customs Corruption — Port of Kigali',
  'CORRUPTION', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'RIB',
  'a0000003-0000-0000-0000-000000000002',
  'Former civil servant Fidele Hakizimana arrested for soliciting and receiving bribes at Kigali sector office.',
  '2026-06-01 00:00:00+02', 'Kicukiro Sector Office, Kigali',
  'a0000003-0000-0000-0000-000000000002', '2026-04-14 10:00:00Z'
),

-- C7: Human trafficking — Southern Region
(
  'd0000000-0000-0000-0000-000000000007',
  'RIB-2025-TF-00005', 'Human Trafficking Network — Southern Region',
  'TRAFFICKING', 'UNDER_INVESTIGATION', 'SECRET', 'RIB',
  'a0000003-0000-0000-0000-000000000001',
  'Trafficking network operating under cover of domestic labor recruitment agencies. Leader: Mukamana Goreth.',
  '2024-05-20 00:00:00+02', 'Kigali recruitment agencies',
  'a0000003-0000-0000-0000-000000000001', '2025-09-03 08:30:00Z'
),

-- C8: Mobile Money cybercrime
(
  'd0000000-0000-0000-0000-000000000008',
  'RIB-2024-CY-00019', 'Mobile Money Cybercrime Operation',
  'CYBERCRIME', 'PROSECUTION', 'CONFIDENTIAL', 'RIB',
  'a0000003-0000-0000-0000-000000000002',
  'Sophisticated phishing campaign impersonating Bank of Kigali, Equity Bank, and MTN Mobile Money. ~1,200 victims. Primary suspect: Kabera Dieudonne.',
  '2025-02-01 00:00:00+02', 'Nationwide / Digital',
  'a0000003-0000-0000-0000-000000000001', '2024-11-20 12:00:00Z'
)

ON CONFLICT (case_reference) DO NOTHING;


-- Case-Suspect links
INSERT INTO public.case_suspects (case_id, suspect_id, role) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000010', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000012', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000006', 'ACCOMPLICE'),
  ('d0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000007', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000005', 'PRIMARY_SUSPECT'),
  ('d0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000012', 'ACCOMPLICE'),
  ('d0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000004', 'PRIMARY_SUSPECT')
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6e. CAMERA NODES
-- Fixed UUIDs: e0000000-0000-0000-0000-0000000000XX
-- ----------------------------------------------------------------------------
INSERT INTO public.camera_nodes (id, node_identifier, location_name, institution, is_active, last_heartbeat, latitude, longitude, firmware_version)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'GTN-BORDER-01', 'Gatuna Border — Entry Lane',     'RDF', TRUE,  '2026-06-29 13:48:00+02', -1.7018,  29.7350, '3.0.1'),
  ('e0000000-0000-0000-0000-000000000002', 'GTN-BORDER-02', 'Gatuna Border — Exit Lane',      'RDF', TRUE,  '2026-06-29 13:47:00+02', -1.7020,  29.7351, '3.0.1'),
  ('e0000000-0000-0000-0000-000000000003', 'RBV-BORDER-01', 'Rubavu Border — Main Gate',      'RDF', TRUE,  '2026-06-29 13:45:00+02', -1.6763,  29.3460, '3.0.1'),
  ('e0000000-0000-0000-0000-000000000004', 'RBV-BORDER-02', 'Rubavu Border — Secondary',      'RDF', FALSE, '2026-06-29 01:12:00+02', -1.6770,  29.3455, '3.0.1'),
  ('e0000000-0000-0000-0000-000000000005', 'RSZ-BORDER-01', 'Rusizi Border Post',             'RDF', TRUE,  '2026-06-29 13:40:00+02', -2.4797,  28.9078, '3.0.0'),
  ('e0000000-0000-0000-0000-000000000006', 'NYG-BORDER-01', 'Nyagatare Border — North',       'RDF', TRUE,  '2026-06-29 13:42:00+02', -1.2948,  30.3288, '2.9.5'),
  ('e0000000-0000-0000-0000-000000000007', 'KGL-AIRPORT-01','KGL Airport — Arrivals',         'RDF', TRUE,  '2026-06-29 13:46:00+02', -1.9706,  30.1328, '3.0.2'),
  ('e0000000-0000-0000-0000-000000000008', 'KGL-BUSPARK-01','Nyabugogo Bus Terminal',          'RNP', TRUE,  '2026-06-29 13:49:00+02', -1.9490,  30.0578, '3.0.0'),
  ('e0000000-0000-0000-0000-000000000009', 'KGL-CBD-01',    'Kigali CBD Junction',            'RNP', TRUE,  '2026-06-29 13:44:00+02', -1.9500,  30.0588, '3.0.1'),
  ('e0000000-0000-0000-0000-000000000010', 'MSZ-JUNCTION-01','Musanze Junction',              'RNP', FALSE, '2026-06-28 22:10:00+02', -1.4993,  29.6327, '3.0.0')
ON CONFLICT (node_identifier) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6f. INTELLIGENCE EVENTS
-- Fixed UUIDs: f0000000-0000-0000-0000-0000000000XX
-- NOTE: location_record trigger fires on INSERT but only when both
--       criminal_record_found=TRUE AND location_lat IS NOT NULL.
-- ----------------------------------------------------------------------------
INSERT INTO public.intelligence_events (
  id, source_tag, source_device_id, officer_id, institution,
  suspect_id, location_lat, location_lng, location_description,
  classification, criminal_record_found, alert_generated,
  confidence, camera_node_id, notes, event_timestamp
)
VALUES

-- EV1: CCTV_NODE — Gatuna Border, Vital Bizimungu (Threat 3, ACTIVE)
(
  'f0000000-0000-0000-0000-000000000001',
  'CCTV_NODE', 'GTN-BORDER-01', NULL, 'RDF',
  'b0000000-0000-0000-0000-000000000009',
  -1.7018, 29.7350, 'Gatuna Border Post — Entry Lane',
  'TOP_SECRET', TRUE, TRUE,
  0.941, 'GTN-BORDER-01',
  'Suspect detected at Gatuna Border entry lane. Active WANTED status. RDF dispatch notified.',
  '2026-06-29 13:47:00+02'
),

-- EV2: NID_SCAN — Alexis Mugisha at Nyabugogo checkpoint (Wanted, Threat 5)
(
  'f0000000-0000-0000-0000-000000000002',
  'NID_SCAN', NULL, 'a0000002-0000-0000-0000-000000000006', 'RNP',
  'b0000000-0000-0000-0000-000000000001',
  -1.9441, 30.0619, 'Nyabugogo Checkpoint, Kigali',
  'TOP_SECRET', TRUE, TRUE,
  1.0, NULL,
  'Mugisha Alexis NID scan at Nyabugogo checkpoint. Warrant active. Suspect fled on foot before arrest.',
  '2026-06-29 11:22:00+02'
),

-- EV3: FACE_SCAN — Goreth Mukamana at Kigali Airport (WANTED, Threat 4)
(
  'f0000000-0000-0000-0000-000000000003',
  'FACE_SCAN', NULL, 'a0000003-0000-0000-0000-000000000002', 'RIB',
  'b0000000-0000-0000-0000-000000000005',
  -1.9706, 30.1328, 'Kigali International Airport',
  'TOP_SECRET', TRUE, TRUE,
  0.883, NULL,
  'Mukamana Goreth identified at Kigali International Airport departure terminal. Attempted travel to Dubai. Passport seized. NISS notified.',
  '2026-06-29 09:55:00+02'
),

-- EV4: NID_MANUAL — clean citizen, no criminal record (data discarded)
(
  'f0000000-0000-0000-0000-000000000004',
  'NID_MANUAL', NULL, 'a0000002-0000-0000-0000-000000000003', 'RNP',
  NULL, NULL, NULL, NULL,
  'UNCLASSIFIED', FALSE, FALSE,
  NULL, NULL,
  'Routine NID manual entry. Identity verified against NIDA. No criminal record found. Citizen data not retained per Law No. 058/2021.',
  '2026-06-29 09:10:00+02'
),

-- EV5: CCTV_NODE — Eric Ndayambaje at Nyabugogo Bus Terminal (WANTED, Threat 4)
(
  'f0000000-0000-0000-0000-000000000005',
  'CCTV_NODE', 'KGL-BUSPARK-01', NULL, 'RNP',
  'b0000000-0000-0000-0000-000000000010',
  -1.9490, 30.0578, 'Nyabugogo Bus Terminal, Bay 12',
  'TOP_SECRET', TRUE, TRUE,
  0.916, 'KGL-BUSPARK-01',
  'CCTV node detected Ndayambaje at Nyabugogo Bus Terminal. Active WANTED status. RNP dispatch notified.',
  '2026-06-29 08:30:00+02'
),

-- EV6: OFFICER_REPORT — Fidele Hakizimana sighted near Remera (ARRESTED)
(
  'f0000000-0000-0000-0000-000000000006',
  'OFFICER_REPORT', NULL, 'a0000003-0000-0000-0000-000000000002', 'RIB',
  'b0000000-0000-0000-0000-000000000007',
  NULL, NULL, NULL,
  'CONFIDENTIAL', TRUE, TRUE,
  NULL, NULL,
  'Suspect sighted near Remera market, appeared to recognize patrol officers and moved away quickly. Manual report submitted by RIB investigator.',
  '2026-06-28 18:14:00+02'
),

-- EV7: INTERPOL_FEED — Jean Niyongabo Red Notice ingestion (INTERPOL_FLAGGED, Threat 5)
(
  'f0000000-0000-0000-0000-000000000007',
  'INTERPOL_FEED', NULL, NULL, 'NISS',
  'b0000000-0000-0000-0000-000000000006',
  NULL, NULL, NULL,
  'TOP_SECRET', TRUE, TRUE,
  NULL, NULL,
  'Interpol Red Notice ingested — file DRC-2025-RN-00892 / A-5674/2-2025. Cross-border armed criminal. Linked to existing NISS profile.',
  '2026-06-28 16:00:00+02'
),

-- EV8: FACE_SCAN — Cécile Iradukunda probable match (ACTIVE, Threat 5), below threshold
(
  'f0000000-0000-0000-0000-000000000008',
  'FACE_SCAN', NULL, 'a0000001-0000-0000-0000-000000000003', 'NISS',
  'b0000000-0000-0000-0000-000000000012',
  NULL, NULL, NULL,
  'TOP_SECRET', TRUE, FALSE,
  0.754, NULL,
  'Probable match (confidence 75.4%) — manual verification requested. NISS surveillance operation at Kigali Serena Hotel.',
  '2026-06-28 12:30:00+02'
),

-- EV9: NID_SCAN — Clean citizen at checkpoint (no record, data discarded)
(
  'f0000000-0000-0000-0000-000000000009',
  'NID_SCAN', NULL, 'a0000002-0000-0000-0000-000000000006', 'RNP',
  NULL, NULL, NULL, NULL,
  'UNCLASSIFIED', FALSE, FALSE,
  NULL, NULL,
  'Clean citizen. NID checked, no record found. Data discarded per privacy policy (Law No. 058/2021).',
  '2026-06-28 10:00:00+02'
),

-- EV10: CCTV_NODE (+ Interpol link) — Jean Niyongabo at KGL Airport Arrivals
(
  'f0000000-0000-0000-0000-000000000010',
  'CCTV_NODE', 'KGL-AIRPORT-01', NULL, 'NISS',
  'b0000000-0000-0000-0000-000000000006',
  -1.9706, 30.1328, 'Kigali International Airport — Arrivals Hall',
  'TOP_SECRET', TRUE, TRUE,
  0.872, 'KGL-AIRPORT-01',
  'HIGH CONFIDENCE face match: Niyongabo Jean — Interpol Red Notice subject — at KGL Airport. Arrest coordinated with airport security.',
  '2026-06-28 07:22:00+02'
),

-- EV11: SYSTEM_ALERT — SIEM BULK_ENUMERATION triggered
(
  'f0000000-0000-0000-0000-000000000011',
  'SYSTEM_ALERT', NULL, NULL, 'NISS',
  NULL, NULL, NULL, NULL,
  'CONFIDENTIAL', FALSE, TRUE,
  NULL, NULL,
  'SIEM rule BULK_ENUMERATION triggered — 62 suspect queries in 9 minutes from session SESS-7A4F2. User temporarily rate-limited.',
  '2026-06-27 22:45:00+02'
),

-- EV12: NID_SCAN — Christine Uwimana at RCS intake (IN_CUSTODY)
(
  'f0000000-0000-0000-0000-000000000012',
  'NID_SCAN', NULL, 'a0000005-0000-0000-0000-000000000001', 'RCS',
  'b0000000-0000-0000-0000-000000000002',
  NULL, NULL, 'Mageragere Correctional Facility — Intake',
  'TOP_SECRET', TRUE, FALSE,
  1.0, NULL,
  'RCS intake identity verification for Uwimana Christine. NID scan confirmed match with IMS criminal record.',
  '2026-06-27 09:00:00+02'
),

-- EV13: PARTNER_QUERY — Uganda Police Force face query via NISS gateway
(
  'f0000000-0000-0000-0000-000000000013',
  'PARTNER_QUERY', 'UGA-CID', NULL, 'NISS',
  'b0000000-0000-0000-0000-000000000006',
  NULL, NULL, NULL,
  'CONFIDENTIAL', TRUE, FALSE,
  NULL, NULL,
  'Uganda Police Force face query — bilateral query under Rwanda-Uganda MOU. Confirmed match.',
  '2026-06-26 14:00:00+02'
),

-- EV14: CCTV_NODE — Alexis Mugisha POSSIBLE match at Musanze junction
(
  'f0000000-0000-0000-0000-000000000014',
  'CCTV_NODE', 'MSZ-JUNCTION-01', NULL, 'RNP',
  'b0000000-0000-0000-0000-000000000001',
  NULL, NULL, 'Musanze Junction Camera — Northern Road',
  'CONFIDENTIAL', TRUE, TRUE,
  0.791, 'MSZ-JUNCTION-01',
  'POSSIBLE match at Musanze junction camera. Confidence 0.791 — below PROBABLE threshold. Sent to human review queue. Location NOT transmitted.',
  '2026-06-25 20:18:00+02'
)

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6g. ALERTS
-- Fixed UUIDs: 50000000-0000-0000-0000-0000000000XX
-- ----------------------------------------------------------------------------
INSERT INTO public.alerts (
  id, intelligence_event_id, suspect_id, severity, source_tag,
  title, message, target_institutions, is_read, requires_action, suspect_name, created_at
)
VALUES

-- AL1: CRITICAL — WANTED suspect at Gatuna Border (CCTV)
(
  '50000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000009',
  'CRITICAL', 'CCTV_NODE',
  'WANTED Suspect Detected — Gatuna Border',
  'Vital Bizimungu (RWA-IMS-2025-00003) detected at Gatuna Border Post, GTN-BORDER-01. Confidence 94.1%. Threat Level 3.',
  ARRAY['RDF','RNP','NISS']::institution_type[],
  FALSE, TRUE, 'Vital Bizimungu',
  '2026-06-29 13:47:00+02'
),

-- AL2: CRITICAL — HIGH-THREAT suspect NID scan at Kigali
(
  '50000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  'CRITICAL', 'NID_SCAN',
  'HIGH-THREAT Suspect NID Check — Kigali',
  'Alexis Mugisha (RWA-IMS-2024-00001, Threat 5) confirmed via NID scan at Nyabugogo Checkpoint. Officer GPS captured.',
  ARRAY['RNP','NISS']::institution_type[],
  FALSE, TRUE, 'Alexis Mugisha',
  '2026-06-29 11:22:00+02'
),

-- AL3: HIGH — Face match at Airport, WANTED
(
  '50000000-0000-0000-0000-000000000003',
  'f0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000005',
  'HIGH', 'FACE_SCAN',
  'Face Match — Airport Arrivals (WANTED)',
  'Goreth Mukamana (RWA-IMS-2024-00003) matched at Kigali Airport, confidence 88.3%. RNP notified.',
  ARRAY['RIB','RNP','NISS']::institution_type[],
  FALSE, TRUE, 'Goreth Mukamana',
  '2026-06-29 09:55:00+02'
),

-- AL4: HIGH — WANTED suspect at Bus Terminal (CCTV)
(
  '50000000-0000-0000-0000-000000000004',
  'f0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000010',
  'HIGH', 'CCTV_NODE',
  'WANTED Suspect at Bus Terminal',
  'Eric Ndayambaje (RWA-IMS-2025-00004) detected at Nyabugogo Bus Terminal by KGL-BUSPARK-01. Confidence 91.6%.',
  ARRAY['RNP','NISS']::institution_type[],
  FALSE, TRUE, 'Eric Ndayambaje',
  '2026-06-29 08:30:00+02'
),

-- AL5: MEDIUM — Interpol Red Notice ingested (read)
(
  '50000000-0000-0000-0000-000000000005',
  'f0000000-0000-0000-0000-000000000007',
  'b0000000-0000-0000-0000-000000000006',
  'MEDIUM', 'INTERPOL_FEED',
  'Interpol Red Notice Ingested',
  'Jean Niyongabo (RWA-IMS-2025-00002, INTERPOL_FLAGGED) — Red Notice DRC-2025-RN-00892 automatically ingested via I-24/7 feed.',
  ARRAY['NISS']::institution_type[],
  TRUE, FALSE, 'Jean Niyongabo',
  '2026-06-28 16:00:00+02'
),

-- AL6: MEDIUM — SIEM Bulk Enumeration (read, requires action)
(
  '50000000-0000-0000-0000-000000000006',
  'f0000000-0000-0000-0000-000000000011',
  NULL,
  'MEDIUM', 'SYSTEM_ALERT',
  'SIEM: Bulk Enumeration Detected',
  'SIEM rule BULK_ENUMERATION triggered — 62 suspect queries in 9 minutes from session SESS-7A4F2. User temporarily rate-limited.',
  ARRAY['NISS']::institution_type[],
  TRUE, TRUE, NULL,
  '2026-06-27 22:45:00+02'
),

-- AL7: LOW — Camera node offline (read)
(
  '50000000-0000-0000-0000-000000000007',
  NULL, NULL,
  'LOW', 'SYSTEM_ALERT',
  'Camera Node Offline — RBV-BORDER-02',
  'No heartbeat received from RBV-BORDER-02 (Rubavu Border) for 12 minutes. RDF notified. Possible connectivity issue.',
  ARRAY['RDF','NISS']::institution_type[],
  TRUE, FALSE, NULL,
  '2026-06-27 14:30:00+02'
),

-- AL8: LOW — Officer report suspicious activity (read)
(
  '50000000-0000-0000-0000-000000000008',
  'f0000000-0000-0000-0000-000000000006',
  'b0000000-0000-0000-0000-000000000007',
  'LOW', 'OFFICER_REPORT',
  'Officer Report — Suspicious Activity',
  'Fidele Hakizimana sighted near Remera market by RIB officer. Suspect appeared to recognise officer. Manual report submitted.',
  ARRAY['RIB']::institution_type[],
  TRUE, FALSE, 'Fidele Hakizimana',
  '2026-06-28 18:14:00+02'
)

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6h. SIEM EVENTS
-- Fixed UUIDs: 60000000-0000-0000-0000-0000000000XX
-- ----------------------------------------------------------------------------
INSERT INTO public.siem_events (id, rule_name, severity, actor_id, actor_institution, description, auto_action, auto_actioned, reviewed, reviewed_by, reviewed_at, created_at)
VALUES

-- SE1: BULK_ENUMERATION — unreviewed (high priority)
(
  '60000000-0000-0000-0000-000000000001',
  'BULK_ENUMERATION', 'HIGH',
  'a0000002-0000-0000-0000-000000000004', 'RNP',
  '62 suspect queries in 9 minutes from session SESS-7A4F2 (badge RNP-DET-004)',
  'RATE_LIMIT + NISS_ALERT', TRUE,
  FALSE, NULL, NULL,
  '2026-06-27 22:45:00+02'
),

-- SE2: CAMERA_NODE_OFFLINE — reviewed
(
  '60000000-0000-0000-0000-000000000002',
  'CAMERA_NODE_OFFLINE', 'MEDIUM',
  NULL, NULL,
  'No heartbeat from RBV-BORDER-02 for >10 minutes',
  'NISS_ALERT + RDF_ALERT', TRUE,
  TRUE, 'a0000001-0000-0000-0000-000000000003', '2026-06-27 16:00:00+02',
  '2026-06-27 14:22:00+02'
),

-- SE3: OFF_HOURS_ACCESS — reviewed (no action)
(
  '60000000-0000-0000-0000-000000000003',
  'OFF_HOURS_ACCESS', 'MEDIUM',
  'a0000005-0000-0000-0000-000000000003', 'RCS',
  'Badge RCS-OFF-003 authenticated at 02:47 local time',
  'LOG + NISS_ALERT', FALSE,
  TRUE, 'a0000001-0000-0000-0000-000000000003', '2026-06-26 08:00:00+02',
  '2026-06-26 00:47:00+02'
),

-- SE4: MFA_BYPASS_ATTEMPT — unreviewed
(
  '60000000-0000-0000-0000-000000000004',
  'MFA_BYPASS_ATTEMPT', 'HIGH',
  'a0000001-0000-0000-0000-000000000003', 'NISS',
  '4 consecutive MFA failures from badge NISS-OFF-003 — possible compromise attempt',
  'LOCK_USER + NISS_ALERT', TRUE,
  FALSE, NULL, NULL,
  '2026-06-25 09:15:00+02'
),

-- SE5: BRUTE_FORCE — CRITICAL, reviewed
(
  '60000000-0000-0000-0000-000000000005',
  'BRUTE_FORCE', 'CRITICAL',
  'a0000002-0000-0000-0000-000000000001', 'RNP',
  '7 failed logins in 14 minutes targeting badge RNP-CMD-001',
  'LOCK_USER', TRUE,
  TRUE, 'a0000001-0000-0000-0000-000000000003', '2026-06-24 21:00:00+02',
  '2026-06-24 19:33:00+02'
),

-- SE6: LOCATION_OVERACCESS — unreviewed
(
  '60000000-0000-0000-0000-000000000006',
  'LOCATION_OVERACCESS', 'HIGH',
  'a0000003-0000-0000-0000-000000000004', 'RIB',
  '13 location record views in 45 minutes — badge RIB-ANA-004 exceeded threshold',
  'KILL_SESSION + NISS_ALERT', TRUE,
  FALSE, NULL, NULL,
  '2026-06-23 11:08:00+02'
)

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6i. CORRECTIONS RECORDS
-- Fixed UUIDs: 80000000-0000-0000-0000-0000000000XX
-- ----------------------------------------------------------------------------
INSERT INTO public.corrections_records (
  id, suspect_id, case_id,
  facility_name, cell_block, custody_status,
  intake_date, sentence_start, sentence_end, sentence_years,
  offense_description, court_name, next_review, release_date, threat_level, notes
)
VALUES

-- CR1: Christine Uwimana — PRE_TRIAL at Mageragere
(
  '80000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000002',
  'Mageragere', 'B-3', 'PRE_TRIAL',
  '2026-06-01 10:30:00+02', NULL, NULL, NULL,
  'Financial fraud — misappropriation of SACCO funds across 3 districts. Pre-trial detention pending court verdict.',
  'Tribunal de Grande Instance de Musanze',
  '2026-07-15', NULL, 3,
  'High-risk prisoner. Financial documents secured as evidence by RIB.'
),

-- CR2: Pierre Nsengiyumva — SENTENCED 20 years at Nyarugenge
(
  '80000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000005',
  'Nyarugenge', 'A-1', 'SENTENCED',
  '2024-01-20 09:00:00+02', '2024-01-20', '2049-01-20', 25,
  'Murder — first degree. Victim identified. Case fully closed.',
  'Tribunal de Grande Instance de Kigali',
  '2026-08-01', '2049-01-20', 4,
  'Medium security wing. Behaviour: cooperative. Annual review 2027.'
),

-- CR3: Théodore Karangwa — SENTENCED 25 years at Nyarugenge
(
  '80000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000011',
  NULL,
  'Nyarugenge', 'A-4', 'SENTENCED',
  '2023-06-10 08:00:00+02', '2023-06-10', '2048-06-10', 25,
  'Aggravated sexual assault (multiple counts). Convicted June 2023.',
  'Tribunal de Grande Instance de Kigali',
  '2026-09-10', '2048-06-10', 4,
  'Assessed as medium risk. No escape attempts. Annual review scheduled.'
),

-- CR4: Fidele Hakizimana — PRE_TRIAL at Mageragere (corruption)
(
  '80000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000007',
  'd0000000-0000-0000-0000-000000000006',
  'Mageragere', 'C-7', 'PRE_TRIAL',
  '2026-06-15 14:00:00+02', NULL, NULL, NULL,
  'Corruption — solicitation and receipt of bribes as public servant.',
  'Tribunal de Grande Instance de Kigali',
  '2026-07-10', NULL, 3,
  'Recent intake. First offence on record. RIB investigation active.'
),

-- CR5: Solange Uwera — RELEASED (served 3 years, robbery)
(
  '80000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000008',
  NULL,
  'Nyarugenge', 'B-8', 'RELEASED',
  '2024-10-01 08:00:00+02', '2024-10-01', '2027-10-01', 3,
  'Armed robbery — Remera sector, 2021. Sentence reduced for good conduct.',
  'Tribunal de Grande Instance de Kigali',
  '2026-07-05', '2026-03-01', 2,
  'Released March 2026. On conditional supervision for 12 months.'
)

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 6j. INTERNATIONAL PARTNERS
-- ----------------------------------------------------------------------------
INSERT INTO public.international_partners (id, country_code, country_name, flag_emoji, status, mou_includes_identity, mou_expires, recent_queries, active)
VALUES
  ('90000000-0000-0000-0000-000000000001', 'UGA', 'Uganda',                   '🇺🇬', 'ACTIVE', TRUE,  '2028-01-01', 3, TRUE),
  ('90000000-0000-0000-0000-000000000002', 'KEN', 'Kenya',                    '🇰🇪', 'ACTIVE', FALSE, '2027-06-30', 1, TRUE),
  ('90000000-0000-0000-0000-000000000003', 'COD', 'Democratic Republic of Congo','🇨🇩', 'ACTIVE', FALSE, '2026-12-31', 2, TRUE)
ON CONFLICT (country_code) DO NOTHING;


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Summary:
--   Extensions  : uuid-ossp, pgcrypto, pg_trgm
--   Enums       : 12 types (+ nid_method, crime_category, interpol_notice_color,
--                           revocation_scope; + CLEARED value for suspect_status)
--   Tables      : 22 tables
--                 Core (15): users, otp_verifications, user_sessions, suspects,
--                   warrants, cases, case_suspects, intelligence_events,
--                   location_records, corrections_records, camera_nodes,
--                   alerts, siem_events, audit_log, international_partners
--                 Added (7): nid_verifications, case_officers, interpol_notices,
--                   partner_queries, watchlists, watchlist_entries, access_revocations
--   Column upgrades (existing tables):
--                 users: totp_secret, fingerprint_template, fido2_credential_id,
--                   last_login_country, password_changed_at
--                 suspects: weight_kg, eye_color, mugshot_sha256
--                 international_partners: api_key_hash, tls_cert_hash, revoked, revoked_at
--   Indexes     : 30+ indexes
--   Triggers    : 6 functions — updated_at (4 tables), audit immutability,
--                 auto-location, location immutability, IMS reference generation
--   Functions   : log_audit_event() — audit helper for API layer
--   RLS         : Enabled on all 22 tables; anon denied; service_role bypasses
--   Seed users  : 27 across NISS, RNP, RIB, RDF, RCS, VILLAGE_LEADER
--   Seed suspects: 12 with fixed UUIDs
--   Seed warrants: 7 warrants
--   Seed cases  : 8 cases + 10 case-suspect links
--   Seed cameras: 10 camera nodes
--   Seed events : 14 intelligence events
--   Seed alerts : 8 alerts
--   Seed SIEM   : 6 events
--   Seed corrections: 5 records
--   Seed partners: 3 international partners
-- ============================================================================
