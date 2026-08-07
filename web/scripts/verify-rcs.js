/**
 * RCS end-to-end verification.
 *
 * Exercises every RCS module through the real API with real signed JWTs, then
 * reverts every write it made (except audit_log, which is append-only by design).
 */
const { JWT_SECRET, SERVICE_ROLE_KEY, SUPABASE_URL } = require('./env')
const { SignJWT } = require('jose')
const { createClient } = require('@supabase/supabase-js')

const BASE = process.env.BASE || 'http://localhost:3000/api/v1'
const secret = new TextEncoder().encode(JWT_SECRET)
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const U = {
  SUP: { user_id: 'a0000005-0000-0000-0000-000000000001', badge_number: 'RCS-SUP-001', full_name: 'Surintendant Joseph Muvunyi', institution: 'RCS', role: 'RCS_SUPERINTENDENT', clearance: 'CONFIDENTIAL', session_id: '00000000-0000-0000-0000-0000000000aa', type: 'access' },
  OFF: { user_id: 'a0000005-0000-0000-0000-000000000003', badge_number: 'RCS-OFF-003', full_name: 'Agent Didier Rutagengwa', institution: 'RCS', role: 'RCS_OFFICER', clearance: 'UNCLASSIFIED', session_id: '00000000-0000-0000-0000-0000000000bb', type: 'access' },
  RNP: { user_id: 'a0000002-0000-0000-0000-000000000001', badge_number: 'RNP-X', full_name: 'RNP Patrol', institution: 'RNP', role: 'RNP_PATROL', clearance: 'UNCLASSIFIED', session_id: '00000000-0000-0000-0000-0000000000cc', type: 'access' },
}

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

;(async () => {
  console.log('\n=== 1. AUTH / RBAC ===')
  check('unauthenticated /corrections is rejected', (await fetch(BASE + '/corrections')).status === 401)
  const badTok = await fetch(BASE + '/corrections', { headers: { authorization: 'Bearer not.a.jwt' } })
  check('forged token is rejected', badTok.status === 401)
  for (const who of ['SUP', 'OFF']) {
    for (const p of ['/corrections?limit=5', '/corrections/stats', '/corrections/events?page_size=5', '/alerts?limit=5', '/dashboard/stats']) {
      const r = await call(who, 'GET', p)
      check(`${who} GET ${p.split('?')[0]}`, r.status === 200, `${r.status}`)
    }
  }
  const rnpCorr = await call('RNP', 'GET', '/corrections?limit=1')
  check('RNP_PATROL cannot read corrections', rnpCorr.status === 403, `${rnpCorr.status}`)
  const offWrite = await call('OFF', 'PATCH', '/corrections/00000000-0000-0000-0000-000000000000', { notes: 'x' })
  check('RCS_OFFICER has corrections:write (404 not 403)', offWrite.status === 404, `${offWrite.status}`)

  console.log('\n=== 2. CUSTODY OVERVIEW / STATS vs DATABASE ===')
  const stats = (await call('SUP', 'GET', '/corrections/stats')).json
  const { count: dbTotal } = await db.from('corrections_records').select('*', { count: 'exact', head: true })
  check('stats.total matches DB row count', stats.total === dbTotal, `api=${stats.total} db=${dbTotal}`)
  for (const s of ['PRE_TRIAL', 'SENTENCED', 'RELEASED']) {
    const { count } = await db.from('corrections_records').select('*', { count: 'exact', head: true }).eq('custody_status', s)
    check(`stats.by_status.${s} matches DB`, (stats.by_status[s] ?? 0) === count, `api=${stats.by_status[s] ?? 0} db=${count}`)
  }
  check('in_custody = pre_trial + sentenced', stats.in_custody === stats.pre_trial + stats.sentenced)
  const { data: facRows } = await db.from('corrections_records').select('facility_name')
  const dbFacilities = new Set(facRows.map(r => (r.facility_name ?? '').trim() || 'Unassigned'))
  check('by_facility covers every distinct facility', stats.by_facility.length === dbFacilities.size, `api=${stats.by_facility.length} db=${dbFacilities.size}`)
  check('monthly series has 6 months', stats.monthly.length === 6)
  check('no hardcoded numbers in stats', stats.total > 0 && stats.by_facility.every(f => f.total > 0))

  console.log('\n=== 3. INMATES: list / search / filter / sort / paginate ===')
  const all = await call('SUP', 'GET', '/corrections?limit=200')
  check('list total matches DB', all.json.total === dbTotal, `api=${all.json.total} db=${dbTotal}`)
  check('list joins suspect identity', all.json.records.every(r => 'full_name' in r && 'ims_reference' in r))
  const named = all.json.records.find(r => r.full_name)
  const term = named.full_name.split(' ')[0]
  const searched = await call('SUP', 'GET', `/corrections?limit=50&q=${encodeURIComponent(term)}`)
  check(`server search "${term}" returns only matches`, searched.json.records.length > 0 &&
    searched.json.records.every(r => (r.full_name ?? '').toLowerCase().includes(term.toLowerCase()) ||
      (r.ims_reference ?? '').toLowerCase().includes(term.toLowerCase())),
    `${searched.json.records.length} hits`)
  const sent = await call('SUP', 'GET', '/corrections?limit=100&custody_status=SENTENCED')
  check('custody_status filter is applied server-side', sent.json.records.every(r => r.status === 'SENTENCED'), `${sent.json.records.length} rows`)
  const multi = await call('SUP', 'GET', '/corrections?limit=100&custody_status=PRE_TRIAL,SENTENCED')
  check('multi-status filter works', multi.json.total === stats.in_custody, `api=${multi.json.total} stats=${stats.in_custody}`)
  const fac = stats.by_facility[0].facility_name
  const facFiltered = await call('SUP', 'GET', `/corrections?limit=100&facility_name=${encodeURIComponent(fac)}`)
  check(`facility filter "${fac}"`, facFiltered.json.records.every(r => (r.facility ?? '').includes(fac)), `${facFiltered.json.records.length} rows`)
  const sorted = await call('SUP', 'GET', '/corrections?limit=20&sort=threat_level&order=desc')
  const levels = sorted.json.records.map(r => r.threat_level).filter(v => v != null)
  check('sort=threat_level desc is ordered', levels.every((v, i) => i === 0 || levels[i - 1] >= v), levels.join(','))
  const p1 = await call('SUP', 'GET', '/corrections?page=1&page_size=5&sort=created_at&order=desc')
  const p2 = await call('SUP', 'GET', '/corrections?page=2&page_size=5&sort=created_at&order=desc')
  const ids1 = p1.json.records.map(r => r.id), ids2 = p2.json.records.map(r => r.id)
  check('pages do not overlap', !ids1.some(id => ids2.includes(id)))
  check('page metadata is echoed', p2.json.page === 2 && p2.json.page_size === 5)
  const injected = await call('SUP', 'GET', '/corrections?limit=5&q=' + encodeURIComponent('x,threat_level.gte.0'))
  check('search filter injection is neutralised', injected.json.records.length === 0, `${injected.json.records.length} rows`)

  console.log('\n=== 4. CORRECTIONS REC: detail + write ===')
  const target = all.json.records.find(r => r.status === 'PRE_TRIAL')
  const detail = await call('SUP', 'GET', `/corrections/${target.id}`)
  check('detail returns the record with suspect join', detail.status === 200 && !!detail.json.suspects)
  const { data: dbRow } = await db.from('corrections_records').select('*').eq('id', target.id).single()
  check('detail matches the database row', detail.json.facility_name === dbRow.facility_name && detail.json.custody_status === dbRow.custody_status)
  check('unknown id returns 404', (await call('SUP', 'GET', '/corrections/11111111-1111-1111-1111-111111111111')).status === 404)

  const origNotes = dbRow.notes
  const patched = await call('SUP', 'PATCH', `/corrections/${target.id}`, { notes: 'RCS audit probe', father_name: 'PROBE' })
  check('PATCH with unmigrated columns no longer 500s', patched.status === 200, `${patched.status}`)
  check('PATCH reports dropped fields', Array.isArray(patched.json.unsupported_fields), JSON.stringify(patched.json.unsupported_fields ?? []))
  const { data: afterPatch } = await db.from('corrections_records').select('notes').eq('id', target.id).single()
  check('PATCH persisted to the database', afterPatch.notes === 'RCS audit probe')
  await call('SUP', 'PATCH', `/corrections/${target.id}`, { notes: origNotes })

  check('invalid custody_status is rejected', (await call('SUP', 'PATCH', `/corrections/${target.id}`, { custody_status: 'NOT_A_STATUS' })).status === 400)
  check('out-of-range threat_level is rejected', (await call('SUP', 'PATCH', `/corrections/${target.id}`, { threat_level: 9 })).status === 400)
  check('empty payload is rejected', (await call('SUP', 'PATCH', `/corrections/${target.id}`, { nothing_valid: 1 })).status === 400)
  check('POST without suspect_id is rejected', (await call('SUP', 'POST', '/corrections', { facility_name: 'X' })).status === 400)
  check('POST with unknown suspect is rejected', (await call('SUP', 'POST', '/corrections', { suspect_id: '11111111-1111-1111-1111-111111111111', facility_name: 'X' })).status === 404)

  console.log('\n=== 5. ESCAPE PROTOCOL (write + revert) ===')
  const { count: alertsBefore } = await db.from('alerts').select('*', { count: 'exact', head: true })
  const esc = await call('SUP', 'PATCH', `/corrections/${target.id}`, { custody_status: 'ESCAPED' })
  check('status change to ESCAPED succeeds', esc.status === 200, `${esc.status}`)
  check('escape raises a CRITICAL alert', !!esc.json.escape_alert_id, esc.json.escape_alert_id ?? 'none')
  let alertRow = null
  if (esc.json.escape_alert_id) {
    const { data } = await db.from('alerts').select('*').eq('id', esc.json.escape_alert_id).single()
    alertRow = data
    check('alert is CRITICAL and requires action', data.severity === 'CRITICAL' && data.requires_action === true)
    check('alert targets RCS/RNP/NISS/RDF', ['RCS', 'RNP', 'NISS', 'RDF'].every(i => data.target_institutions.includes(i)), data.target_institutions.join(','))
    const feed = await call('SUP', 'GET', '/alerts?limit=5&severity=CRITICAL')
    check('escape alert is visible on the RCS alerts feed', feed.json.alerts.some(a => a.id === data.id))
    const rnpFeed = await call('RNP', 'GET', '/alerts?limit=20&severity=CRITICAL')
    check('escape alert reaches RNP', rnpFeed.json.alerts.some(a => a.id === data.id))
  }
  const escEvents = await call('SUP', 'GET', `/corrections/events?event_type=INCIDENT&q=${encodeURIComponent(target.full_name)}`)
  check('escape appears in the custody events feed (needs custody-columns migration)',
    escEvents.json.total > 0, `${escEvents.json.total} incident events`)
  const { data: escapedAudit } = await db.from('audit_log').select('id').eq('event_type', 'CORRECTIONS_ESCAPE_REPORTED').eq('target_id', target.id)
  check('escape written to the audit trail', (escapedAudit ?? []).length > 0)

  // Revert
  await call('SUP', 'PATCH', `/corrections/${target.id}`, { custody_status: target.status })
  if (alertRow) await db.from('alerts').delete().eq('id', alertRow.id)
  const { count: alertsAfter } = await db.from('alerts').select('*', { count: 'exact', head: true })
  const { data: reverted } = await db.from('corrections_records').select('custody_status, notes').eq('id', target.id).single()
  check('record reverted to original status', reverted.custody_status === target.status, reverted.custody_status)
  check('notes reverted', (reverted.notes ?? null) === (origNotes ?? null))
  check('probe alert removed', alertsAfter === alertsBefore, `${alertsBefore} -> ${alertsAfter}`)

  console.log('\n=== 6. ALERTS: acknowledgement round-trip ===')
  const unread = await call('SUP', 'GET', '/alerts?limit=50&is_read=false')
  check('unread filter works', unread.json.alerts.every(a => a.is_read === false), `${unread.json.alerts.length} unread`)
  if (unread.json.alerts.length) {
    const a = unread.json.alerts[0]
    const ack = await call('SUP', 'PATCH', `/alerts/${a.id}/read`)
    check('acknowledge returns 200', ack.status === 200)
    const { data: after } = await db.from('alerts').select('is_read, read_by, read_at').eq('id', a.id).single()
    check('acknowledgement persisted with reader + timestamp', after.is_read === true && after.read_by === U.SUP.user_id && !!after.read_at)
    const { data: ackAudit } = await db.from('audit_log').select('id').eq('event_type', 'ALERT_ACKNOWLEDGED').eq('target_id', a.id)
    check('acknowledgement audited', (ackAudit ?? []).length > 0)
    // Revert
    await db.from('alerts').update({ is_read: false, read_by: null, read_at: null }).eq('id', a.id)
  }
  const rnpAlerts = await call('RNP', 'GET', '/alerts?limit=200')
  const rcsAlerts = await call('SUP', 'GET', '/alerts?limit=200')
  check('alerts are institution-scoped', JSON.stringify(rnpAlerts.json.alerts.map(a => a.id)) !== JSON.stringify(rcsAlerts.json.alerts.map(a => a.id)),
    `RNP=${rnpAlerts.json.total} RCS=${rcsAlerts.json.total}`)

  console.log('\n=== 7. EVENTS: feed / filter / sort / paginate ===')
  const ev = await call('SUP', 'GET', '/corrections/events?page_size=200')
  check('events feed is non-empty', ev.json.total > 0, `${ev.json.total} events`)
  const times = ev.json.events.map(e => new Date(e.occurred_at).getTime())
  check('events are newest-first', times.every((t, i) => i === 0 || times[i - 1] >= t))
  const asc = await call('SUP', 'GET', '/corrections/events?page_size=50&order=asc')
  const atimes = asc.json.events.map(e => new Date(e.occurred_at).getTime())
  check('order=asc reverses the feed', atimes.every((t, i) => i === 0 || atimes[i - 1] <= t))
  const { count: intakeCount } = await db.from('corrections_records').select('*', { count: 'exact', head: true }).not('intake_date', 'is', null)
  check('INTAKE events match records with an intake date', ev.json.counts.INTAKE === intakeCount, `feed=${ev.json.counts.INTAKE} db=${intakeCount}`)
  const withOfficer = ev.json.events.filter(e => e.officer_name)
  check('audit-sourced events carry officer attribution', withOfficer.length > 0, `${withOfficer.length} attributed`)
  const evP1 = await call('SUP', 'GET', '/corrections/events?page=1&page_size=10')
  const evP2 = await call('SUP', 'GET', '/corrections/events?page=2&page_size=10')
  check('event pages do not overlap', !evP1.json.events.map(e => e.id).some(id => evP2.json.events.map(x => x.id).includes(id)))
  const evFac = await call('SUP', 'GET', `/corrections/events?page_size=100&facility=${encodeURIComponent(ev.json.facilities[0])}`)
  check('event facility filter works', evFac.json.events.every(e => e.facility === ev.json.facilities[0]), `${evFac.json.total} events`)
  const evType = await call('SUP', 'GET', '/corrections/events?page_size=100&event_type=INTAKE')
  check('event type filter works', evType.json.events.every(e => e.event_type === 'INTAKE'))

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
})().catch(e => { console.error('VERIFY CRASHED', e); process.exit(1) })
