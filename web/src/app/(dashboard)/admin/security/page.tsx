'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminPortalApi, type SecurityIncident } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { ShieldAlert, CheckCircle } from 'lucide-react'

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
}

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: '#450a0a',
  HIGH:     '#431407',
  MEDIUM:   '#451a03',
}

const TYPE_LABEL: Record<string, string> = {
  ACCESS_OUTSIDE_RWANDA:  '🌍 Access Outside Rwanda',
  VPN_DETECTED:           '🔒 VPN Detected',
  PROXY_DETECTED:         '🕵️ Proxy Detected',
  MULTIPLE_FAILED_LOGINS: '🔑 Brute Force Attempt',
  IMPOSSIBLE_TRAVEL:      '✈️ Impossible Travel',
  UNUSUAL_HOUR_ACCESS:    '🌙 Off-Hours Access',
  MASS_DATA_ACCESS:       '📦 Mass Data Access',
  PRIVILEGE_ESCALATION:   '⬆️ Privilege Escalation',
  CREDENTIAL_STUFFING:    '🤖 Credential Stuffing',
  SUSPICIOUS_LOCATION:    '📍 Suspicious Location',
}

export default function AdminSecurityPage() {
  const [incidents,   setIncidents]   = useState<SecurityIncident[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [notes,       setNotes]       = useState<Record<string, string>>({})

  const load = useCallback((resolved: boolean) => {
    setLoading(true)
    adminPortalApi.getIncidents(resolved, 100)
      .then(r => setIncidents(r.data?.incidents ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(showResolved) }, [load, showResolved])

  const handleResolve = async (id: string) => {
    setResolvingId(id)
    try {
      await adminPortalApi.resolveIncident(id, notes[id] ?? 'Resolved by admin')
      load(showResolved)
    } catch (e) {
      console.error(e)
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <ShieldAlert style={{ width: 22, height: 22, color: '#ef4444' }} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Security / IDS</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Intrusion Detection System — {incidents.length} {showResolved ? 'resolved' : 'open'} incidents</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowResolved(false)}
            style={{
              background: !showResolved ? '#450a0a' : '#1e293b',
              color: !showResolved ? '#fca5a5' : '#64748b',
              border: `1px solid ${!showResolved ? '#ef4444' : '#334155'}`,
              borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 700,
            }}
          >
            Open
          </button>
          <button
            onClick={() => setShowResolved(true)}
            style={{
              background: showResolved ? '#052e16' : '#1e293b',
              color: showResolved ? '#6ee7b7' : '#64748b',
              border: `1px solid ${showResolved ? '#22c55e' : '#334155'}`,
              borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 700,
            }}
          >
            Resolved
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading incidents…</div>
      ) : incidents.length === 0 ? (
        <div style={{
          padding: '60px', textAlign: 'center',
          background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px',
        }}>
          <CheckCircle style={{ width: 32, height: 32, color: '#22c55e', margin: '0 auto 12px' }} />
          <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '15px' }}>All clear</div>
          <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>No {showResolved ? 'resolved' : 'open'} incidents</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {incidents.map(i => (
            <div
              key={i.id}
              style={{
                background: '#0f172a',
                border: `1px solid ${SEVERITY_COLOR[i.severity] ?? '#334155'}44`,
                borderLeft: `4px solid ${SEVERITY_COLOR[i.severity] ?? '#64748b'}`,
                borderRadius: '8px',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {/* Left: main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: SEVERITY_BG[i.severity] ?? '#1e293b',
                      color: SEVERITY_COLOR[i.severity] ?? '#94a3b8',
                      fontSize: '10px', fontWeight: 900,
                      padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.5px',
                    }}>
                      {i.severity}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                      {TYPE_LABEL[i.incident_type] ?? i.incident_type}
                    </span>
                    {i.auto_blocked && (
                      <span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px' }}>
                        AUTO-BLOCKED
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '0 0 8px', lineHeight: 1.5 }}>
                    {i.description}
                  </p>

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>User:</span> {i.full_name ?? i.badge_number} ({i.institution})
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>IP:</span> {i.ip_address ?? 'unknown'}
                      {i.country_name ? ` · ${i.country_name}` : ''}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  {i.resolved && i.resolved_at && (
                    <div style={{ marginTop: '8px', fontSize: '10px', color: '#6ee7b7' }}>
                      ✓ Resolved {formatDistanceToNow(new Date(i.resolved_at), { addSuffix: true })}
                      {i.resolution_notes ? ` — ${i.resolution_notes}` : ''}
                    </div>
                  )}
                </div>

                {/* Right: resolve controls (only for open incidents) */}
                {!i.resolved && (
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
                    <input
                      value={notes[i.id] ?? ''}
                      onChange={e => setNotes(prev => ({ ...prev, [i.id]: e.target.value }))}
                      placeholder="Resolution notes…"
                      style={{
                        background: '#1e293b', border: '1px solid #334155',
                        color: '#f1f5f9', borderRadius: '5px',
                        padding: '5px 8px', fontSize: '11px', outline: 'none', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                    <button
                      onClick={() => handleResolve(i.id)}
                      disabled={resolvingId === i.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        background: '#052e16', color: '#6ee7b7',
                        border: '1px solid #22c55e33',
                        borderRadius: '5px', padding: '6px 12px',
                        fontSize: '11px', cursor: 'pointer', fontWeight: 700,
                        opacity: resolvingId === i.id ? 0.5 : 1,
                      }}
                    >
                      <CheckCircle style={{ width: 12, height: 12 }} />
                      {resolvingId === i.id ? 'Resolving…' : 'Mark Resolved'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
