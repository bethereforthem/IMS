import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
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
