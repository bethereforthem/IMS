'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { casesApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { FileText, Clock, CheckCircle2, Lock, ExternalLink } from 'lucide-react'
import type { Case } from '@/types'

type Tab = 'active' | 'all'

const STATUS_BADGE: Record<string, string> = {
  UNDER_INVESTIGATION: 'text-amber-400 bg-amber-950',
  PENDING_PROSECUTION: 'text-blue-400 bg-blue-950',
  CLOSED:              'text-green-400 bg-green-950',
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
  UNDER_INVESTIGATION: { pct: 40, color: 'bg-amber-500', bg: 'bg-amber-950' },
  PENDING_PROSECUTION: { pct: 75, color: 'bg-blue-500',  bg: 'bg-blue-950'  },
  CLOSED:              { pct: 100, color: 'bg-green-500', bg: 'bg-green-950' },
}

function CaseCard({ c }: { c: Case }) {
  const progress = PROGRESS_CONFIG[c.status] ?? { pct: 0, color: 'bg-slate-600', bg: 'bg-slate-800' }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-3 hover:border-rib/20 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-rib text-xs font-semibold">{c.case_reference}</span>
        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', CLASSIFICATION_BADGE[c.classification] ?? 'text-slate-400 bg-slate-800')}>
          {c.classification.replace('_', ' ')}
        </span>
      </div>

      {/* Title + institution */}
      <div>
        <p className="text-sm font-bold text-slate-100 leading-snug">{c.title}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INSTITUTION_BADGE[c.lead_institution] ?? 'bg-slate-800 text-slate-400')}>
            {c.lead_institution}
          </span>
          <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', STATUS_BADGE[c.status] ?? 'text-slate-400 bg-slate-800')}>
            {c.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
          <span>Case Progress</span>
          <span>{progress.pct}%</span>
        </div>
        <div className={clsx('h-1.5 rounded-full', progress.bg)}>
          <div
            className={clsx('h-1.5 rounded-full transition-all', progress.color)}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-3 w-3" />
          Opened {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
        </span>
        <button
          disabled
          title="Available in production"
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 border border-slate-700 rounded px-2 py-0.5 cursor-not-allowed"
        >
          <ExternalLink className="h-3 w-3" />
          View Case
        </button>
      </div>
    </div>
  )
}

export default function RIBCasesPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('active')
  const [cases, setCases] = useState<Case[]>([])

  useEffect(() => {
    casesApi.list({ limit: 100 }).then(r => {
      if (r.data?.cases?.length) setCases(r.data.cases)
    }).catch(() => {})
  }, [])

  const activeCases    = cases.filter(c => c.status === 'UNDER_INVESTIGATION')
  const pendingCases   = cases.filter(c => c.status === 'PENDING_PROSECUTION')
  const closedCases    = cases.filter(c => c.status === 'CLOSED')
  const topSecretCount = cases.filter(c => c.classification === 'TOP_SECRET').length

  const displayed = tab === 'active' ? activeCases : cases

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Cases</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Intel Unit
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Cases" value={activeCases.length} icon={FileText} variant="warn" sub="Under investigation" />
        <StatCard label="Pending Prosecution" value={pendingCases.length} icon={Clock} sub="Awaiting court" />
        <StatCard label="Closed" value={closedCases.length} icon={CheckCircle2} sub="Resolved" />
        <StatCard label="TOP SECRET" value={topSecretCount} icon={Lock} variant="danger" sub="Cases — highest classification" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-0">
        {(['active', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'text-sm font-semibold pb-2.5 px-1 border-b-2 transition-colors capitalize',
              tab === t
                ? 'border-rib text-rib'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            )}
          >
            {t === 'active' ? `Active (${activeCases.length})` : `All Cases (${cases.length})`}
          </button>
        ))}
      </div>

      {/* Case cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {displayed.map(c => <CaseCard key={c.id} c={c} />)}
      </div>
    </div>
  )
}
