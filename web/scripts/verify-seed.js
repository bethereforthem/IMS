// Verify seeded data is served correctly through the real authenticated APIs
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
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT({
    user_id: u.id, badge_number: u.badge_number, full_name: u.full_name,
    institution: u.institution, role: u.role, clearance: u.clearance_level,
    session_id: crypto.randomUUID(), type: 'access', has_accepted_policies: true,
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600).sign(secret)
}

async function get(token, path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${await r.text()}`)
  return r.json()
}

async function main() {
  const rib = await mint('RIB-INV-001')
  const rcs = await mint('RCS-SUP-001')
  const niss = await mint('NISS-DIR-001')

  const stats = await get(niss, '/dashboard/stats')
  console.log('dashboard/stats:', JSON.stringify(stats))

  const cases = await get(rib, '/cases?page_size=200')
  const byStatus = {}
  for (const c of cases.cases) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
  console.log(`\ncases (RIB view): total=${cases.total}`, byStatus)
  console.log('sample:', cases.cases[0].case_reference, '|', cases.cases[0].title, '|', cases.cases[0].category)

  const caseDetail = await get(rib, `/cases/${cases.cases[0].id}`)
  console.log('case detail suspects linked:', (caseDetail.suspects ?? []).map(s => s.full_name).join(', ') || '(none)')

  const suspects = await get(rib, '/suspects?page_size=200')
  console.log(`\nsuspects: total=${suspects.total}`)

  const team = await get(rib, '/team')
  console.log('\nteam:', team.members.map(m => `${m.badge_number}(${m.active_cases} cases)`).join(', '))
  console.log('total open RIB cases:', team.total_open_cases)

  const corr = await get(rcs, '/corrections?page_size=100')
  console.log(`\ncorrections: total=${corr.total}`)
  const withReview = corr.records.filter(r => r.next_review)
  console.log('records with next_review (bug fix check):', withReview.length)
  console.log('sample inmate:', corr.records[0].full_name, '|', corr.records[0].facility, '|', corr.records[0].status, '| review:', corr.records[0].next_review)

  const audit = await get(niss, '/audit?limit=5')
  console.log(`\naudit entries: total=${audit.total} — latest: ${audit.entries[0]?.event_type} by ${audit.entries[0]?.actor_badge}`)
}

main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1) })
