import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/partners
// Requires international:manage or interpol:query
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const canAccess =
      hasPermission(user.role, 'international:manage') ||
      hasPermission(user.role, 'interpol:query')

    if (!canAccess) {
      return apiError('Insufficient permissions — requires international:manage or interpol:query', 403)
    }

    const supabase = createServerSupabaseClient()

    const { data: partners, error } = await supabase
      .from('international_partners')
      .select('*')
      .eq('active', true)
      .order('country_name', { ascending: true })

    if (error) {
      console.error('[partners GET]', error)
      return apiError('Failed to fetch international partners', 500)
    }

    // Real query volume per partner over the last 30 days. Dashboards used to
    // render a literal 0 here because no such column exists on the partner row.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentQueries, error: queryError } = await supabase
      .from('partner_queries')
      .select('partner_id')
      .gte('created_at', since)

    if (queryError) {
      console.error('[partners GET] query-count lookup failed', queryError)
    }

    const countByPartner = new Map<string, number>()
    for (const row of recentQueries ?? []) {
      const id = (row as { partner_id: string }).partner_id
      countByPartner.set(id, (countByPartner.get(id) ?? 0) + 1)
    }

    const enriched = (partners ?? []).map(p => ({
      ...p,
      // null rather than 0 when the count could not be read, so the UI can tell
      // "no queries" apart from "unknown".
      recent_queries: queryError ? null : (countByPartner.get(p.id) ?? 0),
      recent_queries_window_days: 30,
    }))

    return apiSuccess({ partners: enriched })
  } catch (err) {
    console.error('[partners GET]', err)
    return apiError('Internal server error', 500)
  }
  // JWT-only gate; permission check is inside
})