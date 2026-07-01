import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/alerts
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)

    const severity = url.searchParams.get('severity')
    const is_read = url.searchParams.get('is_read')
    const requires_action = url.searchParams.get('requires_action')

    const { pageSize, offset } = getPagination(req)
    const rawLimit = parseInt(url.searchParams.get('limit') ?? String(pageSize), 10)
    const limit = Math.min(100, Math.max(1, rawLimit))

    let query = supabase
      .from('alerts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (severity) query = query.eq('severity', severity)
    if (is_read !== null && is_read !== '') {
      query = query.eq('is_read', is_read === 'true')
    }
    if (requires_action !== null && requires_action !== '') {
      query = query.eq('requires_action', requires_action === 'true')
    }

    // Institution scoping: non-NISS users only see alerts for their institution or broadcast alerts
    if (user.institution !== 'NISS') {
      query = query.or(`target_institutions.cs.{${user.institution}},target_institutions.is.null`)
    }

    const { data: alerts, count, error } = await query

    if (error) {
      console.error('[alerts GET]', error)
      return apiError('Failed to fetch alerts', 500)
    }

    const mappedAlerts = (alerts ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      event_id: a.intelligence_event_id,
    }))

    return apiSuccess({ alerts: mappedAlerts, total: count ?? 0 })
  } catch (err) {
    console.error('[alerts GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')
