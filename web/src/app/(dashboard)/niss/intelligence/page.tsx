'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { intelligenceApi } from '@/lib/api'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow } from 'date-fns'
import { MapPin } from 'lucide-react'
import clsx from 'clsx'
import type { IntelligenceEvent, SourceTag } from '@/types'

const SOURCE_FILTERS: (SourceTag | 'ALL')[] = [
  'ALL', 'CCTV_NODE', 'FACE_SCAN', 'NID_SCAN', 'NID_MANUAL',
  'INTERPOL_FEED', 'PARTNER_QUERY', 'OFFICER_REPORT', 'SYSTEM_ALERT',
]

export default function NISSIntelligencePage() {
  const { user } = useAuth()
  const [sourceFilter, setSourceFilter] = useState<SourceTag | 'ALL'>('ALL')
  const [recordsOnly, setRecordsOnly] = useState(false)
  const [events, setEvents] = useState<IntelligenceEvent[]>([])

  useEffect(() => {
    intelligenceApi.listEvents({ limit: 100 }).then((r) => {
      if (r.data?.events?.length) setEvents(r.data.events)
    }).catch(() => {})
  }, [])

  const filtered = events.filter((e) => {
    if (sourceFilter !== 'ALL' && e.source_tag !== sourceFilter) return false
    if (recordsOnly && !e.criminal_record_found) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">INTELLIGENCE EVENTS</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setSourceFilter(f as SourceTag | 'ALL')}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                sourceFilter === f
                  ? 'bg-niss text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={recordsOnly}
            onChange={(e) => setRecordsOnly(e.target.checked)}
            className="accent-niss h-3.5 w-3.5"
          />
          Records only (criminal record found)
        </label>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500">
        Showing <span className="text-white font-semibold">{filtered.length}</span> of {events.length} events
      </p>

      {/* Event cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No events match the current filters.
          </div>
        )}
        {filtered.map((e) => (
          <div
            key={e.id}
            className={clsx(
              'rounded-xl border bg-slate-900 p-5',
              e.criminal_record_found ? 'border-red-500/30' : 'border-slate-800'
            )}
          >
            <div className="flex items-start gap-4">
              {/* Left: source tag */}
              <div className="flex-shrink-0 pt-0.5">
                <SourceTagBadge tag={e.source_tag} />
              </div>

              {/* Center: details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{e.suspect_name ?? 'Unknown Subject'}</p>
                    {e.ims_reference && (
                      <p className="text-[11px] font-mono text-niss mt-0.5">{e.ims_reference}</p>
                    )}
                  </div>
                  {/* Right: confidence + record badge + time */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    {e.confidence_score != null && (
                      <span className="text-xs font-semibold text-slate-300">
                        {(e.confidence_score * 100).toFixed(1)}% confidence
                      </span>
                    )}
                    <span className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      e.criminal_record_found
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-green-500/20 text-green-400'
                    )}>
                      {e.criminal_record_found ? 'RECORD' : 'CLEAR'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                {e.notes && (
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">{e.notes}</p>
                )}

                {(e.location_description || (e.location_lat != null)) && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {e.location_description ?? `${e.location_lat?.toFixed(4)}, ${e.location_lng?.toFixed(4)}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
