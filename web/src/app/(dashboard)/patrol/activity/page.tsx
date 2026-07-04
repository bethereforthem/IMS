'use client'
import { useState, useEffect } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { useAuth } from '@/hooks/useAuth'
import { intelligenceApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import type { IntelligenceEvent } from '@/types'
import {
  CheckCircle, XCircle, AlertTriangle, Activity,
  Shield, FileText, Download,
} from 'lucide-react'
import clsx from 'clsx'

export default function PatrolActivityPage() {
  const { user } = useAuth()
  const roleLabel = 'Village Leader'
  const [events, setEvents] = useState<IntelligenceEvent[]>([])

  useEffect(() => {
    intelligenceApi.listEvents({ limit: 50 }).then(r => {
      if (r.data?.events?.length) {
        const mine = r.data.events.filter(
          (e: IntelligenceEvent) => e.reporting_officer_id === user?.id
        )
        setEvents(mine.length ? mine : r.data.events.slice(0, 10))
      }
    }).catch(() => {})
  }, [user?.id])

  const totalChecks = events.length
  const recordsFound = events.filter(e => e.criminal_record_found).length
  const cleanCitizens = events.filter(e => !e.criminal_record_found).length
  const reportsFiled = events.filter(e => e.source_tag === 'OFFICER_REPORT').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Activity Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {roleLabel} · {user?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled
            title="Available in production"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export my log
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
            {roleLabel}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Checks Today" value={totalChecks} icon={Activity} variant="default" sub="All verifications" />
        <StatCard label="Records Found" value={recordsFound} icon={XCircle} variant="danger" sub="Alerts dispatched" />
        <StatCard label="Clean Citizens" value={cleanCitizens} icon={CheckCircle} variant="ok" sub="Data discarded" />
        <StatCard label="Reports Filed" value={reportsFiled} icon={FileText} variant="warn" sub="Officer reports" />
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-5">Activity Timeline</h2>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-800" />

          <div className="space-y-6">
            {events.map((e, idx) => {
              const isRecord = e.criminal_record_found
              const isReport = e.source_tag === 'OFFICER_REPORT'

              const Icon = isReport ? AlertTriangle : isRecord ? XCircle : CheckCircle
              const iconCls = isReport
                ? 'text-amber-400'
                : isRecord
                ? 'text-red-400'
                : 'text-green-400'
              const bgCls = isReport
                ? 'bg-amber-950/40 border-amber-900/50'
                : isRecord
                ? 'bg-red-950/20 border-red-900/40'
                : 'bg-slate-800/40 border-slate-700/50'

              const resultText = isReport
                ? 'Incident Report Submitted'
                : isRecord
                ? 'RECORD FOUND — Alert sent to RNP Command'
                : 'No Record Found — Data discarded'
              const resultCls = isReport
                ? 'text-amber-400'
                : isRecord
                ? 'text-red-400'
                : 'text-green-400'

              return (
                <div key={e.id} className="relative flex gap-4">
                  {/* Icon on timeline */}
                  <div className={clsx(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                    bgCls
                  )}>
                    <Icon className={clsx('h-4 w-4', iconCls)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <SourceTagBadge tag={e.source_tag} />
                      <span className="text-[10px] text-slate-500">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        {' · '}
                        {format(new Date(e.created_at), 'MMM dd HH:mm')}
                      </span>
                    </div>

                    <p className={clsx('text-xs font-semibold', resultCls)}>{resultText}</p>

                    {e.notes && (
                      <p className="text-xs text-slate-500 italic mt-1 leading-relaxed">{e.notes}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Law No. 058/2021 — Verification data for clean citizens is discarded immediately.
            GPS coordinates are captured only on a confirmed criminal record match.
            Officer activity logs are retained for audit purposes in accordance with RNP data retention policy.
          </p>
        </div>
      </div>
    </div>
  )
}
