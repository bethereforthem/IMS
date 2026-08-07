import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import { splitByAvailableColumns, MIGRATION_HINT } from '@/lib/corrections-schema'

// Mirrors the `custody_status` enum in database/schema.sql. A value outside it
// is rejected by Postgres with a bare 500, so it is checked before the write.
const CUSTODY_STATUSES = new Set([
  'PRE_TRIAL', 'SENTENCED', 'TRANSFERRED', 'RELEASED', 'ESCAPED', 'DECEASED',
])
const IN_CUSTODY = new Set(['PRE_TRIAL', 'SENTENCED'])

/**
 * Raise the CRITICAL cross-institutional alert an escape is supposed to
 * generate. The Custody Overview page has always told operators that "an escape
 * event auto-generates CRITICAL alerts to RNP, NISS and RDF" — nothing in the
 * codebase did that, so this is the missing half of a feature the UI already
 * describes.
 *
 * A failure here is logged but never fails the status change itself: the record
 * saying the inmate is gone matters more than the notification about it.
 */
async function raiseEscapeAlert(
  db: ReturnType<typeof createServerSupabaseClient>,
  record: Record<string, unknown>,
  user: { full_name: string; badge_number: string; institution: string },
  req: NextRequest,
): Promise<string | null> {
  try {
    const { data: suspect } = await db
      .from('suspects')
      .select('full_name, ims_reference, threat_level')
      .eq('id', record.suspect_id as string)
      .maybeSingle()

    const name = suspect?.full_name ?? 'Unknown inmate'
    const ref = suspect?.ims_reference ?? '—'
    const facility = record.facility_name ?? 'unknown facility'

    const { data: alert, error } = await db
      .from('alerts')
      .insert({
        intelligence_event_id: null,
        suspect_id: record.suspect_id ?? null,
        severity: 'CRITICAL',
        source_tag: 'OFFICER_REPORT',
        title: `ESCAPE — ${name} (${ref})`,
        message:
          `Inmate ${name} (${ref}) has been reported ESCAPED from ${facility}` +
          `${record.cell_block ? `, cell ${record.cell_block}` : ''}. ` +
          `Threat level ${record.threat_level ?? suspect?.threat_level ?? 'unknown'}. ` +
          `Reported by ${user.full_name} (${user.badge_number}, ${user.institution}). ` +
          `Escape protocol triggered — locate and detain.`,
        // Broadcast: an escape is not an RCS-only concern, and this is exactly
        // the set of institutions the Custody Overview names.
        target_institutions: ['RCS', 'RNP', 'NISS', 'RDF'],
        is_read: false,
        requires_action: true,
        suspect_name: name,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[corrections escape alert] insert failed', error)
      return null
    }

    await logAudit({
      event_type: 'CORRECTIONS_ESCAPE_REPORTED',
      action: 'CREATE',
      actor: user as never,
      target_type: 'corrections_record',
      target_id: record.id as string,
      after_state: { escaped: true, alert_id: alert.id },
      context: extractAuditContext(req),
    })

    return alert.id as string
  } catch (err) {
    console.error('[corrections escape alert]', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/corrections/[id]
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Corrections record ID is required', 400)

    const supabase = createServerSupabaseClient()

    const { data: record, error } = await supabase
      .from('corrections_records')
      .select('*, suspects(id, full_name, ims_reference, status, threat_level, nationality, date_of_birth)')
      .eq('id', id)
      .single()

    if (error || !record) {
      return apiError('Corrections record not found', 404)
    }

    return apiSuccess(record)
  } catch (err) {
    console.error('[GET /api/v1/corrections/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:read')

// ---------------------------------------------------------------------------
// PATCH /api/v1/corrections/[id]
// ---------------------------------------------------------------------------
export const PATCH = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Corrections record ID is required', 400)

    const body = await req.json()

    const supabase = createServerSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from('corrections_records')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return apiError('Corrections record not found', 404)
    }

    const allowedFields = [
      'custody_status', 'release_date', 'threat_level',
      'next_review', 'notes', 'cell_block', 'facility_name',
      'sentence_end', 'sentence_years', 'court_name', 'intake_date',
      // Personal info
      'father_name', 'mother_name', 'sex', 'place_of_birth',
      'residential_address', 'domicile_address', 'phone_number', 'email',
      'national_id', 'marital_status', 'profession', 'properties_owned',
      'health_status', 'education_level', 'children_count', 'alternative_contact',
      'party_status', 'passport_photo_url',
      // Court conclusion
      'presiding_judge', 'verdict_date', 'sentence_type', 'court_conclusion',
      'offense_description',
      // Visitor log
      'visitor_log',
    ]

    const updates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }
    // Reject before touching the row: a body of nothing but unrecognised keys
    // would otherwise bump `updated_at` and write an audit entry for an edit
    // that changed nothing.
    if (Object.keys(updates).length === 0) {
      return apiError('No updatable fields in request', 400)
    }
    updates.updated_at = new Date().toISOString()

    if ('custody_status' in updates) {
      const next = String(updates.custody_status)
      if (!CUSTODY_STATUSES.has(next)) {
        return apiError(
          `custody_status must be one of ${[...CUSTODY_STATUSES].join(', ')}`, 400
        )
      }
    }
    if ('threat_level' in updates && updates.threat_level != null) {
      const level = Number(updates.threat_level)
      if (!Number.isInteger(level) || level < 1 || level > 5) {
        return apiError('threat_level must be an integer between 1 and 5', 400)
      }
      updates.threat_level = level
    }

    // A custody status change is a custody *event*, and the timestamps that
    // record it were never written by anything — so the escape protocol the
    // dashboard advertises had no trigger, and a release recorded through this
    // route left `actual_release_at` empty, which is the column the events feed
    // and the release statistics both read.
    const prevStatus = String(existing.custody_status ?? '')
    const nextStatus = 'custody_status' in updates ? String(updates.custody_status) : prevStatus
    const statusChanged = nextStatus !== prevStatus
    const nowIso = new Date().toISOString()

    if (statusChanged) {
      if (nextStatus === 'ESCAPED' && !existing.escape_reported_at) {
        updates.escape_reported_at = nowIso
      }
      if (prevStatus === 'ESCAPED' && IN_CUSTODY.has(nextStatus)) {
        updates.escape_recaptured_at = nowIso
      }
      if ((nextStatus === 'RELEASED' || nextStatus === 'TRANSFERRED') && !existing.actual_release_at) {
        updates.actual_release_at = body.actual_release_at ?? nowIso
      }
    }

    const { supported, unsupported } = await splitByAvailableColumns(updates)
    if (unsupported.length > 0) {
      console.warn(
        `[PATCH /api/v1/corrections/${id}] dropping ${unsupported.length} field(s) — ${MIGRATION_HINT}`,
        unsupported
      )
    }
    if (Object.keys(supported).length === 0) {
      return apiError('No updatable fields in request', 400)
    }

    const { data: updated, error: updateError } = await supabase
      .from('corrections_records')
      .update(supported)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[PATCH /api/v1/corrections/[id]]', updateError)
      return apiError('Failed to update corrections record', 500)
    }

    await logAudit({
      event_type: 'CORRECTIONS_UPDATED',
      action: 'UPDATE',
      actor: user,
      target_type: 'corrections_record',
      target_id: id,
      before_state: existing,
      after_state: updated,
      context: extractAuditContext(req),
    })

    let escape_alert_id: string | null = null
    if (statusChanged && nextStatus === 'ESCAPED') {
      escape_alert_id = await raiseEscapeAlert(supabase, updated, user, req)
    }

    return apiSuccess({
      ...updated,
      ...(unsupported.length > 0 ? { unsupported_fields: unsupported, warning: MIGRATION_HINT } : {}),
      ...(escape_alert_id ? { escape_alert_id } : {}),
    })
  } catch (err) {
    console.error('[PATCH /api/v1/corrections/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:write')

// DELETE /api/v1/corrections/[id] — marks record as RELEASED
export const DELETE = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Record ID required', 400)

    const db = createServerSupabaseClient()
    const { data: existing } = await db.from('corrections_records').select('*').eq('id', id).single()
    if (!existing) return apiError('Corrections record not found', 404)

    const { data: updated, error } = await db
      .from('corrections_records')
      .update({ custody_status: 'RELEASED', actual_release_at: new Date().toISOString() })
      .eq('id', id).select().single()

    if (error) return apiError('Failed to release record', 500)

    await logAudit({
      event_type: 'CORRECTIONS_RELEASED', action: 'DELETE', actor: user,
      target_type: 'corrections_record', target_id: id,
      before_state: existing, after_state: updated,
      context: extractAuditContext(req),
    })

    return apiSuccess({ released: true, id })
  } catch (err) {
    console.error('[DELETE /api/v1/corrections/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:write')
