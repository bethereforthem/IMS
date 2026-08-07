import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// Which institutions can share alerts to which targets
const SHARE_RULES: Record<string, string[]> = {
  NISS: ['RNP', 'RDF'],
  RDF:  ['RNP'],
}

export const POST = withAuth(
  async (req: NextRequest, { user, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    try {
      const alertId = params?.id
      if (!alertId) return apiError('Alert ID required', 400)

      const body = await req.json().catch(() => null)
      if (!body) return apiError('Request body required', 400)

      const { target_institution, instructions } = body as {
        target_institution: string
        instructions: string
      }

      if (!target_institution || !instructions?.trim()) {
        return apiError('target_institution and instructions are required', 400)
      }

      const allowed = SHARE_RULES[user.institution] ?? []
      if (!allowed.includes(target_institution)) {
        return apiError(`${user.institution} cannot share alerts to ${target_institution}`, 403)
      }

      const supabase = createServerSupabaseClient()

      const { data: orig, error: fetchErr } = await supabase
        .from('alerts')
        .select('*')
        .eq('id', alertId)
        .single()

      if (fetchErr || !orig) return apiError('Alert not found', 404)

      const newTitle = `[FWD:${user.institution}] ${orig.title}`
      const newMessage =
        orig.message +
        `\n\n─── Forwarded by ${user.full_name} (${user.institution}) ───\n` +
        instructions.trim()

      const { data: created, error: createErr } = await supabase
        .from('alerts')
        .insert({
          intelligence_event_id: orig.intelligence_event_id,
          suspect_id: orig.suspect_id,
          severity: orig.severity,
          source_tag: orig.source_tag,
          title: newTitle,
          message: newMessage,
          target_institutions: [target_institution],
          is_read: false,
          requires_action: true,
          suspect_name: orig.suspect_name,
        })
        .select('id')
        .single()

      if (createErr || !created) {
        console.error('[alerts/share]', createErr)
        return apiError('Failed to create shared alert', 500)
      }

      // Forwarding an alert moves intelligence across an institutional boundary.
      // That had no audit record, so there was no way to establish afterwards
      // who released what to whom.
      await logAudit({
        event_type:  'ALERT_SHARED',
        action:      'CREATE',
        actor:       user,
        target_type: 'alert',
        target_id:   alertId,
        after_state: {
          shared_alert_id: created.id,
          target_institution,
          instructions: instructions.trim(),
        },
        justification: instructions.trim(),
        context:       extractAuditContext(req),
      })

      return apiSuccess({ shared_alert_id: created.id, target: target_institution })
    } catch (err) {
      console.error('[alerts/share]', err)
      return apiError('Internal server error', 500)
    }
  },
  'alerts:acknowledge'
)
