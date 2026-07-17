import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/search?q=<term>
// Global lookup across suspects and cases. Sections are permission-gated:
// suspects require suspects:read, cases require cases:read (with the same
// institution scoping as GET /cases — NISS and RNP see all institutions).
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()

    if (q.length < 2) {
      return apiSuccess({ suspects: [], cases: [] })
    }
    // escape PostgREST or() special characters
    const term = q.replace(/[%,()]/g, ' ').trim()
    if (term.length < 2) return apiSuccess({ suspects: [], cases: [] })

    const canSuspects = hasPermission(user.role, 'suspects:read')
    const canCases = hasPermission(user.role, 'cases:read')
    if (!canSuspects && !canCases) {
      return apiError('Insufficient permissions', 403)
    }

    const supabase = createServerSupabaseClient()
    const pattern = `%${term}%`

    // National-ID lookup: suspects store only a SHA-256 hash of the NID
    // (digits-only), so numeric queries are hashed and matched exactly
    const digits = q.replace(/\D/g, '')
    const nidClause = digits.length >= 8
      ? `,national_id_hash.eq.${createHash('sha256').update(digits).digest('hex')}`
      : ''

    const suspectsQuery = canSuspects
      ? supabase
          .from('suspects')
          .select('id, full_name, ims_reference, status, threat_level, owning_institution, clearance_level')
          .or(`full_name.ilike.${pattern},ims_reference.ilike.${pattern}${nidClause}`)
          .order('created_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null })

    let casesQuery
    if (canCases) {
      let cq = supabase
        .from('cases')
        .select('id, case_reference, title, status, clearance_level, lead_institution')
        .or(`title.ilike.${pattern},case_reference.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(8)
      if (user.institution !== 'NISS' && user.institution !== 'RNP') {
        cq = cq.eq('lead_institution', user.institution)
      }
      casesQuery = cq
    } else {
      casesQuery = Promise.resolve({ data: [], error: null })
    }

    const [{ data: suspects, error: sErr }, { data: cases, error: cErr }] =
      await Promise.all([suspectsQuery, casesQuery])

    if (sErr || cErr) {
      console.error('[GET /api/v1/search]', sErr ?? cErr)
      return apiError('Search failed', 500)
    }

    return apiSuccess({
      suspects: (suspects ?? []).map((s: Record<string, unknown>) => ({
        ...s,
        institution_classification: s.owning_institution,
      })),
      cases: (cases ?? []).map((c: Record<string, unknown>) => ({
        ...c,
        classification: c.clearance_level,
      })),
    })
  } catch (err) {
    console.error('[GET /api/v1/search]', err)
    return apiError('Internal server error', 500)
  }
})
