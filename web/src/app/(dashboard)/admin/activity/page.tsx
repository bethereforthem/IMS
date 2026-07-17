'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { adminPortalApi, type AdminSession } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Monitor, Globe, Shield, ShieldAlert, Activity, RefreshCw,
  XCircle, LogIn, AlertTriangle, Eye, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'

// ── Risk scoring ──────────────────────────────────────────────────────────────

type Risk = 'critical' | 'high' | 'medium' | 'low'

function getSessionRisk(s: AdminSession): Risk {
  if (s.country_code && s.country_code !== 'RW') return 'critical'
  if (s.is_vpn) return 'high'
  if (s.is_proxy) return 'high'
  return 'low'
}

const RISK_COLOR: Record<Risk, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#f59e0b',
  low:      '#22c55e',
}

const RISK_BG: Record<Risk, string> = {
  critical: '#450a0a',
  high:     '#431407',
  medium:   '#451a03',
  low:      '#052e16',
}

const RISK_LABEL: Record<Risk, string> = {
  critical: 'OUTSIDE RW',
  high:     'VPN/PROXY',
  medium:   'UNUSUAL',
  low:      'CLEAN',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageVisit {
  id: string
  page_path: string
  page_title: string | null
  entered_at: string
  left_at: string | null
  duration_seconds: number | null
}

interface LoginAttempt {
  id: string
  success: boolean
  ip_address: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  country_name: string | null
  city: string | null
  failure_reason: string | null
  attempted_at: string
}

interface SessionRecord {
  id: string
  ip_address: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  country_name: string | null
  country_code: string | null
  city: string | null
  is_vpn: boolean
  is_proxy: boolean
  created_at: string
  last_active_at: string | null
  current_page: string | null
  revoked: boolean
}

interface UserDetail {
  sessions: SessionRecord[]
  login_attempts: LoginAttempt[]
  page_visits: PageVisit[]
}

const INSTITUTIONS = ['', 'NISS', 'RNP', 'RIB', 'RDF', 'RCS']
const RISK_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All Sessions', value: '' },
  { label: 'Suspicious Only', value: 'suspicious' },
  { label: 'Outside Rwanda', value: 'outside_rw' },
  { label: 'VPN / Proxy', value: 'vpn' },
]

// ── Utility ───────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number | null): string {
  if (!seconds) return '< 1s'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function onlineMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminActivityPage() {
  const [sessions,     setSessions]     = useState<AdminSession[]>([])
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null)
  const [countdown,    setCountdown]    = useState(10)

  // Filters
  const [instFilter,   setInstFilter]   = useState('')
  const [riskFilter,   setRiskFilter]   = useState('')

  // Expanded row
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [userDetails,  setUserDetails]  = useState<Record<string, UserDetail>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [expandTab,    setExpandTab]    = useState<Record<string, 'visits' | 'logins' | 'history'>>({})

  // Actions
  const [revoking,     setRevoking]     = useState<string | null>(null)
  const [revokeMsg,    setRevokeMsg]    = useState<{ id: string; msg: string; ok: boolean } | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await adminPortalApi.getSessions({ limit: 200 })
      setSessions(r.data?.sessions ?? [])
      setLastRefresh(new Date())
      setCountdown(10)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 10_000)
    cdRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (cdRef.current) clearInterval(cdRef.current)
    }
  }, [load])

  const loadDetail = useCallback(async (userId: string) => {
    if (userDetails[userId]) return
    setLoadingDetail(userId)
    try {
      const r = await adminPortalApi.getUser(userId)
      const raw = r.data as Record<string, unknown>
      setUserDetails(prev => ({
        ...prev,
        [userId]: {
          sessions:       (raw.sessions as SessionRecord[])      ?? [],
          login_attempts: (raw.login_attempts as LoginAttempt[]) ?? [],
          page_visits:    (raw.page_visits as PageVisit[])       ?? [],
        },
      }))
    } catch (e) { console.error(e) }
    finally { setLoadingDetail(null) }
  }, [userDetails])

  const handleExpand = (s: AdminSession) => {
    if (expandedId === s.id) { setExpandedId(null); return }
    setExpandedId(s.id)
    loadDetail(s.user_id)
    setExpandTab(prev => ({ ...prev, [s.id]: prev[s.id] ?? 'visits' }))
  }

  const handleRevoke = async (sessionId: string) => {
    if (!confirm('Terminate this session? The user will be logged out immediately.')) return
    setRevoking(sessionId)
    setRevokeMsg(null)
    try {
      await adminPortalApi.revokeSession(sessionId)
      setRevokeMsg({ id: sessionId, msg: 'Session terminated', ok: true })
      await load()
      setExpandedId(null)
    } catch {
      setRevokeMsg({ id: sessionId, msg: 'Failed to terminate session', ok: false })
    } finally {
      setRevoking(null)
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const outsideRw = sessions.filter(s => s.country_code && s.country_code !== 'RW')
  const vpnProxy  = sessions.filter(s => s.is_vpn || s.is_proxy)
  const suspicious = new Set([...outsideRw, ...vpnProxy].map(s => s.id)).size

  const filtered = sessions.filter(s => {
    if (instFilter && s.institution !== instFilter) return false
    if (riskFilter === 'suspicious') return getSessionRisk(s) !== 'low'
    if (riskFilter === 'outside_rw') return s.country_code && s.country_code !== 'RW'
    if (riskFilter === 'vpn')        return s.is_vpn || s.is_proxy
    return true
  })

  // Sort: critical first, then high, then by last_active
  const sorted = [...filtered].sort((a, b) => {
    const riskOrder: Record<Risk, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    const ra = riskOrder[getSessionRisk(a)]
    const rb = riskOrder[getSessionRisk(b)]
    if (ra !== rb) return ra - rb
    return new Date(b.last_active_at ?? b.created_at).getTime() -
           new Date(a.last_active_at ?? a.created_at).getTime()
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
      Loading live activity…
    </div>
  )

  return (
    <div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Activity style={{ width: 22, height: 22, color: '#22c55e', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Live User Activity</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Real-time session monitoring · auto-refreshes in <strong style={{ color: '#3b82f6' }}>{countdown}s</strong>
            {lastRefresh && ` · last updated ${formatDistanceToNow(lastRefresh, { addSuffix: true })}`}
          </p>
        </div>
        <button onClick={load} style={BTN_GHOST}>
          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh now
        </button>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Active Sessions',   value: sessions.length,       color: '#3b82f6', icon: Monitor },
          { label: 'Suspicious',        value: suspicious,             color: suspicious > 0 ? '#ef4444' : '#22c55e', icon: ShieldAlert },
          { label: 'Outside Rwanda',    value: outsideRw.length,      color: outsideRw.length > 0 ? '#ef4444' : '#22c55e', icon: Globe },
          { label: 'VPN / Proxy',       value: vpnProxy.length,       color: vpnProxy.length > 0 ? '#f97316' : '#22c55e', icon: Shield },
        ].map(c => (
          <div key={c.label} style={{
            background: '#0f172a', border: `1px solid ${c.color}33`,
            borderRadius: '10px', padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</span>
              <c.icon style={{ width: 14, height: 14, color: c.color }} />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select
          value={instFilter}
          onChange={e => setInstFilter(e.target.value)}
          style={SELECT_STYLE}
        >
          {INSTITUTIONS.map(i => <option key={i} value={i}>{i || 'All Institutions'}</option>)}
        </select>
        {RISK_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setRiskFilter(f.value)}
            style={{
              ...BTN_GHOST,
              background: riskFilter === f.value ? '#1e3a5f' : '#0f172a',
              color:      riskFilter === f.value ? '#93c5fd' : '#64748b',
              border:     `1px solid ${riskFilter === f.value ? '#3b82f6' : '#1e293b'}`,
              fontWeight: 700,
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569', alignSelf: 'center' }}>
          {sorted.length} of {sessions.length} sessions shown
        </span>
      </div>

      {/* ── Session list ────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', color: '#64748b' }}>
          No sessions match the current filter
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sorted.map(s => {
            const risk       = getSessionRisk(s)
            const rColor     = RISK_COLOR[risk]
            const rBg        = RISK_BG[risk]
            const isExpanded = expandedId === s.id
            const detail     = userDetails[s.user_id]
            const tab        = expandTab[s.id] ?? 'visits'
            const mins       = onlineMinutes(s.created_at)

            return (
              <div key={s.id} style={{
                background: '#0f172a',
                border: `1px solid ${risk !== 'low' ? rColor + '44' : '#1e293b'}`,
                borderLeft: `4px solid ${rColor}`,
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: risk === 'critical' ? `0 0 12px ${rColor}20` : 'none',
              }}>

                {/* ── Main row ──────────────────────────────────────────── */}
                <div
                  onClick={() => handleExpand(s)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Risk badge */}
                  <span style={{
                    background: rBg, color: rColor,
                    fontSize: '9px', fontWeight: 900,
                    padding: '3px 6px', borderRadius: '3px',
                    letterSpacing: '0.5px', flexShrink: 0, minWidth: '70px', textAlign: 'center',
                  }}>
                    {RISK_LABEL[risk]}
                  </span>

                  {/* User */}
                  <div style={{ flex: '0 0 200px', minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.full_name ?? 'Unknown'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{s.badge_number} · {s.role}</div>
                  </div>

                  {/* Institution */}
                  <div style={{ flex: '0 0 60px', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                    {s.institution}
                  </div>

                  {/* IP + Location */}
                  <div style={{ flex: '0 0 180px', minWidth: 0 }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.ip_address ?? '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: risk === 'critical' ? '#fca5a5' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.city ? `${s.city}, ` : ''}{s.country_name ?? 'Unknown'}{s.country_code ? ` (${s.country_code})` : ''}
                    </div>
                  </div>

                  {/* Flags */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {s.country_code && s.country_code !== 'RW' && (
                      <span style={{ background: '#450a0a', color: '#fca5a5', fontSize: '8px', fontWeight: 900, padding: '2px 5px', borderRadius: '3px' }}>🌍 {s.country_code}</span>
                    )}
                    {s.is_vpn && (
                      <span style={{ background: '#854d0e', color: '#fde68a', fontSize: '8px', fontWeight: 900, padding: '2px 5px', borderRadius: '3px' }}>VPN</span>
                    )}
                    {s.is_proxy && (
                      <span style={{ background: '#7f1d1d', color: '#fca5a5', fontSize: '8px', fontWeight: 900, padding: '2px 5px', borderRadius: '3px' }}>PROXY</span>
                    )}
                  </div>

                  {/* Current page */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Eye style={{ display: 'inline', width: 9, height: 9, verticalAlign: 'middle', marginRight: 3 }} />
                      {s.current_page ?? '/'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#334155' }}>
                      {s.browser ?? '?'} · {s.os ?? '?'} · {s.device_type ?? 'Desktop'}
                    </div>
                  </div>

                  {/* Time online */}
                  <div style={{ flex: '0 0 70px', textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      <Clock style={{ display: 'inline', width: 9, height: 9, verticalAlign: 'middle', marginRight: 2 }} />
                      {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}
                    </div>
                    <div style={{ fontSize: '9px', color: '#334155' }}>
                      {s.last_active_at ? formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true }) : ''}
                    </div>
                  </div>

                  {/* Kill button */}
                  <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => handleRevoke(s.id)}
                      disabled={revoking === s.id}
                      title="Terminate this session immediately"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: '#450a0a', color: '#fca5a5',
                        border: '1px solid #ef444433', borderRadius: '5px',
                        padding: '5px 10px', fontSize: '10px', cursor: 'pointer', fontWeight: 700,
                        opacity: revoking === s.id ? 0.5 : 1,
                      }}
                    >
                      <XCircle style={{ width: 11, height: 11 }} />
                      {revoking === s.id ? '…' : 'Kill'}
                    </button>
                  </div>

                  {/* Expand chevron */}
                  <div style={{ flexShrink: 0, color: '#475569' }}>
                    {isExpanded
                      ? <ChevronUp style={{ width: 14, height: 14 }} />
                      : <ChevronDown style={{ width: 14, height: 14 }} />
                    }
                  </div>
                </div>

                {/* ── Revoke feedback ───────────────────────────────────── */}
                {revokeMsg?.id === s.id && (
                  <div style={{
                    margin: '0 14px 10px',
                    padding: '6px 10px', borderRadius: '5px',
                    background: revokeMsg.ok ? '#052e16' : '#450a0a',
                    color: revokeMsg.ok ? '#6ee7b7' : '#fca5a5',
                    fontSize: '11px',
                  }}>
                    {revokeMsg.msg}
                  </div>
                )}

                {/* ── Expanded detail ───────────────────────────────────── */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #1e293b', background: '#070d1a' }}>

                    {/* Tab bar */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
                      {([
                        { key: 'visits',  label: 'Page Visits',     icon: Eye },
                        { key: 'logins',  label: 'Login History',   icon: LogIn },
                        { key: 'history', label: 'Session History',  icon: Monitor },
                      ] as const).map(t => (
                        <button
                          key={t.key}
                          onClick={e => { e.stopPropagation(); setExpandTab(prev => ({ ...prev, [s.id]: t.key })) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '8px 16px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                            border: 'none', outline: 'none',
                            background: tab === t.key ? '#0f172a' : 'transparent',
                            color: tab === t.key ? '#f1f5f9' : '#475569',
                            borderBottom: tab === t.key ? '2px solid #3b82f6' : '2px solid transparent',
                          }}
                        >
                          <t.icon style={{ width: 11, height: 11 }} />
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ padding: '14px 16px' }}>
                      {loadingDetail === s.user_id ? (
                        <div style={{ color: '#64748b', fontSize: '12px' }}>Loading user history…</div>
                      ) : !detail ? (
                        <div style={{ color: '#64748b', fontSize: '12px' }}>No data available</div>
                      ) : (
                        <>
                          {/* Page Visits */}
                          {tab === 'visits' && (
                            <div>
                              {detail.page_visits.length === 0 ? (
                                <div style={{ color: '#475569', fontSize: '12px' }}>No page visits recorded yet</div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                  <thead>
                                    <tr>
                                      {['Page', 'Entered', 'Duration', 'Left'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 700, textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.5px' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.page_visits.map(v => (
                                      <tr key={v.id} style={{ borderTop: '1px solid #1e293b' }}>
                                        <td style={{ padding: '5px 8px', color: '#94a3b8', fontFamily: 'monospace', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {v.page_path}
                                        </td>
                                        <td style={{ padding: '5px 8px', color: '#64748b' }}>
                                          {format(new Date(v.entered_at), 'dd MMM HH:mm:ss')}
                                        </td>
                                        <td style={{ padding: '5px 8px', color: v.duration_seconds ? '#22c55e' : '#f59e0b' }}>
                                          {v.left_at ? fmtDuration(v.duration_seconds) : '⏱ ongoing'}
                                        </td>
                                        <td style={{ padding: '5px 8px', color: '#475569' }}>
                                          {v.left_at ? format(new Date(v.left_at), 'HH:mm:ss') : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}

                          {/* Login History */}
                          {tab === 'logins' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
                              {detail.login_attempts.length === 0 ? (
                                <div style={{ color: '#475569', fontSize: '12px' }}>No login history</div>
                              ) : detail.login_attempts.map(la => (
                                <div key={la.id} style={{
                                  padding: '7px 10px', background: '#0f172a', borderRadius: '5px',
                                  borderLeft: `3px solid ${la.success ? '#22c55e' : '#ef4444'}`,
                                  fontSize: '10px', color: '#94a3b8',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span style={{ color: la.success ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                                      {la.success ? '✓ SUCCESS' : '✗ FAILED'}
                                    </span>
                                    <span style={{ color: '#475569' }}>{format(new Date(la.attempted_at), 'dd MMM yyyy HH:mm:ss')}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <span>{la.ip_address ?? '?'}</span>
                                    <span>{la.city ? `${la.city}, ` : ''}{la.country_name ?? 'Unknown'}</span>
                                    <span>{la.browser ?? '?'} · {la.os ?? '?'}</span>
                                  </div>
                                  {!la.success && la.failure_reason && (
                                    <div style={{ color: '#f87171', marginTop: '2px' }}>{la.failure_reason}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Session History */}
                          {tab === 'history' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
                              {detail.sessions.length === 0 ? (
                                <div style={{ color: '#475569', fontSize: '12px' }}>No session history</div>
                              ) : detail.sessions.map(sess => (
                                <div key={sess.id} style={{
                                  padding: '7px 10px', background: '#0f172a', borderRadius: '5px',
                                  borderLeft: `3px solid ${sess.revoked ? '#ef4444' : '#22c55e'}`,
                                  fontSize: '10px', color: '#94a3b8',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                      {(sess.country_code && sess.country_code !== 'RW') && (
                                        <span style={{ background: '#450a0a', color: '#fca5a5', fontSize: '8px', fontWeight: 900, padding: '1px 4px', borderRadius: '2px' }}>OUTSIDE RW</span>
                                      )}
                                      {sess.is_vpn && (
                                        <span style={{ background: '#854d0e', color: '#fde68a', fontSize: '8px', fontWeight: 900, padding: '1px 4px', borderRadius: '2px' }}>VPN</span>
                                      )}
                                      <span style={{ color: sess.revoked ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                                        {sess.revoked ? 'Revoked' : 'Active'}
                                      </span>
                                    </div>
                                    <span style={{ color: '#475569' }}>{format(new Date(sess.created_at), 'dd MMM yyyy HH:mm')}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <span>{sess.ip_address ?? '?'}</span>
                                    <span>{sess.city ? `${sess.city}, ` : ''}{sess.country_name ?? 'Unknown'}</span>
                                    <span>{sess.browser ?? '?'} · {sess.os ?? '?'}</span>
                                  </div>
                                  {sess.current_page && (
                                    <div style={{ color: '#334155', marginTop: '2px' }}>Last page: {sess.current_page}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <div style={{
        marginTop: '16px', padding: '10px 14px',
        background: '#0f172a', border: '1px solid #1e293b',
        borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '12px',
        fontSize: '10px', color: '#475569',
      }}>
        <AlertTriangle style={{ width: 12, height: 12, color: '#f59e0b', flexShrink: 0 }} />
        Killing a session logs the action in the audit trail and immediately invalidates the user&apos;s token.
        For full account suspension, use <strong style={{ color: '#94a3b8' }}>User Management → Disable</strong>.
        All activity is monitored by IDS.
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const BTN_GHOST: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '5px',
  background: '#0f172a', color: '#64748b',
  border: '1px solid #1e293b', borderRadius: '7px',
  padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
}

const SELECT_STYLE: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #1e293b',
  color: '#94a3b8', borderRadius: '7px',
  padding: '6px 10px', fontSize: '11px', outline: 'none', cursor: 'pointer',
}
