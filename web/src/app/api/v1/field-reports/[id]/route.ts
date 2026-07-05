import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

// GET /api/v1/field-reports/:id
export const GET = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing id', 400)

      const { data, error } = await supabase
        .from('field_reports')
        .select(`
          *,
          users!field_reports_agent_id_fkey(
            full_name, badge_number, institution, role
          ),
          agent_tracking_sessions(
            id, status, started_at, paused_at, closed_at, total_pings
          )
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) return apiError('DB error', 500)
      if (!data) return apiError('Not found', 404)

      // Non-NISS: only see if in target institution or own report
      const agentInstitution = (data as Record<string, unknown> & { users?: Record<string, unknown> | null })
        .users?.institution as string | undefined
      if (
        user.institution !== 'NISS' &&
        agentInstitution !== user.institution &&
        (data as Record<string, unknown>).agent_id !== user.user_id
      ) {
        return apiError('Forbidden', 403)
      }

      const r = data as Record<string, unknown> & {
        users?: Record<string, unknown> | null
        agent_tracking_sessions?: Record<string, unknown>[] | null
      }
      return apiSuccess({
        ...r,
        agent_name: r.users?.full_name ?? null,
        agent_badge: r.users?.badge_number ?? null,
        agent_institution: r.users?.institution ?? null,
        tracking_session: r.agent_tracking_sessions?.[0] ?? null,
      })
    } catch (err) {
      console.error('[field-reports/:id GET]', err)
      return apiError('Internal server error', 500)
    }
  },
  'alerts:read'
)
