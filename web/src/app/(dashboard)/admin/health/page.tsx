'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminPortalApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity, Database, Lock, Unlock, Shield, ShieldAlert,
  Users, AlertTriangle, CheckCircle, XCircle, RefreshCw, Power
} from 'lucide-react'

interface ServiceStatus { key: string; label: string; enabled: boolean }
interface LockedInstitution { inst: string; locked_at: string }
interface HealthData {
  status: 'OPERATIONAL' | 'DEGRADED' | 'LOCKED' | 'ALERT'
  db_healthy: boolean
  db_latency_ms: number
  system_locked: boolean
  active_sessions: number
  total_active_users: number
  total_locked_users: number
  logins_24h: number
  failed_24h: number
  open_incidents: { CRITICAL: number; HIGH: number; MEDIUM: number; total: number }
  service_statuses: ServiceStatus[]
  locked_institutions: LockedInstitution[]
  last_login: { attempted_at: string; badge_number: string; full_name: string; institution: string } | null
  last_audit: { event_timestamp: string; event_type: string; actor_name: string; actor_institution: string } | null
  checked_at: string
  response_time_ms: number
}

const STATUS_CONFIG = {
  OPERATIONAL: { color: '#22c55e', bg: '#052e16', border: '#22c55e', label: 'OPERATIONAL', icon: CheckCircle },
  ALERT:       { color: '#ef4444', bg: '#450a0a', border: '#ef4444', label: 'ALERT',       icon: ShieldAlert },
  LOCKED:      { color: '#f97316', bg: '#431407', border: '#f97316', label: 'LOCKED',      icon: Lock },
  DEGRADED:    { color: '#f59e0b', bg: '#451a03', border: '#f59e0b', label: 'DEGRADED',    icon: AlertTriangle },
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444',
      boxShadow: `0 0 6px ${ok ? '#22c55e' : '#ef4444'}`,
    }} />
  )
}

function MetricCard({ label, value, sub, color = '#94a3b8', icon: Icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType
}) {
  return (
    <div style={{
      background: '#0f172a', border: `1px solid ${color}33`,
      borderRadius: '10px', padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        {Icon && <Icon style={{ width: 16, height: 16, color }} />}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

export default function AdminHealthPage() {
  const [data,      setData]      = useState<HealthData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await adminPortalApi.getHealth()
      setData(r.data ?? null)
      setLastFetch(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
        Loading system health…
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        Failed to load health data.
      </div>
    )
  }

  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.OPERATIONAL
  const StatusIcon = cfg.icon

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Activity style={{ width: 22, height: 22, color: cfg.color }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>System Health</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Live monitoring · auto-refresh every 30s
            {lastFetch && ` · checked ${formatDistanceToNow(lastFetch, { addSuffix: true })}`}
          </p>
        </div>
        <button
          onClick={load}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: '#1e293b', color: '#94a3b8',
            border: '1px solid #334155', borderRadius: '6px',
            padding: '6px 12px', fontSize: '11px', cursor: 'pointer',
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
        </button>
      </div>

      {/* Overall status banner */}
      <div style={{
        background: cfg.bg, border: `2px solid ${cfg.border}`,
        borderRadius: '10px', padding: '16px 20px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '14px',
        boxShadow: data.status !== 'OPERATIONAL' ? `0 0 28px ${cfg.color}30` : 'none',
      }}>
        <StatusIcon style={{ width: 28, height: 28, color: cfg.color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: 900, color: cfg.color, letterSpacing: '1px' }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
            {data.status === 'OPERATIONAL' && 'All systems running normally.'}
            {data.status === 'ALERT'       && `${data.open_incidents.CRITICAL} critical + ${data.open_incidents.HIGH} high IDS incidents require attention.`}
            {data.status === 'LOCKED'      && 'Emergency system lock is active. Only SYSTEM_ADMIN can access.'}
            {data.status === 'DEGRADED'    && 'Database health check failed. Services may be unavailable.'}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', color: '#64748b' }}>Response time</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: cfg.color }}>{data.response_time_ms}ms</div>
        </div>
      </div>

      {/* Metric cards row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <MetricCard label="Active Sessions"    value={data.active_sessions}    color="#3b82f6" icon={Users} />
        <MetricCard label="Active Users"       value={data.total_active_users} color="#22c55e" icon={Users} />
        <MetricCard label="Locked Accounts"    value={data.total_locked_users} color="#f97316" icon={Lock}  />
        <MetricCard label="Logins (24h)"       value={data.logins_24h}         color="#22c55e" icon={Activity} />
        <MetricCard label="Failed Logins (24h)"value={data.failed_24h}         color="#ef4444" icon={AlertTriangle} />
        <MetricCard label="Open Incidents"     value={data.open_incidents.total} color={data.open_incidents.total > 0 ? '#ef4444' : '#22c55e'} icon={ShieldAlert} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* DB health */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Database style={{ width: 16, height: 16, color: data.db_healthy ? '#22c55e' : '#ef4444' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Database</span>
            <StatusDot ok={data.db_healthy} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#64748b' }}>Status</span>
              <span style={{ color: data.db_healthy ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                {data.db_healthy ? 'Healthy' : 'Unreachable'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#64748b' }}>Query latency</span>
              <span style={{ color: data.db_latency_ms > 500 ? '#f97316' : '#22c55e', fontWeight: 700 }}>
                {data.db_latency_ms}ms
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#64748b' }}>Provider</span>
              <span style={{ color: '#94a3b8' }}>Supabase (PostgreSQL)</span>
            </div>
          </div>
        </div>

        {/* IDS incident summary */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <ShieldAlert style={{ width: 16, height: 16, color: '#ef4444' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Open IDS Incidents</span>
          </div>
          {data.open_incidents.total === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '13px' }}>
              <CheckCircle style={{ width: 16, height: 16 }} /> All clear — no open incidents
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([['CRITICAL', '#ef4444'], ['HIGH', '#f97316'], ['MEDIUM', '#f59e0b']] as const).map(([sev, color]) => (
                <div key={sev} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color, padding: '2px 6px', background: `${color}22`, borderRadius: '3px' }}>{sev}</span>
                  <span style={{ fontSize: '18px', fontWeight: 900, color }}>{data.open_incidents[sev]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Services */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Power style={{ width: 16, height: 16, color: '#64748b' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Services</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {data.service_statuses.map(svc => (
              <div key={svc.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', background: '#1e293b', borderRadius: '5px',
              }}>
                <span style={{ fontSize: '12px', color: '#e2e8f0' }}>{svc.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <StatusDot ok={svc.enabled} />
                  <span style={{ fontSize: '10px', color: svc.enabled ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                    {svc.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Access locks */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            {data.system_locked ? <Lock style={{ width: 16, height: 16, color: '#ef4444' }} /> : <Unlock style={{ width: 16, height: 16, color: '#22c55e' }} />}
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Access Controls</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#1e293b', borderRadius: '5px' }}>
              <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>System Lock</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <StatusDot ok={!data.system_locked} />
                <span style={{ fontSize: '10px', color: data.system_locked ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                  {data.system_locked ? 'LOCKED' : 'Normal'}
                </span>
              </div>
            </div>
            {data.locked_institutions.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#64748b', padding: '6px 10px' }}>No institutions locked</div>
            ) : (
              data.locked_institutions.map(li => (
                <div key={li.inst} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', background: '#431407', borderRadius: '5px',
                  border: '1px solid #f9741633',
                }}>
                  <span style={{ fontSize: '12px', color: '#fed7aa', fontWeight: 700 }}>{li.inst}</span>
                  <span style={{ fontSize: '9px', color: '#f97316' }}>
                    {formatDistanceToNow(new Date(li.locked_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent activity row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Last login */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Shield style={{ width: 14, height: 14, color: '#3b82f6' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>Last Successful Login</span>
          </div>
          {data.last_login ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.8 }}>
              <div><span style={{ color: '#f1f5f9', fontWeight: 600 }}>{data.last_login.full_name}</span></div>
              <div>{data.last_login.badge_number} · {data.last_login.institution}</div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>
                {formatDistanceToNow(new Date(data.last_login.attempted_at), { addSuffix: true })}
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: '12px' }}>No logins recorded</div>
          )}
        </div>

        {/* Last audit event */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Activity style={{ width: 14, height: 14, color: '#a855f7' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>Last Audit Event</span>
          </div>
          {data.last_audit ? (
            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.8 }}>
              <div><span style={{ color: '#f1f5f9', fontWeight: 600 }}>{data.last_audit.event_type}</span></div>
              <div>{data.last_audit.actor_name} · {data.last_audit.actor_institution}</div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>
                {formatDistanceToNow(new Date(data.last_audit.event_timestamp), { addSuffix: true })}
              </div>
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: '12px' }}>No audit events</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '16px', padding: '10px 14px',
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '10px', color: '#475569',
      }}>
        <XCircle style={{ width: 12, height: 12, color: '#22c55e' }} />
        Checked: {data.checked_at ? new Date(data.checked_at).toLocaleTimeString() : '—'}
        &nbsp;·&nbsp;API response: {data.response_time_ms}ms
        &nbsp;·&nbsp;DB latency: {data.db_latency_ms}ms
        &nbsp;·&nbsp;Auto-refreshes every 30s
      </div>
    </div>
  )
}
