'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { fieldReportsApi, agentTrackingApi, type WebFieldReport, type ActiveAgent } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow, format } from 'date-fns'
import {
  RefreshCw, X, Shield, AlertTriangle, CheckCircle,
  Clock, Radio, ChevronDown, ChevronUp, Users, MapPin, FileText,
} from 'lucide-react'
import clsx from 'clsx'
import type { BorderPost } from './_IncidentMap'

const RDFIncidentMap = dynamic(() => import('./_IncidentMap'), { ssr: false })

// ── Border posts shown on the map ─────────────────────────────────────────────

const BORDER_POSTS: BorderPost[] = [
  { name: 'Gatuna',         country: 'Uganda',           code: 'GTN', lat: -1.7018, lng: 29.7350 },
  { name: 'Rubavu',         country: 'DRC/Congo',         code: 'RBV', lat: -1.6763, lng: 29.3460 },
  { name: 'Rusizi',         country: 'Burundi',           code: 'RSZ', lat: -2.4797, lng: 28.9078 },
  { name: 'Nyagatare',      country: 'Uganda (East)',     code: 'NYG', lat: -1.2948, lng: 30.3288 },
  { name: 'Kigali Airport', country: 'International',    code: 'KGL', lat: -1.9706, lng: 30.1328 },
  { name: 'Bugarama',       country: 'DRC / Burundi',    code: 'BGR', lat: -2.6125, lng: 28.8583 },
]

// ── Style helpers ─────────────────────────────────────────────────────────────

const PRIORITY_BORDER: Record<string, string> = {
  CRITICAL: 'border-red-500',
  HIGH:     'border-orange-400',
  MEDIUM:   'border-amber-400',
  LOW:      'border-green-500',
}

const PRIORITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-orange-400',
  MEDIUM:   'text-amber-400',
  LOW:      'text-green-400',
}

const STATUS_STYLE: Record<string, string> = {
  OPEN:           'bg-red-900/40 text-red-300',
  ASSIGNED:       'bg-amber-900/40 text-amber-300',
  INVESTIGATING:  'bg-blue-900/40 text-blue-300',
  CLOSED:         'bg-slate-700 text-slate-400',
  PAUSED:         'bg-purple-900/40 text-purple-300',
}

const ASSIGN_INSTITUTIONS = ['RDF', 'RNP', 'NISS'] as const
type AssignInst = typeof ASSIGN_INSTITUTIONS[number]

// ── Incident detail modal ─────────────────────────────────────────────────────

function IncidentModal({
  report,
  onClose,
  onAssigned,
}: {
  report: WebFieldReport
  onClose: () => void
  onAssigned: () => void
}) {
  const [selected, setSelected] = useState<AssignInst[]>(
    (report.assigned_to ?? []).filter(i => ASSIGN_INSTITUTIONS.includes(i as AssignInst)) as AssignInst[]
  )
  const [status, setStatus]     = useState(report.status)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showHistory, setShowHistory] = useState(false)

  function toggleInst(inst: AssignInst) {
    setSelected(prev =>
      prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst]
    )
  }

  async function handleAssign() {
    if (selected.length === 0) { setError('Select at least one institution.'); return }
    setLoading(true); setError('')
    try {
      await fieldReportsApi.assign(report.id, selected, status)
      onAssigned()
      onClose()
    } catch {
      setError('Assignment failed — please retry.')
    } finally { setLoading(false) }
  }

  const hasCoords = report.location_lat != null && report.location_lng != null

  const instStyle: Record<string, string> = {
    RDF:  'bg-green-700 border-green-500 text-white shadow-lg shadow-green-900/50',
    RNP:  'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50',
    NISS: 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-green-900/60 bg-slate-900 shadow-2xl shadow-green-900/20">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-green-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-green-400 tracking-widest uppercase">RDF Field Report</span>
                <span className={clsx('text-[9px] font-bold border rounded px-1.5 py-0.5', PRIORITY_BORDER[report.priority], PRIORITY_TEXT[report.priority])}>
                  {report.priority}
                </span>
              </div>
              <h2 className="text-sm font-bold text-white leading-tight mt-0.5">{report.title}</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {report.category} · {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-2 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status / tracking row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2">
              <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">Status</p>
              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', STATUS_STYLE[report.status] ?? 'text-slate-400')}>
                {report.status}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2">
              <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">GPS Tracking</p>
              <p className="text-xs font-bold text-slate-300">
                {report.tracking_session?.status === 'ACTIVE'
                  ? '🟢 Live'
                  : report.tracking_session?.status === 'PAUSED'
                    ? '🟡 Paused'
                    : '⚫ None'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2">
              <p className="text-[9px] text-slate-500 uppercase font-semibold mb-0.5">Assigned To</p>
              <p className="text-xs font-semibold text-green-300">
                {report.assigned_to?.length ? report.assigned_to.join(', ') : 'Unassigned'}
              </p>
            </div>
          </div>

          {/* Agent info */}
          <div className="rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3 flex items-center gap-3">
            <Users className="h-4 w-4 text-green-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">{report.agent_name ?? 'Unknown Agent'}</p>
              <p className="text-[10px] text-slate-400">
                {report.agent_badge} · {report.agent_institution} · {report.agent_role?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          {/* GPS coordinates */}
          {hasCoords && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <MapPin className="h-3 w-3 text-green-400" />
              <span>
                {Number(report.location_lat).toFixed(5)}, {Number(report.location_lng).toFixed(5)}
                {report.location_description && ` — ${report.location_description}`}
              </span>
            </div>
          )}

          {/* Incident date */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            <span>Incident: {format(new Date(report.incident_date), 'dd MMM yyyy HH:mm')}</span>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Description</p>
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
              {report.description}
            </p>
          </div>

          {/* Notes */}
          {report.notes && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Field Notes</p>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap italic">
                {report.notes}
              </p>
            </div>
          )}

          {/* Media */}
          {report.media_urls && report.media_urls.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2">
                Attachments ({report.media_urls.length})
              </p>
              <div className="flex gap-2 flex-wrap">
                {report.media_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-green-400 underline">
                    Attachment {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Tracking session */}
          {report.tracking_session && (
            <>
              <button
                className="w-full flex items-center justify-between text-[11px] text-slate-400 py-1"
                onClick={() => setShowHistory(h => !h)}
              >
                <span className="flex items-center gap-1">
                  <Radio className="h-3 w-3" />
                  Tracking session · {report.tracking_session.total_pings} GPS pings recorded
                </span>
                {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showHistory && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 space-y-1 text-[11px] text-slate-400">
                  <p>Started: {format(new Date(report.tracking_session.started_at), 'dd MMM yyyy HH:mm')}</p>
                  <p>Status: <span className={clsx('font-bold',
                    report.tracking_session.status === 'ACTIVE' ? 'text-green-400' :
                    report.tracking_session.status === 'PAUSED' ? 'text-amber-400' : 'text-slate-500'
                  )}>{report.tracking_session.status}</span></p>
                  <p>Total GPS pings: {report.tracking_session.total_pings}</p>
                </div>
              )}
            </>
          )}

          {/* ── Assignment panel ── */}
          <div className="border-t border-slate-800 pt-5">
            <p className="text-xs font-bold text-white mb-3">Assign Case To</p>
            <div className="flex gap-2 mb-3">
              {ASSIGN_INSTITUTIONS.map(inst => {
                const isOn = selected.includes(inst)
                return (
                  <button
                    key={inst}
                    onClick={() => toggleInst(inst)}
                    className={clsx(
                      'flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all',
                      isOn
                        ? instStyle[inst]
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    )}
                  >
                    {isOn ? '✓ ' : ''}{inst}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-slate-400 font-semibold shrink-0">Set Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2"
              >
                <option value="OPEN">Open</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="PAUSED">Paused</option>
                <option value="CLOSED">Closed (ends tracking)</option>
              </select>
            </div>

            {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

            <button
              onClick={handleAssign}
              disabled={loading}
              className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="h-4 w-4" />
              {loading ? 'Assigning…' : 'Assign & Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Report list row ───────────────────────────────────────────────────────────

function ReportRow({ report, onClick }: { report: WebFieldReport; onClick: () => void }) {
  const hasCoords = report.location_lat != null && report.location_lng != null

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-green-800 hover:bg-slate-900 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className={clsx('w-1 self-stretch rounded-full shrink-0', {
          'bg-red-500':    report.priority === 'CRITICAL',
          'bg-orange-400': report.priority === 'HIGH',
          'bg-amber-400':  report.priority === 'MEDIUM',
          'bg-green-500':  report.priority === 'LOW',
        })} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{report.title}</span>
            <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded', STATUS_STYLE[report.status] ?? 'bg-slate-700 text-slate-400')}>
              {report.status}
            </span>
            {hasCoords && <MapPin className="h-3 w-3 text-green-400 shrink-0" />}
          </div>
          <p className="text-[11px] text-slate-400 mb-1">
            {report.category} · {report.agent_name} ({report.agent_badge})
          </p>
          <p className="text-[11px] text-slate-500 line-clamp-1">{report.description}</p>
          <p className="text-[10px] text-slate-600 mt-1">
            {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className={clsx('text-[9px] font-bold border rounded px-1.5 py-0.5 shrink-0 mt-0.5',
          PRIORITY_BORDER[report.priority] ?? '',
          PRIORITY_TEXT[report.priority] ?? ''
        )}>
          {report.priority}
        </div>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RDFIncidentsPage() {
  const [reports, setReports]       = useState<WebFieldReport[]>([])
  const [agents, setAgents]         = useState<ActiveAgent[]>([])
  const [selected, setSelected]     = useState<WebFieldReport | null>(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filterStatus, setFilterStatus]   = useState('ALL')
  const [filterPriority, setFilterPriority] = useState('ALL')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true)

    const [rRes, aRes] = await Promise.allSettled([
      fieldReportsApi.list({ limit: 100 }),
      agentTrackingApi.getActiveAgents(),
    ])

    if (rRes.status === 'fulfilled') {
      // Show only RDF-originating reports
      const all = rRes.value.data?.reports ?? []
      setReports(all.filter(r => r.agent_institution === 'RDF'))
    }
    if (aRes.status === 'fulfilled') {
      const all = aRes.value.data?.agents ?? []
      setAgents(all.filter(a => a.agent_institution === 'RDF'))
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Supabase Realtime — instant updates on new/changed reports and GPS pings,
  // matching the NISS incidents pattern exactly.
  useEffect(() => {
    const ch = supabase
      .channel('rdf-incidents-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'field_reports' }, () => load(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'field_reports' }, () => load(true))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_location_pings' }, () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const displayed = reports.filter(r => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
    if (filterPriority !== 'ALL' && r.priority !== filterPriority) return false
    return true
  })

  const reportsWithCoords = displayed.filter(r => r.location_lat != null && r.location_lng != null)
  const openCount     = reports.filter(r => r.status === 'OPEN').length
  const criticalCount = reports.filter(r => r.priority === 'CRITICAL').length
  const activeAgents  = agents.filter(a => a.session_status === 'ACTIVE').length

  return (
    <div className="space-y-4">
      {selected && (
        <IncidentModal
          report={selected}
          onClose={() => setSelected(null)}
          onAssigned={() => load()}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">RDF Field Incidents</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time map of field agent reports and live GPS tracking — RDF only
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-2 transition-colors"
        >
          <RefreshCw className={clsx('h-3 w-3', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stat pills */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/20 px-3 py-1.5">
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="text-xs text-red-300 font-semibold">{openCount} Open</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-orange-700 bg-orange-900/20 px-3 py-1.5">
          <FileText className="h-3 w-3 text-orange-400" />
          <span className="text-xs text-orange-300 font-semibold">{criticalCount} Critical</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-green-800 bg-green-900/20 px-3 py-1.5">
          <Radio className="h-3 w-3 text-green-400" />
          <span className="text-xs text-green-300 font-semibold">{activeAgents} Tracking</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5">
          <MapPin className="h-3 w-3 text-green-400" />
          <span className="text-xs text-slate-300 font-semibold">{reportsWithCoords.length} on map</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-green-900 bg-green-950/40 px-3 py-1.5">
          <Shield className="h-3 w-3 text-green-600" />
          <span className="text-xs text-green-500 font-semibold">{BORDER_POSTS.length} Border Posts</span>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-2xl border border-green-900/40 overflow-hidden h-[500px] relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              <span className="text-xs text-slate-400">Loading RDF incidents…</span>
            </div>
          </div>
        )}
        <RDFIncidentMap
          reports={reportsWithCoords}
          agents={agents}
          borderPosts={BORDER_POSTS}
          onSelectReport={r => setSelected(r)}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2"
        >
          <option value="ALL">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="PAUSED">Paused</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2"
        >
          <option value="ALL">All priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <span className="text-xs text-slate-500">{displayed.length} report(s)</span>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center">
          <CheckCircle className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No RDF incident reports match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(r => (
            <ReportRow key={r.id} report={r} onClick={() => setSelected(r)} />
          ))}
        </div>
      )}
    </div>
  )
}
