import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// PATCH /api/v1/siem/events/[id]/review
// ---------------------------------------------------------------------------
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const id = params?.id
    if (!id) return apiError('SIEM event ID is required', 400)

    const supabase = createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const notes = body?.notes ?? null

    const { error } = await supabase
      .from('siem_events')
      .update({
        reviewed: true,
        reviewed_by: user.user_id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('id', id)

    if (error) {
      console.error('[siem/events/[id]/review PATCH]', error)
      return apiError('Failed to mark SIEM event as reviewed', 500)
    }

    await logAudit({
      event_type: 'SIEM_EVENT_REVIEWED',
      actor: user,
      target_type: 'siem_event',
      target_id: id,
      action: 'UPDATE',
      after_state: { reviewed: true, reviewed_by: user.user_id, review_notes: notes },
    })

    return apiSuccess({ message: 'SIEM event reviewed' })
  } catch (err) {
    console.error('[siem/events/[id]/review PATCH]', err)
    return apiError('Internal server error', 500)
  }
}, 'siem:manage')
