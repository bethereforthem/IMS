'use client'
import { useState, useEffect } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { correctionsApi } from '@/lib/api'
import { formatDistanceToNow, format, differenceInDays } from 'date-fns'
import { Shield, Users, Clock, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

type FacilityFilter = 'ALL' | 'Mageragere' | 'Nyarugenge'
type StatusFilter = 'ALL' | 'PRE_TRIAL' | 'SENTENCED'
type ThreatFilter = 'ALL' | '1' | '2' | '3' | '4' | '5'

const TODAY = new Date('2026-06-30')

const THREAT_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: 'MINIMAL', cls: 'bg-green-950 text-green-400' },
  2: { label: 'LOW',     cls: 'bg-yellow-950 text-yellow-400' },
  3: { label: 'MEDIUM',  cls: 'bg-amber-950 text-amber-400' },
  4: { label: 'HIGH',    cls: 'bg-orange-950 text-orange-400' },
  5: { label: 'CRITICAL',cls: 'bg-red-950 text-red-400' },
}

export default function InmatesPage() {
  const [search, setSearch] = useState('')
  const [facility, setFacility] = useState<FacilityFilter>('ALL')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [threat, setThreat] = useState<ThreatFilter>('ALL')
  const [corrections, setCorrections] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    correctionsApi.list({ limit: 100 }).then(r => {
      if (r.data?.records?.length) setCorrections(r.data.records)
    }).catch(() => {})
  }, [])

  const inmates = corrections.filter((r: Record<string, unknown>) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      String(r.full_name ?? '').toLowerCase().includes(q) ||
      String(r.ims_reference ?? '').toLowerCase().includes(q)
    const matchFacility = facility === 'ALL' || r.facility === facility
    const matchStatus = status === 'ALL' || r.status === status
    const matchThreat = threat === 'ALL' || r.threat_level === parseInt(threat)
    return matchSearch && matchFacility && matchStatus && matchThreat
  })

  const totalCount = corrections.length
  const preTrialCount = corrections.filter((r: Record<string, unknown>) => r.status === 'PRE_TRIAL').length
  const sentencedCount = corrections.filter((r: Record<string, unknown>) => r.status === 'SENTENCED').length
  const highThreatCount = corrections.filter((r: Record<string, unknown>) => (r.threat_level as number) >= 4).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Inmate Roster</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">Rwanda Correctional Service — Active Inmates</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          RCS Secure
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Inmates" value={totalCount} icon={Users} variant="default" sub="All facilities" />
        <StatCard label="Pre-Trial" value={preTrialCount} icon={Clock} variant="warn" sub="Awaiting hearing" />
        <StatCard label="Sentenced" value={sentencedCount} icon={Shield} variant="default" sub="Convicted and serving" />
        <StatCard label="High Threat (≥4)" value={highThreatCount} icon={AlertTriangle} variant="danger" sub="Elevated risk inmates" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or IMS reference…"
          className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
        />
        <div className="flex gap-1 flex-wrap">
          {(['ALL', 'Mageragere', 'Nyarugenge'] as FacilityFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFacility(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                facility === f
                  ? 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['ALL', 'PRE_TRIAL', 'SENTENCED'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                status === f
                  ? 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          <span className="flex items-center text-xs text-slate-500 px-1">Threat:</span>
          {(['ALL', '1', '2', '3', '4', '5'] as ThreatFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setThreat(f)}
              className={clsx(
                'px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors',
                threat === f
                  ? 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">Showing {inmates.length} of {totalCount} inmates</p>

      {/* Inmate cards */}
      <div className="space-y-3">
        {inmates.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No inmates match the current filters.
          </div>
        )}
        {inmates.map((r: Record<string, unknown>) => {
          const threatLevel = r.threat_level as number
          const intakeDays = differenceInDays(TODAY, new Date(r.intake_date as string))
          const reviewDays = differenceInDays(new Date(r.next_review as string), TODAY)
          const reviewSoon = reviewDays <= 7
          const threatInfo = THREAT_LABEL[threatLevel]

          return (
            <div
              key={r.id as string}
              className={clsx(
                'rounded-xl border p-5 transition-colors',
                threatLevel >= 4
                  ? 'border-red-900/40 bg-red-950/10 hover:bg-red-950/15'
                  : threatLevel === 3
                  ? 'border-amber-900/30 bg-amber-950/5 hover:bg-amber-950/10'
                  : 'border-slate-800 bg-slate-900 hover:bg-slate-800/50'
              )}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Left — Shield icon */}
                <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 sm:w-28 shrink-0">
                  <Shield
                    className={clsx(
                      'h-6 w-6',
                      threatLevel >= 4
                        ? 'text-red-500'
                        : threatLevel === 3
                        ? 'text-amber-500'
                        : 'text-green-500'
                    )}
                  />
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
                  <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', threatInfo?.cls)}>
                    {threatInfo?.label}
                  </span>
                  <span className="text-[10px] text-slate-500">Threat {threatLevel}/5</span>
                </div>

                {/* Center — Identity */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div>
                    <p className="text-sm font-bold text-white">{r.full_name as string}</p>
                    <p className="text-[11px] font-mono text-rcs mt-0.5">{r.ims_reference as string}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-[10px] font-medium bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      {r.facility as string}
                    </span>
                    <span className="text-[10px] font-medium bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      Cell {r.cell_block as string}
                    </span>
                  </div>
                  {r.status === 'SENTENCED' && r.sentence_years && (
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-500">Sentence:</span>{' '}
                      <span className="text-white font-medium">{r.sentence_years as number} years</span>
                      <span className="text-slate-500"> · eligible for review</span>
                    </p>
                  )}
                </div>

                {/* Right — Dates */}
                <div className="sm:w-52 shrink-0 space-y-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-semibold mb-0.5">Intake Date</p>
                    <p className="text-slate-300">
                      {format(new Date(r.intake_date as string), 'dd MMM yyyy')}
                    </p>
                    <p className="text-[10px] text-slate-500">{intakeDays} days ago</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-semibold mb-0.5">Next Review</p>
                    <p className={clsx('font-medium', reviewSoon ? 'text-amber-400' : 'text-slate-300')}>
                      {format(new Date(r.next_review as string), 'dd MMM yyyy')}
                    </p>
                    <p className={clsx('text-[10px]', reviewSoon ? 'text-amber-500' : 'text-slate-500')}>
                      in {reviewDays} days{reviewSoon && ' ⚠'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
