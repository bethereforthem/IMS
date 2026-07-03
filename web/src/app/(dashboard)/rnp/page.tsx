'use client'
import { useState, useEffect, useCallback } from 'react'
import { statsApi, suspectsApi, warrantsApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { AddSuspectModal } from '@/components/shared/AddSuspectModal'
import { AddWarrantModal } from '@/components/shared/AddWarrantModal'
import { useAuth } from '@/hooks/useAuth'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { Users, AlertTriangle, FileText, Radio, Shield, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, Suspect, IntelligenceEvent } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  WANTED: '#DC2626',
  ACTIVE: '#D97706',
  IN_CUSTODY: '#7C3AED',
  ARRESTED: '#1D4ED8',
  CONVICTED: '#6B7280',
  RELEASED: '#16A34A',
  INTERPOL_FLAGGED: '#FF4500',
}

const THREAT_COLOR = ['', 'text-green-400', 'text-yellow-400', 'text-amber-400', 'text-orange-400', 'text-red-500']

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export default function RNPOperations() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [wanted, setWanted] = useState<Suspect[]>([])
  const [events, setEvents] = useState<IntelligenceEvent[]>([])
  const [warrants, setWarrants] = useState<Record<string, unknown>[]>([])
  const [showAddSuspect, setShowAddSuspect] = useState(false)
  const [showAddWarrant, setShowAddWarrant] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      statsApi.getDashboard(),
      suspectsApi.list({ status: 'WANTED', limit: 30 }),
      statsApi.getRecentEvents(14),
      warrantsApi.list({ active: true, limit: 20 }),
    ]).then(([s, w, e, wa]) => {
      if (s.data) setStats(s.data)
      if (w.data?.suspects?.length) setWanted(w.data.suspects)
      if (e.data?.length) setEvents(e.data)
      if (wa.data?.warrants?.length) setWarrants(wa.data.warrants)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const suspectByStatus = wanted.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(suspectByStatus).map(([name, value]) => ({ name, value }))

  const cameraEvents = events.filter(e =>
    ['CCTV_NODE', 'FACE_SCAN', 'NID_SCAN'].includes(e.source_tag)
  )
  const recordFoundCount = cameraEvents.filter(e => e.criminal_record_found).length

  // 7-day trend from events
  const trendData = (() => {
    const days: Record<string, { events: number; alerts: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-RW', { month: 'short', day: 'numeric' })
      days[key] = { events: 0, alerts: 0 }
    }
    events.forEach(ev => {
      const key = new Date(ev.created_at).toLocaleDateString('en-RW', { month: 'short', day: 'numeric' })
      if (days[key]) {
        days[key].events++
        if (ev.alert_generated) days[key].alerts++
      }
    })
    return Object.entries(days).map(([date, v]) => ({ date, ...v }))
  })()

  const canWrite = ['RNP_COMMANDER', 'RNP_DETECTIVE'].includes(user?.role ?? '')

  return (
    <div className="space-y-6">
      {showAddSuspect && (
        <AddSuspectModal
          onClose={() => setShowAddSuspect(false)}
          onSuccess={() => { setShowAddSuspect(false); load() }}
        />
      )}
      {showAddWarrant && (
        <AddWarrantModal
          onClose={() => setShowAddWarrant(false)}
          onSuccess={() => { setShowAddWarrant(false); load() }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Operations Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {user?.full_name} · {user?.role?.replace('_', ' ')} · {user?.badge_number}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canWrite && (
            <>
              <button
                onClick={() => setShowAddSuspect(true)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Suspect
              </button>
              <button
                onClick={() => setShowAddWarrant(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Issue Warrant
              </button>
            </>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
            RNP Operations
          </div>
        </div>
      </div>

      {/* Stat grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Wanted Suspects" value={stats.wanted_count} icon={Users} variant="danger"
            sub="Actively sought" />
          <StatCard label="Active Warrants" value={stats.active_warrants} icon={FileText} variant="warn" />
          <StatCard label="Alerts Today" value={stats.alerts_today} icon={AlertTriangle}
            variant={stats.critical_alerts > 0 ? 'danger' : 'warn'}
            sub={stats.critical_alerts > 0 ? `${stats.critical_alerts} critical` : undefined} />
          <StatCard label="Camera Nodes"
            value={`${stats.camera_nodes_online}/${stats.camera_nodes_total}`}
            icon={Radio}
            variant={stats.camera_nodes_online < stats.camera_nodes_total ? 'warn' : 'ok'}
            sub={stats.camera_nodes_online < stats.camera_nodes_total
              ? `${stats.camera_nodes_total - stats.camera_nodes_online} offline` : 'All online'} />
        </div>
      ) : (
        <p className="text-sm text-slate-500 py-4">Could not load statistics.</p>
      )}

      {/* Wanted suspects + Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rnp/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Wanted &amp; Active Suspects</h2>
            <span className="text-xs text-slate-500">{wanted.length} total</span>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-800 animate-pulse" />
            ))}</div>
          ) : wanted.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">No wanted suspects in database</p>
              {canWrite && (
                <button onClick={() => setShowAddSuspect(true)}
                  className="mt-3 flex items-center gap-1.5 mx-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition">
                  <Plus className="h-3.5 w-3.5" /> Add Suspect
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {wanted.map(s => (
                <div key={s.id}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg border px-4 py-2.5',
                    s.status === 'WANTED' || s.status === 'INTERPOL_FLAGGED'
                      ? 'border-red-900/50 bg-red-950/20'
                      : 'border-slate-800 bg-slate-800/50'
                  )}>
                  <Shield className={clsx('h-4 w-4 shrink-0', THREAT_COLOR[s.threat_level] ?? 'text-slate-400')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{s.full_name}</p>
                      {s.alias && <span className="text-[10px] text-slate-500 italic">"{s.alias}"</span>}
                    </div>
                    <p className="text-xs text-slate-400">{s.ims_reference}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      s.status === 'WANTED' ? 'bg-red-950 text-red-400' :
                      s.status === 'INTERPOL_FLAGGED' ? 'bg-orange-950 text-orange-400' :
                      'bg-amber-950 text-amber-400'
                    )}>{s.status.replace('_', ' ')}</span>
                    <div className="flex items-center gap-0.5 mt-1 justify-end">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={clsx('h-1.5 w-1.5 rounded-full',
                          i < s.threat_level ? 'bg-red-500' : 'bg-slate-700')} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Active Alerts</h2>
          <AlertFeed limit={5} />
        </div>
      </div>

      {/* Status chart + camera events */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Suspect Status Breakdown</h2>
          {statusData.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.name] ?? '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(value: number, name: string) => [value, name.replace('_', ' ')]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {statusData.map(entry => (
              <div key={entry.name} className="flex items-center gap-1 text-[10px] text-slate-400">
                <div className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[entry.name] ?? '#6B7280' }} />
                {entry.name.replace('_', ' ')} ({entry.value})
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Camera &amp; Scan Events</h2>
            <span className={clsx(
              'text-xs font-bold px-2 py-0.5 rounded',
              recordFoundCount > 0 ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'
            )}>
              {recordFoundCount} record{recordFoundCount !== 1 ? 's' : ''} found
            </span>
          </div>
          {cameraEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No recent scan events</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {cameraEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 text-xs border-b border-slate-800/50 pb-2">
                  <SourceTagBadge tag={ev.source_tag} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 truncate">{ev.suspect_name ?? '—'}</p>
                    {ev.location_description && (
                      <p className="text-slate-500 text-[10px] truncate">{ev.location_description}</p>
                    )}
                  </div>
                  {ev.confidence_score != null && (
                    <span className="text-slate-500 shrink-0">{(ev.confidence_score * 100).toFixed(0)}%</span>
                  )}
                  {ev.criminal_record_found && (
                    <span className="text-red-400 font-bold shrink-0">⚠ RECORD</span>
                  )}
                  <span className="text-slate-500 shrink-0 whitespace-nowrap">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Weekly trend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Weekly Event Trend</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No events recorded</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="events" fill="#1D4ED8" radius={[3, 3, 0, 0]} name="Intel Events" />
              <Bar dataKey="alerts" fill="#DC2626" radius={[3, 3, 0, 0]} name="Alerts" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Active warrants */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Active Warrants</h2>
          <span className="text-xs text-slate-500">{warrants.length} open warrants</span>
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-slate-800 animate-pulse" />
          ))}</div>
        ) : warrants.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">No active warrants in database</p>
            {canWrite && (
              <button onClick={() => setShowAddWarrant(true)}
                className="mt-3 flex items-center gap-1.5 mx-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition">
                <Plus className="h-3.5 w-3.5" /> Issue Warrant
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Suspect</th>
                  <th className="py-2 text-left font-medium">Charges</th>
                  <th className="py-2 text-left font-medium">Type</th>
                  <th className="py-2 text-left font-medium">Priority</th>
                  <th className="py-2 text-left font-medium">Issued</th>
                  <th className="py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {warrants.map((w, i) => {
                  const suspect = w.suspects as Record<string, unknown> | null
                  return (
                    <tr key={i} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                      <td className="py-2.5 text-slate-200 font-medium">
                        {suspect?.full_name ? String(suspect.full_name) : '—'}
                        {suspect?.ims_reference && (
                          <p className="text-[10px] text-slate-500 font-mono">{String(suspect.ims_reference)}</p>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-400 max-w-[180px] truncate">{String(w.charges ?? '—')}</td>
                      <td className="py-2.5 text-slate-400">{String(w.warrant_type ?? 'ARREST')}</td>
                      <td className="py-2.5">
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                          w.priority === 'CRITICAL' ? 'bg-red-950 text-red-400' :
                          w.priority === 'HIGH' ? 'bg-amber-950 text-amber-400' :
                          'bg-slate-800 text-slate-400')}>
                          {String(w.priority ?? 'HIGH')}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-500 whitespace-nowrap">
                        {w.issued_at ? formatDistanceToNow(new Date(String(w.issued_at)), { addSuffix: true }) : '—'}
                      </td>
                      <td className="py-2.5">
                        <span className="text-xs font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
