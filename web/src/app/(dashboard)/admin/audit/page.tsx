'use client'

import { useState, useEffect, useCallback } from 'react'
import { auditApi } from '@/lib/api'
import {
  Search, Download, RefreshCw, ChevronDown, ChevronUp,
  Filter, Clock, User, Globe, Monitor, MapPin, Layers,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number
  event_timestamp: string
  event_type: string
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | string
  actor_id: string | null
  actor_name: string | null
  actor_badge: string | null
  actor_role: string | null
  actor_institution: string | null
  target_type: string | null
  target_id: string | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  ip_address: string | null
  gps_lat: number | null
  gps_lng: number | null
  device_info: string | null
  justification: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
  CREATE: '#22c55e', UPDATE: '#3b82f6', DELETE: '#ef4444',
  READ:   '#64748b', LOGIN:  '#a855f7', LOGOUT: '#f59e0b',
  EXPORT: '#f97316',
}

const ACTION_BG: Record<string, string> = {
  CREATE: '#052e16', UPDATE: '#172554', DELETE: '#450a0a',
  READ:   '#1e293b', LOGIN:  '#2e1065', LOGOUT: '#431407',
  EXPORT: '#431407',
}

const ACTIONS   = ['', 'CREATE', 'UPDATE', 'DELETE', 'READ', 'LOGIN', 'LOGOUT', 'EXPORT']
const TARGET_TYPES = ['', 'suspect', 'case', 'warrant', 'intelligence_event', 'field_report',
                       'corrections_record', 'camera_node', 'user', 'border_verification',
                       'ai_prediction', 'system']
const INSTITUTIONS = ['', 'NISS', 'RNP', 'RIB', 'RDF', 'RCS', 'SYSTEM']

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAuditPage() {
  const [entries,    setEntries]    = useState<AuditEntry[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [expanded,   setExpanded]   = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [exporting,  setExporting]  = useState(false)

  // Filters
  const [search,      setSearch]      = useState('')        // searches actor_name + badge
  const [action,      setAction]      = useState('')
  const [targetType,  setTargetType]  = useState('')
  const [institution, setInstitution] = useState('')
  const [from,        setFrom]        = useState('')
  const [to,          setTo]          = useState('')

  const LIMIT = 25

  const loadEntries = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: pg, limit: LIMIT }
      if (action)      params.action      = action
      if (targetType)  params.target_type = targetType
      if (institution) params.institution = institution
      if (from)        params.from        = from
      if (to)          params.to          = to
      if (search) {
        // try both badge and name
        params.actor_name  = search
      }
      const res = await auditApi.list(params)
      setEntries(res.data.entries as unknown as AuditEntry[])
      setTotal(res.data.total)
      setPage(pg)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [action, targetType, institution, from, to, search])

  useEffect(() => { loadEntries(1) }, [loadEntries])

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ export: 'csv', limit: '5000' })
      if (action)      params.set('action', action)
      if (targetType)  params.set('target_type', targetType)
      if (institution) params.set('institution', institution)
      if (from)        params.set('from', from)
      if (to)          params.set('to', to)
      if (search)      params.set('actor_name', search)

      const token = document.cookie.split('; ').find(r => r.startsWith('ims_access_token='))?.split('=')[1]
      const res = await fetch(`/api/v1/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
    finally { setExporting(false) }
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Audit Log</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            {total.toLocaleString()} total entries · every CRUD action tracked with actor, device, IP & GPS
          </p>
        </div>
        <button onClick={() => loadEntries(page)} style={BTN_GHOST}>
          <RefreshCw style={{ width: 13, height: 13 }} />
        </button>
        <button onClick={() => setShowFilters(v => !v)} style={{ ...BTN_GHOST, gap: '5px' }}>
          <Filter style={{ width: 13, height: 13 }} /> Filters {showFilters ? '▲' : '▼'}
        </button>
        <button onClick={handleExport} disabled={exporting} style={{ ...BTN_PRIMARY, gap: '6px', opacity: exporting ? 0.6 : 1 }}>
          <Download style={{ width: 13, height: 13 }} /> Export CSV
        </button>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#475569' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by officer name or badge number…"
          style={{ ...INPUT_STYLE, paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
        />
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
          <FilterSelect label="Action" value={action} onChange={setAction} options={ACTIONS} />
          <FilterSelect label="Target Type" value={targetType} onChange={setTargetType} options={TARGET_TYPES} />
          <FilterSelect label="Institution" value={institution} onChange={setInstitution} options={INSTITUTIONS} />
          <div>
            <label style={LABEL_STYLE}>From</label>
            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} style={INPUT_STYLE} />
          </div>
          <div>
            <label style={LABEL_STYLE}>To</label>
            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} style={INPUT_STYLE} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
            <button onClick={() => { setAction(''); setTargetType(''); setInstitution(''); setFrom(''); setTo(''); setSearch('') }}
              style={BTN_GHOST}>Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw style={{ width: 24, height: 24, margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: '13px' }}>Loading…</div>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', color: '#475569', fontSize: '14px' }}>
          No audit entries match the current filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {entries.map(entry => {
            const isOpen = expanded === entry.id
            const actionColor = ACTION_COLOR[entry.action] ?? '#94a3b8'
            const actionBg    = ACTION_BG[entry.action]   ?? '#1e293b'

            return (
              <div key={entry.id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderLeft: `3px solid ${actionColor}`, borderRadius: '8px', overflow: 'hidden' }}>

                {/* Row */}
                <div onClick={() => setExpanded(isOpen ? null : entry.id)}
                  style={{ padding: '10px 14px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 80px 24px', gap: '10px', alignItems: 'center' }}>

                  {/* Action badge */}
                  <span style={{ background: actionBg, color: actionColor, fontSize: '10px', fontWeight: 900, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px', textAlign: 'center' }}>
                    {entry.action}
                  </span>

                  {/* Event */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.event_type.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569' }}>
                      {entry.target_type ?? '—'}{entry.target_id ? ` · ${entry.target_id.slice(0, 8)}` : ''}
                    </div>
                  </div>

                  {/* Actor */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.actor_name ?? '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569' }}>
                      {entry.actor_badge} · {entry.actor_institution}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {format(new Date(entry.event_timestamp), 'dd MMM HH:mm:ss')}
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569' }}>
                      {formatDistanceToNow(new Date(entry.event_timestamp), { addSuffix: true })}
                    </div>
                  </div>

                  {/* Context dots */}
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {entry.ip_address  && <CtxDot color="#3b82f6" title={`IP: ${entry.ip_address}`} />}
                    {entry.gps_lat     && <CtxDot color="#22c55e" title="GPS attached" />}
                    {entry.device_info && <CtxDot color="#f97316" title="Device info" />}
                  </div>

                  <span style={{ color: '#475569', justifySelf: 'end' }}>
                    {isOpen ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                  </span>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #1e293b', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Meta grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                      <MetaItem icon={<User style={{ width: 11, height: 11 }} />} label="Officer" value={`${entry.actor_name ?? '?'} (${entry.actor_badge ?? '?'})`} />
                      <MetaItem icon={<Layers style={{ width: 11, height: 11 }} />} label="Role" value={`${entry.actor_role ?? '?'} · ${entry.actor_institution ?? '?'}`} />
                      <MetaItem icon={<Globe style={{ width: 11, height: 11 }} />} label="IP Address" value={entry.ip_address ?? 'Unknown'} mono />
                      <MetaItem icon={<Clock style={{ width: 11, height: 11 }} />} label="Timestamp" value={format(new Date(entry.event_timestamp), 'dd MMM yyyy HH:mm:ss zzz')} />
                      {entry.gps_lat && entry.gps_lng && (
                        <MetaItem icon={<MapPin style={{ width: 11, height: 11 }} />} label="GPS Location"
                          value={`${entry.gps_lat.toFixed(5)}, ${entry.gps_lng.toFixed(5)}`} mono />
                      )}
                      {entry.device_info && (
                        <MetaItem icon={<Monitor style={{ width: 11, height: 11 }} />} label="Device" value={entry.device_info.slice(0, 80)} />
                      )}
                      {entry.justification && (
                        <MetaItem icon={<Filter style={{ width: 11, height: 11 }} />} label="Justification" value={entry.justification} />
                      )}
                    </div>

                    {/* State diff */}
                    {(entry.before_state || entry.after_state) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {entry.before_state && (
                          <StateBox label="Before" state={entry.before_state} color="#ef4444" />
                        )}
                        {entry.after_state && (
                          <StateBox label="After" state={entry.after_state} color="#22c55e" />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '10px' }}>
              <button disabled={page <= 1} onClick={() => loadEntries(page - 1)} style={BTN_GHOST}>← Prev</button>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Page {page} of {totalPages} ({total.toLocaleString()} entries)</span>
              <button disabled={page >= totalPages} onClick={() => loadEntries(page + 1)} style={BTN_GHOST}>Next →</button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Shared styles & sub-components ────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }
const INPUT_STYLE: React.CSSProperties = { background: '#1e293b', border: '1px solid #334155', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', color: '#f1f5f9', outline: 'none', width: '100%', boxSizing: 'border-box' as const }
const BTN_GHOST: React.CSSProperties  = { display: 'flex', alignItems: 'center', gap: '5px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '7px', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }
const BTN_PRIMARY: React.CSSProperties = { display: 'flex', alignItems: 'center', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '7px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={INPUT_STYLE}>
        {options.map(o => <option key={o} value={o}>{o || `All ${label}s`}</option>)}
      </select>
    </div>
  )
}

function CtxDot({ color, title }: { color: string; title: string }) {
  return <span title={title} style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

function MetaItem({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  )
}

function StateBox({ label, state, color }: { label: string; state: Record<string, unknown>; color: string }) {
  const safe = Object.fromEntries(
    Object.entries(state).filter(([k]) => !['password_hash', 'token_hash', 'national_id_hash'].includes(k))
  )
  return (
    <div style={{ background: '#0a0f1e', border: `1px solid ${color}33`, borderRadius: '7px', padding: '10px 12px' }}>
      <div style={{ fontSize: '9px', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label} State</div>
      <pre style={{ fontSize: '10px', color: '#64748b', margin: 0, overflow: 'auto', maxHeight: '200px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify(safe, null, 2)}
      </pre>
    </div>
  )
}
