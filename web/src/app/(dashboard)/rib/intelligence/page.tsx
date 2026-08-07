'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { intelligenceApi, apiErrorMessage } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import {
  AlertCircle, ToggleLeft, ToggleRight, MapPin, Search, AlertTriangle,
  ChevronLeft, ChevronRight, ArrowUpDown, RefreshCw, Shield, User,
} from 'lucide-react'
import type { SourceTag, IntelligenceEvent } from '@/types'

const SOURCE_FILTERS: Array<SourceTag | 'ALL'> = [
  'ALL', 'CCTV_NODE', 'FACE_SCAN', 'NID_SCAN', 'NID_MANUAL',
  'OFFICER_REPORT', 'INTERPOL_FEED', 'PARTNER_QUERY', 'SYSTEM_ALERT',
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

const CLASSIFICATION_COLOR: Record<string, string> = {
  TOP_SECRET:   'text-red-400 bg-red-950 border border-red-900/40',
  SECRET:       'text-amber-400 bg-amber-950 border border-amber-900/40',
  CONFIDENTIAL: 'text-yellow-400 bg-yellow-950 border border-yellow-900/30',
  UNCLASSIFIED: 'text-green-400 bg-green-950 border border-green-900/30',
}

const PAGE_SIZE = 25

/** Fields the API adds on top of the raw row, used by this page. */
type EventRow = IntelligenceEvent & {
  suspect_ims_reference?: string | null
  classification?: string | null
  event_timestamp?: string | null
  alert_generated?: boolean
}

export default function RIBIntelligencePage() {
  const { user } = useAuth()
  const [sourceFilter, setSourceFilter] = useState<SourceTag | 'ALL'>('ALL')
  const [criminalOnly, setCriminalOnly] = useState(false)
  const [alertedOnly, setAlertedOnly]   = useState(false)
  const [search, setSearch]             = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [order, setOrder]               = useState<'asc' | 'desc'>('desc')
  const [page, setPage]                 = useState(1)

  const [events, setEvents]   = useState<EventRow[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setAppliedSearch(search.trim()); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  // Every filter is applied by the database. They used to narrow a single
  // 100-row fetch in the browser, so the counts and the "Criminal Records Only"
  // toggle described one page rather than the feed.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    intelligenceApi.listEvents({
      page,
      page_size: PAGE_SIZE,
      source_tag: sourceFilter === 'ALL' ? undefined : sourceFilter,
      criminal_record_found: criminalOnly ? true : undefined,
      alert_generated: alertedOnly ? true : undefined,
      q: appliedSearch || undefined,
      order,
    })
      .then(r => {
        setEvents((r.data?.events ?? []) as unknown as EventRow[])
        setTotal(r.data?.total ?? 0)
      })
      .catch(err => {
        // A failed request must never render as "no events".
        setError(apiErrorMessage(err, 'Could not load intelligence events.'))
        setEvents([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, sourceFilter, criminalOnly, alertedOnly, appliedSearch, order])

  useEffect(() => { load() }, [load])

  function pick<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Intelligence Events</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition disabled:opacity-50"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
            RIB Intel Unit
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by subject name or IMS reference…"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rib/50"
            />
          </div>
          <button
            onClick={() => { setOrder(o => (o === 'desc' ? 'asc' : 'desc')); setPage(1) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {order === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        {/* Source chips */}
        <div className="flex flex-wrap gap-2">
          {SOURCE_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => pick(setSourceFilter)(s as SourceTag | 'ALL')}
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

        {/* Toggles + count */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => { setCriminalOnly(v => !v); setPage(1) }}
              className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
            >
              {criminalOnly
                ? <ToggleRight className="h-5 w-5 text-rib" />
                : <ToggleLeft  className="h-5 w-5 text-slate-600" />}
              Criminal Records Only
            </button>
            <button
              onClick={() => { setAlertedOnly(v => !v); setPage(1) }}
              className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
            >
              {alertedOnly
                ? <ToggleRight className="h-5 w-5 text-rib" />
                : <ToggleLeft  className="h-5 w-5 text-slate-600" />}
              Alert Generated
            </button>
          </div>
          <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
            {loading ? 'Loading…' : `${total} event${total !== 1 ? 's' : ''} match`}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
        </div>
      )}

      {/* Event list */}
      <div className="space-y-3">
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500 text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No events match your filters.
          </div>
        )}

        {!loading && events.map(ev => {
          const at = new Date(ev.created_at)
          const valid = !isNaN(at.getTime())
          return (
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-100">
                    {ev.suspect_name ?? <span className="text-slate-500 font-normal italic">No suspect identified</span>}
                  </p>
                  {ev.suspect_status && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {ev.suspect_status.replace('_', ' ')}
                    </span>
                  )}
                  {ev.suspect_threat_level != null && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Shield className="h-3 w-3" /> Threat {ev.suspect_threat_level}/5
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
                  {/* This read `ev.ims_reference`, which the API does not
                      return — the reference never rendered on any event. */}
                  {ev.suspect_ims_reference && (
                    <span className="font-mono text-rib/80">{ev.suspect_ims_reference}</span>
                  )}
                  {ev.location_description && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {ev.location_description}
                    </span>
                  )}
                  {ev.institution && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {ev.institution}
                    </span>
                  )}
                </div>
                {ev.notes && (
                  <p className="text-[11px] text-slate-400 italic line-clamp-2">{ev.notes}</p>
                )}
              </div>

              {/* Right side */}
              <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {ev.classification && (
                    <span className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      CLASSIFICATION_COLOR[ev.classification] ?? 'text-slate-400 bg-slate-800'
                    )}>
                      {ev.classification.replace('_', ' ')}
                    </span>
                  )}
                  {ev.confidence_score != null && (
                    <span className="text-xs font-semibold text-slate-400">
                      {(ev.confidence_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {ev.alert_generated && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-amber-400 bg-amber-950 border border-amber-900/40">
                      Alert Raised
                    </span>
                  )}
                  {ev.criminal_record_found && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-red-400 bg-red-950 border border-red-900/40">
                      Record Found
                    </span>
                  )}
                </div>
                {valid && (
                  <span className="text-[10px] text-slate-600 whitespace-nowrap text-right" title={at.toISOString()}>
                    {format(at, 'dd MMM yyyy HH:mm')}
                    <br />
                    {formatDistanceToNow(at, { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
          <button
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
