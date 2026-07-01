import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/intelligence/events
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)

    const source_tag = url.searchParams.get('source_tag')
    const criminal_record_found = url.searchParams.get('criminal_record_found')
    const officer_id = url.searchParams.get('officer_id')
    const suspect_id = url.searchParams.get('suspect_id')

    const { pageSize, offset } = getPagination(req)
    const rawLimit = parseInt(url.searchParams.get('limit') ?? String(pageSize), 10)
    const limit = Math.min(100, Math.max(1, rawLimit))

    let query = supabase
      .from('intelligence_events')
      .select('*, suspects(full_name, ims_reference, status, threat_level)', { count: 'exact' })
      .order('event_timestamp', { ascending: false })
      .range(offset, offset + limit - 1)

    if (source_tag) query = query.eq('source_tag', source_tag)
    if (criminal_record_found !== null) {
      query = query.eq('criminal_record_found', criminal_record_found === 'true')
    }
    if (officer_id) query = query.eq('officer_id', officer_id)
    if (suspect_id) query = query.eq('suspect_id', suspect_id)

    const { data: events, count, error } = await query

    if (error) {
      console.error('[intelligence/events GET]', error)
      return apiError('Failed to fetch intelligence events', 500)
    }

    const mappedEvents = (events ?? []).map((e: Record<string, unknown> & { suspects?: Record<string, unknown> | null }) => ({
      ...e,
      suspect_name: e.suspects?.full_name ?? null,
      reporting_officer_id: e.officer_id,
      confidence_score: e.confidence,
      created_at: e.event_timestamp ?? e.created_at,
    }))

    return apiSuccess({ events: mappedEvents, total: count ?? 0 })
  } catch (err) {
    console.error('[intelligence/events GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'source_attribution:read')

// ---------------------------------------------------------------------------
// POST /api/v1/intelligence/events
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()

    const {
      source_tag,
      suspect_id,
      location_lat,
      location_lng,
      location_description,
      criminal_record_found,
      confidence,
      camera_node_id,
      notes,
      source_device_id,
    } = body

    if (!source_tag) {
      return apiError('source_tag is required', 400)
    }

    const eventPayload = {
      source_tag,
      suspect_id: suspect_id ?? null,
      officer_id: user.user_id,
      institution: user.institution,
      location_lat: location_lat ?? null,
      location_lng: location_lng ?? null,
      location_description: location_description ?? null,
      criminal_record_found: criminal_record_found ?? false,
      alert_generated: false,
      confidence: confidence ?? null,
      camera_node_id: camera_node_id ?? null,
      notes: notes ?? null,
      source_device_id: source_device_id ?? null,
      event_timestamp: new Date().toISOString(),
    }

    const { data: event, error: insertError } = await supabase
      .from('intelligence_events')
      .insert(eventPayload)
      .select()
      .single()

    if (insertError || !event) {
      console.error('[intelligence/events POST] insert error', insertError)
      return apiError('Failed to create intelligence event', 500)
    }

    // Auto-create CRITICAL alert if criminal record found and source is NID_SCAN or FACE_SCAN
    const autoAlertTags = ['NID_SCAN', 'FACE_SCAN']
    if (criminal_record_found && autoAlertTags.includes(source_tag)) {
      const alertPayload = {
        intelligence_event_id: event.id,
        suspect_id: suspect_id ?? null,
        severity: 'CRITICAL',
        source_tag,
        title: `Criminal Record Match — ${source_tag}`,
        message: `A criminal record match was detected via ${source_tag}. Immediate action required.`,
        target_institutions: null, // broadcast to all
        is_read: false,
        requires_action: true,
        created_at: new Date().toISOString(),
      }

      const { error: alertError } = await supabase.from('alerts').insert(alertPayload)
      if (alertError) {
        console.error('[intelligence/events POST] alert insert error', alertError)
      } else {
        // Mark alert_generated on the event
        await supabase
          .from('intelligence_events')
          .update({ alert_generated: true })
          .eq('id', event.id)
      }
    }

    await logAudit({
      event_type: 'INTELLIGENCE_EVENT_CREATED',
      actor: user,
      target_type: 'intelligence_event',
      target_id: event.id,
      action: 'CREATE',
      after_state: event,
    })

    return apiSuccess(event, 201)
  } catch (err) {
    console.error('[intelligence/events POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'source_attribution:read')
