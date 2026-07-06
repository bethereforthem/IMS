import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// GET /api/v1/policies/pending
// Returns active policy documents that the authenticated user has NOT yet accepted.
// Used by usePolicyGate to detect whether to redirect to /agree.
export const GET = withAuth(async (_req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  const db = createServerSupabaseClient()

  // All currently active policy documents
  const { data: active, error: activeErr } = await db
    .from('policy_documents')
    .select('id, policy_type, version, title, summary, content, effective_date')
    .eq('is_active', true)

  if (activeErr) return apiError('Failed to fetch policies', 500)
  if (!active || active.length === 0) {
    return apiSuccess({ pending: [], all_accepted: true })
  }

  // Policy IDs the user has already accepted
  const activeIds = active.map(p => p.id)
  const { data: accepted, error: acceptErr } = await db
    .from('user_policy_acceptances')
    .select('policy_document_id')
    .eq('user_id', user.user_id)
    .in('policy_document_id', activeIds)

  if (acceptErr) return apiError('Failed to check acceptance status', 500)

  const acceptedIds = new Set((accepted ?? []).map(a => a.policy_document_id))
  const pending = active.filter(p => !acceptedIds.has(p.id))

  return apiSuccess({
    pending,
    all_accepted: pending.length === 0,
    total_policies: active.length,
    accepted_count: acceptedIds.size,
  })
})
