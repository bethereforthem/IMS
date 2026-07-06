'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { adminPortalApi, type SecurityIncident } from '@/lib/api'
import { alarmManager } from '@/lib/mapSounds'

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: '🔴 CRITICAL',
  HIGH:     '🟠 HIGH',
  MEDIUM:   '🟡 MEDIUM',
}

const TYPE_LABEL: Record<string, string> = {
  ACCESS_OUTSIDE_RWANDA:  'Access Outside Rwanda',
  VPN_DETECTED:           'VPN Detected',
  PROXY_DETECTED:         'Proxy Detected',
  MULTIPLE_FAILED_LOGINS: 'Multiple Failed Logins',
  IMPOSSIBLE_TRAVEL:      'Impossible Travel',
  UNUSUAL_HOUR_ACCESS:    'Unusual Hour Access',
  MASS_DATA_ACCESS:       'Mass Data Access',
  PRIVILEGE_ESCALATION:   'Privilege Escalation',
  CREDENTIAL_STUFFING:    'Credential Stuffing',
  SUSPICIOUS_LOCATION:    'Suspicious Location',
}

export function IntrusionAlertBanner() {
  const [incidents, setIncidents]   = useState<SecurityIncident[]>([])
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set())
  const [flashRed, setFlashRed]     = useState(false)
  const seenIds                     = useRef<Set<string>>(new Set())
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await adminPortalApi.getIncidents(false, 30)
      const list = res.data?.incidents ?? []
      setIncidents(list)

      const newOnes = list.filter(i => !seenIds.current.has(i.id))
      if (newOnes.length > 0) {
        newOnes.forEach(i => seenIds.current.add(i.id))
        // Trigger fire-alarm sound + red flash
        const worst = newOnes.find(i => i.severity === 'CRITICAL') ?? newOnes[0]
        alarmManager.register(worst.id, 'intrusion')
        setFlashRed(true)
        setTimeout(() => setFlashRed(false), 2000)
      }

      // Drop resolved / dismissed incidents from alarm manager
      const activeIds = new Set(list.map(i => i.id))
      for (const id of seenIds.current) {
        if (!activeIds.has(id)) alarmManager.drop(id)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchIncidents()
    pollRef.current = setInterval(fetchIncidents, 10_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchIncidents])

  const handleResolve = async (id: string) => {
    try {
      await adminPortalApi.resolveIncident(id, 'Acknowledged by admin')
      setDismissed(prev => new Set(prev).add(id))
      alarmManager.drop(id)
      fetchIncidents()
    } catch { /* silent */ }
  }

  const visible = incidents.filter(i => !dismissed.has(i.id))
  if (visible.length === 0) return null

  return (
    <>
      {/* Full-screen red flash overlay */}
      {flashRed && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(220,38,38,0.18)',
            pointerEvents: 'none',
            animation: 'intrusion-flash 0.4s ease-out',
          }}
        />
      )}

      <div
        style={{
          background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #7f1d1d 100%)',
          border: '2px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '12px',
          boxShadow: '0 0 24px rgba(239,68,68,0.5), 0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontSize: '22px' }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fca5a5', fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Intrusion Detection System
            </div>
            <div style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700 }}>
              {visible.length} Security Incident{visible.length > 1 ? 's' : ''} Detected
            </div>
          </div>
          <button
            onClick={() => alarmManager.silence()}
            style={{
              background: '#450a0a', color: '#fca5a5', border: '1px solid #ef4444',
              borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
            }}
          >
            Silence
          </button>
        </div>

        {/* Incident list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visible.slice(0, 5).map(incident => (
            <div
              key={incident.id}
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{
                    background: incident.severity === 'CRITICAL' ? '#ef4444' : incident.severity === 'HIGH' ? '#f97316' : '#f59e0b',
                    color: '#fff', fontSize: '9px', fontWeight: 900,
                    padding: '1px 5px', borderRadius: '3px', letterSpacing: '0.5px',
                  }}>
                    {SEVERITY_LABEL[incident.severity] ?? incident.severity}
                  </span>
                  <span style={{ color: '#fca5a5', fontSize: '11px', fontWeight: 700 }}>
                    {TYPE_LABEL[incident.incident_type] ?? incident.incident_type}
                  </span>
                </div>
                <div style={{ color: '#fecaca', fontSize: '11px', lineHeight: 1.4, marginBottom: '2px' }}>
                  {incident.description}
                </div>
                <div style={{ color: '#f87171', fontSize: '10px' }}>
                  {incident.badge_number} · {incident.institution} · {incident.ip_address ?? 'unknown IP'}
                  {incident.country_name ? ` · ${incident.country_name}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleResolve(incident.id)}
                style={{
                  background: '#065f46', color: '#6ee7b7', border: '1px solid #10b981',
                  borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Resolve
              </button>
            </div>
          ))}
          {visible.length > 5 && (
            <div style={{ color: '#fca5a5', fontSize: '11px', textAlign: 'center', paddingTop: '4px' }}>
              +{visible.length - 5} more incidents — open Security page to view all
            </div>
          )}
        </div>
      </div>
    </>
  )
}
