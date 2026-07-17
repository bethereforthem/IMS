'use client'

// ─── Shared types ──────────────────────────────────────────────────────────────

export interface PersonEntry {
  full_name: string; party_status: string; father_name: string; mother_name: string
  date_of_birth: string; sex: string; place_of_birth: string; country: string
  province: string; district: string; sector: string; cell: string; village: string
  residential_address: string; domicile_address: string; telephone: string
  email: string; national_id: string; nationality: string; marital_status: string
  profession: string; properties: string; health_status: string
  education_level: string; num_children: string; alt_contact: string
  photo?: string   // base64 data URL — optional passport-style photo
}

export interface HistoryEntry {
  case_category: string; sub_category: string; case_type: string
  crime: string; article: string; suspect_name: string; offender_type: string
}

export interface CrimeInfo {
  date_of_crime: string; time_of_crime: string; province: string; district: string
  sector: string; cell: string; village: string; exact_scene: string
  gps_lat: string; gps_lng: string
}

export interface ExhibitEntry {
  number: string; name: string; description: string; quantity: string
  condition: string; storage_location: string; file_name: string
}

export interface InvestigatorEntry {
  name: string; rank: string; institution: string; role: string
  telephone: string; email: string
}

export interface DocEntry { file_name: string; upload_date: string }

export interface ReportData {
  victims: PersonEntry[]
  suspects: PersonEntry[]
  witnesses: PersonEntry[]
  criminal_history: HistoryEntry[]
  crime_info: CrimeInfo
  exhibits: ExhibitEntry[]
  investigators: InvestigatorEntry[]
  crime_summary: string
  charge_summary: string
  investigation_findings: string
  documents: Record<string, DocEntry>
}

export interface PdfCaseInfo {
  title: string; caseRef: string; clearance: string; category: string
  status: string; lead_institution: string; incident_date: string
  location_name: string; summary: string
}

export interface PdfInvestigatorInfo {
  full_name: string; role: string; badge_number: string; institution: string
}

export interface GeneratePdfOptions {
  caseInfo: PdfCaseInfo
  report: ReportData
  investigator: PdfInvestigatorInfo
  signatureDataUrl: string | null
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const NAVY     = '#1a3a5c'   // primary brand — section headers, borders
const NAVY_MID = '#2d5a8e'   // person card header bar
const NAVY_LT  = '#eaf0f8'   // alternating table row tint
const LINE_CLR = '#b0bec5'   // pen-fill writing lines / dividers
const LBL_CLR  = '#546e7a'   // label text in kv tables

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Navy-filled section heading — white text, bold */
function sectionHeader(text: string, forcePageBreak = false): Obj {
  return {
    ...(forcePageBreak ? { pageBreak: 'before' } : {}),
    table: {
      widths: ['*'],
      body: [[{
        text: text.toUpperCase(),
        fontSize: 9.5, bold: true,
        color: '#FFFFFF',
        fillColor: NAVY,
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 14, paddingRight: () => 10,
      paddingTop: () => 8,  paddingBottom: () => 8,
    },
    margin: [0, 18, 0, 8],
  }
}

/**
 * Key-value table — always renders ALL pairs.
 * Empty values: the row's bottom rule becomes the pen-fill writing line.
 */
function kvTable(pairs: [string, string][]): Obj {
  return {
    table: {
      widths: ['32%', '68%'],
      body: pairs.map(([label, value]) => [
        { text: label, fontSize: 8, bold: true, color: LBL_CLR },
        { text: value || ' ', fontSize: 9.5, color: '#000000' },
      ]),
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: (i: number) => (i === 1 ? 0.6 : 0),
      hLineColor: () => LINE_CLR,
      vLineColor: () => LINE_CLR,
      paddingLeft: () => 8,  paddingRight: () => 8,
      paddingTop: () => 7,   paddingBottom: () => 7,
    },
    margin: [0, 0, 0, 6],
  }
}

/**
 * Narrative text block.
 * Filled: text with a navy left accent bar.
 * Empty: N ruled horizontal lines for pen writing.
 */
function narrativeBlock(text: string, lineCount = 8): Obj {
  if (text && text.trim()) {
    return {
      table: {
        widths: ['*'],
        body: [[{ text, fontSize: 10, lineHeight: 1.65 }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 3 : 0),
        vLineColor: () => NAVY,
        paddingLeft: () => 14, paddingRight: () => 0,
        paddingTop: () => 2,   paddingBottom: () => 2,
      },
      margin: [0, 4, 0, 14],
    }
  }
  const total = lineCount * 16
  return {
    canvas: Array.from({ length: lineCount }, (_, i) => ({
      type: 'line',
      x1: 0, y1: (i + 1) * 16,
      x2: 515, y2: (i + 1) * 16,
      lineWidth: 0.5, lineColor: LINE_CLR,
    })),
    margin: [0, 4, 0, 14],
    height: total + 8,
  }
}

/**
 * Grid table with repeating header row.
 * Always shows at least MIN_EMPTY_ROWS blank rows for pen completion.
 */
const MIN_EMPTY_ROWS = 3

function gridTable(headers: string[], rows: string[][]): Obj {
  const dataRows = rows.length > 0 ? rows : []
  const pad = Math.max(0, MIN_EMPTY_ROWS - dataRows.length)
  const blank: string[][] = Array.from({ length: pad }, () => headers.map(() => ''))
  const allRows = [...dataRows, ...blank]

  return {
    table: {
      headerRows: 1,
      dontBreakRows: false,
      widths: headers.map(() => '*' as '*'),
      body: [
        headers.map(h => ({
          text: h, fontSize: 8, bold: true,
          color: '#FFFFFF', fillColor: NAVY,
        })),
        ...allRows.map((row, ri) =>
          row.map(cell => ({
            text: cell || ' ',
            fontSize: 8.5,
            fillColor: ri % 2 === 1 ? NAVY_LT : null,
          }))
        ),
      ],
    },
    layout: {
      hLineWidth: (i: number, node: Obj) =>
        i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? NAVY : LINE_CLR),
      vLineColor: () => LINE_CLR,
      paddingLeft: () => 6,  paddingRight: () => 6,
      paddingTop: () => 6,   paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 10],
  }
}

/**
 * Person card with 4-column field grid (label | value | label | value).
 * Compact, professional — renders all 13 field pairs unconditionally.
 */
function personBlock(p: PersonEntry, idx: number, role: string): Obj {
  const displayName = p.full_name?.trim()

  const fieldPairs: Array<[string, string, string, string]> = [
    ['Full Name',           p.full_name,            'Party Status',        p.party_status],
    ["Father's Name",       p.father_name,           "Mother's Name",       p.mother_name],
    ['Date of Birth',       p.date_of_birth,         'Sex',                 p.sex],
    ['Place of Birth',      p.place_of_birth,        'Country',             p.country],
    ['Province',            p.province,              'District',            p.district],
    ['Sector',              p.sector,                'Cell',                p.cell],
    ['Village',             p.village,               'Residential Address', p.residential_address],
    ['Domicile Address',    p.domicile_address,      'Telephone',           p.telephone],
    ['Email',               p.email,                 'National ID / PP',    p.national_id],
    ['Nationality',         p.nationality,           'Marital Status',      p.marital_status],
    ['Profession',          p.profession,            'Properties',          p.properties],
    ['Health Status',       p.health_status,         'Education Level',     p.education_level],
    ['No. of Children',     p.num_children,          'Alternative Contact', p.alt_contact],
  ]

  const headerText = `${role.toUpperCase()} ${idx + 1}${displayName ? `   —   ${displayName}` : ''}`

  // Header bar: with photo on right, or plain full-width when no photo
  const cardHeader: Obj = p.photo
    ? {
        table: {
          widths: ['*', 62],
          body: [[
            { text: headerText, fontSize: 9, bold: true, color: '#FFFFFF', fillColor: NAVY_MID },
            {
              // Passport-style photo inset into the header
              stack: [{
                image: p.photo, width: 52, height: 66,
                alignment: 'center', fit: [52, 66],
              }],
              fillColor: '#f5f5f5',
              alignment: 'center',
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (i: number) => (i === 1 ? 2 : 0),
          vLineColor: () => NAVY,
          paddingLeft:   (i: number) => (i === 0 ? 12 : 3),
          paddingRight:  (i: number) => (i === 0 ? 8  : 3),
          paddingTop:    () => 6, paddingBottom: () => 6,
        },
        margin: [0, 0, 0, 0],
      }
    : {
        table: {
          widths: ['*'],
          body: [[{
            text: headerText, fontSize: 9, bold: true,
            color: '#FFFFFF', fillColor: NAVY_MID,
          }]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 12, paddingTop: () => 6,
          paddingBottom: () => 6, paddingRight: () => 8,
        },
        margin: [0, 0, 0, 0],
      }

  return {
    stack: [
      cardHeader,
      // 4-column field grid — identity fields emphasised in bold
      {
        table: {
          widths: ['20%', '30%', '20%', '30%'],
          body: fieldPairs.map(([l1, v1, l2, v2]) => {
            const boldValue = (label: string) =>
              ['Full Name', 'National ID / PP', 'Party Status'].includes(label)
            return [
              { text: l1,       fontSize: 7.5, bold: true, color: LBL_CLR },
              { text: v1 || ' ', fontSize: 9,  bold: boldValue(l1), color: '#000000' },
              { text: l2,       fontSize: 7.5, bold: true, color: LBL_CLR },
              { text: v2 || ' ', fontSize: 9,  bold: boldValue(l2), color: '#000000' },
            ]
          }),
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: (i: number) => (i === 2 ? 1.5 : 0.5),
          hLineColor: () => LINE_CLR,
          vLineColor: (i: number) => (i === 2 ? '#888888' : LINE_CLR),
          paddingLeft: () => 7,  paddingRight: () => 7,
          paddingTop: () => 6,   paddingBottom: () => 6,
        },
        margin: [0, 0, 0, 16],
      },
    ],
  }
}

/** All-empty PersonEntry for blank form blocks */
function emptyPerson(): PersonEntry {
  return {
    full_name: '', party_status: '', father_name: '', mother_name: '',
    date_of_birth: '', sex: '', place_of_birth: '', country: '',
    province: '', district: '', sector: '', cell: '', village: '',
    residential_address: '', domicile_address: '', telephone: '',
    email: '', national_id: '', nationality: '', marital_status: '',
    profession: '', properties: '', health_status: '',
    education_level: '', num_children: '', alt_contact: '',
    photo: undefined,
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function generateInvestigationPdf(opts: GeneratePdfOptions): Promise<void> {
  const { getPdfMake } = await import('./pdf-fonts')
  const { pdfMake, font: documentFont } = await getPdfMake()

  const { caseInfo, report, investigator, signatureDataUrl } = opts
  const {
    title, caseRef, clearance, category, status,
    lead_institution, incident_date, location_name, summary,
  } = caseInfo
  const {
    victims, suspects, witnesses, criminal_history, crime_info,
    exhibits, investigators, crime_summary, charge_summary,
    investigation_findings, documents,
  } = report

  const now = new Date()
  const reportDate =
    now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    + '  '
    + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // Contact details for the certification block: match the signing officer to
  // their entry in the investigators section (fall back to the lead entry)
  const leadInvestigatorEntry =
    investigators.find(i =>
      i.name && investigator.full_name &&
      (i.name.includes(investigator.full_name) || investigator.full_name.includes(i.name))
    ) ?? investigators[0]

  const safeStr = (v: string | undefined | null) =>
    (v ?? '').replace(/_/g, ' ').trim() || ''

  const content: Obj[] = []

  // ── Cover / Document Header ──────────────────────────────────────────────────
  content.push({
    margin: [0, 0, 0, 24],
    stack: [
      // Top accent bar (thick + thin)
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 4, lineColor: NAVY }] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: NAVY }], margin: [0, 5, 0, 16] },

      { text: 'REPUBLIC OF RWANDA', fontSize: 9, bold: true, characterSpacing: 2, alignment: 'center', color: '#555555' },
      { text: 'RWANDA INVESTIGATION BUREAU', fontSize: 15, bold: true, alignment: 'center', color: NAVY, margin: [0, 5, 0, 3] },
      { text: 'Criminal Investigation Department', fontSize: 9, italics: true, alignment: 'center', color: '#777777', margin: [0, 0, 0, 16] },

      // Thin centre rule
      { canvas: [{ type: 'line', x1: 100, y1: 0, x2: 415, y2: 0, lineWidth: 0.6, lineColor: '#aaaaaa' }], margin: [0, 0, 0, 16] },

      // Report type title
      { text: 'CRIMINAL INVESTIGATION REPORT', fontSize: 19, bold: true, alignment: 'center', characterSpacing: 1, color: '#000000', margin: [0, 0, 0, 8] },

      // Case title (when present)
      ...(title ? [{ text: title, fontSize: 12, alignment: 'center', color: '#222222', margin: [0, 0, 0, 6] as [number,number,number,number] }] : []),

      // Case reference
      { text: caseRef || '(Draft — Not Yet Submitted)', fontSize: 10, bold: true, alignment: 'center', color: '#333333', characterSpacing: 0.5, margin: [0, 0, 0, 14] },

      // Classification + category badges
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            table: {
              body: [[{
                text: `  ${clearance || 'CONFIDENTIAL'}  `,
                fontSize: 8.5, bold: true, color: '#b00000', fillColor: '#fff2f2',
              }]],
            },
            layout: {
              hLineWidth: () => 1, vLineWidth: () => 1,
              hLineColor: () => '#cc0000', vLineColor: () => '#cc0000',
              paddingTop: () => 4, paddingBottom: () => 4,
              paddingLeft: () => 10, paddingRight: () => 10,
            },
          },
          { width: 14, text: '' },
          {
            width: 'auto',
            table: {
              body: [[{
                text: `  ${safeStr(category) || 'GENERAL'}  `,
                fontSize: 8.5, bold: true, color: NAVY, fillColor: NAVY_LT,
              }]],
            },
            layout: {
              hLineWidth: () => 1, vLineWidth: () => 1,
              hLineColor: () => NAVY, vLineColor: () => NAVY,
              paddingTop: () => 4, paddingBottom: () => 4,
              paddingLeft: () => 10, paddingRight: () => 10,
            },
          },
          { width: 14, text: '' },
          {
            width: 'auto',
            table: {
              body: [[{
                text: `  ${safeStr(status) || 'PENDING'}  `,
                fontSize: 8.5, bold: true, color: '#1b5e20', fillColor: '#f1f8e9',
              }]],
            },
            layout: {
              hLineWidth: () => 1, vLineWidth: () => 1,
              hLineColor: () => '#2e7d32', vLineColor: () => '#2e7d32',
              paddingTop: () => 4, paddingBottom: () => 4,
              paddingLeft: () => 10, paddingRight: () => 10,
            },
          },
          { width: '*', text: '' },
        ],
        margin: [0, 0, 0, 16],
      },

      // Bottom accent bar (thin + thick)
      { canvas: [{ type: 'line', x1: 100, y1: 0, x2: 415, y2: 0, lineWidth: 0.6, lineColor: '#aaaaaa' }], margin: [0, 0, 0, 5] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 4, lineColor: NAVY }] },
    ],
  })

  // ── 0. Case Information ──────────────────────────────────────────────────────
  content.push(sectionHeader('0. Case Information'))

  // Case info meta grid — 2 fields per row, label above value
  const caseFieldCell = (label: string, value: string): Obj => ({
    stack: [
      { text: label, fontSize: 7, bold: true, color: '#888888', characterSpacing: 0.5 },
      value
        ? { text: value, fontSize: 10.5, bold: false, color: '#000000', margin: [0, 3, 0, 0] }
        : { text: ' ', fontSize: 10.5, margin: [0, 3, 0, 0] },
    ],
  })

  content.push({
    table: {
      widths: ['50%', '50%'],
      body: [
        [caseFieldCell('CASE TITLE', title),                    caseFieldCell('CATEGORY', safeStr(category))],
        [caseFieldCell('STATUS', safeStr(status)),              caseFieldCell('CLEARANCE LEVEL', safeStr(clearance))],
        [caseFieldCell('LEAD INSTITUTION', safeStr(lead_institution)), caseFieldCell('INCIDENT DATE', incident_date || '')],
        [caseFieldCell('LOCATION / SCENE', location_name || ''), caseFieldCell('REPORT DATE', reportDate)],
      ],
    },
    layout: {
      hLineWidth: (i: number, node: Obj) =>
        i === 0 || i === node.table.body.length ? 1.5 : 0.5,
      vLineWidth: (i: number, node: Obj) =>
        i === 0 || i === node.table.widths.length ? 1.5 : 0.5,
      hLineColor: (i: number, node: Obj) =>
        i === 0 || i === node.table.body.length ? NAVY : LINE_CLR,
      vLineColor: (i: number, node: Obj) =>
        i === 0 || i === node.table.widths.length ? NAVY : LINE_CLR,
      paddingLeft: () => 14, paddingRight: () => 12,
      paddingTop: () => 9,   paddingBottom: () => 9,
    },
    margin: [0, 0, 0, 8],
  })

  // Case summary
  content.push({ text: 'CASE SUMMARY', fontSize: 8, bold: true, color: LBL_CLR, characterSpacing: 0.5, margin: [0, 8, 0, 4] })
  content.push(narrativeBlock(summary, 4))

  // ── I. Victim(s) ─────────────────────────────────────────────────────────────
  const filledVictims = victims.filter(v => v.full_name?.trim())
  const victimList    = filledVictims.length > 0 ? filledVictims : [emptyPerson()]
  content.push(sectionHeader(`I. Victim(s)${filledVictims.length > 0 ? ` — ${filledVictims.length} recorded` : ''}`))
  victimList.forEach((v, i) => content.push(personBlock(v, i, 'Victim')))

  // ── II. Suspect(s) ───────────────────────────────────────────────────────────
  const filledSuspects = suspects.filter(s => s.full_name?.trim())
  const suspectList    = filledSuspects.length > 0 ? filledSuspects : [emptyPerson()]
  content.push(sectionHeader(`II. Suspect(s)${filledSuspects.length > 0 ? ` — ${filledSuspects.length} recorded` : ''}`))
  suspectList.forEach((s, i) => content.push(personBlock(s, i, 'Suspect')))

  // ── III. Witness(es) ─────────────────────────────────────────────────────────
  const filledWitnesses = witnesses.filter(w => w.full_name?.trim())
  const witnessList     = filledWitnesses.length > 0 ? filledWitnesses : [emptyPerson()]
  content.push(sectionHeader(`III. Witness(es)${filledWitnesses.length > 0 ? ` — ${filledWitnesses.length} recorded` : ''}`))
  witnessList.forEach((w, i) => content.push(personBlock(w, i, 'Witness')))

  // ── IV. Suspect Criminal History ─────────────────────────────────────────────
  const filledHistory = criminal_history.filter(h => h.case_category || h.crime)
  content.push(sectionHeader('IV. Suspect Criminal History'))
  content.push(gridTable(
    ['Case Category', 'Sub Category', 'Case Type', 'Crime', 'Article', 'Suspect Name', 'Offender Type'],
    filledHistory.map(h => [h.case_category, h.sub_category, h.case_type, h.crime, h.article, h.suspect_name, h.offender_type])
  ))

  // ── V. Date, Time and Place of Crime ─────────────────────────────────────────
  content.push(sectionHeader('V. Date, Time and Place of Crime'))
  content.push(kvTable([
    ['Date of Crime',     crime_info.date_of_crime],
    ['Time of Crime',     crime_info.time_of_crime],
    ['Province',          crime_info.province],
    ['District',          crime_info.district],
    ['Sector',            crime_info.sector],
    ['Cell',              crime_info.cell],
    ['Village',           crime_info.village],
    ['GPS Coordinates',   crime_info.gps_lat ? `${crime_info.gps_lat}, ${crime_info.gps_lng}` : ''],
    ['Exact Crime Scene', crime_info.exact_scene],
  ]))

  // ── VI. Exhibits ─────────────────────────────────────────────────────────────
  const filledExhibits = exhibits.filter(e => e.name?.trim())
  content.push(sectionHeader(`VI. Exhibits${filledExhibits.length > 0 ? ` — ${filledExhibits.length} recorded` : ''}`))
  content.push(gridTable(
    ['No.', 'Exhibit #', 'Name', 'Description', 'Qty', 'Condition', 'Storage Location', 'File'],
    filledExhibits.map((e, i) => [`${i + 1}`, e.number, e.name, e.description, e.quantity, e.condition, e.storage_location, e.file_name || ''])
  ))

  // ── VII. Investigators and Experts ───────────────────────────────────────────
  const filledInvestigators = investigators.filter(i => i.name?.trim())
  content.push(sectionHeader('VII. Investigators and Experts'))
  content.push(gridTable(
    ['#', 'Name', 'Rank', 'Institution', 'Role', 'Telephone', 'Email'],
    filledInvestigators.map((inv, i) => [`${i + 1}`, inv.name, inv.rank, inv.institution, inv.role, inv.telephone, inv.email])
  ))

  // ── VIII. Summary of How the Crime Was Committed ─────────────────────────────
  content.push(sectionHeader('VIII. Summary of How the Crime Was Committed'))
  content.push(narrativeBlock(crime_summary, 10))

  // ── IX. Summary of the Charge ────────────────────────────────────────────────
  content.push(sectionHeader('IX. Summary of the Charge'))
  content.push(narrativeBlock(charge_summary, 8))

  // ── X. Conclusions of the Investigators and Intelligence ──────────────────────
  content.push(sectionHeader('X. Conclusions of the Investigators and Intelligence'))
  content.push(narrativeBlock(investigation_findings, 10))

  // ── XI. Investigation Documents ──────────────────────────────────────────────
  const docEntries = Object.entries(documents).filter(([, d]) => d.file_name)
  content.push(sectionHeader('XI. Investigation Documents'))
  content.push(gridTable(
    ['#', 'Document Type', 'File Name', 'Date Uploaded'],
    docEntries.map(([name, doc], i) => [`${i + 1}`, name, doc.file_name, doc.upload_date])
  ))

  // ── XII. Certification & Signature — BOTTOM of document ──────────────────────
  const sigBox: Obj = signatureDataUrl
    ? { image: signatureDataUrl, width: 180, height: 75, alignment: 'center' }
    : {
        canvas: [{
          type: 'rect', x: 0, y: 0, w: 200, h: 75,
          lineWidth: 1, lineColor: '#aaaaaa', r: 3,
        }],
        margin: [0, 0, 0, 0],
      }

  content.push({
    margin: [0, 28, 0, 0],
    stack: [
      // Section divider — thick navy rule
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 3, lineColor: NAVY }] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: NAVY }], margin: [0, 4, 0, 12] },

      { text: 'XII. CERTIFICATION AND DECLARATION', fontSize: 10.5, bold: true, color: NAVY, margin: [0, 0, 0, 8] },
      {
        text: 'I, the undersigned officer of the Rwanda Investigation Bureau, hereby certify that all information contained in this Criminal Investigation Report is true, complete and accurate to the best of my professional knowledge and belief. This report has been prepared in strict accordance with the laws and regulations of the Republic of Rwanda.',
        fontSize: 9, lineHeight: 1.55, color: '#333333', italics: true, margin: [0, 0, 0, 22],
      },

      // Two-column: signature on the left, investigator details on the right
      {
        columns: [
          {
            width: '46%',
            alignment: 'center',
            stack: [
              { text: 'AUTHORISED SIGNATURE', fontSize: 7.5, bold: true, color: '#666666', characterSpacing: 1, margin: [0, 0, 0, 10] },
              sigBox,
              // Signature line below the box
              { canvas: [{ type: 'line', x1: 10, y1: 0, x2: 220, y2: 0, lineWidth: 1.2, lineColor: '#333333' }], margin: [0, 10, 0, 5] },
              { text: investigator.full_name || ' ', fontSize: 10, bold: true, alignment: 'center', margin: [0, 4, 0, 2] },
              { text: safeStr(investigator.role), fontSize: 8.5, color: '#444444', alignment: 'center' },
              { text: investigator.institution || '', fontSize: 8.5, color: '#666666', alignment: 'center' },
            ],
          },
          // Thin vertical separator
          {
            width: 1,
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: 200, lineWidth: 0.8, lineColor: '#cccccc' }],
            margin: [12, 0, 12, 0],
          },
          {
            width: '*',
            stack: [
              { text: 'OFFICER DETAILS', fontSize: 7.5, bold: true, color: '#666666', characterSpacing: 1, margin: [0, 0, 0, 10] },
              kvTable([
                ['Full Name',    investigator.full_name || ''],
                ['Rank / Role',  safeStr(investigator.role)],
                ['Badge Number', investigator.badge_number || ''],
                ['Institution',  investigator.institution || ''],
                ['Telephone',    leadInvestigatorEntry?.telephone || ''],
                ['Email',        leadInvestigatorEntry?.email || ''],
                ['Date Signed',  reportDate],
              ]),
            ],
          },
        ],
        columnGap: 0,
        margin: [0, 0, 0, 24],
      },

      // Stamp / seal placeholder row
      {
        columns: [
          {
            width: 'auto',
            table: {
              body: [[{
                text: '  OFFICIAL STAMP  ',
                fontSize: 8, bold: true, color: NAVY, fillColor: NAVY_LT,
              }]],
            },
            layout: {
              hLineWidth: () => 1.5, vLineWidth: () => 1.5,
              hLineColor: () => NAVY, vLineColor: () => NAVY,
              paddingTop: () => 24, paddingBottom: () => 24,
              paddingLeft: () => 30, paddingRight: () => 30,
            },
          },
          { width: '*', text: '' },
        ],
        margin: [0, 0, 0, 20],
      },

      // Legal disclaimer
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
      {
        text: `This document is classified ${clearance || 'CONFIDENTIAL'} under the laws of the Republic of Rwanda. Unauthorised disclosure, reproduction or distribution is strictly prohibited and may be subject to criminal prosecution. Generated by the Rwanda Investigation Bureau — Intelligence Management System (RIB IMS).`,
        fontSize: 7.5, color: '#888888', italics: true, alignment: 'center',
        margin: [0, 8, 0, 0],
      },
    ],
  })

  // ── Document definition ───────────────────────────────────────────────────────
  const safeFilename =
    `Investigation_Report_${(caseRef || 'draft').replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`

  const docDef: Obj = {
    pageSize: 'A4',
    pageMargins: [40, 58, 40, 52],

    // Running header — page 1 suppressed; pages 2+ show navy bar + case info + page number
    header: (currentPage: number, pageCount: number) => {
      if (currentPage === 1) return { text: '', margin: [0, 0] }
      return {
        margin: [40, 10, 40, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2.5, lineColor: NAVY }] },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: NAVY }], margin: [0, 3, 0, 4] },
          {
            columns: [
              {
                stack: [
                  { text: title || 'Investigation Report', fontSize: 8.5, bold: true, color: NAVY },
                  { text: caseRef || '(draft)', fontSize: 7.5, color: '#666666' },
                ],
                width: '*',
              },
              {
                text: `Page ${currentPage} of ${pageCount}`,
                fontSize: 8, color: '#666666', alignment: 'right',
                width: 'auto', margin: [0, 3, 0, 0],
              },
            ],
          },
        ],
      }
    },

    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 8, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
        {
          columns: [
            { text: `CLASSIFICATION: ${clearance || 'CONFIDENTIAL'}`, fontSize: 7.5, bold: true, color: '#888888', margin: [0, 4, 0, 0] },
            { text: `Rwanda Investigation Bureau  ·  Page ${currentPage} of ${pageCount}`, fontSize: 7.5, color: '#888888', alignment: 'right', margin: [0, 4, 0, 0] },
          ],
        },
      ],
    }),

    content,

    defaultStyle: {
      font: documentFont,
      fontSize: 10,
      lineHeight: 1.3,
      color: '#000000',
    },
  }

  // pdfmake 0.3: download() is promise-based
  await pdfMake.createPdf(docDef).download(safeFilename)
}
