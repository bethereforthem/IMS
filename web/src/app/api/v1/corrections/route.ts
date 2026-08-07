import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { assertRwLocations } from '@/lib/rw-locations-server'
import { splitByAvailableColumns, MIGRATION_HINT } from '@/lib/corrections-schema'

// Columns a caller may sort by. Anything else is ignored rather than passed
// through, so a query string can never reach PostgREST as an ORDER BY clause.
const SORTABLE = new Set([
  'created_at', 'intake_date', 'next_review', 'threat_level',
  'facility_name', 'custody_status', 'sentence_years', 'release_date',
])

// ---------------------------------------------------------------------------
// GET /api/v1/corrections
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const custody_status = url.searchParams.get('custody_status')
    const facility_name = url.searchParams.get('facility_name')
    const threat_level = url.searchParams.get('threat_level')
    const search = (url.searchParams.get('q') ?? '').trim()
    const sortParam = url.searchParams.get('sort') ?? 'created_at'
    const sort = SORTABLE.has(sortParam) ? sortParam : 'created_at'
    const ascending = url.searchParams.get('order') === 'asc'
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    // A name/IMS-reference search has to reach the joined suspect row, and an
    // embedded filter only narrows the parent when the join is `!inner`.
    const suspectJoin = search
      ? 'suspects!inner(full_name, ims_reference, status)'
      : 'suspects(full_name, ims_reference, status)'

    let query = supabase
      .from('corrections_records')
      .select(`*, ${suspectJoin}`, { count: 'exact' })
      .range(offset, offset + pageSize - 1)
      .order(sort, { ascending, nullsFirst: false })

    // Accepts a single status or a comma-separated set, so "everyone actually
    // inside" (PRE_TRIAL,SENTENCED) is one request rather than one per status
    // or a whole-table fetch narrowed in the browser.
    if (custody_status) {
      const statuses = custody_status.split(',').map(s => s.trim()).filter(Boolean)
      query = statuses.length > 1
        ? query.in('custody_status', statuses)
        : query.eq('custody_status', statuses[0])
    }
    if (facility_name) query = query.ilike('facility_name', `%${facility_name}%`)
    if (threat_level) query = query.eq('threat_level', threat_level)
    if (search) {
      // Commas and parentheses would otherwise terminate the PostgREST filter
      // list and let a search box smuggle extra predicates into the query.
      const safe = search.replace(/[,()*]/g, ' ').trim()
      if (safe) {
        query = query.or(
          `full_name.ilike.%${safe}%,ims_reference.ilike.%${safe}%`,
          { referencedTable: 'suspects' }
        )
      }
    }

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

    // Re-validate the administrative chains behind the flattened address
    // strings. Village and cell names repeat across the country, so a chain is
    // only trustworthy once each level has been checked against its parent.
    const locationCheck = assertRwLocations([
      { label: 'Residential address', value: body.residence },
      { label: 'Domicile address', value: body.domicile },
    ])
    if (!locationCheck.ok) {
      return apiError(locationCheck.errors.join('; '), 400)
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
      // `intake_date` is NOT NULL on the table, so an intake recorded without
      // one used to fail with a bare 500 instead of defaulting to now.
      intake_date: intake_date ?? new Date().toISOString(),
      sentence_start: intake_date ?? null,
      sentence_years: sentence_years ?? null,
      sentence_end,
      court_name: court_name ?? null,
      offense_description: offense_description ?? null,
      next_review: next_review ?? null,
      threat_level: threat_level ?? null,
      intake_verified_by: user.user_id,
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

    // Ask the database which of the extended columns it actually has rather
    // than inserting everything and retrying on failure. The retry landed on
    // the core record and reported success, so an operator who filled in the
    // whole personal-info form was told the intake saved with no indication
    // that two thirds of what they typed had been dropped.
    const { supported, unsupported } = await splitByAvailableColumns(extendedRecord)
    if (unsupported.length > 0) {
      console.warn(
        `[POST /api/v1/corrections] dropping ${unsupported.length} field(s) — ${MIGRATION_HINT}`,
        unsupported
      )
    }

    const { data: record, error } = await supabase
      .from('corrections_records')
      .insert(supported)
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

    return apiSuccess(
      unsupported.length > 0
        ? { ...record, unsupported_fields: unsupported, warning: MIGRATION_HINT }
        : record,
      201
    )
  } catch (err) {
    console.error('[POST /api/v1/corrections]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:write')
