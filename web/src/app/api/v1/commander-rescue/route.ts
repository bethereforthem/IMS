import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// Rescue teams notified per institution
// ---------------------------------------------------------------------------
const RESCUE_ROUTING: Record<string, string[]> = {
  NISS:           ['NISS', 'RNP'],
  RNP:            ['RNP', 'NISS'],
  RDF:            ['RDF', 'NISS', 'RNP'],
  RCS:            ['RCS', 'RNP'],
  RIB:            ['RIB', 'NISS'],
  VILLAGE_LEADER: ['RNP'],
  SYSTEM:         ['NISS', 'RNP'],
}

// ---------------------------------------------------------------------------
// POST /api/v1/commander-rescue
// Authorized commander triggers an emergency rescue alert.
// Creates CRITICAL alert → intelligence event → field_report → tracking session.
// Requires permission: commander_rescue:trigger
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const body = await req.json()
      const { location_lat, location_lng, location_description, notes } = body

      const rescueTeams = RESCUE_ROUTING[user.institution] ?? ['NISS', 'RNP']
      const coordNote   = (location_lat && location_lng)
        ? ` GPS: ${Number(location_lat).toFixed(5)}, ${Number(location_lng).toFixed(5)}.`
        : ' GPS: not available.'
      const locNote     = location_description ? ` Location: ${location_description}.` : ''
      const teamsStr    = rescueTeams.join(' + ')

      const title   = `🆘 COMMANDER RESCUE — ${user.full_name} REQUIRES IMMEDIATE ASSISTANCE`
      const message = `COMMANDER IN DANGER: ${user.full_name} (${user.institution} · Badge: ${user.badge_number}) has activated an emergency rescue alert. Immediate rescue response required.${coordNote}${locNote} Rescue teams notified: ${teamsStr}.${notes ? ' Note: ' + notes : ''}`

      // 1. Intelligence event — GPS pin on all location maps
      const { data: event } = await supabase
        .from('intelligence_events')
        .insert({
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
          notes: `COMMANDER_RESCUE: ${message}`,
          event_timestamp: new Date().toISOString(),
        })
        .select('id')
        .single()

      // 2. CRITICAL broadcast alert — targeted at rescue institutions
      const { data: alert, error: alertErr } = await supabase
        .from('alerts')
        .insert({
          intelligence_event_id: event?.id ?? null,
          suspect_id: null,
          severity: 'CRITICAL',
          source_tag: 'OFFICER_REPORT',
          title,
          message,
          target_institutions: rescueTeams,
          is_read: false,
          requires_action: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (alertErr || !alert) {
        console.error('[commander-rescue POST] alert insert error', alertErr)
        return apiError('Failed to create rescue alert', 500)
      }

      if (event) {
        await supabase.from('intelligence_events').update({ alert_generated: true }).eq('id', event.id)
      }

      // 3. Field report — appears on commander incident maps with gold pin
      let reportId: string | null = null
      let sessionId: string | null = null

      try {
        const { data: report } = await supabase
          .from('field_reports')
          .insert({
            agent_id: user.user_id,
            title: `🆘 COMMANDER RESCUE — ${user.full_name}`,
            category: 'COMMANDER_RESCUE',
            description: message,
            priority: 'CRITICAL',
            incident_date: new Date().toISOString(),
            notes: notes?.trim() ?? null,
            location_lat: location_lat ?? null,
            location_lng: location_lng ?? null,
            location_description: location_description ?? null,
            alert_id: alert.id,
            intelligence_event_id: event?.id ?? null,
            media_urls: [],
          })
          .select('id')
          .single()

        if (report?.id) {
          reportId = report.id

          // 4. Tracking session — live GPS until resolved
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
            await supabase
              .from('field_reports')
              .update({ tracking_session_id: sessionId })
              .eq('id', reportId)
          }
        }
      } catch (e) {
        console.error('[commander-rescue POST] field report/session', e)
      }

      await logAudit({
        event_type: 'COMMANDER_RESCUE_TRIGGERED',
        actor: user,
        target_type: 'alert',
        target_id: alert.id,
        action: 'CREATE',
        after_state: {
          location_lat: location_lat ?? null,
          location_lng: location_lng ?? null,
          institution: user.institution,
          rescue_teams: rescueTeams,
          tracking_session_id: sessionId,
          field_report_id: reportId,
        },
      })

      return apiSuccess({
        sent: true,
        alert_id: alert.id,
        field_report_id: reportId,
        tracking_session_id: sessionId,
        rescue_teams: rescueTeams,
      })
    } catch (err) {
      console.error('[commander-rescue POST]', err)
      return apiError('Internal server error', 500)
    }
  },
  'commander_rescue:trigger'
)

// ---------------------------------------------------------------------------
// GET /api/v1/commander-rescue
// Returns active commander rescue alerts visible to the authenticated user.
// Requires permission: commander_rescue:trigger
// ---------------------------------------------------------------------------
export const GET = withAuth(
  async (_req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()

      let query = supabase
        .from('alerts')
        .select('*')
        .eq('severity', 'CRITICAL')
        .eq('is_read', false)
        .eq('requires_action', true)
        .order('created_at', { ascending: false })
        .limit(20)

      // Non-NISS: only see alerts targeting their institution
      if (user.institution !== 'NISS') {
        query = query.or(`target_institutions.cs.{${user.institution}},target_institutions.is.null`)
      }

      const { data: alerts, error } = await query

      if (error) return apiError('Failed to fetch rescue alerts', 500)

      // Filter client-side for commander rescue alerts by title prefix
      const rescueAlerts = (alerts ?? []).filter((a: { title: string }) =>
        (a as { title: string }).title.startsWith('🆘')
      )

      return apiSuccess({ alerts: rescueAlerts, total: rescueAlerts.length })
    } catch (err) {
      console.error('[commander-rescue GET]', err)
      return apiError('Internal server error', 500)
    }
  },
  'commander_rescue:trigger'
)
