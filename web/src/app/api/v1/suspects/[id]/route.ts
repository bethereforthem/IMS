import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { hasPermission, CLEARANCE_RANK } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/suspects/[id]
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Suspect ID is required', 400)

    const url = new URL(req.url)
    const justification = url.searchParams.get('justification')

    const supabase = createServerSupabaseClient()

    const { data: suspect, error } = await supabase
      .from('suspects')
      .select(`*,
        case_suspects(role, cases(id, case_reference, title, status, lead_institution)),
        warrants(id, warrant_type, charges, priority, active, issued_at),
        corrections_records(id, facility_name, cell_block, custody_status, intake_date, release_date, actual_release_at, sentence_years, offense_description, court_name, next_review)`)
      .eq('id', id)
      .single()

    if (error || !suspect) {
      return apiError('Suspect not found', 404)
    }

    // Clearance gate: users can only open records at or below their own level
    const userRank = CLEARANCE_RANK[user.clearance] ?? 0
    const recordRank = CLEARANCE_RANK[suspect.clearance_level] ?? 0
    if (recordRank > userRank && !hasPermission(user.role, 'suspects:classify')) {
      await logAudit({
        event_type: 'SUSPECT_READ_DENIED',
        action: 'READ',
        actor: user,
        target_type: 'suspect',
        target_id: id,
      })
      return apiError(
        `Insufficient clearance — this record is classified ${suspect.clearance_level} and your clearance is ${user.clearance}`,
        403
      )
    }

    // Top-secret access gate: require justification unless user has suspects:classify
    if (
      suspect.clearance_level === 'TOP_SECRET' &&
      !hasPermission(user.role, 'suspects:classify')
    ) {
      if (!justification || justification.trim().length < 10) {
        return apiError(
          'A justification of at least 10 characters is required to access TOP_SECRET records',
          403
        )
      }
    }

    await logAudit({
      event_type: 'SUSPECT_READ',
      action: 'READ',
      actor: user,
      target_type: 'suspect',
      target_id: id,
      justification: justification ?? undefined,
    })

    // Flatten joined records for convenient client consumption
    const linked_cases = (suspect.case_suspects ?? [])
      .map((cs: Record<string, unknown>) => ({
        ...(cs.cases as Record<string, unknown>),
        role: cs.role,
      }))
      .filter((c: Record<string, unknown>) => c.id)

    return apiSuccess({
      ...suspect,
      linked_cases,
      case_suspects: undefined,
    })
  } catch (err) {
    console.error('[GET /api/v1/suspects/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:read')

// ---------------------------------------------------------------------------
// PATCH /api/v1/suspects/[id]
// ---------------------------------------------------------------------------
export const PATCH = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Suspect ID is required', 400)

    const body = await req.json()

    const supabase = createServerSupabaseClient()

    // Fetch existing record for before_state audit
    const { data: existing, error: fetchError } = await supabase
      .from('suspects')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return apiError('Suspect not found', 404)
    }

    // Whitelist of updatable fields
    const allowedFields = [
      'status', 'threat_level', 'notes', 'clearance_level',
      'aliases', 'distinguishing_marks', 'physical_description',
      'nationality', 'known_associates', 'interpol_file_no',
      'interpol_notice', 'owning_institution',
    ]

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    const { data: updated, error: updateError } = await supabase
      .from('suspects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[PATCH /api/v1/suspects/[id]]', updateError)
      return apiError('Failed to update suspect', 500)
    }

    await logAudit({
      event_type: 'SUSPECT_UPDATED',
      action: 'UPDATE',
      actor: user,
      target_type: 'suspect',
      target_id: id,
      before_state: existing,
      after_state: updated,
    })

    return apiSuccess(updated)
  } catch (err) {
    console.error('[PATCH /api/v1/suspects/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:write')

// ---------------------------------------------------------------------------
// DELETE /api/v1/suspects/[id]  (soft delete — NISS only)
// ---------------------------------------------------------------------------
export const DELETE = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Suspect ID is required', 400)

    if (user.institution !== 'NISS') {
      return apiError('Only NISS personnel may archive suspect records', 403)
    }

    const supabase = createServerSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from('suspects')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return apiError('Suspect not found', 404)
    }

    const archiveNote = `[ARCHIVED by ${user.badge_number} on ${new Date().toISOString()}]`
    const updatedNotes = existing.notes
      ? `${existing.notes}\n${archiveNote}`
      : archiveNote

    const { data: archived, error: updateError } = await supabase
      .from('suspects')
      .update({
        status: 'DECEASED',
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[DELETE /api/v1/suspects/[id]]', updateError)
      return apiError('Failed to archive suspect', 500)
    }

    await logAudit({
      event_type: 'SUSPECT_ARCHIVED',
      action: 'DELETE',
      actor: user,
      target_type: 'suspect',
      target_id: id,
      before_state: existing,
      after_state: archived,
    })

    return apiSuccess({ message: 'Suspect record archived' })
  } catch (err) {
    console.error('[DELETE /api/v1/suspects/[id]]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:write')
