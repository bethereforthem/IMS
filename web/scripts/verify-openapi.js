#!/usr/bin/env node
/**
 * verify-openapi.js — smoke-test GET /api/v1/openapi against a running dev server.
 *
 *   npm run dev            (in one terminal)
 *   node scripts/verify-openapi.js
 *
 * Mints an access JWT directly from JWT_SECRET (see .env.local) so no login is
 * needed, then checks the endpoint is auth-gated and returns a valid spec.
 */
const fs = require('fs')
const path = require('path')
const { SignJWT } = require('jose')

const BASE = process.env.BASE_URL || 'http://localhost:3000'

function loadEnv() {
  const file = path.resolve(__dirname, '..', '.env.local')
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

async function main() {
  const env = loadEnv()
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET not found in web/.env.local')

  const token = await new SignJWT({
    user_id: '00000000-0000-0000-0000-000000000001',
    badge_number: 'NISS-DIR-001',
    full_name: 'Spec Verifier',
    institution: 'NISS',
    role: 'NISS_DIRECTOR',
    clearance: 'TOP_SECRET',
    session_id: '00000000-0000-0000-0000-0000000000ff',
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(new TextEncoder().encode(env.JWT_SECRET))

  // 1. Unauthenticated must be rejected
  const anon = await fetch(`${BASE}/api/v1/openapi`)
  console.log(`no token        → ${anon.status} ${anon.status === 401 ? '✓ rejected' : '✗ EXPECTED 401'}`)

  // 2. Authenticated must return the spec
  const res = await fetch(`${BASE}/api/v1/openapi`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log(`with token      → ${res.status}`)
  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }

  const spec = await res.json()
  const paths = Object.keys(spec.paths ?? {})
  const ops = paths.reduce((n, p) => n + Object.keys(spec.paths[p]).length, 0)
  const withPerm = paths.reduce(
    (n, p) => n + Object.values(spec.paths[p]).filter(o => o['x-required-permission']).length,
    0
  )

  console.log(`\n  openapi       ${spec.openapi}`)
  console.log(`  title         ${spec.info?.title}`)
  console.log(`  paths         ${paths.length}`)
  console.log(`  operations    ${ops} (${withPerm} permission-gated)`)
  console.log(`  sample        GET /suspects → ${spec.paths['/suspects']?.get?.['x-required-permission']}`)

  if (spec.openapi !== '3.0.3' || paths.length === 0) {
    console.error('\n✗ spec looks malformed')
    process.exit(1)
  }
  console.log('\n✓ /api/v1/openapi serving a valid spec')
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
