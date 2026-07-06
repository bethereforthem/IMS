-- ============================================================================
-- Admin Portal & Intrusion Detection System Migration
-- Run after agent_availability_migration.sql
-- ============================================================================

-- ── Extend user_sessions with monitoring columns ──────────────────────────────
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS ip_address     TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS user_agent     TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS device_type    TEXT;  -- DESKTOP | MOBILE | TABLET
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS browser        TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS os             TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS country_code   TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS country_name   TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS city           TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS latitude       DECIMAL(10,7);
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS longitude      DECIMAL(10,7);
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS is_vpn         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS is_proxy       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS isp            TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS current_page   TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW();

-- Denormalize user info onto sessions for fast admin queries
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS full_name      TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS badge_number   TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS institution    TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS role           TEXT;

CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON public.user_sessions(expires_at, revoked) WHERE revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_user_sessions_institution
  ON public.user_sessions(institution, last_active_at DESC NULLS LAST);

-- ── login_attempts ────────────────────────────────────────────────────────────
-- Immutable record of every login attempt (success and failure).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  badge_number    TEXT          NOT NULL,
  success         BOOLEAN       NOT NULL,
  ip_address      TEXT,
  user_agent      TEXT,
  device_type     TEXT,
  browser         TEXT,
  os              TEXT,
  country_code    TEXT,
  country_name    TEXT,
  city            TEXT,
  latitude        DECIMAL(10,7),
  longitude       DECIMAL(10,7),
  is_vpn          BOOLEAN       NOT NULL DEFAULT FALSE,
  is_proxy        BOOLEAN       NOT NULL DEFAULT FALSE,
  isp             TEXT,
  failure_reason  TEXT          CHECK (failure_reason IN (
                    'UNKNOWN_BADGE', 'INVALID_PASSWORD', 'ACCOUNT_LOCKED',
                    'ACCOUNT_INACTIVE', 'SERVER_ERROR'
                  )),
  full_name       TEXT,
  institution     TEXT,
  role            TEXT,
  attempted_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user
  ON public.login_attempts(user_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON public.login_attempts(ip_address, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_date
  ON public.login_attempts(attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_failed
  ON public.login_attempts(badge_number, success, attempted_at DESC);

-- ── page_visits ───────────────────────────────────────────────────────────────
-- Lightweight page visit tracking for admin monitoring.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.page_visits (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id       UUID        REFERENCES public.user_sessions(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  badge_number     TEXT,
  institution      TEXT,
  role             TEXT,
  page_path        TEXT        NOT NULL,
  page_title       TEXT,
  entered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at          TIMESTAMPTZ,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_page_visits_session
  ON public.page_visits(session_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_visits_user
  ON public.page_visits(user_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_visits_date
  ON public.page_visits(entered_at DESC);

-- ── security_incidents ────────────────────────────────────────────────────────
-- Intrusion Detection System events.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_type     TEXT        NOT NULL CHECK (incident_type IN (
                      'ACCESS_OUTSIDE_RWANDA', 'VPN_DETECTED', 'PROXY_DETECTED',
                      'MULTIPLE_FAILED_LOGINS', 'IMPOSSIBLE_TRAVEL',
                      'UNUSUAL_HOUR_ACCESS', 'MASS_DATA_ACCESS',
                      'PRIVILEGE_ESCALATION', 'CREDENTIAL_STUFFING',
                      'SUSPICIOUS_LOCATION'
                    )),
  severity          TEXT        NOT NULL DEFAULT 'HIGH'
                      CHECK (severity IN ('MEDIUM', 'HIGH', 'CRITICAL')),
  user_id           UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  session_id        UUID        REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  badge_number      TEXT,
  full_name         TEXT,
  institution       TEXT,
  ip_address        TEXT,
  country_code      TEXT,
  country_name      TEXT,
  city              TEXT,
  description       TEXT        NOT NULL,
  raw_data          JSONB,
  auto_blocked      BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved          BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  resolution_notes  TEXT,
  alert_id          UUID        REFERENCES public.alerts(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_unresolved
  ON public.security_incidents(resolved, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_user
  ON public.security_incidents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_incidents_type
  ON public.security_incidents(incident_type, created_at DESC);

-- ── system_controls ───────────────────────────────────────────────────────────
-- Key-value store for system-wide control flags.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_controls (
  key           TEXT          PRIMARY KEY,
  value         TEXT          NOT NULL,
  description   TEXT,
  set_by        UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  set_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO public.system_controls (key, value, description) VALUES
  ('system_locked',          'false', 'Complete system lockdown — all non-admin access blocked'),
  ('institution_lockdowns',  '{}',    'JSON object: institution → ISO timestamp when locked'),
  ('disabled_services',      '[]',    'JSON array of disabled service keys')
ON CONFLICT (key) DO NOTHING;

-- ── IDS helper: index on users for failed login counting ─────────────────────
CREATE INDEX IF NOT EXISTS idx_users_mfa_failures
  ON public.users(mfa_failures DESC NULLS LAST) WHERE active = TRUE;
