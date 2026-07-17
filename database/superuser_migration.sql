-- ============================================================
-- RCIMS — Combined Super User Migration
-- Paste this entire script into the Supabase SQL Editor and
-- click "Run". It is safe to run multiple times (idempotent).
--
-- CREDENTIALS (same default for all accounts):
--   Badge Number : SYS-ADM-001
--   Password     : Admin@IMS2026!
--   Dashboard    : /admin
--
-- OTHER SEED ACCOUNTS also use Admin@IMS2026! as default password.
-- Examples: NISS-DIR-001, RCS-SUP-001, RNP-CMD-001, etc.
--
-- CHANGE ALL PASSWORDS IMMEDIATELY AFTER FIRST LOGIN.
--
-- Hash below is a bcryptjs $2a$12$ hash of "Admin@IMS2026!"
-- Generated with: bcrypt.hash('Admin@IMS2026!', 12)
-- ============================================================

-- Step 1: Add has_accepted_policies column if it doesn't exist yet
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS has_accepted_policies BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Create / update the super user account using a static bcryptjs-compatible hash
INSERT INTO public.users (
  institution,
  role,
  clearance_level,
  badge_number,
  full_name,
  email,
  phone,
  password_hash,
  active,
  locked,
  mfa_failures,
  has_accepted_policies
)
VALUES (
  'NISS',
  'SYSTEM_ADMIN',
  'TOP_SECRET',
  'SYS-ADM-001',
  'System Administrator',
  'sysadmin@rcims.gov.rw',
  '+250788000001',
  '$2a$12$R5pMO0IqJBnOM6P9k/YHceUaeH8NddQxiZ5ZZ90sileD.g58Y6unO',
  TRUE,
  FALSE,
  0,
  FALSE
)
ON CONFLICT (badge_number) DO UPDATE
  SET password_hash         = '$2a$12$R5pMO0IqJBnOM6P9k/YHceUaeH8NddQxiZ5ZZ90sileD.g58Y6unO',
      active                = TRUE,
      locked                = FALSE,
      mfa_failures          = 0,
      has_accepted_policies = FALSE;
