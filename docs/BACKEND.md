# IMS v3.0 — Backend Reference

Classification: RESTRICTED — Authorized Personnel Only

---

## 1. Architecture Overview

```
Browser / Mobile
      │
      ▼
Next.js 14 (App Router)
├── /app/(dashboard)/**   ← Institution-scoped dashboards (RSC + client components)
├── /app/(auth)/login     ← Two-step email OTP login
└── /app/api/v1/**        ← API Routes (Edge-compatible, TypeScript)
           │
           ▼
     Supabase (PostgreSQL 15)
     ├── Row-Level Security (RLS) — institution + clearance gating
     ├── supabase-js v2 — server-side service role client
     ├── Supabase Auth — user management and refresh tokens
     └── Supabase Storage — suspect photos, document attachments
```

All business logic lives in `/app/api/v1/` Next.js API route handlers.
There is no separate backend server. Supabase is the only external service.

---

## 2. Auth Flow (Email OTP)

```
Client                          API Route                         Supabase / Email
  │                                 │                                    │
  │── POST /auth/login ────────────►│                                    │
  │   { badge_number, password }    │── verify credentials ─────────────►│
  │                                 │◄── user record ────────────────────│
  │                                 │── generate 6-digit OTP             │
  │                                 │── store OTP + session_token ───────►│ (db)
  │                                 │── send OTP email ──────────────────►│ (SMTP)
  │◄── 200 { session_token,         │                                    │
  │          user_name } ──────────│                                    │
  │                                 │                                    │
  │   [user reads email, enters OTP]│                                    │
  │                                 │                                    │
  │── POST /auth/verify-otp ───────►│                                    │
  │   { session_token, otp }        │── lookup + validate OTP ──────────►│
  │                                 │── invalidate OTP (one-time use)    │
  │                                 │── sign JWT (access + refresh) ─────│
  │◄── 200 { access_token,          │                                    │
  │          refresh_token } ───────│                                    │
  │                                 │                                    │
  │── GET /suspects (Bearer JWT) ──►│                                    │
  │                                 │── verify JWT, extract role/inst ───│
  │                                 │── Supabase query (RLS filters) ───►│
  │◄── 200 { suspects: [...] } ─────│◄── rows ───────────────────────────│
```

Access token TTL: **15 minutes**.
Refresh token TTL: **7 days** (rotated on each use).
OTP TTL: **10 minutes**, max **3 attempts** before session invalidation.
Rate limit on /auth/login: **5 requests / 5 minutes** per badge number.

---

## 3. Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | API base URL override (default `/api/v1`) | `https://ims.gov.rw/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | `https://abc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key | `eyJh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server only, never expose) | `eyJh...` |
| `JWT_SECRET` | Yes | Secret for signing IMS JWTs (min 32 chars) | `super-secret-...` |
| `JWT_ACCESS_TTL_SECONDS` | No | Access token TTL (default 900) | `900` |
| `JWT_REFRESH_TTL_DAYS` | No | Refresh token TTL in days (default 7) | `7` |
| `SMTP_HOST` | Yes | SMTP server for OTP emails | `smtp.gmail.com` |
| `SMTP_PORT` | Yes | SMTP port | `587` |
| `SMTP_USER` | Yes | SMTP username | `systemims35@gmail.com` |
| `SMTP_PASS` | Yes | SMTP password / app password | `...` |
| `SMTP_FROM` | No | From address (default SMTP_USER) | `IMS System <systemims35@gmail.com>` |
| `OTP_TTL_MINUTES` | No | OTP expiry in minutes (default 10) | `10` |
| `OTP_MAX_ATTEMPTS` | No | Max OTP attempts before invalidation (default 3) | `3` |
| `RATE_LIMIT_LOGIN_MAX` | No | Max login attempts per window (default 5) | `5` |
| `RATE_LIMIT_LOGIN_WINDOW_MS` | No | Rate limit window in ms (default 300000) | `300000` |
| `NODE_ENV` | No | Node environment | `production` |

Copy `.env.example` to `.env.local` and fill in all required values before starting the dev server.

---

## 4. Setup & Running

### Prerequisites
- Node.js 20+
- pnpm (preferred) or npm
- Supabase project (cloud or local via `supabase start`)

### Install

```bash
cd d:\InnovationHub\RCIMS\web
pnpm install
```

### Environment

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials, JWT secret, and SMTP config
```

### Run Supabase Migration

```bash
# If using Supabase CLI (local dev)
supabase db push

# Or apply the SQL migration directly in the Supabase dashboard SQL editor:
# Paste contents of supabase/migrations/001_initial_schema.sql
```

### Start Development Server

```bash
pnpm dev
# App runs at http://localhost:3000
# API available at http://localhost:3000/api/v1
```

### Build for Production

```bash
pnpm build
pnpm start
```

---

## 5. API Base URL and Authentication

Base URL: `/api/v1` (relative, served by Next.js)

All endpoints except `/auth/login` and `/auth/verify-otp` require:

```
Authorization: Bearer <access_token>
```

The access token is a signed JWT. API routes extract the role and institution
from the token payload and apply them as Supabase RLS context.

---

## 6. Permission Reference

| Role | View Suspects | Edit Suspects | View Cases | View Intelligence | View Location | SIEM | Admin |
|---|---|---|---|---|---|---|---|
| NISS_DIRECTOR | All | All | All | All | All | Yes | Yes |
| NISS_ANALYST | All | All (non-TOP_SECRET) | All | All | SECRET | Read | No |
| SIEM_ANALYST | No | No | No | No | No | Full | No |
| RNP_COMMANDER | RNP-scoped | RNP-scoped | RNP-scoped | RNP-scoped | CONFIDENTIAL | No | No |
| RNP_OFFICER | RNP-scoped | No | RNP-scoped | RNP-scoped | No | No | No |
| RIB_DIRECTOR | RIB-scoped | RIB-scoped | RIB-scoped | RIB-scoped | CONFIDENTIAL | No | No |
| RIB_INVESTIGATOR | RIB-scoped | No | RIB-scoped | RIB-scoped | No | No | No |
| RDF_COMMANDER | RDF-scoped | No | RDF-scoped | RDF-scoped | No | No | No |
| RCS_DIRECTOR | RCS-scoped | No | RCS-scoped | RCS-scoped | No | No | No |
| IRONDO_PATROL | WANTED only | No | No | No | No | No | No |
| DASSO_OFFICER | WANTED only | No | No | No | No | No | No |
| SYSTEM_ADMIN | No | No | No | No | No | Read | Infra |

Institution-scoping is enforced at the database layer via Supabase RLS policies —
it cannot be bypassed by API manipulation.

---

## 7. Testing the API — curl Examples

### Step 1: Login (request OTP)

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"badge_number": "NISS-DIR-001", "password": "s3cureP@ss!"}'

# Response:
# {
#   "session_token": "sess_abc123xyz",
#   "message": "OTP sent to your registered email address",
#   "user_name": "Jean-Pierre Habimana"
# }
```

### Step 2: Verify OTP

```bash
curl -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"session_token": "sess_abc123xyz", "otp": "482913"}'

# Response:
# {
#   "access_token": "eyJhbGci...",
#   "refresh_token": "rt_7d_...",
#   "token_type": "bearer",
#   "expires_in": 900
# }
```

### Get suspects (authenticated)

```bash
TOKEN="eyJhbGci..."

curl http://localhost:3000/api/v1/suspects?status=WANTED \
  -H "Authorization: Bearer $TOKEN"

# Response:
# {
#   "suspects": [...],
#   "pagination": { "total": 84, "page": 1, "page_size": 20, "pages": 5 }
# }
```

### Refresh token

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "rt_7d_..."}'
```

### Mark alert as read

```bash
curl -X PATCH http://localhost:3000/api/v1/alerts/ALERT_UUID/read \
  -H "Authorization: Bearer $TOKEN"
```

---

## 8. Adding a New API Route

All API routes live in `web/src/app/api/v1/`. Follow this template:

```
web/src/app/api/v1/
└── my-resource/
    ├── route.ts          ← GET (list), POST (create)
    └── [id]/
        └── route.ts      ← GET (single), PATCH (update), DELETE
```

**Template — `route.ts`:**

```typescript
// web/src/app/api/v1/my-resource/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyJwt, requireRole } from '@/lib/auth/jwt'
import { auditLog } from '@/lib/audit'

export async function GET(req: NextRequest) {
  // 1. Verify auth
  const payload = await verifyJwt(req)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Check role (optional — RLS enforces institution scoping anyway)
  const roleError = requireRole(payload, ['NISS_DIRECTOR', 'RNP_COMMANDER'])
  if (roleError) return roleError

  // 3. Query Supabase (RLS automatically scopes to institution)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('my_resource')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. Audit log (for sensitive reads)
  await auditLog({ actor: payload, action: 'MY_RESOURCE_LISTED' })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const payload = await verifyJwt(req)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  // validate body here...

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('my_resource')
    .insert({ ...body, created_by: payload.sub })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await auditLog({ actor: payload, action: 'MY_RESOURCE_CREATED', resourceId: data.id })

  return NextResponse.json(data, { status: 201 })
}
```

---

## 9. Database Schema Overview

All tables are in the `public` schema. RLS is enabled on every table.

| Table | Purpose |
|---|---|
| `users` | Officer accounts (badge_number, role, institution, clearance_level, email) |
| `otp_sessions` | Short-lived OTP session tokens (TTL enforced via `expires_at`) |
| `refresh_tokens` | Refresh token store (one-time use, rotated on each refresh) |
| `suspects` | Suspect profiles with clearance classification |
| `suspect_aliases` | Alternative names / aliases linked to suspects |
| `warrants` | Arrest, search, detention, and extradition warrants |
| `cases` | Investigation cases |
| `case_suspects` | Many-to-many link between cases and suspects |
| `intelligence_events` | Field intelligence reports from officers, DIV app, edge nodes |
| `alerts` | System and intelligence alerts (institution-scoped) |
| `location_records` | Suspect geolocation data (clearance-gated by RLS) |
| `camera_nodes` | CCTV and surveillance camera node registry |
| `corrections_records` | Detention, transfer, and release records |
| `siem_events` | Security event log (NISS/SIEM_ANALYST access only) |
| `audit_log` | Immutable audit trail of all sensitive actions |
| `partners` | International law enforcement partner directory |

### Key RLS Patterns

**Institution scoping** (applied to most tables):
```sql
CREATE POLICY "institution_scope" ON suspects
  FOR SELECT USING (
    institution_of_record = current_setting('app.institution')::institution
    OR current_setting('app.role') LIKE 'NISS%'
  );
```

**Clearance gating** (applied to suspects, location_records):
```sql
CREATE POLICY "clearance_gate" ON suspects
  FOR SELECT USING (
    clearance_level <= current_setting('app.clearance_level')::clearance_level
    OR current_setting('app.role') = 'NISS_DIRECTOR'
  );
```

The API route sets `app.institution`, `app.role`, and `app.clearance_level` as
Supabase session variables after verifying the JWT.

---

## 10. Running the Supabase Migration

### Option A — Supabase CLI (recommended for local dev)

```bash
# Install CLI
npm install -g supabase

# Start local Supabase stack (Docker required)
supabase start

# Link to your cloud project
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push

# Or run a specific migration
supabase db reset  # resets local DB and re-runs all migrations
```

### Option B — SQL Editor (cloud dashboard)

1. Open your Supabase project at https://app.supabase.com
2. Go to **SQL Editor**
3. Open `supabase/migrations/001_initial_schema.sql`
4. Click **Run**
5. Verify tables appear in the **Table Editor**

### Option C — psql direct

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/migrations/001_initial_schema.sql
```

### After Migration

Enable RLS on all tables (if not already in the migration):
```sql
ALTER TABLE suspects ENABLE ROW LEVEL SECURITY;
-- repeat for each table
```

Seed initial NISS Director account:
```bash
pnpm tsx scripts/seed-admin.ts
```

---

*Last updated: 2026-06-30*
*IMS System Administration — systemims35@gmail.com*
