import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/commander-rescue/resolve
// The commander who triggered the rescue (or a superior) marks themselves safe.
// Closes the alert and stops tracking.
// Requires permission: commander_rescue:trigger
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const body = await req.json()
      const { alert_id, tracking_session_id, notes } = body

      if (!alert_id) return apiError('alert_id is required', 400)

      const { data: alert, error: fetchErr } = await supabase
        .from('alerts')
        .select('*')
        .eq('id', alert_id)
        .single()

      if (fetchErr || !alert) return apiError('Alert not found', 404)
      if (!alert.title?.startsWith('🆘')) return apiError('Not a commander rescue alert', 400)

      // Mark alert resolved
      await supabase
        .from('alerts')
        .update({
          is_read: true,
          requires_action: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert_id)

      // Close tracking session if provided
      if (tracking_session_id) {
        await supabase
          .from('agent_tracking_sessions')
          .update({ status: 'CLOSED', ended_at: new Date().toISOString() })
          .eq('id', tracking_session_id)
      }

      // Also close any ACTIVE sessions belonging to this user that match alert
      if (!tracking_session_id) {
        const { data: session } = await supabase
          .from('agent_tracking_sessions')
          .select('id')
          .eq('agent_id', user.user_id)
          .eq('status', 'ACTIVE')
          .order('started_at', { ascending: false })
          .limit(1)
          .single()

        if (session?.id) {
          await supabase
            .from('agent_tracking_sessions')
            .update({ status: 'CLOSED', ended_at: new Date().toISOString() })
            .eq('id', session.id)
        }
      }

      await logAudit({
        event_type: 'COMMANDER_RESCUE_RESOLVED',
        actor: user,
        target_type: 'alert',
        target_id: alert_id,
        action: 'UPDATE',
        after_state: {
          resolved_by: user.full_name,
          resolver_institution: user.institution,
          tracking_session_id: tracking_session_id ?? null,
          notes: notes ?? null,
        },
      })

      return apiSuccess({
        resolved: true,
        alert_id,
        tracking_closed: !!tracking_session_id,
      })
    } catch (err) {
      console.error('[commander-rescue/resolve POST]', err)
      return apiError('Internal server error', 500)
    }
  },
  'commander_rescue:trigger'
)
