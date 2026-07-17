'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { casesApi } from '@/lib/api'
import { CaseDetailModal } from '@/components/shared/CaseDetailModal'
import { formatDistanceToNow } from 'date-fns'
import { Briefcase, Search, Scale, CheckCircle, Clock, FolderOpen, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import type { Case, ClearanceLevel } from '@/types'

type CaseStatus = 'ALL' | 'OPEN' | 'UNDER_INVESTIGATION' | 'PROSECUTION' | 'CLOSED' | 'COLD'
type ClassFilter = ClearanceLevel | 'ALL' | 'UNCLASSIFIED'

const STATUS_FILTERS: CaseStatus[] = ['ALL', 'OPEN', 'UNDER_INVESTIGATION', 'PROSECUTION', 'CLOSED', 'COLD']
const CLASS_FILTERS: (ClassFilter)[] = ['ALL', 'TOP_SECRET', 'SECRET', 'CONFIDENTIAL', 'UNCLASSIFIED']

const statusBadge: Record<string, string> = {
  OPEN: 'bg-blue-500/20 text-blue-400',
  UNDER_INVESTIGATION: 'bg-amber-500/20 text-amber-400',
  PROSECUTION: 'bg-orange-500/20 text-orange-400',
  CLOSED: 'bg-green-500/20 text-green-400',
  COLD: 'bg-slate-500/20 text-slate-400',
}

const statusIcon: Record<string, React.ElementType> = {
  OPEN: FolderOpen,
  UNDER_INVESTIGATION: Search,
  PROSECUTION: Scale,
  CLOSED: CheckCircle,
}

const classBadge: Record<string, string> = {
  TOP_SECRET: 'bg-red-500/10 text-red-400 border border-red-500/20',
  SECRET: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  CONFIDENTIAL: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  UNCLASSIFIED: 'bg-green-500/10 text-green-400 border border-green-500/20',
}

export default function NISSCasesPage() {
  const { user } = useAuth()
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<CaseStatus>('ALL')
  const [cases, setCases] = useState<Case[]>([])
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)

  useEffect(() => {
    casesApi.list({ limit: 100 }).then((r) => {
      if (r.data?.cases?.length) setCases(r.data.cases)
    }).catch(() => {})
  }, [])

  const filtered = cases.filter((c) => {
    if (classFilter !== 'ALL' && c.classification !== classFilter) return false
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
    return true
  })

  const underInvestigation = cases.filter((c) => c.status === 'UNDER_INVESTIGATION').length
  const pendingProsecution = cases.filter((c) => c.status === 'PROSECUTION').length
  const closed = cases.filter((c) => c.status === 'CLOSED').length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">CASES OVERVIEW</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Cases', value: cases.length, icon: Briefcase, cls: 'text-slate-300' },
          { label: 'Under Investigation', value: underInvestigation, icon: Search, cls: 'text-amber-400' },
          { label: 'Pending Prosecution', value: pendingProsecution, icon: Scale, cls: 'text-blue-400' },
          { label: 'Closed', value: closed, icon: CheckCircle, cls: 'text-slate-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={clsx('h-4 w-4', s.cls)} />
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <p className={clsx('text-2xl font-bold', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {CLASS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setClassFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                classFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                statusFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reference</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Classification</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lead</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Opened</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-600">
                    No cases match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const SIcon = statusIcon[c.status] ?? Clock
                return (
                  <tr key={c.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="px-4 py-3">
                      <span className="font-mono text-niss">{c.case_reference}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium max-w-[220px]">{c.title}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', statusBadge[c.status])}>
                        <SIcon className="h-2.5 w-2.5" />
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', classBadge[c.classification])}>
                        {c.classification.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full">
                        {c.lead_institution}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setOpenCaseId(c.id)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-niss border border-niss/30 rounded px-2 py-0.5 hover:bg-niss/10 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case detail modal */}
      {openCaseId && (
        <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
      )}
    </div>
  )
}
