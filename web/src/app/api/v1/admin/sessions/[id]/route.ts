import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// DELETE /api/v1/admin/sessions/:id
// Terminates a single active session without locking the user account.
// Lighter than revoke-access (which locks the account entirely).
export const DELETE = withAuth(
  async (req: NextRequest, { user: actor, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const sessionId = params?.id
    if (!sessionId) return apiError('Session ID required', 400)

    const db  = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    // Fetch session first so we can log context
    const { data: session, error: fetchErr } = await db
      .from('user_sessions')
      .select('id, user_id, badge_number, full_name, institution, role, ip_address, country_code, is_vpn, is_proxy, current_page, revoked')
      .eq('id', sessionId)
      .single()

    if (fetchErr || !session) return apiError('Session not found', 404)
    if (session.revoked)      return apiError('Session is already revoked', 409)

    // Prevent self-termination via this endpoint (use /logout instead)
    if (session.user_id === actor.user_id) {
      return apiError('Use /logout to end your own session', 400)
    }

    const { error } = await db
      .from('user_sessions')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (error) return apiError('Failed to revoke session', 500)

    await logAudit({
      event_type:  'ADMIN_ACTION',
      action:      'admin_terminate_session',
      actor,
      target_type: 'user_session',
      target_id:   sessionId,
      context:     ctx,
      after_state: {
        session_id:   sessionId,
        target_user:  session.badge_number,
        target_name:  session.full_name,
        institution:  session.institution,
        ip_address:   session.ip_address,
        country_code: session.country_code,
        is_vpn:       session.is_vpn,
        is_proxy:     session.is_proxy,
        last_page:    session.current_page,
        revoked:      true,
        reason:       'Terminated by SYSTEM_ADMIN via live activity monitor',
      },
    }).catch(() => {})

    return apiSuccess({ revoked: true, session_id: sessionId })
  },
  'admin:controls'
)
