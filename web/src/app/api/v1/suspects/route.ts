import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

// ---------------------------------------------------------------------------
// GET /api/v1/suspects
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const name = url.searchParams.get('name')
    const clearance_level = url.searchParams.get('clearance_level')
    const institution = url.searchParams.get('institution')
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('suspects')
      .select('*', { count: 'exact' })
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (name) query = query.ilike('full_name', `%${name}%`)
    if (clearance_level) query = query.eq('clearance_level', clearance_level)
    if (institution) query = query.eq('owning_institution', institution)

    const { data: suspects, count, error } = await query

    if (error) {
      console.error('[GET /api/v1/suspects]', error)
      return apiError('Failed to fetch suspects', 500)
    }

    const mappedSuspects = (suspects ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      institution_classification: s.owning_institution,
      clearance_required: s.clearance_level,
      alias: Array.isArray(s.aliases) && s.aliases.length > 0 ? s.aliases[0] : null,
    }))

    return apiSuccess({
      suspects: mappedSuspects,
      total: count ?? 0,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[GET /api/v1/suspects]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:read')

// ---------------------------------------------------------------------------
// POST /api/v1/suspects
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const {
      first_name,
      last_name,
      status,
      clearance_level,
      date_of_birth,
      nationality,
      owning_institution,
      threat_level,
      notes,
      known_associates,
      distinguishing_marks,
    } = body

    if (!first_name || !last_name || !owning_institution) {
      return apiError('first_name, last_name, and owning_institution are required', 400)
    }

    const supabase = createServerSupabaseClient()

    const { data: suspect, error } = await supabase
      .from('suspects')
      .insert({
        first_name,
        last_name,
        status: status ?? 'ACTIVE',
        clearance_level: clearance_level ?? 'CONFIDENTIAL',
        date_of_birth: date_of_birth ?? null,
        nationality: nationality ?? null,
        owning_institution,
        threat_level: threat_level ?? null,
        notes: notes ?? null,
        known_associates: known_associates ?? null,
        distinguishing_marks: distinguishing_marks ?? null,
        created_by: user.user_id,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/v1/suspects]', error)
      return apiError('Failed to create suspect', 500)
    }

    await logAudit({
      event_type: 'SUSPECT_CREATED',
      action: 'CREATE',
      actor: user,
      target_type: 'suspect',
      target_id: suspect.id,
      after_state: suspect,
    })

    return apiSuccess(suspect, 201)
  } catch (err) {
    console.error('[POST /api/v1/suspects]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:write')
