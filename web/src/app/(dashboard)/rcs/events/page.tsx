'use client'
import { useState, useEffect, useCallback } from 'react'
import { correctionsApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity, Users, DoorOpen, AlertOctagon, Wifi, Search,
} from 'lucide-react'
import clsx from 'clsx'

type CustodyEventType = 'INTAKE' | 'RELEASE' | 'REVIEW' | 'INCIDENT'
type EventTypeFilter = 'ALL' | CustodyEventType

interface CorrectionRecord {
  id: string
  full_name?: string | null
  ims_reference?: string | null
  facility?: string | null
  cell_block?: string | null
  status?: string | null
  intake_date?: string | null
  release_date?: string | null
  actual_release_at?: string | null
  next_review?: string | null
  threat_level?: number | null
}

interface CustodyEvent {
  id: string
  time: string
  event_type: CustodyEventType
  inmate: string
  ims_reference?: string | null
  facility: string
  detail: string
  future: boolean
}

// Derive a custody activity feed from real corrections records
function deriveEvents(records: CorrectionRecord[]): CustodyEvent[] {
  const events: CustodyEvent[] = []
  const now = Date.now()
  for (const r of records) {
    const inmate = r.full_name ?? 'Unknown'
    const facility = r.facility ?? 'Unknown facility'
    if (r.intake_date) {
      events.push({
        id: `${r.id}-intake`, time: r.intake_date, event_type: 'INTAKE',
        inmate, ims_reference: r.ims_reference, facility,
        detail: `Intake registered${r.cell_block ? ` · ${r.cell_block}` : ''} · ${String(r.status ?? '').replace('_', ' ')}`,
        future: false,
      })
    }
    const release = r.actual_release_at ?? r.release_date
    if (release) {
      events.push({
        id: `${r.id}-release`, time: release, event_type: 'RELEASE',
        inmate, ims_reference: r.ims_reference, facility,
        detail: r.actual_release_at ? 'Released from custody' : 'Scheduled release',
        future: new Date(release).getTime() > now,
      })
    }
    if (r.next_review) {
      events.push({
        id: `${r.id}-review`, time: r.next_review, event_type: 'REVIEW',
        inmate, ims_reference: r.ims_reference, facility,
        detail: new Date(r.next_review).getTime() > now ? 'Case review scheduled' : 'Case review held',
        future: new Date(r.next_review).getTime() > now,
      })
    }
    if (r.status === 'ESCAPED') {
      events.push({
        id: `${r.id}-escape`, time: r.intake_date ?? new Date().toISOString(), event_type: 'INCIDENT',
        inmate, ims_reference: r.ims_reference, facility,
        detail: 'ESCAPE — custody status flagged, escape protocol triggered',
        future: false,
      })
    }
  }
  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
}

const EVENT_TYPE_FILTERS: EventTypeFilter[] = ['ALL', 'INTAKE', 'RELEASE', 'REVIEW', 'INCIDENT']

function eventDotCls(type: CustodyEventType): string {
  if (type === 'INCIDENT') return 'bg-red-500'
  if (type === 'INTAKE') return 'bg-blue-500'
  if (type === 'RELEASE') return 'bg-green-500'
  return 'bg-amber-500'
}

export default function RcsEventsPage() {
  const [records, setRecords] = useState<CorrectionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [eventType, setEventType] = useState<EventTypeFilter>('ALL')
  const [facility, setFacility] = useState('ALL')
  const [nameSearch, setNameSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    correctionsApi.list({ limit: 100 })
      .then(r => setRecords((r.data?.records ?? []) as unknown as CorrectionRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const allEvents = deriveEvents(records)
  const facilities = ['ALL', ...Array.from(new Set(allEvents.map(e => e.facility))).sort()]

  const events = allEvents.filter(e => {
    const matchType = eventType === 'ALL' || e.event_type === eventType
    const matchFacility = facility === 'ALL' || e.facility === facility
    const q = nameSearch.trim().toLowerCase()
    const matchName = !q ||
      e.inmate.toLowerCase().includes(q) ||
      (e.ims_reference ?? '').toLowerCase().includes(q)
    return matchType && matchFacility && matchName
  })

  const totalCount = allEvents.length
  const intakeCount = allEvents.filter(e => e.event_type === 'INTAKE').length
  const reviewCount = allEvents.filter(e => e.event_type === 'REVIEW' && e.future).length
  const incidentCount = allEvents.filter(e => e.event_type === 'INCIDENT').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Custody Events &amp; Activity</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">Intakes, releases, reviews and incidents from custody records</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          RCS Secure
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Events" value={totalCount} icon={Activity} variant="default" sub="All custody activity" />
        <StatCard label="Intakes" value={intakeCount} icon={DoorOpen} variant="default" sub="Registered intakes" />
        <StatCard label="Upcoming Reviews" value={reviewCount} icon={Users} variant="default" sub="Scheduled case reviews" />
        <StatCard label="Incidents" value={incidentCount} icon={AlertOctagon} variant="danger" sub="Escapes & security flags" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            placeholder="Search by name or IMS ref…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {EVENT_TYPE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setEventType(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                eventType === f
                  ? f === 'INCIDENT' ? 'bg-red-700 text-white' : 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {facilities.map(f => (
            <button
              key={f}
              onClick={() => setFacility(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                facility === f
                  ? 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">Showing {events.length} of {totalCount} events</p>

      {/* Event Cards */}
      <div className="space-y-3">
        {loading && (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}</div>
        )}
        {!loading && events.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No custody events match the current filters.
          </div>
        )}
        {!loading && events.map(e => {
          const isIncident = e.event_type === 'INCIDENT'
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
                {/* Dot */}
                <div className="mt-1 shrink-0">
                  <div className={clsx(
                    'h-3 w-3 rounded-full',
                    eventDotCls(e.event_type),
                    isIncident && 'animate-pulse'
                  )} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        isIncident
                          ? 'bg-red-950 text-red-400'
                          : e.event_type === 'INTAKE'
                          ? 'bg-blue-950 text-blue-400'
                          : e.event_type === 'REVIEW'
                          ? 'bg-amber-950 text-amber-400'
                          : 'bg-green-950 text-green-400'
                      )}
                    >
                      {e.event_type}
                    </span>
                    {e.future && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        UPCOMING
                      </span>
                    )}
                    {isIncident && (
                      <span className="text-[10px] font-bold text-red-400 animate-pulse">⚠ SECURITY INCIDENT</span>
                    )}
                  </div>

                  <p className="text-sm font-bold text-white mt-1.5">{e.inmate}</p>
                  {e.ims_reference && (
                    <p className="text-[11px] font-mono text-rcs mt-0.5">{e.ims_reference}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                    <span>{e.detail}</span>
                    <span><span className="text-slate-500">Facility:</span> {e.facility}</span>
                    <span className="text-slate-500">
                      {formatDistanceToNow(new Date(e.time), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

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
          The activity feed above is generated from official custody records (intakes, releases,
          scheduled reviews and escape flags) in the central database.
        </p>
      </div>
    </div>
  )
}
