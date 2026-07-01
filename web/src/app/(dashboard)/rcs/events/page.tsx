'use client'
import { useState } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity, Users, DoorOpen, AlertOctagon, Wifi,
} from 'lucide-react'
import clsx from 'clsx'

type RfidEventType = 'MOVEMENT' | 'VISITOR_ENTRY' | 'VISITOR_EXIT' | 'STAFF_ENTRY' | 'UNAUTHORIZED'
type EventTypeFilter = 'ALL' | RfidEventType
type FacilityFilter = 'ALL' | 'Mageragere' | 'Nyarugenge'

interface RfidEvent {
  id: string
  time: string
  gate: string
  event_type: RfidEventType
  authorized: boolean
  facility: string
  inmate?: string
  ims_reference?: string
  visitor?: string
}

const RFID_EVENTS: RfidEvent[] = [
  { id: 'r1', time: '2026-06-29T12:30:00Z', inmate: 'Christine Uwimana', ims_reference: 'RWA-IMS-2024-00002', gate: 'B-Block Gate 2', event_type: 'MOVEMENT', authorized: true, facility: 'Mageragere' },
  { id: 'r2', time: '2026-06-29T10:00:00Z', inmate: 'Pierre Nsengiyumva', ims_reference: 'RWA-IMS-2023-00001', gate: 'Yard Gate A', event_type: 'MOVEMENT', authorized: true, facility: 'Nyarugenge' },
  { id: 'r3', time: '2026-06-29T09:15:00Z', gate: 'Main Entry', event_type: 'VISITOR_ENTRY', authorized: true, visitor: 'Authorised Legal Counsel', facility: 'Mageragere' },
  { id: 'r4', time: '2026-06-29T07:45:00Z', inmate: 'Fidele Hakizimana', ims_reference: 'RWA-IMS-2026-00001', gate: 'C-Block Gate 1', event_type: 'MOVEMENT', authorized: true, facility: 'Mageragere' },
  { id: 'r5', time: '2026-06-28T18:00:00Z', gate: 'Main Entry', event_type: 'VISITOR_EXIT', authorized: true, visitor: 'Family Visit — pre-approved', facility: 'Nyarugenge' },
  { id: 'r6', time: '2026-06-28T14:22:00Z', inmate: 'Solange Uwera', ims_reference: 'RWA-IMS-2024-00004', gate: 'Yard Gate B', event_type: 'MOVEMENT', authorized: true, facility: 'Nyarugenge' },
  { id: 'r7', time: '2026-06-28T11:30:00Z', gate: 'Service Entry', event_type: 'STAFF_ENTRY', authorized: true, visitor: 'Staff: Supply Delivery', facility: 'Mageragere' },
  { id: 'r8', time: '2026-06-27T21:00:00Z', gate: 'B-Block Gate 2', event_type: 'UNAUTHORIZED', authorized: false, inmate: 'Theodore Karangwa', ims_reference: 'RWA-IMS-2023-00002', facility: 'Nyarugenge' },
]

const EVENT_TYPE_FILTERS: EventTypeFilter[] = ['ALL', 'MOVEMENT', 'VISITOR_ENTRY', 'VISITOR_EXIT', 'STAFF_ENTRY', 'UNAUTHORIZED']

function eventDotCls(type: RfidEventType): string {
  if (type === 'UNAUTHORIZED') return 'bg-red-500'
  if (type === 'MOVEMENT') return 'bg-blue-500'
  if (type === 'VISITOR_ENTRY' || type === 'VISITOR_EXIT') return 'bg-green-500'
  return 'bg-slate-500'
}

export default function RcsEventsPage() {
  const [eventType, setEventType] = useState<EventTypeFilter>('ALL')
  const [facility, setFacility] = useState<FacilityFilter>('ALL')

  const events = RFID_EVENTS.filter(e => {
    const matchType = eventType === 'ALL' || e.event_type === eventType
    const matchFacility = facility === 'ALL' || e.facility === facility
    return matchType && matchFacility
  })

  const totalCount = RFID_EVENTS.length
  const movementCount = RFID_EVENTS.filter(e => e.event_type === 'MOVEMENT').length
  const visitorCount = RFID_EVENTS.filter(e => e.event_type === 'VISITOR_ENTRY' || e.event_type === 'VISITOR_EXIT').length
  const unauthorizedCount = RFID_EVENTS.filter(e => e.event_type === 'UNAUTHORIZED').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Gate Events &amp; Activity</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">RFID gate events and custody activity log</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          RCS Secure
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Events" value={totalCount} icon={Activity} variant="default" sub="All gate activity" />
        <StatCard label="Movements" value={movementCount} icon={DoorOpen} variant="default" sub="Inmate movements" />
        <StatCard label="Visitor Events" value={visitorCount} icon={Users} variant="default" sub="Entry & exit" />
        <StatCard label="Unauthorized" value={unauthorizedCount} icon={AlertOctagon} variant="danger" sub="Security incidents" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {EVENT_TYPE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setEventType(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                eventType === f
                  ? f === 'UNAUTHORIZED' ? 'bg-red-700 text-white' : 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['ALL', 'Mageragere', 'Nyarugenge'] as FacilityFilter[]).map(f => (
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
        {events.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No events match the current filters.
          </div>
        )}
        {events.map(e => {
          const isUnauth = e.event_type === 'UNAUTHORIZED'
          return (
            <div
              key={e.id}
              className={clsx(
                'rounded-xl border p-5 transition-colors',
                isUnauth
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
                    isUnauth && 'animate-pulse'
                  )} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        isUnauth
                          ? 'bg-red-950 text-red-400'
                          : e.event_type === 'MOVEMENT'
                          ? 'bg-blue-950 text-blue-400'
                          : e.event_type === 'STAFF_ENTRY'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-green-950 text-green-400'
                      )}
                    >
                      {e.event_type.replace('_', ' ')}
                    </span>
                    <span className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      e.authorized
                        ? 'bg-green-950 text-green-400'
                        : 'bg-red-950 text-red-400'
                    )}>
                      {e.authorized ? 'AUTHORIZED' : 'UNAUTHORIZED'}
                    </span>
                    {isUnauth && (
                      <span className="text-[10px] font-bold text-red-400 animate-pulse">⚠ SECURITY INCIDENT</span>
                    )}
                  </div>

                  <p className="text-sm font-bold text-white mt-1.5">
                    {e.inmate ?? e.visitor ?? 'Unknown'}
                  </p>
                  {e.ims_reference && (
                    <p className="text-[11px] font-mono text-rcs mt-0.5">{e.ims_reference}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                    <span><span className="text-slate-500">Gate:</span> {e.gate}</span>
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
          <Wifi className="h-5 w-5 text-green-400" />
          <h2 className="text-sm font-semibold text-white">RFID System Status</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-950 text-green-400">
            ONLINE
          </span>
          <span className="text-xs text-slate-400">All 3 gate readers active</span>
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-950 text-green-400">
            Escape Detection: ACTIVE
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Last system heartbeat: {formatDistanceToNow(new Date('2026-06-30T00:00:00Z'), { addSuffix: true })} ·
          RFID coverage: Mageragere (2 readers), Nyarugenge (1 reader)
        </p>
      </div>
    </div>
  )
}
