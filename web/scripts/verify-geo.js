// Verify geo search + multi-waypoint routing proxies through the live API
const { createClient } = require('@supabase/supabase-js')
const { SignJWT } = require('jose')
const crypto = require('crypto')
const { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')

const API = 'http://localhost:3000/api/v1'
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function mint(badge) {
  const { data: u } = await db.from('users')
    .select('id, badge_number, full_name, institution, role, clearance_level')
    .eq('badge_number', badge).single()
  return new SignJWT({
    user_id: u.id, badge_number: u.badge_number, full_name: u.full_name,
    institution: u.institution, role: u.role, clearance: u.clearance_level,
    session_id: crypto.randomUUID(), type: 'access', has_accepted_policies: true,
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(new TextEncoder().encode(JWT_SECRET))
}

async function main() {
  const token = await mint('RNP-CMD-001')
  const h = { Authorization: `Bearer ${token}` }

  // 1. auth required
  let r = await fetch(`${API}/geo/search?q=Kigali`)
  console.log('unauthenticated search →', r.status, '(401 expected)')

  // 2. location search
  r = await fetch(`${API}/geo/search?q=Kigali Convention Centre`, { headers: h })
  let j = await r.json()
  console.log('search "Kigali Convention Centre" →', r.status, '| results:', j.results.length)
  if (j.results[0]) console.log('   top:', j.results[0].name.split(',').slice(0, 2).join(','), `(${j.results[0].lat.toFixed(4)}, ${j.results[0].lng.toFixed(4)})`)

  r = await fetch(`${API}/geo/search?q=Musanze`, { headers: h })
  j = await r.json()
  console.log('search "Musanze" → results:', j.results.length)

  // 3. multi-waypoint driving route: Kigali → Gakenke (stop) → Musanze
  const points = '30.0619,-1.9441;29.7877,-1.6863;29.6335,-1.4996'
  r = await fetch(`${API}/geo/route?points=${encodeURIComponent(points)}`, { headers: h })
  j = await r.json()
  if (!r.ok) { console.log('route FAILED:', r.status, j); process.exit(1) }
  console.log(`\nroute Kigali → Gakenke → Musanze:`)
  console.log(`   total: ${(j.distance_m / 1000).toFixed(1)} km · ${Math.round(j.duration_s / 60)} min`)
  console.log(`   legs: ${j.legs.map(l => `${(l.distance_m / 1000).toFixed(1)}km/${Math.round(l.duration_s / 60)}min`).join(' | ')}`)
  console.log(`   polyline points: ${j.coordinates.length} (first: ${j.coordinates[0]}, last: ${j.coordinates[j.coordinates.length - 1]})`)

  // 4. validation guards
  r = await fetch(`${API}/geo/route?points=30.06,-1.94`, { headers: h })
  console.log('\nsingle-point guard →', r.status, '(400 expected)')
  r = await fetch(`${API}/geo/route?points=abc,def;30.06,-1.94`, { headers: h })
  console.log('bad-coordinate guard →', r.status, '(400 expected)')
}
main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1) })
