import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// GET /api/v1/warrants
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const activeParam = url.searchParams.get('active')
    const priority = url.searchParams.get('priority')
    const suspect_id = url.searchParams.get('suspect_id')
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('warrants')
      .select('*, suspects(full_name, ims_reference, status, threat_level)', { count: 'exact' })
      .range(offset, offset + pageSize - 1)
      .order('issued_at', { ascending: false })

    if (activeParam !== null) {
      query = query.eq('active', activeParam === 'true')
    }
    if (priority) query = query.eq('priority', priority)
    if (suspect_id) query = query.eq('suspect_id', suspect_id)

    const { data: warrants, count, error } = await query

    if (error) {
      console.error('[GET /api/v1/warrants]', error)
      return apiError('Failed to fetch warrants', 500)
    }

    return apiSuccess({
      warrants: warrants ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[GET /api/v1/warrants]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:read')

// ---------------------------------------------------------------------------
// POST /api/v1/warrants
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const {
      suspect_id,
      charges,
      warrant_type,
      issued_by_court,
      case_reference,
      expires_at,
      priority,
      notes,
    } = body

    if (!suspect_id || !charges) {
      return apiError('suspect_id and charges are required', 400)
    }

    const supabase = createServerSupabaseClient()

    const { data: suspect, error: suspectError } = await supabase
      .from('suspects')
      .select('id')
      .eq('id', suspect_id)
      .single()

    if (suspectError || !suspect) {
      return apiError('Suspect not found', 404)
    }

    const { data: warrant, error } = await supabase
      .from('warrants')
      .insert({
        suspect_id,
        charges,
        warrant_type: warrant_type ?? 'ARREST',
        issued_by: user.institution,
        issued_by_court: issued_by_court ?? null,
        case_reference: case_reference ?? null,
        expires_at: expires_at ?? null,
        priority: priority ?? 'HIGH',
        notes: notes ?? null,
        active: true,
        issued_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/v1/warrants]', error)
      return apiError('Failed to create warrant', 500)
    }

    return apiSuccess(warrant, 201)
  } catch (err) {
    console.error('[POST /api/v1/warrants]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:write')
