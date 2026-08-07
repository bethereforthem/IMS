import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// PATCH /api/v1/alerts/[id]/read
// ---------------------------------------------------------------------------
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Alert ID is required', 400)

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('alerts')
      .update({
        is_read: true,
        read_by: user.user_id,
        read_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('[alerts/[id]/read PATCH]', error)
      return apiError('Failed to mark alert as read', 500)
    }

    // Acknowledging an alert is the record that an officer saw it. That was
    // written to `alerts` but never to the audit trail.
    await logAudit({
      event_type:  'ALERT_ACKNOWLEDGED',
      action:      'UPDATE',
      actor:       user,
      target_type: 'alert',
      target_id:   id,
      after_state: { is_read: true, read_by: user.user_id },
      context:     extractAuditContext(req),
    })

    return apiSuccess({ message: 'Alert marked as read' })
  } catch (err) {
    console.error('[alerts/[id]/read PATCH]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')
