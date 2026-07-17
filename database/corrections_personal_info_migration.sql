-- ============================================================================
-- Corrections personal-info migration (extracted from supabase_migration.sql)
-- Run this ONCE in the Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- After running it, re-run:  node web/scripts/seed-inmates-full.js
-- to upgrade existing custody records with the full-form personal data.
-- ============================================================================

ALTER TABLE public.corrections_records
  ADD COLUMN IF NOT EXISTS father_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mother_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sex                  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS place_of_birth       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS residential_address  TEXT,
  ADD COLUMN IF NOT EXISTS domicile_address     TEXT,
  ADD COLUMN IF NOT EXISTS phone_number         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email                VARCHAR(255),
  ADD COLUMN IF NOT EXISTS national_id          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS marital_status       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS profession           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS properties_owned     TEXT,
  ADD COLUMN IF NOT EXISTS health_status        TEXT,
  ADD COLUMN IF NOT EXISTS education_level      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS children_count       INTEGER,
  ADD COLUMN IF NOT EXISTS alternative_contact  TEXT,
  ADD COLUMN IF NOT EXISTS party_status         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS passport_photo_url   TEXT;

ALTER TABLE public.corrections_records
  ADD COLUMN IF NOT EXISTS presiding_judge      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS verdict_date         DATE,
  ADD COLUMN IF NOT EXISTS sentence_type        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS court_conclusion     TEXT;

ALTER TABLE public.corrections_records
  ADD COLUMN IF NOT EXISTS visitor_log          JSONB NOT NULL DEFAULT '[]'::jsonb;
