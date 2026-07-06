import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'
import { OFFLINE_THRESHOLD_SECONDS } from '../heartbeat/route'

// ---------------------------------------------------------------------------
// GET /api/v1/agent-tracking/agents
// Returns agents with active tracking sessions + last position + availability.
// Also performs lazy stale detection: agents whose heartbeat is overdue are
// atomically flipped to OFFLINE and a CRITICAL alert is created once.
// ---------------------------------------------------------------------------
export const GET = withAuth(async (_req: NextRequest, { user }: { user: AuthPayload }) => {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date()
    const staleThreshold = new Date(now.getTime() - OFFLINE_THRESHOLD_SECONDS * 1000).toISOString()

    // ── 1. Lazy stale detection ───────────────────────────────────────────────
    // Atomically flip any ONLINE agents whose heartbeat is overdue to OFFLINE.
    // Only matches rows where status is currently ONLINE (prevents double alerts).
    const { data: nowOffline } = await supabase
      .from('agent_availability')
      .update({
        status:         'OFFLINE',
        offline_reason: 'TIMEOUT',
        offline_since:  now.toISOString(),
        updated_at:     now.toISOString(),
      })
      .eq('status', 'ONLINE')
      .lt('last_heartbeat_at', staleThreshold)
      .select('agent_id, agent_name, agent_badge, institution, last_known_lat, last_known_lng')

    // For each newly offline agent → create CRITICAL alert + log event
    if (nowOffline && nowOffline.length > 0) {
      await Promise.allSettled(
        nowOffline.map(async (agent: {
          agent_id: string; agent_name: string | null; agent_badge: string | null
          institution: string | null; last_known_lat: number | null; last_known_lng: number | null
        }) => {
          const coordNote = (agent.last_known_lat && agent.last_known_lng)
            ? ` Last GPS: ${Number(agent.last_known_lat).toFixed(5)}, ${Number(agent.last_known_lng).toFixed(5)}.`
            : ' Last GPS: not available.'

          const { data: alert } = await supabase
            .from('alerts')
            .insert({
              suspect_id:       null,
              severity:         'CRITICAL',
              source_tag:       'SYSTEM',
              title:            `📵 AGENT OFFLINE — ${agent.agent_name ?? 'Unknown'} (${agent.institution ?? '?'})`,
              message:          `No heartbeat from ${agent.agent_name ?? 'Unknown'} (Badge: ${agent.agent_badge ?? '?'} · ${agent.institution ?? '?'}) for over ${OFFLINE_THRESHOLD_SECONDS}s. Device may be powered off or have lost connectivity.${coordNote} Verify status immediately.`,
              target_institutions: [agent.institution ?? 'NISS', 'NISS'],
              is_read:          false,
              requires_action:  true,
              created_at:       now.toISOString(),
            })
            .select('id')
            .single()

          // Store alert id to prevent duplicate alerts
          if (alert?.id) {
            await supabase
              .from('agent_availability')
              .update({ last_alert_id: alert.id })
              .eq('agent_id', agent.agent_id)
          }

          await supabase
            .from('agent_offline_events')
            .insert({
              agent_id:       agent.agent_id,
              event_type:     'OFFLINE',
              offline_reason: 'TIMEOUT',
              last_known_lat: agent.last_known_lat,
              last_known_lng: agent.last_known_lng,
              occurred_at:    now.toISOString(),
              alert_id:       alert?.id ?? null,
              institution:    agent.institution,
              agent_name:     agent.agent_name,
              agent_badge:    agent.agent_badge,
            })

          await logAudit({
            event_type: 'AGENT_OFFLINE',
            actor:      undefined,
            target_type: 'agent_availability',
            target_id:  agent.agent_id,
            action:     'UPDATE',
            after_state: {
              status:         'OFFLINE',
              offline_reason: 'TIMEOUT',
              agent_name:     agent.agent_name,
              institution:    agent.institution,
              alert_id:       alert?.id ?? null,
            },
          })
        })
      )
    }

    // ── 2. Fetch active/paused sessions ───────────────────────────────────────
    const { data: sessions, error: sessErr } = await supabase
      .from('agent_tracking_sessions')
      .select(`
        id, status, started_at, total_pings, field_report_id,
        users!agent_tracking_sessions_agent_id_fkey(
          id, full_name, badge_number, institution, role
        ),
        field_reports!agent_tracking_sessions_field_report_id_fkey(
          id, title, category, priority, status
        )
      `)
      .in('status', ['ACTIVE', 'PAUSED'])
      .order('started_at', { ascending: false })

    if (sessErr) return apiError('Failed to fetch sessions', 500)

    // ── 3. Fetch availability for all relevant agents ─────────────────────────
    const agentIds = (sessions ?? []).map((s: Record<string, unknown>) => {
      const u = s.users as Record<string, unknown> | null
      return u?.id as string | null
    }).filter(Boolean) as string[]

    let availMap: Record<string, {
      status: string; offline_reason: string | null; offline_since: string | null
      last_known_lat: number | null; last_known_lng: number | null
      last_heartbeat_at: string | null
    }> = {}

    if (agentIds.length > 0) {
      const { data: avail } = await supabase
        .from('agent_availability')
        .select('agent_id, status, offline_reason, offline_since, last_known_lat, last_known_lng, last_heartbeat_at')
        .in('agent_id', agentIds)

      for (const row of (avail ?? [])) {
        availMap[(row as { agent_id: string }).agent_id] = row as {
          status: string; offline_reason: string | null; offline_since: string | null
          last_known_lat: number | null; last_known_lng: number | null
          last_heartbeat_at: string | null
        }
      }
    }

    // ── 4. Enrich each session ────────────────────────────────────────────────
    const enriched = await Promise.all(
      (sessions ?? []).map(async (s: Record<string, unknown>) => {
        const { data: latestPing } = await supabase
          .from('agent_location_pings')
          .select('lat, lng, accuracy_m, heading, speed_ms, pinged_at')
          .eq('session_id', s.id as string)
          .order('pinged_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const agent  = s.users as Record<string, unknown> | null
        const report = (s.field_reports as Record<string, unknown>[] | null)?.[0] ?? null
        const agentId = agent?.id as string | null
        const avail  = agentId ? (availMap[agentId] ?? null) : null

        // Effective availability: if no record exists assume ONLINE; compute stale on the fly
        let availStatus: string = avail?.status ?? 'ONLINE'
        if (availStatus === 'ONLINE' && avail?.last_heartbeat_at) {
          const secsSince = (now.getTime() - new Date(avail.last_heartbeat_at).getTime()) / 1000
          if (secsSince > OFFLINE_THRESHOLD_SECONDS) availStatus = 'OFFLINE'
        }

        // Use ping coords if available, fall back to availability last_known coords
        const lastLat = latestPing?.lat ?? avail?.last_known_lat ?? null
        const lastLng = latestPing?.lng ?? avail?.last_known_lng ?? null

        return {
          session_id:          s.id,
          session_status:      s.status,
          started_at:          s.started_at,
          total_pings:         s.total_pings,
          field_report_id:     s.field_report_id,
          agent_id:            agent?.id ?? null,
          agent_name:          agent?.full_name ?? null,
          agent_badge:         agent?.badge_number ?? null,
          agent_institution:   agent?.institution ?? null,
          agent_role:          agent?.role ?? null,
          last_lat:            lastLat,
          last_lng:            lastLng,
          last_heading:        latestPing?.heading ?? null,
          last_ping_at:        latestPing?.pinged_at ?? avail?.last_heartbeat_at ?? null,
          report_title:        report?.title ?? null,
          report_priority:     report?.priority ?? null,
          // Availability fields
          availability_status:  availStatus,
          offline_reason:       avail?.offline_reason ?? null,
          offline_since:        avail?.offline_since ?? null,
          last_heartbeat_at:    avail?.last_heartbeat_at ?? null,
        }
      })
    )

    // Non-NISS: only see agents from own institution
    const filtered = user.institution === 'NISS'
      ? enriched
      : enriched.filter(a => a.agent_institution === user.institution)

    const offlineCount = filtered.filter(a => a.availability_status !== 'ONLINE').length

    return apiSuccess({ agents: filtered, total: filtered.length, offline_count: offlineCount })
  } catch (err) {
    console.error('[agent-tracking/agents GET]', err)
    return apiError('Internal server error', 500)
  }
}, 'alerts:read')
