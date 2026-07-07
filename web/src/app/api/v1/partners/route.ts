import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// GET /api/v1/partners
// Requires international:manage or interpol:query
// ---------------------------------------------------------------------------
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const canAccess =
      hasPermission(user.role, 'international:manage') ||
      hasPermission(user.role, 'interpol:query')

    if (!canAccess) {
      return apiError('Insufficient permissions — requires international:manage or interpol:query', 403)
    }

    const supabase = createServerSupabaseClient()

    const { data: partners, error } = await supabase
      .from('international_partners')
      .select('*')
      .eq('active', true)
      .order('country_name', { ascending: true })

    if (error) {
      console.error('[partners GET]', error)
      return apiError('Failed to fetch international partners', 500)
    }

    return apiSuccess({ partners: partners ?? [] })
  } catch (err) {
    console.error('[partners GET]', err)
    return apiError('Internal server error', 500)
  }
  // JWT-only gate; permission check is inside
})