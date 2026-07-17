// Verify NID search, clearance gating, multi-case + multi-imprisonment linkage
const fs = require('fs')
const path = require('path')
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
  const rib = await mint('RIB-INV-001')      // SECRET clearance
  const analyst = await mint('RIB-ANA-004')  // CONFIDENTIAL clearance
  const nids = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-nids.json'), 'utf8'))

  // 1. Search by National ID (formatted + digits-only)
  const bizimana = nids.find(n => n.full_name === 'Théoneste Bizimana')
  let r = await get(rib, `/search?q=${encodeURIComponent(bizimana.national_id)}`)
  console.log(`NID search (formatted "${bizimana.national_id}"):`, r.body.suspects.map(s => s.full_name).join(', ') || 'NONE')
  r = await get(rib, `/search?q=${bizimana.national_id.replace(/\s/g, '')}`)
  console.log('NID search (digits only):', r.body.suspects.map(s => s.full_name).join(', ') || 'NONE')

  // 2. Multi-case suspect
  const sid = r.body.suspects[0].id
  const detail = (await get(rib, `/suspects/${sid}`)).body
  console.log(`\n${detail.full_name} [${detail.status}] clearance=${detail.clearance_level}`)
  console.log('  cases:', detail.linked_cases.map(c => `${c.case_reference}(${c.status})`).join(', '))
  console.log('  imprisonments:', detail.corrections_records.map(c =>
    `${c.facility_name} ${c.intake_date}→${c.actual_release_at?.substring(0, 10) ?? 'present'} [${c.custody_status}]`).join(' | '))

  // 3. Multi-imprisonment: Faustin Ntaganda (2 past + 1 current)
  const fn = nids.find(n => n.full_name === 'Faustin Ntaganda')
  r = await get(rib, `/search?q=${fn.national_id.replace(/\s/g, '')}`)
  const fnDetail = (await get(rib, `/suspects/${r.body.suspects[0].id}`)).body
  console.log(`\n${fnDetail.full_name}: ${fnDetail.corrections_records.length} custody spells, ${fnDetail.linked_cases.length} cases`)
  for (const c of fnDetail.corrections_records.sort((a, b) => a.intake_date.localeCompare(b.intake_date))) {
    console.log(`   ${c.intake_date} → ${c.actual_release_at?.substring(0, 10) ?? 'present'} · ${c.facility_name} · ${c.custody_status} · ${c.offense_description ?? ''}`)
  }

  // 4. Clearance gate: CONFIDENTIAL analyst vs SECRET record (Bizimana is SECRET)
  r = await get(analyst, `/suspects/${sid}`)
  console.log(`\nCONFIDENTIAL analyst opening SECRET record → ${r.status}: ${r.body?.error ?? 'OK'}`)
  // analyst can still open CONFIDENTIAL records
  const conf = nids.find(n => n.full_name === 'Solange Uwera')
  const confSearch = await get(analyst, `/search?q=Solange`)
  r = await get(analyst, `/suspects/${confSearch.body.suspects[0].id}`)
  console.log(`CONFIDENTIAL analyst opening CONFIDENTIAL record → ${r.status} (${r.body?.full_name ?? r.body?.error})`)

  // 5. New inmate check (full form → core fields stored pre-migration)
  const rcs = await mint('RCS-SUP-001')
  const corr = await get(rcs, '/corrections?page_size=100')
  const emmanuel = corr.body.records.find(x => x.full_name === 'Emmanuel Hakizimana')
  console.log(`\nNew inmate record: ${emmanuel.full_name} @ ${emmanuel.facility} [${emmanuel.status}] review ${emmanuel.next_review}`)
  console.log(`corrections total: ${corr.body.total}`)
}
main().catch(e => { console.error('VERIFY FAILED:', e.message); process.exit(1) })
