'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { statsApi, siemApi, partnersApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { AddSuspectModal } from '@/components/shared/AddSuspectModal'
import { useAuth } from '@/hooks/useAuth'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import {
  Users, AlertTriangle, Shield, Radio, FileText,
  Activity, Globe, Lock, CheckCircle, Clock, XCircle, Plus,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, IntelligenceEvent, SiemEvent } from '@/types'

const SOURCE_COLORS = ['#7C3AED','#1D4ED8','#0F766E','#15803D','#B45309','#DC2626','#6B7280','#D97706']

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-yellow-400',
  LOW: 'text-slate-400',
}

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export default function NISSCommandCenter() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [events, setEvents] = useState<IntelligenceEvent[]>([])
  const [siem, setSiem] = useState<SiemEvent[]>([])
  const [partners, setPartners] = useState<Record<string, unknown>[]>([])
  const [showAddSuspect, setShowAddSuspect] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      statsApi.getDashboard(),
      statsApi.getRecentEvents(14),
      siemApi.getEvents(6),
      partnersApi.list(),
    ]).then(([s, e, se, p]) => {
      if (s.data) setStats(s.data)
      if (e.data?.length) setEvents(e.data)
      if (se.data?.length) setSiem(se.data)
      const pData = (p.data as { partners?: Record<string, unknown>[] })?.partners
      if (pData?.length) setPartners(pData)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Compute 7-day event trend from loaded events
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

  const sourceDist = events.reduce<Record<string, number>>((acc, ev) => {
    acc[ev.source_tag] = (acc[ev.source_tag] ?? 0) + 1
    return acc
  }, {})
  const sourceData = Object.entries(sourceDist).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  }))

  const pendingSiem = siem.filter(e => !e.reviewed).length
  const criticalSiem = siem.filter(e => e.severity === 'CRITICAL').length
  const canWrite = ['NISS_DIRECTOR', 'NISS_OFFICER'].includes(user?.role ?? '')

  return (
    <div className="space-y-6">
      {showAddSuspect && (
        <AddSuspectModal
          onClose={() => setShowAddSuspect(false)}
          onSuccess={() => { setShowAddSuspect(false); load() }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Command Center</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {user?.full_name} · {user?.clearance_level} clearance · All institutions visible
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canWrite && (
            <button
              onClick={() => setShowAddSuspect(true)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Suspect
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Live · {new Date().toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Suspects" value={stats.total_suspects} icon={Users} />
          <StatCard label="Wanted" value={stats.wanted_count} icon={AlertTriangle} variant="danger"
            sub="Actively sought across institutions" />
          <StatCard label="In Custody" value={stats.in_custody_count} icon={Shield} variant="warn" />
          <StatCard label="Active Warrants" value={stats.active_warrants} icon={FileText} variant="warn" />
          <StatCard label="Alerts Today" value={stats.alerts_today} icon={AlertTriangle}
            variant={stats.critical_alerts > 0 ? 'danger' : 'warn'}
            sub={stats.critical_alerts > 0 ? `${stats.critical_alerts} CRITICAL` : 'All acknowledged'} />
          <StatCard label="Intel Events Today" value={stats.events_today} icon={Activity} />
          <StatCard label="Cameras Online"
            value={`${stats.camera_nodes_online}/${stats.camera_nodes_total}`}
            icon={Radio}
            variant={stats.camera_nodes_online < stats.camera_nodes_total ? 'warn' : 'ok'}
            sub={stats.camera_nodes_online < stats.camera_nodes_total ? `${stats.camera_nodes_total - stats.camera_nodes_online} offline` : 'All nodes healthy'} />
          <StatCard label="SIEM Pending" value={pendingSiem} icon={Shield}
            variant={pendingSiem > 0 ? 'danger' : 'ok'}
            sub={`${criticalSiem} critical rule${criticalSiem !== 1 ? 's' : ''}`} />
        </div>
      ) : (
        <p className="text-sm text-slate-500 py-4">Could not load statistics.</p>
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-niss/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Intelligence by Source</h2>
          {sourceData.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No intelligence events recorded</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                  label={({ name, percent }: { name: string; percent: number }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-niss/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Intelligence Events — Last 7 Days</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No events in the last 7 days</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="events" fill="#7C3AED" radius={[3, 3, 0, 0]} name="Events" />
                <Bar dataKey="alerts" fill="#DC2626" radius={[3, 3, 0, 0]} name="Alerts" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Live alerts + International partners */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Live Alerts</h2>
          <AlertFeed limit={5} />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">International Partners</h2>
          {partners.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No partner records found</p>
          ) : (
            <div className="space-y-3">
              {partners.map((p, i) => (
                <div key={i}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{String(p.country_name ?? p.country ?? '—')}</p>
                    <p className="text-xs text-slate-500">MOU expires {String(p.mou_expires ?? '—')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-green-400">{String(p.status ?? 'ACTIVE')}</span>
                    <p className="text-[11px] text-slate-500">{String(p.recent_queries ?? 0)} queries</p>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-blue-900 bg-blue-950/20 px-4 py-2.5 text-xs text-blue-400">
                <Globe className="inline h-3 w-3 mr-1" />
                Interpol I-24/7 feed active
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SIEM events */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">SIEM — Recent Rule Triggers</h2>
          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded',
            pendingSiem > 0 ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400')}>
            {pendingSiem > 0 ? `${pendingSiem} PENDING` : 'ALL REVIEWED'}
          </span>
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-slate-800 animate-pulse" />
          ))}</div>
        ) : siem.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No SIEM events recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Rule</th>
                  <th className="py-2 text-left font-medium">Severity</th>
                  <th className="py-2 text-left font-medium w-64">Description</th>
                  <th className="py-2 text-left font-medium">Auto Action</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Triggered</th>
                </tr>
              </thead>
              <tbody>
                {siem.map(ev => (
                  <tr key={ev.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="py-2.5 font-mono text-slate-300">{ev.rule_name}</td>
                    <td className="py-2.5">
                      <span className={clsx('font-bold', SEVERITY_COLOR[ev.severity] ?? 'text-slate-400')}>
                        {ev.severity}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400 max-w-xs truncate pr-4">{ev.description}</td>
                    <td className="py-2.5 text-slate-500 font-mono text-[10px]">{ev.auto_action ?? '—'}</td>
                    <td className="py-2.5">
                      {ev.reviewed ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle className="h-3 w-3" /> Reviewed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400 font-semibold">
                          <Clock className="h-3 w-3" /> PENDING
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-500 whitespace-nowrap">
                      {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent intel events */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-200">Recent Intelligence Events</h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-slate-800 animate-pulse" />
          ))}</div>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No intelligence events recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500">
                  <th className="py-2 text-left font-medium">Source</th>
                  <th className="py-2 text-left font-medium">Subject</th>
                  <th className="py-2 text-left font-medium">Location</th>
                  <th className="py-2 text-left font-medium">Record Found</th>
                  <th className="py-2 text-left font-medium">Confidence</th>
                  <th className="py-2 text-left font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map(ev => (
                  <tr key={ev.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="py-2.5"><SourceTagBadge tag={ev.source_tag} /></td>
                    <td className="py-2.5 text-slate-300 font-medium">
                      {ev.suspect_name ?? ev.ims_reference ?? 'Unknown'}
                    </td>
                    <td className="py-2.5 text-slate-500 max-w-[180px] truncate">
                      {ev.location_description ?? ev.camera_node_id ?? '—'}
                    </td>
                    <td className="py-2.5">
                      {ev.criminal_record_found
                        ? <span className="flex items-center gap-1 text-red-400 font-bold"><XCircle className="h-3 w-3" /> YES</span>
                        : <span className="text-green-400">Clear</span>
                      }
                    </td>
                    <td className="py-2.5 text-slate-400">
                      {ev.confidence_score != null ? `${(ev.confidence_score * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 text-slate-500 whitespace-nowrap">
                      {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Emergency lockdown */}
      <div className="rounded-xl border border-red-900 bg-red-950/20 p-5">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-300">Emergency Lockdown — Dual Director Authorization</p>
            <p className="text-xs text-red-400/80 mt-1">
              Activating lockdown immediately revokes all non-NISS sessions. Both NISS Directors must
              authorize. This action is irreversible until manually lifted and is permanently recorded
              in the immutable audit log.
            </p>
            <div className="mt-3 flex items-center gap-3">
              {['NISS_DIRECTOR'].includes(user?.role ?? '') ? (
                <button
                  onClick={() => router.push('/niss/lockdown')}
                  className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 transition"
                >
                  Initiate Lockdown
                </button>
              ) : (
                <span className="text-xs text-red-400/60 italic">
                  Restricted to NISS Directors only
                </span>
              )}
              <span className="text-xs text-red-400/50">Requires second Director UUID confirmation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
