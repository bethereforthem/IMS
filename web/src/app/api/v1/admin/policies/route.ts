import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'
import { extractAuditContext, logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// GET /api/v1/admin/policies
// List all policy documents with acceptance stats.
export const GET = withAuth(async (_req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  if (!hasPermission(user.role, 'admin:read')) return apiError('Insufficient permissions', 403)

  const db = createServerSupabaseClient()

  const { data: policies, error } = await db
    .from('policy_documents')
    .select('*')
    .order('policy_type')
    .order('version', { ascending: false })

  if (error) return apiError('Failed to fetch policies', 500)

  // Acceptance counts per document
  const { data: counts } = await db
    .from('user_policy_acceptances')
    .select('policy_document_id')

  const acceptCountMap: Record<string, number> = {}
  for (const row of counts ?? []) {
    const id = row.policy_document_id as string
    acceptCountMap[id] = (acceptCountMap[id] ?? 0) + 1
  }

  const enriched = (policies ?? []).map(p => ({
    ...p,
    acceptance_count: acceptCountMap[p.id] ?? 0,
  }))

  return apiSuccess({ policies: enriched, total: enriched.length })
})

// POST /api/v1/admin/policies
// Create a new version for a policy type (deactivates old active version).
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  if (!hasPermission(user.role, 'admin:write')) return apiError('Insufficient permissions', 403)

  const db = createServerSupabaseClient()
  const ctx = extractAuditContext(req)

  let body: {
    policy_type: string
    title?: string
    summary?: string
    content?: string
    effective_date?: string
  }
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid request body', 400)
  }

  const VALID_TYPES = ['TERMS_OF_SERVICE','PRIVACY_POLICY','SECURITY_POLICY','LOCATION_SHARING_POLICY']
  if (!body.policy_type || !VALID_TYPES.includes(body.policy_type)) {
    return apiError('Invalid policy_type', 400)
  }
  if (!body.title || !body.summary || !body.content) {
    return apiError('title, summary, and content are required', 400)
  }

  // Find current max version for this type
  const { data: existing } = await db
    .from('policy_documents')
    .select('version')
    .eq('policy_type', body.policy_type)
    .order('version', { ascending: false })
    .limit(1)

  const newVersion = ((existing?.[0]?.version as number) ?? 0) + 1

  // Deactivate all old versions of this type
  await db
    .from('policy_documents')
    .update({ is_active: false })
    .eq('policy_type', body.policy_type)

  // Create new active version
  const { data: created, error } = await db
    .from('policy_documents')
    .insert({
      policy_type:    body.policy_type,
      version:        newVersion,
      title:          body.title,
      summary:        body.summary,
      content:        body.content,
      is_active:      true,
      effective_date: body.effective_date ?? new Date().toISOString().split('T')[0],
      created_by:     user.user_id,
      created_by_name: user.full_name,
    })
    .select()
    .single()

  if (error) return apiError('Failed to create policy version', 500)

  await logAudit({
    event_type:  'POLICY_CREATED',
    actor:       user,
    target_type: 'policy_documents',
    target_id:   (created as Record<string, unknown>).id as string,
    action:      'CREATE',
    after_state: { policy_type: body.policy_type, version: newVersion },
    context:     ctx,
  })

  return apiSuccess({ policy: created }, 201)
})
