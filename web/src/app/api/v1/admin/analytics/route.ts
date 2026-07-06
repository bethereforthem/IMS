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

    const [
      { data: activeSessions },
      { data: recentLogins },
      { data: loginsByDay },
      { data: incidentsByType },
      { data: usersByInstitution },
      { data: usersByRole },
      { data: pageVisits },
      { data: securityByDay },
    ] = await Promise.all([
      db.from('user_sessions')
        .select('institution', { count: 'exact', head: false })
        .eq('revoked', false)
        .gt('expires_at', now.toISOString()),
      db.from('login_attempts')
        .select('success, attempted_at, institution')
        .gte('attempted_at', last7d)
        .order('attempted_at', { ascending: false }),
      db.from('login_attempts')
        .select('success, attempted_at')
        .gte('attempted_at', last30d),
      db.from('security_incidents')
        .select('incident_type, severity')
        .eq('resolved', false),
      db.from('users')
        .select('institution')
        .eq('active', true),
      db.from('users')
        .select('role')
        .eq('active', true),
      db.from('page_visits')
        .select('page_path, institution, role')
        .gte('entered_at', last7d),
      db.from('security_incidents')
        .select('created_at, severity')
        .gte('created_at', last30d),
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

    const totalLogins24h = (recentLogins ?? []).filter(r => r.attempted_at >= last24h).length
    const failedLogins24h = (recentLogins ?? []).filter(r => r.attempted_at >= last24h && !r.success).length

    return apiSuccess({
      summary: {
        total_active_users: activeSessions?.length ?? 0,
        total_logins_24h: totalLogins24h,
        failed_logins_24h: failedLogins24h,
        unresolved_incidents: incidentsByType?.length ?? 0,
      },
      daily_logins,
      by_institution,
      by_role,
      by_incident_type,
      top_pages,
      daily_incidents,
      sessions_by_institution,
    })
  },
  'admin:analytics'
)
