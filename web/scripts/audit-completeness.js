// Audit RIB cases + reports for missing/empty fields
const { createClient } = require('@supabase/supabase-js')
const { SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function emptyPaths(obj, prefix = '') {
  const out = []
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...emptyPaths(v, `${prefix}[${i}]`)))
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (v === '' || v === null) out.push(`${prefix}.${k}`.replace(/^\./, ''))
      else out.push(...emptyPaths(v, prefix ? `${prefix}.${k}` : k))
    }
  }
  return out
}

async function main() {
  const { data: cases } = await db.from('cases')
    .select('id, case_reference, title, category, summary, incident_date, location_name, lead_officer_id')
    .eq('lead_institution', 'RIB').order('case_reference')

  console.log('── case-row gaps ──')
  for (const c of cases) {
    const missing = ['summary', 'incident_date', 'location_name', 'lead_officer_id', 'category']
      .filter(f => !c[f])
    if (missing.length) console.log(`${c.case_reference}: missing ${missing.join(', ')}`)
  }

  const { data: reports } = await db.from('investigation_reports').select('case_id, report_data')
  console.log(`\n── report gaps (${reports.length} reports) ──`)
  const fieldCounts = {}
  for (const r of reports) {
    for (const p of emptyPaths(r.report_data)) {
      const generic = p.replace(/\[\d+\]/g, '[]')
      fieldCounts[generic] = (fieldCounts[generic] ?? 0) + 1
    }
  }
  for (const [f, n] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f}: empty in ${n} place(s)`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
