'use client'
import { useState, useEffect, useCallback } from 'react'
import { statsApi, casesApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { AddCaseModal } from '@/components/shared/AddCaseModal'
import { AddSuspectModal } from '@/components/shared/AddSuspectModal'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { FileText, Users, AlertTriangle, Activity, BookOpen, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, Case, IntelligenceEvent } from '@/types'

const CASE_STATUS_COLOR: Record<string, string> = {
  OPEN: 'text-blue-400 bg-blue-950',
  UNDER_INVESTIGATION: 'text-amber-400 bg-amber-950',
  PROSECUTION: 'text-orange-400 bg-orange-950',
  PENDING_PROSECUTION: 'text-blue-400 bg-blue-950',
  CLOSED: 'text-green-400 bg-green-950',
  COLD: 'text-slate-400 bg-slate-800',
  SUSPENDED: 'text-slate-400 bg-slate-800',
}

const CLASSIFICATION_COLOR: Record<string, string> = {
  TOP_SECRET: 'text-red-400',
  SECRET: 'text-amber-400',
  CONFIDENTIAL: 'text-yellow-400',
  UNCLASSIFIED: 'text-green-400',
}

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export default function RIBInvestigations() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [events, setEvents] = useState<IntelligenceEvent[]>([])
  const [showAddCase, setShowAddCase] = useState(false)
  const [showAddSuspect, setShowAddSuspect] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      statsApi.getDashboard(),
      casesApi.list({ limit: 20 }),
      statsApi.getRecentEvents(14),
    ]).then(([s, c, e]) => {
      if (s.data) setStats(s.data)
      if (c.data?.cases?.length) setCases(c.data.cases)
      if (e.data?.length) setEvents(e.data)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const casesByStatus = cases.reduce<Record<string, number>>((acc, c) => {
    const label = c.status.replace(/_/g, ' ')
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(casesByStatus).map(([name, value]) => ({ name, value }))

  // Weekly case activity from events
  const caseActivityData = (() => {
    const weeks: Record<string, { events: number; reports: number }> = {}
    const now = new Date()
    for (let w = 3; w >= 0; w--) {
      const d = new Date(now)
      d.setDate(d.getDate() - w * 7)
      const key = `W${4 - w} ${d.toLocaleDateString('en-RW', { month: 'short' })}`
      weeks[key] = { events: 0, reports: 0 }
    }
    events.forEach(ev => {
      const ageMs = now.getTime() - new Date(ev.created_at).getTime()
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
      if (ageDays > 28) return
      const weekIdx = Math.floor(ageDays / 7)
      const keys = Object.keys(weeks)
      const key = keys[3 - weekIdx]
      if (key) {
        weeks[key].events++
        if (ev.source_tag === 'OFFICER_REPORT') weeks[key].reports++
      }
    })
    return Object.entries(weeks).map(([week, v]) => ({ week, ...v }))
  })()

  const activeCases = cases.filter(c => !['CLOSED', 'COLD'].includes(c.status))
  const caseEventHits = events.filter(e => e.criminal_record_found)
  const canWrite = ['RIB_INVESTIGATOR'].includes(user?.role ?? '') ||
    ['NISS_DIRECTOR', 'NISS_OFFICER'].includes(user?.role ?? '')

  return (
    <div className="space-y-6">
      {showAddCase && (
        <AddCaseModal
          onClose={() => setShowAddCase(false)}
          onSuccess={() => { setShowAddCase(false); load() }}
        />
      )}
      {showAddSuspect && (
        <AddSuspectModal
          onClose={() => setShowAddSuspect(false)}
          onSuccess={() => { setShowAddSuspect(false); load() }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Investigations Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-3">
          {canWrite && (
            <>
              <button
                onClick={() => setShowAddCase(true)}
                className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Open Case
              </button>
              <button
                onClick={() => setShowAddSuspect(true)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Suspect
              </button>
            </>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
            RIB Intel Unit
          </div>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Cases" value={activeCases.length} icon={FileText} variant="warn"
            sub="Under investigation" />
          <StatCard label="Total Cases" value={cases.length} icon={BookOpen} />
          <StatCard label="Alerts Today" value={stats.alerts_today} icon={AlertTriangle}
            variant={stats.critical_alerts > 0 ? 'danger' : 'warn'} />
          <StatCard label="Intel Events" value={stats.events_today} icon={Activity}
            sub={`${caseEventHits.length} records found`} />
        </div>
      ) : (
        <p className="text-sm text-slate-500 py-4">Could not load statistics.</p>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rib/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Cases by Status</h2>
          {statusData.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No cases recorded</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Bar dataKey="value" fill="#0F766E" radius={[4, 4, 0, 0]} name="Cases" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-rib/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Monthly Case Activity</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No activity data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={caseActivityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="events" stroke="#0F766E" strokeWidth={2} dot={{ fill: '#0F766E' }} name="Intel Events" />
                <Line type="monotone" dataKey="reports" stroke="#D97706" strokeWidth={2} dot={{ fill: '#D97706' }} name="Officer Reports" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cases table + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Cases</h2>
            <span className="text-xs text-slate-500">{activeCases.length} / {cases.length} open</span>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-slate-800 animate-pulse" />
            ))}</div>
          ) : cases.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500 mb-3">No cases in database</p>
              {canWrite && (
                <button onClick={() => setShowAddCase(true)}
                  className="flex items-center gap-1.5 mx-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition">
                  <Plus className="h-3.5 w-3.5" /> Open First Case
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-500">
                    <th className="py-2 text-left font-medium">Reference</th>
                    <th className="py-2 text-left font-medium">Title</th>
                    <th className="py-2 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Class.</th>
                    <th className="py-2 text-left font-medium">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                      <td className="py-2.5 font-mono text-rib whitespace-nowrap">{c.case_reference}</td>
                      <td className="py-2.5 text-slate-200 max-w-[200px]">
                        <p className="truncate font-medium">{c.title}</p>
                        <p className="text-[10px] text-slate-500">{c.lead_institution}</p>
                      </td>
                      <td className="py-2.5">
                        <span className={clsx(
                          'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                          CASE_STATUS_COLOR[c.status] ?? 'text-slate-400 bg-slate-800'
                        )}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={clsx('py-2.5 text-xs font-medium', CLASSIFICATION_COLOR[c.classification] ?? 'text-slate-400')}>
                        {c.classification}
                      </td>
                      <td className="py-2.5 text-slate-500 whitespace-nowrap">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Active Alerts</h2>
          <AlertFeed limit={5} />
        </div>
      </div>

      {/* Case intelligence events */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Case Intelligence Events</h2>
          <span className="text-xs text-red-400 font-semibold">
            {caseEventHits.length} criminal records found
          </span>
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-800 animate-pulse" />
          ))}</div>
        ) : events.filter(e => e.suspect_name).length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No intelligence events with suspects</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {events.filter(e => e.suspect_name).map(ev => (
              <div key={ev.id}
                className={clsx(
                  'flex items-center gap-3 text-xs rounded-lg px-3 py-2',
                  ev.criminal_record_found ? 'border border-red-900/40 bg-red-950/10' : 'border border-slate-800'
                )}>
                <SourceTagBadge tag={ev.source_tag} />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-200 font-medium">{ev.suspect_name}</span>
                  {ev.location_description && (
                    <span className="text-slate-500 ml-2 text-[10px]">· {ev.location_description}</span>
                  )}
                </div>
                {ev.confidence_score != null && (
                  <span className="text-slate-500 shrink-0">{(ev.confidence_score * 100).toFixed(0)}%</span>
                )}
                {ev.criminal_record_found && (
                  <span className="text-red-400 font-bold shrink-0">RECORD</span>
                )}
                <span className="text-slate-500 shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Network analysis */}
      <div className="rounded-xl border border-rib/20 bg-slate-900 p-5">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-rib mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-200">Criminal Network Analysis</p>
            <p className="text-xs text-slate-400 mt-1">
              Network graph engine identifies connections between suspects via co-location,
              shared vehicles (ANPR), known associate data, and case co-suspects.
              {cases.length > 0
                ? ` ${activeCases.length} active case${activeCases.length !== 1 ? 's' : ''} under analysis.`
                : ' No active cases to analyze.'}
            </p>
            <div className="mt-3 flex gap-3 text-xs">
              <span className="flex items-center gap-1 text-red-400"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> WANTED</span>
              <span className="flex items-center gap-1 text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> ACTIVE</span>
              <span className="flex items-center gap-1 text-purple-400"><span className="h-2 w-2 rounded-full bg-purple-500 inline-block" /> IN CUSTODY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
