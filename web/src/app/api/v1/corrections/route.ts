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
      next_review: r.next_review,
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
      // Personal info
      father_name, mother_name, sex, place_of_birth,
      residential_address, domicile_address, phone_number, email,
      national_id, marital_status, profession, properties_owned,
      health_status, education_level, children_count, alternative_contact,
      party_status, passport_photo_url,
      // Court conclusion
      presiding_judge, verdict_date, sentence_type, court_conclusion,
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

    // Core columns present in every schema version
    const coreRecord = {
      suspect_id,
      facility_name,
      cell_block: cell_block ?? null,
      custody_status: custody_status ?? 'PRE_TRIAL',
      intake_date: intake_date ?? null,
      sentence_start: intake_date ?? null,
      sentence_years: sentence_years ?? null,
      sentence_end,
      court_name: court_name ?? null,
      offense_description: offense_description ?? null,
      next_review: next_review ?? null,
      threat_level: threat_level ?? null,
    }

    // Extended columns added by the corrections personal-info migration
    const extendedRecord = {
      ...coreRecord,
      father_name: father_name ?? null,
      mother_name: mother_name ?? null,
      sex: sex ?? null,
      place_of_birth: place_of_birth ?? null,
      residential_address: residential_address ?? null,
      domicile_address: domicile_address ?? null,
      phone_number: phone_number ?? null,
      email: email ?? null,
      national_id: national_id ?? null,
      marital_status: marital_status ?? null,
      profession: profession ?? null,
      properties_owned: properties_owned ?? null,
      health_status: health_status ?? null,
      education_level: education_level ?? null,
      children_count: children_count ?? null,
      alternative_contact: alternative_contact ?? null,
      party_status: party_status ?? null,
      passport_photo_url: passport_photo_url ?? null,
      presiding_judge: presiding_judge ?? null,
      verdict_date: verdict_date ?? null,
      sentence_type: sentence_type ?? null,
      court_conclusion: court_conclusion ?? null,
      visitor_log: [],
    }

    let { data: record, error } = await supabase
      .from('corrections_records')
      .insert(extendedRecord)
      .select()
      .single()

    // PGRST204 / 42703 = unknown column: personal-info migration not yet
    // applied to this database — retry with the core schema so intake
    // still succeeds (extended fields are dropped until migration runs).
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      console.warn('[POST /api/v1/corrections] extended columns missing — run the corrections personal-info migration. Falling back to core fields.')
      ;({ data: record, error } = await supabase
        .from('corrections_records')
        .insert(coreRecord)
        .select()
        .single())
    }

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
