'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { suspectsApi, intelligenceApi } from '@/lib/api'
import { Search, User, ArrowUpDown, Info } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { SuspectStatus, ClearanceLevel, Suspect, IntelligenceEvent } from '@/types'

const STATUS_FILTERS: (SuspectStatus | 'ALL')[] = [
  'ALL', 'WANTED', 'ACTIVE', 'INTERPOL_FLAGGED', 'CONVICTED',
]

const statusBadge: Record<SuspectStatus, string> = {
  WANTED:          'bg-red-500/20 text-red-400',
  ACTIVE:          'bg-amber-500/20 text-amber-400',
  IN_CUSTODY:      'bg-purple-500/20 text-purple-400',
  ARRESTED:        'bg-blue-500/20 text-blue-400',
  CONVICTED:       'bg-slate-500/20 text-slate-400',
  RELEASED:        'bg-green-500/20 text-green-400',
  INTERPOL_FLAGGED:'bg-orange-500/20 text-orange-400',
  DECEASED:        'bg-slate-600/20 text-slate-500',
}

const clearanceBadge: Record<ClearanceLevel, string> = {
  TOP_SECRET:   'bg-red-500/10 text-red-400 border border-red-500/20',
  SECRET:       'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  CONFIDENTIAL: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  UNCLASSIFIED: 'bg-green-500/10 text-green-400 border border-green-500/20',
}

function ThreatDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={clsx('inline-block h-2 w-2 rounded-full', i < level ? 'bg-red-500' : 'bg-slate-700')}
        />
      ))}
    </div>
  )
}

export default function RDFSuspectsPage() {
  const { user } = useAuth()
  const [suspects, setSuspects]             = useState<Suspect[]>([])
  const [events, setEvents]                 = useState<IntelligenceEvent[]>([])
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState<SuspectStatus | 'ALL'>('ALL')
  const [prioritySort, setPrioritySort]     = useState(false)

  useEffect(() => {
    suspectsApi.list({ limit: 200 }).then(r => {
      if (r.data?.suspects?.length) setSuspects(r.data.suspects)
    }).catch(() => {})
    intelligenceApi.listEvents({ limit: 100 }).then(r => {
      if (r.data?.events?.length) setEvents(r.data.events)
    }).catch(() => {})
  }, [])

  // Build a lookup: suspect_id -> most recent event
  const recentEventBySuspect = useMemo(() =>
    events.reduce<Record<string, IntelligenceEvent>>((acc, ev) => {
      if (!ev.suspect_id) return acc
      const existing = acc[ev.suspect_id]
      if (!existing || new Date(ev.created_at) > new Date(existing.created_at)) {
        acc[ev.suspect_id] = ev
      }
      return acc
    }, {}),
  [events])

  const filtered = useMemo(() => {
    let result = suspects.filter(s => {
      const q = search.toLowerCase()
      if (q && !s.full_name.toLowerCase().includes(q) && !s.ims_reference.toLowerCase().includes(q)) return false
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
      return true
    })
    if (prioritySort) {
      result = [...result].sort((a, b) => b.threat_level - a.threat_level)
    }
    return result
  }, [search, statusFilter, prioritySort])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">BORDER-FLAGGED SUSPECTS</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-xl border border-rdf/20 bg-rdf/5 px-4 py-3">
        <Info className="h-4 w-4 text-rdf shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Border intelligence focuses on cross-border movement. Suspects are flagged based on CCTV detections,
          NID checks at border posts, and Interpol notices. Nationality is highlighted for border context.
          Cross-reference with live camera events before escalating.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or IMS reference…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rdf/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f as SuspectStatus | 'ALL')}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                  statusFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                )}
              >
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPrioritySort(v => !v)}
            className={clsx(
              'ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
              prioritySort ? 'bg-red-900/60 text-red-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            <ArrowUpDown className="h-3 w-3" />
            Priority Sort {prioritySort ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500">
        Showing <span className="text-white font-semibold">{filtered.length}</span> of {suspects.length} suspects
      </p>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">IMS Reference</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name / Alias</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Threat</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Nationality</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Sighting</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Clearance Req.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-600">
                    No suspects match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map(s => {
                const recentEv = recentEventBySuspect[s.id]
                const isInterpol = s.status === 'INTERPOL_FLAGGED'
                return (
                  <tr
                    key={s.id}
                    className={clsx(
                      'border-b border-slate-800/50 text-xs hover:bg-slate-800/20',
                      isInterpol && 'bg-orange-950/20'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-rdf text-xs">{s.ims_reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="shrink-0 h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">{s.full_name}</p>
                          {s.alias && <p className="text-slate-500 italic">"{s.alias}"</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', statusBadge[s.status])}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ThreatDots level={s.threat_level} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'text-xs font-semibold',
                        s.nationality !== 'RWA' ? 'text-amber-400' : 'text-slate-400'
                      )}>
                        {s.nationality}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {recentEv?.location_description ? (
                        <div>
                          <p className="text-slate-300 truncate">{recentEv.location_description}</p>
                          <p className="text-slate-600 text-[10px] mt-0.5">
                            {formatDistanceToNow(new Date(recentEv.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">No recent sighting</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', clearanceBadge[s.clearance_required])}>
                        {s.clearance_required.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
