'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { InmateDetailModal } from '@/components/shared/InmateDetailModal'
import { correctionsApi, apiErrorMessage } from '@/lib/api'
import { generateCustodyPdf } from '@/lib/custody-pdf'
import { format, differenceInDays } from 'date-fns'
import { Shield, Users, Clock, AlertTriangle, Download, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import type { CustodyStats } from '@/types'

type StatusFilter = 'ALL' | 'PRE_TRIAL' | 'SENTENCED' | 'RELEASED' | 'TRANSFERRED' | 'ESCAPED' | 'DECEASED'
type ThreatFilter = 'ALL' | '1' | '2' | '3' | '4' | '5'
type SortField = 'intake_date' | 'next_review' | 'threat_level' | 'facility_name'

const STATUS_FILTERS: StatusFilter[] = [
  'ALL', 'PRE_TRIAL', 'SENTENCED', 'RELEASED', 'TRANSFERRED', 'ESCAPED', 'DECEASED',
]
const SORTS: { field: SortField; label: string }[] = [
  { field: 'intake_date',   label: 'Intake' },
  { field: 'next_review',   label: 'Review' },
  { field: 'threat_level',  label: 'Threat' },
  { field: 'facility_name', label: 'Facility' },
]
const PAGE_SIZE = 25

const THREAT_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: 'MINIMAL', cls: 'bg-green-950 text-green-400' },
  2: { label: 'LOW',     cls: 'bg-yellow-950 text-yellow-400' },
  3: { label: 'MEDIUM',  cls: 'bg-amber-950 text-amber-400' },
  4: { label: 'HIGH',    cls: 'bg-orange-950 text-orange-400' },
  5: { label: 'CRITICAL',cls: 'bg-red-950 text-red-400' },
}
const STATUS_CLS: Record<string, string> = {
  PRE_TRIAL:   'bg-blue-950 text-blue-400',
  SENTENCED:   'bg-purple-950 text-purple-400',
  RELEASED:    'bg-slate-800 text-slate-400',
  TRANSFERRED: 'bg-cyan-950 text-cyan-400',
  ESCAPED:     'bg-red-950 text-red-400',
  DECEASED:    'bg-slate-800 text-slate-500',
}

interface InmateRow {
  id: string
  full_name?: string | null
  ims_reference?: string | null
  facility?: string | null
  cell_block?: string | null
  status?: string | null
  threat_level?: number | null
  intake_date?: string | null
  next_review?: string | null
  sentence_years?: number | null
}

export default function InmatesPage() {
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [facility, setFacility] = useState('ALL')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [threat, setThreat] = useState<ThreatFilter>('ALL')
  const [sort, setSort] = useState<SortField>('intake_date')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<InmateRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<CustodyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // Filtering, searching, sorting and paging all happen in the database. The
  // roster used to be one 100-row fetch narrowed in the browser, so every stat
  // card and every filter silently stopped being true past 100 records — and
  // the facility filter offered two hardcoded names that matched 5 of 36 rows.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setAppliedSearch(search.trim()); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const loadStats = useCallback(() => {
    correctionsApi.stats()
      .then(r => { if (r.data) setStats(r.data) })
      .catch(() => {})
  }, [])

  const loadRows = useCallback(() => {
    setLoading(true)
    setError(null)
    correctionsApi.list({
      page,
      page_size: PAGE_SIZE,
      q: appliedSearch || undefined,
      custody_status: status === 'ALL' ? undefined : status,
      facility_name: facility === 'ALL' ? undefined : facility,
      threat_level: threat === 'ALL' ? undefined : Number(threat),
      sort,
      order,
    })
      .then(r => {
        setRows((r.data?.records ?? []) as unknown as InmateRow[])
        setTotal(r.data?.total ?? 0)
      })
      .catch(err => {
        setError(apiErrorMessage(err, 'Could not load the inmate roster.'))
        setRows([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, appliedSearch, status, facility, threat, sort, order])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadRows() }, [loadRows])

  function reload() { loadRows(); loadStats() }

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

  function pick<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const facilityOptions = ['ALL', ...(stats?.by_facility.map(f => f.facility_name) ?? [])]
  const today = new Date()

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
            <h1 className="text-xl font-bold text-white">Inmate Roster</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">Rwanda Correctional Service — Custody Records</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          RCS Secure
        </div>
      </div>

      {/* Stats — whole-table counts, independent of the page being viewed */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="In Custody" value={stats?.in_custody ?? '—'} icon={Users} variant="default" sub="All facilities" />
        <StatCard label="Pre-Trial" value={stats?.pre_trial ?? '—'} icon={Clock} variant="warn" sub="Awaiting hearing" />
        <StatCard label="Sentenced" value={stats?.sentenced ?? '—'} icon={Shield} variant="default" sub="Convicted and serving" />
        <StatCard label="High Threat (≥4)" value={stats?.high_threat ?? '—'} icon={AlertTriangle} variant="danger" sub="Elevated risk inmates" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or IMS reference…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
            />
          </div>
          <select
            value={facility}
            onChange={e => pick(setFacility)(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-rcs/50"
          >
            {facilityOptions.map(f => (
              <option key={f} value={f}>{f === 'ALL' ? 'All facilities' : f}</option>
            ))}
          </select>
          <div className="flex gap-1 items-center">
            <span className="text-xs text-slate-500 px-1">Sort:</span>
            {SORTS.map(s => (
              <button
                key={s.field}
                onClick={() => {
                  if (sort === s.field) setOrder(o => (o === 'asc' ? 'desc' : 'asc'))
                  else { setSort(s.field); setOrder('desc') }
                  setPage(1)
                }}
                className={clsx(
                  'px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  sort === s.field ? 'bg-rcs text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                )}
              >
                {s.label}{sort === s.field ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => pick(setStatus)(f)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  status === f ? 'bg-rcs text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                )}
              >
                {f.replace('_', ' ')}
                {stats && f !== 'ALL' && (
                  <span className="ml-1.5 opacity-60">{stats.by_status[f] ?? 0}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            <span className="flex items-center text-xs text-slate-500 px-1">Threat:</span>
            {(['ALL', '1', '2', '3', '4', '5'] as ThreatFilter[]).map(f => (
              <button
                key={f}
                onClick={() => pick(setThreat)(f)}
                className={clsx(
                  'px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  threat === f ? 'bg-rcs text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                )}
              >
                {f}
                {stats && f !== 'ALL' && (
                  <span className="ml-1 opacity-60">{stats.by_threat[f] ?? 0}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {loading ? 'Loading…' : `Showing ${rows.length} of ${total} matching records`}
      </p>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={loadRows} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
        </div>
      )}

      {/* Inmate cards */}
      <div className="space-y-3">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No inmates match the current filters.
          </div>
        )}

        {!loading && rows.map(r => {
          const threatLevel = r.threat_level ?? 0
          const intakeDate  = r.intake_date ? new Date(r.intake_date) : null
          const reviewDate  = r.next_review ? new Date(r.next_review) : null
          const validIntake = intakeDate && !isNaN(intakeDate.getTime())
          const validReview = reviewDate && !isNaN(reviewDate.getTime())
          const intakeDays  = validIntake ? differenceInDays(today, intakeDate!) : null
          const reviewDays  = validReview ? differenceInDays(reviewDate!, today) : null
          const reviewSoon  = reviewDays !== null && reviewDays <= 7
          const reviewOverdue = reviewDays !== null && reviewDays < 0
          const threatInfo  = THREAT_LABEL[threatLevel]

          return (
            <div
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={clsx(
                'rounded-xl border p-5 transition-colors cursor-pointer',
                threatLevel >= 4
                  ? 'border-red-900/40 bg-red-950/10 hover:bg-red-950/20'
                  : threatLevel === 3
                  ? 'border-amber-900/30 bg-amber-950/5 hover:bg-amber-950/15'
                  : 'border-slate-800 bg-slate-900 hover:bg-slate-800/70'
              )}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Left — classification */}
                <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 sm:w-28 shrink-0">
                  <Shield className={clsx('h-6 w-6',
                    threatLevel >= 4 ? 'text-red-500' : threatLevel === 3 ? 'text-amber-500' : 'text-green-500')} />
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    STATUS_CLS[String(r.status ?? '')] ?? 'bg-slate-800 text-slate-400'
                  )}>
                    {String(r.status ?? '—').replace('_', ' ')}
                  </span>
                  <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    threatInfo?.cls ?? 'bg-slate-800 text-slate-400')}>
                    {threatInfo?.label ?? 'UNRATED'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {r.threat_level != null ? `Threat ${r.threat_level}/5` : 'No rating'}
                  </span>
                </div>

                {/* Center — identity */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div>
                    <p className="text-sm font-bold text-white">{r.full_name ?? 'Unknown'}</p>
                    <p className="text-[11px] font-mono text-rcs mt-0.5">{r.ims_reference ?? '—'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-[10px] font-medium bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      {r.facility ?? 'Unassigned facility'}
                    </span>
                    {r.cell_block && (
                      <span className="text-[10px] font-medium bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        Cell {r.cell_block}
                      </span>
                    )}
                  </div>
                  {!!r.sentence_years && (
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-500">Sentence:</span>{' '}
                      <span className="text-white font-medium">{r.sentence_years} years</span>
                    </p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1">Click to view full record</p>
                </div>

                {/* Right — dates */}
                <div className="sm:w-52 shrink-0 space-y-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-semibold mb-0.5">Intake Date</p>
                    <p className="text-slate-300">{validIntake ? format(intakeDate!, 'dd MMM yyyy') : '—'}</p>
                    <p className="text-[10px] text-slate-500">
                      {intakeDays !== null ? `${intakeDays} days ago` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-semibold mb-0.5">Next Review</p>
                    <p className={clsx('font-medium',
                      reviewOverdue ? 'text-red-400' : reviewSoon ? 'text-amber-400' : 'text-slate-300')}>
                      {validReview ? format(reviewDate!, 'dd MMM yyyy') : '—'}
                    </p>
                    <p className={clsx('text-[10px]',
                      reviewOverdue ? 'text-red-500' : reviewSoon ? 'text-amber-500' : 'text-slate-500')}>
                      {reviewDays === null
                        ? 'No review scheduled'
                        : reviewOverdue
                        ? `${Math.abs(reviewDays)} days overdue ⚠`
                        : `in ${reviewDays} days${reviewSoon ? ' ⚠' : ''}`}
                    </p>
                  </div>

                  <button
                    onClick={e => handleDownloadPdf(e, r.id)}
                    disabled={downloadingId === r.id}
                    className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 hover:text-white transition text-[10px] font-medium disabled:opacity-50 w-full justify-center"
                  >
                    {downloadingId === r.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
          <button
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 transition"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
