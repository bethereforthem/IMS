import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit, extractAuditContext } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

export const GET = withAuth(
  async (_req: NextRequest, { params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('User ID required', 400)

    const db = createServerSupabaseClient()

    const { data: user, error } = await db
      .from('users')
      .select('id, badge_number, full_name, role, clearance_level, institution, active, locked, mfa_failures, last_login_at, created_at')
      .eq('id', id)
      .single()

    if (error || !user) return apiError('User not found', 404)

    const [{ data: sessions }, { data: attempts }] = await Promise.all([
      db.from('user_sessions')
        .select('id, ip_address, device_type, browser, os, country_name, city, is_vpn, created_at, last_active_at, current_page, revoked, role')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      db.from('login_attempts')
        .select('id, success, ip_address, device_type, browser, os, country_name, city, failure_reason, attempted_at')
        .eq('user_id', id)
        .order('attempted_at', { ascending: false })
        .limit(30),
    ])

    return apiSuccess({ user, sessions: sessions ?? [], login_attempts: attempts ?? [] })
  },
  'admin:users'
)

export const PATCH = withAuth(
  async (req: NextRequest, { user: actor, params }: { user: AuthPayload; params?: Record<string, string> }) => {
    const id = params?.id
    if (!id) return apiError('User ID required', 400)

    const db = createServerSupabaseClient()
    const ctx = extractAuditContext(req)

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    const allowed: Record<string, unknown> = {}
    if (typeof body.active === 'boolean') allowed.active = body.active
    if (typeof body.locked === 'boolean') allowed.locked = body.locked

    if (Object.keys(allowed).length === 0) return apiError('No valid fields to update', 400)

    const { error } = await db.from('users').update(allowed).eq('id', id)
    if (error) return apiError('Update failed', 500)

    const action = body.active === false ? 'admin_disable_user'
      : body.active === true ? 'admin_enable_user'
      : body.locked === true ? 'admin_lock_user'
      : 'admin_unlock_user'

    await logAudit({
      event_type: 'ADMIN_ACTION',
      action,
      actor,
      target_type: 'user',
      target_id: id,
      context: ctx,
      after_state: allowed,
    }).catch(() => {})

    return apiSuccess({ updated: true })
  },
  'admin:users'
)
