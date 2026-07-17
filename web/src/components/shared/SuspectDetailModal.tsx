'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import {
  User, X, AlertTriangle, Loader2, Shield, FileText, Lock,
  Briefcase, Building2, Fingerprint,
} from 'lucide-react'

interface LinkedCase {
  id: string
  case_reference: string
  title: string
  status: string
  lead_institution: string
  role?: string
}

interface WarrantRow {
  id: string
  warrant_type?: string
  charges?: string
  priority?: string
  active?: boolean
  issued_at?: string
}

interface CustodyRow {
  id?: string
  facility_name?: string
  cell_block?: string
  custody_status?: string
  intake_date?: string
  release_date?: string
  actual_release_at?: string
  sentence_years?: number
  offense_description?: string
  court_name?: string
  next_review?: string
}

interface SuspectDetail {
  id: string
  ims_reference?: string
  full_name: string
  first_name?: string
  last_name?: string
  aliases?: string[]
  status: string
  clearance_level?: string
  date_of_birth?: string
  gender?: string
  nationality?: string
  height_cm?: number
  weight_kg?: number
  eye_color?: string
  distinguishing_marks?: string
  physical_description?: string
  owning_institution?: string
  interpol_notice?: string
  interpol_file_no?: string
  threat_level?: number
  known_associates?: string
  notes?: string
  created_at?: string
  linked_cases?: LinkedCase[]
  warrants?: WarrantRow[]
  corrections_records?: CustodyRow[]
}

const STATUS_BADGE: Record<string, string> = {
  WANTED:           'text-red-400 bg-red-950 border border-red-900/50',
  ACTIVE:           'text-amber-400 bg-amber-950 border border-amber-900/40',
  ARRESTED:         'text-blue-400 bg-blue-950 border border-blue-900/40',
  IN_CUSTODY:       'text-purple-400 bg-purple-950 border border-purple-900/40',
  CONVICTED:        'text-slate-300 bg-slate-800 border border-slate-700',
  RELEASED:         'text-green-400 bg-green-950 border border-green-900/40',
  INTERPOL_FLAGGED: 'text-orange-400 bg-orange-950 border border-orange-900/40',
  DECEASED:         'text-slate-500 bg-slate-800 border border-slate-700',
}

const CASE_STATUS_BADGE: Record<string, string> = {
  OPEN:                'text-blue-400 bg-blue-950',
  UNDER_INVESTIGATION: 'text-amber-400 bg-amber-950',
  PROSECUTION:         'text-orange-400 bg-orange-950',
  CLOSED:              'text-green-400 bg-green-950',
  COLD:                'text-slate-400 bg-slate-800',
}

const CLASSIFICATION_BADGE: Record<string, string> = {
  TOP_SECRET:   'text-red-400 bg-red-950 border border-red-900/40',
  SECRET:       'text-amber-400 bg-amber-950 border border-amber-900/40',
  CONFIDENTIAL: 'text-yellow-400 bg-yellow-950 border border-yellow-900/30',
  UNCLASSIFIED: 'text-green-400 bg-green-950 border border-green-900/30',
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="bg-slate-800/60 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-slate-200 mt-0.5">{String(value)}</p>
    </div>
  )
}

export function SuspectDetailModal({
  suspectId, onClose, onOpenCase,
}: {
  suspectId: string
  onClose: () => void
  onOpenCase?: (caseId: string) => void
}) {
  const [detail, setDetail] = useState<SuspectDetail | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'justify' | 'clearance'>('loading')
  const [denyMessage, setDenyMessage] = useState('')
  const [justification, setJustification] = useState('')

  const load = useCallback((withJustification?: string) => {
    setLoadState('loading')
    const params = withJustification ? { justification: withJustification } : undefined
    api.get(`/suspects/${suspectId}`, { params })
      .then(r => { setDetail(r.data as SuspectDetail); setLoadState('ready') })
      .catch(err => {
        if (err?.response?.status === 403) {
          const msg: string = err.response?.data?.error ?? ''
          setDenyMessage(msg)
          // TOP_SECRET records require a written justification (audited);
          // insufficient clearance is a hard denial
          setLoadState(msg.toLowerCase().includes('justification') ? 'justify' : 'clearance')
        } else {
          setLoadState('error')
        }
      })
  }, [suspectId])

  useEffect(() => { load() }, [load])

  const age = detail?.date_of_birth
    ? Math.floor((Date.now() - new Date(detail.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null

  const activeWarrants = (detail?.warrants ?? []).filter(w => w.active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">
              {detail ? (detail.ims_reference ?? 'Suspect Profile') : 'Suspect Profile'}
            </span>
            {detail?.clearance_level && (
              <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', CLASSIFICATION_BADGE[detail.clearance_level] ?? 'text-slate-400 bg-slate-800')}>
                {detail.clearance_level.replace('_', ' ')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loadState === 'loading' && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}

          {loadState === 'error' && (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm">Failed to load suspect profile.</p>
            </div>
          )}

          {loadState === 'clearance' && (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
              <Lock className="h-8 w-8 text-red-400" />
              <p className="text-sm font-semibold text-red-300">Access Denied — Clearance Level</p>
              <p className="text-xs text-slate-500 text-center max-w-sm">
                {denyMessage || 'Your clearance level is not sufficient to view this record.'}
              </p>
              <p className="text-[10px] text-slate-600">This access attempt has been recorded in the audit log.</p>
            </div>
          )}

          {loadState === 'justify' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Lock className="h-8 w-8 text-red-400" />
              <p className="text-sm text-slate-300 font-semibold">TOP SECRET record — justification required</p>
              <p className="text-xs text-slate-500 text-center max-w-sm">
                Access to this record is restricted. Provide a written justification
                (minimum 10 characters). Your access will be permanently recorded in the audit log.
              </p>
              <textarea
                value={justification}
                onChange={e => setJustification(e.target.value)}
                rows={3}
                placeholder="Reason for accessing this record…"
                className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              />
              <button
                onClick={() => load(justification)}
                disabled={justification.trim().length < 10}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 transition disabled:opacity-40"
              >
                Request Access
              </button>
            </div>
          )}

          {loadState === 'ready' && detail && (
            <>
              {/* Identity */}
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-violet-950 border border-violet-900/50 flex items-center justify-center shrink-0">
                  <User className="h-6 w-6 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white leading-snug">{detail.full_name}</h2>
                  {!!detail.aliases?.length && (
                    <p className="text-xs text-slate-500 italic mt-0.5">
                      alias: {detail.aliases.join(', ')}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded', STATUS_BADGE[detail.status] ?? 'text-slate-400 bg-slate-800')}>
                      {detail.status.replace(/_/g, ' ')}
                    </span>
                    {detail.owning_institution && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        <Building2 className="h-3 w-3" />
                        {detail.owning_institution}
                      </span>
                    )}
                    {detail.interpol_notice && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-orange-950 text-orange-400 border border-orange-900/40">
                        INTERPOL {detail.interpol_notice}
                      </span>
                    )}
                    {detail.threat_level != null && (
                      <span className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className={clsx('h-1.5 w-1.5 rounded-full inline-block',
                            i < (detail.threat_level ?? 0) ? 'bg-red-500' : 'bg-slate-700')} />
                        ))}
                        <span className="text-[10px] text-slate-500 ml-1">threat {detail.threat_level}/5</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Date of Birth" value={detail.date_of_birth ? `${format(new Date(detail.date_of_birth), 'dd MMM yyyy')}${age != null ? ` (${age} yrs)` : ''}` : null} />
                <Field label="Gender" value={detail.gender} />
                <Field label="Nationality" value={detail.nationality} />
                <Field label="Height" value={detail.height_cm ? `${detail.height_cm} cm` : null} />
                <Field label="Weight" value={detail.weight_kg ? `${detail.weight_kg} kg` : null} />
                <Field label="Eye Color" value={detail.eye_color} />
                <Field label="Interpol File" value={detail.interpol_file_no} />
                <Field label="In System Since" value={detail.created_at ? formatDistanceToNow(new Date(detail.created_at), { addSuffix: true }) : null} />
              </div>

              {detail.distinguishing_marks && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Distinguishing Marks</p>
                  <p className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3">{detail.distinguishing_marks}</p>
                </div>
              )}

              {detail.physical_description && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Physical Description</p>
                  <p className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3">{detail.physical_description}</p>
                </div>
              )}

              {detail.notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Intelligence Notes</p>
                  <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/40 rounded-lg p-3">{detail.notes}</p>
                </div>
              )}

              {detail.known_associates && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Known Associates</p>
                  <p className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3">{detail.known_associates}</p>
                </div>
              )}

              {/* Active warrants */}
              {activeWarrants.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-amber-400" />
                    Active Warrants ({activeWarrants.length})
                  </p>
                  <div className="space-y-2">
                    {activeWarrants.map(w => (
                      <div key={w.id} className="flex items-center justify-between bg-amber-950/20 border border-amber-900/30 rounded-lg px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">{w.charges ?? 'Charges pending'}</p>
                          <p className="text-[10px] text-slate-500">
                            {w.warrant_type ?? 'ARREST'} · issued {w.issued_at ? formatDistanceToNow(new Date(w.issued_at), { addSuffix: true }) : '—'}
                          </p>
                        </div>
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                          w.priority === 'CRITICAL' ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400')}>
                          {w.priority ?? 'HIGH'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Imprisonment history */}
              {!!detail.corrections_records?.length && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-purple-400" />
                    Imprisonment History ({detail.corrections_records.length})
                  </p>
                  <div className="space-y-2">
                    {[...detail.corrections_records]
                      .sort((a, b) => new Date(b.intake_date ?? 0).getTime() - new Date(a.intake_date ?? 0).getTime())
                      .map((r, i) => {
                        const released = r.actual_release_at ?? (r.custody_status === 'RELEASED' ? r.release_date : null)
                        const isCurrent = !released && ['PRE_TRIAL', 'SENTENCED'].includes(r.custody_status ?? '')
                        return (
                          <div key={r.id ?? i} className={clsx(
                            'rounded-lg px-4 py-2.5 border',
                            isCurrent
                              ? 'bg-purple-950/20 border-purple-900/40'
                              : 'bg-slate-800/40 border-slate-800'
                          )}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-200">
                                {r.facility_name}
                                {r.cell_block && <span className="text-slate-500 font-normal"> · {r.cell_block}</span>}
                              </p>
                              <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                                isCurrent ? 'bg-purple-950 text-purple-400' :
                                released ? 'bg-green-950 text-green-400' : 'bg-slate-800 text-slate-400')}>
                                {isCurrent ? `IN CUSTODY · ${String(r.custody_status).replace('_', ' ')}` : String(r.custody_status ?? '—').replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {r.intake_date ? format(new Date(r.intake_date), 'dd MMM yyyy') : '—'}
                              {' → '}
                              {released ? format(new Date(released), 'dd MMM yyyy') : 'present'}
                              {r.sentence_years != null && ` · ${r.sentence_years}-year sentence`}
                            </p>
                            {r.offense_description && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{r.offense_description}</p>
                            )}
                            {r.court_name && (
                              <p className="text-[10px] text-slate-600 mt-0.5">{r.court_name}</p>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Linked cases */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-teal-400" />
                  Linked Cases ({detail.linked_cases?.length ?? 0})
                </p>
                {!detail.linked_cases?.length ? (
                  <p className="text-xs text-slate-600 bg-slate-800/30 rounded-lg px-3 py-4 text-center">
                    No cases linked to this suspect.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.linked_cases.map(c => (
                      <button
                        key={c.id}
                        onClick={() => onOpenCase?.(c.id)}
                        disabled={!onOpenCase}
                        className={clsx(
                          'w-full flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2.5 text-left',
                          onOpenCase && 'hover:bg-slate-800 transition cursor-pointer'
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">{c.title}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{c.case_reference} · {c.lead_institution}{c.role ? ` · ${c.role}` : ''}</p>
                        </div>
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0', CASE_STATUS_BADGE[c.status] ?? 'text-slate-400 bg-slate-800')}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
