import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// PATCH /api/v1/agent-tracking/sessions/:id
// Body: { action: 'pause' | 'resume' | 'close' }
// An agent can only manage their own session; NISS can manage any.
export const PATCH = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing session id', 400)

      const body = await req.json()
      const { action } = body as { action: string }

      if (!['pause', 'resume', 'close'].includes(action)) {
        return apiError('action must be pause | resume | close', 400)
      }

      // Fetch session
      const { data: session, error: sessErr } = await supabase
        .from('agent_tracking_sessions')
        .select('id, status, agent_id')
        .eq('id', id)
        .maybeSingle()

      if (sessErr || !session) return apiError('Session not found', 404)

      // Auth: own session or NISS
      if (session.agent_id !== user.user_id && user.institution !== 'NISS') {
        return apiError('Forbidden', 403)
      }

      const now = new Date().toISOString()
      let update: Record<string, unknown> = {}

      if (action === 'pause') {
        if (session.status !== 'ACTIVE') return apiError('Session is not active', 409)
        update = { status: 'PAUSED', paused_at: now }
      } else if (action === 'resume') {
        if (session.status !== 'PAUSED') return apiError('Session is not paused', 409)
        update = { status: 'ACTIVE', resumed_at: now, paused_at: null }
      } else if (action === 'close') {
        if (session.status === 'CLOSED') return apiError('Already closed', 409)
        update = { status: 'CLOSED', closed_at: now, closed_by: user.user_id }
      }

      const { data: updated, error: updErr } = await supabase
        .from('agent_tracking_sessions')
        .update(update)
        .eq('id', id)
        .select('id, status, paused_at, closed_at, resumed_at')
        .single()

      if (updErr || !updated) return apiError('Update failed', 500)

      await logAudit({
        event_type: `TRACKING_SESSION_${action.toUpperCase()}D`,
        actor: user,
        target_type: 'agent_tracking_session',
        target_id: id,
        action: 'UPDATE',
        after_state: { status: update.status },
      })

      return apiSuccess(updated)
    } catch (err) {
      console.error('[agent-tracking/sessions/:id PATCH]', err)
      return apiError('Internal server error', 500)
    }
  }
) // auth-only (own session or NISS checked in handler)

// GET /api/v1/agent-tracking/sessions/:id/pings — movement history
export const GET = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const supabase = createServerSupabaseClient()
      const id = params?.id
      if (!id) return apiError('Missing session id', 400)

      const { data: session } = await supabase
        .from('agent_tracking_sessions')
        .select('agent_id')
        .eq('id', id)
        .maybeSingle()

      if (!session) return apiError('Session not found', 404)
      if (session.agent_id !== user.user_id && user.institution !== 'NISS') {
        return apiError('Forbidden', 403)
      }

      const url = new URL(req.url)
      const limit = Math.min(1000, parseInt(url.searchParams.get('limit') ?? '200', 10))

      const { data: pings, error } = await supabase
        .from('agent_location_pings')
        .select('lat, lng, accuracy_m, heading, speed_ms, pinged_at')
        .eq('session_id', id)
        .order('pinged_at', { ascending: true })
        .limit(limit)

      if (error) return apiError('Failed to fetch pings', 500)

      return apiSuccess({ pings: pings ?? [], total: pings?.length ?? 0 })
    } catch (err) {
      console.error('[agent-tracking/sessions/:id GET]', err)
      return apiError('Internal server error', 500)
    }
  }
) // auth-only
