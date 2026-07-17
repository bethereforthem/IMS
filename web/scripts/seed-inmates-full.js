/**
 * Full-form RCS inmate registration + linkage seeding.
 *
 * - Assigns National IDs (SHA-256 hashed on suspects.national_id_hash;
 *   plaintext mapping saved to scripts/seed-nids.json for testing search)
 * - Registers 8 new inmates via the real RCS API with the COMPLETE intake
 *   form (personal info + court conclusion where sentenced)
 * - Adds historical imprisonments (multiple custody spells per suspect)
 * - Links several suspects to multiple cases
 * - UPGRADE MODE: when the corrections personal-info migration has been
 *   applied (database/corrections_personal_info_migration.sql), re-running
 *   this script fills the personal-info columns on ALL existing records.
 *
 * Run: node scripts/seed-inmates-full.js   (dev server on :3000)
 */
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

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

async function mint(badge) {
  const { data: u } = await db.from('users')
    .select('id, badge_number, full_name, institution, role, clearance_level')
    .eq('badge_number', badge).single()
  return new SignJWT({
    user_id: u.id, badge_number: u.badge_number, full_name: u.full_name,
    institution: u.institution, role: u.role, clearance: u.clearance_level,
    session_id: crypto.randomUUID(), type: 'access', has_accepted_policies: true,
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(JWT_SECRET))
}
async function apiCall(token, method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${JSON.stringify(j)}`)
  return j
}

// ── deterministic personal-info builder ──────────────────────────────────────
const FATHERS = ['Ntawukuriryayo', 'Gasana', 'Munyakazi', 'Rutaremara', 'Bagabo', 'Serugendo', 'Mutsinzi', 'Rwabukumba']
const MOTHERS = ['Nyirabagenzi', 'Mukandori', 'Uwamwiza', 'Nyiramatama', 'Mukansanga', 'Umuhoza', 'Nyirandegeya', 'Mukamusoni']
const SECTORS = ['Muhima', 'Gitega', 'Kimironko', 'Remera', 'Nyamirambo', 'Gikondo', 'Kacyiru', 'Kanombe']
const DISTRICTS = ['Nyarugenge', 'Gasabo', 'Kicukiro', 'Huye', 'Musanze', 'Rubavu', 'Muhanga', 'Nyagatare']
const PROFESSIONS = ['Trader', 'Farmer', 'Driver', 'Technician', 'Accountant', 'Mechanic', 'Shopkeeper', 'Tailor']
const FEMALE = /^(Chantal|Claudine|Divine|Espérance|Josiane|Vestine|Immaculée|Clarisse|Beatha|Solange|Pascaline|Sandrine|Médiatrice|Jacqueline|Angélique|Liliane|Sylvie|Rose|Martine|Alice|Grace|Odette|Diane|Henriette|Justine)/

function makeNid(idx, dob) {
  const year = dob ? dob.substring(0, 4) : '1985'
  const serial = String(1000000 + ((idx * 7919) % 8999999)).padStart(7, '0')
  return `1${year}8${serial}${idx % 10}${String(10 + (idx % 89))}` // 16 digits
}
function fmtNid(nid) {
  return `${nid[0]} ${nid.slice(1, 5)} ${nid[5]} ${nid.slice(6, 13)} ${nid[13]} ${nid.slice(14)}`
}

function buildPersonal(suspect, idx, nid) {
  const d = DISTRICTS[idx % DISTRICTS.length]
  const sex = FEMALE.test(suspect.first_name ?? suspect.full_name) ? 'F' : 'M'
  return {
    father_name: FATHERS[idx % FATHERS.length],
    mother_name: MOTHERS[idx % MOTHERS.length],
    sex,
    place_of_birth: d,
    residential_address: `${SECTORS[idx % SECTORS.length]} Sector, ${d} District`,
    domicile_address: `${SECTORS[(idx + 3) % SECTORS.length]} Sector, ${d} District`,
    phone_number: `+250 78${8 - (idx % 3)} ${String(100 + (idx * 7) % 900)} ${String(100 + (idx * 13) % 900)}`,
    email: '',
    national_id: fmtNid(nid),
    marital_status: idx % 3 === 0 ? 'Married' : 'Single',
    profession: PROFESSIONS[idx % PROFESSIONS.length],
    properties_owned: idx % 4 === 0 ? 'Residential plot, 1 motorcycle' : 'None declared',
    health_status: idx % 5 === 0 ? 'Chronic hypertension — on medication' : 'Stable',
    education_level: ['Primary', 'Secondary', 'University'][idx % 3],
    children_count: idx % 4,
    alternative_contact: `${MOTHERS[(idx + 2) % MOTHERS.length]} (mother) — +250 789 ${String(200 + idx)} ${String(300 + idx)}`,
    party_status: 'CONVICT/ACCUSED',
  }
}

// ── new full-form intakes: [name, facility, block, custody, intakeDaysAgo, years, court, offense, reviewDaysAhead, threat]
const NEW_INMATES = [
  ['Emmanuel Hakizimana',  'Nyarugenge Prison', 'C-Block', 'PRE_TRIAL', 12, null, 'Intermediate Court of Nyarugenge', 'SIM-swap mobile money fraud (RWF 87M)', 11, 3],
  ['Innocent Twagirayezu', 'Muhanga Prison',    'A-Block', 'PRE_TRIAL', 18, null, 'Intermediate Court of Muhanga',    'Soliciting bribes on public tender', 6, 2],
  ['Didier Mugisha',       'Mageragere Prison', 'D-Block', 'PRE_TRIAL', 25, null, 'High Court of Rwanda',             'Heroin trafficking (1.8kg, airport interception)', 9, 3],
  ['Aimé Turatsinze', 'Nyarugenge Prison', 'B-Block', 'SENTENCED', 95, 3,  'Intermediate Court of Kicukiro',   'Serial aggravated theft (motorbike gang)', 120, 2],
  ['Beatha Mukeshimana',   'Ngoma Prison',      'W-Block', 'PRE_TRIAL', 30, null, 'Intermediate Court of Nyagatare',  'Trafficking of minors for labor (Kagitumba)', 8, 3],
  ['Yves Kagabo',          'Nyarugenge Prison', 'C-Block', 'PRE_TRIAL', 15, null, 'Intermediate Court of Gasabo',     'ATM skimming and card fraud', 13, 2],
  ['Ignace Bimenyimana',   'Nyanza Prison',     'A-Block', 'SENTENCED', 70, 20,  'High Court of Rwanda',             'Child defilement', 300, 4],
  ['Ernest Maniraguha',    'Rubavu Prison',     'B-Block', 'PRE_TRIAL', 21, null, 'Intermediate Court of Rutsiro',    'Illegal mining causing endangerment', 10, 3],
]

// ── historical imprisonments: [name, facility, custody=RELEASED, intake, release, years, offense, court]
const HISTORY = [
  ['Jean Bosco Niyonzima', 'Rubavu Prison',     '2018-03-14', '2020-09-02', 2, 'Cannabis possession and distribution', 'Intermediate Court of Rubavu'],
  ['Théoneste Bizimana', 'Mageragere Prison', '2012-06-01', '2017-05-20', 5, 'Armed robbery', 'High Court of Rwanda'],
  ['Théoneste Bizimana', 'Nyarugenge Prison', '2019-02-10', '2021-02-08', 2, 'Aggravated assault', 'Intermediate Court of Nyarugenge'],
  ['Vincent Gatete',       'Musanze Prison',    '2010-08-15', '2013-08-10', 3, 'Robbery with violence', 'Intermediate Court of Musanze'],
  ['Faustin Ntaganda',     'Rubavu Prison',     '2015-01-20', '2017-01-15', 2, 'Highway robbery', 'Intermediate Court of Rubavu'],
  ['Faustin Ntaganda',     'Musanze Prison',    '2019-04-05', '2021-04-01', 2, 'Armed robbery (bus passengers)', 'Intermediate Court of Musanze'],
  ['Célestin Ndayisaba', 'Nyagatare Prison', '2014-11-01', '2016-10-25', 2, 'Cattle theft', 'Intermediate Court of Nyagatare'],
  ['Straton Nkurunziza',   'Musanze Prison',    '2017-07-12', '2019-07-05', 2, 'Illicit alcohol production', 'Intermediate Court of Gicumbi'],
  ['Deo Sibomana',         'Rusizi Prison',     '2008-05-30', '2011-05-22', 3, 'Aggravated assault', 'Intermediate Court of Rusizi'],
]

// ── extra case links: caseTitle → suspect names (multiple cases per suspect)
const EXTRA_LINKS = [
  ['Musanze bank van armed heist — follow-up', ['Théoneste Bizimana', 'Faustin Ntaganda']],
  ['Highway armed robbery gang — Kigali-Musanze road', ['Vincent Gatete']],
  ['Cross-border cannabis trafficking network — Rubavu corridor', ['Didier Mugisha']],
  ['Heroin courier interception — Kigali International Airport', ['Jean Bosco Niyonzima']],
  ['SIM-swap mobile money fraud syndicate', ['Yves Kagabo', 'Liliane Uwituze']],
  ['ATM skimming devices — Remera and Nyamirambo', ['Emmanuel Hakizimana']],
  ['Cooperative funds fraud — Rwamagana', ['Claudine Mukamana']],
  ['Kanyanga methanol poisoning network', ['Gilbert Semana']],
  ['Counterfeit currency distribution — Southern markets', ['Vestine Nyirahabimana']],
]

async function hasExtendedColumns() {
  const k = SERVICE_ROLE_KEY
  const r = await fetch('https://euifbienxyqhgeqapajd.supabase.co/rest/v1/', {
    headers: { apikey: k, Authorization: `Bearer ${k}`, 'User-Agent': 'node' },
  })
  const spec = await r.json()
  return 'father_name' in (spec.definitions.corrections_records?.properties ?? {})
}

async function main() {
  const extended = await hasExtendedColumns()
  console.log(`── corrections personal-info columns present: ${extended ? 'YES' : 'NO (run database/corrections_personal_info_migration.sql, then re-run this script)'}`)

  const rcsToken = await mint('RCS-SUP-001')
  const ribToken = await mint('RIB-INV-001')

  // 1. suspects + NID assignment
  const { data: suspects } = await db.from('suspects')
    .select('id, first_name, last_name, full_name, date_of_birth, national_id_hash, status, ims_reference')
    .order('created_at')
  const byName = new Map(suspects.map(s => [s.full_name, s]))

  console.log('── assigning National IDs …')
  const nidMap = []
  for (const [idx, s] of suspects.entries()) {
    const nid = makeNid(idx, s.date_of_birth)
    nidMap.push({ full_name: s.full_name, ims_reference: s.ims_reference, national_id: fmtNid(nid), _raw: nid, _idx: idx })
    if (!s.national_id_hash) {
      await db.from('suspects').update({ national_id_hash: sha256(nid) }).eq('id', s.id)
    }
  }
  fs.writeFileSync(
    path.join(__dirname, 'seed-nids.json'),
    JSON.stringify(nidMap.map(({ _raw, _idx, ...rest }) => rest), null, 2)
  )
  console.log(`   ${nidMap.length} NIDs assigned → scripts/seed-nids.json`)
  const nidOf = name => nidMap.find(n => n.full_name === name)
  const idxOf = name => nidOf(name)?._idx ?? 0
  const rawNidOf = name => nidOf(name)?._raw ?? makeNid(0, null)

  // 2. new full-form intakes
  console.log(`── registering ${NEW_INMATES.length} new inmates (full form) …`)
  const { data: existingRecs } = await db.from('corrections_records').select('id, suspect_id, intake_date')
  const hasIntake = (sid, date) => (existingRecs ?? []).some(r => r.suspect_id === sid && r.intake_date === date)

  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }
  const daysAhead = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }

  for (const [name, facility, block, custody, ago, years, court, offense, review, threat] of NEW_INMATES) {
    const s = byName.get(name)
    if (!s) { console.warn(`   ! suspect not found: ${name}`); continue }
    const intake = daysAgo(ago)
    if (hasIntake(s.id, intake)) { process.stdout.write(`\r   ${name}: exists, skipping        `); continue }
    const personal = buildPersonal(s, idxOf(name), rawNidOf(name))
    await apiCall(rcsToken, 'POST', '/corrections', {
      suspect_id: s.id, facility_name: facility, cell_block: block,
      custody_status: custody, intake_date: intake, sentence_years: years,
      court_name: court, offense_description: offense,
      next_review: daysAhead(review), threat_level: threat,
      ...personal,
      ...(custody === 'SENTENCED' ? {
        presiding_judge: ['Hon. Justice Mukantabana', 'Hon. Justice Rugege', 'Hon. Justice Kayitesi'][idxOf(name) % 3],
        verdict_date: daysAgo(ago + 4),
        sentence_type: 'Imprisonment',
        court_conclusion: `Found guilty as charged. Sentenced to ${years} years imprisonment.`,
      } : {}),
    })
    // suspect is now in custody
    await db.from('suspects').update({ status: 'IN_CUSTODY' }).eq('id', s.id).neq('status', 'CONVICTED')
    process.stdout.write(`\r   intake: ${name}                    `)
  }
  console.log()

  // 3. historical imprisonments (service-role insert — past records)
  console.log(`── adding ${HISTORY.length} historical imprisonment records …`)
  for (const [name, facility, intake, release, years, offense, court] of HISTORY) {
    const s = byName.get(name)
    if (!s) { console.warn(`   ! suspect not found: ${name}`); continue }
    if (hasIntake(s.id, intake)) { process.stdout.write(`\r   ${name} ${intake}: exists          `); continue }
    const end = new Date(intake); end.setFullYear(end.getFullYear() + years)
    const row = {
      suspect_id: s.id, facility_name: facility, cell_block: 'A-Block',
      custody_status: 'RELEASED', intake_date: intake, sentence_start: intake,
      sentence_years: years, sentence_end: end.toISOString().split('T')[0],
      release_date: release, actual_release_at: `${release}T09:00:00Z`,
      offense_description: offense, court_name: court, threat_level: 2,
      notes: 'Historical custody record — sentence served and released.',
      ...(extended ? {
        ...buildPersonal(s, idxOf(name), rawNidOf(name)),
        presiding_judge: 'Hon. Justice Rugege', verdict_date: intake,
        sentence_type: 'Imprisonment',
        court_conclusion: `Sentenced to ${years} years imprisonment. Released on completion.`,
      } : {}),
    }
    const { error } = await db.from('corrections_records').insert(row)
    if (error) throw new Error(`history insert ${name}: ${error.message}`)
    process.stdout.write(`\r   history: ${name} ${intake} → ${release}      `)
  }
  console.log()

  // 4. extra case links (multiple cases per suspect)
  console.log('── linking suspects to additional cases …')
  const { data: cases } = await db.from('cases').select('id, title')
  const caseByTitle = new Map(cases.map(c => [c.title, c.id]))
  let links = 0
  for (const [title, names] of EXTRA_LINKS) {
    const caseId = caseByTitle.get(title)
    if (!caseId) { console.warn(`   ! case not found: ${title}`); continue }
    for (const name of names) {
      const s = byName.get(name)
      if (!s) { console.warn(`   ! suspect not found: ${name}`); continue }
      await apiCall(ribToken, 'POST', `/cases/${caseId}/suspects`, { suspect_id: s.id, role: 'ACCOMPLICE' })
      links++
    }
  }
  console.log(`   ${links} case-suspect links ensured`)

  // 5. upgrade mode: fill personal info on records missing it
  if (extended) {
    console.log('── upgrading existing custody records with full personal info …')
    const { data: bare } = await db.from('corrections_records')
      .select('id, suspect_id, custody_status, sentence_years, intake_date')
      .is('father_name', null)
    let upgraded = 0
    for (const r of (bare ?? [])) {
      const s = suspects.find(x => x.id === r.suspect_id)
      if (!s) continue
      await apiCall(rcsToken, 'PATCH', `/corrections/${r.id}`, {
        ...buildPersonal(s, idxOf(s.full_name), rawNidOf(s.full_name)),
        ...(r.custody_status === 'SENTENCED' && r.sentence_years ? {
          presiding_judge: 'Hon. Justice Mukantabana',
          verdict_date: r.intake_date,
          sentence_type: 'Imprisonment',
          court_conclusion: `Found guilty as charged. Sentenced to ${r.sentence_years} years imprisonment.`,
        } : {}),
      })
      upgraded++
    }
    console.log(`   ${upgraded} records upgraded with personal info`)
  }

  const { count } = await db.from('corrections_records').select('*', { count: 'exact', head: true })
  console.log(`\n✔ done — corrections records total: ${count}`)
  if (!extended) {
    console.log('\n⚠ To store the FULL intake form (father/mother, addresses, NID, court conclusion):')
    console.log('  1. Run database/corrections_personal_info_migration.sql in the Supabase SQL Editor')
    console.log('  2. Re-run: node scripts/seed-inmates-full.js  (it will upgrade all records)')
  }
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
