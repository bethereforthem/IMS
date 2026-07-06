import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/agent-tracking/ping
// Field agent sends current GPS coordinates. Must have an active session.
// Body: { session_id, lat, lng, accuracy_m?, heading?, speed_ms? }
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const { session_id, lat, lng, accuracy_m, heading, speed_ms } = body

    if (!session_id) return apiError('session_id is required', 400)
    if (lat == null || lng == null) return apiError('lat and lng are required', 400)

    // Verify session belongs to this agent and is active
    const { data: session, error: sessErr } = await supabase
      .from('agent_tracking_sessions')
      .select('id, status, agent_id')
      .eq('id', session_id)
      .eq('agent_id', user.user_id)
      .maybeSingle()

    if (sessErr || !session) return apiError('Session not found', 404)
    if (session.status !== 'ACTIVE') return apiError('Session is not active', 409)

    const now = new Date().toISOString()
    const { error: pingErr } = await supabase
      .from('agent_location_pings')
      .insert({
        session_id,
        agent_id: user.user_id,
        lat: Number(lat),
        lng: Number(lng),
        accuracy_m: accuracy_m ?? null,
        heading: heading ?? null,
        speed_ms: speed_ms ?? null,
        pinged_at: now,
      })

    if (pingErr) return apiError('Failed to record ping', 500)

    // Increment ping counter and update session in one round-trip
    const { data: latest } = await supabase
      .from('agent_tracking_sessions')
      .select('total_pings')
      .eq('id', session_id)
      .single()

    await supabase
      .from('agent_tracking_sessions')
      .update({ total_pings: ((latest?.total_pings as number | null) ?? 0) + 1 })
      .eq('id', session_id)

    // Location ping counts as a heartbeat — refresh availability
    await supabase
      .from('agent_availability')
      .upsert(
        {
          agent_id:          user.user_id,
          status:            'ONLINE',
          offline_reason:    null,
          last_heartbeat_at: now,
          last_known_lat:    Number(lat),
          last_known_lng:    Number(lng),
          last_known_at:     now,
          offline_since:     null,
          institution:       user.institution,
          agent_name:        user.full_name,
          agent_badge:       user.badge_number,
          updated_at:        now,
        },
        { onConflict: 'agent_id' }
      )

    return apiSuccess({ recorded: true, pinged_at: now })
  } catch (err) {
    console.error('[agent-tracking/ping POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only
