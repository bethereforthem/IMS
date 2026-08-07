import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/agent-tracking/sessions/[id]/directive
// A commander transmits an order to the agent on a live tracking session —
// the "DIRECT" action on the NISS location-intelligence map.
//
// Follows the same delivery path as commander-rescue: an intelligence event
// pins it to the location maps, and an alert targeted at the agent's
// institution is what actually reaches them.
//
// Requires permission: agent_tracking:manage
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const sessionId = params?.id
      if (!sessionId) return apiError('Missing session id', 400)

      const body = await req.json().catch(() => null)
      const message = typeof body?.message === 'string' ? body.message.trim() : ''
      if (!message) return apiError('message is required', 400)
      if (message.length > 2000) return apiError('message must be 2000 characters or fewer', 400)

      // ── Resolve the session and the agent it belongs to ────────────────────
      const { data: session, error: sessErr } = await supabase
        .from('agent_tracking_sessions')
        .select('id, status, agent_id, field_report_id')
        .eq('id', sessionId)
        .maybeSingle()

      if (sessErr || !session) return apiError('Tracking session not found', 404)
      if (session.status === 'CLOSED') {
        return apiError('Cannot direct an agent on a closed session', 409)
      }

      const { data: agent } = await supabase
        .from('users')
        .select('id, full_name, badge_number, role')
        .eq('id', session.agent_id)
        .maybeSingle()

      if (!agent) return apiError('Agent not found for this session', 404)

      // Availability carries the agent's institution and last known position.
      const { data: availability } = await supabase
        .from('agent_availability')
        .select('institution, status, last_known_lat, last_known_lng')
        .eq('agent_id', session.agent_id)
        .maybeSingle()

      const institution = availability?.institution ?? user.institution
      const lat = availability?.last_known_lat ?? null
      const lng = availability?.last_known_lng ?? null

      // An order to an agent who is offline still has to be recorded, but the
      // commander needs to know it will not be seen right away.
      const agentOffline = availability?.status === 'OFFLINE'

      const now = new Date().toISOString()
      const coordNote = lat != null && lng != null
        ? ` Last GPS: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}.`
        : ' Last GPS: not available.'

      const title = `📡 FIELD DIRECTIVE — ${agent.full_name} (${institution})`
      const fullMessage =
        `DIRECTIVE from ${user.full_name} (${user.institution} · Badge: ${user.badge_number}) ` +
        `to ${agent.full_name} (Badge: ${agent.badge_number ?? '—'}).${coordNote} ` +
        `Order: ${message}`

      // ── 1. Intelligence event — puts the directive on the location maps ────
      const { data: event } = await supabase
        .from('intelligence_events')
        .insert({
          source_tag: 'OFFICER_REPORT',
          suspect_id: null,
          officer_id: user.user_id,
          institution: user.institution,
          location_lat: lat,
          location_lng: lng,
          location_description: null,
          criminal_record_found: false,
          alert_generated: false,
          confidence: null,
          notes: `FIELD_DIRECTIVE: ${fullMessage}`,
          event_timestamp: now,
        })
        .select('id')
        .single()

      // ── 2. Alert — the part the agent's institution actually receives ──────
      const { data: alert, error: alertErr } = await supabase
        .from('alerts')
        .insert({
          intelligence_event_id: event?.id ?? null,
          suspect_id: null,
          severity: 'HIGH',
          source_tag: 'OFFICER_REPORT',
          title,
          message: fullMessage,
          target_institutions: Array.from(new Set([institution, user.institution])),
          is_read: false,
          requires_action: true,
          created_at: now,
        })
        .select('id')
        .single()

      if (alertErr || !alert) {
        console.error('[agent-tracking directive POST] alert insert error', alertErr)
        return apiError('Failed to transmit directive', 500)
      }

      if (event) {
        await supabase.from('intelligence_events').update({ alert_generated: true }).eq('id', event.id)
      }

      await logAudit({
        event_type: 'AGENT_DIRECTIVE_TRANSMITTED',
        actor: user,
        target_type: 'agent_tracking_session',
        target_id: sessionId,
        action: 'CREATE',
        after_state: {
          agent_id: session.agent_id,
          agent_badge: agent.badge_number,
          institution,
          alert_id: alert.id,
          intelligence_event_id: event?.id ?? null,
          agent_offline: agentOffline,
          message,
        },
      }).catch(() => {})

      return apiSuccess({
        directive_id: alert.id,
        intelligence_event_id: event?.id ?? null,
        delivered_to: {
          agent_id: session.agent_id,
          agent_name: agent.full_name,
          agent_badge: agent.badge_number,
          institution,
        },
        agent_offline: agentOffline,
        transmitted_at: now,
      })
    } catch (err) {
      console.error('[agent-tracking directive POST]', err)
      return apiError('Internal server error', 500)
    }
  },
  'agent_tracking:manage',
)
