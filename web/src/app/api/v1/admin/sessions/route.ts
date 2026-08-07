import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (req: NextRequest, { user: _user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const institution = searchParams.get('institution')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)

    let query = db
      .from('user_sessions')
      .select('id, user_id, full_name, badge_number, institution, role, ip_address, device_type, browser, os, country_name, country_code, city, is_vpn, is_proxy, current_page, created_at, last_active_at, expires_at, revoked')
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .order('last_active_at', { ascending: false })
      .limit(limit)

    if (institution) {
      query = query.eq('institution', institution)
    }

    // `count` used to be the length of the (limited) page, so any caller
    // rendering it as "active sessions" under-reported as soon as there were
    // more sessions than the limit. Ask the database for the real total —
    // alongside the page, not after it.
    let countQuery = db
      .from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())

    if (institution) countQuery = countQuery.eq('institution', institution)

    const [
      { data: sessions, error },
      { count: totalCount, error: countError },
    ] = await Promise.all([query, countQuery])

    if (error) return apiError('Failed to fetch sessions', 500)
    if (countError) console.error('[admin/sessions] count query failed:', countError.message)

    const total = countError ? (sessions?.length ?? 0) : (totalCount ?? 0)

    return apiSuccess({
      sessions: sessions ?? [],
      count: total,
      returned: sessions?.length ?? 0,
      truncated: total > (sessions?.length ?? 0),
    })
  },
  'admin:read'
)
