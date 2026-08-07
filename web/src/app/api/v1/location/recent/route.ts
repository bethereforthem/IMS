import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// Border node prefixes used by RDF
const BORDER_NODE_PREFIXES = ['GTN-', 'RBV-', 'RSZ-', 'NYG-']

// Ceiling on the institution-scope id list, so the `in.(…)` filter cannot grow
// into an unbounded URL as intelligence_events accumulates.
const MAX_SCOPE_IDS = 2000

// ---------------------------------------------------------------------------
// GET /api/v1/location/recent
// Requires one of: location:read:all | location:read:limited | location:read:border
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    // At least one location permission is required
    const hasAny =
      hasPermission(user.role, 'location:read:all') ||
      hasPermission(user.role, 'location:read:top_secret') ||
      hasPermission(user.role, 'location:read:limited') ||
      hasPermission(user.role, 'location:read:border')

    if (!hasAny) {
      return apiError('Insufficient permissions — requires a location:read permission', 403)
    }

    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)

    const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '20', 10))
    const suspect_id = url.searchParams.get('suspect_id')

    let query = supabase
      .from('location_records')
      .select('*, suspects(full_name, ims_reference, status, threat_level)', { count: 'exact' })
      .order('detection_timestamp', { ascending: false })
      .limit(limit)

    if (suspect_id) query = query.eq('suspect_id', suspect_id)

    // Apply access-level-specific scoping
    if (hasPermission(user.role, 'location:read:top_secret') || hasPermission(user.role, 'location:read:all')) {
      // Full access — no additional filters
    } else if (hasPermission(user.role, 'location:read:limited')) {
      // Only records this user detected, or ones owned by this institution.
      //
      // `location_records` has no institution column of its own — the owning
      // institution lives on the parent intelligence_event. Filtering on
      // `institution.eq.…` here made PostgREST reject the whole query, so this
      // endpoint returned 500 for every limited-access role (which includes
      // RNP_COMMANDER) and the Patrol Map's officer layer never loaded.
      //
      // The ids are resolved first because PostgREST cannot OR a base-table
      // column together with an embedded resource's column in one expression.
      const { data: instEvents, error: instError } = await supabase
        .from('intelligence_events')
        .select('id')
        .eq('institution', user.institution)
        .limit(MAX_SCOPE_IDS)

      if (instError) {
        console.error('[location/recent GET] institution scope lookup', instError)
        return apiError('Failed to fetch location records', 500)
      }

      const eventIds = (instEvents ?? []).map(e => e.id)
      query = eventIds.length > 0
        ? query.or(
            `detecting_officer_id.eq.${user.user_id},` +
            `intelligence_event_id.in.(${eventIds.join(',')})`
          )
        : query.eq('detecting_officer_id', user.user_id)
    } else if (hasPermission(user.role, 'location:read:border')) {
      // Only border-related nodes (GTN-, RBV-, RSZ-, NYG-)
      const borderFilters = BORDER_NODE_PREFIXES.map(p => `detecting_node_id.like.${p}%`).join(',')
      query = query.or(borderFilters)
    }

    const { data: records, count, error } = await query

    if (error) {
      console.error('[location/recent GET]', error)
      return apiError('Failed to fetch location records', 500)
    }

    const mappedRecords = (records ?? []).map((r: Record<string, unknown> & { suspects?: Record<string, unknown> | null }) => ({
      ...r,
      latitude: r.location_lat,
      longitude: r.location_lng,
      recorded_at: r.detection_timestamp,
      suspect_name: r.suspects?.full_name ?? null,
      ims_reference: r.suspects?.ims_reference ?? null,
    }))

    return apiSuccess({ records: mappedRecords, total: count ?? 0 })
  } catch (err) {
    console.error('[location/recent GET]', err)
    return apiError('Internal server error', 500)
  }
  // Permission check is done inside the handler — withAuth here only validates the JWT.
})
