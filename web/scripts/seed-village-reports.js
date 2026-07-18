/**
 * Seed script — 40 village-leader insecurity reports submitted through the
 * real POST /api/v1/patrol/report endpoint, so each person is registered in
 * the national suspects registry (NID-hash linked) exactly as production
 * would do it. Full 20-field civil profile filled for every person; reports
 * rotate across the four VL-00x village leaders and 30 districts, then
 * event timestamps are backdated over the last 45 days for dashboard history.
 *
 * Idempotent: people already in the registry (matched by NID hash) with an
 * existing community report are skipped.
 *
 * Requires the dev server on http://localhost:3000.
 * Run: node scripts/seed-village-reports.js
 */
const { createClient } = require('@supabase/supabase-js')
const { SignJWT } = require('jose')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const API = 'http://localhost:3000/api/v1'
const { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const VILLAGE_LEADERS = ['VL-001', 'VL-002', 'VL-003', 'VL-004']

// ── helpers ──────────────────────────────────────────────────────────────────
async function login(badge) {
  const { data: u, error } = await db.from('users')
    .select('id, badge_number, full_name, institution, role, clearance_level')
    .eq('badge_number', badge)
    .single()
  if (error || !u) throw new Error(`user ${badge} not found: ${error?.message}`)
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT({
    user_id: u.id,
    badge_number: u.badge_number,
    full_name: u.full_name,
    institution: u.institution,
    role: u.role,
    clearance: u.clearance_level,
    session_id: crypto.randomUUID(),
    type: 'access',
    has_accepted_policies: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(secret)
}

async function post(token, p, body) {
  const r = await fetch(`${API}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`POST ${p} -> ${r.status}: ${JSON.stringify(j)}`)
  return j
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

// Rwandan NID layout: 1 = citizen, birth year, gender digit (8 M / 7 F),
// 7-digit serial, issue no., 2 check digits — 16 digits total.
function makeNid(dob, sex, i) {
  const year = dob.slice(0, 4)
  const g = sex === 'Male' ? '8' : '7'
  const serial = String(1043200 + i * 7717).padStart(7, '0')
  const issue = '0'
  const check = String(23 + i).padStart(2, '0').slice(-2)
  return `1 ${year} ${g} ${serial} ${issue} ${check}`
}

// ── static data ──────────────────────────────────────────────────────────────
// [first, last, sex, dob, district, province, sector, cell, village, lat, lng, type, harm]
const PEOPLE = [
  ['Anastase',    'Munyakazi',      'Male',   '1985-04-11', 'Nyarugenge', 'Kigali City',       'Nyamirambo', 'Mumena',      'Amahoro',    -1.9822, 30.0435, 'THEFT',               'Breaks into shops at Nyamirambo trading centre at night; three shopkeepers have lost stock and residents fear leaving homes unattended.'],
  ['Jacqueline',  'Mukarugwiza',    'Female', '1990-09-23', 'Gasabo',     'Kigali City',       'Kimironko',  'Bibare',      'Ubumwe',     -1.9403, 30.1028, 'DRUG_DEALING',        'Sells cannabis to secondary school students near Kimironko market; youths gather at her house every evening.'],
  ['Emile',       'Nshimiyimana',   'Male',   '1978-01-30', 'Kicukiro',   'Kigali City',       'Gatenga',    'Karambo',     'Isangano',   -1.9781, 30.1030, 'THREATS',             'Threatens neighbours with a machete during land boundary disputes; families on adjacent plots no longer feel safe.'],
  ['Beatrice',    'Nyirasafari',    'Female', '1988-06-17', 'Musanze',    'Northern Province', 'Muhoza',     'Cyabararika', 'Ruhengeri',  -1.4996, 29.6342, 'SUSPICIOUS_ACTIVITY', 'Hosts unknown visitors who cross from the volcanoes area at odd hours; refuses to present them to the village committee.'],
  ['Deogratias',  'Habineza',       'Male',   '1982-11-05', 'Rubavu',     'Western Province',  'Gisenyi',    'Mbugangari',  'Umubano',    -1.6790, 29.2601, 'THEFT',               'Suspected of smuggling stolen motorcycles across the Petite Barrière border; two bikes stolen in the cell were traced toward Goma.'],
  ['Marie Chantal','Uwizeyimana',   'Female', '1993-03-14', 'Rusizi',     'Western Province',  'Kamembe',    'Gihundwe',    'Iterambere', -2.4846, 28.9075, 'SUSPICIOUS_ACTIVITY', 'Carries unidentified packages on canoe crossings of the Rusizi river at night; avoids the official border post.'],
  ['Innocent',    'Bizumuremyi',    'Male',   '1975-07-21', 'Huye',       'Southern Province', 'Ngoma',      'Butare',      'Matyazo',    -2.5967, 29.7391, 'ASSAULT',             'Beats his wife and children when drunk; neighbours have intervened four times this year and he now fights anyone who intervenes.'],
  ['Clementine',  'Mukashyaka',     'Female', '1986-12-08', 'Muhanga',    'Southern Province', 'Nyamabuye',  'Gahogo',      'Gitarama',   -2.0850, 29.7548, 'PROPERTY_DAMAGE',     'Destroys crops of a widow neighbour at night over an inheritance dispute; banana plantation cut down twice.'],
  ['Jean Damascene','Ntirenganya',  'Male',   '1980-02-25', 'Nyagatare',  'Eastern Province',  'Nyagatare',  'Barija',      'Bushara',    -1.2937, 30.3275, 'THEFT',               'Steals cattle from grazing areas at night and moves them toward the Uganda border; three cows missing this month.'],
  ['Speciose',    'Nyiramugisha',   'Female', '1991-08-19', 'Rwamagana',  'Eastern Province',  'Kigabiro',   'Sibagire',    'Nyagasenyi', -1.9487, 30.4347, 'OTHER',               'Runs an illegal money-lending scheme charging 40% monthly interest; confiscates household goods of families who cannot pay.'],
  ['Faustin',     'Sibomana',       'Male',   '1983-05-02', 'Bugesera',   'Eastern Province',  'Nyamata',    'Kanazi',      'Kanombe',    -2.1400, 30.0900, 'DRUG_DEALING',        'Distributes kanyanga (illicit gin) from his compound; two young men were hospitalised after drinking his brew.'],
  ['Josephine',   'Uwamariya',      'Female', '1987-10-27', 'Karongi',    'Western Province',  'Bwishyura',  'Kiniha',      'Gitarama',   -2.0044, 29.3477, 'SUSPICIOUS_ACTIVITY', 'Buys minerals from unknown diggers at night near Lake Kivu shore; no trading licence and refuses village meetings.'],
  ['Augustin',    'Ndagijimana',    'Male',   '1979-09-13', 'Gicumbi',    'Northern Province', 'Byumba',     'Gisuna',      'Nyarutarama',-1.5763, 30.0675, 'THREATS',             'Intimidates witnesses of a land fraud case; told two elders they would "disappear" if they testify at the sector office.'],
  ['Immaculee',   'Nyirabagenzi',   'Female', '1994-01-09', 'Nyanza',     'Southern Province', 'Busasamana', 'Kavumu',      'Bugari',     -2.3515, 29.7509, 'OTHER',               'Collects money for a fake savings cooperative; over 30 villagers have deposited money and no records are kept.'],
  ['Callixte',    'Twahirwa',       'Male',   '1984-06-28', 'Ngoma',      'Eastern Province',  'Kibungo',    'Cyasemakamba','Karenge',    -2.1597, 30.5427, 'ASSAULT',             'Attacks boda-boda riders on the Kibungo road at dusk with accomplices; two riders injured and one motorcycle taken.'],
  ['Verena',      'Mukandanga',     'Female', '1989-04-04', 'Kayonza',    'Eastern Province',  'Mukarange',  'Bwiza',       'Nyagatovu',  -1.8833, 30.6000, 'DOMESTIC_VIOLENCE',   'Repeatedly abuses her elderly mother-in-law and locks her out of the house at night; local mediation has failed.'],
  ['Ladislas',    'Hategekimana',   'Male',   '1976-08-16', 'Gakenke',    'Northern Province', 'Gakenke',    'Buheta',      'Rusagara',   -1.6862, 29.7786, 'PROPERTY_DAMAGE',     'Diverts communal irrigation water and destroys sluice gates built by the cooperative; rice farmers losing their season.'],
  ['Dative',      'Mukamusoni',     'Female', '1992-02-11', 'Burera',     'Northern Province', 'Butaro',     'Nyamicucu',   'Gatsibo',    -1.4767, 29.8730, 'SUSPICIOUS_ACTIVITY', 'Guides strangers on foot paths around Lake Burera toward the border at night; claims they are "traders" but none are known.'],
  ['Evariste',    'Niyomugabo',     'Male',   '1981-12-01', 'Nyamagabe',  'Southern Province', 'Gasaka',     'Nyabivumu',   'Kigeme',     -2.4229, 29.5610, 'THEFT',               'Cuts and sells trees from the Nyungwe buffer zone and steals planted seedlings from the reforestation project.'],
  ['Adeline',     'Umuhoza',        'Female', '1995-05-20', 'Ruhango',    'Southern Province', 'Ruhango',    'Munini',      'Gikoma',     -2.2331, 29.7783, 'OTHER',               'Sells expired medicines from an unlicensed drug shop behind the market; a child fell seriously ill after treatment.'],
  ['Silas',       'Bimenyimana',    'Male',   '1977-03-08', 'Kirehe',     'Eastern Province',  'Kirehe',     'Nyabitare',   'Rusozi',     -2.2258, 30.7053, 'THEFT',               'Steals harvested maize from drying grounds and sells it in Tanzania through the Rusumo corridor at night.'],
  ['Xaverine',    'Mukagatare',     'Female', '1990-07-15', 'Gatsibo',    'Eastern Province',  'Kabarore',   'Kabeza',      'Nyamirama',  -1.5800, 30.4500, 'DOMESTIC_VIOLENCE',   'Mistreats a house helper who is a minor; the girl has been seen injured and is not allowed to attend school.'],
  ['Fulgence',    'Nsabimana',      'Male',   '1986-10-03', 'Nyabihu',    'Western Province',  'Mukamira',   'Rukoma',      'Jenda',      -1.6540, 29.5070, 'DRUG_DEALING',        'Transports cannabis hidden in potato sacks from the forest edge; recruits jobless youths as carriers.'],
  ['Donatille',   'Nyiranshimiyimana','Female','1988-09-26','Ngororero',  'Western Province',  'Ngororero',  'Kaseke',      'Rususa',     -1.8663, 29.6250, 'OTHER',               'Practices witchcraft accusations against elderly women; incited a crowd that chased an old widow from her home.'],
  ['Boniface',    'Rutayisire',     'Male',   '1974-04-18', 'Rutsiro',    'Western Province',  'Gihango',    'Congo-Nil',   'Bumba',      -1.9430, 29.3250, 'SUSPICIOUS_ACTIVITY', 'Operates unregistered boats on Lake Kivu at night; refuses to dock at designated landing sites for inspection.'],
  ['Liberata',    'Mukandayambaje', 'Female', '1993-11-30', 'Nyamasheke', 'Western Province',  'Kagano',     'Ninzi',       'Kibogora',   -2.3330, 29.1460, 'THEFT',               'Steals coffee cherries from cooperative washing station stores; sacks found hidden in her banana grove.'],
  ['Theogene',    'Uwitonze',       'Male',   '1985-08-07', 'Gisagara',   'Southern Province', 'Ndora',      'Cyamukuza',   'Dahwe',      -2.5920, 29.8390, 'ASSAULT',             'Leads a group of young men who beat vendors refusing to pay "protection" money at the weekly market.'],
  ['Godelive',    'Nyirarukundo',   'Female', '1991-06-24', 'Kamonyi',    'Southern Province', 'Runda',      'Kabagesera',  'Ruyenzi',    -2.0110, 29.9030, 'OTHER',               'Traffics young girls to Kigali promising housemaid jobs; two girls from the village have not been heard from.'],
  ['Straton',     'Mbarushimana',   'Male',   '1980-01-12', 'Rulindo',    'Northern Province', 'Base',       'Gitare',      'Rwili',      -1.7710, 30.0640, 'PROPERTY_DAMAGE',     'Sets fire to bee hives and forest plots of a neighbour after losing a court case over the land.'],
  ['Alphonsine',  'Uwimbabazi',     'Female', '1987-05-31', 'Nyaruguru',  'Southern Province', 'Kibeho',     'Mpanda',      'Gakoma',     -2.6900, 29.5250, 'SUSPICIOUS_ACTIVITY', 'Holds unauthorised night gatherings claiming religious visions; collects money and identity documents from followers.'],
  ['Gaspard',     'Nkundabagenzi',  'Male',   '1983-02-19', 'Nyarugenge', 'Kigali City',       'Kimisagara', 'Katabaro',    'Terimbere',  -1.9536, 30.0605, 'DRUG_DEALING',        'Distributes heroin in Kimisagara through street children; users gather in the valley below the water tank.'],
  ['Perpetue',    'Mukanoheli',     'Female', '1989-12-14', 'Gasabo',     'Kigali City',       'Ndera',      'Cyaruzinge',  'Masoro',     -1.9120, 30.1750, 'OTHER',               'Registers ghost members in the village savings group and forges signatures to withdraw shared funds.'],
  ['Cyprien',     'Ruzindana',      'Male',   '1978-06-09', 'Kicukiro',   'Kigali City',       'Masaka',     'Ayabaraya',   'Gako',       -2.0180, 30.1620, 'THEFT',               'Strips electrical cables and solar panels from construction sites in Masaka; sells them to scrap dealers.'],
  ['Esperance',   'Nyirandegeya',   'Female', '1994-10-22', 'Musanze',    'Northern Province', 'Kinigi',     'Kaguhu',      'Bisoke',     -1.4310, 29.5960, 'SUSPICIOUS_ACTIVITY', 'Approaches tourists near the park headquarters offering "special gorilla visits" without permits; works with unknown men.'],
  ['Marcel',      'Gasana',         'Male',   '1982-03-27', 'Rubavu',     'Western Province',  'Nyamyumba',  'Kiraga',      'Rushubi',    -1.7420, 29.2870, 'ASSAULT',             'Fights fishermen at the Nyamyumba landing site and slashes nets of those who refuse to sell him fish below price.'],
  ['Seraphine',   'Mukarutesi',     'Female', '1986-07-06', 'Huye',       'Southern Province', 'Tumba',      'Cyimana',     'Gitwa',      -2.6150, 29.7480, 'THREATS',             'Sends threatening messages to a genocide survivor family and vandalised their memorial garden fence.'],
  ['Ildephonse',  'Munyaneza',      'Male',   '1975-11-18', 'Nyagatare',  'Eastern Province',  'Matimba',    'Cyembogo',    'Kagitumba',  -1.0620, 30.4380, 'SUSPICIOUS_ACTIVITY', 'Moves fuel drums across the Kagitumba border point on bicycles at night; pays youths to watch for patrols.'],
  ['Angelique',   'Nyampinga',      'Female', '1992-04-15', 'Bugesera',   'Eastern Province',  'Ruhuha',     'Kindama',     'Gikundamvura',-2.2680, 30.1550, 'DOMESTIC_VIOLENCE',   'Abandons her three children for days without food; the eldest, aged 9, begs at the trading centre to feed the others.'],
  ['Napoleon',    'Bizindavyi',     'Male',   '1981-09-01', 'Kirehe',     'Eastern Province',  'Rusumo',     'Nyamugari',   'Kazizi',     -2.3810, 30.7920, 'THEFT',               'Breaks into trucks parked overnight at Rusumo border queue; drivers report stolen cargo and siphoned fuel.'],
  ['Domitille',   'Mukeshimana',    'Female', '1990-01-28', 'Karongi',    'Western Province',  'Rubengera',  'Gitwa',       'Nyarusanga', -2.0560, 29.4110, 'OTHER',               'Charges desperate families for fake overseas job placements; collected passports and fees from seven villagers.'],
]

const PARTY_STATUS = ['None', 'No political affiliation declared', 'Member of local farming cooperative', 'None — registered community volunteer']
const FATHER = ['Sebureze', 'Rwabuhihi', 'Munyampundu', 'Gatera', 'Rwagasana', 'Bagabo', 'Sekamana', 'Nzabonimpa', 'Ruhumuriza', 'Kabera']
const MOTHER = ['Nyirahabimana', 'Mukandutiye', 'Kanyange', 'Nyiramatama', 'Uwilingiyimana', 'Mukansanga', 'Nyirabashyitsi', 'Mukamana', 'Nyiraneza', 'Uwera']
const PROFESSION = ['Farmer', 'Trader', 'Boda-boda rider', 'Carpenter', 'Tailor', 'Fisherman', 'Charcoal seller', 'Mason', 'Shopkeeper', 'Casual labourer']
const HEALTH = ['Healthy', 'Healthy — no known condition', 'Chronic ulcers, on treatment', 'Healthy, known alcohol abuse', 'Asthmatic']
const EDUCATION = ['Primary', 'Secondary (O-Level)', 'None', 'Secondary (A-Level)', 'Vocational / TVET']
const MARITAL = ['Married', 'Single', 'Married', 'Widowed', 'Divorced']
const PROPERTIES = [
  'Small plot of land and a mud-brick house in the village',
  'Two goats, a bicycle and a rented market stall',
  'Banana plantation (~0.5 ha) and an iron-roofed house',
  'Motorcycle (unregistered), one cow, family land share',
  'No registered property; rents a room at the trading centre',
]

function buildProfile(p, i) {
  const [first, last, sex, dob, district, province, sector, cell, village] = p
  const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '')
  const nid = makeNid(dob, sex, i)
  const addr = `${village} Village, ${cell} Cell, ${sector} Sector, ${district} District, ${province}`
  return {
    full_name: `${first} ${last}`,
    party_status: PARTY_STATUS[i % PARTY_STATUS.length],
    father_name: `${FATHER[i % FATHER.length]} ${['Jean', 'Pierre', 'Antoine', 'Joseph', 'Paul'][i % 5]}`,
    mother_name: `${MOTHER[i % MOTHER.length]} ${['Marthe', 'Agnes', 'Cecile', 'Rose', 'Anne'][i % 5]}`,
    date_of_birth: dob,
    sex,
    place_of_birth: `${sector} Sector, ${district} District`,
    residential_address: addr,
    domicile_address: addr,
    telephone: `078${String(8214300 + i * 13577).slice(0, 7)}`,
    email: `${plain(first)}.${plain(last)}@gmail.com`,
    national_id_or_passport: nid,
    nationality: 'Rwandan',
    marital_status: MARITAL[i % MARITAL.length],
    profession: PROFESSION[i % PROFESSION.length],
    properties: PROPERTIES[i % PROPERTIES.length],
    health_status: HEALTH[i % HEALTH.length],
    education_level: EDUCATION[i % EDUCATION.length],
    number_of_children: String((i * 3) % 7),
    alternative_contact: `${MOTHER[(i + 3) % MOTHER.length]} ${['Immaculee', 'Josephine', 'Beatrice', 'Claudine', 'Vestine'][i % 5]} (sister) — 072${String(5501200 + i * 9931).slice(0, 7)}`,
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const tokens = []
  for (const badge of VILLAGE_LEADERS) tokens.push(await login(badge))
  console.log(`Logged in ${tokens.length} village leaders`)

  const nidLog = []
  let created = 0, linkedExisting = 0, skipped = 0

  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i]
    const [first, last, , , district, , , , , lat, lng, type, harm] = p
    const profile = buildProfile(p, i)
    const fullName = profile.full_name
    const nidDigits = profile.national_id_or_passport.replace(/\D/g, '')
    const nidHash = sha256(nidDigits)

    // idempotency: skip if this NID already has a community report on file
    const { data: existing } = await db.from('suspects')
      .select('id').eq('national_id_hash', nidHash).maybeSingle()
    if (existing) {
      const { data: ev } = await db.from('intelligence_events')
        .select('id').eq('suspect_id', existing.id).eq('source_tag', 'OFFICER_REPORT').limit(1)
      if (ev && ev.length > 0) {
        console.log(`  = ${fullName} already reported — skip`)
        skipped++
        nidLog.push({ name: fullName, nid: profile.national_id_or_passport, district })
        continue
      }
    }

    const token = tokens[i % tokens.length]
    const res = await post(token, '/patrol/report', {
      person_name: fullName,
      person: profile,
      description: harm,
      insecurity_type: type,
      location_lat: lat,
      location_lng: lng,
      location_description: `${profile.residential_address.split(',').slice(0, 3).join(',')}`,
      file_urls: [],
    })
    const event = res.data ?? res
    if (event.matched_existing_record) linkedExisting++
    else created++

    // backdate over the last 45 days so dashboards show history
    const when = new Date(Date.now() - (45 - i) * 24 * 3600 * 1000 - (i * 53 % 720) * 60000).toISOString()
    if (event.id) {
      await db.from('intelligence_events')
        .update({ event_timestamp: when, created_at: when }).eq('id', event.id)
      await db.from('alerts').update({ created_at: when }).eq('intelligence_event_id', event.id)
    }
    if (event.suspect_id) {
      await db.from('suspects').update({ created_at: when }).eq('id', event.suspect_id)
    }

    nidLog.push({ name: fullName, nid: profile.national_id_or_passport, district, suspect_id: event.suspect_id ?? null })
    console.log(`  + ${fullName} (${district}) — ${type}${event.matched_existing_record ? ' [linked to existing record]' : ''}`)
  }

  // plaintext NID reference for testers (hash-only in DB) — same convention as seed-nids.json
  const outPath = path.join(__dirname, 'seed-village-nids.json')
  fs.writeFileSync(outPath, JSON.stringify(nidLog, null, 2))

  console.log(`\nDone: ${created} new registry records, ${linkedExisting} linked to existing, ${skipped} skipped (already seeded)`)
  console.log(`NID reference written to ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
