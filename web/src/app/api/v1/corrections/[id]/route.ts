import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'

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
      'sentence_end', 'sentence_years',
    ]

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    const { data: updated, error: updateError } = await supabase
      .from('corrections_records')
      .update(updates)
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
    })

    return apiSuccess(updated)
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
      .update({ custody_status: 'RELEASED', actual_release_date: new Date().toISOString().split('T')[0] })
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
