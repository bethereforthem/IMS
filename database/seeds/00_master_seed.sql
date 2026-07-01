-- ============================================================
-- IMS v3.0 — Master Seed Loader
-- Run this file to load ALL sample data in dependency order.
-- Requires: schema.sql and rls_policies.sql already applied.
-- ============================================================

-- Step 0: Ensure pgcrypto available (needed for crypt() in seed_users.sql)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\echo '>> [1/5] Loading institutions...'
\i /docker-entrypoint-initdb.d/03_seed_roles.sql

\echo '>> [2/5] Loading sample users...'
\i /docker-entrypoint-initdb.d/04_seed_users.sql

\echo '>> [3/5] Loading sample suspects...'
\i /docker-entrypoint-initdb.d/05_seed_suspects.sql

\echo '>> [4/5] Loading cases, warrants, case links...'
\i /docker-entrypoint-initdb.d/06_seed_cases.sql

\echo '>> [5/5] Loading infrastructure (cameras, Interpol, corrections, watchlists, SIEM)...'
\i /docker-entrypoint-initdb.d/07_seed_infrastructure.sql

\echo '>> [6/6] Loading intelligence events, NID verifications, alerts...'
\i /docker-entrypoint-initdb.d/08_seed_intelligence.sql

\echo '>> ✓ All sample data loaded. IMS v3.0 database ready.'
