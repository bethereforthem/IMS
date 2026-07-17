'use client'
import { useState, useEffect } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { InmateDetailModal } from '@/components/shared/InmateDetailModal'
import { correctionsApi } from '@/lib/api'
import { generateCustodyPdf } from '@/lib/custody-pdf'
import { format, differenceInDays } from 'date-fns'
import { FileText, Clock, Users, TrendingUp, Eye, Download, Loader2, Search } from 'lucide-react'
import clsx from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

const TODAY = new Date('2026-06-30')

function threatDots(level: number) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            'h-2 w-2 rounded-full',
            i < level
              ? level >= 4
                ? 'bg-red-500'
                : level === 3
                ? 'bg-amber-500'
                : 'bg-green-500'
              : 'bg-slate-700'
          )}
        />
      ))}
    </div>
  )
}

export default function CorrectionsPage() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  function reload() {
    correctionsApi.list({ limit: 100 }).then(r => {
      if (r.data?.records?.length) setRecords(r.data.records)
    }).catch(() => {})
  }

  useEffect(() => { reload() }, [])

  async function handleDownloadPdf(id: string) {
    setDownloadingId(id)
    setPdfError(null)
    try {
      const r = await correctionsApi.get(id)
      await generateCustodyPdf(r.data as Record<string, unknown>)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF generation failed'
      setPdfError(msg)
      setTimeout(() => setPdfError(null), 5000)
    } finally {
      setDownloadingId(null)
    }
  }

  const filtered = records.filter(r => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      String(r.full_name ?? '').toLowerCase().includes(q) ||
      String(r.ims_reference ?? '').toLowerCase().includes(q) ||
      String(r.facility ?? '').toLowerCase().includes(q)
    )
  })

  const totalCount = records.length
  const preTrialCount = records.filter((r) => r.status === 'PRE_TRIAL').length
  const sentencedCount = records.filter((r) => r.status === 'SENTENCED').length
  const sentencedRecords = records.filter((r) => r.status === 'SENTENCED' && r.sentence_years)
  const avgSentence =
    sentencedRecords.length > 0
      ? (sentencedRecords.reduce((s, r) => s + ((r.sentence_years as number) ?? 0), 0) / sentencedRecords.length).toFixed(1)
      : '—'

  type ReviewRow = Record<string, unknown> & { daysUntil: number }
  const upcomingReviews: ReviewRow[] = records
    .filter(r => {
      if (!r.next_review) return false
      const d = new Date(r.next_review as string)
      return !isNaN(d.getTime()) && differenceInDays(d, TODAY) <= 14
    })
    .map(r => ({ ...r, daysUntil: differenceInDays(new Date(r.next_review as string), TODAY) } as ReviewRow))
    .sort((a, b) => a.daysUntil - b.daysUntil)

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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Records" value={totalCount} icon={FileText} variant="default" sub="All corrections entries" />
        <StatCard label="Pre-Trial" value={preTrialCount} icon={Clock} variant="warn" sub="Awaiting judgment" />
        <StatCard label="Sentenced" value={sentencedCount} icon={Users} variant="default" sub="Serving sentence" />
        <StatCard label="Avg Sentence" value={`${avgSentence} yrs`} icon={TrendingUp} variant="default" sub="Of sentenced records" />
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
              placeholder="Search by name, IMS ref, or facility…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
            />
          </div>
          <p className="text-xs text-slate-500 shrink-0">
            {filtered.length} of {totalCount} records
          </p>
        </div>

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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-sm text-slate-500">
                    {search ? `No records match "${search}"` : 'No corrections records found.'}
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const reviewDate  = r.next_review ? new Date(r.next_review as string) : null
                const intakeDate  = r.intake_date ? new Date(r.intake_date as string)  : null
                const validReview = reviewDate && !isNaN(reviewDate.getTime())
                const validIntake = intakeDate && !isNaN(intakeDate.getTime())
                const daysUntil   = validReview ? differenceInDays(reviewDate!, TODAY) : null
                const reviewSoon  = daysUntil !== null && daysUntil <= 14
                const isDownloading = downloadingId === (r.id as string)
                return (
                  <tr key={r.id as string} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="py-2.5 pr-4 font-mono text-rcs">{r.ims_reference as string}</td>
                    <td className="py-2.5 pr-4 text-white font-medium">{r.full_name as string}</td>
                    <td className="py-2.5 pr-4 text-slate-300">{r.facility as string}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{r.cell_block as string}</td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {validIntake ? format(intakeDate!, 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        r.status === 'PRE_TRIAL'
                          ? 'bg-blue-950 text-blue-400'
                          : r.status === 'RELEASED'
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-purple-950 text-purple-400'
                      )}>
                        {String(r.status ?? '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {r.sentence_years ? `${r.sentence_years} yrs` : 'Pre-Trial'}
                    </td>
                    <td className="py-2.5 pr-4">{threatDots(r.threat_level as number)}</td>
                    <td className={clsx('py-2.5 pr-4 font-medium', reviewSoon ? 'text-amber-400' : 'text-slate-300')}>
                      {validReview ? format(reviewDate!, 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className={clsx('py-2.5 pr-4 font-medium', daysUntil !== null && daysUntil <= 7 ? 'text-amber-400' : reviewSoon ? 'text-amber-300/70' : 'text-slate-400')}>
                      {daysUntil !== null ? `${daysUntil}d` : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setSelectedId(r.id as string)}
                          title="View full record"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition text-[10px] font-medium"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(r.id as string)}
                          disabled={isDownloading}
                          title="Download PDF custody record"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-900/60 hover:bg-amber-800 text-amber-300 hover:text-white transition text-[10px] font-medium disabled:opacity-50"
                        >
                          {isDownloading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Download className="h-3 w-3" />
                          }
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
      </div>

      {/* Upcoming Reviews */}
      {upcomingReviews.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Upcoming Reviews (within 14 days)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingReviews.map(r => (
              <div
                key={r.id as string}
                className={clsx(
                  'rounded-lg border p-4 cursor-pointer transition-colors',
                  r.daysUntil <= 7
                    ? 'border-amber-700/50 bg-amber-950/20 hover:bg-amber-950/30'
                    : 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/60'
                )}
                onClick={() => setSelectedId(r.id as string)}
              >
                <p className="text-sm font-bold text-white">{r.full_name as string}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{r.facility as string}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    r.status === 'PRE_TRIAL'
                      ? 'bg-blue-950 text-blue-400'
                      : 'bg-purple-950 text-purple-400'
                  )}>
                    {String(r.status ?? '').replace('_', ' ')}
                  </span>
                </div>
                <div className="mt-2 text-xs">
                  <span className="text-slate-500">Review: </span>
                  <span className={clsx('font-medium', r.daysUntil <= 7 ? 'text-amber-400' : 'text-slate-300')}>
                    {format(new Date(r.next_review as string), 'MMM dd, yyyy')}
                  </span>
                  <span className={clsx('ml-2 text-[10px]', r.daysUntil <= 7 ? 'text-amber-500' : 'text-slate-500')}>
                    ({r.daysUntil} days{r.daysUntil <= 7 ? ' ⚠' : ''})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intake vs Release Chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Intake vs Releases — Last 6 Months</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={[]} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Bar dataKey="intake" name="Intake" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="releases" name="Releases" fill="#0891b2" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
