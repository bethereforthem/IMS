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

    // NISS and RNP have cross-institution case visibility;
    // other institutions only see their own cases
    if (user.institution !== 'NISS' && user.institution !== 'RNP') {
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

    // Generate case_reference in application code so it never fails due to missing trigger
    const year = new Date().getFullYear()
    const { count: existingCount } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .like('case_reference', `RWA-${lead_institution}-${year}-%`)

    const nextSeq = (existingCount ?? 0) + 1
    const case_reference = `RWA-${lead_institution}-${year}-${String(nextSeq).padStart(5, '0')}`

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        case_reference,
        title,
        category: category || 'OTHER',
        status: status || 'OPEN',
        clearance_level: clearance_level || 'CONFIDENTIAL',
        lead_institution,
        summary: summary || null,
        incident_date: incident_date || null,
        location_name: location_name || null,
        created_by: user.user_id,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/v1/cases]', error)
      // If unique collision, retry with timestamp suffix
      if (error.code === '23505') {
        const ts = Date.now().toString().slice(-4)
        const fallbackRef = `RWA-${lead_institution}-${year}-${ts}`
        const { data: retryCase, error: retryErr } = await supabase
          .from('cases')
          .insert({
            case_reference: fallbackRef,
            title,
            category: category || 'OTHER',
            status: status || 'OPEN',
            clearance_level: clearance_level || 'CONFIDENTIAL',
            lead_institution,
            summary: summary || null,
            incident_date: incident_date || null,
            location_name: location_name || null,
            created_by: user.user_id,
          })
          .select()
          .single()
        if (retryErr) {
          console.error('[POST /api/v1/cases] retry', retryErr)
          return apiError(retryErr.message ?? 'Failed to create case', 500)
        }
        return apiSuccess(retryCase, 201)
      }
      return apiError(error.message ?? 'Failed to create case', 500)
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
