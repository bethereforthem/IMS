/**
 * Seed script — creates realistic RIB test data through the real REST APIs
 * (so case references, audit logs and RBAC all behave exactly like production),
 * then registers RCS inmates, then backdates created_at via service role so
 * dashboard trend charts have history.
 *
 * Run: node scripts/seed-rib-rcs.js
 */
const { createClient } = require('@supabase/supabase-js')
const { SignJWT } = require('jose')
const crypto = require('crypto')

const API = 'http://localhost:3000/api/v1'
// Same secret the API server verifies with (web/.env.local) — lets us seed
// through the real authenticated endpoints without touching user passwords.
const { JWT_SECRET, SERVICE_ROLE_KEY } = require('./env')

const db = createClient(
  'https://euifbienxyqhgeqapajd.supabase.co',
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

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

async function post(token, path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status}: ${JSON.stringify(j)}`)
  return j
}

async function patch(token, path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status}: ${JSON.stringify(j)}`)
  return j
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
function daysAhead(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ── suspects (Rwandan names) ─────────────────────────────────────────────────
// status: pool for case linkage; IN_CUSTODY/CONVICTED ones get RCS intakes
const SUSPECTS = [
  { first_name: 'Jean Bosco',   last_name: 'Niyonzima',     dob: '1988-03-12', status: 'IN_CUSTODY', threat: 4, notes: 'Ringleader of cross-border cannabis network operating between Rubavu and Goma.' },
  { first_name: 'Emmanuel',     last_name: 'Hakizimana',    dob: '1992-07-04', status: 'ARRESTED',   threat: 3, notes: 'Mobile money agent implicated in SIM-swap fraud syndicate in Nyabugogo.' },
  { first_name: 'Claudine',     last_name: 'Mukamana',      dob: '1985-11-23', status: 'IN_CUSTODY', threat: 3, notes: 'Former Umurenge SACCO accountant; suspected embezzlement of member savings.' },
  { first_name: 'Théoneste', last_name: 'Bizimana',    dob: '1979-01-15', status: 'WANTED',     threat: 5, notes: 'Armed robbery of forex bureau in Nyarugenge; believed armed with a pistol.' },
  { first_name: 'Chantal',      last_name: 'Uwase',         dob: '1994-05-30', status: 'ACTIVE',     threat: 2, notes: 'Recruiter in suspected human trafficking ring targeting young women for Gulf-state domestic work.' },
  { first_name: 'Fidèle',  last_name: 'Nsengiyumva',   dob: '1983-09-18', status: 'CONVICTED',  threat: 4, notes: 'Convicted of homicide following a land dispute in Bugesera District.' },
  { first_name: 'Innocent',     last_name: 'Twagirayezu',   dob: '1990-12-02', status: 'ARRESTED',   threat: 3, notes: 'District procurement officer; caught receiving bribe in sting operation.' },
  { first_name: 'Divine',       last_name: 'Ingabire',      dob: '1997-02-14', status: 'ACTIVE',     threat: 2, notes: 'Suspected phishing operator targeting Irembo and bank customers.' },
  { first_name: 'Olivier',      last_name: 'Munyaneza',     dob: '1987-06-21', status: 'IN_CUSTODY', threat: 4, notes: 'Coltan smuggling; intercepted at Rusizi with undeclared minerals.' },
  { first_name: 'Eric',         last_name: 'Rukundo',       dob: '1991-04-09', status: 'WANTED',     threat: 4, notes: 'Distributor of counterfeit RWF 5,000 notes in Huye and Muhanga markets.' },
  { first_name: 'Espérance', last_name: 'Uwimana',     dob: '1989-08-27', status: 'ACTIVE',     threat: 2, notes: 'Suspected accomplice moving trafficking victims through Gatuna border post.' },
  { first_name: 'Patrick',      last_name: 'Kalisa',        dob: '1986-10-05', status: 'IN_CUSTODY', threat: 5, notes: 'Poaching ring member; ivory trafficking from Akagera National Park.' },
  { first_name: 'Célestin', last_name: 'Ndayisaba',    dob: '1978-03-03', status: 'CONVICTED',  threat: 3, notes: 'Convicted of aggravated assault; linked to cattle rustling in Nyagatare.' },
  { first_name: 'Josiane',      last_name: 'Umutoni',       dob: '1995-01-19', status: 'ACTIVE',     threat: 2, notes: 'Pyramid-scheme promoter; fake job recruitment fees collected from >200 victims.' },
  { first_name: 'Didier',       last_name: 'Mugisha',       dob: '1993-07-11', status: 'ARRESTED',   threat: 3, notes: 'Heroin courier intercepted at Kigali International Airport.' },
  { first_name: 'Vestine',      last_name: 'Nyirahabimana', dob: '1984-12-25', status: 'ACTIVE',     threat: 1, notes: 'Suspected of laundering proceeds through market stalls in Kimironko.' },
  { first_name: 'Janvier',      last_name: 'Byiringiro',    dob: '1982-05-08', status: 'WANTED',     threat: 5, notes: 'Illegal firearms dealer; AK-pattern rifles moved across Burundi border.' },
  { first_name: 'Aimé',    last_name: 'Turatsinze',    dob: '1996-09-14', status: 'ARRESTED',   threat: 3, notes: 'Motorbike gang member; serial smartphone snatching in Kicukiro.' },
  { first_name: 'Immaculée', last_name: 'Mukandayisenga', dob: '1980-02-28', status: 'ACTIVE',  threat: 2, notes: 'Suspected forger of land titles in Gasabo District.' },
  { first_name: 'Straton',      last_name: 'Nkurunziza',    dob: '1975-06-16', status: 'IN_CUSTODY', threat: 4, notes: 'Kanyanga (illicit gin) production network; two deaths linked to methanol batch.' },
  { first_name: 'Gilbert',      last_name: 'Semana',        dob: '1990-11-07', status: 'ACTIVE',     threat: 3, notes: 'Fuel adulteration and smuggling ring along the Rusumo corridor.' },
  { first_name: 'Clarisse',     last_name: 'Iradukunda',    dob: '1998-04-22', status: 'ACTIVE',     threat: 2, notes: 'Online romance-scam operation defrauding diaspora victims.' },
  { first_name: 'Vincent',      last_name: 'Gatete',        dob: '1981-08-13', status: 'CONVICTED',  threat: 4, notes: 'Convicted armed robber; Musanze bank van heist 2025.' },
  { first_name: 'Théophile', last_name: 'Murenzi',     dob: '1977-10-30', status: 'ACTIVE',     threat: 3, notes: 'Suspected financier of grenade attack plot; funds traced through hawala.' },
  { first_name: 'Beatha',       last_name: 'Mukeshimana',   dob: '1992-03-26', status: 'ARRESTED',   threat: 2, notes: 'Child trafficking to Uganda for domestic labor; intercepted at Kagitumba.' },
  { first_name: 'Callixte',     last_name: 'Karangwa',      dob: '1986-01-02', status: 'IN_CUSTODY', threat: 4, notes: 'Cybercrime: unauthorized access to microfinance core banking system.' },
  { first_name: 'Alphonse',     last_name: 'Nzeyimana',     dob: '1983-07-19', status: 'ACTIVE',     threat: 3, notes: 'Vehicle theft ring; cars re-registered with forged plates in Kigali.' },
  { first_name: 'Solange',      last_name: 'Uwera',         dob: '1993-12-06', status: 'IN_CUSTODY', threat: 2, notes: 'Held pre-trial for defrauding cooperative members in Rwamagana.' },
  { first_name: 'Damascene',    last_name: 'Habyarimana',   dob: '1976-04-17', status: 'CONVICTED',  threat: 3, notes: 'Convicted of genocide ideology dissemination via social media.' },
  { first_name: 'Egide',        last_name: 'Mbonimana',     dob: '1989-09-09', status: 'ACTIVE',     threat: 3, notes: 'Suspected of smuggling cassiterite through Lake Kivu crossings.' },
  { first_name: 'Yves',         last_name: 'Kagabo',        dob: '1995-05-24', status: 'ARRESTED',   threat: 2, notes: 'ATM skimming devices recovered from Remera and Nyamirambo.' },
  { first_name: 'Pascaline',    last_name: 'Nyiramana',     dob: '1987-11-11', status: 'ACTIVE',     threat: 1, notes: 'Suspected mule account holder for mobile money fraud proceeds.' },
  { first_name: 'Bonaventure',  last_name: 'Rwigema',       dob: '1972-02-08', status: 'WANTED',     threat: 4, notes: 'Fled after High Court summons; large-scale public funds embezzlement.' },
  { first_name: 'Sandrine',     last_name: 'Mukamurenzi',   dob: '1999-06-29', status: 'ACTIVE',     threat: 1, notes: 'Recruited as courier by drug network; cooperating with investigators.' },
  { first_name: 'Faustin',      last_name: 'Ntaganda',      dob: '1980-08-01', status: 'IN_CUSTODY', threat: 5, notes: 'Suspected leader of armed robbery gang operating on Kigali-Musanze highway.' },
  { first_name: 'Médiatrice', last_name: 'Uwamahoro',  dob: '1991-01-27', status: 'ACTIVE',     threat: 2, notes: 'Suspected document forger supplying fake diplomas and IDs.' },
  { first_name: 'Ignace',       last_name: 'Bimenyimana',   dob: '1985-03-15', status: 'ARRESTED',   threat: 3, notes: 'Defilement case; arrested in Nyamagabe following community report.' },
  { first_name: 'Jacqueline',   last_name: 'Musabyimana',   dob: '1982-10-20', status: 'ACTIVE',     threat: 2, notes: 'Suspected of trafficking counterfeit pharmaceuticals into rural clinics.' },
  { first_name: 'Prosper',      last_name: 'Nshimiyimana',  dob: '1994-12-18', status: 'ACTIVE',     threat: 3, notes: 'Cyber-extortion of businesses via ransomware-as-a-service tooling.' },
  { first_name: 'Angélique', last_name: 'Mukagatare',  dob: '1990-07-23', status: 'IN_CUSTODY', threat: 3, notes: 'Pre-trial detention: cross-border trafficking of minors via Cyanika.' },
  { first_name: 'Deo',          last_name: 'Sibomana',      dob: '1978-05-05', status: 'CONVICTED',  threat: 4, notes: 'Convicted: homicide of business partner over gold-trading dispute.' },
  { first_name: 'Liliane',      last_name: 'Uwituze',       dob: '1996-08-08', status: 'ACTIVE',     threat: 1, notes: 'Social-media account takeover fraud targeting SME owners.' },
  { first_name: 'Ernest',       last_name: 'Maniraguha',    dob: '1984-04-04', status: 'ARRESTED',   threat: 3, notes: 'Illegal mining operation collapse in Rutsiro; charged with endangerment.' },
  { first_name: 'Sylvie',       last_name: 'Nikuze',        dob: '1993-09-02', status: 'ACTIVE',     threat: 2, notes: 'Suspected accomplice in SACCO records falsification.' },
  { first_name: 'Félicien', last_name: 'Ruzindana',    dob: '1970-11-29', status: 'WANTED',     threat: 5, notes: 'INTERPOL-linked: transnational ivory and rhino-horn trafficking.' },
]

// ── cases: [title, category, status, clearance, location, daysAgoIncident, summary, suspectIdx[]] ──
const CASES = [
  ['Cross-border cannabis trafficking network — Rubavu corridor', 'DRUG_OFFENSE', 'UNDER_INVESTIGATION', 'SECRET', 'Rubavu District, Western Province', 62, 'Organized network smuggling cannabis (urumogi) from DRC through Lake Kivu fishing boats. Three interceptions totalling 480kg. Financial flows traced to Goma-based supplier.', [0, 33]],
  ['SIM-swap mobile money fraud syndicate', 'FRAUD', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Nyabugogo, Nyarugenge District', 45, 'Syndicate performing SIM swaps on victims’ numbers to drain MoMo wallets. 214 complainants; losses exceed RWF 87M. Insider telecom agent suspected.', [1, 31]],
  ['Umurenge SACCO embezzlement — Gitega Sector', 'CORRUPTION', 'PROSECUTION', 'CONFIDENTIAL', 'Gitega, Nyarugenge District', 120, 'Accountant diverted member savings via ghost loan accounts over 3 years. RWF 156M missing. Forensic audit complete; file transmitted to NPPA.', [2, 43]],
  ['Armed robbery of forex bureau — Commercial Street', 'ROBBERY', 'OPEN', 'SECRET', 'Nyarugenge District, Kigali', 12, 'Two armed men robbed a forex bureau of USD 43,000 and RWF 12M. CCTV footage recovered; one suspect identified via facial match. Firearm believed to be a pistol.', [3]],
  ['Human trafficking ring — Gulf states domestic work', 'TRAFFICKING', 'UNDER_INVESTIGATION', 'SECRET', 'Remera, Gasabo District', 80, 'Recruitment agency front luring young women with false domestic-work contracts. 11 victims repatriated from transit points. Network extends through Kampala and Nairobi.', [4, 10]],
  ['Land dispute homicide — Ntarama Sector', 'HOMICIDE', 'CLOSED', 'CONFIDENTIAL', 'Bugesera District, Eastern Province', 210, 'Victim fatally wounded with machete following long-running boundary dispute. Suspect convicted and sentenced to 25 years.', [5]],
  ['District procurement bribery sting', 'CORRUPTION', 'PROSECUTION', 'SECRET', 'Muhanga District, Southern Province', 95, 'Procurement officer solicited 10% kickback on road works tender. Marked bills recovered during joint RIB-Ombudsman sting operation.', [6]],
  ['Irembo phishing and bank credential harvesting', 'CYBERCRIME', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Kicukiro District, Kigali', 30, 'Cloned government-services portal harvesting national IDs and bank credentials. 3,400 victim records on seized server. Hosting traced through foreign VPS.', [7, 38]],
  ['Coltan smuggling interception — Rusizi border', 'BORDER_VIOLATION', 'UNDER_INVESTIGATION', 'SECRET', 'Rusizi District, Western Province', 55, '2.3 tonnes of undeclared coltan concealed in timber truck. Export documentation forged. Links to mineral washing station under separate investigation.', [8, 29]],
  ['Counterfeit currency distribution — Southern markets', 'FRAUD', 'OPEN', 'CONFIDENTIAL', 'Huye District, Southern Province', 18, 'High-quality counterfeit RWF 5,000 notes circulating in Huye and Muhanga markets. BNR analysis confirms common printing source. Primary distributor identified and wanted.', [9]],
  ['Ivory trafficking from Akagera — organized poaching', 'ORGANIZED_CRIME', 'UNDER_INVESTIGATION', 'SECRET', 'Kayonza District, Eastern Province', 70, 'Poaching ring with cross-border buyers. 34kg raw ivory seized at Rwamagana warehouse. RDB rangers embedded in joint taskforce; INTERPOL notice requested for financier.', [11, 44]],
  ['Cattle rustling and highway assault — Nyagatare', 'ROBBERY', 'CLOSED', 'UNCLASSIFIED', 'Nyagatare District, Eastern Province', 180, 'Gang stealing long-horn cattle at night and assaulting herders. 43 cattle recovered. Lead suspect convicted.', [12]],
  ['Pyramid scheme — fake overseas job recruitment', 'FRAUD', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Gasabo District, Kigali', 40, 'Company collected RWF 480,000 "processing fees" from over 200 job seekers for non-existent placements in Qatar. Assets frozen; director cooperating.', [13]],
  ['Heroin courier interception — Kigali International Airport', 'DRUG_OFFENSE', 'PROSECUTION', 'SECRET', 'Kanombe, Kicukiro District', 88, 'Passenger arriving from Entebbe carried 1.8kg heroin in modified suitcase lining. Controlled delivery identified two receivers in Kimironko.', [14]],
  ['Kanyanga methanol poisoning network', 'ORGANIZED_CRIME', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Gicumbi District, Northern Province', 25, 'Illicit gin (kanyanga) production ring linked to two methanol deaths. Three distilleries dismantled; distribution chain mapped across four sectors.', [19]],
  ['Illegal firearms trafficking — Burundi border', 'ORGANIZED_CRIME', 'OPEN', 'TOP_SECRET', 'Bugesera District, Eastern Province', 9, 'Intelligence indicates AK-pattern rifles moved in charcoal sacks via Akanyaru wetland crossings. Dealer identified; surveillance ongoing with RDF support.', [16]],
  ['Motorbike gang smartphone snatching series', 'ROBBERY', 'CLOSED', 'UNCLASSIFIED', 'Kicukiro District, Kigali', 150, 'Serial phone-snatching along Sonatube-Gikondo corridor; 27 incidents linked by MO. Two arrests; stolen devices recovered from Nyabugogo resale stalls.', [17]],
  ['Forged land titles — Gasabo land registry', 'FRAUD', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Gasabo District, Kigali', 65, 'Forged land titles used to secure bank loans. Registry insider suspected. Seven parcels affected; RLMUA records under forensic review.', [18, 35]],
  ['Fuel smuggling and adulteration — Rusumo corridor', 'BORDER_VIOLATION', 'OPEN', 'CONFIDENTIAL', 'Kirehe District, Eastern Province', 15, 'Tankers under-declaring fuel imports and blending with kerosene. RURA sampling confirms adulteration at four stations. Financial analysis in progress.', [20]],
  ['Diaspora romance-scam operation', 'CYBERCRIME', 'OPEN', 'UNCLASSIFIED', 'Musanze District, Northern Province', 22, 'Organized catfishing operation defrauding diaspora victims in Belgium and Canada. USD 210,000 traced through informal transfer channels.', [21]],
  ['Musanze bank van armed heist — follow-up', 'ROBBERY', 'PROSECUTION', 'SECRET', 'Musanze District, Northern Province', 130, 'Armed gang intercepted cash-in-transit van; RWF 210M stolen. Four convictions secured. Recovery of remaining proceeds ongoing.', [22, 34]],
  ['Grenade attack plot — financing investigation', 'TERRORISM', 'UNDER_INVESTIGATION', 'TOP_SECRET', 'Nyamirambo, Nyarugenge District', 35, 'Foiled plot targeting a crowded market. Explosives recovered in rented room. Financing traced through hawala transfers; NISS joint operation.', [23]],
  ['Child trafficking interception — Kagitumba border', 'TRAFFICKING', 'PROSECUTION', 'SECRET', 'Nyagatare District, Eastern Province', 100, 'Six minors intercepted en route to Kampala for domestic labor. Recruiter arrested; victims returned to families with MIGEPROF support.', [24]],
  ['Microfinance core-banking intrusion', 'CYBERCRIME', 'UNDER_INVESTIGATION', 'SECRET', 'Nyarugenge District, Kigali', 48, 'Unauthorized access created inflated balances across 14 accounts; RWF 63M withdrawn before detection. Insider credentials compromised or shared.', [25]],
  ['Stolen vehicle re-registration ring', 'ORGANIZED_CRIME', 'OPEN', 'CONFIDENTIAL', 'Kicukiro District, Kigali', 28, 'Vehicles stolen in Uganda re-registered with forged Rwandan plates and documents. Six vehicles impounded; RRA plate records under audit.', [26]],
  ['Cooperative funds fraud — Rwamagana', 'FRAUD', 'PROSECUTION', 'UNCLASSIFIED', 'Rwamagana District, Eastern Province', 110, 'Treasurer diverted maize cooperative funds through fictitious supplier invoices. RWF 34M missing; suspect in pre-trial detention.', [27, 43]],
  ['Genocide ideology dissemination via social media', 'OTHER', 'CLOSED', 'SECRET', 'Kigali (online)', 200, 'Coordinated accounts spreading genocide denial content. Digital forensics linked accounts to convicted individual. Sentence delivered under Law N°59/2018.', [28]],
  ['Cassiterite smuggling — Lake Kivu crossings', 'BORDER_VIOLATION', 'UNDER_INVESTIGATION', 'SECRET', 'Karongi District, Western Province', 58, 'Night canoe crossings moving cassiterite to DRC buyers avoiding export duty. Two boats seized; GPS trackers deployed on suspected routes.', [29, 8]],
  ['ATM skimming devices — Remera and Nyamirambo', 'FRAUD', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Gasabo District, Kigali', 33, 'Deep-insert skimmers recovered from three ATMs. Card data sold on foreign forums; 89 cloned-card transactions confirmed abroad.', [30]],
  ['Public funds embezzlement — fled director', 'CORRUPTION', 'OPEN', 'SECRET', 'Kigali', 20, 'Former agency director fled after High Court summons. RWF 890M in irregular payments to shell contractors. Asset freeze and red notice requested.', [32]],
  ['Highway armed robbery gang — Kigali-Musanze road', 'ROBBERY', 'UNDER_INVESTIGATION', 'SECRET', 'Gakenke District, Northern Province', 42, 'Gang staging night roadblocks robbing commuter buses. Leader in custody; two accomplices at large. Ballistics link three incidents.', [34, 3]],
  ['Fake diplomas and identity documents workshop', 'FRAUD', 'OPEN', 'CONFIDENTIAL', 'Nyamirambo, Nyarugenge District', 14, 'Print workshop producing forged university diplomas and IDs. High-resolution templates for four institutions recovered from seized computer.', [35]],
  ['Defilement case — Nyamagabe community report', 'SEXUAL_OFFENSE', 'PROSECUTION', 'CONFIDENTIAL', 'Nyamagabe District, Southern Province', 75, 'Minor victim; suspect arrested following village leader report through DIV channel. Medical and psychological support engaged; file with NPPA.', [36]],
  ['Counterfeit pharmaceuticals in rural clinics', 'ORGANIZED_CRIME', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Ngoma District, Eastern Province', 50, 'Fake antimalarials and antibiotics found in three private clinics. Rwanda FDA joint sampling; supply chain traced to cross-border wholesaler.', [37]],
  ['Ransomware extortion of SMEs', 'CYBERCRIME', 'OPEN', 'SECRET', 'Kigali (online)', 7, 'Five SMEs hit by ransomware demanding USD payments in cryptocurrency. Common initial access via cracked accounting software. Wallet clustering underway.', [38, 41]],
  ['Cross-border trafficking of minors — Cyanika', 'TRAFFICKING', 'UNDER_INVESTIGATION', 'SECRET', 'Burera District, Northern Province', 38, 'Network moving minors to Ugandan plantations. Suspect in pre-trial custody; two victims placed in protection. Coordination with Ugandan CID.', [39, 24]],
  ['Gold-trading dispute homicide', 'HOMICIDE', 'CLOSED', 'SECRET', 'Rusizi District, Western Province', 160, 'Business partner killed over informal gold-trade proceeds. Conviction secured; asset trail revealed undeclared cross-border gold flows (separate file).', [40]],
  ['Social-media account takeover fraud', 'CYBERCRIME', 'OPEN', 'UNCLASSIFIED', 'Kigali (online)', 11, 'SME business pages hijacked and used to scam followers with fake promotions. 47 complaints consolidated; recovery contact traced to single device cluster.', [41]],
  ['Illegal mining operation collapse — Rutsiro', 'OTHER', 'UNDER_INVESTIGATION', 'CONFIDENTIAL', 'Rutsiro District, Western Province', 53, 'Unlicensed wolfram pit collapse injured six miners. Site operator charged with endangerment and illegal exploitation; RMB joint inspection.', [42]],
  ['Rhino-horn trafficking — INTERPOL coordination', 'ORGANIZED_CRIME', 'COLD', 'TOP_SECRET', 'Kigali / transnational', 300, 'Transnational network moving rhino horn through Kigali transit. Principal target fled region; case cold pending INTERPOL purple notice response.', [44, 11]],
  ['Nyabugogo bus-park pickpocket syndicate', 'ROBBERY', 'COLD', 'UNCLASSIFIED', 'Nyabugogo, Nyarugenge District', 240, 'Organized pickpocketing ring at bus terminal. Leads exhausted after key witness relocation; file cold pending new intelligence.', []],
]

// RIB investigators for lead rotation
const LEADS = [
  'a0000003-0000-0000-0000-000000000001',
  'a0000003-0000-0000-0000-000000000002',
  'a0000003-0000-0000-0000-000000000003',
]

// ── RCS inmates: [suspectIdx, facility, block, custody, intakeDaysAgo, years, court, offense, reviewDaysAhead, threat] ──
const INMATES = [
  [0,  'Mageragere Prison',  'B-Block', 'PRE_TRIAL', 41,  null, 'Intermediate Court of Nyarugenge', 'Drug trafficking (cannabis, 480kg network)', 9,  4],
  [2,  'Nyarugenge Prison',  'D-Block', 'PRE_TRIAL', 88,  null, 'Intermediate Court of Nyarugenge', 'Embezzlement of SACCO member savings', 12, 2],
  [5,  'Mageragere Prison',  'A-Block', 'SENTENCED', 200, 25,   'High Court of Rwanda',             'Homicide (land dispute, Bugesera)', 180, 4],
  [8,  'Rubavu Prison',      'C-Block', 'PRE_TRIAL', 49,  null, 'Intermediate Court of Rusizi',     'Mineral smuggling (coltan, 2.3t)', 6,  3],
  [11, 'Rwamagana Prison',   'B-Block', 'PRE_TRIAL', 63,  null, 'Intermediate Court of Ngoma',      'Ivory trafficking (Akagera poaching ring)', 20, 5],
  [12, 'Nyagatare Prison',   'A-Block', 'SENTENCED', 170, 8,    'Intermediate Court of Nyagatare',  'Aggravated assault and cattle rustling', 90, 3],
  [19, 'Musanze Prison',     'C-Block', 'PRE_TRIAL', 21,  null, 'Intermediate Court of Gicumbi',    'Illicit alcohol production causing death', 4,  3],
  [22, 'Musanze Prison',     'A-Block', 'SENTENCED', 128, 20,   'High Court of Rwanda',             'Armed robbery (cash-in-transit heist)', 200, 4],
  [25, 'Nyarugenge Prison',  'B-Block', 'PRE_TRIAL', 44,  null, 'Intermediate Court of Nyarugenge', 'Unauthorized computer access and theft', 13, 3],
  [27, 'Nyanza Prison',      'D-Block', 'PRE_TRIAL', 105, null, 'Intermediate Court of Rwamagana',  'Fraud (cooperative funds diversion)', 7,  1],
  [28, 'Mageragere Prison',  'C-Block', 'SENTENCED', 195, 7,    'High Court of Rwanda',             'Genocide ideology dissemination', 150, 3],
  [34, 'Mageragere Prison',  'A-Block', 'PRE_TRIAL', 39,  null, 'High Court of Rwanda',             'Armed robbery (highway gang leader)', 10, 5],
  [39, 'Huye Prison',        'B-Block', 'PRE_TRIAL', 36,  null, 'Intermediate Court of Burera',     'Trafficking of minors (Cyanika route)', 8,  3],
  [40, 'Rusizi Prison',      'A-Block', 'SENTENCED', 155, 30,   'High Court of Rwanda',             'Homicide (gold-trading dispute)', 210, 4],
]

const RWANDAN_FATHERS = ['Ntawukuriryayo', 'Gasana', 'Munyakazi', 'Rutaremara', 'Bagabo', 'Serugendo', 'Mutsinzi']
const RWANDAN_MOTHERS = ['Nyirabagenzi', 'Mukandori', 'Uwamwiza', 'Nyiramatama', 'Mukansanga', 'Umuhoza', 'Nyirandegeya']
const BIRTH_PLACES = ['Nyarugenge', 'Gasabo', 'Huye', 'Musanze', 'Rubavu', 'Muhanga', 'Nyagatare', 'Karongi']

async function main() {
  console.log('── logging in as RIB-INV-001 …')
  const ribToken = await login('RIB-INV-001')

  // 1. suspects (idempotent: reuse rows created by a previous partial run)
  const { data: existingSuspects } = await db.from('suspects')
    .select('id, first_name, last_name')
    .eq('owning_institution', 'RIB')
  const existingByName = new Map(
    (existingSuspects ?? []).map(s => [`${s.first_name}|${s.last_name}`, s.id])
  )

  console.log(`── creating ${SUSPECTS.length} suspects …`)
  const suspectIds = []
  for (const [i, s] of SUSPECTS.entries()) {
    const existingId = existingByName.get(`${s.first_name}|${s.last_name}`)
    if (existingId) {
      suspectIds.push(existingId)
      process.stdout.write(`\r   suspect ${i + 1}/${SUSPECTS.length}: exists, reusing   `)
      continue
    }
    const created = await post(ribToken, '/suspects', {
      first_name: s.first_name,
      last_name: s.last_name,
      status: s.status,
      clearance_level: s.threat >= 4 ? 'SECRET' : 'CONFIDENTIAL',
      date_of_birth: s.dob,
      nationality: 'RWA', // ISO 3166-1 alpha-3 (column is CHAR(3))
      owning_institution: 'RIB',
      threat_level: s.threat,
      notes: s.notes,
    })
    suspectIds.push(created.id)
    process.stdout.write(`\r   suspect ${i + 1}/${SUSPECTS.length}: ${created.ims_reference ?? created.id}   `)
  }
  console.log()

  // 2. cases + officer assignment + suspect links (idempotent by title)
  const { data: existingCases } = await db.from('cases')
    .select('id, title')
    .eq('lead_institution', 'RIB')
  const existingCaseByTitle = new Map((existingCases ?? []).map(c => [c.title, c.id]))

  console.log(`── creating ${CASES.length} cases …`)
  const caseIds = []
  for (const [i, c] of CASES.entries()) {
    const [title, category, status, clearance, location, ago, summary, sIdx] = c
    let caseId = existingCaseByTitle.get(title)
    if (!caseId) {
      const created = await post(ribToken, '/cases', {
        title,
        category,
        status,
        clearance_level: clearance,
        lead_institution: 'RIB',
        summary,
        incident_date: daysAgo(ago),
        location_name: location,
      })
      caseId = created.id
    }
    caseIds.push({ id: caseId, ago })
    await patch(ribToken, `/cases/${caseId}`, { lead_officer_id: LEADS[i % LEADS.length] })
    for (const [j, si] of sIdx.entries()) {
      await post(ribToken, `/cases/${caseId}/suspects`, {
        suspect_id: suspectIds[si],
        role: j === 0 ? 'PRIMARY' : 'ACCOMPLICE',
      })
    }
    process.stdout.write(`\r   case ${i + 1}/${CASES.length} done   `)
  }
  console.log()

  // 3. RCS inmates
  console.log('── logging in as RCS-SUP-001 …')
  const rcsToken = await login('RCS-SUP-001')
  console.log(`── registering ${INMATES.length} inmates …`)
  const { data: existingRecords } = await db.from('corrections_records').select('suspect_id')
  const alreadyInCustody = new Set((existingRecords ?? []).map(r => r.suspect_id))
  for (const [i, m] of INMATES.entries()) {
    const [si, facility, block, custody, intakeAgo, years, court, offense, reviewAhead, threat] = m
    const s = SUSPECTS[si]
    if (alreadyInCustody.has(suspectIds[si])) {
      process.stdout.write(`\r   inmate ${i + 1}/${INMATES.length}: exists, skipping   `)
      continue
    }
    await post(rcsToken, '/corrections', {
      suspect_id: suspectIds[si],
      facility_name: facility,
      cell_block: block,
      custody_status: custody,
      intake_date: daysAgo(intakeAgo).split('T')[0],
      sentence_years: years,
      court_name: court,
      offense_description: offense,
      next_review: daysAhead(reviewAhead),
      threat_level: threat,
      father_name: RWANDAN_FATHERS[i % RWANDAN_FATHERS.length],
      mother_name: RWANDAN_MOTHERS[i % RWANDAN_MOTHERS.length],
      sex: ['Chantal','Claudine','Divine','Espérance','Josiane','Vestine','Immaculée','Clarisse','Beatha','Solange','Pascaline','Sandrine','Médiatrice','Jacqueline','Angélique','Liliane','Sylvie'].some(n => s.first_name.startsWith(n)) ? 'F' : 'M',
      place_of_birth: BIRTH_PLACES[i % BIRTH_PLACES.length],
      marital_status: i % 3 === 0 ? 'Married' : 'Single',
      profession: ['Trader', 'Farmer', 'Accountant', 'Driver', 'Technician'][i % 5],
      education_level: ['Primary', 'Secondary', 'University'][i % 3],
      health_status: 'Stable',
      children_count: i % 4,
      ...(custody === 'SENTENCED' ? {
        presiding_judge: ['Hon. Justice Mukantabana', 'Hon. Justice Rugege', 'Hon. Justice Kayitesi'][i % 3],
        verdict_date: daysAgo(intakeAgo - 5).split('T')[0],
        sentence_type: 'Imprisonment',
        court_conclusion: `Found guilty as charged. Sentenced to ${years} years imprisonment.`,
      } : {}),
    })
    process.stdout.write(`\r   inmate ${i + 1}/${INMATES.length}: ${s.first_name} ${s.last_name}   `)
  }
  console.log()

  // 4. backdate created_at so trend charts have history (service role)
  console.log('── backdating case/suspect created_at for realistic charts …')
  for (const c of caseIds) {
    const created = new Date()
    created.setDate(created.getDate() - Math.max(0, c.ago - 2))
    await db.from('cases').update({ created_at: created.toISOString() }).eq('id', c.id)
  }
  for (const [i, id] of suspectIds.entries()) {
    const created = new Date()
    created.setDate(created.getDate() - ((i * 7) % 120))
    await db.from('suspects').update({ created_at: created.toISOString() }).eq('id', id)
  }

  console.log('\n✔ Seed complete:')
  console.log(`   suspects: ${suspectIds.length}`)
  console.log(`   cases:    ${caseIds.length}`)
  console.log(`   inmates:  ${INMATES.length}`)
}

main().catch(e => { console.error('\nSEED FAILED:', e.message); process.exit(1) })
