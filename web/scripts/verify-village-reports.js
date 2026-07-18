/**
 * Verifies the village-report seeding end-to-end AS ANOTHER INSTITUTION (RIB):
 * name search, NID search, suspect 360° detail with community report + full
 * civil profile. Run: node scripts/verify-village-reports.js
 */
const { createClient } = require('@supabase/supabase-js')
const { SignJWT } = require('jose')
const crypto = require('crypto')
const { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function main() {
  const { data: u } = await db.from('users').select('*').eq('badge_number', 'RIB-INV-001').single()
  const secret = new TextEncoder().encode(JWT_SECRET)
  const token = await new SignJWT({
    user_id: u.id, badge_number: u.badge_number, full_name: u.full_name,
    institution: u.institution, role: u.role, clearance: u.clearance_level,
    session_id: crypto.randomUUID(), type: 'access', has_accepted_policies: true,
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600).sign(secret)

  const H = { Authorization: `Bearer ${token}` }

  let r = await fetch('http://localhost:3000/api/v1/search?q=Anastase%20Munyakazi', { headers: H })
  let j = await r.json()
  console.log('name search:', j.suspects.map(s => `${s.full_name} [${s.ims_reference}]`))

  const nids = require('./seed-village-nids.json')
  const nid = nids.find(n => n.name === 'Anastase Munyakazi').nid
  r = await fetch(`http://localhost:3000/api/v1/search?q=${encodeURIComponent(nid)}`, { headers: H })
  j = await r.json()
  console.log(`NID search (${nid}):`, j.suspects.map(s => `${s.full_name} [${s.ims_reference}]`))

  const id = j.suspects[0].id
  r = await fetch(`http://localhost:3000/api/v1/suspects/${id}`, { headers: H })
  const d = await r.json()
  console.log('detail:', d.full_name, '| dob:', d.date_of_birth, '| gender:', d.gender,
    '| nat:', d.nationality, '| inst:', d.owning_institution, '| ref:', d.ims_reference)
  console.log('community_reports:', d.community_reports.length)
  const cr = d.community_reports[0]
  console.log('report:', cr.insecurity_type, '| reporter:', cr.reporter && cr.reporter.full_name, '| at:', cr.reported_at)
  console.log('profile keys filled:', Object.entries(cr.person_profile).filter(([, v]) => v).length, '/ 20')
  console.log('profile sample:', JSON.stringify({
    father: cr.person_profile.father_name,
    id_masked: cr.person_profile.national_id_or_passport,
    address: cr.person_profile.residential_address,
    profession: cr.person_profile.profession,
    children: cr.person_profile.number_of_children,
  }))

  const { count } = await db.from('intelligence_events')
    .select('id', { count: 'exact', head: true })
    .eq('source_tag', 'OFFICER_REPORT').not('suspect_id', 'is', null)
  console.log('total linked community report events:', count)
  const { count: sc } = await db.from('suspects').select('id', { count: 'exact', head: true })
  console.log('total suspects in registry:', sc)
}

main().catch(e => { console.error(e); process.exit(1) })
