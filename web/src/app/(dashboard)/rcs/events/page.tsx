'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { correctionsApi, apiErrorMessage } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Activity, DoorOpen, AlertOctagon, Wifi, Search, Calendar, AlertTriangle,
  ChevronLeft, ChevronRight, ArrowUpDown, RefreshCw, User,
} from 'lucide-react'
import clsx from 'clsx'
import type { CustodyEvent, CustodyEventType } from '@/types'

type EventTypeFilter = 'ALL' | CustodyEventType

const EVENT_TYPE_FILTERS: EventTypeFilter[] = [
  'ALL', 'INTAKE', 'RELEASE', 'REVIEW', 'TRANSFER', 'INCIDENT', 'RECORD_UPDATE',
]
const PAGE_SIZE = 25

const TYPE_DOT: Record<CustodyEventType, string> = {
  INTAKE:        'bg-blue-500',
  RELEASE:       'bg-green-500',
  REVIEW:        'bg-amber-500',
  INCIDENT:      'bg-red-500',
  TRANSFER:      'bg-cyan-500',
  RECORD_UPDATE: 'bg-slate-500',
}
const TYPE_BADGE: Record<CustodyEventType, string> = {
  INTAKE:        'bg-blue-950 text-blue-400',
  RELEASE:       'bg-green-950 text-green-400',
  REVIEW:        'bg-amber-950 text-amber-400',
  INCIDENT:      'bg-red-950 text-red-400',
  TRANSFER:      'bg-cyan-950 text-cyan-400',
  RECORD_UPDATE: 'bg-slate-800 text-slate-400',
}
const STATUS_BADGE: Record<CustodyEvent['status'], string> = {
  COMPLETED: 'bg-slate-800 text-slate-400',
  SCHEDULED: 'bg-slate-800 text-slate-300',
  OVERDUE:   'bg-red-950 text-red-400',
}

export default function RcsEventsPage() {
  const [events, setEvents] = useState<CustodyEvent[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [facilities, setFacilities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [eventType, setEventType] = useState<EventTypeFilter>('ALL')
  const [facility, setFacility] = useState('ALL')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // Overall totals, kept from an unfiltered request so the stat cards describe
  // the whole feed rather than whatever filter is currently applied.
  const [overall, setOverall] = useState<{ total: number; counts: Record<string, number> } | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setAppliedSearch(search.trim()); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    correctionsApi
      .events({
        page,
        page_size: PAGE_SIZE,
        event_type: eventType === 'ALL' ? undefined : eventType,
        facility: facility === 'ALL' ? undefined : facility,
        q: appliedSearch || undefined,
        order,
      })
      .then(r => {
        setEvents(r.data?.events ?? [])
        setTotal(r.data?.total ?? 0)
        setCounts(r.data?.counts ?? {})
        setFacilities(r.data?.facilities ?? [])
      })
      .catch(err => {
        setError(apiErrorMessage(err, 'Could not load custody events.'))
        setEvents([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, eventType, facility, appliedSearch, order])

  const loadOverall = useCallback(() => {
    correctionsApi.events({ page_size: 1 })
      .then(r => setOverall({ total: r.data?.total ?? 0, counts: r.data?.counts ?? {} }))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadOverall() }, [loadOverall])

  function pick<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Custody Events &amp; Activity</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            Intakes, releases, reviews, transfers and record actions from the custody database
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { load(); loadOverall() }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition disabled:opacity-50"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
            RCS Secure
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Events" value={overall?.total ?? '—'} icon={Activity} variant="default" sub="All custody activity" />
        <StatCard label="Intakes" value={overall?.counts.INTAKE ?? '—'} icon={DoorOpen} variant="default" sub="Registered intakes" />
        <StatCard label="Releases" value={overall?.counts.RELEASE ?? '—'} icon={Calendar} variant="default" sub="Actual and scheduled" />
        <StatCard label="Incidents" value={overall?.counts.INCIDENT ?? 0} icon={AlertOctagon}
          variant={(overall?.counts.INCIDENT ?? 0) > 0 ? 'danger' : 'ok'} sub="Escapes and recaptures" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search inmate, IMS ref or officer…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
            />
          </div>
          <select
            value={facility}
            onChange={e => pick(setFacility)(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-rcs/50"
          >
            <option value="ALL">All facilities</option>
            {facilities.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button
            onClick={() => { setOrder(o => (o === 'desc' ? 'asc' : 'desc')); setPage(1) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {order === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        <div className="flex gap-1 flex-wrap">
          {EVENT_TYPE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => pick(setEventType)(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                eventType === f
                  ? f === 'INCIDENT' ? 'bg-red-700 text-white' : 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f.replace('_', ' ')}
              {overall && f !== 'ALL' && (
                <span className="ml-1.5 opacity-60">{overall.counts[f] ?? 0}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {loading ? 'Loading…' : `Showing ${events.length} of ${total} events`}
        {!loading && Object.keys(counts).length > 0 && eventType === 'ALL' && facility === 'ALL' && !appliedSearch
          ? ''
          : ''}
      </p>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
        </div>
      )}

      {/* Event Cards */}
      <div className="space-y-3">
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}

        {!loading && !error && events.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No custody events match the current filters.
          </div>
        )}

        {!loading && events.map(e => {
          const isIncident = e.event_type === 'INCIDENT'
          const at = new Date(e.occurred_at)
          const valid = !isNaN(at.getTime())
          return (
            <div
              key={e.id}
              className={clsx(
                'rounded-xl border p-5 transition-colors',
                isIncident
                  ? 'border-red-700/60 bg-red-950/15 hover:bg-red-950/20'
                  : 'border-slate-800 bg-slate-900 hover:bg-slate-800/50'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 shrink-0">
                  <div className={clsx('h-3 w-3 rounded-full', TYPE_DOT[e.event_type], isIncident && 'animate-pulse')} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', TYPE_BADGE[e.event_type])}>
                      {e.event_type.replace('_', ' ')}
                    </span>
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', STATUS_BADGE[e.status])}>
                      {e.status}
                    </span>
                    {isIncident && (
                      <span className="text-[10px] font-bold text-red-400 animate-pulse">⚠ SECURITY INCIDENT</span>
                    )}
                  </div>

                  <p className="text-sm font-bold text-white mt-1.5">{e.inmate_name ?? 'Record no longer linked'}</p>
                  {e.ims_reference && (
                    <p className="text-[11px] font-mono text-rcs mt-0.5">{e.ims_reference}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                    <span>{e.description}</span>
                    {e.facility && <span><span className="text-slate-500">Facility:</span> {e.facility}</span>}
                    {e.cell_block && <span><span className="text-slate-500">Cell:</span> {e.cell_block}</span>}
                    {e.custody_status && (
                      <span><span className="text-slate-500">Status:</span> {e.custody_status.replace('_', ' ')}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500">
                    {e.officer_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {e.officer_name}
                        {e.officer_badge && ` · ${e.officer_badge}`}
                        {e.officer_institution && ` · ${e.officer_institution}`}
                      </span>
                    )}
                    {valid && (
                      <span title={at.toISOString()}>
                        {format(at, 'dd MMM yyyy HH:mm')} · {formatDistanceToNow(at, { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
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

      {/* RFID System Status */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-3 mb-3">
          <Wifi className="h-5 w-5 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">RFID Gate Monitoring</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-400">
            HARDWARE INTEGRATION PENDING
          </span>
          <span className="text-xs text-slate-400">
            Live RFID wristband gate events will stream here once facility readers are connected.
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          The feed above is built server-side from official custody records (intake, release, review,
          transfer and escape dates) joined with the audit trail, which supplies the officer who
          recorded each action.
        </p>
      </div>
    </div>
  )
}
