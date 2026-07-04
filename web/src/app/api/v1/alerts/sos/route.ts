import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/alerts/sos
// Emergency SOS from any authenticated user. Creates a CRITICAL alert visible
// to all institutions + an intelligence event so the location appears on maps.
// No special permission required beyond valid JWT auth.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const { location_lat, location_lng, location_description, notes } = body

    const isVillage = user.institution === 'VILLAGE_LEADER'
    const locNote   = location_description ? ` Location: ${location_description}.` : ''
    const coordNote = (location_lat && location_lng)
      ? ` GPS: ${Number(location_lat).toFixed(5)}, ${Number(location_lng).toFixed(5)}.`
      : ' GPS: not available.'

    const title = isVillage
      ? '🚨 VILLAGE SOS — Emergency Security Situation'
      : `🚨 SOS — ${user.full_name} IS IN DANGER`

    const message = isVillage
      ? `Village leader ${user.full_name} (Badge: ${user.badge_number}) has triggered an emergency security alert and requires immediate RNP intervention.${locNote}${coordNote}${notes ? ' Note: ' + notes : ''}`
      : `Officer ${user.full_name} (${user.institution} · Badge: ${user.badge_number}) has activated an emergency SOS. Immediate response required.${locNote}${coordNote}${notes ? ' Note: ' + notes : ''}`

    // Create an intelligence event so the GPS appears on commander maps
    const eventPayload = {
      source_tag: 'OFFICER_REPORT',
      suspect_id: null,
      officer_id: user.user_id,
      institution: user.institution,
      location_lat: location_lat ?? null,
      location_lng: location_lng ?? null,
      location_description: location_description ?? null,
      criminal_record_found: false,
      alert_generated: false,
      confidence: null,
      notes: `SOS_EMERGENCY: ${message}`,
      event_timestamp: new Date().toISOString(),
    }

    const { data: event, error: eventError } = await supabase
      .from('intelligence_events')
      .insert(eventPayload)
      .select()
      .single()

    if (eventError) {
      console.error('[alerts/sos POST] event insert error', eventError)
    }

    const alertPayload = {
      intelligence_event_id: event?.id ?? null,
      suspect_id: null,
      severity: 'CRITICAL',
      source_tag: 'OFFICER_REPORT',
      title,
      message,
      target_institutions: null, // broadcast to all
      is_read: false,
      requires_action: true,
      created_at: new Date().toISOString(),
    }

    const { data: alert, error: alertError } = await supabase
      .from('alerts')
      .insert(alertPayload)
      .select()
      .single()

    if (alertError || !alert) {
      console.error('[alerts/sos POST] alert insert error', alertError)
      return apiError('Failed to send SOS alert', 500)
    }

    if (event) {
      await supabase.from('intelligence_events').update({ alert_generated: true }).eq('id', event.id)
    }

    await logAudit({
      event_type: 'SOS_ALERT_TRIGGERED',
      actor: user,
      target_type: 'alert',
      target_id: alert.id,
      action: 'CREATE',
      after_state: {
        location_lat: location_lat ?? null,
        location_lng: location_lng ?? null,
        institution: user.institution,
      },
    })

    return apiSuccess({ sent: true, alert_id: alert.id })
  } catch (err) {
    console.error('[alerts/sos POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only — no permission required, all users can send SOS
