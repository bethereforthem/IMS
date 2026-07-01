import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

// ---------------------------------------------------------------------------
// GET /api/v1/cases
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const clearance_level = url.searchParams.get('clearance_level')
    const institution = url.searchParams.get('institution')
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('cases')
      .select('*', { count: 'exact' })
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (clearance_level) query = query.eq('clearance_level', clearance_level)
    if (institution) query = query.eq('lead_institution', institution)

    // Non-NISS users only see their own institution's cases
    if (user.institution !== 'NISS') {
      query = query.eq('lead_institution', user.institution)
    }

    const { data: cases, count, error } = await query

    if (error) {
      console.error('[GET /api/v1/cases]', error)
      return apiError('Failed to fetch cases', 500)
    }

    const mappedCases = (cases ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      classification: c.clearance_level,
    }))

    return apiSuccess({
      cases: mappedCases,
      total: count ?? 0,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[GET /api/v1/cases]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:read')

// ---------------------------------------------------------------------------
// POST /api/v1/cases
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const {
      title,
      category,
      status,
      clearance_level,
      lead_institution,
      summary,
      incident_date,
      location_name,
    } = body

    if (!title || !lead_institution) {
      return apiError('title and lead_institution are required', 400)
    }

    const supabase = createServerSupabaseClient()

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        title,
        category: category ?? null,
        status: status ?? 'OPEN',
        clearance_level: clearance_level ?? 'CONFIDENTIAL',
        lead_institution,
        summary: summary ?? null,
        incident_date: incident_date ?? null,
        location_name: location_name ?? null,
        created_by: user.user_id,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/v1/cases]', error)
      return apiError('Failed to create case', 500)
    }

    await logAudit({
      event_type: 'CASE_CREATED',
      action: 'CREATE',
      actor: user,
      target_type: 'case',
      target_id: newCase.id,
      after_state: newCase,
    })

    return apiSuccess(newCase, 201)
  } catch (err) {
    console.error('[POST /api/v1/cases]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:write')
