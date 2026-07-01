import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  const db = createServerSupabaseClient()

  // Revoke the current session
  const { error } = await db
    .from('user_sessions')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('id', user.session_id)
    .eq('user_id', user.user_id)

  if (error) {
    // Log but don't fail — the client should still clear its tokens
    console.error('[logout] Session revocation error:', error)
  }

  await logAudit({
    event_type: 'AUTH_LOGOUT',
    actor: user,
    action: 'logout',
    target_type: 'session',
    target_id: user.session_id,
    ip_address: req.headers.get('x-forwarded-for') ?? undefined,
  })

  return apiSuccess({ message: 'Logged out successfully' })
})
