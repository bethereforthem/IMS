'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { warrantsApi } from '@/lib/api'
import { FileText, AlertTriangle, Clock, XCircle } from 'lucide-react'
import { format, differenceInDays, isPast } from 'date-fns'
import clsx from 'clsx'

type PriorityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
type StatusFilter = 'ALL' | 'ACTIVE' | 'EXPIRED'

const PRIORITY_FILTERS: PriorityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'EXPIRED']

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-950 text-red-400',
  HIGH: 'bg-amber-950 text-amber-400',
  MEDIUM: 'bg-yellow-950 text-yellow-400',
  LOW: 'bg-slate-800 text-slate-400',
}

const TODAY = new Date('2026-06-30')

function isExpiringSoon(expiresStr: string): boolean {
  const exp = new Date(expiresStr)
  const daysLeft = differenceInDays(exp, TODAY)
  return daysLeft >= 0 && daysLeft <= 30
}

function isExpired(expiresStr: string): boolean {
  return isPast(new Date(expiresStr)) && new Date(expiresStr) < TODAY
}

export default function WarrantsPage() {
  const { user } = useAuth()
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE')
  const [warrants, setWarrants] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    warrantsApi.list({ active: true, limit: 100 }).then(r => {
      if (r.data?.warrants?.length) {
        setWarrants(
          r.data.warrants.map((w: Record<string, unknown>) => ({
            ...w,
            reference: w.case_reference ?? `WRT-${String(w.id).slice(0, 8).toUpperCase()}`,
            suspect: (w.suspects as Record<string, unknown>)?.full_name ?? 'Unknown',
            charge: w.charges,
            issued: w.issued_at,
            expires: w.expires_at,
            issuing_court: w.issued_by_court ?? w.issued_by,
            status: w.active ? 'ACTIVE' : 'EXPIRED',
          }))
        )
      }
    }).catch(() => {})
  }, [])

  const filtered = warrants.filter(w => {
    const matchPriority = priorityFilter === 'ALL' || w.priority === priorityFilter
    const matchStatus = statusFilter === 'ALL' || w.status === statusFilter
    return matchPriority && matchStatus
  })

  const activeCount = warrants.filter(w => w.status === 'ACTIVE').length
  const criticalCount = warrants.filter(w => w.priority === 'CRITICAL' && w.status === 'ACTIVE').length
  const expiringSoonCount = warrants.filter(w => w.status === 'ACTIVE' && isExpiringSoon(w.expires as string)).length
  const expiredCount = warrants.filter(w => w.status === 'EXPIRED').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Active Warrants</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Active Warrants" value={activeCount} icon={FileText} variant="warn" />
        <StatCard label="Critical Priority" value={criticalCount} icon={AlertTriangle} variant="danger" sub="Immediate action" />
        <StatCard label="Expiring Soon" value={expiringSoonCount} icon={Clock} variant="warn" sub="Within 30 days" />
        <StatCard label="Expired" value={expiredCount} icon={XCircle} variant="default" sub="Requires renewal" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          <span className="text-xs text-slate-500 flex items-center pr-1">Priority:</span>
          {PRIORITY_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setPriorityFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                priorityFilter === f
                  ? 'bg-rnp text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          <span className="text-xs text-slate-500 flex items-center pr-1">Status:</span>
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                statusFilter === f
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Warrant Registry</h2>
          <span className="text-xs text-slate-500">{filtered.length} warrant{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500">
                <th className="py-2 text-left font-medium">Reference</th>
                <th className="py-2 text-left font-medium">Suspect</th>
                <th className="py-2 text-left font-medium">Charge</th>
                <th className="py-2 text-left font-medium hidden md:table-cell">Issuing Court</th>
                <th className="py-2 text-left font-medium">Issued</th>
                <th className="py-2 text-left font-medium">Expires</th>
                <th className="py-2 text-left font-medium">Priority</th>
                <th className="py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                    No warrants match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map(w => {
                const expired = isExpired(w.expires)
                const expiringSoon = isExpiringSoon(w.expires) && !expired

                return (
                  <tr key={w.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                    <td className="py-2.5 font-mono text-rnp whitespace-nowrap">{w.reference}</td>
                    <td className="py-2.5 text-slate-200 font-medium whitespace-nowrap">{w.suspect}</td>
                    <td className="py-2.5 text-slate-400">{w.charge}</td>
                    <td className="py-2.5 text-slate-400 hidden md:table-cell whitespace-nowrap">{w.issuing_court}</td>
                    <td className="py-2.5 text-slate-500 whitespace-nowrap">{format(new Date(w.issued), 'dd MMM yyyy')}</td>
                    <td className={clsx(
                      'py-2.5 whitespace-nowrap font-medium',
                      expired ? 'text-red-400' : expiringSoon ? 'text-amber-400' : 'text-slate-400'
                    )}>
                      {format(new Date(w.expires), 'dd MMM yyyy')}
                      {expiringSoon && (
                        <span className="ml-1 text-[10px] text-amber-400">
                          ({differenceInDays(new Date(w.expires), TODAY)}d)
                        </span>
                      )}
                      {expired && <span className="ml-1 text-[10px] text-red-400">(exp.)</span>}
                    </td>
                    <td className="py-2.5">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        PRIORITY_BADGE[w.priority] ?? 'bg-slate-800 text-slate-400'
                      )}>
                        {w.priority}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        w.status === 'ACTIVE'
                          ? 'bg-green-950 text-green-400'
                          : 'bg-slate-800 text-slate-400'
                      )}>
                        {w.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
