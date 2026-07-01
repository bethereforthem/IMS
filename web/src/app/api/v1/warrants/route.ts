import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// GET /api/v1/warrants
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const url = new URL(req.url)
    const activeParam = url.searchParams.get('active')
    const priority = url.searchParams.get('priority')
    const suspect_id = url.searchParams.get('suspect_id')
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('warrants')
      .select('*, suspects(full_name, ims_reference, status, threat_level)', { count: 'exact' })
      .range(offset, offset + pageSize - 1)
      .order('issued_at', { ascending: false })

    if (activeParam !== null) {
      query = query.eq('active', activeParam === 'true')
    }
    if (priority) query = query.eq('priority', priority)
    if (suspect_id) query = query.eq('suspect_id', suspect_id)

    const { data: warrants, count, error } = await query

    if (error) {
      console.error('[GET /api/v1/warrants]', error)
      return apiError('Failed to fetch warrants', 500)
    }

    return apiSuccess({
      warrants: warrants ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[GET /api/v1/warrants]', err)
    return apiError('Internal server error', 500)
  }
}, 'suspects:read')
