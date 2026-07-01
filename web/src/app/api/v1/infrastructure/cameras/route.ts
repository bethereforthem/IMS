import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/infrastructure/cameras
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)

    const institution = url.searchParams.get('institution')
    const is_active = url.searchParams.get('is_active')

    let query = supabase
      .from('camera_nodes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Institution scoping: non-NISS users only see cameras for their own institution
    if (user.institution !== 'NISS') {
      query = query.eq('institution', user.institution)
    } else if (institution) {
      query = query.eq('institution', institution)
    }

    if (is_active !== null && is_active !== '') {
      query = query.eq('is_active', is_active === 'true')
    }

    const { data: cameras, count, error } = await query

    if (error) {
      console.error('[infrastructure/cameras GET]', error)
      return apiError('Failed to fetch camera nodes', 500)
    }

    return apiSuccess({ cameras: cameras ?? [], total: count ?? 0 })
  } catch (err) {
    console.error('[infrastructure/cameras GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')

// ---------------------------------------------------------------------------
// POST /api/v1/infrastructure/cameras
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()

    const { node_identifier, location_name, institution, latitude, longitude, firmware_version } = body

    if (!node_identifier || !location_name || !institution) {
      return apiError('node_identifier, location_name, and institution are required', 400)
    }

    const { data: camera, error } = await supabase
      .from('camera_nodes')
      .insert({
        node_identifier,
        location_name,
        institution,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        firmware_version: firmware_version ?? null,
        is_active: true,
        revoked: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error || !camera) {
      console.error('[infrastructure/cameras POST]', error)
      return apiError('Failed to register camera node', 500)
    }

    await logAudit({
      event_type: 'CAMERA_NODE_REGISTERED',
      actor: user,
      target_type: 'camera_node',
      target_id: camera.id,
      action: 'CREATE',
      after_state: camera,
    })

    return apiSuccess(camera, 201)
  } catch (err) {
    console.error('[infrastructure/cameras POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'camera_nodes:manage')
