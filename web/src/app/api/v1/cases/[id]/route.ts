import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import { hasPermission, CLEARANCE_RANK, type AuthPayload } from '@/lib/rbac'

// Institutions with cross-institution case visibility. Mirrors the same list in
// GET /api/v1/cases so the collection and the item agree on who can see what.
const CROSS_INSTITUTION = new Set(['NISS', 'RNP'])

/**
 * Whether `user` may touch this case at all.
 *
 * `GET /api/v1/cases` caps the listing at the caller's clearance and scopes it
 * to their own institution, but none of the by-id handlers did either — so a
 * CONFIDENTIAL RIB analyst could read a TOP_SECRET NISS case (and its full
 * suspect roster) by guessing or replaying its id, and anyone holding
 * `cases:write` could edit, reclassify or archive it. Filtering a list without
 * filtering the record it links to leaves the record wide open.
 *
 * Returns an error message to refuse with, or null to allow.
 */
function caseAccessDenial(
  user: AuthPayload,
  record: { clearance_level?: string | null; lead_institution?: string | null },
): string | null {
  const userRank = CLEARANCE_RANK[user.clearance] ?? 0
  const recordRank = CLEARANCE_RANK[record.clearance_level ?? 'UNCLASSIFIED'] ?? 0

  // `suspects:classify` is the system's existing "may reach above own
  // clearance" grant, held only by NISS_DIRECTOR.
  if (recordRank > userRank && !hasPermission(user.role, 'suspects:classify')) {
    return `Insufficient clearance — this case is classified ${record.clearance_level} and your clearance is ${user.clearance}`
  }

  if (
    !CROSS_INSTITUTION.has(user.institution) &&
    record.lead_institution &&
    record.lead_institution !== user.institution
  ) {
    return 'This case belongs to another institution'
  }

  return null
}

// ---------------------------------------------------------------------------
// GET /api/v1/cases/[id]
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Case ID is required', 400)

    const supabase = createServerSupabaseClient()

    const { data: caseRecord, error } = await supabase
      .from('cases')
      .select('*, case_suspects(*, suspects(id, full_name, ims_reference, status, threat_level))')
      .eq('id', id)
      .single()

    if (error || !caseRecord) {
      return apiError('Case not found', 404)
    }

    const denial = caseAccessDenial(user, caseRecord)
    if (denial) {
      // A refused attempt to open a classified case is itself intelligence.
      await logAudit({
        event_type: 'CASE_READ_DENIED',
        action: 'READ',
        actor: user,
        target_type: 'case',
        target_id: id,
      })
      return apiError(denial, 403)
    }

    await logAudit({
      event_type: 'CASE_READ',
      action: 'READ',
      actor: user,
      target_type: 'case',
      target_id: id,
    })

    // Flatten case_suspects into a suspects array for convenience
    const suspects = (caseRecord.case_suspects ?? []).map(
      (cs: Record<string, unknown>) => ({
        ...(cs.suspects as Record<string, unknown>),
        role: cs.role,
        added_at: cs.added_at,
      })
    )

    return apiSuccess({
      ...caseRecord,
      classification: caseRecord.clearance_level,
      suspects,
      case_suspects: undefined,
    })
  } catch (err) {
    console.error('[GET /api/v1/cases/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:read')

// ---------------------------------------------------------------------------
// PATCH /api/v1/cases/[id]
// ---------------------------------------------------------------------------
export const PATCH = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Case ID is required', 400)

    const body = await req.json()

    const supabase = createServerSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return apiError('Case not found', 404)
    }

    const denial = caseAccessDenial(user, existing)
    if (denial) {
      await logAudit({
        event_type: 'CASE_UPDATE_DENIED',
        action: 'UPDATE',
        actor: user,
        target_type: 'case',
        target_id: id,
      })
      return apiError(denial, 403)
    }

    const allowedFields = [
      'title', 'category', 'status', 'clearance_level',
      'lead_institution', 'lead_officer_id', 'summary',
      'incident_date', 'location_name',
    ]

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    // `clearance_level` is editable, so without this an officer could raise a
    // case above their own clearance (losing sight of it) or, worse, reclassify
    // a sensitive case downward to widen who can read it.
    if ('clearance_level' in updates) {
      const targetRank = CLEARANCE_RANK[String(updates.clearance_level)] ?? -1
      if (targetRank < 0) {
        return apiError('clearance_level must be one of UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET', 400)
      }
      if (targetRank > (CLEARANCE_RANK[user.clearance] ?? 0) && !hasPermission(user.role, 'suspects:classify')) {
        return apiError('Cannot classify a case above your own clearance', 403)
      }
    }
    // Re-assigning the lead institution would move a case outside the caller's
    // own visibility scope — only the cross-institution roles may do that.
    if ('lead_institution' in updates && !CROSS_INSTITUTION.has(user.institution)
        && updates.lead_institution !== user.institution) {
      return apiError('Cannot reassign a case to another institution', 403)
    }

    const { data: updated, error: updateError } = await supabase
      .from('cases')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[PATCH /api/v1/cases/[id]]', updateError)
      return apiError('Failed to update case', 500)
    }

    await logAudit({
      event_type: 'CASE_UPDATED',
      action: 'UPDATE',
      actor: user,
      target_type: 'case',
      target_id: id,
      before_state: existing,
      after_state: updated,
    })

    return apiSuccess(updated)
  } catch (err) {
    console.error('[PATCH /api/v1/cases/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:write')

// ---------------------------------------------------------------------------
// DELETE /api/v1/cases/[id]  — soft-delete: sets status = 'ARCHIVED'
// ---------------------------------------------------------------------------
export const DELETE = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Case ID is required', 400)

    const db = createServerSupabaseClient()

    const { data: existing } = await db.from('cases').select('*').eq('id', id).single()
    if (!existing) return apiError('Case not found', 404)

    const denial = caseAccessDenial(user, existing)
    if (denial) {
      await logAudit({
        event_type: 'CASE_DELETE_DENIED',
        action: 'DELETE',
        actor: user,
        target_type: 'case',
        target_id: id,
        context: extractAuditContext(req),
      })
      return apiError(denial, 403)
    }

    const { data: updated, error } = await db
      .from('cases')
      .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiError('Failed to archive case', 500)

    await logAudit({
      event_type: 'CASE_DELETED',
      action: 'DELETE',
      actor: user,
      target_type: 'case',
      target_id: id,
      before_state: existing,
      after_state: updated,
      context: extractAuditContext(req),
    })

    return apiSuccess({ archived: true, id })
  } catch (err) {
    console.error('[DELETE /api/v1/cases/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:write')
