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

      // Fetch current report state to detect reopen transitions
      const { data: current } = await supabase
        .from('field_reports')
        .select('id, status, agent_id')
        .eq('id', id)
        .maybeSingle()

      if (!current) return apiError('Report not found', 404)
      const wasClosedBefore = (current as Record<string, unknown>).status === 'CLOSED'
      const isReopening = wasClosedBefore && updatePayload.status !== 'CLOSED'

      const { data, error } = await supabase
        .from('field_reports')
        .update(updatePayload)
        .eq('id', id)
        .select('id, status, assigned_to')
        .single()

      if (error || !data) return apiError('Update failed', 500)

      const now = new Date().toISOString()

      if (updatePayload.status === 'CLOSED') {
        // Close any active/paused tracking sessions for this report
        await supabase
          .from('agent_tracking_sessions')
          .update({ status: 'CLOSED', closed_at: now, closed_by: user.user_id })
          .eq('field_report_id', id)
          .in('status', ['ACTIVE', 'PAUSED'])
      } else if (isReopening) {
        // Investigation reopened: create a fresh ACTIVE session so the mobile
        // agent can pick it up via GET /api/v1/agent-tracking/sessions/my
        const agentId = (current as Record<string, unknown>).agent_id as string | null
        if (agentId) {
          await supabase
            .from('agent_tracking_sessions')
            .insert({
              agent_id:        agentId,
              field_report_id: id,
              status:          'ACTIVE',
              started_at:      now,
            })
        }
      }

      await logAudit({
        event_type: 'FIELD_REPORT_ASSIGNED',
        actor: user,
        target_type: 'field_report',
        target_id: id,
        action: 'UPDATE',
        after_state: { assigned_to, status: updatePayload.status, reopened: isReopening },
      })

      return apiSuccess({ ...(data as Record<string, unknown>), new_session_created: isReopening })
    } catch (err) {
      console.error('[field-reports/:id/assign PATCH]', err)
      return apiError('Internal server error', 500)
    }
  },
  'alerts:acknowledge'
)
