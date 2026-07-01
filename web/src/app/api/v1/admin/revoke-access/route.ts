import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/admin/revoke-access
// Requires revocation:any or revocation:own
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const hasAny = hasPermission(user.role, 'revocation:any')
    const hasOwn = hasPermission(user.role, 'revocation:own')

    if (!hasAny && !hasOwn) {
      return apiError('Insufficient permissions — requires revocation:any or revocation:own', 403)
    }

    const supabase = createServerSupabaseClient()
    const body = await req.json()

    const { target_user_id, reason } = body

    if (!target_user_id || !reason) {
      return apiError('target_user_id and reason are required', 400)
    }

    if (target_user_id === user.user_id) {
      return apiError('You cannot revoke your own access', 400)
    }

    // Fetch the target user
    const { data: targetUser, error: fetchError } = await supabase
      .from('users')
      .select('id, full_name, badge_number, role, institution')
      .eq('id', target_user_id)
      .single()

    if (fetchError || !targetUser) {
      return apiError('Target user not found', 404)
    }

    // Institution scoping: revocation:own can only target users in same institution
    if (!hasAny && hasOwn) {
      if (targetUser.institution !== user.institution) {
        return apiError('You can only revoke access for users in your own institution', 403)
      }
    }

    // Lock the user account
    const { error: lockError } = await supabase
      .from('users')
      .update({ locked: true, locked_at: new Date().toISOString() })
      .eq('id', target_user_id)

    if (lockError) {
      console.error('[revoke-access] user lock error', lockError)
    }

    // Revoke all active sessions for the target user
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('user_id', target_user_id)
      .eq('revoked', false)

    if (sessionError) {
      console.error('[revoke-access] session revoke error', sessionError)
    }

    // Create SIEM event
    const { error: siemError } = await supabase.from('siem_events').insert({
      rule_name: 'ACCESS_REVOKED',
      severity: 'HIGH',
      actor_id: user.user_id,
      actor_institution: user.institution,
      description: `Access revoked for ${targetUser.full_name} (${targetUser.badge_number}) by ${user.full_name}. Reason: ${reason}`,
      raw_data: {
        target_user_id,
        target_institution: targetUser.institution,
        reason,
        timestamp: new Date().toISOString(),
      },
      auto_action: 'REVOKE_USER_SESSIONS',
      auto_actioned: true,
      reviewed: false,
      created_at: new Date().toISOString(),
    })
    if (siemError) console.error('[revoke-access] siem insert error', siemError)

    await logAudit({
      event_type: 'ACCESS_REVOKED',
      actor: user,
      target_type: 'user',
      target_id: target_user_id,
      action: 'REVOKE',
      justification: reason,
      after_state: {
        target_user_id,
        target_name: targetUser.full_name,
        locked: true,
        sessions_revoked: true,
      },
    })

    return apiSuccess({ message: 'Access revoked' })
  } catch (err) {
    console.error('[revoke-access POST]', err)
    return apiError('Internal server error', 500)
  }
  // JWT-only gate; permission check is inside
})