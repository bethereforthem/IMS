import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/audit
// Requires audit:read or audit:read:own_institution
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    // Check which audit permission the user holds
    const hasFullAudit = hasPermission(user.role, 'audit:read')
    const hasOwnInstitutionAudit = hasPermission(user.role, 'audit:read:own_institution')

    if (!hasFullAudit && !hasOwnInstitutionAudit) {
      return apiError('Insufficient permissions — requires audit:read or audit:read:own_institution', 403)
    }

    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)

    const actor_id = url.searchParams.get('actor_id')
    const action = url.searchParams.get('action')
    const target_type = url.searchParams.get('target_type')
    const institution = url.searchParams.get('institution')

    const { pageSize, offset } = getPagination(req)
    const rawLimit = parseInt(url.searchParams.get('limit') ?? String(pageSize), 10)
    const limit = Math.min(200, Math.max(1, rawLimit))

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('event_timestamp', { ascending: false })
      .range(offset, offset + limit - 1)

    // Institution scoping for users with limited audit access
    if (!hasFullAudit && hasOwnInstitutionAudit) {
      query = query.eq('actor_institution', user.institution)
    } else if (institution) {
      // NISS users can filter by institution
      query = query.eq('actor_institution', institution)
    }

    if (actor_id) query = query.eq('actor_id', actor_id)
    if (action) query = query.eq('action', action)
    if (target_type) query = query.eq('target_type', target_type)

    const { data: entries, count, error } = await query

    if (error) {
      console.error('[audit GET]', error)
      return apiError('Failed to fetch audit log', 500)
    }

    return apiSuccess({ entries: entries ?? [], total: count ?? 0 })
  } catch (err) {
    console.error('[audit GET]', err)
    return apiError('Internal server error', 500)
  }
  // JWT-only gate; permission check is done inside the handler
})