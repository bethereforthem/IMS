import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    const { event, page_path, page_title, visit_id } = body as {
      event: 'enter' | 'leave'
      page_path: string
      page_title?: string
      visit_id?: string
    }

    if (!event || !page_path) return apiError('event and page_path required', 400)

    if (event === 'enter') {
      const { data: row } = await db.from('page_visits').insert({
        session_id: user.session_id,
        user_id: user.user_id,
        badge_number: user.badge_number,
        institution: user.institution,
        role: user.role,
        page_path,
        page_title: page_title ?? null,
      }).select('id').single()

      await db.from('user_sessions').update({
        current_page: page_path,
        last_active_at: new Date().toISOString(),
      }).eq('id', user.session_id)

      return apiSuccess({ recorded: true, visit_id: row?.id ?? null })

    } else if (event === 'leave' && visit_id) {
      const now = new Date()
      const { data: visit } = await db
        .from('page_visits')
        .select('entered_at')
        .eq('id', visit_id)
        .eq('user_id', user.user_id)
        .single()

      const duration = visit?.entered_at
        ? Math.floor((now.getTime() - new Date(visit.entered_at).getTime()) / 1000)
        : null

      await db.from('page_visits').update({
        left_at: now.toISOString(),
        duration_seconds: duration,
      }).eq('id', visit_id)

      return apiSuccess({ recorded: true })
    }

    return apiSuccess({ recorded: false })
  },
  'alerts:read'
)
