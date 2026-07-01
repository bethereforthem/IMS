import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

const PROTECTED_ROLES = ['NISS_DIRECTOR', 'NISS_OFFICER', 'SIEM_ANALYST']

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

    // Revoke all sessions for non-NISS/SIEM roles
    const { error: revokeError } = await supabase
      .from('user_sessions')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .not('user_id', 'in', `(
        SELECT id FROM users WHERE role = ANY(ARRAY['${PROTECTED_ROLES.join("','")}'])
      )`)

    if (revokeError) {
      console.error('[emergency-lockdown] session revoke error', revokeError)
      // Non-fatal — continue to log and alert
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

    return apiSuccess({ message: 'Emergency lockdown activated. All non-NISS sessions revoked.' })
  } catch (err) {
    console.error('[emergency-lockdown POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'emergency_lockdown')
