import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/intelligence/events/[id]
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Event ID is required', 400)

    const supabase = createServerSupabaseClient()

    const { data: event, error } = await supabase
      .from('intelligence_events')
      .select(`
        *,
        suspects(full_name, ims_reference, status, threat_level),
        users!intelligence_events_officer_id_fkey(full_name, badge_number)
      `)
      .eq('id', id)
      .single()

    if (error || !event) {
      return apiError('Intelligence event not found', 404)
    }

    await logAudit({
      event_type: 'INTEL_EVENT_READ',
      actor: user,
      target_type: 'intelligence_event',
      target_id: id,
      action: 'READ',
    })

    return apiSuccess(event)
  } catch (err) {
    console.error('[intelligence/events/[id] GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'source_attribution:read')

// PATCH /api/v1/intelligence/events/[id]
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Event ID is required', 400)

    const db = createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))

    const { data: existing } = await db.from('intelligence_events').select('*').eq('id', id).single()
    if (!existing) return apiError('Intelligence event not found', 404)

    const allowed = ['notes', 'confidence', 'alert_generated', 'source_tag',
                     'location_description', 'location_lat', 'location_lng']
    const updates: Record<string, unknown> = {}
    for (const k of allowed) { if (k in body) updates[k] = body[k] }
    if (!Object.keys(updates).length) return apiError('No valid fields to update', 400)

    const { data: updated, error } = await db
      .from('intelligence_events').update(updates).eq('id', id).select().single()
    if (error) return apiError('Failed to update event', 500)

    await logAudit({
      event_type: 'INTEL_EVENT_UPDATED', action: 'UPDATE', actor: user,
      target_type: 'intelligence_event', target_id: id,
      before_state: existing, after_state: updated,
      context: extractAuditContext(req),
    })

    return apiSuccess(updated)
  } catch (err) {
    console.error('[intelligence/events/[id] PATCH]', err)
    return apiError('Internal server error', 500)
  }
}, 'source_attribution:read')

// DELETE /api/v1/intelligence/events/[id] — NISS director only (hard delete is sensitive)
export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Event ID is required', 400)

    const db = createServerSupabaseClient()
    const { data: existing } = await db.from('intelligence_events').select('*').eq('id', id).single()
    if (!existing) return apiError('Intelligence event not found', 404)

    const { error } = await db.from('intelligence_events').delete().eq('id', id)
    if (error) return apiError('Failed to delete event', 500)

    await logAudit({
      event_type: 'INTEL_EVENT_DELETED', action: 'DELETE', actor: user,
      target_type: 'intelligence_event', target_id: id,
      before_state: existing,
      context: extractAuditContext(req),
    })

    return apiSuccess({ deleted: true, id })
  } catch (err) {
    console.error('[intelligence/events/[id] DELETE]', err)
    return apiError('Internal server error', 500)
  }
}, 'admin:write')
