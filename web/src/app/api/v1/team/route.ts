import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// GET /api/v1/team
// Active officers of the caller's institution with live case workload.
// NISS may pass ?institution=RIB to view another institution's roster.
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const requested = url.searchParams.get('institution')
    const institution =
      user.institution === 'NISS' && requested ? requested : user.institution

    const supabase = createServerSupabaseClient()

    const { data: members, error } = await supabase
      .from('users')
      .select('id, badge_number, full_name, role, institution, clearance_level, active, last_login_at')
      .eq('institution', institution)
      .eq('active', true)
      .order('badge_number', { ascending: true })

    if (error) {
      console.error('[GET /api/v1/team]', error)
      return apiError('Failed to fetch team', 500)
    }

    // Live workload: open cases led by each officer
    const { data: openCases, error: casesError } = await supabase
      .from('cases')
      .select('lead_officer_id, status')
      .eq('lead_institution', institution)
      .in('status', ['OPEN', 'UNDER_INVESTIGATION', 'PROSECUTION'])

    if (casesError) {
      console.error('[GET /api/v1/team] cases', casesError)
      return apiError('Failed to fetch case workload', 500)
    }

    const caseCounts = (openCases ?? []).reduce<Record<string, number>>((acc, c) => {
      if (c.lead_officer_id) acc[c.lead_officer_id] = (acc[c.lead_officer_id] ?? 0) + 1
      return acc
    }, {})

    return apiSuccess({
      institution,
      members: (members ?? []).map(m => ({
        ...m,
        active_cases: caseCounts[m.id] ?? 0,
      })),
      total_open_cases: (openCases ?? []).length,
    })
  } catch (err) {
    console.error('[GET /api/v1/team]', err)
    return apiError('Internal server error', 500)
  }
}, 'cases:read')
