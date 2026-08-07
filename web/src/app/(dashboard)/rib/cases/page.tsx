'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { CaseDetailModal } from '@/components/shared/CaseDetailModal'
import { casesApi, apiErrorMessage } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import {
  FileText, Clock, CheckCircle2, Lock, ExternalLink, Search, AlertTriangle,
  ChevronLeft, ChevronRight, RefreshCw, MapPin, Tag,
} from 'lucide-react'
import type { Case } from '@/types'

type Tab = 'active' | 'all'

const STATUS_BADGE: Record<string, string> = {
  OPEN:                'text-blue-400 bg-blue-950',
  UNDER_INVESTIGATION: 'text-amber-400 bg-amber-950',
  PROSECUTION:         'text-orange-400 bg-orange-950',
  PENDING_PROSECUTION: 'text-blue-400 bg-blue-950',
  CLOSED:              'text-green-400 bg-green-950',
  COLD:                'text-slate-400 bg-slate-800',
  SUSPENDED:           'text-slate-400 bg-slate-800',
}

const CLASSIFICATION_BADGE: Record<string, string> = {
  TOP_SECRET:   'text-red-400 bg-red-950 border border-red-900/40',
  SECRET:       'text-amber-400 bg-amber-950 border border-amber-900/40',
  CONFIDENTIAL: 'text-yellow-400 bg-yellow-950 border border-yellow-900/30',
  UNCLASSIFIED: 'text-green-400 bg-green-950 border border-green-900/30',
}

const INSTITUTION_BADGE: Record<string, string> = {
  RIB:  'bg-teal-950 text-teal-400 border border-teal-900/40',
  RNP:  'bg-blue-950 text-blue-400 border border-blue-900/40',
  RDF:  'bg-green-950 text-green-400 border border-green-900/40',
  NISS: 'bg-purple-950 text-purple-400 border border-purple-900/40',
  RCS:  'bg-orange-950 text-orange-400 border border-orange-900/40',
}

const PROGRESS_CONFIG: Record<string, { pct: number; color: string; bg: string }> = {
  OPEN:                { pct: 15,  color: 'bg-blue-500',   bg: 'bg-blue-950'   },
  UNDER_INVESTIGATION: { pct: 40,  color: 'bg-amber-500',  bg: 'bg-amber-950'  },
  PROSECUTION:         { pct: 75,  color: 'bg-orange-500', bg: 'bg-orange-950' },
  PENDING_PROSECUTION: { pct: 75,  color: 'bg-blue-500',   bg: 'bg-blue-950'   },
  CLOSED:              { pct: 100, color: 'bg-green-500',  bg: 'bg-green-950'  },
}

const ACTIVE_STATUSES = ['OPEN', 'UNDER_INVESTIGATION', 'PROSECUTION', 'PENDING_PROSECUTION']
const PAGE_SIZE = 24

type CaseRow = Case & {
  category?: string | null
  summary?: string | null
  incident_date?: string | null
  location_name?: string | null
  updated_at?: string | null
}

// ── Case Card ─────────────────────────────────────────────────────────────────

function CaseCard({ c, onOpen }: { c: CaseRow; onOpen: (id: string) => void }) {
  const progress = PROGRESS_CONFIG[c.status] ?? { pct: 0, color: 'bg-slate-600', bg: 'bg-slate-800' }
  const incident = c.incident_date ? new Date(c.incident_date) : null
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-3 hover:border-rib/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-rib text-xs font-semibold">{c.case_reference}</span>
        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', CLASSIFICATION_BADGE[c.classification] ?? 'text-slate-400 bg-slate-800')}>
          {c.classification?.replace('_', ' ') ?? '—'}
        </span>
      </div>

      <div>
        <p className="text-sm font-bold text-slate-100 leading-snug">{c.title}</p>
        {c.summary && (
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{c.summary}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INSTITUTION_BADGE[c.lead_institution] ?? 'bg-slate-800 text-slate-400')}>
            {c.lead_institution}
          </span>
          <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', STATUS_BADGE[c.status] ?? 'text-slate-400 bg-slate-800')}>
            {c.status.replace(/_/g, ' ')}
          </span>
          {c.category && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <Tag className="h-2.5 w-2.5" />{c.category.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {(incident && !isNaN(incident.getTime())) || c.location_name ? (
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
          {incident && !isNaN(incident.getTime()) && (
            <span>Incident {format(incident, 'dd MMM yyyy')}</span>
          )}
          {c.location_name && (
            <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{c.location_name}</span>
          )}
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
          <span>Case Progress</span>
          <span>{progress.pct}%</span>
        </div>
        <div className={clsx('h-1.5 rounded-full', progress.bg)}>
          <div className={clsx('h-1.5 rounded-full transition-all', progress.color)} style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-3 w-3" />
          Opened {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
        </span>
        <button
          onClick={() => onOpen(c.id)}
          className="flex items-center gap-1 text-[10px] font-semibold text-rib border border-rib/30 rounded px-2 py-0.5 hover:bg-rib/10 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View Case
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RIBCasesPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('active')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)

  const [cases, setCases] = useState<CaseRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)

  // Totals for the stat cards, taken from the database rather than from the
  // page of cards on screen — the counts used to describe one 100-row fetch.
  const [counts, setCounts] = useState<{ active: number; prosecution: number; closed: number; topSecret: number; all: number } | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setAppliedSearch(search.trim()); setPage(1) }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const loadCounts = useCallback(() => {
    // `head`-style count queries: page_size=1 and read `total`.
    const one = (params: Record<string, unknown>) =>
      casesApi.list({ page_size: 1, ...params }).then(r => r.data?.total ?? 0).catch(() => 0)
    Promise.all([
      one({ status: ACTIVE_STATUSES.join(',') }),
      one({ status: 'PROSECUTION' }),
      one({ status: 'CLOSED' }),
      one({ clearance_level: 'TOP_SECRET' }),
      one({}),
    ]).then(([active, prosecution, closed, topSecret, all]) =>
      setCounts({ active, prosecution, closed, topSecret, all })
    )
  }, [])

  const loadCases = useCallback(() => {
    setLoading(true)
    setError(null)
    casesApi.list({
      page,
      page_size: PAGE_SIZE,
      status: tab === 'active' ? ACTIVE_STATUSES.join(',') : undefined,
      q: appliedSearch || undefined,
      sort: 'created_at',
      order: 'desc',
    })
      .then(r => {
        setCases((r.data?.cases ?? []) as unknown as CaseRow[])
        setTotal(r.data?.total ?? 0)
      })
      .catch(err => {
        setError(apiErrorMessage(err, 'Could not load cases.'))
        setCases([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, tab, appliedSearch])

  useEffect(() => { loadCounts() }, [loadCounts])
  useEffect(() => { loadCases() }, [loadCases])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const isAnalyst = user?.role === 'RIB_ANALYST'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{isAnalyst ? 'Cases' : 'My Cases'}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { loadCases(); loadCounts() }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition disabled:opacity-50"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
            <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
            RIB Intel Unit
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Cases"   value={counts?.active ?? '—'}      icon={FileText}     variant="warn"   sub="Open, investigating & prosecution" />
        <StatCard label="In Prosecution" value={counts?.prosecution ?? '—'} icon={Clock}                          sub="With NPPA / courts" />
        <StatCard label="Closed"         value={counts?.closed ?? '—'}      icon={CheckCircle2}                   sub="Resolved" />
        <StatCard label="TOP SECRET"     value={counts?.topSecret ?? '—'}   icon={Lock}         variant="danger" sub="Cases — highest classification" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, reference or summary…"
          className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rib/50"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-800 pb-0">
        {(['active', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1) }}
            className={clsx(
              'text-sm font-semibold pb-2.5 px-1 border-b-2 transition-colors capitalize',
              tab === t ? 'border-rib text-rib' : 'border-transparent text-slate-500 hover:text-slate-300'
            )}
          >
            {t === 'active'
              ? `Active${counts ? ` (${counts.active})` : ''}`
              : `All Cases${counts ? ` (${counts.all})` : ''}`}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {loading ? 'Loading…' : `Showing ${cases.length} of ${total} case${total !== 1 ? 's' : ''}`}
      </p>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={loadCases} className="ml-auto text-xs underline hover:text-red-100">Retry</button>
        </div>
      )}

      {/* Case cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-52 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}
        {!loading && cases.map(c => (
          <CaseCard key={c.id} c={c} onOpen={setOpenCaseId} />
        ))}
      </div>

      {!loading && !error && cases.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500 text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          {appliedSearch
            ? `No cases match "${appliedSearch}".`
            : tab === 'active'
            ? 'No active cases are visible at your clearance.'
            : 'No cases are visible at your clearance.'}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
          <button
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Case detail modal */}
      {openCaseId && (
        <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
      )}
    </div>
  )
}
