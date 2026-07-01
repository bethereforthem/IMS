import { createServerSupabaseClient } from './supabase-server'
import type { AuthPayload } from './rbac'

interface AuditParams {
  event_type: string
  actor?: AuthPayload
  target_type?: string
  target_id?: string
  action: string
  before_state?: object
  after_state?: object
  justification?: string
  ip_address?: string
}

/**
 * Insert a row into the audit_log table.
 * Never throws — failures are silently swallowed so they never break request flow.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const db = createServerSupabaseClient()

    await db.from('audit_log').insert({
      event_type: params.event_type,
      actor_id: params.actor?.user_id ?? null,
      actor_badge: params.actor?.badge_number ?? null,
      actor_role: params.actor?.role ?? null,
      actor_institution: params.actor?.institution ?? null,
      target_type: params.target_type ?? null,
      target_id: params.target_id ?? null,
      action: params.action,
      before_state: params.before_state ?? null,
      after_state: params.after_state ?? null,
      justification: params.justification ?? null,
      ip_address: params.ip_address ?? null,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Fire-and-forget: audit failures must not disrupt the request
  }
}
