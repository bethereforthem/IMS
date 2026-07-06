import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (req: NextRequest, { user: _user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const resolved = searchParams.get('resolved') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

    const { data: incidents, error } = await db
      .from('security_incidents')
      .select('id, incident_type, severity, badge_number, full_name, institution, ip_address, country_code, country_name, city, description, auto_blocked, resolved, resolved_at, resolution_notes, created_at, alert_id')
      .eq('resolved', resolved)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return apiError('Failed to fetch security incidents', 500)

    return apiSuccess({ incidents: incidents ?? [], count: incidents?.length ?? 0 })
  },
  'admin:security'
)
