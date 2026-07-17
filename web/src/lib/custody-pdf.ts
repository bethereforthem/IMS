// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>

type VisitorEntry = {
  visitor_name?: string
  relationship?: string
  national_id?: string
  phone?: string
  visit_date?: string
  visit_purpose?: string
  duration_minutes?: string | number
  officer_on_duty?: string
  notes?: string
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const RCS_ORANGE = '#B45309'
const RCS_DARK   = '#92400E'
const LINE_CLR   = '#b0bec5'
const LBL_CLR    = '#546e7a'
const NAVY_LT    = '#eaf0f8'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safe(v: unknown): string {
  if (v == null || v === '' || v === 'null' || v === 'undefined') return ''
  return String(v).replace(/_/g, ' ').trim()
}

/** Only pass base64 data URLs to pdfmake — external URLs will crash it */
function safePhoto(url: string | undefined | null): string | null {
  if (!url) return null
  const s = String(url).trim()
  if (s.startsWith('data:image/')) return s
  return null   // discard http/https URLs — pdfmake can't load them in browser
}

function sectionHeader(text: string, forcePageBreak = false): Obj {
  return {
    ...(forcePageBreak ? { pageBreak: 'before' } : {}),
    table: {
      widths: ['*'],
      body: [[{
        text: text.toUpperCase(),
        fontSize: 9.5, bold: true,
        color: '#FFFFFF',
        fillColor: RCS_DARK,
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 14, paddingRight: () => 10,
      paddingTop: () => 7, paddingBottom: () => 7,
    },
    margin: [0, 16, 0, 8],
  }
}

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
      paddingLeft: () => 8, paddingRight: () => 8,
      paddingTop: () => 6, paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 6],
  }
}

function twoColKv(pairs: [string, string, string, string][]): Obj {
  return {
    table: {
      widths: ['20%', '30%', '20%', '30%'],
      body: pairs.map(([l1, v1, l2, v2]) => [
        { text: l1, fontSize: 7.5, bold: true, color: LBL_CLR },
        { text: v1 || ' ', fontSize: 9, color: '#000000' },
        { text: l2, fontSize: 7.5, bold: true, color: LBL_CLR },
        { text: v2 || ' ', fontSize: 9, color: '#000000' },
      ]),
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: (i: number) => (i === 2 ? 1.5 : 0.5),
      hLineColor: () => LINE_CLR,
      vLineColor: (i: number) => (i === 2 ? '#888888' : LINE_CLR),
      paddingLeft: () => 7, paddingRight: () => 7,
      paddingTop: () => 6, paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 10],
  }
}

function narrativeBlock(text: string, lineCount = 6): Obj {
  if (text && text.trim()) {
    return {
      table: {
        widths: ['*'],
        body: [[{ text, fontSize: 10, lineHeight: 1.6 }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 3 : 0),
        vLineColor: () => RCS_ORANGE,
        paddingLeft: () => 12, paddingRight: () => 0,
        paddingTop: () => 2, paddingBottom: () => 2,
      },
      margin: [0, 4, 0, 12],
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
    margin: [0, 4, 0, 12],
    height: total + 8,
  }
}

function gridTable(headers: string[], rows: (string | number | null | undefined)[][]): Obj {
  const MIN_ROWS = 3
  const dataRows = rows.map(r => r.map(c => safe(c) || ' '))
  const pad = Math.max(0, MIN_ROWS - dataRows.length)
  const blank = Array.from({ length: pad }, () => headers.map(() => ' '))
  const allRows = [...dataRows, ...blank]
  return {
    table: {
      headerRows: 1,
      widths: headers.map(() => '*' as const),
      body: [
        headers.map(h => ({ text: h, fontSize: 8, bold: true, color: '#FFFFFF', fillColor: RCS_DARK })),
        ...allRows.map((row, ri) =>
          row.map(cell => ({
            text: cell,
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
      hLineColor: (i: number) => (i <= 1 ? RCS_DARK : LINE_CLR),
      vLineColor: () => LINE_CLR,
      paddingLeft: () => 6, paddingRight: () => 6,
      paddingTop: () => 5, paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 10],
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function generateCustodyPdf(
  record: Record<string, unknown>
): Promise<void> {
  const pdfMake  = (await import('pdfmake/build/pdfmake')).default
  const vfsFonts = (await import('pdfmake/build/vfs_fonts')).default
  pdfMake.vfs = vfsFonts as unknown as Record<string, string>

  const suspects = record.suspects as Record<string, unknown> | null
  const name    = safe(suspects?.full_name ?? record.full_name)
  const imsRef  = safe(suspects?.ims_reference ?? record.ims_reference)
  const status  = safe(suspects?.status ?? record.suspect_status)

  const now = new Date()
  const reportDate =
    now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    + '  ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const fmtDate = (v: unknown): string => {
    if (!v) return ''
    try {
      const d = new Date(String(v))
      if (isNaN(d.getTime())) return String(v)
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return String(v) }
  }

  // Only use photo if it is a base64 data URL — pdfmake cannot load http(s) URLs in browser
  const photoBase64 = safePhoto(record.passport_photo_url as string | undefined)

  const content: Obj[] = []

  // ── COVER ──────────────────────────────────────────────────────────────────
  content.push({
    margin: [0, 0, 0, 20],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 4, lineColor: RCS_ORANGE }] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: RCS_DARK }], margin: [0, 5, 0, 14] },
      { text: 'REPUBLIC OF RWANDA', fontSize: 9, bold: true, characterSpacing: 2, alignment: 'center', color: '#555555' },
      { text: 'RWANDA CORRECTIONAL SERVICE', fontSize: 15, bold: true, alignment: 'center', color: RCS_DARK, margin: [0, 5, 0, 3] },
      { text: 'Custody Record & Intake Form', fontSize: 9, italics: true, alignment: 'center', color: '#777777', margin: [0, 0, 0, 14] },
      { canvas: [{ type: 'line', x1: 100, y1: 0, x2: 415, y2: 0, lineWidth: 0.6, lineColor: '#aaaaaa' }], margin: [0, 0, 0, 14] },
      { text: 'OFFICIAL CUSTODY RECORD', fontSize: 18, bold: true, alignment: 'center', characterSpacing: 1, color: '#000000', margin: [0, 0, 0, 8] },
      { text: name || '(Name not recorded)', fontSize: 13, bold: true, alignment: 'center', color: '#222222', margin: [0, 0, 0, 4] },
      { text: imsRef || '', fontSize: 10, bold: true, alignment: 'center', color: RCS_ORANGE, characterSpacing: 0.5, margin: [0, 0, 0, 14] },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            table: { body: [[{ text: '  CONFIDENTIAL  ', fontSize: 8.5, bold: true, color: '#b00000', fillColor: '#fff2f2' }]] },
            layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => '#cc0000', vLineColor: () => '#cc0000', paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 10, paddingRight: () => 10 },
          },
          { width: 14, text: '' },
          {
            width: 'auto',
            table: { body: [[{ text: `  ${safe(record.custody_status) || 'PRE TRIAL'}  `, fontSize: 8.5, bold: true, color: RCS_DARK, fillColor: '#fff7ed' }]] },
            layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => RCS_ORANGE, vLineColor: () => RCS_ORANGE, paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 10, paddingRight: () => 10 },
          },
          { width: '*', text: '' },
        ],
        margin: [0, 0, 0, 16],
      },
      { canvas: [{ type: 'line', x1: 100, y1: 0, x2: 415, y2: 0, lineWidth: 0.6, lineColor: '#aaaaaa' }], margin: [0, 0, 0, 5] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 4, lineColor: RCS_ORANGE }] },
    ],
  })

  // Summary meta box
  content.push({
    table: {
      widths: ['25%', '25%', '25%', '25%'],
      body: [[
        { stack: [{ text: 'IMS REFERENCE', fontSize: 7, bold: true, color: '#888888' }, { text: imsRef || '—', fontSize: 10, bold: true, color: RCS_ORANGE, margin: [0, 3, 0, 0] }] },
        { stack: [{ text: 'SUSPECT STATUS', fontSize: 7, bold: true, color: '#888888' }, { text: status || '—', fontSize: 10, color: '#000000', margin: [0, 3, 0, 0] }] },
        { stack: [{ text: 'INTAKE DATE', fontSize: 7, bold: true, color: '#888888' }, { text: fmtDate(record.intake_date) || '—', fontSize: 10, color: '#000000', margin: [0, 3, 0, 0] }] },
        { stack: [{ text: 'REPORT GENERATED', fontSize: 7, bold: true, color: '#888888' }, { text: reportDate, fontSize: 9, color: '#555555', margin: [0, 3, 0, 0] }] },
      ]],
    },
    layout: {
      hLineWidth: (i: number, n: Obj) => i === 0 || i === n.table.body.length ? 1.5 : 0.5,
      vLineWidth: (i: number, n: Obj) => i === 0 || i === n.table.widths.length ? 1.5 : 0.5,
      hLineColor: (i: number, n: Obj) => i === 0 || i === n.table.body.length ? RCS_DARK : LINE_CLR,
      vLineColor: (i: number, n: Obj) => i === 0 || i === n.table.widths.length ? RCS_DARK : LINE_CLR,
      paddingLeft: () => 12, paddingRight: () => 12,
      paddingTop: () => 8, paddingBottom: () => 8,
    },
    margin: [0, 0, 0, 6],
  })

  // Photo + custody quick-view (only if we have a valid base64 photo)
  if (photoBase64) {
    content.push({
      columns: [
        {
          width: 80,
          stack: [
            { text: 'PASSPORT PHOTO', fontSize: 7, bold: true, color: '#888888', characterSpacing: 0.5, alignment: 'center', margin: [0, 0, 0, 4] },
            { image: photoBase64, width: 70, height: 88, alignment: 'center' },
          ],
        },
        {
          width: '*', margin: [12, 0, 0, 0],
          stack: [kvTable([
            ['Facility', safe(record.facility_name)],
            ['Cell Block', safe(record.cell_block)],
            ['Threat Level', safe(record.threat_level) ? `${record.threat_level} / 5` : ''],
            ['Next Review', fmtDate(record.next_review)],
          ])],
        },
      ],
      margin: [0, 0, 0, 6],
    })
  }

  // ── I. PERSONAL INFORMATION ────────────────────────────────────────────────
  content.push(sectionHeader('I. Personal Information'))
  content.push(twoColKv([
    ['Full Name',           safe(name),                      'Party Status',        safe(record.party_status)],
    ["Father's Name",       safe(record.father_name),         "Mother's Name",       safe(record.mother_name)],
    ['Date of Birth',       fmtDate(record.date_of_birth),    'Sex',                 safe(record.sex)],
    ['Place of Birth',      safe(record.place_of_birth),      'Nationality',         safe(record.nationality)],
    ['National ID / PP',    safe(record.national_id),         'Marital Status',      safe(record.marital_status)],
    ['Profession',          safe(record.profession),          'Education Level',     safe(record.education_level)],
    ['No. of Children',     safe(record.children_count),      'Health Status',       safe(record.health_status)],
    ['Telephone',           safe(record.phone_number),        'Email',               safe(record.email)],
    ['Residential Address', safe(record.residential_address), 'Domicile Address',    safe(record.domicile_address)],
    ['Properties / Assets', safe(record.properties_owned),    'Alternative Contact', safe(record.alternative_contact)],
  ]))

  // ── II. CUSTODY DETAILS ────────────────────────────────────────────────────
  content.push(sectionHeader('II. Custody Details'))
  content.push(kvTable([
    ['Facility',         safe(record.facility_name)],
    ['Cell Block',       safe(record.cell_block)],
    ['Custody Status',   safe(record.custody_status)],
    ['Threat Level',     safe(record.threat_level) ? `${record.threat_level} / 5` : ''],
    ['Intake Date',      fmtDate(record.intake_date)],
    ['Next Review Date', fmtDate(record.next_review)],
    ['Sentence Start',   fmtDate(record.sentence_start)],
    ['Sentence End',     fmtDate(record.sentence_end)],
    ['Release Date',     fmtDate(record.release_date)],
  ]))

  // ── III. COURT CONCLUSION ─────────────────────────────────────────────────
  content.push(sectionHeader('III. Court Conclusion'))
  content.push(kvTable([
    ['Court Name',       safe(record.court_name)],
    ['Presiding Judge',  safe(record.presiding_judge)],
    ['Verdict Date',     fmtDate(record.verdict_date)],
    ['Sentence Type',    safe(record.sentence_type)],
    ['Sentence (years)', safe(record.sentence_years)],
  ]))
  if (safe(record.offense_description)) {
    content.push({ text: 'OFFENSE DESCRIPTION', fontSize: 8, bold: true, color: LBL_CLR, characterSpacing: 0.5, margin: [0, 6, 0, 4] })
    content.push(narrativeBlock(safe(record.offense_description), 4))
  }
  if (safe(record.court_conclusion)) {
    content.push({ text: 'COURT CONCLUSION / JUDGMENT SUMMARY', fontSize: 8, bold: true, color: LBL_CLR, characterSpacing: 0.5, margin: [0, 6, 0, 4] })
    content.push(narrativeBlock(safe(record.court_conclusion), 5))
  }

  // ── IV. VISITOR LOG ───────────────────────────────────────────────────────
  content.push(sectionHeader('IV. Visitor Log', true))
  const visitorLog = Array.isArray(record.visitor_log) ? record.visitor_log as VisitorEntry[] : []
  content.push(gridTable(
    ['#', 'Visitor Name', 'Relationship', 'Visit Date', 'Duration', 'Purpose', 'Officer on Duty'],
    visitorLog.length > 0
      ? visitorLog.map((v, i) => [
          `${i + 1}`,
          safe(v.visitor_name),
          safe(v.relationship),
          fmtDate(v.visit_date),
          v.duration_minutes ? `${v.duration_minutes} min` : '',
          safe(v.visit_purpose),
          safe(v.officer_on_duty),
        ])
      : []
  ))

  // ── V. OFFICIAL NOTES ─────────────────────────────────────────────────────
  if (safe(record.notes)) {
    content.push(sectionHeader('V. Official Notes'))
    content.push(narrativeBlock(safe(record.notes), 4))
  }

  // ── SIGNATURE & CERTIFICATION ─────────────────────────────────────────────
  content.push({
    margin: [0, 24, 0, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 3, lineColor: RCS_ORANGE }] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: RCS_DARK }], margin: [0, 4, 0, 12] },
      { text: 'CERTIFICATION & AUTHORISATION', fontSize: 10, bold: true, color: RCS_DARK, margin: [0, 0, 0, 8] },
      {
        text: "This custody record has been completed in accordance with the Rwanda Correctional Service regulations. All information contained herein is accurate to the best of the recording officer's knowledge.",
        fontSize: 9, lineHeight: 1.5, color: '#333333', italics: true, margin: [0, 0, 0, 20],
      },
      {
        columns: [
          {
            width: '48%',
            stack: [
              { text: 'RECORDING OFFICER', fontSize: 7.5, bold: true, color: '#666666', characterSpacing: 1, margin: [0, 0, 0, 40] },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 215, y2: 0, lineWidth: 1.2, lineColor: '#333333' }] },
              { text: 'Signature & Stamp', fontSize: 8, color: '#777777', margin: [0, 4, 0, 0] },
            ],
          },
          {
            width: '48%',
            stack: [
              { text: 'SUPERINTENDANT / COMMANDING OFFICER', fontSize: 7.5, bold: true, color: '#666666', characterSpacing: 1, margin: [0, 0, 0, 40] },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 215, y2: 0, lineWidth: 1.2, lineColor: '#333333' }] },
              { text: 'Signature & Stamp', fontSize: 8, color: '#777777', margin: [0, 4, 0, 0] },
            ],
          },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 24],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
      {
        text: `This document is CONFIDENTIAL under the laws of the Republic of Rwanda. Generated by the Rwanda Correctional Service — Intelligence Management System (RCS IMS). Printed: ${reportDate}`,
        fontSize: 7.5, color: '#888888', italics: true, alignment: 'center', margin: [0, 8, 0, 0],
      },
    ],
  })

  // ── Document definition ────────────────────────────────────────────────────
  const safeFilename = `RCS_Custody_${(imsRef || name || 'record').replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`

  const docDef: Obj = {
    pageSize: 'A4',
    pageMargins: [40, 58, 40, 52],
    header: (currentPage: number, pageCount: number) => {
      if (currentPage === 1) return { text: '', margin: [0, 0] }
      return {
        margin: [40, 10, 40, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2.5, lineColor: RCS_ORANGE }] },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: RCS_DARK }], margin: [0, 3, 0, 4] },
          {
            columns: [
              { stack: [{ text: `CUSTODY RECORD — ${name || ''}`, fontSize: 8.5, bold: true, color: RCS_DARK }, { text: imsRef || '', fontSize: 7.5, color: '#666666' }], width: '*' },
              { text: `Page ${currentPage} of ${pageCount}`, fontSize: 8, color: '#666666', alignment: 'right', width: 'auto', margin: [0, 3, 0, 0] },
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
            { text: 'CLASSIFICATION: CONFIDENTIAL  ·  RWANDA CORRECTIONAL SERVICE', fontSize: 7.5, bold: true, color: '#888888', margin: [0, 4, 0, 0] },
            { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7.5, color: '#888888', alignment: 'right', margin: [0, 4, 0, 0] },
          ],
        },
      ],
    }),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3, color: '#000000' },
  }

  return new Promise<void>((resolve, reject) => {
    pdfMake.createPdf(docDef).download(safeFilename, () => resolve())
    // pdfmake's download doesn't throw — errors surface via callback or are silent
    // give it a 10s timeout as a fallback
    setTimeout(() => resolve(), 10_000)
  })
}
