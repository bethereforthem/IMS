import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/alerts/sos/acknowledge
// Commander acknowledges an SOS alert — marks it read, logs the event.
// Requires alerts:acknowledge permission.
// Body: { alert_id: string, notes?: string }
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const body = await req.json()
      const { alert_id, notes } = body as { alert_id?: string; notes?: string }

      if (!alert_id?.trim()) return apiError('alert_id is required', 400)

      // Fetch the alert to verify it exists and is actually a critical alert
      const { data: existing, error: fetchErr } = await supabase
        .from('alerts')
        .select('id, severity, title, is_read')
        .eq('id', alert_id)
        .maybeSingle()

      if (fetchErr || !existing) return apiError('Alert not found', 404)
      if (existing.severity !== 'CRITICAL') return apiError('Only CRITICAL alerts can be acknowledged via SOS acknowledge', 400)

      // Mark alert as read and no longer requires action
      const { error: updateErr } = await supabase
        .from('alerts')
        .update({ is_read: true, requires_action: false })
        .eq('id', alert_id)

      if (updateErr) {
        console.error('[alerts/sos/acknowledge POST] update error', updateErr)
        return apiError('Failed to acknowledge alert', 500)
      }

      // Close any active SOS tracking session linked to this alert so the
      // agent disappears from the commander map immediately.
      const { data: report } = await supabase
        .from('field_reports')
        .select('tracking_session_id')
        .eq('alert_id', alert_id)
        .eq('category', 'EMERGENCY')
        .maybeSingle()

      if (report?.tracking_session_id) {
        await supabase
          .from('agent_tracking_sessions')
          .update({ status: 'CLOSED', closed_at: new Date().toISOString(), closed_by: user.user_id })
          .eq('id', report.tracking_session_id)
          .in('status', ['ACTIVE', 'PAUSED'])
      }

      await logAudit({
        event_type: 'SOS_ACKNOWLEDGED',
        actor: user,
        target_type: 'alert',
        target_id: alert_id,
        action: 'UPDATE',
        after_state: {
          acknowledged_by: user.full_name,
          acknowledged_by_badge: user.badge_number,
          acknowledged_by_institution: user.institution,
          notes: notes ?? null,
          alert_title: existing.title,
        },
      })

      return apiSuccess({ acknowledged: true, alert_id })
    } catch (err) {
      console.error('[alerts/sos/acknowledge POST]', err)
      return apiError('Internal server error', 500)
    }
  },
  'alerts:acknowledge'
)
