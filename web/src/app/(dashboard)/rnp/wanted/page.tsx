'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { suspectsApi } from '@/lib/api'
import { formatDistanceToNow, format, differenceInYears } from 'date-fns'
import { Users, AlertTriangle, Globe, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import type { Suspect } from '@/types'

type FilterStatus = 'ALL' | 'WANTED' | 'ACTIVE' | 'INTERPOL_FLAGGED'

const CLEARANCE_COLOR: Record<string, string> = {
  TOP_SECRET: 'bg-red-950 text-red-400',
  SECRET: 'bg-orange-950 text-orange-400',
  CONFIDENTIAL: 'bg-yellow-950 text-yellow-400',
  UNCLASSIFIED: 'bg-slate-800 text-slate-400',
}

const STATUS_BADGE: Record<string, string> = {
  WANTED: 'bg-red-950 text-red-400',
  INTERPOL_FLAGGED: 'bg-orange-950 text-orange-400',
  ACTIVE: 'bg-amber-950 text-amber-400',
}

const FILTER_STATUSES: FilterStatus[] = ['ALL', 'WANTED', 'ACTIVE', 'INTERPOL_FLAGGED']

const TRACKED_STATUSES = ['WANTED', 'ACTIVE', 'INTERPOL_FLAGGED']

/** Every alias on record, tolerating the older single-`alias` shape. */
function aliasesOf(s: Suspect): string[] {
  if (Array.isArray(s.aliases)) return s.aliases.filter(Boolean)
  return s.alias ? [s.alias] : []
}

export default function WantedPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<FilterStatus>('ALL')
  const [search, setSearch] = useState('')
  const [rawSuspects, setRawSuspects] = useState<Suspect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    suspectsApi.list({ limit: 200 })
      .then(r => {
        if (cancelled) return
        // Assign unconditionally. Guarding on `.length` meant an empty result
        // left whatever was on screen before, so the list could never go back
        // to being empty and the "no matches" state was unreachable.
        setRawSuspects(
          (r.data?.suspects ?? []).filter((s: Suspect) =>
            TRACKED_STATUSES.includes(s.status)
          )
        )
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Swallowing this rendered an indistinguishable empty page whether the
        // database held no suspects or the request was rejected outright.
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        setError(msg ?? 'Could not load suspects.')
        setRawSuspects([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const suspects = rawSuspects.filter(s => {
    const matchStatus = filter === 'ALL' || s.status === filter
    const q = search.trim().toLowerCase()
    // Search every alias, not just the first one — an operator searching a
    // suspect's second known alias got no result before.
    const matchSearch =
      !q ||
      (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.ims_reference ?? '').toLowerCase().includes(q) ||
      aliasesOf(s).some(a => a.toLowerCase().includes(q))
    return matchStatus && matchSearch
  })

  const wantedCount = rawSuspects.filter(s => s.status === 'WANTED').length
  const interpolCount = rawSuspects.filter(s => s.status === 'INTERPOL_FLAGGED').length
  const activeCount = rawSuspects.filter(s => s.status === 'ACTIVE').length
  const highThreatCount = rawSuspects.filter(s => (s.threat_level ?? 0) >= 4).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Wanted &amp; Active Suspects</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Wanted" value={wantedCount} icon={ShieldAlert} variant="danger" sub="Actively sought" />
        <StatCard label="INTERPOL Flagged" value={interpolCount} icon={Globe} variant="danger" sub="Red notice active" />
        <StatCard label="Active" value={activeCount} icon={Users} variant="warn" sub="Under monitoring" />
        <StatCard label="High Threat (≥4)" value={highThreatCount} icon={AlertTriangle} variant="danger" sub="Threat level 4-5" />
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1">
          {FILTER_STATUSES.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                filter === f
                  ? 'bg-rnp text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or IMS reference…"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rnp/50"
        />
      </div>

      {/* Suspect count */}
      <p className="text-xs text-slate-500">
        Showing {suspects.length} of {rawSuspects.length} suspects
      </p>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Suspect cards */}
      <div className="space-y-3">
        {loading && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-5 h-32 animate-pulse" />
            ))}
          </div>
        )}
        {!loading && !error && suspects.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            {rawSuspects.length === 0
              ? 'No wanted or active suspects are on record.'
              : 'No suspects match the current filters.'}
          </div>
        )}
        {suspects.map(s => {
          const isHighRisk = s.status === 'WANTED' || s.status === 'INTERPOL_FLAGGED'
          const age = s.date_of_birth
            ? differenceInYears(new Date(), new Date(s.date_of_birth))
            : null

          return (
            <div
              key={s.id}
              className={clsx(
                'rounded-xl border p-5 transition-colors',
                isHighRisk
                  ? 'border-red-900/50 bg-red-950/10 hover:bg-red-950/20'
                  : 'border-amber-900/30 bg-amber-950/5 hover:bg-amber-950/10'
              )}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Left — threat dots + status */}
                <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 sm:w-28 shrink-0">
                  <div className="flex gap-1" title={`Threat level ${s.threat_level ?? 'not assessed'}`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={clsx(
                          'h-2.5 w-2.5 rounded-full',
                          i < (s.threat_level ?? 0) ? 'bg-red-500' : 'bg-slate-700'
                        )}
                      />
                    ))}
                  </div>
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    STATUS_BADGE[s.status] ?? 'bg-slate-800 text-slate-400'
                  )}>
                    {s.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {s.threat_level == null ? 'Threat not assessed' : `Threat ${s.threat_level}/5`}
                  </span>
                </div>

                {/* Center — identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white">{s.full_name}</h3>
                    {aliasesOf(s).map(a => (
                      <span key={a} className="text-xs text-slate-400 italic">&ldquo;{a}&rdquo;</span>
                    ))}
                  </div>
                  <p className="text-[11px] font-mono text-rnp mt-0.5">{s.ims_reference}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                    <span className="text-xs text-slate-400">
                      <span className="text-slate-500">NAT:</span> {s.nationality}
                    </span>
                    {s.date_of_birth && (
                      <span className="text-xs text-slate-400">
                        <span className="text-slate-500">DOB:</span>{' '}
                        {format(new Date(s.date_of_birth), 'dd MMM yyyy')}
                        {age !== null && <span className="text-slate-500 ml-1">({age} yrs)</span>}
                      </span>
                    )}
                  </div>
                  {s.physical_description && (
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      <span className="text-slate-500">Description: </span>
                      {s.physical_description}
                    </p>
                  )}
                </div>

                {/* Right — associates, institution, clearance */}
                <div className="sm:w-52 shrink-0 space-y-2">
                  {s.known_associates && s.known_associates.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Known Associates</p>
                      <p className="text-xs text-slate-300">{s.known_associates.join(', ')}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Institution</p>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rnp/20 text-rnp">
                      {s.institution_classification}
                    </span>
                  </div>
                  {s.clearance_required && (
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Clearance Required</p>
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        CLEARANCE_COLOR[s.clearance_required] ?? 'bg-slate-800 text-slate-400'
                      )}>
                        {s.clearance_required.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 pt-3 border-t border-slate-800/50 text-[10px] text-slate-500">
                Last updated {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                {' · '}Created {format(new Date(s.created_at), 'dd MMM yyyy')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
