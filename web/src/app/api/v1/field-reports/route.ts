import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/field-reports — field agent submits an incident report
// Automatically creates an intelligence_event + CRITICAL/HIGH alert so the
// incident appears on the NISS Commander's real-time map.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()

    const {
      offline_id,
      title,
      category,
      description,
      priority = 'MEDIUM',
      incident_date,
      notes,
      location_lat,
      location_lng,
      location_description,
      media_urls = [],
    } = body

    if (!title?.trim()) return apiError('title is required', 400)
    if (!category?.trim()) return apiError('category is required', 400)
    if (!description?.trim()) return apiError('description is required', 400)

    // Dedup check for offline sync
    if (offline_id) {
      const { data: existing } = await supabase
        .from('field_reports')
        .select('id, alert_id, tracking_session_id')
        .eq('offline_id', offline_id)
        .maybeSingle()
      if (existing) {
        return apiSuccess({
          id: existing.id,
          alert_id: existing.alert_id,
          tracking_session_id: existing.tracking_session_id,
          already_synced: true,
        })
      }
    }

    const severityMap: Record<string, string> = {
      LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL',
    }
    const alertSeverity = severityMap[priority] ?? 'HIGH'

    // 1. Create intelligence event (so GPS appears on existing location maps)
    const { data: event, error: eventErr } = await supabase
      .from('intelligence_events')
      .insert({
        source_tag: 'OFFICER_REPORT',
        officer_id: user.user_id,
        institution: user.institution,
        location_lat: location_lat ?? null,
        location_lng: location_lng ?? null,
        location_description: location_description ?? null,
        criminal_record_found: false,
        alert_generated: false,
        notes: JSON.stringify({ title, category, priority, description, notes }),
        event_timestamp: incident_date ?? new Date().toISOString(),
      })
      .select('id')
      .single()

    if (eventErr) {
      console.error('[field-reports POST] event insert', eventErr)
      return apiError('Failed to create intelligence event', 500)
    }

    // 2. Create alert visible to NISS (+ institution of reporter)
    const alertTitle = `[FIELD REPORT] ${title}`
    const coordNote = location_lat && location_lng
      ? ` GPS: ${Number(location_lat).toFixed(5)}, ${Number(location_lng).toFixed(5)}.`
      : ''
    const alertMessage =
      `${category} — reported by ${user.full_name} (${user.institution} · ${user.badge_number}).` +
      `${coordNote} Priority: ${priority}. ${description.slice(0, 300)}`

    const targetInstitutions = ['NISS']
    if (user.institution !== 'NISS') targetInstitutions.push(user.institution)

    const { data: alert, error: alertErr } = await supabase
      .from('alerts')
      .insert({
        intelligence_event_id: event.id,
        severity: alertSeverity,
        source_tag: 'OFFICER_REPORT',
        title: alertTitle,
        message: alertMessage,
        target_institutions: targetInstitutions,
        is_read: false,
        requires_action: true,
      })
      .select('id')
      .single()

    if (alertErr || !alert) {
      console.error('[field-reports POST] alert insert', alertErr)
      return apiError('Failed to create alert', 500)
    }

    await supabase
      .from('intelligence_events')
      .update({ alert_generated: true })
      .eq('id', event.id)

    // 3. Insert field report
    const { data: report, error: reportErr } = await supabase
      .from('field_reports')
      .insert({
        agent_id: user.user_id,
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        priority,
        incident_date: incident_date ?? new Date().toISOString(),
        notes: notes?.trim() ?? null,
        location_lat: location_lat ?? null,
        location_lng: location_lng ?? null,
        location_description: location_description ?? null,
        alert_id: alert.id,
        intelligence_event_id: event.id,
        media_urls,
        offline_id: offline_id ?? null,
        synced_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (reportErr || !report) {
      console.error('[field-reports POST] report insert', reportErr)
      return apiError('Failed to save field report', 500)
    }

    // 4. Auto-start tracking session for this agent
    const { data: session, error: sessionErr } = await supabase
      .from('agent_tracking_sessions')
      .insert({
        agent_id: user.user_id,
        field_report_id: report.id,
        status: 'ACTIVE',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!sessionErr && session) {
      await supabase
        .from('field_reports')
        .update({ tracking_session_id: session.id })
        .eq('id', report.id)
    }

    await logAudit({
      event_type: 'FIELD_REPORT_SUBMITTED',
      actor: user,
      target_type: 'field_report',
      target_id: report.id,
      action: 'CREATE',
      after_state: { priority, category, location_lat, location_lng },
    })

    return apiSuccess({
      id: report.id,
      alert_id: alert.id,
      intelligence_event_id: event.id,
      tracking_session_id: session?.id ?? null,
    }, 201)
  } catch (err) {
    console.error('[field-reports POST]', err)
    return apiError('Internal server error', 500)
  }
}) // auth-only

// ---------------------------------------------------------------------------
// GET /api/v1/field-reports — commanders list all reports
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const priority = url.searchParams.get('priority')
    const { pageSize, offset } = getPagination(req)
    const limit = Math.min(100, pageSize)

    let query = supabase
      .from('field_reports')
      .select(`
        *,
        users!field_reports_agent_id_fkey(
          full_name, badge_number, institution, role
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)

    // Non-NISS: only their own institution's reports
    if (user.institution !== 'NISS') {
      query = query.eq('users.institution', user.institution)
    }

    const { data: reports, count, error } = await query
    if (error) return apiError('Failed to fetch field reports', 500)

    const mapped = (reports ?? []).map((r: Record<string, unknown> & { users?: Record<string, unknown> | null }) => ({
      ...r,
      agent_name: (r.users as Record<string, unknown> | null)?.full_name ?? null,
      agent_badge: (r.users as Record<string, unknown> | null)?.badge_number ?? null,
      agent_institution: (r.users as Record<string, unknown> | null)?.institution ?? null,
    }))

    return apiSuccess({ reports: mapped, total: count ?? 0 })
  } catch (err) {
    console.error('[field-reports GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')
