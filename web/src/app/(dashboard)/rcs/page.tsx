'use client'
import { useState, useEffect, useCallback } from 'react'
import { statsApi, correctionsApi } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { AddCorrectionModal } from '@/components/shared/AddCorrectionModal'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Users, AlertTriangle, FileText, Shield, Building, Calendar, Clock, Plus } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats } from '@/types'

const THREAT_LABEL: Record<number, string> = { 1: 'MINIMAL', 2: 'LOW', 3: 'MEDIUM', 4: 'HIGH', 5: 'CRITICAL' }
const THREAT_COLOR: Record<number, string> = {
  1: 'text-green-400 bg-green-950',
  2: 'text-yellow-400 bg-yellow-950',
  3: 'text-amber-400 bg-amber-950',
  4: 'text-orange-400 bg-orange-950',
  5: 'text-red-400 bg-red-950',
}

type CorrectionRecord = {
  id: string
  suspect_id: string
  full_name?: string
  ims_reference?: string
  facility?: string
  facility_name?: string
  cell_block?: string
  status?: string
  custody_status?: string
  intake_date?: string
  sentence_years?: number
  next_review?: string
  next_review_date?: string
  threat_level?: number
}

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export default function RCSCustody() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [corrections, setCorrections] = useState<CorrectionRecord[]>([])
  const [showAddInmate, setShowAddInmate] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      statsApi.getDashboard(),
      correctionsApi.list({ limit: 50 }),
    ]).then(([s, c]) => {
      if (s.data) setStats(s.data)
      if (c.data?.records?.length) setCorrections(c.data.records as CorrectionRecord[])
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const preTrialCount = corrections.filter(c =>
    (c.status ?? c.custody_status) === 'PRE_TRIAL'
  ).length
  const sentencedCount = corrections.filter(c =>
    (c.status ?? c.custody_status) === 'SENTENCED'
  ).length
  const upcomingReviews = corrections.filter(c => {
    const reviewDate = new Date(c.next_review ?? c.next_review_date ?? '')
    if (isNaN(reviewDate.getTime())) return false
    const diffDays = Math.ceil((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 14
  })

  // Compute monthly intake/releases from corrections records
  const intakeData = (() => {
    const months: Record<string, { month: string; intake: number; releases: number }> = {}
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toLocaleDateString('en-RW', { month: 'short' })
      months[key] = { month: key, intake: 0, releases: 0 }
    }
    corrections.forEach(c => {
      if (c.intake_date) {
        const d = new Date(c.intake_date)
        const key = d.toLocaleDateString('en-RW', { month: 'short' })
        if (months[key]) months[key].intake++
      }
    })
    return Object.values(months)
  })()

  const canWrite = ['RCS_SUPERINTENDENT', 'RCS_OFFICER'].includes(user?.role ?? '')

  return (
    <div className="space-y-6">
      {showAddInmate && (
        <AddCorrectionModal
          onClose={() => setShowAddInmate(false)}
          onSuccess={() => { setShowAddInmate(false); load() }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Custody Overview</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')} · RCS</p>
        </div>
        <div className="flex items-center gap-3">
          {canWrite && (
            <button
              onClick={() => setShowAddInmate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Intake Inmate
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
            Custody Management
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
          <StatCard label="In Custody" value={corrections.length} icon={Shield} variant="warn"
            sub={`${preTrialCount} pre-trial · ${sentencedCount} sentenced`} />
          <StatCard label="Alerts Today" value={stats.alerts_today} icon={AlertTriangle}
            variant={stats.critical_alerts > 0 ? 'danger' : 'ok'} />
          <StatCard label="Upcoming Reviews" value={upcomingReviews.length} icon={Calendar}
            variant={upcomingReviews.length > 0 ? 'warn' : 'ok'}
            sub="Within 14 days" />
          <StatCard label="Active Warrants" value={stats.active_warrants} icon={FileText} />
        </div>
      ) : (
        <p className="text-sm text-slate-500 py-4">Could not load statistics.</p>
      )}

      {/* Inmates + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-rcs/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Suspects in Custody</h2>
            <span className="text-xs text-slate-500">{corrections.length} inmates</span>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-800 animate-pulse" />
            ))}</div>
          ) : corrections.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500 mb-3">No inmates in custody</p>
              {canWrite && (
                <button onClick={() => setShowAddInmate(true)}
                  className="flex items-center gap-1.5 mx-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition">
                  <Plus className="h-3.5 w-3.5" /> Record Intake
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {corrections.map(c => {
                const threatLevel = c.threat_level ?? 1
                const custodyStatus = c.status ?? c.custody_status ?? '—'
                const facilityName = c.facility ?? c.facility_name ?? '—'
                return (
                  <div key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3">
                    <Shield className={clsx('h-4 w-4 shrink-0',
                      threatLevel >= 4 ? 'text-red-400' :
                      threatLevel === 3 ? 'text-amber-400' : 'text-green-400')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.full_name ?? 'Unknown'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{c.ims_reference ?? '—'}</span>
                        {facilityName !== '—' && (
                          <>
                            <span className="text-[10px] text-slate-500">·</span>
                            <span className="text-[10px] text-slate-500">{facilityName}{c.cell_block ? ` · ${c.cell_block}` : ''}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded block text-center',
                        custodyStatus === 'PRE_TRIAL' ? 'text-blue-400 bg-blue-950' : 'text-purple-400 bg-purple-950'
                      )}>
                        {String(custodyStatus).replace('_', ' ')}
                      </span>
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded block text-center',
                        THREAT_COLOR[threatLevel] ?? 'text-slate-400 bg-slate-800'
                      )}>
                        {THREAT_LABEL[threatLevel] ?? 'UNKNOWN'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Alerts</h2>
          <AlertFeed limit={5} />
        </div>
      </div>

      {/* Intake chart + upcoming reviews */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-rcs/20 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Monthly Intake (last 6 months)</h2>
          {corrections.length === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No custody records</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={intakeData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="intake" fill="#B45309" radius={[3, 3, 0, 0]} name="Intake" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Upcoming reviews */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-rcs" />
            <h2 className="text-sm font-semibold text-slate-200">Upcoming Case Reviews</h2>
          </div>
          {corrections.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">No upcoming reviews</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {corrections
                .filter(c => c.next_review ?? c.next_review_date)
                .sort((a, b) => {
                  const da = new Date(a.next_review ?? a.next_review_date ?? '').getTime()
                  const db = new Date(b.next_review ?? b.next_review_date ?? '').getTime()
                  return da - db
                })
                .map(c => {
                  const reviewDate = new Date(c.next_review ?? c.next_review_date ?? '')
                  if (isNaN(reviewDate.getTime())) return null
                  const diffDays = Math.ceil((reviewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  const custodyStatus = c.status ?? c.custody_status ?? '—'
                  const facilityName = c.facility ?? c.facility_name ?? '—'
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
                        <p className="text-slate-200 font-medium truncate">{c.full_name ?? 'Unknown'}</p>
                        <p className="text-slate-500 text-[10px]">{String(custodyStatus).replace('_', ' ')} · {facilityName}</p>
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
          )}
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
              count gate automatically triggers the escape protocol.
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
