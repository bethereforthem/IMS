import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/location/suspect/[id]
// Requires location:read:all or location:read:limited
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    // Check permission — must have at least limited location access
    const canRead =
      hasPermission(user.role, 'location:read:all') ||
      hasPermission(user.role, 'location:read:top_secret') ||
      hasPermission(user.role, 'location:read:limited')

    if (!canRead) {
      return apiError('Insufficient permissions — requires location:read:all or location:read:limited', 403)
    }

    const suspect_id = params?.id
    if (!suspect_id) return apiError('Suspect ID is required', 400)

    const url = new URL(req.url)
    const justification = url.searchParams.get('justification')

    if (!justification || justification.trim().length < 5) {
      return apiError('A justification is required to access suspect location records', 400)
    }

    const supabase = createServerSupabaseClient()

    const { data: records, error } = await supabase
      .from('location_records')
      .select('*, suspects(full_name, ims_reference, status, threat_level)')
      .eq('suspect_id', suspect_id)
      .order('detection_timestamp', { ascending: false })

    if (error) {
      console.error('[location/suspect/[id] GET]', error)
      return apiError('Failed to fetch location records', 500)
    }

    await logAudit({
      event_type: 'LOCATION_RECORD_READ',
      actor: user,
      target_type: 'suspect',
      target_id: suspect_id,
      action: 'READ',
      justification,
    })

    return apiSuccess({ records: records ?? [], total: records?.length ?? 0 })
  } catch (err) {
    console.error('[location/suspect/[id] GET]', err)
    return apiError('Internal server error', 500)
  }
  // JWT-only gate; permission is checked inside the handler
})