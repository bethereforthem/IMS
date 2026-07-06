import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/commander-rescue/acknowledge
// Another commander acknowledges a rescue alert and dispatches a response team.
// Requires permission: commander_rescue:trigger (all commanders can acknowledge each other)
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const body = await req.json()
      const { alert_id, notes } = body

      if (!alert_id) return apiError('alert_id is required', 400)

      const { data: alert, error: fetchErr } = await supabase
        .from('alerts')
        .select('*')
        .eq('id', alert_id)
        .single()

      if (fetchErr || !alert) return apiError('Alert not found', 404)
      if (!alert.title?.startsWith('🆘')) return apiError('Not a commander rescue alert', 400)

      const { error: updateErr } = await supabase
        .from('alerts')
        .update({
          is_read: true,
          requires_action: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert_id)

      if (updateErr) return apiError('Failed to acknowledge alert', 500)

      await logAudit({
        event_type: 'COMMANDER_RESCUE_ACKNOWLEDGED',
        actor: user,
        target_type: 'alert',
        target_id: alert_id,
        action: 'UPDATE',
        before_state: { is_read: false, requires_action: true },
        after_state: {
          is_read: true,
          requires_action: false,
          acknowledged_by: user.full_name,
          acknowledger_institution: user.institution,
          notes: notes ?? null,
        },
      })

      return apiSuccess({
        acknowledged: true,
        alert_id,
        acknowledged_by: user.full_name,
      })
    } catch (err) {
      console.error('[commander-rescue/acknowledge POST]', err)
      return apiError('Internal server error', 500)
    }
  },
  'commander_rescue:trigger'
)
