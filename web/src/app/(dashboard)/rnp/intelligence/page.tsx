'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { intelligenceApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { Radio, Search, FileWarning, Video } from 'lucide-react'
import clsx from 'clsx'
import type { IntelligenceEvent } from '@/types'

type SourceFilter = 'ALL' | 'CCTV_NODE' | 'NID_SCAN' | 'NID_MANUAL' | 'FACE_SCAN' | 'OFFICER_REPORT'

const SOURCE_FILTERS: SourceFilter[] = ['ALL', 'CCTV_NODE', 'NID_SCAN', 'NID_MANUAL', 'FACE_SCAN', 'OFFICER_REPORT']

export default function IntelligencePage() {
  const { user } = useAuth()
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL')
  const [recordsOnly, setRecordsOnly] = useState(false)
  const [allEvents, setAllEvents] = useState<IntelligenceEvent[]>([])

  useEffect(() => {
    intelligenceApi.listEvents({ limit: 100 }).then(r => {
      if (r.data?.events?.length) {
        setAllEvents(r.data.events)
      }
    }).catch(() => {})
  }, [])

  const events = allEvents.filter(e => {
    const matchSource = sourceFilter === 'ALL' || e.source_tag === sourceFilter
    const matchRecord = !recordsOnly || e.criminal_record_found
    return matchSource && matchRecord
  })

  const totalCount = allEvents.length
  const recordFoundCount = allEvents.filter(e => e.criminal_record_found).length
  const cameraEventCount = allEvents.filter(e => e.source_tag === 'CCTV_NODE').length
  const manualEventCount = allEvents.filter(e =>
    ['NID_MANUAL', 'OFFICER_REPORT'].includes(e.source_tag)
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Intelligence Events</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Events" value={totalCount} icon={Search} variant="default" sub="All time" />
        <StatCard label="Records Found" value={recordFoundCount} icon={FileWarning} variant="danger" sub="Criminal hits" />
        <StatCard label="Camera Events" value={cameraEventCount} icon={Video} variant="warn" sub="CCTV detections" />
        <StatCard label="Manual Events" value={manualEventCount} icon={Radio} variant="default" sub="Officer + manual" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {SOURCE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                sourceFilter === f
                  ? 'bg-rnp text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRecordsOnly(v => !v)}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
            recordsOnly
              ? 'border-red-500/50 bg-red-950/30 text-red-400'
              : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
          )}
        >
          Records Found Only
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Event Log</h2>
          <span className="text-xs text-slate-500">{events.length} event{events.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500">
                <th className="py-2 text-left font-medium">Source</th>
                <th className="py-2 text-left font-medium">Subject</th>
                <th className="py-2 text-left font-medium hidden sm:table-cell">IMS Ref</th>
                <th className="py-2 text-left font-medium hidden md:table-cell">Location</th>
                <th className="py-2 text-left font-medium">Confidence</th>
                <th className="py-2 text-left font-medium">Record</th>
                <th className="py-2 text-left font-medium hidden lg:table-cell">Camera Node</th>
                <th className="py-2 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                    No events match the current filters.
                  </td>
                </tr>
              )}
              {events.map(ev => (
                <tr key={ev.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                  <td className="py-2.5">
                    <SourceTagBadge tag={ev.source_tag} />
                  </td>
                  <td className="py-2.5 text-slate-200 font-medium whitespace-nowrap">
                    {ev.suspect_name ?? <span className="text-slate-500 italic">Unknown</span>}
                  </td>
                  <td className="py-2.5 hidden sm:table-cell">
                    {ev.ims_reference
                      ? <span className="font-mono text-rnp text-[10px]">{ev.ims_reference}</span>
                      : <span className="text-slate-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 text-slate-400 hidden md:table-cell max-w-[180px] truncate">
                    {ev.location_description ?? <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2.5 text-slate-400">
                    {ev.confidence_score != null
                      ? `${(ev.confidence_score * 100).toFixed(0)}%`
                      : <span className="text-slate-600">—</span>
                    }
                  </td>
                  <td className="py-2.5">
                    {ev.criminal_record_found ? (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-950 text-red-400">
                        YES
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-950 text-green-400">
                        CLEAR
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 hidden lg:table-cell">
                    {ev.camera_node_id
                      ? <span className="font-mono text-[10px] text-slate-400">{ev.camera_node_id}</span>
                      : <span className="text-slate-600">—</span>
                    }
                  </td>
                  <td className="py-2.5 text-slate-500 whitespace-nowrap">
                    <div>{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</div>
                    <div className="text-[10px] text-slate-600">{format(new Date(ev.created_at), 'dd MMM HH:mm')}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
