-- ============================================================================
-- Identity Verification Module Migration
-- Run after schema.sql
-- Adds comprehensive border/identity verification logging.
-- ============================================================================

-- ── border_verifications ─────────────────────────────────────────────────────
-- Complete audit trail for every document scan / manual entry at a border post.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.border_verifications (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Document info (extracted by OCR or entered manually)
  doc_type            TEXT          NOT NULL
                        CHECK (doc_type IN ('NATIONAL_ID','PASSPORT','REFUGEE_CARD','DRIVERS_LICENSE','OTHER')),
  doc_number          TEXT,                          -- passport / ID number
  full_name           TEXT,
  first_name          TEXT,
  last_name           TEXT,
  date_of_birth       DATE,
  nationality         TEXT,                          -- ISO 3166-1 alpha-3
  gender              CHAR(1),
  expiry_date         DATE,
  issuing_country     TEXT,
  issuing_authority   TEXT,
  mrz_line1           TEXT,                          -- raw MRZ for passports
  mrz_line2           TEXT,
  raw_ocr_text        TEXT,                          -- full OCR dump for audit

  -- Scan metadata
  scan_method         TEXT          NOT NULL DEFAULT 'MANUAL'
                        CHECK (scan_method IN ('OCR_AUTO','OCR_ASSISTED','MANUAL','QR_CODE','BARCODE')),
  ocr_confidence      DECIMAL(5,2),                  -- 0-100 Tesseract confidence
  scan_failed         BOOLEAN       NOT NULL DEFAULT FALSE,
  scan_failure_reason TEXT,

  -- IMS lookup results
  ims_suspect_id      UUID          REFERENCES public.suspects(id) ON DELETE SET NULL,
  suspect_match       BOOLEAN       NOT NULL DEFAULT FALSE,
  warrant_match       BOOLEAN       NOT NULL DEFAULT FALSE,
  watchlist_match     BOOLEAN       NOT NULL DEFAULT FALSE,
  interpol_match      BOOLEAN       NOT NULL DEFAULT FALSE,
  nida_verified       BOOLEAN,                       -- NULL = not checked

  -- Outcome
  verification_status TEXT          NOT NULL DEFAULT 'CLEAN'
                        CHECK (verification_status IN (
                          'CLEAN','FLAGGED','EXPIRED_DOC','SCAN_FAILED',
                          'MANUAL_REVIEW','DETAINED','CLEARED'
                        )),
  risk_level          TEXT          NOT NULL DEFAULT 'LOW'
                        CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  alert_id            UUID          REFERENCES public.alerts(id) ON DELETE SET NULL,
  notes               TEXT,

  -- Officer / device context
  officer_id          UUID          NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  badge_number        TEXT          NOT NULL,
  institution         TEXT          NOT NULL,
  device_type         TEXT,                          -- DESKTOP | MOBILE | TABLET
  device_info         TEXT,                          -- browser/OS string
  ip_address          TEXT,

  -- Location
  border_post         TEXT,                          -- e.g. "Gatuna", "Cyanika"
  location_lat        DECIMAL(10,7),
  location_lng        DECIMAL(10,7),

  -- Intelligence link
  intelligence_event_id UUID        REFERENCES public.intelligence_events(id) ON DELETE SET NULL,

  verified_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_border_verif_officer
  ON public.border_verifications(officer_id, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_border_verif_doc_number
  ON public.border_verifications(doc_number);

CREATE INDEX IF NOT EXISTS idx_border_verif_status
  ON public.border_verifications(verification_status, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_border_verif_flagged
  ON public.border_verifications(suspect_match, warrant_match, watchlist_match, verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_border_verif_timestamp
  ON public.border_verifications(verified_at DESC);
