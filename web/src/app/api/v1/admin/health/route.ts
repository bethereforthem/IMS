import { NextRequest } from 'next/server'
import { withAuth, apiSuccess } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (_req: NextRequest, { user: _user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const t0 = Date.now()

    // 1. Database health — measure round-trip latency
    let db_healthy = true
    let db_latency_ms = 0
    try {
      const ts = Date.now()
      const { error } = await db.from('users').select('id', { count: 'exact', head: true })
      db_latency_ms = Date.now() - ts
      if (error) db_healthy = false
    } catch {
      db_healthy = false
    }

    // 2. System controls state
    const { data: controls } = await db
      .from('system_controls')
      .select('key, value, description, set_at, set_by')

    const state: Record<string, unknown> = {}
    for (const c of controls ?? []) {
      try { state[c.key] = JSON.parse(c.value) } catch { state[c.key] = c.value }
    }

    const system_locked = state.system_locked === true || state.system_locked === 'true'
    const disabled_services: string[] = (() => {
      try {
        return Array.isArray(state.disabled_services)
          ? (state.disabled_services as string[])
          : JSON.parse(state.disabled_services as string ?? '[]')
      } catch { return [] }
    })()
    const institution_lockdowns: Record<string, string> = (() => {
      try {
        return (typeof state.institution_lockdowns === 'object' && state.institution_lockdowns !== null)
          ? (state.institution_lockdowns as Record<string, string>)
          : JSON.parse(state.institution_lockdowns as string ?? '{}')
      } catch { return {} }
    })()

    // 3. Active sessions count
    const { count: active_sessions } = await db
      .from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())

    // 4. Open security incidents by severity
    const { data: incidents } = await db
      .from('security_incidents')
      .select('severity')
      .eq('resolved', false)

    const open_incidents = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, total: 0 }
    for (const i of incidents ?? []) {
      const sev = i.severity as keyof typeof open_incidents
      if (sev in open_incidents) open_incidents[sev]++
      open_incidents.total++
    }

    // 5. User counts
    const [{ count: total_active_users }, { count: total_locked_users }] = await Promise.all([
      db.from('users').select('id', { count: 'exact', head: true }).eq('active', true),
      db.from('users').select('id', { count: 'exact', head: true }).eq('locked', true),
    ])

    // 6. Login stats — last 24 h
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data: recentAttempts } = await db
      .from('login_attempts')
      .select('success')
      .gte('attempted_at', since24h)

    const logins_24h  = recentAttempts?.filter(r => r.success).length  ?? 0
    const failed_24h  = recentAttempts?.filter(r => !r.success).length ?? 0

    // 7. Last successful login
    const { data: lastLogin } = await db
      .from('login_attempts')
      .select('attempted_at, badge_number, full_name, institution')
      .eq('success', true)
      .order('attempted_at', { ascending: false })
      .limit(1)
      .single()

    // 8. Latest audit entry
    const { data: lastAudit } = await db
      .from('audit_log')
      .select('event_timestamp, event_type, actor_name, actor_institution')
      .order('event_timestamp', { ascending: false })
      .limit(1)
      .single()

    const all_services = ['agent_tracking', 'commander_rescue', 'sos', 'intelligence', 'camera_nodes', 'interpol']
    const service_statuses = all_services.map(key => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      enabled: !disabled_services.includes(key),
    }))

    const locked_institutions = Object.entries(institution_lockdowns).map(([inst, locked_at]) => ({ inst, locked_at }))

    return apiSuccess({
      status: db_healthy ? (system_locked ? 'LOCKED' : open_incidents.CRITICAL > 0 ? 'ALERT' : 'OPERATIONAL') : 'DEGRADED',
      db_healthy,
      db_latency_ms,
      system_locked,
      active_sessions:        active_sessions        ?? 0,
      total_active_users:     total_active_users     ?? 0,
      total_locked_users:     total_locked_users     ?? 0,
      logins_24h,
      failed_24h,
      open_incidents,
      service_statuses,
      locked_institutions,
      last_login:  lastLogin  ?? null,
      last_audit:  lastAudit  ?? null,
      checked_at:  new Date().toISOString(),
      response_time_ms: Date.now() - t0,
    })
  },
  'admin:read'
)
