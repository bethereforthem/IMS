import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (_req: NextRequest, { user: _user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const now = new Date()
    const last30d = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()
    const last7d  = new Date(now.getTime() - 7  * 24 * 3600 * 1000).toISOString()
    const last24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    // Row-returning queries are subject to PostgREST's max-rows cap, so the
    // headline figures are taken from exact COUNT queries instead — those stay
    // correct however much history the tables hold. The row fetches below feed
    // the charts only, and report when they were truncated.
    const CHART_ROW_LIMIT = 20000

    // One round of concurrent queries, not two. Split across two awaits this
    // page cost roughly double the latency of its slowest query for no reason.
    const [
      { count: exactActiveUsers },
      { count: exactActiveSessions },
      { count: exactLogins24h },
      { count: exactFailed24h },
      { count: exactOpenIncidents },
      { data: activeSessions },
      { data: recentLogins },
      { data: loginsByDay },
      { data: incidentsByType },
      { data: usersByInstitution },
      { data: usersByRole },
      { data: pageVisits },
      { data: securityByDay },
      { data: hourlyLogins },
    ] = await Promise.all([
      db.from('users').select('id', { count: 'exact', head: true }).eq('active', true),
      db.from('user_sessions').select('id', { count: 'exact', head: true })
        .eq('revoked', false).gt('expires_at', now.toISOString()),
      db.from('login_attempts').select('id', { count: 'exact', head: true })
        .gte('attempted_at', last24h).eq('success', true),
      db.from('login_attempts').select('id', { count: 'exact', head: true })
        .gte('attempted_at', last24h).eq('success', false),
      db.from('security_incidents').select('id', { count: 'exact', head: true })
        .eq('resolved', false),
      db.from('user_sessions')
        .select('institution')
        .eq('revoked', false)
        .gt('expires_at', now.toISOString())
        .limit(CHART_ROW_LIMIT),
      db.from('login_attempts')
        .select('success, attempted_at, institution')
        .gte('attempted_at', last7d)
        .order('attempted_at', { ascending: false })
        .limit(CHART_ROW_LIMIT),
      db.from('login_attempts')
        .select('success, attempted_at')
        .gte('attempted_at', last30d)
        .limit(CHART_ROW_LIMIT),
      db.from('security_incidents')
        .select('incident_type, severity')
        .eq('resolved', false)
        .limit(CHART_ROW_LIMIT),
      db.from('users')
        .select('institution')
        .eq('active', true)
        .limit(CHART_ROW_LIMIT),
      db.from('users')
        .select('role')
        .eq('active', true)
        .limit(CHART_ROW_LIMIT),
      db.from('page_visits')
        .select('page_path, institution, role')
        .gte('entered_at', last7d)
        .limit(CHART_ROW_LIMIT),
      db.from('security_incidents')
        .select('created_at, severity')
        .gte('created_at', last30d)
        .limit(CHART_ROW_LIMIT),
      // Hourly login heatmap — last 30 days
      db.from('login_attempts')
        .select('attempted_at, success')
        .gte('attempted_at', last30d)
        .limit(CHART_ROW_LIMIT),
    ])

    if (!loginsByDay) return apiError('Analytics query failed', 500)

    // Daily logins
    const loginMap: Record<string, { success: number; failed: number }> = {}
    for (const r of loginsByDay ?? []) {
      const day = r.attempted_at.slice(0, 10)
      if (!loginMap[day]) loginMap[day] = { success: 0, failed: 0 }
      if (r.success) loginMap[day].success++ ; else loginMap[day].failed++
    }
    const daily_logins = Object.entries(loginMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))

    // By institution
    const instMap: Record<string, number> = {}
    for (const u of usersByInstitution ?? []) {
      instMap[u.institution ?? 'UNKNOWN'] = (instMap[u.institution ?? 'UNKNOWN'] ?? 0) + 1
    }
    const by_institution = Object.entries(instMap).map(([name, value]) => ({ name, value }))

    // By role
    const roleMap: Record<string, number> = {}
    for (const u of usersByRole ?? []) {
      roleMap[u.role ?? 'UNKNOWN'] = (roleMap[u.role ?? 'UNKNOWN'] ?? 0) + 1
    }
    const by_role = Object.entries(roleMap).map(([name, value]) => ({ name, value }))

    // By incident type
    const incMap: Record<string, number> = {}
    for (const i of incidentsByType ?? []) {
      incMap[i.incident_type] = (incMap[i.incident_type] ?? 0) + 1
    }
    const by_incident_type = Object.entries(incMap).map(([name, value]) => ({ name, value }))

    // Top pages
    const pageMap: Record<string, number> = {}
    for (const p of pageVisits ?? []) {
      pageMap[p.page_path] = (pageMap[p.page_path] ?? 0) + 1
    }
    const top_pages = Object.entries(pageMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([path, visits]) => ({ path, visits }))

    // Security trend
    const secMap: Record<string, number> = {}
    for (const s of securityByDay ?? []) {
      const day = s.created_at.slice(0, 10)
      secMap[day] = (secMap[day] ?? 0) + 1
    }
    const daily_incidents = Object.entries(secMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))

    // Sessions by institution
    const sessionInstMap: Record<string, number> = {}
    for (const s of activeSessions ?? []) {
      sessionInstMap[s.institution ?? 'UNKNOWN'] = (sessionInstMap[s.institution ?? 'UNKNOWN'] ?? 0) + 1
    }
    const sessions_by_institution = Object.entries(sessionInstMap).map(([name, value]) => ({ name, value }))

    // Any chart dataset that came back at the cap is missing history, so the
    // page can say so rather than drawing a quietly incomplete trend.
    const charts_truncated = [
      recentLogins, loginsByDay, hourlyLogins, pageVisits, securityByDay, activeSessions,
    ].some(rows => (rows?.length ?? 0) >= CHART_ROW_LIMIT)

    // Hourly heatmap: 24 hours × 7 days-of-week grid (UTC)
    // Each cell = number of successful logins in that hour-of-day / day-of-week slot
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
    for (const r of hourlyLogins ?? []) {
      if (!r.success) continue
      const d = new Date(r.attempted_at)
      const dow  = d.getUTCDay()   // 0=Sun … 6=Sat
      const hour = d.getUTCHours() // 0-23
      heatmap[dow][hour]++
    }
    // Flatten for the chart: [{ day: 'Sun', hour: 0, value: N }, ...]
    const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const hourly_heatmap = heatmap.flatMap((row, dow) =>
      row.map((value, hour) => ({ day: DOW_LABELS[dow], hour, value }))
    )

    return apiSuccess({
      summary: {
        // This read `activeSessions.length` — rows from user_sessions, not
        // users. Every consumer labels it "Active Users", so one person signed
        // in on three devices inflated the figure threefold. All five figures
        // now come from exact COUNT queries.
        total_active_users:   exactActiveUsers    ?? 0,
        active_sessions:      exactActiveSessions ?? 0,
        total_logins_24h:     exactLogins24h      ?? 0,
        failed_logins_24h:    exactFailed24h      ?? 0,
        unresolved_incidents: exactOpenIncidents  ?? 0,
      },
      charts_truncated,
      chart_row_limit: CHART_ROW_LIMIT,
      daily_logins,
      by_institution,
      by_role,
      by_incident_type,
      top_pages,
      daily_incidents,
      sessions_by_institution,
      hourly_heatmap,
    })
  },
  'admin:analytics'
)
