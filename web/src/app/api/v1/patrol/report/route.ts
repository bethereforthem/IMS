import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/patrol/report
// Village Leader community insecurity report. Creates an OFFICER_REPORT
// intelligence event + HIGH alert to RNP tagged "VILLAGE INTEL".
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const {
      person_name,
      description,
      insecurity_type,
      location_lat,
      location_lng,
      location_description,
      file_urls,
    } = body

    if (!insecurity_type || !description) {
      return apiError('insecurity_type and description are required', 400)
    }

    const notes = JSON.stringify({
      person_name: person_name ?? 'Unknown',
      insecurity_type,
      description,
      file_urls: Array.isArray(file_urls) ? file_urls : [],
    })

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
      notes,
      event_timestamp: new Date().toISOString(),
    }

    const { data: event, error: eventError } = await supabase
      .from('intelligence_events')
      .insert(eventPayload)
      .select()
      .single()

    if (eventError || !event) {
      console.error('[patrol/report POST] event insert error', eventError)
      return apiError('Failed to submit report', 500)
    }

    const typeLabel = String(insecurity_type).replace(/_/g, ' ')
    const alertPayload = {
      intelligence_event_id: event.id,
      suspect_id: null,
      severity: 'HIGH',
      source_tag: 'OFFICER_REPORT',
      title: 'VILLAGE INTEL — Community Insecurity Report',
      message: `Village leader reports: ${typeLabel}. Person: ${person_name ?? 'Unknown'}.${
        location_description ? ` Location: ${location_description}.` : ''
      } ${String(description).slice(0, 120)}`,
      target_institutions: null,
      is_read: false,
      requires_action: true,
      created_at: new Date().toISOString(),
    }

    const { error: alertError } = await supabase.from('alerts').insert(alertPayload)
    if (!alertError) {
      await supabase
        .from('intelligence_events')
        .update({ alert_generated: true })
        .eq('id', event.id)
    }

    await logAudit({
      event_type: 'COMMUNITY_REPORT_SUBMITTED',
      actor: user,
      target_type: 'intelligence_event',
      target_id: event.id,
      action: 'CREATE',
      after_state: { insecurity_type, person_name: person_name ?? 'Unknown' },
    })

    return apiSuccess(event, 201)
  } catch (err) {
    console.error('[patrol/report POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'intel:report')
