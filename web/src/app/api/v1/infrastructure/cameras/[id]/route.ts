import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/infrastructure/cameras/[id]
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Camera node ID is required', 400)

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('camera_nodes')
      .select('*')
      .eq('id', id)

    // Institution scoping for non-NISS users
    if (user.institution !== 'NISS') {
      query = query.eq('institution', user.institution)
    }

    const { data: camera, error } = await query.single()

    if (error || !camera) {
      return apiError('Camera node not found', 404)
    }

    return apiSuccess(camera)
  } catch (err) {
    console.error('[infrastructure/cameras/[id] GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')

// ---------------------------------------------------------------------------
// PATCH /api/v1/infrastructure/cameras/[id]
// Used by dashboard admins and edge Pi nodes (heartbeat updates)
// ---------------------------------------------------------------------------
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Camera node ID is required', 400)

    const supabase = createServerSupabaseClient()
    const body = await req.json()

    // Build update payload from allowed fields only
    const updatePayload: Record<string, unknown> = {}

    if (body.last_heartbeat !== undefined) updatePayload.last_heartbeat = body.last_heartbeat
    if (body.is_active !== undefined) updatePayload.is_active = body.is_active
    if (body.firmware_version !== undefined) updatePayload.firmware_version = body.firmware_version

    if (Object.keys(updatePayload).length === 0) {
      return apiError('No updatable fields provided', 400)
    }

    const { data: camera, error } = await supabase
      .from('camera_nodes')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error || !camera) {
      console.error('[infrastructure/cameras/[id] PATCH]', error)
      return apiError('Failed to update camera node', 500)
    }

    return apiSuccess(camera)
  } catch (err) {
    console.error('[infrastructure/cameras/[id] PATCH]', err)
    return apiError('Internal server error', 500)
  }
}, 'camera_nodes:manage')

// DELETE /api/v1/infrastructure/cameras/[id] — decommissions camera (active = false)
export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('Camera ID required', 400)

    const db = createServerSupabaseClient()
    const { data: existing } = await db.from('camera_nodes').select('*').eq('id', id).single()
    if (!existing) return apiError('Camera not found', 404)

    const { data: updated, error } = await db
      .from('camera_nodes')
      .update({ active: false })
      .eq('id', id).select().single()

    if (error) return apiError('Failed to decommission camera', 500)

    await logAudit({
      event_type: 'CAMERA_DECOMMISSIONED', action: 'DELETE', actor: user,
      target_type: 'camera_node', target_id: id,
      before_state: existing, after_state: updated,
      context: extractAuditContext(req),
    })

    return apiSuccess({ decommissioned: true, id })
  } catch (err) {
    console.error('[infrastructure/cameras/[id] DELETE]', err)
    return apiError('Internal server error', 500)
  }
}, 'camera_nodes:manage')
