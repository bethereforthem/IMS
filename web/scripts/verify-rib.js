/**
 * RIB Analysis Unit end-to-end verification.
 *
 * Exercises all six modules through the real API with real signed JWTs and
 * compares every count against the database. Writes are reverted; `audit_log`
 * entries are left in place because that table is append-only by design.
 */
const { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')
const { SignJWT } = require('jose')
const { createClient } = require('@supabase/supabase-js')

const BASE = process.env.BASE || 'http://localhost:3000/api/v1'
const secret = new TextEncoder().encode(JWT_SECRET)
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const U = {
  ANA: { user_id: 'a0000003-0000-0000-0000-000000000004', badge_number: 'RIB-ANA-004', full_name: 'Analyste Martine Uwiringiyimana', institution: 'RIB', role: 'RIB_ANALYST', clearance: 'CONFIDENTIAL', session_id: '00000000-0000-0000-0000-0000000000a1', type: 'access' },
  INV: { user_id: 'a0000003-0000-0000-0000-000000000001', badge_number: 'RIB-INV-001', full_name: 'Investigateur Pascal Habimana', institution: 'RIB', role: 'RIB_INVESTIGATOR', clearance: 'SECRET', session_id: '00000000-0000-0000-0000-0000000000a2', type: 'access' },
  PAT: { user_id: 'a0000002-0000-0000-0000-000000000009', badge_number: 'RNP-PAT-X', full_name: 'RNP Patrol', institution: 'RNP', role: 'RNP_PATROL', clearance: 'UNCLASSIFIED', session_id: '00000000-0000-0000-0000-0000000000a3', type: 'access' },
}

const CLEARANCE_RANK = { UNCLASSIFIED: 0, CONFIDENTIAL: 1, SECRET: 2, TOP_SECRET: 3 }

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

async function call(who, method, path, body) {
  const t = await new SignJWT(U[who]).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600).sign(secret)
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json; try { json = await res.json() } catch { json = null }
  return { status: res.status, json }
}

/** Rows of `table` whose `col` classification the clearance permits. */
async function dbCountAtClearance(table, col, clearance, extraEq = {}) {
  const allowed = Object.entries(CLEARANCE_RANK)
    .filter(([, r]) => r <= CLEARANCE_RANK[clearance]).map(([k]) => k)
  let q = db.from(table).select('*', { count: 'exact', head: true }).in(col, allowed)
  for (const [k, v] of Object.entries(extraEq)) q = q.eq(k, v)
  const { count } = await q
  return count
}

;(async () => {
  console.log('\n=== 1. AUTHENTICATION / AUTHORIZATION ===')
  check('unauthenticated request rejected', (await fetch(BASE + '/cases')).status === 401)
  check('forged token rejected',
    (await fetch(BASE + '/cases', { headers: { authorization: 'Bearer not.a.jwt' } })).status === 401)

  const analystReads = ['/dashboard/stats', '/intelligence/events?limit=25', '/suspects?limit=25',
    '/cases?limit=25', '/alerts?limit=25', '/ai-intelligence/predictions']
  for (const p of analystReads) {
    const r = await call('ANA', 'GET', p)
    check(`RIB_ANALYST GET ${p.split('?')[0]}`, r.status === 200, String(r.status))
  }

  check('RIB_ANALYST cannot create cases', (await call('ANA', 'POST', '/cases', { title: 'x', lead_institution: 'RIB' })).status === 403)
  check('RIB_ANALYST cannot create suspects', (await call('ANA', 'POST', '/suspects', { first_name: 'a', last_name: 'b', owning_institution: 'RIB' })).status === 403)
  const anaEvPost = await call('ANA', 'POST', '/intelligence/events', { source_tag: 'OFFICER_REPORT', notes: 'verify-probe' })
  check('RIB_ANALYST cannot inject intelligence events', anaEvPost.status === 403, String(anaEvPost.status))
  check('RNP_PATROL cannot read cases', (await call('PAT', 'GET', '/cases?limit=1')).status === 403)
  check('RNP_PATROL cannot read the intel feed', (await call('PAT', 'GET', '/intelligence/events?limit=1')).status === 403)

  console.log('\n=== 2. CLEARANCE SCOPING (no over-classified data leaks) ===')
  for (const [table, col, api, key] of [
    ['suspects', 'clearance_level', '/suspects?limit=200', 'suspects'],
    ['cases', 'clearance_level', '/cases?limit=200', 'cases'],
    ['intelligence_events', 'classification', '/intelligence/events?limit=100', 'events'],
  ]) {
    for (const who of ['ANA', 'INV']) {
      // `cases` is additionally scoped to the caller's own institution unless
      // they are NISS or RNP, so the expected count has to match that rule too.
      const expected = table === 'cases'
        ? await dbCountAtClearance(table, col, U[who].clearance, { lead_institution: U[who].institution })
        : await dbCountAtClearance(table, col, U[who].clearance)
      const r = await call(who, 'GET', api)
      check(`${who} ${table} total matches clearance-filtered DB count`,
        r.json.total === expected, `api=${r.json.total} db=${expected}`)
      const over = (r.json[key] ?? []).filter(x =>
        CLEARANCE_RANK[x.clearance_level ?? x.classification ?? 'UNCLASSIFIED'] > CLEARANCE_RANK[U[who].clearance])
      check(`${who} ${table} returns nothing above clearance`, over.length === 0, `${over.length} over-classified`)
    }
  }
  // IDOR: fetching a specific over-classified record by id must be refused
  const { data: ts } = await db.from('suspects').select('id').eq('clearance_level', 'TOP_SECRET').limit(1).maybeSingle()
  if (ts) {
    const r = await call('ANA', 'GET', `/suspects/${ts.id}`)
    check('IDOR: analyst denied a TOP_SECRET suspect by direct id', r.status === 403, String(r.status))
  }
  const { data: tsCase } = await db.from('cases').select('id, lead_institution, clearance_level, status, title')
    .eq('clearance_level', 'TOP_SECRET').limit(1).maybeSingle()
  if (tsCase) {
    check('IDOR: analyst denied a TOP_SECRET case by direct id',
      (await call('ANA', 'GET', `/cases/${tsCase.id}`)).status === 403)
    check('IDOR: investigator denied a TOP_SECRET case by direct id',
      (await call('INV', 'GET', `/cases/${tsCase.id}`)).status === 403)
    check('IDOR: investigator cannot PATCH a TOP_SECRET case',
      (await call('INV', 'PATCH', `/cases/${tsCase.id}`, { title: 'tamper' })).status === 403)
    check('IDOR: investigator cannot archive a TOP_SECRET case',
      (await call('INV', 'DELETE', `/cases/${tsCase.id}`)).status === 403)
    const { data: stillThere } = await db.from('cases').select('title, status').eq('id', tsCase.id).single()
    check('TOP_SECRET case unchanged after refused writes',
      stillThere.title === tsCase.title && stillThere.status === tsCase.status)
  }
  // Cross-institution: a case led by another institution must not be readable
  const { data: otherCase } = await db.from('cases').select('id')
    .neq('lead_institution', 'RIB').lte('clearance_level', 'SECRET').limit(1).maybeSingle()
  if (otherCase) {
    check('IDOR: RIB user denied a case led by another institution',
      (await call('INV', 'GET', `/cases/${otherCase.id}`)).status === 403)
  }
  // Privilege escalation: reclassifying a case above one's own clearance
  const { data: ownCase } = await db.from('cases').select('id, clearance_level')
    .eq('lead_institution', 'RIB').eq('clearance_level', 'CONFIDENTIAL').limit(1).maybeSingle()
  if (ownCase) {
    check('cannot classify a case above own clearance',
      (await call('INV', 'PATCH', `/cases/${ownCase.id}`, { clearance_level: 'TOP_SECRET' })).status === 403)
    check('cannot reassign a case to another institution',
      (await call('INV', 'PATCH', `/cases/${ownCase.id}`, { lead_institution: 'NISS' })).status === 403)
    const { data: unchanged } = await db.from('cases').select('clearance_level, lead_institution').eq('id', ownCase.id).single()
    check('case classification and institution unchanged after refused writes',
      unchanged.clearance_level === 'CONFIDENTIAL' && unchanged.lead_institution === 'RIB')
  }

  console.log('\n=== 3. INTEL ANALYSIS (analyst dashboard sources) ===')
  const dash = await call('ANA', 'GET', '/dashboard/stats')
  const { count: dbSuspects } = await db.from('suspects').select('*', { count: 'exact', head: true })
  check('dashboard total_suspects matches DB', dash.json.total_suspects === dbSuspects, `api=${dash.json.total_suspects} db=${dbSuspects}`)
  const hits = await call('ANA', 'GET', '/intelligence/events?limit=1&criminal_record_found=true')
  const expectedHits = await (async () => {
    const allowed = ['UNCLASSIFIED', 'CONFIDENTIAL']
    const { count } = await db.from('intelligence_events').select('*', { count: 'exact', head: true })
      .in('classification', allowed).eq('criminal_record_found', true)
    return count
  })()
  check('criminal-hit total matches DB', hits.json.total === expectedHits, `api=${hits.json.total} db=${expectedHits}`)

  console.log('\n=== 4. SUSPECTS: search / filter / paginate / relationships ===')
  const allSus = await call('INV', 'GET', '/suspects?limit=200')
  const named = allSus.json.suspects.find(s => s.full_name)
  const term = named.full_name.split(' ')[0]
  const byName = await call('INV', 'GET', `/suspects?limit=50&name=${encodeURIComponent(term)}`)
  check(`server search "${term}" returns only matches`,
    byName.json.suspects.length > 0 && byName.json.suspects.every(s =>
      (s.full_name ?? '').toLowerCase().includes(term.toLowerCase()) ||
      (s.ims_reference ?? '').toLowerCase().includes(term.toLowerCase()) ||
      (s.aliases ?? []).some(a => a.toLowerCase() === term.toLowerCase())),
    `${byName.json.suspects.length} hits`)
  const byRef = await call('INV', 'GET', `/suspects?limit=5&name=${encodeURIComponent(named.ims_reference)}`)
  check('server search matches IMS reference', byRef.json.suspects.some(s => s.id === named.id))
  const wanted = await call('INV', 'GET', '/suspects?limit=100&status=WANTED')
  check('status filter applied server-side', wanted.json.suspects.every(s => s.status === 'WANTED'), `${wanted.json.suspects.length} rows`)
  const sp1 = await call('INV', 'GET', '/suspects?page=1&page_size=10')
  const sp2 = await call('INV', 'GET', '/suspects?page=2&page_size=10')
  check('suspect pages do not overlap', !sp1.json.suspects.map(s => s.id).some(id => sp2.json.suspects.map(x => x.id).includes(id)))
  check('suspect page metadata echoed', sp2.json.page === 2 && sp2.json.page_size === 10)
  const inj = await call('INV', 'GET', '/suspects?limit=5&name=' + encodeURIComponent('x,threat_level.gte.0'))
  check('suspect search injection neutralised', inj.json.suspects.length === 0, `${inj.json.suspects.length} rows`)

  // Relationship view
  const { data: linked } = await db.from('case_suspects').select('suspect_id, case_id').limit(50)
  const linkedIds = new Set(linked.map(l => l.suspect_id))
  const target = allSus.json.suspects.find(s => linkedIds.has(s.id))
  if (target) {
    const detail = await call('INV', 'GET', `/suspects/${target.id}`)
    check('suspect detail returns 200', detail.status === 200)
    const { count: dbLinks } = await db.from('case_suspects').select('*', { count: 'exact', head: true }).eq('suspect_id', target.id)
    check('linked_cases matches case_suspects rows',
      (detail.json.linked_cases ?? []).length === dbLinks, `api=${(detail.json.linked_cases ?? []).length} db=${dbLinks}`)
    check('detail exposes warrants / custody / community reports',
      'warrants' in detail.json && 'corrections_records' in detail.json && 'community_reports' in detail.json)
    const { data: audited } = await db.from('audit_log').select('id').eq('event_type', 'SUSPECT_READ').eq('target_id', target.id).limit(1)
    check('suspect read is audit-logged', (audited ?? []).length > 0)
  }

  console.log('\n=== 5. AI INTELLIGENCE ===')
  const ai = await call('ANA', 'GET', '/ai-intelligence/predictions')
  check('analyst can read predictions', ai.status === 200, String(ai.status))
  const { data: dbRun } = await db.from('ai_prediction_runs').select('id, status')
    .eq('institution', 'RIB').eq('status', 'COMPLETED').order('completed_at', { ascending: false }).limit(1).maybeSingle()
  if (dbRun) {
    check('run served is the latest COMPLETED RIB run', ai.json.run?.id === dbRun.id, `api=${ai.json.run?.id?.slice(0, 8)} db=${dbRun.id.slice(0, 8)}`)
    const { count: dbPreds } = await db.from('ai_predictions').select('*', { count: 'exact', head: true }).eq('run_id', dbRun.id)
    check('prediction count matches DB', ai.json.predictions.length === dbPreds, `api=${ai.json.predictions.length} db=${dbPreds}`)
    check('run reports the model it actually used', !!(ai.json.run?.claude_model ?? ai.json.run?.model_version))
  }
  const { data: newestPred } = await db.from('ai_predictions').select('valid_until').order('valid_until', { ascending: false }).limit(1).maybeSingle()
  if (newestPred) {
    const expectedStale = new Date(newestPred.valid_until).getTime() < Date.now()
    check('expired predictions are flagged stale, not passed off as current',
      ai.json.stale === expectedStale, `api.stale=${ai.json.stale} expected=${expectedStale}`)
  }
  // Feedback round-trip
  if (ai.json.predictions.length > 0) {
    const pid = ai.json.predictions[0].id
    const fb = await call('ANA', 'POST', '/ai-intelligence/feedback', { prediction_id: pid, accurate: true })
    check('feedback accepted', fb.status === 200 || fb.status === 201, String(fb.status))
    const { data: fbRow } = await db.from('ai_prediction_feedback').select('*').eq('prediction_id', pid).limit(1).maybeSingle()
    check('feedback persisted to the database', !!fbRow)
    if (fbRow) await db.from('ai_prediction_feedback').delete().eq('id', fbRow.id)
  }
  check('RNP_PATROL cannot read AI predictions', (await call('PAT', 'GET', '/ai-intelligence/predictions')).status === 403)

  // The analyzer writes WHO/WHEN/WHERE/HOW/CRIME_PREDICTIONS insights that the
  // Crime Analysis tab renders. A CHECK constraint rejected them, and because
  // every insight went in one batch, that discarded the operational insights
  // too — leaving both AI tabs permanently empty.
  const { data: aiRun } = await db.from('ai_prediction_runs').select('id, institution')
    .eq('status', 'COMPLETED').limit(1).maybeSingle()
  if (aiRun) {
    const probe = (t) => ({
      run_id: aiRun.id, institution: aiRun.institution, insight_type: t,
      title: `__verify_${t}`, content: 'verification probe', priority: 'LOW',
      expires_at: new Date(Date.now() + 3600e3).toISOString(),
    })
    const ANALYSIS_TYPES = ['WHO_ANALYSIS', 'WHEN_ANALYSIS', 'WHERE_ANALYSIS', 'HOW_ANALYSIS', 'CRIME_PREDICTIONS']
    const rejected = []
    for (const t of ANALYSIS_TYPES) {
      const { error } = await db.from('ai_insight_cache').insert(probe(t))
      if (error) rejected.push(t)
    }
    await db.from('ai_insight_cache').delete().like('title', '__verify_%')
    check('ai_insight_cache accepts every insight type the analyzer writes',
      rejected.length === 0,
      rejected.length ? `rejected: ${rejected.join(', ')} — run database/migrations/20260807_ai_insight_types.sql` : 'all 5 accepted')
  }

  console.log('\n=== 6. CASES: search / filter / sort / paginate / detail ===')
  const cAll = await call('INV', 'GET', '/cases?limit=200')
  const c0 = cAll.json.cases[0]   // already clearance- and institution-scoped by the API
  const cq = await call('INV', 'GET', `/cases?limit=50&q=${encodeURIComponent(c0.case_reference)}`)
  check('case search by reference works', cq.json.cases.some(c => c.id === c0.id), `${cq.json.cases.length} hits`)
  const cOpen = await call('INV', 'GET', '/cases?limit=100&status=OPEN')
  check('single status filter applied server-side', cOpen.json.cases.every(c => c.status === 'OPEN'), `${cOpen.json.cases.length} rows`)
  const cMulti = await call('INV', 'GET', '/cases?limit=200&status=OPEN,UNDER_INVESTIGATION')
  check('multi-status filter works', cMulti.json.cases.every(c => ['OPEN', 'UNDER_INVESTIGATION'].includes(c.status)), `${cMulti.json.total} rows`)
  const cSort = await call('INV', 'GET', '/cases?limit=20&sort=title&order=asc')
  const titles = cSort.json.cases.map(c => c.title)
  check('sort=title asc is ordered', titles.every((t, i) => i === 0 || titles[i - 1].localeCompare(t) <= 0))
  check('unknown sort column falls back safely', (await call('INV', 'GET', '/cases?limit=5&sort=summary;DROP')).status === 200)
  const cp1 = await call('INV', 'GET', '/cases?page=1&page_size=5')
  const cp2 = await call('INV', 'GET', '/cases?page=2&page_size=5')
  check('case pages do not overlap', !cp1.json.cases.map(c => c.id).some(id => cp2.json.cases.map(x => x.id).includes(id)))
  const cDetail = await call('INV', 'GET', `/cases/${c0.id}`)
  check('case detail returns 200 with suspects', cDetail.status === 200 && Array.isArray(cDetail.json.suspects))
  const { count: dbCaseSus } = await db.from('case_suspects').select('*', { count: 'exact', head: true }).eq('case_id', c0.id)
  check('case suspects match case_suspects rows', (cDetail.json.suspects ?? []).length === dbCaseSus,
    `api=${(cDetail.json.suspects ?? []).length} db=${dbCaseSus}`)
  check('case classification is mapped from clearance_level', cAll.json.cases.every(c => c.classification === c.clearance_level))

  console.log('\n=== 7. INTEL EVENTS: order / filter / search / paginate ===')
  const ev = await call('INV', 'GET', '/intelligence/events?limit=100')
  const times = ev.json.events.map(e => new Date(e.created_at).getTime())
  check('events are newest-first', times.every((t, i) => i === 0 || times[i - 1] >= t))
  const evAsc = await call('INV', 'GET', '/intelligence/events?limit=50&order=asc')
  const atimes = evAsc.json.events.map(e => new Date(e.created_at).getTime())
  check('order=asc reverses the feed', atimes.every((t, i) => i === 0 || atimes[i - 1] <= t))
  check('created_at is mapped from event_timestamp', ev.json.events.every(e => e.created_at === e.event_timestamp))
  check('confidence_score is mapped from confidence', ev.json.events.every(e => e.confidence_score === e.confidence))
  check('suspect_ims_reference is populated when a suspect is linked',
    ev.json.events.filter(e => e.suspect_id).every(e => e.suspect_ims_reference != null),
    `${ev.json.events.filter(e => e.suspect_id).length} linked events`)
  const evSrc = await call('INV', 'GET', '/intelligence/events?limit=100&source_tag=NID_SCAN')
  check('source_tag filter applied server-side', evSrc.json.events.every(e => e.source_tag === 'NID_SCAN'), `${evSrc.json.total} rows`)
  const evCrim = await call('INV', 'GET', '/intelligence/events?limit=100&criminal_record_found=true')
  check('criminal_record_found filter works', evCrim.json.events.every(e => e.criminal_record_found === true), `${evCrim.json.total} rows`)
  const evNamed = ev.json.events.find(e => e.suspect_name)
  if (evNamed) {
    const t2 = evNamed.suspect_name.split(' ')[0]
    const evQ = await call('INV', 'GET', `/intelligence/events?limit=50&q=${encodeURIComponent(t2)}`)
    check(`event search "${t2}" returns only matching subjects`,
      evQ.json.events.length > 0 && evQ.json.events.every(e =>
        (e.suspect_name ?? '').toLowerCase().includes(t2.toLowerCase()) ||
        (e.suspect_ims_reference ?? '').toLowerCase().includes(t2.toLowerCase())),
      `${evQ.json.events.length} hits`)
  }
  const ep1 = await call('INV', 'GET', '/intelligence/events?page=1&page_size=10')
  const ep2 = await call('INV', 'GET', '/intelligence/events?page=2&page_size=10')
  check('event pages do not overlap', !ep1.json.events.map(e => e.id).some(id => ep2.json.events.map(x => x.id).includes(id)))
  check('event page metadata echoed', ep2.json.page === 2 && ep2.json.page_size === 10)

  console.log('\n=== 8. ALERTS: institution scoping + acknowledgement ===')
  const aRib = await call('ANA', 'GET', '/alerts?limit=200')
  const aPat = await call('PAT', 'GET', '/alerts?limit=200')
  check('alerts are institution-scoped', aRib.json.total !== aPat.json.total || aRib.json.total === 0,
    `RIB=${aRib.json.total} RNP=${aPat.json.total}`)
  const unread = await call('ANA', 'GET', '/alerts?limit=50&is_read=false')
  check('unread filter works', unread.json.alerts.every(a => a.is_read === false), `${unread.json.alerts.length} unread`)
  if (unread.json.alerts.length) {
    const a = unread.json.alerts[0]
    const ack = await call('ANA', 'PATCH', `/alerts/${a.id}/read`)
    check('analyst can acknowledge an alert', ack.status === 200, String(ack.status))
    const { data: after } = await db.from('alerts').select('is_read, read_by, read_at').eq('id', a.id).single()
    check('acknowledgement persisted with reader and timestamp',
      after.is_read === true && after.read_by === U.ANA.user_id && !!after.read_at)
    const { data: audited } = await db.from('audit_log').select('id').eq('event_type', 'ALERT_ACKNOWLEDGED').eq('target_id', a.id).limit(1)
    check('acknowledgement audit-logged', (audited ?? []).length > 0)
    await db.from('alerts').update({ is_read: false, read_by: null, read_at: null }).eq('id', a.id)
  }

  console.log('\n=== 9. CLEANUP CHECK ===')
  const { count: strayEvents } = await db.from('intelligence_events').select('*', { count: 'exact', head: true }).eq('notes', 'verify-probe')
  check('no probe events left in the database', strayEvents === 0, `${strayEvents} stray`)

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
})().catch(e => { console.error('VERIFY CRASHED', e); process.exit(1) })
