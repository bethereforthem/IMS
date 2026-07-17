'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SuspectDetailModal } from './SuspectDetailModal'
import { CaseDetailModal } from './CaseDetailModal'
import { Search, User, Briefcase, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface SuspectHit {
  id: string
  full_name: string
  ims_reference?: string
  status: string
  threat_level?: number
  institution_classification?: string
}

interface CaseHit {
  id: string
  case_reference: string
  title: string
  status: string
  lead_institution: string
}

const SUSPECT_STATUS_CLS: Record<string, string> = {
  WANTED:           'text-red-400 bg-red-950',
  ACTIVE:           'text-amber-400 bg-amber-950',
  ARRESTED:         'text-blue-400 bg-blue-950',
  IN_CUSTODY:       'text-purple-400 bg-purple-950',
  CONVICTED:        'text-slate-300 bg-slate-800',
  RELEASED:         'text-green-400 bg-green-950',
  INTERPOL_FLAGGED: 'text-orange-400 bg-orange-950',
}

export function GlobalSearch() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suspects, setSuspects] = useState<SuspectHit[]>([])
  const [cases, setCases] = useState<CaseHit[]>([])
  const [openSuspectId, setOpenSuspectId] = useState<string | null>(null)
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Village leaders have no suspect/case read access by design
  const enabled = user && user.role !== 'VILLAGE_LEADER'

  // Debounced search
  useEffect(() => {
    if (!enabled) return
    const term = q.trim()
    if (term.length < 2) {
      setSuspects([]); setCases([]); setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      api.get('/search', { params: { q: term } })
        .then(r => {
          setSuspects(r.data?.suspects ?? [])
          setCases(r.data?.cases ?? [])
        })
        .catch(() => { setSuspects([]); setCases([]) })
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, enabled])

  // Close dropdown on outside click / Escape
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!enabled) return null

  const hasResults = suspects.length > 0 || cases.length > 0
  const showDropdown = open && q.trim().length >= 2

  return (
    <>
      <div ref={boxRef} className="relative w-full max-w-md">
        <Search className="absolute left-3 top-2 h-4 w-4 text-slate-500 pointer-events-none" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search suspects, cases, IMS ref…"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-slate-500 transition"
        />

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-40 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[70vh] overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}

            {!loading && !hasResults && (
              <p className="py-5 text-center text-xs text-slate-500">
                No suspects or cases match &quot;{q.trim()}&quot;
              </p>
            )}

            {!loading && suspects.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Suspects
                </p>
                {suspects.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setOpenSuspectId(s.id); setOpen(false) }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-800 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{s.full_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {s.ims_reference ?? '—'}{s.institution_classification ? ` · ${s.institution_classification}` : ''}
                      </p>
                    </div>
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                      SUSPECT_STATUS_CLS[s.status] ?? 'text-slate-400 bg-slate-800')}>
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!loading && cases.length > 0 && (
              <div className={clsx(suspects.length > 0 && 'border-t border-slate-800')}>
                <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" /> Cases
                </p>
                {cases.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setOpenCaseId(c.id); setOpen(false) }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-800 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{c.title}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{c.case_reference} · {c.lead_institution}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 text-slate-400 bg-slate-800">
                      {c.status.replace(/_/g, ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail modals — suspect modal can chain into a case modal */}
      {openSuspectId && (
        <SuspectDetailModal
          suspectId={openSuspectId}
          onClose={() => setOpenSuspectId(null)}
          onOpenCase={id => { setOpenSuspectId(null); setOpenCaseId(id) }}
        />
      )}
      {openCaseId && (
        <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
      )}
    </>
  )
}
