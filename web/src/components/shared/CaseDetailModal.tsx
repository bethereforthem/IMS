'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { casesApi, api } from '@/lib/api'
import { format } from 'date-fns'
import clsx from 'clsx'
import {
  FileText, Clock, X, User, AlertTriangle, MapPin, Calendar, Tag,
  Loader2, Printer, BookOpen,
} from 'lucide-react'
import type { Case } from '@/types'

export type CaseDetail = Case & {
  category?: string
  summary?: string
  incident_date?: string
  location_name?: string
  suspects?: Array<{
    id: string
    full_name: string
    ims_reference: string
    status: string
    threat_level?: string
    role?: string
    added_at?: string
  }>
}

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
  OPEN:                { pct: 15,  color: 'bg-blue-500',  bg: 'bg-blue-950'  },
  UNDER_INVESTIGATION: { pct: 40,  color: 'bg-amber-500', bg: 'bg-amber-950' },
  PROSECUTION:         { pct: 75,  color: 'bg-orange-500', bg: 'bg-orange-950' },
  PENDING_PROSECUTION: { pct: 75,  color: 'bg-blue-500',  bg: 'bg-blue-950'  },
  CLOSED:              { pct: 100, color: 'bg-green-500', bg: 'bg-green-950' },
}

const THREAT_BADGE: Record<string, string> = {
  CRITICAL: 'text-red-400 bg-red-950',
  HIGH:     'text-orange-400 bg-orange-950',
  MEDIUM:   'text-amber-400 bg-amber-950',
  LOW:      'text-green-400 bg-green-950',
}

export function CaseDetailModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter()
  const { user } = useAuth()
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pdfBusy, setPdfBusy] = useState(false)

  // The investigation report editor lives in the RIB section; other
  // institutions get the full case file through the PDF export instead
  const canOpenReportEditor = (user?.role ?? '').startsWith('RIB')

  useEffect(() => {
    casesApi.get(caseId)
      .then(r => { setDetail(r.data as CaseDetail); setLoadState('ready') })
      .catch(() => setLoadState('error'))
  }, [caseId])

  async function handleDownloadPdf() {
    if (!detail) return
    setPdfBusy(true)
    try {
      const { generateInvestigationPdf } = await import('@/lib/report-pdf')
      const reportRow = await api.get(`/cases/${caseId}/report`).then(r => r.data).catch(() => null)
      const report = reportRow?.report_data ?? {
        // No filed report yet — render the PDF from case data + linked suspects
        victims: [], witnesses: [], criminal_history: [], exhibits: [],
        suspects: (detail.suspects ?? []).map(s => ({
          full_name: s.full_name, party_status: 'SUSPECT', father_name: '', mother_name: '',
          date_of_birth: '', sex: '', place_of_birth: '', country: 'Rwanda',
          province: '', district: '', sector: '', cell: '', village: '',
          residential_address: '', domicile_address: '', telephone: '', email: '',
          national_id: s.ims_reference ?? '', nationality: 'RWA', marital_status: '',
          profession: '', properties: '', health_status: '', education_level: '',
          num_children: '', alt_contact: '',
        })),
        crime_info: {
          date_of_crime: detail.incident_date?.substring(0, 10) ?? '', time_of_crime: '',
          province: '', district: '', sector: '', cell: '', village: '',
          exact_scene: detail.location_name ?? '', gps_lat: '', gps_lng: '',
        },
        investigators: [],
        crime_summary: detail.summary ?? '',
        charge_summary: '',
        investigation_findings: '',
        documents: {},
      }
      await generateInvestigationPdf({
        caseInfo: {
          title: detail.title,
          caseRef: detail.case_reference,
          clearance: (detail.classification ?? 'CONFIDENTIAL').replace(/_/g, ' '),
          category: detail.category ?? '',
          status: detail.status,
          lead_institution: detail.lead_institution,
          incident_date: detail.incident_date ?? '',
          location_name: detail.location_name ?? '',
          summary: detail.summary ?? '',
        },
        report,
        investigator: {
          full_name: user?.full_name ?? '',
          role: user?.role ?? '',
          badge_number: user?.badge_number ?? '',
          institution: user?.institution ?? '',
        },
        signatureDataUrl: null,
      })
    } catch (e) {
      console.error('PDF generation failed', e)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-teal-400" />
            <span className="text-sm font-semibold text-white">
              {detail ? detail.case_reference : 'Loading…'}
            </span>
            {detail?.classification && (
              <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', CLASSIFICATION_BADGE[detail.classification] ?? 'text-slate-400 bg-slate-800')}>
                {detail.classification.replace('_', ' ')}
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
              <p className="text-sm">Failed to load case details.</p>
            </div>
          )}

          {loadState === 'ready' && detail && (
            <>
              {/* Title & status */}
              <div>
                <h2 className="text-lg font-bold text-white leading-snug">{detail.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded', STATUS_BADGE[detail.status] ?? 'text-slate-400 bg-slate-800')}>
                    {detail.status.replace(/_/g, ' ')}
                  </span>
                  <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded border', INSTITUTION_BADGE[detail.lead_institution] ?? 'bg-slate-800 text-slate-400')}>
                    Lead: {detail.lead_institution}
                  </span>
                  {detail.category && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      <Tag className="h-3 w-3" />
                      {detail.category}
                    </span>
                  )}
                </div>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/60 rounded-lg p-3 flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Opened</p>
                    <p className="text-xs text-slate-200 mt-0.5">
                      {format(new Date(detail.created_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                </div>
                {detail.incident_date && (
                  <div className="bg-slate-800/60 rounded-lg p-3 flex items-start gap-2">
                    <Clock className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Incident Date</p>
                      <p className="text-xs text-slate-200 mt-0.5">
                        {format(new Date(detail.incident_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </div>
                )}
                {detail.location_name && (
                  <div className="bg-slate-800/60 rounded-lg p-3 flex items-start gap-2 col-span-2">
                    <MapPin className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Location</p>
                      <p className="text-xs text-slate-200 mt-0.5">{detail.location_name}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              {detail.summary && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Summary</p>
                  <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/40 rounded-lg p-3">
                    {detail.summary}
                  </p>
                </div>
              )}

              {/* Progress */}
              {PROGRESS_CONFIG[detail.status] && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                    <span className="font-semibold uppercase tracking-wider">Case Progress</span>
                    <span>{PROGRESS_CONFIG[detail.status].pct}%</span>
                  </div>
                  <div className={clsx('h-2 rounded-full', PROGRESS_CONFIG[detail.status].bg)}>
                    <div
                      className={clsx('h-2 rounded-full', PROGRESS_CONFIG[detail.status].color)}
                      style={{ width: `${PROGRESS_CONFIG[detail.status].pct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Linked suspects */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Linked Suspects ({detail.suspects?.length ?? 0})
                </p>
                {!detail.suspects?.length ? (
                  <p className="text-xs text-slate-600 bg-slate-800/30 rounded-lg px-3 py-4 text-center">
                    No suspects linked to this case.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.suspects.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-200">{s.full_name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{s.ims_reference}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {s.role && (
                            <span className="text-[10px] text-slate-500 bg-slate-700 px-2 py-0.5 rounded">
                              {s.role}
                            </span>
                          )}
                          {s.threat_level && (
                            <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', THREAT_BADGE[s.threat_level] ?? 'text-slate-400 bg-slate-800')}>
                              {s.threat_level}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        {loadState === 'ready' && detail && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-800 shrink-0">
            {canOpenReportEditor && (
              <button
                onClick={() => router.push(`/rib/cases/${caseId}/report`)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 transition"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Full Investigation Report
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              disabled={pdfBusy}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-lg px-3 py-2 transition disabled:opacity-50"
            >
              {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Download Case PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
