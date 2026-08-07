import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import {
  invalidateControlsCache, invalidateSessionCache,
  LOCKDOWN_EXEMPT_ROLES_LIST as LOCKDOWN_EXEMPT_ROLES,
} from '@/lib/access-enforcement'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (_req: NextRequest, { user: _user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()

    const { data: controls, error } = await db
      .from('system_controls')
      .select('key, value, description, set_at')

    if (error) return apiError('Failed to fetch controls', 500)

    const state: Record<string, unknown> = {}
    for (const c of controls ?? []) {
      try { state[c.key] = JSON.parse(c.value) } catch { state[c.key] = c.value }
    }

    return apiSuccess({ controls: controls ?? [], state })
  },
  'admin:controls'
)

export const POST = withAuth(
  async (req: NextRequest, { user: actor }: { user: AuthPayload }) => {
    const db  = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    const { action, target, value } = body as { action: string; target?: string; value?: unknown }
    if (!action) return apiError('action is required', 400)

    const validActions = ['lock_system', 'unlock_system', 'lock_institution', 'unlock_institution', 'disable_service', 'enable_service']
    if (!validActions.includes(action)) return apiError(`Invalid action. Must be one of: ${validActions.join(', ')}`, 400)

    const now = new Date().toISOString()

    if (action === 'lock_system') {
      await db.from('system_controls').update({ value: 'true', set_by: actor.user_id, set_at: now }).eq('key', 'system_locked')
    } else if (action === 'unlock_system') {
      await db.from('system_controls').update({ value: 'false', set_by: actor.user_id, set_at: now }).eq('key', 'system_locked')
    } else if (action === 'lock_institution' || action === 'unlock_institution') {
      if (!target) return apiError('target (institution) required', 400)
      const { data: row } = await db.from('system_controls').select('value').eq('key', 'institution_lockdowns').single()
      let lockdowns: Record<string, string> = {}
      try { lockdowns = JSON.parse(row?.value ?? '{}') } catch { /* ignore */ }
      if (action === 'lock_institution') { lockdowns[target] = now }
      else { delete lockdowns[target] }
      await db.from('system_controls').update({ value: JSON.stringify(lockdowns), set_by: actor.user_id, set_at: now }).eq('key', 'institution_lockdowns')
    } else if (action === 'disable_service' || action === 'enable_service') {
      if (!target) return apiError('target (service key) required', 400)
      const { data: row } = await db.from('system_controls').select('value').eq('key', 'disabled_services').single()
      let services: string[] = []
      try { services = JSON.parse(row?.value ?? '[]') } catch { /* ignore */ }
      if (action === 'disable_service') { if (!services.includes(target)) services.push(target) }
      else { services = services.filter(s => s !== target) }
      await db.from('system_controls').update({ value: JSON.stringify(services), set_by: actor.user_id, set_at: now }).eq('key', 'disabled_services')
    }

    // Drop the enforcement layer's cached copy so the switch takes effect on
    // the very next request rather than after its TTL.
    invalidateControlsCache()

    // Locking only barred *new* sign-ins and blocked subsequent API calls.
    // Anyone already signed in kept a working session, which is not what "this
    // institution is locked" is understood to mean — so cut them now.
    let sessionsRevoked = 0
    if (action === 'lock_system' || action === 'lock_institution') {
      const { data: exemptUsers } = await db
        .from('users')
        .select('id')
        .in('role', LOCKDOWN_EXEMPT_ROLES)

      let revokeQuery = db
        .from('user_sessions')
        .update({ revoked: true, revoked_at: now })
        .eq('revoked', false)

      if (action === 'lock_institution' && target) {
        revokeQuery = revokeQuery.eq('institution', target)
      }

      const exemptIds = (exemptUsers ?? []).map(u => u.id)
      if (exemptIds.length > 0) {
        revokeQuery = revokeQuery.not('user_id', 'in', `(${exemptIds.join(',')})`)
      }

      const { data: revokedSessions, error: revokeError } = await revokeQuery.select('id')
      if (revokeError) {
        console.error('[admin/controls] session revoke failed', revokeError)
      } else {
        sessionsRevoked = revokedSessions?.length ?? 0
        for (const s of revokedSessions ?? []) invalidateSessionCache(s.id)
      }
    }

    await logAudit({
      event_type:  'ADMIN_ACTION',
      action:      `admin_${action}`,
      actor,
      target_type: 'system_control',
      target_id:   target ?? 'system',
      after_state: { action, target, value, sessions_revoked: sessionsRevoked },
      context:     ctx,
    }).catch(() => {})

    return apiSuccess({ applied: true, action, target, sessions_revoked: sessionsRevoked })
  },
  'admin:controls'
)
