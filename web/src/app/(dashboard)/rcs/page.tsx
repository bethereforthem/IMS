'use client'
import { useState, useEffect } from 'react'
import { statsApi, correctionsApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Users, AlertTriangle, FileText, Shield, Building, Calendar, Clock } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats } from '@/types'
import { DAM_STATS, DAM_CORRECTIONS, DAM_ALERTS, DAM_INTAKE_RELEASES } from '@/lib/dam'

const THREAT_LABEL: Record<number, string> = { 1: 'MINIMAL', 2: 'LOW', 3: 'MEDIUM', 4: 'HIGH', 5: 'CRITICAL' }
const THREAT_COLOR: Record<number, string> = {
  1: 'text-green-400 bg-green-950',
  2: 'text-yellow-400 bg-yellow-950',
  3: 'text-amber-400 bg-amber-950',
  4: 'text-orange-400 bg-orange-950',
  5: 'text-red-400 bg-red-950',
}

const RFID_EVENTS = [
  { id: 'r1', time: '2026-06-29T12:30:00Z', inmate: 'Christine Uwimana', gate: 'B-Block Gate 2', event: 'SCHEDULED', type: 'MOVEMENT' },
  { id: 'r2', time: '2026-06-29T10:00:00Z', inmate: 'Pierre Nsengiyumva', gate: 'Yard Gate A', event: 'SCHEDULED', type: 'MOVEMENT' },
  { id: 'r3', time: '2026-06-29T09:15:00Z', gate: 'Main Entry', event: 'VISITOR_ENTRY', type: 'VISITOR', visitor: 'Authorised Legal Counsel' },
  { id: 'r4', time: '2026-06-29T07:45:00Z', inmate: 'Fidele Hakizimana', gate: 'C-Block Gate 1', event: 'SCHEDULED', type: 'MOVEMENT' },
  { id: 'r5', time: '2026-06-28T18:00:00Z', gate: 'Main Entry', event: 'VISITOR_EXIT', type: 'VISITOR', visitor: 'Family Visit' },
]

export default function RCSCustody() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats>(DAM_STATS)
  const [corrections, setCorrections] = useState(DAM_CORRECTIONS)

  useEffect(() => {
    Promise.all([
      statsApi.getDashboard(),
      correctionsApi.list({ limit: 50 }),
    ]).then(([s, c]) => {
      if (s.data) setStats(s.data)
      if (c.data?.records?.length) setCorrections(c.data.records as typeof DAM_CORRECTIONS)
    }).catch(() => {})
  }, [])

  const preTrialCount = corrections.filter(c => c.status === 'PRE_TRIAL').length
  const sentencedCount = corrections.filter(c => c.status === 'SENTENCED').length
  const upcomingReviews = corrections.filter(c => {
    const reviewDate = new Date(c.next_review)
    const diffDays = Math.ceil((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays <= 14
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Custody Overview</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')} · RCS</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          Custody Management
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="In Custody" value={corrections.length} icon={Shield} variant="warn"
          sub={`${preTrialCount} pre-trial · ${sentencedCount} sentenced`} />
        <StatCard label="Alerts Today" value={stats.alerts_today} icon={AlertTriangle}
          variant={stats.critical_alerts > 0 ? 'danger' : 'ok'} />
        <StatCard label="Upcoming Reviews" value={upcomingReviews.length} icon={Calendar}
          variant={upcomingReviews.length > 0 ? 'warn' : 'ok'}
          sub="Within 14 days" />
        <StatCard label="Active Warrants" value={stats.active_warrants} icon={FileText} />
      </div>

      {/* Inmates + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-rcs/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Suspects in Custody</h2>
            <span className="text-xs text-slate-500">{corrections.length} inmates</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {corrections.map(c => (
              <div key={c.id}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3">
                <Shield className={clsx('h-4 w-4 shrink-0',
                  c.threat_level >= 4 ? 'text-red-400' :
                  c.threat_level === 3 ? 'text-amber-400' : 'text-green-400')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{c.ims_reference}</span>
                    <span className="text-[10px] text-slate-500">·</span>
                    <span className="text-[10px] text-slate-500">{c.facility} · {c.cell_block}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded block text-center',
                    c.status === 'PRE_TRIAL' ? 'text-blue-400 bg-blue-950' : 'text-purple-400 bg-purple-950'
                  )}>
                    {c.status.replace('_', ' ')}
                  </span>
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded block text-center',
                    THREAT_COLOR[c.threat_level] ?? 'text-slate-400 bg-slate-800'
                  )}>
                    {THREAT_LABEL[c.threat_level]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Alerts</h2>
          <AlertFeed limit={5} initialAlerts={DAM_ALERTS.filter(a => ['MEDIUM', 'LOW'].includes(a.severity))} />
        </div>
      </div>

      {/* Intake / release chart + upcoming reviews */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rcs/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Monthly Intake &amp; Releases</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={DAM_INTAKE_RELEASES} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="intake" fill="#B45309" radius={[3, 3, 0, 0]} name="Intake" />
              <Bar dataKey="releases" fill="#16A34A" radius={[3, 3, 0, 0]} name="Releases" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming reviews */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-rcs" />
            <h2 className="text-sm font-semibold text-slate-200">Upcoming Case Reviews</h2>
          </div>
          <div className="space-y-2">
            {corrections.map(c => {
              const reviewDate = new Date(c.next_review)
              const diffDays = Math.ceil((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              return (
                <div key={c.id}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs',
                    diffDays <= 7
                      ? 'border-amber-900/40 bg-amber-950/10'
                      : 'border-slate-800 bg-slate-800/40'
                  )}>
                  <Clock className={clsx('h-3.5 w-3.5 shrink-0',
                    diffDays <= 7 ? 'text-amber-400' : 'text-slate-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-medium truncate">{c.full_name}</p>
                    <p className="text-slate-500 text-[10px]">{c.status.replace('_', ' ')} · {c.facility}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={clsx('font-bold',
                      diffDays <= 7 ? 'text-amber-400' : 'text-slate-400')}>
                      {diffDays}d
                    </p>
                    <p className="text-[10px] text-slate-500">{format(reviewDate, 'MMM d')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* RFID Gate Events */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building className="h-4 w-4 text-rcs" />
          <h2 className="text-sm font-semibold text-slate-200">RFID Gate Events</h2>
          <span className="text-xs text-slate-500 ml-auto">Smart Gate System · IoT Layer</span>
        </div>
        <div className="space-y-2">
          {RFID_EVENTS.map(ev => (
            <div key={ev.id}
              className="flex items-center gap-3 text-xs border-b border-slate-800/50 pb-2">
              <div className={clsx('h-2 w-2 rounded-full shrink-0',
                ev.type === 'MOVEMENT' ? 'bg-blue-400' : 'bg-green-400')} />
              <div className="flex-1 min-w-0">
                <span className="text-slate-200 font-medium">
                  {ev.type === 'MOVEMENT' ? ev.inmate : ev.visitor}
                </span>
                <span className="text-slate-500 ml-2">{ev.gate}</span>
              </div>
              <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                ev.event === 'SCHEDULED' ? 'text-blue-400 bg-blue-950' :
                ev.event === 'VISITOR_ENTRY' ? 'text-green-400 bg-green-950' :
                'text-slate-400 bg-slate-800')}>
                {ev.event.replace('_', ' ')}
              </span>
              <span className="text-slate-500 shrink-0 whitespace-nowrap">
                {formatDistanceToNow(new Date(ev.time), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Escape protocol */}
      <div className="rounded-xl border border-amber-900 bg-amber-950/20 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-300">Escape Reporting Protocol</p>
            <p className="text-xs text-amber-400/80 mt-1">
              Any escape must be immediately reported via the mobile app or backend API.
              An escape event auto-generates CRITICAL alerts to RNP, NISS, and RDF and triggers
              a cross-institutional location intelligence request. RFID wristband absence at evening
              count gate automatically triggers the escape protocol — no manual headcount required.
              Contact your Superintendent for dual authorization if manually initiating.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-400/60">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Auto-escape detection: ACTIVE
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-400/60">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                RFID monitoring: ACTIVE
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
