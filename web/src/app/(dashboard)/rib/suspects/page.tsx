'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { suspectsApi, apiErrorMessage, api } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import {
  Search, ChevronDown, ChevronRight, User, AlertTriangle, Loader2,
  FileText, Gavel, Building2, Radio, ChevronLeft,
} from 'lucide-react'
import type { Suspect, SuspectStatus } from '@/types'

const STATUS_FILTERS: Array<SuspectStatus | 'ALL'> = [
  'ALL', 'WANTED', 'ACTIVE', 'ARRESTED', 'IN_CUSTODY', 'CONVICTED', 'RELEASED', 'INTERPOL_FLAGGED',
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
  CLEARED:          'text-slate-400 bg-slate-800',
}

const CLEARANCE_COLOR: Record<string, string> = {
  TOP_SECRET:    'text-red-400',
  SECRET:        'text-amber-400',
  CONFIDENTIAL:  'text-yellow-400',
  UNCLASSIFIED:  'text-green-400',
}

const PAGE_SIZE = 25

/** The 360° view `GET /suspects/[id]` already assembles but nothing consumed. */
interface SuspectDetail extends Suspect {
  linked_cases?: Array<{
    id: string; case_reference: string; title: string
    status: string; lead_institution: string; role?: string
  }>
  warrants?: Array<{
    id: string; warrant_type: string; charges: string
    priority: string; active: boolean; issued_at: string
  }>
  corrections_records?: Array<{
    id: string; facility_name: string; cell_block: string | null
    custody_status: string; intake_date: string | null
    release_date: string | null; sentence_years: number | null
    offense_description: string | null; next_review: string | null
  }>
  community_reports?: Array<{
    id: string; insecurity_type: string | null; description: string | null
    location_description: string | null; reported_at: string
    reporter: { full_name: string; badge_number: string } | null
    institution: string | null
  }>
}

function ThreatDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={clsx('h-1.5 w-1.5 rounded-full', i <= level ? 'bg-red-500' : 'bg-slate-700')} />
      ))}
    </div>
  )
}

function Section({ icon: Icon, label, count, children }: {
  icon: typeof FileText; label: string; count: number; children: React.ReactNode
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1.5">
        <Icon className="h-3 w-3" />
        {label}
        <span className="text-slate-600">({count})</span>
      </p>
      {count === 0 ? <p className="text-slate-600 text-[11px]">None on record.</p> : children}
    </div>
  )
}

/**
 * Expanded row. The suspect list only ever had the columns it already showed,
 * so the panel repeated them; the relationships that make a suspect record
 * useful to an analyst — cases, warrants, custody history, community reports —
 * were assembled by the API and never requested.
 */
function DetailRow({ suspectId }: { suspectId: string }) {
  const [detail, setDetail] = useState<SuspectDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get<SuspectDetail>(`/suspects/${suspectId}`)
      .then(r => { if (!cancelled) { setDetail(r.data); setState('ready') } })
      .catch(e => {
        if (cancelled) return
        setErrorMsg(apiErrorMessage(e, 'Could not load this suspect record.'))
        setState('error')
      })
    return () => { cancelled = true }
  }, [suspectId])

  return (
    <tr className="bg-slate-950/60">
      <td colSpan={9} className="px-4 py-4">
        {state === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading full record…
          </div>
        )}
        {state === 'error' && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {errorMsg}
          </div>
        )}
        {state === 'ready' && detail && (
          <div className="space-y-4">
            {/* Profile */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Date of Birth</p>
                <p className="text-slate-200">{detail.date_of_birth ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Aliases</p>
                {detail.aliases && detail.aliases.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {detail.aliases.map(a => (
                      <span key={a} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{a}</span>
                    ))}
                  </div>
                ) : <p className="text-slate-600">None recorded.</p>}
              </div>
              <div>
                <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Physical Description</p>
                <p className="text-slate-300">{detail.physical_description ?? 'No description on record.'}</p>
              </div>
              <div>
                <p className="text-slate-500 font-medium uppercase tracking-wide text-[10px] mb-1">Known Associates</p>
                {detail.known_associates && detail.known_associates.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {detail.known_associates.map(a => (
                      <span key={a} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{a}</span>
                    ))}
                  </div>
                ) : <p className="text-slate-600">None on record.</p>}
              </div>
            </div>

            {/* Relationships */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 border-t border-slate-800 pt-4 text-xs">
              <Section icon={FileText} label="Linked Cases" count={detail.linked_cases?.length ?? 0}>
                <div className="space-y-1.5">
                  {(detail.linked_cases ?? []).map(c => (
                    <div key={c.id} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                      <p className="font-mono text-[10px] text-rib">{c.case_reference}</p>
                      <p className="text-slate-300 text-[11px] truncate">{c.title}</p>
                      <p className="text-[10px] text-slate-500">
                        {c.status?.replace(/_/g, ' ')} · {c.lead_institution}
                        {c.role ? ` · ${c.role}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon={Gavel} label="Warrants" count={detail.warrants?.length ?? 0}>
                <div className="space-y-1.5">
                  {(detail.warrants ?? []).map(w => (
                    <div key={w.id} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-300 text-[11px] font-medium">{w.warrant_type}</span>
                        <span className={clsx(
                          'text-[9px] font-bold uppercase px-1 py-0.5 rounded',
                          w.active ? 'bg-red-950 text-red-400' : 'bg-slate-800 text-slate-500'
                        )}>
                          {w.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2">{w.charges}</p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon={Building2} label="Custody Records" count={detail.corrections_records?.length ?? 0}>
                <div className="space-y-1.5">
                  {(detail.corrections_records ?? []).map(cr => (
                    <div key={cr.id} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                      <p className="text-slate-300 text-[11px]">
                        {cr.facility_name}{cr.cell_block ? ` · ${cr.cell_block}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {cr.custody_status?.replace(/_/g, ' ')}
                        {cr.intake_date ? ` · from ${format(new Date(cr.intake_date), 'dd MMM yyyy')}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section icon={Radio} label="Community Reports" count={detail.community_reports?.length ?? 0}>
                <div className="space-y-1.5">
                  {(detail.community_reports ?? []).map(r => (
                    <div key={r.id} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                      <p className="text-slate-300 text-[11px]">{r.insecurity_type ?? 'Report'}</p>
                      {r.description && <p className="text-[10px] text-slate-500 line-clamp-2">{r.description}</p>}
                      <p className="text-[10px] text-slate-600">
                        {r.reporter ? `${r.reporter.full_name} (${r.reporter.badge_number})` : 'Unknown reporter'}
                        {' · '}
                        {formatDistanceToNow(new Date(r.reported_at), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

export default function RIBSuspectsPage() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuspectStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [suspects, setSuspects] = useState<Suspect[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setAppliedQuery(query.trim()); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  // Search and status filtering run in the database, so they cover every record
  // the caller's clearance permits rather than one fetched page.
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    suspectsApi.list({
      page,
      page_size: PAGE_SIZE,
      name: appliedQuery || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    })
      .then(r => {
        setSuspects(r.data?.suspects ?? [])
        setTotal(r.data?.total ?? 0)
      })
      .catch(err => {
        setError(apiErrorMessage(err, 'Could not load the suspects database.'))
        setSuspects([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, appliedQuery, statusFilter])

  useEffect(() => { load() }, [load])

  const toggleRow = (id: string) => setExpanded(prev => (prev === id ? null : id))
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
              onClick={() => { setStatusFilter(s); setPage(1) }}
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
            {loading ? 'Loading…' : `${total} result${total !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
        </div>
      )}

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
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800/50">
                <td colSpan={9} className="py-3 px-4"><div className="h-5 rounded bg-slate-800 animate-pulse" /></td>
              </tr>
            ))}

            {!loading && !error && suspects.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500 text-sm">
                  <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No suspects match your filters.
                </td>
              </tr>
            )}

            {!loading && suspects.map(s => (
              <React.Fragment key={s.id}>
                <tr
                  onClick={() => toggleRow(s.id)}
                  className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20 cursor-pointer select-none"
                >
                  <td className="py-2.5 pl-4">
                    {expanded === s.id
                      ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                      : <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-rib whitespace-nowrap">{s.ims_reference}</td>
                  <td className="py-2.5 px-4">
                    <p className="text-slate-200 font-semibold">{s.full_name}</p>
                    {s.alias && <p className="text-[10px] text-slate-500 italic">&quot;{s.alias}&quot;</p>}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      STATUS_BADGE[s.status] ?? 'text-slate-400 bg-slate-800'
                    )}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 px-4"><ThreatDots level={s.threat_level ?? 0} /></td>
                  <td className="py-2.5 px-4 text-slate-400">{s.nationality}</td>
                  <td className={clsx('py-2.5 px-4 font-semibold', CLEARANCE_COLOR[s.clearance_required] ?? 'text-slate-400')}>
                    {s.clearance_required?.replace('_', ' ') ?? '—'}
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
                {expanded === s.id && <DetailRow key={`${s.id}-detail`} suspectId={s.id} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setPage(p => Math.max(1, p - 1)); setExpanded(null) }}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
          <button
            onClick={() => { setPage(p => Math.min(pageCount, p + 1)); setExpanded(null) }}
            disabled={page >= pageCount}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
