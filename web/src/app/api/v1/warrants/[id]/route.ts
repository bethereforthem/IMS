import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// GET /api/v1/warrants/[id]
export const GET = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('Warrant ID required', 400)

    const db = createServerSupabaseClient()
    const { data, error } = await db
      .from('warrants')
      .select('*, suspects(id, full_name, ims_reference, status, threat_level, nationality, date_of_birth)')
      .eq('id', id)
      .single()

    if (error || !data) return apiError('Warrant not found', 404)

    await logAudit({
      event_type: 'WARRANT_READ', action: 'READ', actor: user,
      target_type: 'warrant', target_id: id,
      context: extractAuditContext(req),
    })

    return apiSuccess(data)
  },
  'suspects:read',
)

// PATCH /api/v1/warrants/[id]
export const PATCH = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('Warrant ID required', 400)

    const db = createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))

    const { data: existing } = await db.from('warrants').select('*').eq('id', id).single()
    if (!existing) return apiError('Warrant not found', 404)

    const allowed = ['charges', 'warrant_type', 'issued_by_court', 'case_reference',
                     'expires_at', 'active', 'executed_at', 'notes']
    const updates: Record<string, unknown> = {}
    for (const k of allowed) { if (k in body) updates[k] = body[k] }

    if (!Object.keys(updates).length) return apiError('No valid fields to update', 400)

    const { data: updated, error } = await db
      .from('warrants').update(updates).eq('id', id).select().single()

    if (error) return apiError('Failed to update warrant', 500)

    await logAudit({
      event_type: 'WARRANT_UPDATED', action: 'UPDATE', actor: user,
      target_type: 'warrant', target_id: id,
      before_state: existing, after_state: updated,
      context: extractAuditContext(req),
    })

    return apiSuccess(updated)
  },
  'suspects:write',
)

// DELETE /api/v1/warrants/[id] — deactivates (sets active = false)
export const DELETE = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('Warrant ID required', 400)

    const db = createServerSupabaseClient()
    const { data: existing } = await db.from('warrants').select('*').eq('id', id).single()
    if (!existing) return apiError('Warrant not found', 404)

    const { data: updated, error } = await db
      .from('warrants')
      .update({ active: false, executed_at: new Date().toISOString() })
      .eq('id', id).select().single()

    if (error) return apiError('Failed to revoke warrant', 500)

    await logAudit({
      event_type: 'WARRANT_REVOKED', action: 'DELETE', actor: user,
      target_type: 'warrant', target_id: id,
      before_state: existing, after_state: updated,
      context: extractAuditContext(req),
    })

    return apiSuccess({ revoked: true, id })
  },
  'suspects:write',
)
