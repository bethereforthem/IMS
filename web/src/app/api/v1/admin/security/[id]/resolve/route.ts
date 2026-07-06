import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const POST = withAuth(
  async (req: NextRequest, { user: actor, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('Incident ID required', 400)

    const db = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* notes optional */ }

    const { error } = await db.from('security_incidents').update({
      resolved: true,
      resolved_by: actor.user_id,
      resolved_at: new Date().toISOString(),
      resolution_notes: (body.resolution_notes as string) ?? null,
    }).eq('id', id)

    if (error) return apiError('Failed to resolve incident', 500)

    await logAudit({
      event_type: 'ADMIN_ACTION',
      action: 'admin_resolve_security_incident',
      actor,
      target_type: 'security_incident',
      target_id: id,
      context: ctx,
    }).catch(() => {})

    return apiSuccess({ resolved: true })
  },
  'admin:security'
)
