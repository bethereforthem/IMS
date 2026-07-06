import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { extractAuditContext, logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// POST /api/v1/policies/accept
// Accepts all currently pending (unaccepted) policy documents for the user.
// Body: { policy_ids: string[] }  — the IDs from the /pending response.
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  const db = createServerSupabaseClient()
  const ctx = extractAuditContext(req)

  let body: { policy_ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid request body', 400)
  }

  const { policy_ids } = body
  if (!Array.isArray(policy_ids) || policy_ids.length === 0) {
    return apiError('policy_ids array is required', 400)
  }

  // Verify these IDs are active policies (prevent accepting arbitrary IDs)
  const { data: policies, error: pErr } = await db
    .from('policy_documents')
    .select('id, policy_type, version')
    .in('id', policy_ids)
    .eq('is_active', true)

  if (pErr) return apiError('Failed to validate policies', 500)
  if (!policies || policies.length === 0) {
    return apiError('No valid active policies found for provided IDs', 400)
  }

  // Upsert acceptances
  const rows = policies.map(p => ({
    user_id:            user.user_id,
    policy_document_id: p.id,
    policy_type:        p.policy_type,
    policy_version:     p.version,
    ip_address:         ctx.ip_address ?? null,
    device_info:        ctx.device_info ?? null,
    gps_lat:            ctx.gps_lat    ?? null,
    gps_lng:            ctx.gps_lng    ?? null,
    badge_number:       user.badge_number,
    full_name:          user.full_name,
    institution:        user.institution,
    role:               user.role,
  }))

  const { error: upsertErr } = await db
    .from('user_policy_acceptances')
    .upsert(rows, { onConflict: 'user_id,policy_document_id' })

  if (upsertErr) return apiError('Failed to record acceptance', 500)

  await logAudit({
    event_type:  'POLICY_ACCEPTANCE',
    actor:       user,
    target_type: 'policy_documents',
    target_id:   policy_ids.join(','),
    action:      'CREATE',
    after_state: { accepted_policy_ids: policy_ids, types: policies.map(p => p.policy_type) },
    context:     ctx,
  })

  return apiSuccess({ accepted: policies.length, policy_types: policies.map(p => p.policy_type) })
})
