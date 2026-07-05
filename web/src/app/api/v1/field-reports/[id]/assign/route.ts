import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

const VALID_INSTITUTIONS = ['NISS', 'RDF', 'RNP', 'RIB', 'RCS']

// PATCH /api/v1/field-reports/:id/assign
// Body: { assigned_to: ['NISS', 'RNP'], status?: 'ASSIGNED' }
export const PATCH = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing id', 400)

      const body = await req.json()
      const { assigned_to, status } = body as { assigned_to: string[]; status?: string }

      if (!Array.isArray(assigned_to) || assigned_to.length === 0) {
        return apiError('assigned_to must be a non-empty array of institution codes', 400)
      }

      const invalid = assigned_to.filter(i => !VALID_INSTITUTIONS.includes(i))
      if (invalid.length > 0) {
        return apiError(`Invalid institutions: ${invalid.join(', ')}`, 400)
      }

      const updatePayload: Record<string, unknown> = { assigned_to }
      if (status && ['OPEN','ASSIGNED','INVESTIGATING','CLOSED','PAUSED'].includes(status)) {
        updatePayload.status = status
      } else {
        updatePayload.status = 'ASSIGNED'
      }

      const { data, error } = await supabase
        .from('field_reports')
        .update(updatePayload)
        .eq('id', id)
        .select('id, status, assigned_to')
        .single()

      if (error || !data) return apiError('Update failed', 500)

      // If investigation closed, close the tracking session
      if (updatePayload.status === 'CLOSED') {
        const { data: session } = await supabase
          .from('agent_tracking_sessions')
          .select('id')
          .eq('field_report_id', id)
          .eq('status', 'ACTIVE')
          .maybeSingle()

        if (session) {
          await supabase
            .from('agent_tracking_sessions')
            .update({ status: 'CLOSED', closed_at: new Date().toISOString(), closed_by: user.user_id })
            .eq('id', session.id)
        }
      }

      await logAudit({
        event_type: 'FIELD_REPORT_ASSIGNED',
        actor: user,
        target_type: 'field_report',
        target_id: id,
        action: 'UPDATE',
        after_state: { assigned_to, status: updatePayload.status },
      })

      return apiSuccess(data)
    } catch (err) {
      console.error('[field-reports/:id/assign PATCH]', err)
      return apiError('Internal server error', 500)
    }
  },
  'alerts:acknowledge'
)
