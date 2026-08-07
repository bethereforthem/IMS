'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { statsApi, correctionsApi, apiErrorMessage } from '@/lib/api'
import { StatCard } from '@/components/shared/StatCard'
import { AlertFeed } from '@/components/shared/AlertFeed'
import { AddCorrectionModal } from '@/components/shared/AddCorrectionModal'
import { InmateDetailModal } from '@/components/shared/InmateDetailModal'
import { generateCustodyPdf } from '@/lib/custody-pdf'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import {
  Users, AlertTriangle, Shield, Calendar, Clock, Plus, Eye, Download, Loader2,
  Search, DoorOpen, ArrowRightLeft, RefreshCw, Building2,
} from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { DashboardStats, CustodyStats } from '@/types'

const THREAT_LABEL: Record<number, string> = { 1: 'MINIMAL', 2: 'LOW', 3: 'MEDIUM', 4: 'HIGH', 5: 'CRITICAL' }
const THREAT_COLOR: Record<number, string> = {
  1: 'text-green-400 bg-green-950',
  2: 'text-yellow-400 bg-yellow-950',
  3: 'text-amber-400 bg-amber-950',
  4: 'text-orange-400 bg-orange-950',
  5: 'text-red-400 bg-red-950',
}
const STATUS_COLOR: Record<string, string> = {
  PRE_TRIAL:   'text-blue-400 bg-blue-950',
  SENTENCED:   'text-purple-400 bg-purple-950',
  RELEASED:    'text-slate-400 bg-slate-800',
  TRANSFERRED: 'text-cyan-400 bg-cyan-950',
  ESCAPED:     'text-red-400 bg-red-950',
  DECEASED:    'text-slate-400 bg-slate-800',
}

const IN_CUSTODY_STATUSES = 'PRE_TRIAL,SENTENCED'
const ROSTER_PAGE_SIZE = 50

type CorrectionRecord = {
  id: string
  suspect_id: string
  full_name?: string | null
  ims_reference?: string | null
  facility?: string | null
  facility_name?: string | null
  cell_block?: string | null
  status?: string | null
  custody_status?: string | null
  intake_date?: string | null
  sentence_years?: number | null
  next_review?: string | null
  threat_level?: number | null
}

function SkeletonCard() {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
}

export default function RCSCustody() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [custody, setCustody] = useState<CustodyStats | null>(null)
  const [roster, setRoster] = useState<CorrectionRecord[]>([])
  const [rosterTotal, setRosterTotal] = useState(0)
  const [reviews, setReviews] = useState<CorrectionRecord[]>([])
  const [showAddInmate, setShowAddInmate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [inmateSearch, setInmateSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // The roster search runs on the server so it covers every record, not just
  // the page that happened to be loaded — debounced so typing is not a request
  // per keystroke.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [appliedSearch, setAppliedSearch] = useState('')

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setAppliedSearch(inmateSearch.trim()), 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [inmateSearch])

  const loadRoster = useCallback((q: string) => {
    setSearching(true)
    return correctionsApi
      .list({ custody_status: IN_CUSTODY_STATUSES, limit: ROSTER_PAGE_SIZE, q: q || undefined, sort: 'intake_date', order: 'desc' })
      .then(r => {
        setRoster((r.data?.records ?? []) as unknown as CorrectionRecord[])
        setRosterTotal(r.data?.total ?? 0)
      })
      .finally(() => setSearching(false))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      statsApi.getDashboard().catch(() => null),
      correctionsApi.stats(),
      correctionsApi.list({ custody_status: IN_CUSTODY_STATUSES, limit: ROSTER_PAGE_SIZE, sort: 'intake_date', order: 'desc' }),
      // Reviews are ordered by review date on the server, so the panel shows the
      // genuinely next reviews rather than the earliest among one page.
      correctionsApi.list({ custody_status: IN_CUSTODY_STATUSES, limit: 25, sort: 'next_review', order: 'asc' }),
    ])
      .then(([s, c, list, rev]) => {
        if (s?.data) setStats(s.data)
        if (c.data) setCustody(c.data)
        setRoster((list.data?.records ?? []) as unknown as CorrectionRecord[])
        setRosterTotal(list.data?.total ?? 0)
        setReviews((rev.data?.records ?? []) as unknown as CorrectionRecord[])
      })
      .catch(err => setError(apiErrorMessage(err, 'Could not load custody data.')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (loading) return
    loadRoster(appliedSearch).catch(() => {})
    // `loading` is deliberately excluded: this reacts to the search term only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, loadRoster])

  const canWrite = ['RCS_SUPERINTENDENT', 'RCS_OFFICER'].includes(user?.role ?? '')

  // Upcoming reviews inside the window the API reports, so the card and the
  // panel can never disagree about what "upcoming" means.
  const reviewWindow = custody?.review_window_days ?? 14
  const upcomingReviews = reviews
    .map(r => {
      const d = new Date(r.next_review ?? '')
      if (isNaN(d.getTime())) return null
      const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
      return { record: r, date: d, days }
    })
    .filter((x): x is { record: CorrectionRecord; date: Date; days: number } =>
      x !== null && x.days >= 0 && x.days <= reviewWindow)

  async function handleDownloadPdf(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setDownloadingId(id)
    setPdfError(null)
    try {
      const r = await correctionsApi.get(id)
      await generateCustodyPdf(r.data as Record<string, unknown>)
    } catch (err) {
      setPdfError(apiErrorMessage(err, 'PDF generation failed'))
      setTimeout(() => setPdfError(null), 5000)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {pdfError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">
          <span className="font-medium">PDF Error:</span> {pdfError}
          <button onClick={() => setPdfError(null)} className="ml-auto text-red-400 hover:text-red-200 text-xs">✕</button>
        </div>
      )}
      {showAddInmate && (
        <AddCorrectionModal
          onClose={() => setShowAddInmate(false)}
          onSuccess={() => { setShowAddInmate(false); load() }}
        />
      )}
      {selectedId && (
        <InmateDetailModal
          correctionId={selectedId}
          onClose={() => setSelectedId(null)}
          onSuccess={load}
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
          <button
            onClick={load}
            disabled={loading}
            title="Reload custody data"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition disabled:opacity-50"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
            Custody Management
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
        </div>
      )}

      {/* Population */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : custody ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Current Population" value={custody.in_custody} icon={Shield} variant="warn"
              sub={`${custody.pre_trial} pre-trial · ${custody.sentenced} sentenced`} />
            <StatCard label="Total Records" value={custody.total} icon={Users}
              sub={`${custody.released} released · ${custody.transferred} transferred`} />
            <StatCard label={`Reviews Due (${custody.review_window_days}d)`} value={custody.reviews_due} icon={Calendar}
              variant={custody.reviews_overdue > 0 ? 'danger' : custody.reviews_due > 0 ? 'warn' : 'ok'}
              sub={custody.reviews_overdue > 0 ? `${custody.reviews_overdue} overdue` : 'None overdue'} />
            <StatCard label="High Threat (≥4)" value={custody.high_threat} icon={AlertTriangle}
              variant={custody.high_threat > 0 ? 'danger' : 'ok'}
              sub={`${custody.escaped} escaped · ${custody.deceased} deceased`} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={`Admissions (${custody.recent_window_days}d)`} value={custody.admissions_recent} icon={DoorOpen} />
            <StatCard label={`Releases (${custody.recent_window_days}d)`} value={custody.releases_recent} icon={DoorOpen} />
            <StatCard label="Transfers" value={custody.transferred} icon={ArrowRightLeft} />
            <StatCard label="Alerts Today" value={stats?.alerts_today ?? 0} icon={AlertTriangle}
              variant={(stats?.critical_alerts ?? 0) > 0 ? 'danger' : 'ok'}
              sub={stats ? `${stats.critical_alerts} unread critical` : 'Alert feed unavailable'} />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500 py-4">Could not load custody statistics.</p>
      )}

      {/* Inmates + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-rcs/20 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-200 shrink-0">Inmates in Custody</h2>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                value={inmateSearch}
                onChange={e => setInmateSearch(e.target.value)}
                placeholder="Search by name or IMS ref…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
              />
              {searching && <Loader2 className="absolute right-2.5 top-2 h-3.5 w-3.5 text-slate-500 animate-spin" />}
            </div>
            <span className="text-xs text-slate-500 shrink-0">
              {roster.length} of {rosterTotal}
            </span>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-800 animate-pulse" />
            ))}</div>
          ) : roster.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500 mb-3">
                {appliedSearch ? `No inmates match "${appliedSearch}"` : 'No inmates in custody'}
              </p>
              {canWrite && !appliedSearch && (
                <button onClick={() => setShowAddInmate(true)}
                  className="flex items-center gap-1.5 mx-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition">
                  <Plus className="h-3.5 w-3.5" /> Record Intake
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {roster.map(c => {
                const threatLevel = c.threat_level ?? 1
                const custodyStatus = c.status ?? c.custody_status ?? '—'
                const facilityName = c.facility ?? c.facility_name ?? '—'
                const isDownloading = downloadingId === c.id
                return (
                  <div key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2.5 hover:bg-slate-800/70 transition">
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSelectedId(c.id)}
                        title="View full custody record"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition text-[10px] font-medium"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                      <button
                        onClick={e => handleDownloadPdf(e, c.id)}
                        disabled={isDownloading}
                        title="Download PDF"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-300 hover:text-white transition text-[10px] font-medium disabled:opacity-50"
                      >
                        {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        PDF
                      </button>
                    </div>
                    <div className="text-right shrink-0 space-y-1 hidden sm:block">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded block text-center',
                        STATUS_COLOR[String(custodyStatus)] ?? 'text-slate-400 bg-slate-800'
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
              {rosterTotal > roster.length && (
                <p className="text-[10px] text-slate-500 text-center pt-1">
                  Showing the {roster.length} most recent intakes — see Inmates for the full roster.
                </p>
              )}
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
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Intake vs Releases (last 6 months)</h2>
          {!custody || custody.total === 0 ? (
            <p className="text-sm text-slate-500 py-16 text-center">No custody records</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={custody.monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Bar dataKey="intake" fill="#B45309" radius={[3, 3, 0, 0]} name="Intake" />
                <Bar dataKey="releases" fill="#0891b2" radius={[3, 3, 0, 0]} name="Releases" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Upcoming reviews */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-rcs" />
            <h2 className="text-sm font-semibold text-slate-200">
              Upcoming Case Reviews (next {reviewWindow} days)
            </h2>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-800 animate-pulse" />
            ))}</div>
          ) : upcomingReviews.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No reviews scheduled in the next {reviewWindow} days
              {custody && custody.reviews_overdue > 0 && ` · ${custody.reviews_overdue} overdue`}
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {upcomingReviews.map(({ record: c, date, days }) => (
                <button key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={clsx(
                    'w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs transition',
                    days <= 7
                      ? 'border-amber-900/40 bg-amber-950/10 hover:bg-amber-950/20'
                      : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70'
                  )}>
                  <Clock className={clsx('h-3.5 w-3.5 shrink-0', days <= 7 ? 'text-amber-400' : 'text-slate-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-medium truncate">{c.full_name ?? 'Unknown'}</p>
                    <p className="text-slate-500 text-[10px]">
                      {String(c.status ?? c.custody_status ?? '—').replace('_', ' ')} · {c.facility ?? c.facility_name ?? '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={clsx('font-bold', days <= 7 ? 'text-amber-400' : 'text-slate-400')}>{days}d</p>
                    <p className="text-[10px] text-slate-500">{format(date, 'MMM d')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Facility statistics */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-4 w-4 text-rcs" />
          <h2 className="text-sm font-semibold text-slate-200">Facility Statistics</h2>
        </div>
        {loading ? (
          <div className="h-24 rounded-lg bg-slate-800 animate-pulse" />
        ) : !custody || custody.by_facility.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No facility data</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[420px]">
                <thead>
                  <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                    <th className="pb-2 pr-4 font-semibold">Facility</th>
                    <th className="pb-2 pr-4 font-semibold text-right">In Custody</th>
                    <th className="pb-2 pr-4 font-semibold text-right">Pre-Trial</th>
                    <th className="pb-2 pr-4 font-semibold text-right">Sentenced</th>
                    <th className="pb-2 font-semibold text-right">All Records</th>
                  </tr>
                </thead>
                <tbody>
                  {custody.by_facility.map(f => (
                    <tr key={f.facility_name} className="border-b border-slate-800/50 text-xs">
                      <td className="py-2 pr-4 text-slate-200">{f.facility_name}</td>
                      <td className="py-2 pr-4 text-right text-white font-medium">{f.in_custody}</td>
                      <td className="py-2 pr-4 text-right text-blue-400">{f.pre_trial}</td>
                      <td className="py-2 pr-4 text-right text-purple-400">{f.sentenced}</td>
                      <td className="py-2 text-right text-slate-400">{f.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-600 mt-3">
              Population is counted from custody records. Facility capacity and occupancy rate are
              not shown because the database holds no facility capacity table to compute them from.
            </p>
          </>
        )}
      </div>

      {/* Escape protocol */}
      <div className="rounded-xl border border-amber-900 bg-amber-950/20 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-300">Escape Reporting Protocol</p>
            <p className="text-xs text-amber-400/80 mt-1">
              Setting an inmate&apos;s custody status to ESCAPED records the escape and immediately
              raises a CRITICAL alert to RCS, RNP, NISS and RDF. Change the status from the custody
              record (Inmates → View → Custody &amp; Facility), or report it from the mobile app.
            </p>
            <p className="text-xs text-amber-400/60 mt-2">
              RFID wristband gate detection is not yet connected — escapes are reported by an officer
              until facility readers are integrated.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
