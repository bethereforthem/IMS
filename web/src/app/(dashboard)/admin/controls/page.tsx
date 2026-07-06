'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminPortalApi, type SystemControl } from '@/lib/api'
import { Settings, Lock, Unlock, Power, PowerOff, Building } from 'lucide-react'

const INSTITUTIONS = ['NISS', 'RNP', 'RIB', 'RDF', 'RCS']
const SERVICES = [
  { key: 'agent_tracking',    label: 'Agent Tracking' },
  { key: 'commander_rescue',  label: 'Commander Rescue' },
  { key: 'sos',               label: 'SOS Emergency' },
  { key: 'intelligence',      label: 'Intelligence Events' },
  { key: 'camera_nodes',      label: 'Camera Nodes' },
  { key: 'interpol',          label: 'INTERPOL Queries' },
]

export default function AdminControlsPage() {
  const [controls,       setControls]       = useState<SystemControl[]>([])
  const [state,          setState]          = useState<Record<string, unknown>>({})
  const [loading,        setLoading]        = useState(true)
  const [working,        setWorking]        = useState<string | null>(null)
  const [confirmAction,  setConfirmAction]  = useState<{ action: string; target?: string; label: string } | null>(null)
  const [msg,            setMsg]            = useState('')

  const load = useCallback(() => {
    adminPortalApi.getControls()
      .then(r => {
        setControls(r.data?.controls ?? [])
        setState(r.data?.state ?? {})
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const apply = async (action: string, target?: string) => {
    setWorking(action + (target ?? ''))
    setMsg('')
    try {
      await adminPortalApi.applyControl(action, target)
      setMsg(`✓ ${action.replace(/_/g, ' ')} applied`)
      load()
    } catch (e: unknown) {
      setMsg(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setWorking(null)
      setConfirmAction(null)
    }
  }

  const systemLocked = state.system_locked === true || state.system_locked === 'true'
  const lockdowns: Record<string, string> = (() => {
    try { return typeof state.institution_lockdowns === 'object' && state.institution_lockdowns !== null
      ? state.institution_lockdowns as Record<string, string>
      : JSON.parse(state.institution_lockdowns as string ?? '{}')
    } catch { return {} }
  })()
  const disabledServices: string[] = (() => {
    try { return Array.isArray(state.disabled_services) ? state.disabled_services as string[]
      : JSON.parse(state.disabled_services as string ?? '[]')
    } catch { return [] }
  })()

  if (loading) {
    return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading controls…</div>
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Settings style={{ width: 22, height: 22, color: '#94a3b8' }} />
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>System Controls</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Global access management — every action is logged</p>
        </div>
      </div>

      {msg && (
        <div style={{
          background: msg.startsWith('Error') ? '#450a0a' : '#052e16',
          color: msg.startsWith('Error') ? '#fca5a5' : '#6ee7b7',
          border: `1px solid ${msg.startsWith('Error') ? '#ef4444' : '#22c55e'}33`,
          borderRadius: '6px', padding: '10px 14px', fontSize: '12px', marginBottom: '16px',
        }}>{msg}</div>
      )}

      {/* Confirmation modal */}
      {confirmAction && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f172a', border: '2px solid #ef4444',
            borderRadius: '12px', padding: '24px 28px', maxWidth: '420px', width: '90%',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9', marginBottom: '12px' }}>
              ⚠️ Confirm Action
            </div>
            <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '20px' }}>
              Are you sure you want to <strong style={{ color: '#fca5a5' }}>{confirmAction.label}</strong>?
              This action will be logged in the audit trail.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => apply(confirmAction.action, confirmAction.target)}
                style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #ef4444', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Global system lock */}
        <div style={{
          background: '#0f172a',
          border: `2px solid ${systemLocked ? '#ef4444' : '#1e293b'}`,
          borderRadius: '10px', padding: '20px',
          boxShadow: systemLocked ? '0 0 24px rgba(239,68,68,0.2)' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#f1f5f9', marginBottom: '4px' }}>
                {systemLocked ? '🔒 SYSTEM LOCKED' : '🔓 System Lock'}
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                {systemLocked
                  ? 'The entire system is locked. Only SYSTEM_ADMIN can access it.'
                  : 'Lock the entire RCIMS platform. All non-admin access will be blocked immediately.'}
              </p>
            </div>
            {systemLocked ? (
              <button
                disabled={!!working}
                onClick={() => setConfirmAction({ action: 'unlock_system', label: 'Unlock the entire system' })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#052e16', color: '#6ee7b7', border: '1px solid #22c55e',
                  borderRadius: '7px', padding: '10px 18px', fontSize: '13px', cursor: 'pointer', fontWeight: 700,
                }}
              >
                <Unlock style={{ width: 14, height: 14 }} /> Unlock System
              </button>
            ) : (
              <button
                disabled={!!working}
                onClick={() => setConfirmAction({ action: 'lock_system', label: 'Lock the entire system (emergency)' })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#450a0a', color: '#fca5a5', border: '1px solid #ef4444',
                  borderRadius: '7px', padding: '10px 18px', fontSize: '13px', cursor: 'pointer', fontWeight: 700,
                }}
              >
                <Lock style={{ width: 14, height: 14 }} /> Emergency Lock
              </button>
            )}
          </div>
        </div>

        {/* Institution lockdowns */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Building style={{ width: 16, height: 16, color: '#f97316' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>Institution Lockdowns</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {INSTITUTIONS.map(inst => {
              const isLocked = inst in lockdowns
              return (
                <div key={inst} style={{
                  background: isLocked ? '#1a0a00' : '#1e293b',
                  border: `1px solid ${isLocked ? '#f97316' : '#334155'}`,
                  borderRadius: '8px', padding: '12px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>{inst}</div>
                    {isLocked && (
                      <div style={{ fontSize: '9px', color: '#f97316', marginTop: '2px' }}>
                        Locked
                      </div>
                    )}
                  </div>
                  <button
                    disabled={!!working}
                    onClick={() => setConfirmAction({
                      action: isLocked ? 'unlock_institution' : 'lock_institution',
                      target: inst,
                      label: `${isLocked ? 'Unlock' : 'Lock'} institution ${inst}`,
                    })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: isLocked ? '#052e16' : '#431407',
                      color: isLocked ? '#6ee7b7' : '#fde68a',
                      border: `1px solid ${isLocked ? '#22c55e' : '#f97316'}44`,
                      borderRadius: '5px', padding: '5px 10px',
                      fontSize: '10px', cursor: 'pointer', fontWeight: 700,
                    }}
                  >
                    {isLocked ? <><Unlock style={{ width: 10, height: 10 }} /> Unlock</> : <><Lock style={{ width: 10, height: 10 }} /> Lock</>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Service toggles */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Power style={{ width: 16, height: 16, color: '#64748b' }} />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>Service Controls</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SERVICES.map(svc => {
              const isDisabled = disabledServices.includes(svc.key)
              return (
                <div key={svc.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: '#1e293b', borderRadius: '7px',
                  border: `1px solid ${isDisabled ? '#ef4444' : '#334155'}33`,
                }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 600 }}>{svc.label}</div>
                    <div style={{ fontSize: '10px', color: isDisabled ? '#f87171' : '#22c55e', marginTop: '2px' }}>
                      {isDisabled ? '● Disabled' : '● Active'}
                    </div>
                  </div>
                  <button
                    disabled={!!working}
                    onClick={() => setConfirmAction({
                      action: isDisabled ? 'enable_service' : 'disable_service',
                      target: svc.key,
                      label: `${isDisabled ? 'Enable' : 'Disable'} service: ${svc.label}`,
                    })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: isDisabled ? '#052e16' : '#450a0a',
                      color: isDisabled ? '#6ee7b7' : '#fca5a5',
                      border: `1px solid ${isDisabled ? '#22c55e' : '#ef4444'}44`,
                      borderRadius: '5px', padding: '6px 12px',
                      fontSize: '11px', cursor: 'pointer', fontWeight: 700,
                    }}
                  >
                    {isDisabled
                      ? <><Power style={{ width: 11, height: 11 }} /> Enable</>
                      : <><PowerOff style={{ width: 11, height: 11 }} /> Disable</>
                    }
                  </button>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
