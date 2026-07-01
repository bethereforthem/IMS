import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/siem/events
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const url = new URL(req.url)

    const reviewed = url.searchParams.get('reviewed')
    const severity = url.searchParams.get('severity')
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50', 10))

    let query = supabase
      .from('siem_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (reviewed !== null && reviewed !== '') {
      query = query.eq('reviewed', reviewed === 'true')
    }
    if (severity) query = query.eq('severity', severity)

    const { data: events, count, error } = await query

    if (error) {
      console.error('[siem/events GET]', error)
      return apiError('Failed to fetch SIEM events', 500)
    }

    return apiSuccess({ events: events ?? [], total: count ?? 0 })
  } catch (err) {
    console.error('[siem/events GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'siem:read')

// ---------------------------------------------------------------------------
// POST /api/v1/siem/events
// Requires siem:manage (NISS / SIEM_ANALYST only)
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()

    const { rule_name, severity, description, auto_action, actor_id, actor_institution, raw_data } = body

    if (!rule_name || !severity || !description) {
      return apiError('rule_name, severity, and description are required', 400)
    }

    const { data: siemEvent, error } = await supabase
      .from('siem_events')
      .insert({
        rule_name,
        severity,
        actor_id: actor_id ?? user.user_id,
        actor_institution: actor_institution ?? user.institution,
        description,
        raw_data: raw_data ?? null,
        auto_action: auto_action ?? null,
        auto_actioned: false,
        reviewed: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error || !siemEvent) {
      console.error('[siem/events POST]', error)
      return apiError('Failed to create SIEM event', 500)
    }

    // Auto-create CRITICAL alert for CRITICAL SIEM events
    if (severity === 'CRITICAL') {
      const { error: alertError } = await supabase.from('alerts').insert({
        severity: 'CRITICAL',
        source_tag: 'SYSTEM_ALERT',
        title: `SIEM: ${rule_name}`,
        message: description,
        target_institutions: null, // broadcast
        is_read: false,
        requires_action: true,
        created_at: new Date().toISOString(),
      })
      if (alertError) {
        console.error('[siem/events POST] alert insert error', alertError)
      }
    }

    return apiSuccess(siemEvent, 201)
  } catch (err) {
    console.error('[siem/events POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'siem:manage')
