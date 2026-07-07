-- ============================================================
-- IMS v3.0 — Test Users Seed (bcrypt-verified hash)
-- Password for ALL accounts: IMS@Sample2026!
--
-- HOW TO USE IN SUPABASE SQL EDITOR:
--   Step 1: Run supabase_migration.sql  (creates all tables)
--   Step 2: Run THIS file               (sets correct passwords)
--
-- This script matches the schema in supabase_migration.sql where
-- the users table stores institution as an enum column (not a FK).
--
-- Safe to re-run: uses ON CONFLICT DO UPDATE.
-- ============================================================

-- Hash = bcrypt(IMS@Sample2026!, rounds=12), verified with bcryptjs
-- Run this AFTER supabase_migration.sql

INSERT INTO public.users (institution, role, clearance_level, badge_number, full_name, email, phone, password_hash, active)
VALUES
  -- NISS
  ('NISS', 'NISS_DIRECTOR',       'TOP_SECRET',   'NISS-DIR-001',  'Jean-Pierre Habimana',           'jp.habimana@niss.gov.rw',        '+250788100001', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('NISS', 'NISS_DIRECTOR',       'TOP_SECRET',   'NISS-DIR-002',  'Aimable Nzeyimana',              'a.nzeyimana@niss.gov.rw',        '+250788100002', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('NISS', 'NISS_OFFICER',        'TOP_SECRET',   'NISS-OFF-003',  'Claudine Mukasine',              'c.mukasine@niss.gov.rw',         '+250788100003', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('NISS', 'NISS_OFFICER',        'TOP_SECRET',   'NISS-OFF-004',  'Patrick Rwigamba',               'p.rwigamba@niss.gov.rw',         '+250788100004', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('NISS', 'SIEM_ANALYST',        'SECRET',       'NISS-SIEM-005', 'Diane Ingabire',                 'd.ingabire@niss.gov.rw',         '+250788100005', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  -- RNP
  ('RNP',  'RNP_COMMANDER',       'SECRET',       'RNP-CMD-001',   'Commissaire Bernard Nkurunziza', 'b.nkurunziza@rnp.gov.rw',        '+250788200001', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RNP',  'RNP_COMMANDER',       'SECRET',       'RNP-CMD-002',   'Commissaire Alice Mukamana',     'a.mukamana@rnp.gov.rw',          '+250788200002', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RNP',  'RNP_DETECTIVE',       'CONFIDENTIAL', 'RNP-DET-003',   'Inspecteur Théogène Bizimana',   't.bizimana@rnp.gov.rw',          '+250788200003', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RNP',  'RNP_DETECTIVE',       'CONFIDENTIAL', 'RNP-DET-004',   'Inspecteur Grace Uwimana',       'g.uwimana@rnp.gov.rw',           '+250788200004', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RNP',  'RNP_PATROL',          'CONFIDENTIAL', 'RNP-PAT-006',   'Agent Jacqueline Mukamurenzi',   'j.mukamurenzi@rnp.gov.rw',       '+250788200006', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RNP',  'RNP_PATROL',          'CONFIDENTIAL', 'RNP-PAT-007',   'Agent François Nzabonimpa',      'f.nzabonimpa@rnp.gov.rw',        '+250788200007', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RNP',  'RNP_PATROL',          'CONFIDENTIAL', 'RNP-PAT-008',   'Agent Solange Uwera',            's.uwera@rnp.gov.rw',             '+250788200008', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  -- RIB
  ('RIB',  'RIB_INVESTIGATOR',    'CONFIDENTIAL', 'RIB-INV-001',   'Investigateur Pascal Habimana',  'p.habimana@rib.gov.rw',          '+250788300001', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RIB',  'RIB_INVESTIGATOR',    'CONFIDENTIAL', 'RIB-INV-002',   'Investigatrice Rose Kayitesi',   'r.kayitesi@rib.gov.rw',          '+250788300002', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RIB',  'RIB_ANALYST',         'CONFIDENTIAL', 'RIB-ANA-004',   'Analyste Martine Uwiringiyimana','m.uwiringiyimana@rib.gov.rw',    '+250788300004', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  -- RDF
  ('RDF',  'RDF_COMMANDER',       'SECRET',       'RDF-CMD-001',   'Colonel Théophile Buregeya',     't.buregeya@rdf.mil.rw',          '+250788400001', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RDF',  'RDF_BORDER_OFFICER',  'CONFIDENTIAL', 'RDF-BOR-002',   'Officier Marie Nyiraneza',       'm.nyiraneza@rdf.gov.rw',         '+250788400002', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  -- RCS
  ('RCS',  'RCS_SUPERINTENDENT',  'CONFIDENTIAL', 'RCS-SUP-001',   'Surintendant Joseph Muvunyi',    'j.muvunyi@rcs.gov.rw',           '+250788500001', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE),
  ('RCS',  'RCS_OFFICER',         'CONFIDENTIAL', 'RCS-OFF-003',   'Agent Didier Rutagengwa',        'd.rutagengwa@rcs.gov.rw',        '+250788500003', '$2a$12$rKm34gBcONq1ihjqEAB21usqY0AceWxk7laq/D8UoKn1ax9Q8dLYa', TRUE)
ON CONFLICT (badge_number) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  active        = TRUE,
  locked        = FALSE,
  mfa_failures  = 0;
