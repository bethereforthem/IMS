'use client'
import { useState, useEffect } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { correctionsApi } from '@/lib/api'
import { format, differenceInDays } from 'date-fns'
import { FileText, Clock, Users, TrendingUp } from 'lucide-react'
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

  useEffect(() => {
    correctionsApi.list({ limit: 100 }).then(r => {
      if (r.data?.records?.length) setRecords(r.data.records)
    }).catch(() => {})
  }, [])

  const totalCount = records.length
  const preTrialCount = records.filter((r: Record<string, unknown>) => r.status === 'PRE_TRIAL').length
  const sentencedCount = records.filter((r: Record<string, unknown>) => r.status === 'SENTENCED').length
  const sentencedRecords = records.filter((r: Record<string, unknown>) => r.status === 'SENTENCED' && r.sentence_years)
  const avgSentence =
    sentencedRecords.length > 0
      ? (sentencedRecords.reduce((s, r: Record<string, unknown>) => s + ((r.sentence_years as number) ?? 0), 0) / sentencedRecords.length).toFixed(1)
      : '—'

  const upcomingReviews = records
    .filter((r: Record<string, unknown>) => {
      if (!r.next_review) return false
      const d = new Date(r.next_review as string)
      return !isNaN(d.getTime())
    })
    .map((r: Record<string, unknown>) => ({ ...r, daysUntil: differenceInDays(new Date(r.next_review as string), TODAY) }))
    .filter(r => r.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  return (
    <div className="space-y-6">
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
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 overflow-x-auto">
        <h2 className="text-sm font-semibold text-white mb-4">All Records</h2>
        <table className="w-full text-left min-w-[800px]">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800">
              <th className="pb-2 pr-4 font-semibold">IMS Reference</th>
              <th className="pb-2 pr-4 font-semibold">Name</th>
              <th className="pb-2 pr-4 font-semibold">Facility</th>
              <th className="pb-2 pr-4 font-semibold">Cell</th>
              <th className="pb-2 pr-4 font-semibold">Intake Date</th>
              <th className="pb-2 pr-4 font-semibold">Status</th>
              <th className="pb-2 pr-4 font-semibold">Sentence</th>
              <th className="pb-2 pr-4 font-semibold">Threat</th>
              <th className="pb-2 pr-4 font-semibold">Next Review</th>
              <th className="pb-2 font-semibold">Days Until</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r: Record<string, unknown>) => {
              const reviewDate  = r.next_review ? new Date(r.next_review as string) : null
              const intakeDate  = r.intake_date ? new Date(r.intake_date as string)  : null
              const validReview = reviewDate && !isNaN(reviewDate.getTime())
              const validIntake = intakeDate && !isNaN(intakeDate.getTime())
              const daysUntil   = validReview ? differenceInDays(reviewDate!, TODAY) : null
              const reviewSoon  = daysUntil !== null && daysUntil <= 14
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
                    <span
                      className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        r.status === 'PRE_TRIAL'
                          ? 'bg-blue-950 text-blue-400'
                          : 'bg-purple-950 text-purple-400'
                      )}
                    >
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
                  <td className={clsx('py-2.5 font-medium', daysUntil !== null && daysUntil <= 7 ? 'text-amber-400' : reviewSoon ? 'text-amber-300/70' : 'text-slate-400')}>
                    {daysUntil !== null ? `${daysUntil}d` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
                  'rounded-lg border p-4',
                  r.daysUntil <= 7
                    ? 'border-amber-700/50 bg-amber-950/20'
                    : 'border-slate-700 bg-slate-800/40'
                )}
              >
                <p className="text-sm font-bold text-white">{r.full_name as string}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{r.facility as string}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      r.status === 'PRE_TRIAL'
                        ? 'bg-blue-950 text-blue-400'
                        : 'bg-purple-950 text-purple-400'
                    )}
                  >
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
