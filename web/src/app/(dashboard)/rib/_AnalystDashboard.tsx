'use client'
import { useState, useEffect, useCallback } from 'react'
import { statsApi, intelligenceApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { Activity, AlertTriangle, TrendingUp, Shield, Radio } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, IntelligenceEvent } from '@/types'

const SOURCE_LABELS: Record<string, string> = {
  CCTV_NODE:      'CCTV',
  FACE_SCAN:      'Face Scan',
  NID_SCAN:       'NID Scan',
  NID_MANUAL:     'NID Manual',
  OFFICER_REPORT: 'Officer Rpt',
  INTERPOL_FEED:  'Interpol',
  PARTNER_QUERY:  'Partner',
  SYSTEM_ALERT:   'System',
}

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export function AnalystDashboard() {
  const { user } = useAuth()
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState<DashboardStats | null>(null)
  const [events, setEvents]     = useState<IntelligenceEvent[]>([])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      statsApi.getDashboard(),
      intelligenceApi.listEvents({ limit: 100 }),
    ]).then(([s, e]) => {
      if (s.data) setStats(s.data)
      if (e.data?.events?.length) setEvents(e.data.events)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── Source breakdown ──────────────────────────────────────────────────────
  const sourceBreakdown = (() => {
    const map: Record<string, { total: number; hits: number }> = {}
    events.forEach(ev => {
      if (!map[ev.source_tag]) map[ev.source_tag] = { total: 0, hits: 0 }
      map[ev.source_tag].total++
      if (ev.criminal_record_found) map[ev.source_tag].hits++
    })
    return Object.entries(map)
      .map(([source, { total, hits }]) => ({
        source,
        label:   SOURCE_LABELS[source] ?? source,
        total,
        hits,
        rate:    total > 0 ? (hits / total) * 100 : 0,
        lastSeen: events
          .filter(e => e.source_tag === source)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
          ?.created_at,
      }))
      .sort((a, b) => b.total - a.total)
  })()

  // ── Weekly trend ──────────────────────────────────────────────────────────
  const weeklyTrend = (() => {
    const weeks: Record<string, { events: number; hits: number }> = {}
    const now = new Date()
    for (let w = 3; w >= 0; w--) {
      const d = new Date(now)
      d.setDate(d.getDate() - w * 7)
      const key = `W${4 - w} ${d.toLocaleDateString('en-RW', { month: 'short' })}`
      weeks[key] = { events: 0, hits: 0 }
    }
    events.forEach(ev => {
      const ageDays = Math.floor((now.getTime() - new Date(ev.created_at).getTime()) / 86_400_000)
      if (ageDays > 28) return
      const key = Object.keys(weeks)[3 - Math.floor(ageDays / 7)]
      if (key) { weeks[key].events++; if (ev.criminal_record_found) weeks[key].hits++ }
    })
    return Object.entries(weeks).map(([week, v]) => ({ week, ...v }))
  })()

  const totalHits   = events.filter(e => e.criminal_record_found).length
  const hitRate     = events.length > 0 ? (totalHits / events.length) * 100 : 0
  const recordHits  = events.filter(e => e.criminal_record_found).slice(0, 20)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Intelligence Analysis Center</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Analysis Unit
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Events Analyzed"  value={events.length}             icon={Activity}      sub="Total in pool" />
          <StatCard label="Criminal Hits"     value={totalHits}                 icon={Shield}
            variant={totalHits > 0 ? 'danger' : 'default'} sub="Records matched" />
          <StatCard label="Hit Rate"          value={`${hitRate.toFixed(1)}%`}  icon={TrendingUp}
            variant={hitRate > 20 ? 'warn' : 'ok'} sub="Criminal match rate" />
          <StatCard label="Active Alerts"     value={stats?.alerts_today ?? 0} icon={AlertTriangle}
            variant={(stats?.critical_alerts ?? 0) > 0 ? 'danger' : 'warn'} />
        </div>
      )}

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rib/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Events by Intelligence Source</h2>
          {sourceBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No events recorded</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Bar dataKey="total" fill="#0F766E" radius={[4, 4, 0, 0]} name="Total Events" />
                <Bar dataKey="hits"  fill="#ef4444" radius={[4, 4, 0, 0]} name="Criminal Hits" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-rib/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Weekly Intel Trend</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No trend data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="events" stroke="#0F766E" strokeWidth={2} dot={{ fill: '#0F766E' }} name="Total Events" />
                <Line type="monotone" dataKey="hits"   stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} name="Criminal Hits" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Source performance table + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Source Performance Analysis</h2>
          {sourceBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No source data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-2 text-left font-medium">Source</th>
                    <th className="py-2 text-right font-medium">Events</th>
                    <th className="py-2 text-right font-medium">Hits</th>
                    <th className="py-2 text-right font-medium">Hit Rate</th>
                    <th className="py-2 text-right font-medium">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceBreakdown.map(s => (
                    <tr key={s.source} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="py-2.5 text-slate-300 font-medium">{s.label}</td>
                      <td className="py-2.5 text-right text-slate-300">{s.total}</td>
                      <td className={clsx('py-2.5 text-right font-semibold',
                        s.hits > 0 ? 'text-red-400' : 'text-slate-500')}>
                        {s.hits}
                      </td>
                      <td className={clsx('py-2.5 text-right font-bold',
                        s.rate > 30 ? 'text-red-400' : s.rate > 15 ? 'text-amber-400' : 'text-green-400')}>
                        {s.rate.toFixed(1)}%
                      </td>
                      <td className="py-2.5 text-right text-slate-600 whitespace-nowrap">
                        {s.lastSeen
                          ? formatDistanceToNow(new Date(s.lastSeen), { addSuffix: true })
                          : '—'}
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

      {/* Criminal record matches feed */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Criminal Record Matches</h2>
          <span className="text-xs font-semibold text-red-400">{totalHits} total</span>
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-800 animate-pulse" />
          ))}</div>
        ) : recordHits.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No criminal record matches found</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {recordHits.map(ev => (
              <div key={ev.id}
                className="flex items-center gap-3 text-xs rounded-lg px-3 py-2 border border-red-900/40 bg-red-950/10">
                <SourceTagBadge tag={ev.source_tag} />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-200 font-medium">{ev.suspect_name ?? 'Unknown'}</span>
                  {ev.location_description && (
                    <span className="text-slate-500 ml-2 text-[10px]">· {ev.location_description}</span>
                  )}
                </div>
                {ev.confidence_score != null && (
                  <span className="text-slate-500 shrink-0">{(ev.confidence_score * 100).toFixed(0)}%</span>
                )}
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-red-400 bg-red-950 border border-red-900/40 shrink-0">
                  Record
                </span>
                <span className="text-slate-600 shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytical assessment */}
      <div className="rounded-xl border border-rib/20 bg-slate-900 p-5">
        <div className="flex items-start gap-3">
          <Radio className="h-5 w-5 text-rib mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-200">Analytical Assessment</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Intelligence pool spans{' '}
              <span className="text-slate-200 font-medium">{sourceBreakdown.length}</span> active
              source{sourceBreakdown.length !== 1 ? 's' : ''} with an overall criminal match rate of{' '}
              <span className={clsx('font-bold',
                hitRate > 20 ? 'text-red-400' : hitRate > 10 ? 'text-amber-400' : 'text-green-400')}>
                {hitRate.toFixed(1)}%
              </span>.
              {totalHits > 0
                ? ` ${totalHits} subject${totalHits !== 1 ? 's' : ''} with criminal records flagged across ${events.length} events.`
                : ` No criminal records matched in the current pool of ${events.length} events.`}
              {' '}Analyst access is read-only — escalate actionable intelligence to an RIB Investigator for case action.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
