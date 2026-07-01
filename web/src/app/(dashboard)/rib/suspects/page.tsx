'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { suspectsApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { Search, ChevronDown, ChevronRight, User } from 'lucide-react'
import type { Suspect, SuspectStatus } from '@/types'

const STATUS_FILTERS: Array<SuspectStatus | 'ALL'> = [
  'ALL', 'WANTED', 'ACTIVE', 'ARRESTED', 'IN_CUSTODY', 'CONVICTED',
]

const STATUS_BADGE: Record<string, string> = {
  WANTED:           'text-red-400 bg-red-950',
  ACTIVE:           'text-amber-400 bg-amber-950',
  ARRESTED:         'text-orange-400 bg-orange-950',
  IN_CUSTODY:       'text-purple-400 bg-purple-950',
  CONVICTED:        'text-green-400 bg-green-950',
  RELEASED:         'text-slate-400 bg-slate-800',
  DECEASED:         'text-slate-500 bg-slate-800',
  INTERPOL_FLAGGED: 'text-blue-400 bg-blue-950',
}

const CLEARANCE_COLOR: Record<string, string> = {
  TOP_SECRET:    'text-red-400',
  SECRET:        'text-amber-400',
  CONFIDENTIAL:  'text-yellow-400',
  UNCLASSIFIED:  'text-green-400',
}

function ThreatDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className={clsx('h-1.5 w-1.5 rounded-full', i <= level ? 'bg-red-500' : 'bg-slate-700')}
        />
      ))}
    </div>
  )
}

function DetailRow({ suspect }: { suspect: Suspect }) {
  return (
    <tr className="bg-slate-950/60">
      <td colSpan={8} className="px-4 py-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Date of Birth</p>
            <p className="text-slate-200">{suspect.date_of_birth ?? '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Physical Description</p>
            <p className="text-slate-300">{suspect.physical_description ?? 'No description on record.'}</p>
          </div>
          <div>
            <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Known Associates</p>
            {suspect.known_associates && suspect.known_associates.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {suspect.known_associates.map(a => (
                  <span key={a} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{a}</span>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">None on record.</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

export default function RIBSuspectsPage() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuspectStatus | 'ALL'>('ALL')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [suspects, setSuspects] = useState<Suspect[]>([])

  useEffect(() => {
    suspectsApi.list({ limit: 200 }).then(r => {
      if (r.data?.suspects?.length) setSuspects(r.data.suspects)
    }).catch(() => {})
  }, [])

  const filtered = suspects.filter(s => {
    const matchesQuery =
      query === '' ||
      s.full_name.toLowerCase().includes(query.toLowerCase()) ||
      s.ims_reference.toLowerCase().includes(query.toLowerCase()) ||
      (s.alias ?? '').toLowerCase().includes(query.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter
    return matchesQuery && matchesStatus
  })

  const toggleRow = (id: string) => setExpanded(prev => (prev === id ? null : id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Suspects Database</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Intel Unit
        </div>
      </div>

      {/* Search + Filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, alias or IMS reference…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rib/50 focus:ring-1 focus:ring-rib/30"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'text-[11px] font-semibold uppercase px-3 py-1 rounded-full border transition-colors',
                statusFilter === s
                  ? 'bg-rib border-rib text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              )}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500">
              <th className="py-3 px-4 text-left font-medium w-4" />
              <th className="py-3 px-4 text-left font-medium whitespace-nowrap">IMS Ref</th>
              <th className="py-3 px-4 text-left font-medium">Name / Alias</th>
              <th className="py-3 px-4 text-left font-medium">Status</th>
              <th className="py-3 px-4 text-left font-medium">Threat</th>
              <th className="py-3 px-4 text-left font-medium">Nationality</th>
              <th className="py-3 px-4 text-left font-medium">Clearance Req.</th>
              <th className="py-3 px-4 text-left font-medium">Institution</th>
              <th className="py-3 px-4 text-left font-medium whitespace-nowrap">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500 text-sm">
                  <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No suspects match your filters.
                </td>
              </tr>
            )}
            {filtered.map(s => (
              <>
                <tr
                  key={s.id}
                  onClick={() => toggleRow(s.id)}
                  className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20 cursor-pointer select-none"
                >
                  <td className="py-2.5 pl-4">
                    {expanded === s.id
                      ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                      : <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                    }
                  </td>
                  <td className="py-2.5 px-4 font-mono text-rib whitespace-nowrap">{s.ims_reference}</td>
                  <td className="py-2.5 px-4">
                    <p className="text-slate-200 font-semibold">{s.full_name}</p>
                    {s.alias && <p className="text-[10px] text-slate-500 italic">"{s.alias}"</p>}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      STATUS_BADGE[s.status] ?? 'text-slate-400 bg-slate-800'
                    )}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <ThreatDots level={s.threat_level} />
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{s.nationality}</td>
                  <td className={clsx('py-2.5 px-4 font-semibold', CLEARANCE_COLOR[s.clearance_required] ?? 'text-slate-400')}>
                    {s.clearance_required.replace('_', ' ')}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {s.institution_classification}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                  </td>
                </tr>
                {expanded === s.id && <DetailRow key={`${s.id}-detail`} suspect={s} />}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
