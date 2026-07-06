import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (_req: NextRequest, { user: _user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()

    const { data: users, error } = await db
      .from('users')
      .select('id, badge_number, full_name, role, clearance_level, institution, active, locked, mfa_failures, last_login_at, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[admin/users] list error:', error.message)
      return apiError('Failed to fetch users', 500)
    }

    return apiSuccess({ users: users ?? [] })
  },
  'admin:users'
)
