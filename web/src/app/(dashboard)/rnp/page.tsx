'use client'
import { useState, useEffect } from 'react'
import { statsApi, suspectsApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { useAuth } from '@/hooks/useAuth'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { Users, AlertTriangle, FileText, Radio, Shield, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, Suspect, IntelligenceEvent } from '@/types'
import { DAM_STATS, DAM_SUSPECTS, DAM_EVENTS, DAM_ALERTS, DAM_TREND } from '@/lib/dam'

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

const WARRANT_MOCK = [
  { id: 'w1', reference: 'RNP-W-2026-0041', suspect: 'Alexis Mugisha', charge: 'Armed Robbery', issued: '2026-03-10', status: 'ACTIVE' },
  { id: 'w2', reference: 'RNP-W-2026-0028', suspect: 'Goreth Mukamana', charge: 'Human Trafficking', issued: '2026-01-22', status: 'ACTIVE' },
  { id: 'w3', reference: 'RNP-W-2025-0117', suspect: 'Eric Ndayambaje', charge: 'Drug Trafficking', issued: '2025-11-05', status: 'ACTIVE' },
  { id: 'w4', reference: 'RNP-W-2025-0093', suspect: 'Jean Niyongabo', charge: 'Armed Insurgency', issued: '2025-08-14', status: 'ACTIVE' },
  { id: 'w5', reference: 'RNP-W-2026-0014', suspect: 'Dieudonne Kabera', charge: 'Cybercrime', issued: '2026-02-17', status: 'ACTIVE' },
]

export default function RNPOperations() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats>(DAM_STATS)
  const [wanted, setWanted] = useState<Suspect[]>(
    DAM_SUSPECTS.filter(s => ['WANTED', 'ACTIVE', 'INTERPOL_FLAGGED'].includes(s.status))
  )
  const [events, setEvents] = useState<IntelligenceEvent[]>(DAM_EVENTS)

  useEffect(() => {
    Promise.all([
      statsApi.getDashboard(),
      suspectsApi.getWanted(),
      statsApi.getRecentEvents(14),
    ]).then(([s, w, e]) => {
      if (s.data) setStats(s.data)
      if (w.data?.length) setWanted(w.data)
      if (e.data?.length) setEvents(e.data)
    }).catch(() => {})
  }, [])

  const suspectByStatus = wanted.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(suspectByStatus).map(([name, value]) => ({ name, value }))

  const cameraEvents = events.filter(e =>
    ['CCTV_NODE', 'FACE_SCAN', 'NID_SCAN'].includes(e.source_tag)
  )
  const recordFoundCount = cameraEvents.filter(e => e.criminal_record_found).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Operations Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {user?.full_name} · {user?.role?.replace('_', ' ')} · {user?.badge_number}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Stat grid */}
      {stats && (
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
            sub={`${stats.camera_nodes_online < stats.camera_nodes_total
              ? `${stats.camera_nodes_total - stats.camera_nodes_online} offline` : 'All online'}`} />
        </div>
      )}

      {/* Wanted suspects + Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rnp/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Wanted &amp; Active Suspects</h2>
            <span className="text-xs text-slate-500">{wanted.length} total</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {wanted.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No suspects in your scope</p>
            ) : wanted.map(s => (
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
                      <div key={i} className={clsx(
                        'h-1.5 w-1.5 rounded-full',
                        i < s.threat_level ? 'bg-red-500' : 'bg-slate-700'
                      )} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Active Alerts</h2>
          <AlertFeed limit={5} initialAlerts={DAM_ALERTS.slice(0, 5)} />
        </div>
      </div>

      {/* Status chart + camera events */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Suspect Status Breakdown</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.name] ?? '#6B7280'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(value: number, name: string) => [value, name.replace('_', ' ')]}
              />
            </PieChart>
          </ResponsiveContainer>
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
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {cameraEvents.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No recent scan events</p>
            ) : cameraEvents.map(ev => (
              <div key={ev.id}
                className="flex items-center gap-3 text-xs border-b border-slate-800/50 pb-2">
                <SourceTagBadge tag={ev.source_tag} />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 truncate">{ev.suspect_name ?? '—'}</p>
                  {ev.location_description && (
                    <p className="text-slate-500 text-[10px] truncate">{ev.location_description}</p>
                  )}
                </div>
                {ev.confidence_score != null && (
                  <span className="text-slate-500 shrink-0">
                    {(ev.confidence_score * 100).toFixed(0)}%
                  </span>
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
        </div>
      </div>

      {/* Weekly trend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Weekly Event Trend</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={DAM_TREND} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Bar dataKey="events" fill="#1D4ED8" radius={[3, 3, 0, 0]} name="Intel Events" />
            <Bar dataKey="alerts" fill="#DC2626" radius={[3, 3, 0, 0]} name="Alerts" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Active warrants */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Active Warrants</h2>
          <span className="text-xs text-slate-500">{WARRANT_MOCK.length} open warrants</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500">
                <th className="py-2 text-left font-medium">Reference</th>
                <th className="py-2 text-left font-medium">Suspect</th>
                <th className="py-2 text-left font-medium">Charge</th>
                <th className="py-2 text-left font-medium">Issued</th>
                <th className="py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {WARRANT_MOCK.map(w => (
                <tr key={w.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                  <td className="py-2.5 font-mono text-rnp">{w.reference}</td>
                  <td className="py-2.5 text-slate-200 font-medium">{w.suspect}</td>
                  <td className="py-2.5 text-slate-400">{w.charge}</td>
                  <td className="py-2.5 text-slate-500">{w.issued}</td>
                  <td className="py-2.5">
                    <span className="text-xs font-bold text-amber-400 bg-amber-950 px-2 py-0.5 rounded">
                      {w.status}
                    </span>
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
