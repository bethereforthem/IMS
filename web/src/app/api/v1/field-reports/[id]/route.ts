import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// GET /api/v1/field-reports/:id
export const GET = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing id', 400)

      const { data, error } = await supabase
        .from('field_reports')
        .select(`
          *,
          users!field_reports_agent_id_fkey(
            full_name, badge_number, institution, role
          ),
          agent_tracking_sessions(
            id, status, started_at, paused_at, closed_at, total_pings
          )
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) return apiError('DB error', 500)
      if (!data) return apiError('Not found', 404)

      // Non-NISS: only see if in target institution or own report
      const agentInstitution = (data as Record<string, unknown> & { users?: Record<string, unknown> | null })
        .users?.institution as string | undefined
      if (
        user.institution !== 'NISS' &&
        agentInstitution !== user.institution &&
        (data as Record<string, unknown>).agent_id !== user.user_id
      ) {
        return apiError('Forbidden', 403)
      }

      const r = data as Record<string, unknown> & {
        users?: Record<string, unknown> | null
        agent_tracking_sessions?: Record<string, unknown>[] | null
      }
      return apiSuccess({
        ...r,
        agent_name: r.users?.full_name ?? null,
        agent_badge: r.users?.badge_number ?? null,
        agent_institution: r.users?.institution ?? null,
        tracking_session: r.agent_tracking_sessions?.[0] ?? null,
      })
    } catch (err) {
      console.error('[field-reports/:id GET]', err)
      return apiError('Internal server error', 500)
    }
  },
  'alerts:read'
)

// PATCH /api/v1/field-reports/:id
export const PATCH = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const db = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing id', 400)

      const body = await req.json().catch(() => ({}))
      const { data: existing } = await db.from('field_reports').select('*').eq('id', id).single()
      if (!existing) return apiError('Not found', 404)

      // Submitter or institution admin can update
      if (existing.agent_id !== user.user_id && user.institution !== 'NISS') {
        return apiError('Forbidden', 403)
      }

      const allowed = ['title', 'category', 'description', 'priority', 'status',
                       'notes', 'location_lat', 'location_lng', 'location_description',
                       'assigned_to', 'media_urls']
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of allowed) { if (k in body) updates[k] = body[k] }

      const { data: updated, error } = await db
        .from('field_reports').update(updates).eq('id', id).select().single()
      if (error) return apiError('Failed to update', 500)

      await logAudit({
        event_type: 'FIELD_REPORT_UPDATED', action: 'UPDATE', actor: user,
        target_type: 'field_report', target_id: id,
        before_state: existing, after_state: updated,
        context: extractAuditContext(req),
      })

      return apiSuccess(updated)
    } catch (err) {
      console.error('[field-reports/:id PATCH]', err)
      return apiError('Internal server error', 500)
    }
  },
  'field_reports:write'
)

// DELETE /api/v1/field-reports/:id — soft delete (CLOSED status)
export const DELETE = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const db = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing id', 400)

      const { data: existing } = await db.from('field_reports').select('*').eq('id', id).single()
      if (!existing) return apiError('Not found', 404)

      if (existing.agent_id !== user.user_id && user.institution !== 'NISS') {
        return apiError('Forbidden', 403)
      }

      const { data: updated, error } = await db
        .from('field_reports')
        .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) return apiError('Failed to close report', 500)

      await logAudit({
        event_type: 'FIELD_REPORT_DELETED', action: 'DELETE', actor: user,
        target_type: 'field_report', target_id: id,
        before_state: existing, after_state: updated,
        context: extractAuditContext(req),
      })

      return apiSuccess({ deleted: true, id })
    } catch (err) {
      console.error('[field-reports/:id DELETE]', err)
      return apiError('Internal server error', 500)
    }
  },
  'field_reports:write'
)
