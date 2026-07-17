// Verify: reports exist + RNP/NISS cross-institution visibility
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
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`)
  return r.json()
}

async function main() {
  const rnp = await mint('RNP-CMD-001')
  const niss = await mint('NISS-DIR-001')
  const rib = await mint('RIB-INV-001')

  // RNP sees RIB cases now
  const rnpCases = await get(rnp, '/cases?page_size=200')
  const ribVisible = rnpCases.cases.filter(c => c.lead_institution === 'RIB').length
  console.log(`RNP view: total=${rnpCases.total}, RIB cases visible=${ribVisible}`)

  // NISS sees everything
  const nissCases = await get(niss, '/cases?page_size=200')
  console.log(`NISS view: total=${nissCases.total}`)

  // Report content — pick a seeded case
  const target = rnpCases.cases.find(c => c.title.startsWith('Armed robbery of forex bureau'))
  const report = await get(niss, `/cases/${target.id}/report`)
  const d = report.report_data
  console.log(`\nreport for ${target.case_reference} (${report.status}):`)
  console.log('  victims:', d.victims.map(v => v.full_name).join(', '))
  console.log('  suspects:', d.suspects.map(s => s.full_name).join(', '))
  console.log('  witnesses:', d.witnesses.map(w => w.full_name).join(', '))
  console.log('  crime_info:', d.crime_info.date_of_crime, d.crime_info.province, '/', d.crime_info.district, '/', d.crime_info.sector)
  console.log('  exhibits:', d.exhibits.map(e => `${e.number} ${e.name}`).join('; '))
  console.log('  investigators:', d.investigators.map(i => i.name).join(', '))
  console.log('  documents:', Object.keys(d.documents).join(', '))
  console.log('  charge:', d.charge_summary.slice(0, 90) + '…')

  // RNP can also read the report (cases:read)
  const rnpReport = await get(rnp, `/cases/${target.id}/report`)
  console.log('\nRNP can read report:', !!rnpReport.report_data)

  // total reports
  const { count } = await db.from('investigation_reports').select('*', { count: 'exact', head: true })
  console.log('investigation_reports rows:', count)

  // RIB user still sees own cases
  const ribCases = await get(rib, '/cases?page_size=200')
  console.log('RIB view total:', ribCases.total)
}
main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1) })
