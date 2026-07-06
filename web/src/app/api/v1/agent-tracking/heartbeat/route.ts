import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// How long without a heartbeat before an agent is considered offline
export const OFFLINE_THRESHOLD_SECONDS = 90

// ---------------------------------------------------------------------------
// POST /api/v1/agent-tracking/heartbeat
// Every agent on the dashboard sends this every ~20s.
// Body: { location_lat?, location_lng?, accuracy_m? }
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const { location_lat, location_lng, accuracy_m } = body as {
      location_lat?: number | null
      location_lng?: number | null
      accuracy_m?: number | null
    }

    const now = new Date().toISOString()
    const hasGps = location_lat != null && location_lng != null

    // Read current availability record
    const { data: existing } = await supabase
      .from('agent_availability')
      .select('status, offline_since, last_known_lat, last_known_lng, offline_reason')
      .eq('agent_id', user.user_id)
      .maybeSingle()

    const wasOffline = existing?.status === 'OFFLINE' || existing?.status === 'GPS_DISABLED'

    // Upsert availability: device is reachable again
    await supabase
      .from('agent_availability')
      .upsert(
        {
          agent_id:          user.user_id,
          status:            'ONLINE',
          offline_reason:    null,
          last_heartbeat_at: now,
          last_known_lat:    hasGps ? location_lat : (existing?.last_known_lat ?? null),
          last_known_lng:    hasGps ? location_lng : (existing?.last_known_lng ?? null),
          last_known_at:     hasGps ? now : null,
          offline_since:     null,
          institution:       user.institution,
          agent_name:        user.full_name,
          agent_badge:       user.badge_number,
          updated_at:        now,
        },
        { onConflict: 'agent_id' }
      )

    // If the agent was previously offline, log the recovery and create an alert
    if (wasOffline) {
      const offlineSince = existing?.offline_since ?? now
      const minutesOffline = Math.round((Date.now() - new Date(offlineSince).getTime()) / 60000)

      // Recovery notification alert (not CRITICAL — informational)
      const { data: alert } = await supabase
        .from('alerts')
        .insert({
          suspect_id:      null,
          severity:        'MEDIUM',
          source_tag:      'SYSTEM',
          title:           `📶 AGENT RESTORED — ${user.full_name} is back online`,
          message:         `Agent ${user.full_name} (${user.institution} · Badge: ${user.badge_number}) has reconnected after ${minutesOffline} minute${minutesOffline !== 1 ? 's' : ''} offline. Reason was: ${existing?.offline_reason ?? 'unknown'}. Live tracking resumed.`,
          target_institutions: [user.institution, 'NISS'],
          is_read:         false,
          requires_action: false,
          created_at:      now,
        })
        .select('id')
        .single()

      // Log recovery event
      await supabase
        .from('agent_offline_events')
        .insert({
          agent_id:       user.user_id,
          event_type:     'RESTORED',
          offline_reason: existing?.offline_reason ?? null,
          last_known_lat: hasGps ? location_lat : (existing?.last_known_lat ?? null),
          last_known_lng: hasGps ? location_lng : (existing?.last_known_lng ?? null),
          occurred_at:    now,
          alert_id:       alert?.id ?? null,
          institution:    user.institution,
          agent_name:     user.full_name,
          agent_badge:    user.badge_number,
        })

      await logAudit({
        event_type: 'AGENT_RESTORED',
        actor:      user,
        target_type: 'agent_availability',
        target_id:  user.user_id,
        action:     'UPDATE',
        after_state: {
          status:          'ONLINE',
          was_offline_since: offlineSince,
          minutes_offline: minutesOffline,
          last_known_lat:  location_lat ?? existing?.last_known_lat,
          last_known_lng:  location_lng ?? existing?.last_known_lng,
        },
      })
    }

    return apiSuccess({ alive: true, was_offline: wasOffline })
  } catch (err) {
    console.error('[agent-tracking/heartbeat POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only
