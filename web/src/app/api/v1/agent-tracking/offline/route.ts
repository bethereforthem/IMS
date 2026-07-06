import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// Valid reason codes sent by the client
const VALID_REASONS = ['NO_NETWORK', 'GPS_DISABLED', 'APP_TERMINATED', 'PHONE_OFF'] as const
type OfflineReason = typeof VALID_REASONS[number]

// ---------------------------------------------------------------------------
// POST /api/v1/agent-tracking/offline
// Agent proactively reports going offline (network loss, GPS off, beforeunload).
// Body: { reason, location_lat?, location_lng? }
// Supports keepalive fetches sent from beforeunload.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const { reason, location_lat, location_lng } = body as {
      reason?: string
      location_lat?: number | null
      location_lng?: number | null
    }

    const offlineReason: OfflineReason =
      VALID_REASONS.includes(reason as OfflineReason) ? (reason as OfflineReason) : 'NO_NETWORK'

    const now = new Date().toISOString()
    const isGpsOnly = offlineReason === 'GPS_DISABLED'
    const newStatus = isGpsOnly ? 'GPS_DISABLED' : 'OFFLINE'

    // Check current status — avoid creating duplicate alerts if already offline
    const { data: existing } = await supabase
      .from('agent_availability')
      .select('status, last_known_lat, last_known_lng')
      .eq('agent_id', user.user_id)
      .maybeSingle()

    const alreadyOffline = existing?.status === 'OFFLINE' || existing?.status === 'GPS_DISABLED'

    const savedLat = location_lat ?? existing?.last_known_lat ?? null
    const savedLng = location_lng ?? existing?.last_known_lng ?? null

    // Upsert availability
    await supabase
      .from('agent_availability')
      .upsert(
        {
          agent_id:          user.user_id,
          status:            newStatus,
          offline_reason:    offlineReason,
          last_heartbeat_at: now,
          last_known_lat:    savedLat,
          last_known_lng:    savedLng,
          last_known_at:     (location_lat && location_lng) ? now : null,
          offline_since:     alreadyOffline ? (existing?.status ? undefined : now) : now,
          institution:       user.institution,
          agent_name:        user.full_name,
          agent_badge:       user.badge_number,
          updated_at:        now,
        },
        { onConflict: 'agent_id' }
      )

    if (alreadyOffline) {
      // Already offline — no need for another alert
      return apiSuccess({ recorded: true, new_alert: false })
    }

    // Build human-readable reason
    const reasonLabels: Record<OfflineReason, string> = {
      NO_NETWORK:      'Network connection lost',
      GPS_DISABLED:    'GPS/location services disabled',
      APP_TERMINATED:  'Application unexpectedly terminated',
      PHONE_OFF:       'Device powered off or battery exhausted',
    }
    const coordNote = (savedLat && savedLng)
      ? ` Last GPS: ${Number(savedLat).toFixed(5)}, ${Number(savedLng).toFixed(5)}.`
      : ' Last GPS: not available.'

    const severity  = isGpsOnly ? 'HIGH' : 'CRITICAL'
    const titleIcon = isGpsOnly ? '📡' : '📵'
    const title     = `${titleIcon} AGENT ${isGpsOnly ? 'GPS LOST' : 'OFFLINE'} — ${user.full_name} (${user.institution})`
    const message   = `${reasonLabels[offlineReason]}: ${user.full_name} (Badge: ${user.badge_number} · ${user.institution}) is no longer reachable.${coordNote} Confirm status immediately.`

    const { data: alert } = await supabase
      .from('alerts')
      .insert({
        suspect_id:       null,
        severity,
        source_tag:       'SYSTEM',
        title,
        message,
        target_institutions: [user.institution, 'NISS'],
        is_read:          false,
        requires_action:  !isGpsOnly,
        created_at:       now,
      })
      .select('id')
      .single()

    // Update the availability row with the alert id for dedup
    if (alert?.id) {
      await supabase
        .from('agent_availability')
        .update({ last_alert_id: alert.id })
        .eq('agent_id', user.user_id)
    }

    // Log offline event
    await supabase
      .from('agent_offline_events')
      .insert({
        agent_id:       user.user_id,
        event_type:     'OFFLINE',
        offline_reason: offlineReason,
        last_known_lat: savedLat,
        last_known_lng: savedLng,
        occurred_at:    now,
        alert_id:       alert?.id ?? null,
        institution:    user.institution,
        agent_name:     user.full_name,
        agent_badge:    user.badge_number,
      })

    await logAudit({
      event_type: isGpsOnly ? 'AGENT_GPS_DISABLED' : 'AGENT_OFFLINE',
      actor:      user,
      target_type: 'agent_availability',
      target_id:  user.user_id,
      action:     'UPDATE',
      after_state: {
        status:         newStatus,
        offline_reason: offlineReason,
        last_known_lat: savedLat,
        last_known_lng: savedLng,
        alert_id:       alert?.id ?? null,
      },
    })

    return apiSuccess({ recorded: true, new_alert: true, alert_id: alert?.id ?? null })
  } catch (err) {
    console.error('[agent-tracking/offline POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only
