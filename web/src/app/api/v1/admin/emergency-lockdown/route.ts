import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { invalidateSessionCache } from '@/lib/access-enforcement'
import type { AuthPayload } from '@/lib/rbac'

const PROTECTED_ROLES = ['NISS_DIRECTOR', 'NISS_OFFICER', 'SIEM_ANALYST']

// ---------------------------------------------------------------------------
// GET /api/v1/admin/emergency-lockdown
// Directors eligible to co-sign a lockdown: active NISS_DIRECTORs other than
// the caller. Lets the console offer a picker instead of asking an operator to
// paste a raw UUID during an emergency.
// Requires emergency_lockdown permission (NISS_DIRECTOR only)
// ---------------------------------------------------------------------------
export const GET = withAuth(async (_req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, badge_number, last_login_at')
      .eq('role', 'NISS_DIRECTOR')
      .eq('active', true)
      .neq('id', user.user_id)
      .order('full_name', { ascending: true })

    if (error) {
      console.error('[emergency-lockdown GET] co-signer lookup error', error)
      return apiError('Failed to load eligible directors', 500)
    }

    return apiSuccess({ directors: data ?? [], total: data?.length ?? 0 })
  } catch (err) {
    console.error('[emergency-lockdown GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'emergency_lockdown')

// ---------------------------------------------------------------------------
// POST /api/v1/admin/emergency-lockdown
// Requires emergency_lockdown permission (NISS_DIRECTOR only)
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()

    const { second_director_id, reason } = body

    if (!second_director_id || !reason) {
      return apiError('second_director_id and reason are required', 400)
    }

    if (second_director_id === user.user_id) {
      return apiError('second_director_id must be a different NISS_DIRECTOR', 400)
    }

    // Verify the second director exists and has NISS_DIRECTOR role
    const { data: secondDirector, error: directorError } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('id', second_director_id)
      .eq('role', 'NISS_DIRECTOR')
      .single()

    if (directorError || !secondDirector) {
      return apiError('Second director not found or does not have NISS_DIRECTOR role', 403)
    }

    // Revoke all sessions for non-NISS/SIEM roles.
    //
    // This used to pass a raw `SELECT` into PostgREST's `in` filter, which
    // takes a literal value list — so the filter never matched as intended and
    // the lockdown's central action did nothing. Resolve the protected users
    // first, then exclude them by id.
    const { data: protectedUsers, error: protectedError } = await supabase
      .from('users')
      .select('id')
      .in('role', PROTECTED_ROLES)

    let sessionsRevoked = 0

    if (protectedError) {
      console.error('[emergency-lockdown] protected-user lookup failed', protectedError)
      return apiError('Could not determine protected accounts — lockdown aborted', 500)
    }

    const protectedIds = (protectedUsers ?? []).map(u => u.id)

    let revokeQuery = supabase
      .from('user_sessions')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('revoked', false)

    if (protectedIds.length > 0) {
      revokeQuery = revokeQuery.not('user_id', 'in', `(${protectedIds.join(',')})`)
    }

    const { data: revokedSessions, error: revokeError } = await revokeQuery.select('id')

    if (revokeError) {
      console.error('[emergency-lockdown] session revoke error', revokeError)
      // Non-fatal — continue to log and alert, but do not claim a false count.
    } else {
      sessionsRevoked = revokedSessions?.length ?? 0
      for (const s of revokedSessions ?? []) invalidateSessionCache(s.id)
    }

    // Create SIEM event
    const lockdownDesc = `EMERGENCY LOCKDOWN activated by ${user.full_name} (${user.badge_number}) ` +
      `co-signed by ${secondDirector.full_name}. Reason: ${reason}`

    const { error: siemError } = await supabase.from('siem_events').insert({
      rule_name: 'EMERGENCY_LOCKDOWN',
      severity: 'CRITICAL',
      actor_id: user.user_id,
      actor_institution: user.institution,
      description: lockdownDesc,
      raw_data: {
        initiator_id: user.user_id,
        second_director_id,
        reason,
        timestamp: new Date().toISOString(),
      },
      auto_action: 'REVOKE_ALL_NON_NISS_SESSIONS',
      auto_actioned: true,
      reviewed: false,
      created_at: new Date().toISOString(),
    })
    if (siemError) console.error('[emergency-lockdown] siem insert error', siemError)

    // Broadcast CRITICAL alert to all institutions
    const { error: alertError } = await supabase.from('alerts').insert({
      severity: 'CRITICAL',
      source_tag: 'SYSTEM_ALERT',
      title: 'EMERGENCY LOCKDOWN ACTIVATED',
      message: `System-wide emergency lockdown has been activated. Reason: ${reason}. All non-NISS sessions have been revoked.`,
      target_institutions: null, // broadcast
      is_read: false,
      requires_action: true,
      created_at: new Date().toISOString(),
    })
    if (alertError) console.error('[emergency-lockdown] alert insert error', alertError)

    await logAudit({
      event_type: 'EMERGENCY_LOCKDOWN',
      actor: user,
      target_type: 'system',
      target_id: 'all_sessions',
      action: 'LOCKDOWN',
      justification: reason,
      after_state: {
        second_director_id,
        second_director_name: secondDirector.full_name,
        reason,
      },
    })

    return apiSuccess({
      message: `Emergency lockdown activated. ${sessionsRevoked} session${sessionsRevoked === 1 ? '' : 's'} revoked.`,
      sessions_revoked: sessionsRevoked,
    })
  } catch (err) {
    console.error('[emergency-lockdown POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'emergency_lockdown')
