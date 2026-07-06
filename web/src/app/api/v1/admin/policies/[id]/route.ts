import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'
import { extractAuditContext, logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// PATCH /api/v1/admin/policies/[id]
// Update content or metadata of a policy document.
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  if (!hasPermission(user.role, 'admin:write')) return apiError('Insufficient permissions', 403)

  const id = params?.id
  if (!id) return apiError('Policy ID required', 400)

  const db = createServerSupabaseClient()
  const ctx = extractAuditContext(req)

  const { data: existing, error: fetchErr } = await db
    .from('policy_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return apiError('Policy not found', 404)

  let body: { title?: string; summary?: string; content?: string; effective_date?: string }
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid request body', 400)
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title)          updates.title = body.title
  if (body.summary)        updates.summary = body.summary
  if (body.content)        updates.content = body.content
  if (body.effective_date) updates.effective_date = body.effective_date

  const { data: updated, error } = await db
    .from('policy_documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return apiError('Failed to update policy', 500)

  await logAudit({
    event_type:   'POLICY_UPDATED',
    actor:        user,
    target_type:  'policy_documents',
    target_id:    id,
    action:       'UPDATE',
    before_state: existing as object,
    after_state:  updated as object,
    context:      ctx,
  })

  return apiSuccess({ policy: updated })
})

// GET /api/v1/admin/policies/[id]
// Fetch single policy with acceptance history.
export const GET = withAuth(async (_req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  if (!hasPermission(user.role, 'admin:read')) return apiError('Insufficient permissions', 403)

  const id = params?.id
  if (!id) return apiError('Policy ID required', 400)

  const db = createServerSupabaseClient()

  const { data: policy, error } = await db
    .from('policy_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !policy) return apiError('Policy not found', 404)

  const { data: acceptances } = await db
    .from('user_policy_acceptances')
    .select('id, full_name, badge_number, institution, role, accepted_at, ip_address, device_info, gps_lat, gps_lng')
    .eq('policy_document_id', id)
    .order('accepted_at', { ascending: false })
    .limit(100)

  return apiSuccess({ policy, acceptances: acceptances ?? [], acceptance_count: (acceptances ?? []).length })
})
