'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { suspectsApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Search, User } from 'lucide-react'
import clsx from 'clsx'
import type { Suspect, SuspectStatus, ClearanceLevel } from '@/types'

const STATUS_FILTERS: (SuspectStatus | 'ALL')[] = [
  'ALL', 'WANTED', 'ACTIVE', 'IN_CUSTODY', 'ARRESTED', 'CONVICTED', 'RELEASED', 'INTERPOL_FLAGGED',
]
const CLEARANCE_FILTERS: (ClearanceLevel | 'ALL')[] = ['ALL', 'TOP_SECRET', 'SECRET', 'CONFIDENTIAL', 'UNCLASSIFIED']

const statusBadge: Record<SuspectStatus, string> = {
  WANTED: 'bg-red-500/20 text-red-400',
  ACTIVE: 'bg-amber-500/20 text-amber-400',
  IN_CUSTODY: 'bg-purple-500/20 text-purple-400',
  ARRESTED: 'bg-blue-500/20 text-blue-400',
  CONVICTED: 'bg-slate-500/20 text-slate-400',
  RELEASED: 'bg-green-500/20 text-green-400',
  INTERPOL_FLAGGED: 'bg-orange-500/20 text-orange-400',
}

const clearanceBadge: Record<ClearanceLevel, string> = {
  TOP_SECRET: 'bg-red-500/10 text-red-400 border border-red-500/20',
  SECRET: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  CONFIDENTIAL: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  UNCLASSIFIED: 'bg-green-500/10 text-green-400 border border-green-500/20',
}

function ThreatDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={clsx(
            'inline-block h-2 w-2 rounded-full',
            i < level ? 'bg-red-500' : 'bg-slate-700'
          )}
        />
      ))}
    </div>
  )
}

export default function NISSSuspectsPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuspectStatus | 'ALL'>('ALL')
  const [clearanceFilter, setClearanceFilter] = useState<ClearanceLevel | 'ALL'>('ALL')
  const [suspects, setSuspects] = useState<Suspect[]>([])

  useEffect(() => {
    suspectsApi.list({ limit: 200 }).then((r) => {
      if (r.data?.suspects?.length) setSuspects(r.data.suspects)
    }).catch(() => {})
  }, [])

  const filtered = suspects.filter((s) => {
    const q = search.toLowerCase()
    if (q && !s.full_name.toLowerCase().includes(q) && !s.ims_reference.toLowerCase().includes(q)) return false
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false
    if (clearanceFilter !== 'ALL' && s.clearance_required !== clearanceFilter) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">SUSPECTS REGISTRY</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or IMS reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-niss/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f as SuspectStatus | 'ALL')}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                statusFilter === f
                  ? 'bg-niss text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CLEARANCE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setClearanceFilter(f as ClearanceLevel | 'ALL')}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                clearanceFilter === f
                  ? 'bg-niss text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500">
        Showing <span className="text-white font-semibold">{filtered.length}</span> of {suspects.length} suspects
      </p>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">IMS Reference</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name / Alias</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Threat</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Institution</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Clearance</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-600">
                    No suspects match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                  <td className="px-4 py-3">
                    <span className="font-mono text-niss">{s.ims_reference}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{s.full_name}</p>
                        {s.alias && <p className="text-slate-500 italic">"{s.alias}"</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', statusBadge[s.status])}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ThreatDots level={s.threat_level} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">{s.institution_classification}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', clearanceBadge[s.clearance_required])}>
                      {s.clearance_required.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
