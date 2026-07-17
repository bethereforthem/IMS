// Verify global search + enriched suspect detail through the live API
const { createClient } = require('@supabase/supabase-js')
const { SignJWT } = require('jose')
const crypto = require('crypto')

const API = 'http://localhost:3000/api/v1'
const { JWT_SECRET, SERVICE_ROLE_KEY } = require('./env')
const db = createClient(
  'https://euifbienxyqhgeqapajd.supabase.co',
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

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
const get = async (t, p) => {
  const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${t}` } })
  return { status: r.status, body: await r.json().catch(() => null) }
}

async function main() {
  const rib = await mint('RIB-INV-001')
  const rcs = await mint('RCS-SUP-001')
  const rdf = await mint('RDF-CMD-001')

  // name search
  let r = await get(rib, '/search?q=Niyonzima')
  console.log('search "Niyonzima":', r.status, '→ suspects:', r.body.suspects.map(s => s.full_name).join(', '), '| cases:', r.body.cases.length)

  // case search by title word
  r = await get(rib, '/search?q=forex')
  console.log('search "forex": suspects:', r.body.suspects.length, '| cases:', r.body.cases.map(c => c.case_reference).join(', '))

  // IMS reference search
  r = await get(rib, '/search?q=RWA-IMS-2026-00015')
  console.log('search by IMS ref:', r.body.suspects.map(s => `${s.full_name} (${s.ims_reference})`).join(', ') || 'none')

  // RCS user (no cases:read? RCS_SUPERINTENDENT has cases:read) — scoped to RCS cases
  r = await get(rcs, '/search?q=trafficking')
  console.log('RCS search "trafficking": suspects:', r.body.suspects.length, '| cases (RCS-scoped):', r.body.cases.length)

  // RDF searches suspects fine
  r = await get(rdf, '/search?q=Bizimana')
  console.log('RDF search "Bizimana": suspects:', r.body.suspects.map(s => s.full_name).join(', '))

  // enriched suspect detail — pick the forex robbery suspect (has warrant? maybe not, but linked case)
  const s1 = (await get(rib, '/search?q=Bizimana')).body.suspects[0]
  const detail = (await get(rib, `/suspects/${s1.id}`)).body
  console.log(`\nsuspect detail: ${detail.full_name} [${detail.status}]`)
  console.log('  linked_cases:', (detail.linked_cases ?? []).map(c => c.case_reference).join(', ') || 'none')
  console.log('  warrants:', (detail.warrants ?? []).length, '| custody records:', (detail.corrections_records ?? []).length)

  // custody-linked suspect
  const s2 = (await get(rib, '/search?q=Jean Bosco')).body.suspects[0]
  const d2 = (await get(rib, `/suspects/${s2.id}`)).body
  console.log(`suspect detail: ${d2.full_name} [${d2.status}] — custody: ${(d2.corrections_records ?? []).map(c => c.facility_name).join(', ') || 'none'}, cases: ${(d2.linked_cases ?? []).length}`)

  // short query returns empty
  r = await get(rib, '/search?q=a')
  console.log('\nshort query guard: suspects', r.body.suspects.length, 'cases', r.body.cases.length)
}
main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1) })
