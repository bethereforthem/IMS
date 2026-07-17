/**
 * Backfill full investigation reports (matching the /rib/cases/new form
 * structure exactly) for every RIB case that has no report yet.
 * Reports are submitted through the real PUT /cases/[id]/report API so
 * audit logging and upsert behaviour are exercised.
 *
 * Run: node scripts/seed-reports.js   (dev server must be on :3000)
 */
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

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

// ── name pools for victims / witnesses (Rwandan) ─────────────────────────────
const VICTIM_NAMES = [
  ['Grace Mukamazimpaka', 'F'], ['Samuel Nsabimana', 'M'], ['Alice Uwamariya', 'F'],
  ['Jean de Dieu Habineza', 'M'], ['Odette Nyirasafari', 'F'], ['Claver Ntirenganya', 'M'],
  ['Diane Umwali', 'F'], ['Fabrice Tuyishime', 'M'], ['Henriette Mukarugwiza', 'F'],
  ['Xavier Ndagijimana', 'M'], ['Justine Mukashema', 'F'], ['Emile Nsengimana', 'M'],
]
const WITNESS_NAMES = [
  ['Speciose Mukandutiye', 'F'], ['Gaspard Ntawangundi', 'M'], ['Adeline Uwizeye', 'F'],
  ['Viateur Ndikubwimana', 'M'], ['Beatrice Uwimbabazi', 'F'], ['Leonard Munyakayanza', 'M'],
  ['Josephine Nyiranshimiyimana', 'F'], ['Anastase Ruberwa', 'M'],
]
const FATHERS = ['Ntawukuriryayo', 'Gasana', 'Munyakazi', 'Rutaremara', 'Bagabo', 'Serugendo', 'Mutsinzi', 'Rwabukumba']
const MOTHERS = ['Nyirabagenzi', 'Mukandori', 'Uwamwiza', 'Nyiramatama', 'Mukansanga', 'Umuhoza', 'Nyirandegeya', 'Mukamusoni']
const SECTORS = ['Muhima', 'Gitega', 'Kimironko', 'Remera', 'Nyamirambo', 'Gikondo', 'Kacyiru', 'Kanombe']
const CELLS = ['Ubumwe', 'Amahoro', 'Iterambere', 'Umucyo', 'Kabeza', 'Gatare']
const VILLAGES = ['Isangano', 'Umurava', 'Ituze', 'Urumuri', 'Ubwiza', 'Amajyambere']
const PROFESSIONS = ['Trader', 'Farmer', 'Teacher', 'Driver', 'Accountant', 'Shopkeeper', 'Technician', 'Nurse']

// province lookup from the case location text
function provinceOf(location) {
  if (/Kigali|Nyarugenge|Gasabo|Kicukiro|Kanombe|Remera|Nyamirambo|Nyabugogo|Kimironko|online/i.test(location)) return 'Kigali City'
  if (/Northern|Musanze|Gicumbi|Burera|Gakenke/i.test(location)) return 'Northern Province'
  if (/Southern|Huye|Muhanga|Nyamagabe|Nyanza|Gitega/i.test(location)) return 'Southern Province'
  if (/Eastern|Nyagatare|Rwamagana|Kayonza|Kirehe|Ngoma|Bugesera/i.test(location)) return 'Eastern Province'
  if (/Western|Rubavu|Rusizi|Karongi|Rutsiro/i.test(location)) return 'Western Province'
  return 'Kigali City'
}
function districtOf(location) {
  const m = location.match(/([A-Za-z]+) District/)
  if (m) return m[1]
  if (/Kigali/i.test(location)) return 'Nyarugenge'
  return location.split(',')[0].trim().split(' ')[0]
}

// Rwandan NID-style number (16 digits): 1 YYYY 8 XXXXXXX 0 XX
function nid(i, birthYear) {
  return `1 ${birthYear} 8 0${String(300000 + i * 137).padStart(6, '0')} 0 ${String(10 + (i % 80)).padStart(2, '0')}`
}
function phone(i) {
  return `+250 78${(8 - (i % 3))}${String(100000 + i * 991).slice(0, 6)}`
}

function mkPerson(i, name, sex, party, province, district, birthYear) {
  return {
    id: uid(), full_name: name, party_status: party,
    father_name: FATHERS[i % FATHERS.length], mother_name: MOTHERS[i % MOTHERS.length],
    date_of_birth: `${birthYear}-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
    sex, place_of_birth: district, country: 'Rwanda',
    province, district, sector: SECTORS[i % SECTORS.length],
    cell: CELLS[i % CELLS.length], village: VILLAGES[i % VILLAGES.length],
    residential_address: `${VILLAGES[i % VILLAGES.length]} Village, ${SECTORS[i % SECTORS.length]} Sector, ${district}`,
    domicile_address: `${CELLS[i % CELLS.length]} Cell, ${district}`,
    telephone: phone(i), email: '',
    national_id: nid(i, birthYear), nationality: 'RWA',
    marital_status: i % 3 === 0 ? 'Married' : 'Single',
    profession: PROFESSIONS[i % PROFESSIONS.length],
    properties: i % 4 === 0 ? 'Residential house, 1 motorcycle' : '',
    health_status: 'Stable', education_level: ['Primary', 'Secondary', 'University'][i % 3],
    num_children: String(i % 4), alt_contact: phone(i + 7), photo: '',
  }
}

// category-specific content
const CATEGORY_CONTENT = {
  DRUG_OFFENSE: {
    exhibits: [['Seized narcotics', 'Packaged narcotic substance secured as evidence', 'kg'], ['Mobile phones', 'Suspects’ handsets containing communications', 'units'], ['Cash (RWF)', 'Undeclared cash believed to be proceeds', 'bundles']],
    charge: 'Illicit manufacturing, trafficking and possession of narcotic drugs contrary to Articles 263–267 of Law N°68/2018 of 30/08/2018 determining offences and penalties in general.',
    docs: ['Opening Report', 'Seizure Report', "Suspect's Statement", 'Witness Statement'],
  },
  FRAUD: {
    exhibits: [['Laptops and phones', 'Devices used in the fraudulent scheme', 'units'], ['Bank statements', 'Transaction records evidencing diverted funds', 'files'], ['Forged documents', 'Falsified instruments recovered during search', 'items']],
    charge: 'Obtaining property by false pretences and forgery contrary to Articles 174, 276 and 277 of Law N°68/2018 of 30/08/2018.',
    docs: ['Opening Report', 'Seizure Report', "Complainant's Statement", 'Expert Report'],
  },
  CORRUPTION: {
    exhibits: [['Marked banknotes', 'Marked bills recovered during the sting operation', 'bundles'], ['Procurement files', 'Tender documents under forensic examination', 'files'], ['Mobile phone', 'Device with incriminating communications', 'unit']],
    charge: 'Corruption and embezzlement contrary to Articles 4 and 10 of Law N°54/2018 of 13/08/2018 on fighting against corruption.',
    docs: ['Opening Report', 'Seizure Report', "Suspect's Statement", 'Expert Report'],
  },
  ROBBERY: {
    exhibits: [['Recovered firearm', 'Pistol recovered and submitted for ballistics', 'unit'], ['CCTV footage', 'Video evidence from scene cameras', 'files'], ['Recovered cash', 'Portion of stolen money recovered', 'bundles']],
    charge: 'Armed robbery contrary to Articles 166 and 167 of Law N°68/2018 of 30/08/2018.',
    docs: ['Opening Report', 'Scene Observation Report', 'Seizure Report', "Complainant's Statement", 'Witness Statement'],
  },
  HOMICIDE: {
    exhibits: [['Weapon', 'Suspected murder weapon recovered at scene', 'unit'], ['Autopsy report', 'Forensic pathology report', 'file'], ['Scene photographs', 'Photographic documentation of crime scene', 'files']],
    charge: 'Murder contrary to Articles 107 and 108 of Law N°68/2018 of 30/08/2018.',
    docs: ['Opening Report', 'Scene Observation Report', 'Expert Report', 'Witness Statement'],
  },
  TRAFFICKING: {
    exhibits: [['Travel documents', 'Passports and permits recovered from suspects', 'items'], ['Mobile phones', 'Devices with recruitment communications', 'units'], ['Contracts', 'Fraudulent employment contracts', 'files']],
    charge: 'Trafficking in persons contrary to Articles 18–20 of Law N°51/2018 of 13/08/2018 relating to the prevention, suppression and punishment of trafficking in persons and exploitation of others.',
    docs: ['Opening Report', 'Seizure Report', "Complainant's Statement", 'Witness Statement'],
  },
  CYBERCRIME: {
    exhibits: [['Server / storage media', 'Seized hardware submitted for forensic imaging', 'units'], ['Forensic image', 'Bit-level copy of suspect devices', 'files'], ['Transaction logs', 'Financial and network logs', 'files']],
    charge: 'Unauthorized access and computer fraud contrary to Articles 16, 29 and 34 of Law N°60/2018 of 22/08/2018 on prevention and punishment of cyber crimes.',
    docs: ['Opening Report', 'Seizure Report', 'Expert Report', "Suspect's Statement"],
  },
  TERRORISM: {
    exhibits: [['Explosive material', 'Recovered device components secured by EOD', 'items'], ['Financial records', 'Hawala transfer evidence', 'files'], ['Communication devices', 'Phones and radios recovered', 'units']],
    charge: 'Acts of terrorism contrary to Articles 192–194 of Law N°68/2018 of 30/08/2018 and Law N°46/2018 on counter-terrorism.',
    docs: ['Opening Report', 'Seizure Report', 'Expert Report', 'Witness Statement'],
  },
  BORDER_VIOLATION: {
    exhibits: [['Seized minerals/goods', 'Undeclared goods intercepted at border', 'tonnes'], ['Forged export papers', 'Falsified customs documentation', 'files'], ['Transport vehicle', 'Truck used in smuggling operation', 'unit']],
    charge: 'Smuggling and fraudulent evasion of customs duties contrary to Articles 199–202 of the EAC Customs Management Act and Law N°68/2018.',
    docs: ['Opening Report', 'Seizure Report', "Suspect's Statement"],
  },
  ORGANIZED_CRIME: {
    exhibits: [['Seized contraband', 'Illicit goods recovered during operation', 'items'], ['Cash (RWF/USD)', 'Proceeds of crime secured', 'bundles'], ['Communication devices', 'Phones mapping the criminal network', 'units']],
    charge: 'Formation of and participation in a criminal association contrary to Articles 210–212 of Law N°68/2018 of 30/08/2018.',
    docs: ['Opening Report', 'Seizure Report', 'Witness Statement', "Suspect's Statement"],
  },
  SEXUAL_OFFENSE: {
    exhibits: [['Medical report', 'Medico-legal examination report', 'file'], ['Scene evidence', 'Physical evidence collected at scene', 'items']],
    charge: 'Child defilement contrary to Articles 133–137 of Law N°68/2018 of 30/08/2018.',
    docs: ['Opening Report', "Complainant's Statement", 'Expert Report', 'Witness Statement'],
  },
  OTHER: {
    exhibits: [['Documentary evidence', 'Records and materials secured for analysis', 'files'], ['Electronic devices', 'Devices submitted for forensic review', 'units']],
    charge: 'Offences contrary to the applicable provisions of Law N°68/2018 of 30/08/2018 determining offences and penalties in general.',
    docs: ['Opening Report', 'Witness Statement'],
  },
}

const INVESTIGATORS = {
  'a0000003-0000-0000-0000-000000000001': { name: 'IP Pascal Habimana', rank: 'Inspector of Police', tel: '+250 788 301 001' },
  'a0000003-0000-0000-0000-000000000002': { name: 'IP Rose Kayitesi', rank: 'Inspector of Police', tel: '+250 788 301 002' },
  'a0000003-0000-0000-0000-000000000003': { name: 'CIP Sylvain Ndayisaba', rank: 'Chief Inspector of Police', tel: '+250 788 301 003' },
}

async function mintToken(badge) {
  const { data: u } = await db.from('users')
    .select('id, badge_number, full_name, institution, role, clearance_level')
    .eq('badge_number', badge).single()
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT({
    user_id: u.id, badge_number: u.badge_number, full_name: u.full_name,
    institution: u.institution, role: u.role, clearance: u.clearance_level,
    session_id: crypto.randomUUID(), type: 'access', has_accepted_policies: true,
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600).sign(secret)
}

function buildReport(c, suspects, idx) {
  const category = CATEGORY_CONTENT[c.category] ? c.category : 'OTHER'
  const content = CATEGORY_CONTENT[category]
  const location = c.location_name ?? 'Kigali'
  const province = provinceOf(location)
  const district = districtOf(location)
  const incidentDate = (c.incident_date ?? c.created_at).substring(0, 10)

  // suspects from linked suspect rows
  const suspectEntries = suspects.map((s, i) => {
    const birthYear = s.date_of_birth ? s.date_of_birth.substring(0, 4) : String(1980 + (i % 15))
    const p = mkPerson(idx + i, s.full_name, /a$|e$|ine$|ise$/.test(s.first_name ?? '') ? 'F' : 'M', 'SUSPECT', province, district, birthYear)
    p.date_of_birth = s.date_of_birth ?? p.date_of_birth
    p.national_id = s.ims_reference ? `IMS ref: ${s.ims_reference}` : p.national_id
    p.health_status = 'Stable'
    return p
  })
  // fall back to one unnamed suspect entry if the case has no linked suspects
  if (suspectEntries.length === 0) {
    suspectEntries.push(mkPerson(idx, 'Unknown (under identification)', 'M', 'SUSPECT', province, district, '1985'))
  }

  const [vName, vSex] = VICTIM_NAMES[idx % VICTIM_NAMES.length]
  const victims = [mkPerson(idx + 3, vName, vSex, 'VICTIM', province, district, String(1970 + (idx % 30)))]
  if (idx % 3 === 0) {
    const [v2, s2] = VICTIM_NAMES[(idx + 5) % VICTIM_NAMES.length]
    victims.push(mkPerson(idx + 9, v2, s2, 'VICTIM', province, district, String(1975 + (idx % 25))))
  }

  const [wName, wSex] = WITNESS_NAMES[idx % WITNESS_NAMES.length]
  const witnesses = [mkPerson(idx + 4, wName, wSex, 'WITNESS', province, district, String(1968 + (idx % 30)))]
  if (idx % 2 === 0) {
    const [w2, ws2] = WITNESS_NAMES[(idx + 3) % WITNESS_NAMES.length]
    witnesses.push(mkPerson(idx + 11, w2, ws2, 'WITNESS', province, district, String(1972 + (idx % 26))))
  }

  const criminal_history = suspects
    .filter(s => (s.threat_level ?? 0) >= 4)
    .map(s => ({
      id: uid(), case_category: category, sub_category: '', case_type: 'Felony',
      crime: `Prior investigation — ${String(category).replace(/_/g, ' ').toLowerCase()}`,
      article: 'Law N°68/2018', suspect_name: s.full_name, offender_type: 'Repeat offender',
    }))

  const exhibits = content.exhibits.map(([name, description, unit], i) => ({
    id: uid(), number: `EXH-${String(i + 1).padStart(3, '0')}`,
    name, description, quantity: `${(idx % 3) + 1} ${unit}`,
    condition: 'Sealed — evidence room', storage_location: `RIB ${district} Station Evidence Store`,
    file_name: '',
  }))

  const lead = INVESTIGATORS[c.lead_officer_id] ?? { name: 'IP Pascal Habimana', rank: 'Inspector of Police', tel: '+250 788 301 001' }
  const investigators = [{
    id: uid(), name: lead.name, rank: lead.rank, institution: 'RIB',
    role: 'Lead Investigator', telephone: lead.tel, email: '',
  }]
  if (idx % 2 === 1) {
    investigators.push({
      id: uid(), name: 'Analyste Martine Uwiringiyimana', rank: 'Intelligence Analyst',
      institution: 'RIB', role: 'Case Analyst', telephone: '+250 788 301 004', email: '',
    })
  }

  const documents = {}
  content.docs.forEach((docType, i) => {
    const d = new Date(incidentDate)
    d.setDate(d.getDate() + i + 1)
    documents[docType] = {
      file_name: `${c.case_reference}_${docType.replace(/[^A-Za-z]+/g, '_')}.pdf`,
      upload_date: d.toISOString().substring(0, 10),
    }
  })

  const suspectNames = suspects.map(s => s.full_name).join(', ') || 'unidentified suspects'
  return {
    victims, suspects: suspectEntries, witnesses, criminal_history,
    crime_info: {
      date_of_crime: incidentDate,
      time_of_crime: `${String(6 + (idx % 16)).padStart(2, '0')}:${String((idx * 7) % 60).padStart(2, '0')}`,
      province, district,
      sector: SECTORS[idx % SECTORS.length], cell: CELLS[idx % CELLS.length],
      village: VILLAGES[idx % VILLAGES.length],
      exact_scene: location, gps_lat: '', gps_lng: '',
    },
    exhibits, investigators,
    crime_summary: c.summary ?? '',
    charge_summary: content.charge,
    investigation_findings:
      `Investigation established that ${suspectNames} ${suspects.length > 1 ? 'were' : 'was'} involved in the reported offence. ` +
      `Scene examination, witness interviews and documentary evidence corroborate the allegations. ` +
      `${exhibits.length} exhibit categories were seized and secured in the evidence store. ` +
      `${c.status === 'CLOSED' ? 'The investigation is concluded and the file closed following judicial determination.' :
        c.status === 'PROSECUTION' ? 'The complete case file has been transmitted to the NPPA for prosecution.' :
        c.status === 'COLD' ? 'All current leads are exhausted; the file remains open pending new intelligence.' :
        'Further lines of enquiry are being pursued and additional forensic results are awaited.'}`,
    documents,
  }
}

async function main() {
  const token = await mintToken('RIB-INV-001')

  const { data: cases } = await db.from('cases')
    .select('id, case_reference, title, category, status, summary, incident_date, location_name, lead_officer_id, created_at, case_suspects(suspects(first_name, full_name, date_of_birth, ims_reference, threat_level))')
    .eq('lead_institution', 'RIB')
    .order('case_reference')

  const { data: existing } = await db.from('investigation_reports').select('case_id')
  const hasReport = new Set((existing ?? []).map(r => r.case_id))

  let created = 0, skipped = 0
  for (const [idx, c] of cases.entries()) {
    if (hasReport.has(c.id)) { skipped++; continue }
    const suspects = (c.case_suspects ?? []).map(cs => cs.suspects).filter(Boolean)
    const report_data = buildReport(c, suspects, idx)

    const r = await fetch(`${API}/cases/${c.id}/report`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ report_data, status: 'SUBMITTED' }),
    })
    if (!r.ok) throw new Error(`PUT report ${c.case_reference} -> ${r.status}: ${await r.text()}`)
    created++
    process.stdout.write(`\r   report ${created}: ${c.case_reference}   `)
  }
  console.log(`\n✔ reports created: ${created}, already existed: ${skipped}`)
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
