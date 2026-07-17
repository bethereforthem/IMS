'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { adminPortalApi, type AdminSession, type SecurityIncident } from '@/lib/api'
import { Users, ShieldAlert, Globe, Monitor, Activity, TrendingUp, AlertTriangle, VolumeX, Volume2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ── Alarm audio (Web Audio API) ───────────────────────────────────────────────

function playAlarmTick(ctx: AudioContext) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(960, ctx.currentTime)
  osc.frequency.setValueAtTime(800, ctx.currentTime + 0.1)
  gain.gain.setValueAtTime(0.18, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.35)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
}

const TYPE_SHORT: Record<string, string> = {
  ACCESS_OUTSIDE_RWANDA:  'Outside Rwanda',
  VPN_DETECTED:           'VPN',
  PROXY_DETECTED:         'Proxy',
  MULTIPLE_FAILED_LOGINS: 'Brute Force',
  IMPOSSIBLE_TRAVEL:      'Impossible Travel',
  UNUSUAL_HOUR_ACCESS:    'Off-Hours',
  MASS_DATA_ACCESS:       'Mass Access',
  PRIVILEGE_ESCALATION:   'Priv Escalation',
  CREDENTIAL_STUFFING:    'Cred Stuffing',
  SUSPICIOUS_LOCATION:    'Suspicious Loc',
}

// ── Overview page ─────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
  const [sessions,  setSessions]  = useState<AdminSession[]>([])
  const [incidents, setIncidents] = useState<SecurityIncident[]>([])
  const [analytics, setAnalytics] = useState<{
    summary: { total_active_users: number; total_logins_24h: number; failed_logins_24h: number; unresolved_incidents: number }
  } | null>(null)
  const [health, setHealth] = useState<{ status: string; db_latency_ms: number; db_healthy: boolean } | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [muted,     setMuted]     = useState(false)
  const [alarmDismissed, setAlarmDismissed] = useState(false)
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const alarmInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const criticalCount = incidents.filter(i => i.severity === 'CRITICAL' && !i.resolved).length
  const highCount     = incidents.filter(i => i.severity === 'HIGH'     && !i.resolved).length
  const showAlert     = (criticalCount > 0 || highCount > 0) && !alarmDismissed

  // Start / stop alarm sound
  useEffect(() => {
    if (showAlert && !muted) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      // Play immediately, then every 4 seconds
      playAlarmTick(ctx)
      alarmInterval.current = setInterval(() => playAlarmTick(ctx), 4000)
    } else {
      if (alarmInterval.current) {
        clearInterval(alarmInterval.current)
        alarmInterval.current = null
      }
    }
    return () => {
      if (alarmInterval.current) clearInterval(alarmInterval.current)
    }
  }, [showAlert, muted])

  const load = useCallback(() => {
    Promise.all([
      adminPortalApi.getSessions({ limit: 20 }),
      adminPortalApi.getIncidents(false, 20),
      adminPortalApi.getAnalytics(),
      adminPortalApi.getHealth(),
    ]).then(([s, i, a, h]) => {
      setSessions(s.data?.sessions ?? [])
      setIncidents(i.data?.incidents ?? [])
      setAnalytics(a.data ?? null)
      setHealth(h.data ? { status: h.data.status, db_latency_ms: h.data.db_latency_ms, db_healthy: h.data.db_healthy } : null)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const summary = analytics?.summary

  const cards = [
    { label: 'Active Users',        value: summary?.total_active_users ?? '—', icon: Users,       color: '#3b82f6' },
    { label: 'Logins (24h)',         value: summary?.total_logins_24h ?? '—',   icon: Activity,    color: '#22c55e' },
    { label: 'Failed Logins (24h)', value: summary?.failed_logins_24h ?? '—',  icon: TrendingUp,  color: '#f97316' },
    { label: 'Open IDS Incidents',  value: summary?.unresolved_incidents ?? '—', icon: ShieldAlert, color: '#ef4444' },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
        Loading admin overview…
      </div>
    )
  }

  return (
    <div>

      {/* ── CRITICAL / HIGH alert banner ─────────────────────────────────────── */}
      {showAlert && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          background: criticalCount > 0 ? '#450a0a' : '#431407',
          border: `2px solid ${criticalCount > 0 ? '#ef4444' : '#f97316'}`,
          borderRadius: '10px',
          display: 'flex', alignItems: 'center', gap: '14px',
          animation: 'pulse-border 1.5s ease-in-out infinite',
          boxShadow: `0 0 32px ${criticalCount > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.35)'}`,
        }}>
          <style>{`
            @keyframes pulse-border {
              0%, 100% { box-shadow: 0 0 32px ${criticalCount > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.35)'}; }
              50%       { box-shadow: 0 0 56px ${criticalCount > 0 ? 'rgba(239,68,68,0.65)' : 'rgba(249,115,22,0.65)'}; }
            }
          `}</style>
          <AlertTriangle style={{
            width: 26, height: 26,
            color: criticalCount > 0 ? '#ef4444' : '#f97316',
            flexShrink: 0, animation: 'none',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 900, color: criticalCount > 0 ? '#fca5a5' : '#fed7aa', marginBottom: '3px' }}>
              {criticalCount > 0
                ? `⚠ ${criticalCount} CRITICAL SECURITY INCIDENT${criticalCount > 1 ? 'S' : ''} DETECTED`
                : `⚠ ${highCount} HIGH SEVERITY INCIDENT${highCount > 1 ? 'S' : ''} DETECTED`}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Immediate review required. Navigate to <strong style={{ color: '#f1f5f9' }}>Security / IDS</strong> to investigate and resolve.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? 'Unmute alarm' : 'Mute alarm'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32,
                background: '#1e293b', color: '#94a3b8',
                border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer',
              }}
            >
              {muted ? <VolumeX style={{ width: 14, height: 14 }} /> : <Volume2 style={{ width: 14, height: 14 }} />}
            </button>
            <button
              onClick={() => setAlarmDismissed(true)}
              style={{
                padding: '6px 12px', fontSize: '11px', fontWeight: 700,
                background: '#1e293b', color: '#64748b',
                border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Page title ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#f1f5f9', marginBottom: '4px' }}>
          System Administration
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b' }}>
          Real-time overview · Rwanda Intelligence Management System
        </p>
      </div>

      {/* ── Metric cards ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: '#0f172a', border: `1px solid ${c.color}33`,
            borderRadius: '10px', padding: '16px 20px',
            boxShadow: `0 0 16px ${c.color}18`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</span>
              <c.icon style={{ width: 18, height: 18, color: c.color }} />
            </div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* ── Active sessions ─────────────────────────────────────────────────── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Monitor style={{ width: 16, height: 16, color: '#3b82f6' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Active Sessions</span>
            <span style={{ marginLeft: 'auto', background: '#1e3a5f', color: '#93c5fd', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px' }}>
              {sessions.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
            {sessions.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>No active sessions</p>
            )}
            {sessions.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', background: '#1e293b', borderRadius: '6px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.full_name ?? 'Unknown'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    {s.badge_number} · {s.institution} · {s.role}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                    {s.is_vpn   && <span style={{ background: '#854d0e', color: '#fde68a', fontSize: '8px', fontWeight: 900, padding: '1px 4px', borderRadius: '2px' }}>VPN</span>}
                    {s.is_proxy && <span style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: '8px', fontWeight: 900, padding: '1px 4px', borderRadius: '2px' }}>PROXY</span>}
                    {(s.country_code && s.country_code !== 'RW') && (
                      <span style={{ background: '#4c1d95', color: '#ddd6fe', fontSize: '8px', fontWeight: 900, padding: '1px 4px', borderRadius: '2px' }}>
                        {s.country_code}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>{s.current_page ?? '/'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent IDS incidents ─────────────────────────────────────────────── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <ShieldAlert style={{ width: 16, height: 16, color: '#ef4444' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Recent IDS Incidents</span>
            <span style={{ marginLeft: 'auto', background: '#450a0a', color: '#fca5a5', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px' }}>
              {incidents.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
            {incidents.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>No open incidents</p>
            )}
            {incidents.map(i => (
              <div key={i.id} style={{
                padding: '8px 10px', background: '#1e293b', borderRadius: '6px',
                borderLeft: `3px solid ${SEVERITY_COLOR[i.severity] ?? '#64748b'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span style={{
                    background: SEVERITY_COLOR[i.severity] ?? '#64748b',
                    color: '#fff', fontSize: '9px', fontWeight: 900,
                    padding: '1px 5px', borderRadius: '3px',
                  }}>
                    {i.severity}
                  </span>
                  <span style={{ color: '#f1f5f9', fontSize: '11px', fontWeight: 700 }}>
                    {TYPE_SHORT[i.incident_type] ?? i.incident_type}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {i.badge_number} · {i.institution}
                  {i.country_name ? ` · ${i.country_name}` : ''}
                  {' · '}{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live system status footer ────────────────────────────────────────── */}
      <div style={{
        marginTop: '24px', padding: '12px 16px',
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '20px',
      }}>
        <Globe style={{ width: 16, height: 16, color: health?.db_healthy ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', flex: 1 }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            System status:{' '}
            <span style={{
              color: health?.status === 'OPERATIONAL' ? '#22c55e'
                : health?.status === 'ALERT' ? '#ef4444'
                : health?.status === 'LOCKED' ? '#f97316'
                : '#f59e0b',
              fontWeight: 700,
            }}>
              {health?.status ?? 'CHECKING…'}
            </span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            DB:{' '}
            <span style={{ color: health?.db_healthy ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
              {health == null ? '…' : health.db_healthy ? `OK · ${health.db_latency_ms}ms` : 'UNREACHABLE'}
            </span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            IDS: <span style={{ color: '#22c55e', fontWeight: 700 }}>ACTIVE</span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Auto-refresh every 30s</span>
        </div>
      </div>
    </div>
  )
}
