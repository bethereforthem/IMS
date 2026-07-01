'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { intelligenceApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { AlertCircle, ToggleLeft, ToggleRight, MapPin } from 'lucide-react'
import type { SourceTag, IntelligenceEvent } from '@/types'

const SOURCE_FILTERS: Array<SourceTag | 'ALL'> = [
  'ALL', 'CCTV_NODE', 'FACE_SCAN', 'NID_SCAN', 'NID_MANUAL',
  'OFFICER_REPORT', 'INTERPOL_FEED', 'PARTNER_QUERY',
]

const SOURCE_LABEL: Partial<Record<SourceTag, string>> = {
  CCTV_NODE:     'CCTV',
  FACE_SCAN:     'Face Scan',
  NID_SCAN:      'NID Scan',
  NID_MANUAL:    'NID Manual',
  OFFICER_REPORT:'Officer Rpt',
  INTERPOL_FEED: 'Interpol',
  PARTNER_QUERY: 'Partner',
  SYSTEM_ALERT:  'System',
}

export default function RIBIntelligencePage() {
  const { user } = useAuth()
  const [sourceFilter, setSourceFilter] = useState<SourceTag | 'ALL'>('ALL')
  const [criminalOnly, setCriminalOnly] = useState(false)
  const [events, setEvents] = useState<IntelligenceEvent[]>([])

  useEffect(() => {
    intelligenceApi.listEvents({ limit: 100 }).then(r => {
      if (r.data?.events?.length) setEvents(r.data.events)
    }).catch(() => {})
  }, [])

  const filtered = events.filter(ev => {
    const matchesSource = sourceFilter === 'ALL' || ev.source_tag === sourceFilter
    const matchesCriminal = !criminalOnly || ev.criminal_record_found
    return matchesSource && matchesCriminal
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Intelligence Events</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Intel Unit
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        {/* Source chips */}
        <div className="flex flex-wrap gap-2">
          {SOURCE_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={clsx(
                'text-[11px] font-semibold uppercase px-3 py-1 rounded-full border transition-colors',
                sourceFilter === s
                  ? 'bg-rib border-rib text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              )}
            >
              {s === 'ALL' ? 'All Sources' : (SOURCE_LABEL[s as SourceTag] ?? s)}
            </button>
          ))}
        </div>

        {/* Toggle + count */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCriminalOnly(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
          >
            {criminalOnly
              ? <ToggleRight className="h-5 w-5 text-rib" />
              : <ToggleLeft  className="h-5 w-5 text-slate-600" />
            }
            Criminal Records Only
          </button>
          <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500 text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No events match your filters.
          </div>
        )}
        {filtered.map(ev => (
          <div
            key={ev.id}
            className={clsx(
              'rounded-xl border bg-slate-900 p-4 flex gap-4',
              ev.criminal_record_found
                ? 'border-red-900/50 bg-red-950/10'
                : 'border-slate-800'
            )}
          >
            {/* Source badge */}
            <div className="shrink-0 pt-0.5">
              <SourceTagBadge tag={ev.source_tag} />
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-bold text-slate-100">
                {ev.suspect_name ?? <span className="text-slate-500 font-normal italic">No suspect identified</span>}
              </p>
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                {ev.ims_reference && (
                  <span className="font-mono text-rib/80">{ev.ims_reference}</span>
                )}
                {ev.location_description && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {ev.location_description}
                  </span>
                )}
              </div>
              {ev.notes && (
                <p className="text-[11px] text-slate-400 italic">{ev.notes}</p>
              )}
            </div>

            {/* Right side */}
            <div className="shrink-0 flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {ev.confidence_score != null && (
                  <span className="text-xs font-semibold text-slate-400">
                    {(ev.confidence_score * 100).toFixed(0)}%
                  </span>
                )}
                {ev.criminal_record_found && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-red-400 bg-red-950 border border-red-900/40">
                    Record Found
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-600 whitespace-nowrap">
                {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
