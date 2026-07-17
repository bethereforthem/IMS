import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/agent-tracking/sessions/my
// Returns the authenticated agent's latest ACTIVE or PAUSED tracking session,
// including the linked field report title. Used by the mobile app to recover
// a session that was lost from local storage (e.g. app reinstall, cleared cache,
// or a commander-initiated reopen that created a new session).
// ---------------------------------------------------------------------------
export const GET = withAuth(async (_req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()

    const { data: session, error } = await supabase
      .from('agent_tracking_sessions')
      .select(`
        id, status, started_at, total_pings, field_report_id,
        field_reports!agent_tracking_sessions_field_report_id_fkey(
          id, title, priority, status
        )
      `)
      .eq('agent_id', user.user_id)
      .in('status', ['ACTIVE', 'PAUSED'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return apiError('Failed to fetch session', 500)
    if (!session) return apiSuccess({ session: null })

    const report = (session.field_reports as Record<string, unknown>[] | null)?.[0] ?? null

    return apiSuccess({
      session: {
        session_id:      session.id,
        status:          session.status,
        started_at:      session.started_at,
        total_pings:     session.total_pings,
        field_report_id: session.field_report_id,
        report_title:    report ? (report as Record<string, unknown>).title as string : null,
        report_priority: report ? (report as Record<string, unknown>).priority as string : null,
      },
    })
  } catch (err) {
    console.error('[agent-tracking/sessions/my GET]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only
