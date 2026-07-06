import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// GET /api/v1/border/verifications
// Returns paginated verification logs for the officer's institution.
export const GET = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)

    const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
    const limit  = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))
    const status = searchParams.get('status')   // CLEAN | FLAGGED | EXPIRED_DOC | etc.
    const docType = searchParams.get('doc_type')
    const mine   = searchParams.get('mine') === 'true'
    const from   = searchParams.get('from')
    const to     = searchParams.get('to')

    const offset = (page - 1) * limit

    let query = db
      .from('border_verifications')
      .select('*', { count: 'exact' })
      .eq('institution', user.institution)
      .order('verified_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (mine)    query = query.eq('officer_id', user.user_id)
    if (status)  query = query.eq('verification_status', status)
    if (docType) query = query.eq('doc_type', docType)
    if (from)    query = query.gte('verified_at', from)
    if (to)      query = query.lte('verified_at', to)

    const { data, count, error } = await query
    if (error) return apiError('Failed to fetch verifications', 500)

    return apiSuccess({
      verifications: data ?? [],
      total: count ?? 0,
      page,
      limit,
      pages: Math.ceil((count ?? 0) / limit),
    })
  },
  'border:verify:logs',
)
