import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const POST = withAuth(
  async (req: NextRequest, { user: actor, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('User ID required', 400)

    const db = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    const newPassword = body.new_password as string | undefined
    if (!newPassword || newPassword.length < 8) return apiError('new_password must be at least 8 characters', 400)

    const hash = await bcrypt.hash(newPassword, 12)
    const { error } = await db.from('users').update({
      password_hash: hash,
      locked: false,
      mfa_failures: 0,
    }).eq('id', id)

    if (error) return apiError('Reset failed', 500)

    await db.from('user_sessions').update({ revoked: true }).eq('user_id', id)

    await logAudit({
      event_type: 'ADMIN_ACTION',
      action: 'admin_reset_credentials',
      actor,
      target_type: 'user',
      target_id: id,
      context: ctx,
    }).catch(() => {})

    return apiSuccess({ reset: true })
  },
  'admin:users'
)
