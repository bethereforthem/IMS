'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { intelligenceApi } from '@/lib/api'
import { Activity, Camera, CheckCircle, AlertTriangle, Radio } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { SourceTag, IntelligenceEvent } from '@/types'

const SOURCE_FILTERS: (SourceTag | 'ALL')[] = [
  'ALL', 'CCTV_NODE', 'FACE_SCAN', 'INTERPOL_FEED', 'PARTNER_QUERY',
]

export default function RDFIntelligencePage() {
  const { user } = useAuth()
  const [events, setEvents]                   = useState<IntelligenceEvent[]>([])
  const [sourceFilter, setSourceFilter]       = useState<SourceTag | 'ALL'>('ALL')
  const [recordFoundOnly, setRecordFoundOnly] = useState(false)

  useEffect(() => {
    intelligenceApi.listEvents({ limit: 100 }).then(r => {
      if (r.data?.events?.length) setEvents(r.data.events)
    }).catch(() => {})
  }, [])

  const borderCctvEvents = useMemo(() => events.filter(e => e.source_tag === 'CCTV_NODE'), [events])

  const allFiltered = useMemo(() => {
    return events.filter(e => {
      if (sourceFilter !== 'ALL' && e.source_tag !== sourceFilter) return false
      if (recordFoundOnly && !e.criminal_record_found) return false
      return true
    })
  }, [events, sourceFilter, recordFoundOnly])

  // Summary stats
  const totalEvents         = events.length
  const borderCctvCount     = borderCctvEvents.length
  const recordsFoundCount   = events.filter(e => e.criminal_record_found).length
  const activeSuspectsCount = new Set(events.filter(e => e.suspect_id).map(e => e.suspect_id)).size

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">INTELLIGENCE EVENTS</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Events"              value={totalEvents}         icon={Activity}      variant="default" />
        <StatCard label="Border Camera Events"      value={borderCctvCount}     icon={Camera}        variant="ok"     sub="CCTV_NODE source" />
        <StatCard label="Records Found"             value={recordsFoundCount}   icon={AlertTriangle} variant={recordsFoundCount > 0 ? 'danger' : 'default'} sub="Criminal records matched" />
        <StatCard label="Active Suspects Detected"  value={activeSuspectsCount} icon={Radio}         variant={activeSuspectsCount > 0 ? 'warn' : 'default'} sub="Unique suspect IDs" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Source:</span>
          {SOURCE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setSourceFilter(f as SourceTag | 'ALL')}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                sourceFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRecordFoundOnly(v => !v)}
          className={clsx(
            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
            recordFoundOnly ? 'bg-red-900/60 text-red-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          )}
        >
          <CheckCircle className="h-3 w-3" />
          Records Found Only {recordFoundOnly ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Section 1: Border Camera Events */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Camera className="h-4 w-4 text-rdf" />
            Border Camera Events
          </h2>
          <span className="text-xs text-slate-500">{borderCctvEvents.length} events</span>
        </div>

        {borderCctvEvents.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm text-slate-600">No border camera events.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {borderCctvEvents.map(ev => (
              <div
                key={ev.id}
                className={clsx(
                  'rounded-xl border bg-slate-900 p-5 space-y-3',
                  ev.criminal_record_found ? 'border-red-900/50' : 'border-slate-800'
                )}
              >
                {/* Top row: confidence + camera */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {ev.confidence_score != null && (
                      <div className={clsx(
                        'text-2xl font-black tabular-nums shrink-0',
                        ev.confidence_score >= 0.9 ? 'text-green-400' :
                        ev.confidence_score >= 0.75 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {(ev.confidence_score * 100).toFixed(0)}
                        <span className="text-sm font-bold">%</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">{ev.suspect_name ?? 'Unknown Subject'}</p>
                      {ev.ims_reference && (
                        <p className="text-[10px] font-mono text-rdf">{ev.ims_reference}</p>
                      )}
                    </div>
                  </div>
                  {ev.criminal_record_found && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
                      RECORD FOUND
                    </span>
                  )}
                </div>

                {/* Camera node */}
                {ev.camera_node_id && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Camera className="h-3 w-3 shrink-0" />
                    <code className="font-mono text-slate-300">{ev.camera_node_id}</code>
                  </div>
                )}

                {/* Location */}
                {ev.location_description && (
                  <p className="text-xs text-slate-500">{ev.location_description}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <SourceTagBadge tag={ev.source_tag} />
                  <span className="text-[10px] text-slate-600">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: All Events Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-400" />
            All Events
          </h2>
          <span className="text-xs text-slate-500">
            Showing <span className="text-white font-semibold">{allFiltered.length}</span> of {totalEvents}
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Camera / Location</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Confidence</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Record</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody>
                {allFiltered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-600">
                      No events match the current filters.
                    </td>
                  </tr>
                )}
                {allFiltered.map(ev => (
                  <tr
                    key={ev.id}
                    className={clsx(
                      'border-b border-slate-800/50 text-xs hover:bg-slate-800/20',
                      ev.criminal_record_found && 'bg-red-950/10'
                    )}
                  >
                    <td className="px-4 py-3">
                      <SourceTagBadge tag={ev.source_tag} />
                    </td>
                    <td className="px-4 py-3">
                      {ev.suspect_name ? (
                        <div>
                          <p className="font-medium text-slate-200">{ev.suspect_name}</p>
                          {ev.ims_reference && (
                            <p className="text-[10px] font-mono text-rdf">{ev.ims_reference}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">No subject</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {ev.camera_node_id ? (
                        <div>
                          <code className="text-[10px] font-mono text-slate-300">{ev.camera_node_id}</code>
                          {ev.location_description && (
                            <p className="text-slate-600 text-[10px] truncate mt-0.5">{ev.location_description}</p>
                          )}
                        </div>
                      ) : ev.location_description ? (
                        <p className="text-slate-400 truncate">{ev.location_description}</p>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ev.confidence_score != null ? (
                        <span className={clsx(
                          'font-bold tabular-nums',
                          ev.confidence_score >= 0.9 ? 'text-green-400' :
                          ev.confidence_score >= 0.75 ? 'text-amber-400' : 'text-red-400'
                        )}>
                          {(ev.confidence_score * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ev.criminal_record_found ? (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          YES
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                          CLEAR
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
