import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import { invalidateSessionCache } from '@/lib/access-enforcement'
import { PERMISSIONS, type AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const PATCH = withAuth(
  async (req: NextRequest, { user: actor, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('User ID required', 400)

    const db = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    if (typeof body.role !== 'string' || !body.role) return apiError('role is required', 400)

    // Any string used to be forwarded straight to a `user_role` enum column,
    // so a typo surfaced as an opaque 500. Check it against the roles the
    // permission table actually knows about.
    const validRoles = Object.keys(PERMISSIONS)
    if (!validRoles.includes(body.role)) {
      return apiError(`Unknown role "${body.role}". Valid roles: ${validRoles.join(', ')}`, 400)
    }

    // Capture the previous role so the audit entry records the transition.
    const { data: before } = await db
      .from('users')
      .select('role')
      .eq('id', id)
      .maybeSingle()

    if (!before) return apiError('User not found', 404)
    if (before.role === body.role) {
      return apiSuccess({ updated: false, role: body.role, sessions_revoked: 0, unchanged: true })
    }

    const { error } = await db.from('users').update({ role: body.role }).eq('id', id)
    if (error) {
      console.error('[admin/users/permissions] update failed', error)
      return apiError('Update failed', 500)
    }

    // The role is baked into the access token, which lives for 8 hours. Without
    // revoking, a demoted user keeps their old permissions until it expires.
    const { data: revoked, error: revokeError } = await db
      .from('user_sessions')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('user_id', id)
      .eq('revoked', false)
      .select('id')

    if (revokeError) {
      console.error('[admin/users/permissions] session revoke failed', revokeError)
    } else {
      for (const s of revoked ?? []) invalidateSessionCache(s.id)
    }

    await logAudit({
      event_type: 'ADMIN_ACTION',
      action: 'admin_change_role',
      actor,
      target_type: 'user',
      target_id: id,
      context: ctx,
      before_state: { role: before.role },
      after_state: { new_role: body.role, sessions_revoked: revoked?.length ?? 0 },
    }).catch(() => {})

    return apiSuccess({
      updated: true,
      role: body.role,
      previous_role: before.role,
      sessions_revoked: revoked?.length ?? 0,
    })
  },
  'admin:users'
)
