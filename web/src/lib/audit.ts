import { createServerSupabaseClient } from './supabase-server'
import type { AuthPayload } from './rbac'
import type { NextRequest } from 'next/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditContext {
  ip_address?: string | null
  device_info?: string | null
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface AuditParams {
  event_type: string
  actor?: AuthPayload
  target_type?: string
  target_id?: string
  action: string             // CREATE | READ | UPDATE | DELETE | EXPORT | LOGIN | LOGOUT
  before_state?: object | null
  after_state?: object | null
  justification?: string
  context?: AuditContext
}

// ─── Request context extraction ──────────────────────────────────────────────

/**
 * Pull IP, device info, and optional GPS from an incoming Next.js request.
 * GPS is read from X-GPS-Lat / X-GPS-Lng headers sent by the client.
 */
export function extractAuditContext(req: NextRequest): AuditContext {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : (req.headers.get('x-real-ip') ?? null)

  const ua = req.headers.get('user-agent') ?? null
  const gpsLat = req.headers.get('x-gps-lat')
  const gpsLng = req.headers.get('x-gps-lng')

  return {
    ip_address:  ip,
    device_info: ua ? ua.slice(0, 300) : null,
    gps_lat:     gpsLat ? parseFloat(gpsLat) : null,
    gps_lng:     gpsLng ? parseFloat(gpsLng) : null,
  }
}

// ─── Core logAudit ────────────────────────────────────────────────────────────

/**
 * Insert a row into the audit_log table.
 * Never throws — failures are silently swallowed so they never break request flow.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const db = createServerSupabaseClient()

    await db.from('audit_log').insert({
      event_type:        params.event_type,
      actor_id:          params.actor?.user_id         ?? null,
      actor_badge:       params.actor?.badge_number     ?? null,
      actor_name:        params.actor?.full_name        ?? null,
      actor_role:        params.actor?.role             ?? null,
      actor_institution: params.actor?.institution      ?? null,
      target_type:       params.target_type             ?? null,
      target_id:         params.target_id               ?? null,
      action:            params.action,
      before_state:      params.before_state            ?? null,
      after_state:       params.after_state             ?? null,
      justification:     params.justification           ?? null,
      ip_address:        params.context?.ip_address     ?? null,
      device_info:       params.context?.device_info    ?? null,
      gps_lat:           params.context?.gps_lat        ?? null,
      gps_lng:           params.context?.gps_lng        ?? null,
      event_timestamp:   new Date().toISOString(),
    })
  } catch {
    // Fire-and-forget: audit failures must never disrupt the request
  }
}
