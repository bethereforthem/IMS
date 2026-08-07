'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { InmateDetailModal } from '@/components/shared/InmateDetailModal'
import { correctionsApi, apiErrorMessage } from '@/lib/api'
import { generateCustodyPdf } from '@/lib/custody-pdf'
import { format, differenceInDays } from 'date-fns'
import {
  FileText, Clock, Users, TrendingUp, Eye, Download, Loader2, Search,
  AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import type { CustodyStats } from '@/types'

const PAGE_SIZE = 25

const STATUS_CLS: Record<string, string> = {
  PRE_TRIAL:   'bg-blue-950 text-blue-400',
  SENTENCED:   'bg-purple-950 text-purple-400',
  RELEASED:    'bg-slate-800 text-slate-400',
  TRANSFERRED: 'bg-cyan-950 text-cyan-400',
  ESCAPED:     'bg-red-950 text-red-400',
  DECEASED:    'bg-slate-800 text-slate-500',
}

interface RecordRow {
  id: string
  full_name?: string | null
  ims_reference?: string | null
  facility?: string | null
  cell_block?: string | null
  status?: string | null
  intake_date?: string | null
  next_review?: string | null
  sentence_years?: number | null
  threat_level?: number | null
}

function threatDots(level: number | null | undefined) {
  if (level == null) return <span className="text-[10px] text-slate-600">unrated</span>
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            'h-2 w-2 rounded-full',
            i < level
              ? level >= 4 ? 'bg-red-500' : level === 3 ? 'bg-amber-500' : 'bg-green-500'
              : 'bg-slate-700'
          )}
        />
      ))}
    </div>
  )
}

export default function CorrectionsPage() {
  const [records, setRecords] = useState<RecordRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stats, setStats] = useState<CustodyStats | null>(null)
  const [reviews, setReviews] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setAppliedSearch(search.trim()); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const loadTable = useCallback(() => {
    setLoading(true)
    setError(null)
    correctionsApi
      .list({ page, page_size: PAGE_SIZE, q: appliedSearch || undefined, sort: 'created_at', order: 'desc' })
      .then(r => {
        setRecords((r.data?.records ?? []) as unknown as RecordRow[])
        setTotal(r.data?.total ?? 0)
      })
      .catch(err => {
        setError(apiErrorMessage(err, 'Could not load corrections records.'))
        setRecords([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, appliedSearch])

  const loadAside = useCallback(() => {
    correctionsApi.stats().then(r => { if (r.data) setStats(r.data) }).catch(() => {})
    correctionsApi
      .list({ custody_status: 'PRE_TRIAL,SENTENCED', limit: 25, sort: 'next_review', order: 'asc' })
      .then(r => setReviews((r.data?.records ?? []) as unknown as RecordRow[]))
      .catch(() => {})
  }, [])

  useEffect(() => { loadTable() }, [loadTable])
  useEffect(() => { loadAside() }, [loadAside])

  function reload() { loadTable(); loadAside() }

  async function handleDownloadPdf(id: string) {
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

  const today = new Date()
  const reviewWindow = stats?.review_window_days ?? 14
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const upcomingReviews = reviews
    .map(r => {
      const d = r.next_review ? new Date(r.next_review) : null
      if (!d || isNaN(d.getTime())) return null
      return { record: r, date: d, daysUntil: differenceInDays(d, today) }
    })
    .filter((x): x is { record: RecordRow; date: Date; daysUntil: number } =>
      x !== null && x.daysUntil >= 0 && x.daysUntil <= reviewWindow)

  return (
    <div className="space-y-6">
      {pdfError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">
          <span className="font-medium">PDF Error:</span> {pdfError}
          <button onClick={() => setPdfError(null)} className="ml-auto text-red-400 hover:text-red-200 text-xs">✕</button>
        </div>
      )}
      {selectedId && (
        <InmateDetailModal
          correctionId={selectedId}
          onClose={() => setSelectedId(null)}
          onSuccess={reload}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Corrections Records</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">Full correctional record detail view</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          RCS Secure
        </div>
      </div>

      {/* Stats — computed across every record, not the current page */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Records" value={stats?.total ?? '—'} icon={FileText} variant="default" sub="All corrections entries" />
        <StatCard label="Pre-Trial" value={stats?.pre_trial ?? '—'} icon={Clock} variant="warn" sub="Awaiting judgment" />
        <StatCard label="Sentenced" value={stats?.sentenced ?? '—'} icon={Users} variant="default" sub="Serving sentence" />
        <StatCard
          label="Avg Sentence"
          value={stats?.avg_sentence_years != null ? `${stats.avg_sentence_years} yrs` : '—'}
          icon={TrendingUp} variant="default" sub="Of sentenced records"
        />
      </div>

      {/* Records Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-sm font-semibold text-white shrink-0">All Records</h2>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or IMS ref…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
            />
          </div>
          <p className="text-xs text-slate-500 shrink-0">
            {loading ? 'Loading…' : `${records.length} of ${total} records`}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300 mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={loadTable} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead>
              <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
                <th className="pb-2 pr-4 font-semibold">IMS Ref</th>
                <th className="pb-2 pr-4 font-semibold">Name</th>
                <th className="pb-2 pr-4 font-semibold">Facility</th>
                <th className="pb-2 pr-4 font-semibold">Cell</th>
                <th className="pb-2 pr-4 font-semibold">Intake Date</th>
                <th className="pb-2 pr-4 font-semibold">Status</th>
                <th className="pb-2 pr-4 font-semibold">Sentence</th>
                <th className="pb-2 pr-4 font-semibold">Threat</th>
                <th className="pb-2 pr-4 font-semibold">Next Review</th>
                <th className="pb-2 pr-4 font-semibold">Days</th>
                <th className="pb-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td colSpan={11} className="py-3"><div className="h-5 rounded bg-slate-800 animate-pulse" /></td>
                </tr>
              ))}
              {!loading && !error && records.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-sm text-slate-500">
                    {appliedSearch ? `No records match "${appliedSearch}"` : 'No corrections records found.'}
                  </td>
                </tr>
              )}
              {!loading && records.map(r => {
                const reviewDate  = r.next_review ? new Date(r.next_review) : null
                const intakeDate  = r.intake_date ? new Date(r.intake_date) : null
                const validReview = reviewDate && !isNaN(reviewDate.getTime())
                const validIntake = intakeDate && !isNaN(intakeDate.getTime())
                const daysUntil   = validReview ? differenceInDays(reviewDate!, today) : null
                const overdue     = daysUntil !== null && daysUntil < 0
                const reviewSoon  = daysUntil !== null && daysUntil >= 0 && daysUntil <= reviewWindow
                const isDownloading = downloadingId === r.id
                return (
                  <tr key={r.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="py-2.5 pr-4 font-mono text-rcs">{r.ims_reference ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-white font-medium">{r.full_name ?? 'Unknown'}</td>
                    <td className="py-2.5 pr-4 text-slate-300">{r.facility ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{r.cell_block ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {validIntake ? format(intakeDate!, 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        STATUS_CLS[String(r.status ?? '')] ?? 'bg-slate-800 text-slate-400'
                      )}>
                        {String(r.status ?? '—').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {r.sentence_years ? `${r.sentence_years} yrs` : '—'}
                    </td>
                    <td className="py-2.5 pr-4">{threatDots(r.threat_level)}</td>
                    <td className={clsx('py-2.5 pr-4 font-medium',
                      overdue ? 'text-red-400' : reviewSoon ? 'text-amber-400' : 'text-slate-300')}>
                      {validReview ? format(reviewDate!, 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className={clsx('py-2.5 pr-4 font-medium',
                      overdue ? 'text-red-400' : reviewSoon ? 'text-amber-300/70' : 'text-slate-400')}>
                      {daysUntil === null ? '—' : overdue ? `${Math.abs(daysUntil)}d late` : `${daysUntil}d`}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setSelectedId(r.id)}
                          title="View full record"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition text-[10px] font-medium"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(r.id)}
                          disabled={isDownloading}
                          title="Download PDF custody record"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-900/60 hover:bg-amber-800 text-amber-300 hover:text-white transition text-[10px] font-medium disabled:opacity-50"
                        >
                          {isDownloading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Download className="h-3 w-3" />}
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
            <button
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Upcoming Reviews */}
      {upcomingReviews.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Upcoming Reviews (within {reviewWindow} days)
            {stats && stats.reviews_overdue > 0 && (
              <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-950 text-red-400">
                {stats.reviews_overdue} overdue
              </span>
            )}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingReviews.map(({ record: r, date, daysUntil }) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={clsx(
                  'text-left rounded-lg border p-4 transition-colors',
                  daysUntil <= 7
                    ? 'border-amber-700/50 bg-amber-950/20 hover:bg-amber-950/30'
                    : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/60'
                )}
              >
                <p className="text-sm font-bold text-white">{r.full_name ?? 'Unknown'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{r.facility ?? '—'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    STATUS_CLS[String(r.status ?? '')] ?? 'bg-slate-800 text-slate-400'
                  )}>
                    {String(r.status ?? '—').replace('_', ' ')}
                  </span>
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-slate-500">Review: </span>
                  <span className={clsx('font-medium', daysUntil <= 7 ? 'text-amber-400' : 'text-slate-300')}>
                    {format(date, 'MMM dd, yyyy')}
                  </span>
                  <span className={clsx('ml-2 text-[10px]', daysUntil <= 7 ? 'text-amber-500' : 'text-slate-500')}>
                    ({daysUntil} days{daysUntil <= 7 ? ' ⚠' : ''})
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Intake vs Release Chart — from GET /corrections/stats */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Intake vs Releases — Last 6 Months</h2>
        {!stats ? (
          <div className="h-[260px] rounded-lg bg-slate-800/50 animate-pulse" />
        ) : stats.total === 0 ? (
          <p className="text-sm text-slate-500 py-20 text-center">No corrections records to chart.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="intake" name="Intake" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="releases" name="Releases" fill="#0891b2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
