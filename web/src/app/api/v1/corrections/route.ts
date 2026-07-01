import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

// ---------------------------------------------------------------------------
// GET /api/v1/corrections
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const custody_status = url.searchParams.get('custody_status')
    const facility_name = url.searchParams.get('facility_name')
    const threat_level = url.searchParams.get('threat_level')
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('corrections_records')
      .select('*, suspects(full_name, ims_reference, status)', { count: 'exact' })
      .range(offset, offset + pageSize - 1)
      .order('created_at', { ascending: false })

    if (custody_status) query = query.eq('custody_status', custody_status)
    if (facility_name) query = query.ilike('facility_name', `%${facility_name}%`)
    if (threat_level) query = query.eq('threat_level', threat_level)

    const { data: records, count, error } = await query

    if (error) {
      console.error('[GET /api/v1/corrections]', error)
      return apiError('Failed to fetch corrections records', 500)
    }

    const mappedRecords = (records ?? []).map((r: Record<string, unknown> & { suspects?: Record<string, unknown> | null }) => ({
      ...r,
      full_name: r.suspects?.full_name ?? null,
      ims_reference: r.suspects?.ims_reference ?? null,
      suspect_status: r.suspects?.status ?? null,
      facility: r.facility_name,
      status: r.custody_status,
      next_review: r.next_review_date,
    }))

    return apiSuccess({
      records: mappedRecords,
      total: count ?? 0,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[GET /api/v1/corrections]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:read')

// ---------------------------------------------------------------------------
// POST /api/v1/corrections
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const {
      suspect_id,
      facility_name,
      cell_block,
      custody_status,
      intake_date,
      sentence_years,
      court_name,
      offense_description,
      next_review,
      threat_level,
    } = body

    if (!suspect_id || !facility_name) {
      return apiError('suspect_id and facility_name are required', 400)
    }

    const supabase = createServerSupabaseClient()

    // Verify suspect exists
    const { data: suspect, error: suspectError } = await supabase
      .from('suspects')
      .select('id')
      .eq('id', suspect_id)
      .single()

    if (suspectError || !suspect) {
      return apiError('Suspect not found', 404)
    }

    // Calculate sentence_end if sentence_years provided
    let sentence_end: string | null = null
    if (sentence_years && intake_date) {
      const start = new Date(intake_date)
      start.setFullYear(start.getFullYear() + Number(sentence_years))
      sentence_end = start.toISOString().split('T')[0]
    }

    const { data: record, error } = await supabase
      .from('corrections_records')
      .insert({
        suspect_id,
        facility_name,
        cell_block: cell_block ?? null,
        custody_status: custody_status ?? 'REMAND',
        intake_date: intake_date ?? null,
        sentence_start: intake_date ?? null,
        sentence_years: sentence_years ?? null,
        sentence_end,
        court_name: court_name ?? null,
        offense_description: offense_description ?? null,
        next_review: next_review ?? null,
        threat_level: threat_level ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/v1/corrections]', error)
      return apiError('Failed to create corrections record', 500)
    }

    await logAudit({
      event_type: 'CORRECTIONS_CREATED',
      action: 'CREATE',
      actor: user,
      target_type: 'corrections_record',
      target_id: record.id,
      after_state: record,
    })

    return apiSuccess(record, 201)
  } catch (err) {
    console.error('[POST /api/v1/corrections]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:write')
