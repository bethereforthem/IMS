import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/agent-tracking/agents
// Returns all agents with active tracking sessions plus their last known
// position. Used by the NISS Commander map.
// ---------------------------------------------------------------------------
export const GET = withAuth(async (_req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()

    // Fetch active sessions with agent info
    const { data: sessions, error: sessErr } = await supabase
      .from('agent_tracking_sessions')
      .select(`
        id, status, started_at, total_pings, field_report_id,
        users!agent_tracking_sessions_agent_id_fkey(
          id, full_name, badge_number, institution, role
        ),
        field_reports(
          id, title, category, priority, status
        )
      `)
      .in('status', ['ACTIVE', 'PAUSED'])
      .order('started_at', { ascending: false })

    if (sessErr) return apiError('Failed to fetch sessions', 500)

    // For each session, fetch the latest ping
    const enriched = await Promise.all(
      (sessions ?? []).map(async (s: Record<string, unknown>) => {
        const { data: latestPing } = await supabase
          .from('agent_location_pings')
          .select('lat, lng, accuracy_m, heading, speed_ms, pinged_at')
          .eq('session_id', s.id as string)
          .order('pinged_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const agent = s.users as Record<string, unknown> | null
        const report = (s.field_reports as Record<string, unknown>[] | null)?.[0] ?? null

        return {
          session_id: s.id,
          session_status: s.status,
          started_at: s.started_at,
          total_pings: s.total_pings,
          field_report_id: s.field_report_id,
          agent_id: agent?.id ?? null,
          agent_name: agent?.full_name ?? null,
          agent_badge: agent?.badge_number ?? null,
          agent_institution: agent?.institution ?? null,
          agent_role: agent?.role ?? null,
          last_lat: latestPing?.lat ?? null,
          last_lng: latestPing?.lng ?? null,
          last_heading: latestPing?.heading ?? null,
          last_ping_at: latestPing?.pinged_at ?? null,
          report_title: report?.title ?? null,
          report_priority: report?.priority ?? null,
        }
      })
    )

    // Non-NISS: only see agents from their own institution
    const filtered = user.institution === 'NISS'
      ? enriched
      : enriched.filter(a => a.agent_institution === user.institution)

    return apiSuccess({ agents: filtered, total: filtered.length })
  } catch (err) {
    console.error('[agent-tracking/agents GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')
