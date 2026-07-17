/**
 * Bring every RIB case + investigation report to 100% completeness.
 * Fills all empty non-image fields (person photos, exhibit files and
 * signatures are intentionally left for manual upload).
 *
 * Run: node scripts/complete-case-info.js   (dev server on :3000)
 */
const { createClient } = require('@supabase/supabase-js')
const { SignJWT } = require('jose')
const crypto = require('crypto')
const { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')

const API = 'http://localhost:3000/api/v1'
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const DISTRICT_GPS = {
  Nyarugenge: [-1.9536, 30.0606], Gasabo: [-1.8904, 30.1044], Kicukiro: [-2.0143, 30.0899],
  Musanze: [-1.4996, 29.6335], Rubavu: [-1.6763, 29.3460], Huye: [-2.5967, 29.7394],
  Muhanga: [-2.0846, 29.7527], Nyagatare: [-1.2937, 30.3275], Rwamagana: [-1.9481, 30.4347],
  Kayonza: [-1.8837, 30.6207], Kirehe: [-2.2258, 30.7053], Ngoma: [-2.1462, 30.5302],
  Bugesera: [-2.2039, 30.2472], Gicumbi: [-1.5763, 30.0675], Burera: [-1.4753, 29.8709],
  Nyamagabe: [-2.4622, 29.4614], Nyanza: [-2.3515, 29.7509], Karongi: [-2.0034, 29.3653],
  Rutsiro: [-1.9439, 29.3260], Rusizi: [-2.4846, 28.9086], Gakenke: [-1.6863, 29.7877],
  Kigali: [-1.9441, 30.0619],
}

const DOC_TYPES = [
  'Seizure Report', 'Scene Observation Report', 'Expert Report', 'Response Statement',
  'Supplementary Seizure Report', 'Supplementary Scene Observation Report',
  'Opening Report', 'Initial Opening Report', 'Closing Report',
  "Complainant's Statement", 'Witness Statement', "Suspect's Statement",
]

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.')

function emailFor(person, domain, i) {
  const parts = (person.full_name ?? 'unknown person').split(/\s+/)
  return `${slug(parts[0])}.${slug(parts[parts.length - 1])}${domain === 'gmail.com' ? i : ''}@${domain}`
}

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
async function call(token, method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${JSON.stringify(j)}`)
  return j
}

const OFFENSE_CATEGORY = [
  [/drug|cannabis|heroin|narcotic/i, 'DRUG_OFFENSE'], [/robbery|theft/i, 'ROBBERY'],
  [/fraud|embezzle|SACCO|counterfeit/i, 'FRAUD'], [/traffick/i, 'TRAFFICKING'],
  [/homicide|murder|assault/i, 'HOMICIDE'], [/smuggl|mineral|coltan/i, 'BORDER_VIOLATION'],
  [/computer|cyber/i, 'CYBERCRIME'], [/alcohol|kanyanga/i, 'ORGANIZED_CRIME'],
]
const categoryOf = offense => (OFFENSE_CATEGORY.find(([re]) => re.test(offense ?? '')) ?? [null, 'OTHER'])[1]

async function main() {
  const rib = await mint('RIB-INV-001')

  // 1. complete the one bare case row
  const { data: bare } = await db.from('cases')
    .select('id, case_reference, summary, lead_officer_id, title, incident_date, location_name')
    .eq('lead_institution', 'RIB')
  for (const c of bare) {
    const patch = {}
    if (!c.summary) patch.summary = 'Homicide investigation opened following the discovery of a deceased male in Nyarugenge District. Scene secured, forensic examination completed and witness canvassing conducted. Investigation established the circumstances of death and identified the person of interest.'
    if (!c.lead_officer_id) patch.lead_officer_id = 'a0000003-0000-0000-0000-000000000001'
    if (!c.incident_date) patch.incident_date = '2026-01-10T08:00:00Z'
    if (!c.location_name) patch.location_name = 'Nyarugenge District, Kigali'
    if (Object.keys(patch).length) {
      await call(rib, 'PATCH', `/cases/${c.id}`, patch)
      console.log(`case row completed: ${c.case_reference} (${Object.keys(patch).join(', ')})`)
    }
  }

  // 2. load linkage data for criminal-history sync
  const { data: cases } = await db.from('cases')
    .select('id, case_reference, summary, incident_date, location_name, case_suspects(suspects(id, full_name))')
    .eq('lead_institution', 'RIB').order('case_reference')
  const { data: priors } = await db.from('corrections_records')
    .select('suspect_id, custody_status, offense_description, court_name, intake_date, sentence_years')
    .eq('custody_status', 'RELEASED')
  const priorsBySuspect = new Map()
  for (const p of priors ?? []) {
    if (!priorsBySuspect.has(p.suspect_id)) priorsBySuspect.set(p.suspect_id, [])
    priorsBySuspect.get(p.suspect_id).push(p)
  }

  // 3. complete every report
  let updated = 0
  for (const [ci, c] of cases.entries()) {
    const row = await call(rib, 'GET', `/cases/${c.id}/report`)
    if (!row?.report_data) { console.warn(`! no report for ${c.case_reference}`); continue }
    const d = row.report_data

    // persons: emails + properties (photos left for manual upload)
    d.investigators.forEach(inv => {
      if (!inv.email) inv.email = `${slug(inv.name.replace(/^(IP|CIP|Analyste)\s+/i, ''))}@rib.gov.rw`.replace(/\.\./g, '.')
      if (!inv.telephone) inv.telephone = `+250 788 30${1000 + ci}`.slice(0, 16)
    })
    for (const [key, domain] of [['victims', 'gmail.com'], ['suspects', 'gmail.com'], ['witnesses', 'gmail.com']]) {
      ;(d[key] ?? []).forEach((p, i) => {
        if (!p.email) p.email = emailFor(p, domain, ci * 3 + i)
        if (!p.properties) p.properties = 'None declared'
        if (!p.health_status) p.health_status = 'Stable'
        if (!p.alt_contact) p.alt_contact = p.telephone
      })
    }

    // GPS from the crime district
    if (!d.crime_info.gps_lat || !d.crime_info.gps_lng) {
      const [lat, lng] = DISTRICT_GPS[d.crime_info.district] ?? DISTRICT_GPS.Kigali
      d.crime_info.gps_lat = (lat + (ci % 10) * 0.0011).toFixed(6)
      d.crime_info.gps_lng = (lng + (ci % 10) * 0.0009).toFixed(6)
    }
    if (!d.crime_summary) d.crime_summary = c.summary ?? ''

    // criminal history: complete existing entries + sync from real prior imprisonments
    ;(d.criminal_history ?? []).forEach(h => {
      if (!h.sub_category) h.sub_category = 'Prior conviction'
      if (!h.case_type) h.case_type = 'Felony'
    })
    const linkedSuspects = (c.case_suspects ?? []).map(cs => cs.suspects).filter(Boolean)
    for (const s of linkedSuspects) {
      for (const p of priorsBySuspect.get(s.id) ?? []) {
        const exists = (d.criminal_history ?? []).some(h =>
          h.suspect_name === s.full_name && h.crime === p.offense_description)
        if (!exists) {
          d.criminal_history = d.criminal_history ?? []
          d.criminal_history.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            case_category: categoryOf(p.offense_description),
            sub_category: `Served ${p.sentence_years ?? '—'}-year sentence from ${String(p.intake_date).substring(0, 10)}`,
            case_type: 'Felony',
            crime: p.offense_description ?? 'Prior conviction',
            article: 'Law N°68/2018',
            suspect_name: s.full_name,
            offender_type: 'Repeat offender',
          })
        }
      }
    }

    // documents: all 12 slots recorded
    const baseDate = new Date(c.incident_date ?? Date.now())
    DOC_TYPES.forEach((docType, i) => {
      if (!d.documents[docType]?.file_name) {
        const dd = new Date(baseDate); dd.setDate(dd.getDate() + i + 1)
        d.documents[docType] = {
          file_name: `${c.case_reference}_${docType.replace(/[^A-Za-z]+/g, '_')}.pdf`,
          upload_date: dd.toISOString().substring(0, 10),
        }
      }
    })

    await call(rib, 'PUT', `/cases/${c.id}/report`, { report_data: d, status: 'SUBMITTED' })
    updated++
    process.stdout.write(`\r   completed ${updated}/${cases.length}: ${c.case_reference}   `)
  }
  console.log(`\n✔ ${updated} reports completed`)
}
main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
