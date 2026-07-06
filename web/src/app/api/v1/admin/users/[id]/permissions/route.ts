import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

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

    const { error } = await db.from('users').update({ role: body.role }).eq('id', id)
    if (error) return apiError('Update failed', 500)

    await logAudit({
      event_type: 'ADMIN_ACTION',
      action: 'admin_change_role',
      actor,
      target_type: 'user',
      target_id: id,
      context: ctx,
      after_state: { new_role: body.role },
    }).catch(() => {})

    return apiSuccess({ updated: true, role: body.role })
  },
  'admin:users'
)
