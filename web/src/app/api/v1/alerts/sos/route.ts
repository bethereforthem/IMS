import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/alerts/sos
// Emergency SOS from any authenticated user. Creates a CRITICAL alert visible
// to all institutions + a field_report + agent_tracking_session for live GPS
// tracking on commander maps. The tracking session is the canonical map marker
// (live, moves with the agent) — no static intelligence_event is created.
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

    // 1. Create CRITICAL broadcast alert
    const { data: alert, error: alertError } = await supabase
      .from('alerts')
      .insert({
        intelligence_event_id: null,
        suspect_id: null,
        severity: 'CRITICAL',
        source_tag: 'OFFICER_REPORT',
        title,
        message,
        target_institutions: null, // broadcast to all
        is_read: false,
        requires_action: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (alertError || !alert) {
      console.error('[alerts/sos POST] alert insert error', alertError)
      return apiError('Failed to send SOS alert', 500)
    }

    // 2. Create a field_report so the SOS appears on commander incident maps
    let reportId: string | null = null
    let sessionId: string | null = null

    try {
      const { data: report } = await supabase
        .from('field_reports')
        .insert({
          agent_id: user.user_id,
          title: `🚨 SOS EMERGENCY — ${user.full_name}`,
          category: 'EMERGENCY',
          description: message,
          priority: 'CRITICAL',
          incident_date: new Date().toISOString(),
          notes: notes?.trim() ?? null,
          location_lat: location_lat ?? null,
          location_lng: location_lng ?? null,
          location_description: location_description ?? null,
          alert_id: alert.id,
          intelligence_event_id: null,
          media_urls: [],
        })
        .select('id')
        .single()

      if (report?.id) {
        reportId = report.id

        // 4. Auto-start tracking session for live GPS monitoring
        const { data: session } = await supabase
          .from('agent_tracking_sessions')
          .insert({
            agent_id: user.user_id,
            field_report_id: reportId,
            status: 'ACTIVE',
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (session?.id) {
          sessionId = session.id
          // Link session back to field report
          await supabase
            .from('field_reports')
            .update({ tracking_session_id: sessionId })
            .eq('id', reportId)
        }
      }
    } catch (e) {
      // Fire-and-forget: SOS alert is sent regardless
      console.error('[alerts/sos POST] field report/session creation', e)
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
        tracking_session_id: sessionId,
        field_report_id: reportId,
      },
    })

    return apiSuccess({
      sent: true,
      alert_id: alert.id,
      field_report_id: reportId,
      tracking_session_id: sessionId,
    })
  } catch (err) {
    console.error('[alerts/sos POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only — no permission required, all users can send SOS
