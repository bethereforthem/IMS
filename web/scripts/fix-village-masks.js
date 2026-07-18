// One-off: re-mask national_id_or_passport in seeded community-report notes
// to last-4-digits form (••••0023). Safe to re-run.
const { createClient } = require('@supabase/supabase-js')
const { SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function main() {
  const { data: events } = await db.from('intelligence_events')
    .select('id, notes').eq('source_tag', 'OFFICER_REPORT').not('suspect_id', 'is', null)
  const nids = require('./seed-village-nids.json')
  let fixed = 0
  for (const e of events ?? []) {
    let parsed
    try { parsed = JSON.parse(e.notes) } catch { continue }
    const p = parsed.person_profile
    if (!p || !p.national_id_or_passport || !p.national_id_or_passport.includes('•')) continue
    const src = nids.find(n => n.name === parsed.person_name)
    if (!src) continue
    const digits = src.nid.replace(/\D/g, '')
    const mask = `••••${digits.slice(-4)}`
    if (p.national_id_or_passport === mask) continue
    p.national_id_or_passport = mask
    await db.from('intelligence_events').update({ notes: JSON.stringify(parsed) }).eq('id', e.id)
    fixed++
  }
  console.log(`re-masked ${fixed} report profiles`)
}
main().catch(e => { console.error(e); process.exit(1) })
