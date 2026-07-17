-- ============================================================================
-- RCIMS — Quick Login Fix
-- Run this ENTIRE script in the Supabase SQL Editor to fix authentication.
--
-- What it does:
--   1. Resets ALL user passwords to: Admin@IMS2026!
--   2. Unlocks all accounts
--   3. Creates / updates the SYS-ADM-001 super admin account
--   4. Creates the missing login_attempts table (required by auth route)
--   5. Creates the missing security_incidents table (required by IDS)
--
-- After running:
--   Badge: SYS-ADM-001        Password: Admin@IMS2026!    → /admin
--   Badge: RCS-SUP-001        Password: Admin@IMS2026!    → /rcs
--   Badge: NISS-DIR-001       Password: Admin@IMS2026!    → /niss
--   Badge: RNP-CMD-001        Password: Admin@IMS2026!    → /rnp
--   Badge: RIB-INV-001        Password: Admin@IMS2026!    → /rib
--   Badge: RDF-CMD-001        Password: Admin@IMS2026!    → /rdf
-- ============================================================================


-- ── STEP 1: Add missing column (safe if already exists) ───────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS has_accepted_policies BOOLEAN NOT NULL DEFAULT FALSE;


-- ── STEP 2: Reset ALL user passwords + unlock all accounts ───────────────────
-- Hash = bcrypt.hash('Admin@IMS2026!', 12)  (bcryptjs $2a$12$)
UPDATE public.users
SET
  password_hash         = '$2a$12$R5pMO0IqJBnOM6P9k/YHceUaeH8NddQxiZ5ZZ90sileD.g58Y6unO',
  locked                = FALSE,
  active                = TRUE,
  mfa_failures          = 0;


-- ── STEP 3: Create / update super admin account ───────────────────────────────
INSERT INTO public.users (
  institution, role, clearance_level,
  badge_number, full_name, email, phone,
  password_hash, active, locked, mfa_failures, has_accepted_policies
)
VALUES (
  'NISS', 'SYSTEM_ADMIN', 'TOP_SECRET',
  'SYS-ADM-001', 'System Administrator', 'sysadmin@rcims.gov.rw', '+250788000001',
  '$2a$12$R5pMO0IqJBnOM6P9k/YHceUaeH8NddQxiZ5ZZ90sileD.g58Y6unO',
  TRUE, FALSE, 0, FALSE
)
ON CONFLICT (badge_number) DO UPDATE
  SET password_hash         = '$2a$12$R5pMO0IqJBnOM6P9k/YHceUaeH8NddQxiZ5ZZ90sileD.g58Y6unO',
      active                = TRUE,
      locked                = FALSE,
      mfa_failures          = 0;


-- ── STEP 4: Create login_attempts table (auth route requires this) ────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  badge_number    VARCHAR(50)   NOT NULL,
  success         BOOLEAN       NOT NULL DEFAULT FALSE,
  failure_reason  VARCHAR(50),
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  device_type     VARCHAR(20),
  browser         VARCHAR(50),
  os              VARCHAR(50),
  country_code    VARCHAR(10),
  country_name    VARCHAR(100),
  city            VARCHAR(100),
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  is_vpn          BOOLEAN       DEFAULT FALSE,
  is_proxy        BOOLEAN       DEFAULT FALSE,
  isp             VARCHAR(200),
  full_name       VARCHAR(255),
  institution     VARCHAR(50),
  role            VARCHAR(50),
  attempted_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_badge
  ON public.login_attempts(badge_number, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON public.login_attempts(ip_address, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user
  ON public.login_attempts(user_id, attempted_at DESC);


-- ── STEP 5: Create security_incidents table (IDS / auth route requires this) ──
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_type   VARCHAR(100)  NOT NULL,
  severity        VARCHAR(20)   NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  user_id         UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  session_id      UUID,
  badge_number    VARCHAR(50),
  full_name       VARCHAR(255),
  institution     VARCHAR(50),
  ip_address      VARCHAR(45),
  country_code    VARCHAR(10),
  country_name    VARCHAR(100),
  city            VARCHAR(100),
  description     TEXT          NOT NULL,
  raw_data        JSONB,
  auto_blocked    BOOLEAN       NOT NULL DEFAULT FALSE,
  alert_id        UUID          REFERENCES public.alerts(id) ON DELETE SET NULL,
  resolved        BOOLEAN       NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_type
  ON public.security_incidents(incident_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_user
  ON public.security_incidents(user_id, created_at DESC);


-- ── STEP 6: RLS — allow service role full access (bypasses RLS by default, ────
--            but explicit policies prevent "no policy" errors)
ALTER TABLE public.login_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_login_attempts"
    ON public.login_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_security_incidents"
    ON public.security_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── DONE ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE '✅ Login fix complete. Default password for all accounts: Admin@IMS2026!';
  RAISE NOTICE '   SYS-ADM-001  →  /admin';
  RAISE NOTICE '   RCS-SUP-001  →  /rcs  (Surintendant Joseph Muvunyi)';
  RAISE NOTICE '   NISS-DIR-001 →  /niss';
  RAISE NOTICE '   RNP-CMD-001  →  /rnp';
END $$;
