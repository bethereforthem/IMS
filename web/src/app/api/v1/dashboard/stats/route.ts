import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()

    const todayISO = new Date()
    todayISO.setHours(0, 0, 0, 0)
    const todayStr = todayISO.toISOString()

    const [
      { count: total_suspects },
      { count: wanted_count },
      { count: in_custody_count },
      { count: active_warrants },
      { count: alerts_today },
      { count: critical_alerts },
      { count: events_today },
      { count: cameras_online },
      { count: cameras_total },
    ] = await Promise.all([
      supabase.from('suspects').select('*', { count: 'exact', head: true }),
      supabase.from('suspects').select('*', { count: 'exact', head: true }).eq('status', 'WANTED'),
      supabase.from('suspects').select('*', { count: 'exact', head: true }).eq('status', 'IN_CUSTODY'),
      supabase.from('warrants').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('alerts').select('*', { count: 'exact', head: true }).gte('created_at', todayStr),
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('severity', 'CRITICAL').eq('is_read', false),
      supabase.from('intelligence_events').select('*', { count: 'exact', head: true }).gte('created_at', todayStr),
      supabase.from('camera_nodes').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('camera_nodes').select('*', { count: 'exact', head: true }),
    ])

    return apiSuccess({
      total_suspects: total_suspects ?? 0,
      wanted_count: wanted_count ?? 0,
      in_custody_count: in_custody_count ?? 0,
      active_warrants: active_warrants ?? 0,
      alerts_today: alerts_today ?? 0,
      critical_alerts: critical_alerts ?? 0,
      events_today: events_today ?? 0,
      camera_nodes_online: cameras_online ?? 0,
      camera_nodes_total: cameras_total ?? 0,
    })
  } catch (err) {
    console.error('[dashboard/stats]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')
