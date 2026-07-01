import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'

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

    return apiSuccess({ ...caseRecord, suspects, case_suspects: undefined })
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

    const allowedFields = [
      'title', 'category', 'status', 'clearance_level',
      'lead_institution', 'lead_officer_id', 'summary',
      'incident_date', 'location_name',
    ]

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
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
