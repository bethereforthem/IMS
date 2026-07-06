'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@/hooks/useAuth'
import { borderVerifyApi, type BorderVerifyPayload, type BorderVerifyResult, type BorderVerification } from '@/lib/api'
import type { ExtractedDocument, DocType } from '@/lib/documentOcr'
import {
  ScanLine, ClipboardList, Loader2, RefreshCw,
  ShieldCheck, ShieldAlert, Clock, ChevronDown, ChevronUp,
  User, CalendarDays, Globe, CreditCard, MapPin,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

const DocumentScanner  = dynamic(() => import('@/components/border/DocumentScanner'),  { ssr: false })
const VerificationResult = dynamic(() => import('@/components/border/VerificationResult'), { ssr: false })

// ── Constants ────────────────────────────────────────────────────────────────

const BORDER_POSTS = [
  'Gatuna / Katuna', 'Cyanika', 'Kagitumba', 'Rusumo', 'Akanyaru / Kibilizi',
  'Poids Lourds', 'Nemba', 'Bugarama', 'Ruhwa', 'Cyangugu / Rusizi',
]

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  CLEAN:         { bg: '#052e16', color: '#22c55e', label: 'Clean'          },
  FLAGGED:       { bg: '#450a0a', color: '#ef4444', label: 'Flagged'        },
  EXPIRED_DOC:   { bg: '#431407', color: '#f97316', label: 'Expired Doc'    },
  SCAN_FAILED:   { bg: '#1e293b', color: '#94a3b8', label: 'Scan Failed'    },
  MANUAL_REVIEW: { bg: '#1e1b4b', color: '#a5b4fc', label: 'Manual Review'  },
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RDFVerifyPage() {
  const { user } = useAuth()
  const [view, setView] = useState<'scan' | 'logs'>('scan')

  // Scan state
  const [extracted, setExtracted]       = useState<ExtractedDocument | null>(null)
  const [form, setForm]                 = useState<Partial<BorderVerifyPayload>>({
    doc_type: 'NATIONAL_ID', border_post: '', notes: '',
  })
  const [submitting, setSubmitting]     = useState(false)
  const [result, setResult]             = useState<BorderVerifyResult | null>(null)
  const [scanError, setScanError]       = useState('')

  // Logs state
  const [logs, setLogs]                 = useState<BorderVerification[]>([])
  const [logsLoading, setLogsLoading]   = useState(false)
  const [logsTotal, setLogsTotal]       = useState(0)
  const [logsPage, setLogsPage]         = useState(1)
  const [expandedLog, setExpandedLog]   = useState<string | null>(null)
  const [logFilter, setLogFilter]       = useState<string>('ALL')
  const [logsMine, setLogsMine]         = useState(false)

  // ── OCR callback ──────────────────────────────────────────────────────────
  const handleExtracted = useCallback((doc: ExtractedDocument) => {
    setExtracted(doc)
    setForm(prev => ({
      ...prev,
      doc_type:      doc.doc_type,
      doc_number:    doc.doc_number ?? '',
      full_name:     doc.full_name  ?? '',
      first_name:    doc.first_name ?? '',
      last_name:     doc.last_name  ?? '',
      date_of_birth: doc.date_of_birth ?? '',
      nationality:   doc.nationality   ?? '',
      gender:        doc.gender        ?? '',
      expiry_date:   doc.expiry_date   ?? '',
      issuing_country: doc.issuing_country ?? '',
      mrz_line1:     doc.mrz_line1 ?? '',
      mrz_line2:     doc.mrz_line2 ?? '',
      raw_ocr_text:  doc.raw_ocr_text,
      scan_method:   doc.scan_method,
      ocr_confidence: doc.ocr_confidence,
    }))
    setScanError('')
  }, [])

  // ── Submit verification ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.doc_type) return
    setSubmitting(true)
    setScanError('')
    try {
      const payload: BorderVerifyPayload = {
        ...form,
        doc_type: form.doc_type as DocType,
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'MOBILE' : 'DESKTOP',
        device_info: navigator.userAgent.slice(0, 200),
      }
      const res = await borderVerifyApi.verify(payload)
      setResult(res.data)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Verification failed'
      setScanError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleManualScanFail = () => {
    setForm(prev => ({ ...prev, scan_failed: true, scan_failure_reason: 'Document unreadable / damaged' }))
    setScanError('')
  }

  const resetScan = () => {
    setExtracted(null)
    setResult(null)
    setScanError('')
    setForm({ doc_type: 'NATIONAL_ID', border_post: form.border_post, notes: '' })
  }

  // ── Load logs ──────────────────────────────────────────────────────────────
  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true)
    try {
      const res = await borderVerifyApi.listVerifications({
        page, limit: 20,
        status: logFilter === 'ALL' ? undefined : logFilter,
        mine: logsMine || undefined,
      })
      setLogs(res.data.verifications)
      setLogsTotal(res.data.total)
      setLogsPage(page)
    } catch { /* silent */ }
    finally { setLogsLoading(false) }
  }, [logFilter, logsMine])

  const switchToLogs = () => {
    setView('logs')
    loadLogs(1)
  }

  const f = (k: keyof BorderVerifyPayload, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
            Identity Verification
          </h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Scan or manually enter document details — checked against IMS, warrants, watchlists & Interpol
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['scan', 'logs'] as const).map(v => (
            <button key={v} onClick={() => v === 'logs' ? switchToLogs() : setView('scan')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: view === v ? '#1e293b' : 'transparent',
                color: view === v ? '#f1f5f9' : '#64748b',
                border: view === v ? '1px solid #334155' : '1px solid transparent',
                borderRadius: '7px', padding: '7px 14px', fontSize: '12px',
                fontWeight: view === v ? 700 : 400, cursor: 'pointer',
              }}>
              {v === 'scan'
                ? <><ScanLine style={{ width: 13, height: 13 }} /> Scan</>
                : <><ClipboardList style={{ width: 13, height: 13 }} /> Log ({logsTotal})</>}
            </button>
          ))}
        </div>
      </div>

      {/* ── SCAN VIEW ── */}
      {view === 'scan' && !result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Left: scanner */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
            <SectionTitle icon={<ScanLine style={{ width: 14, height: 14 }} />} title="Document Scanner" sub="OCR · Camera · File Upload" />
            <DocumentScanner
              onExtracted={handleExtracted}
              onError={msg => setScanError(msg)}
              disabled={submitting}
            />
            {scanError && (
              <div style={{ marginTop: '10px', background: '#450a0a', border: '1px solid #ef444433', borderRadius: '7px', padding: '8px 12px', fontSize: '12px', color: '#fca5a5' }}>
                ⚠️ {scanError}
              </div>
            )}
          </div>

          {/* Right: form */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <SectionTitle icon={<User style={{ width: 14, height: 14 }} />} title="Document Details"
              sub={extracted ? `Extracted (${extracted.ocr_confidence.toFixed(0)}% confidence)` : 'Enter manually or scan first'} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Document Number" value={form.doc_number as string ?? ''} onChange={v => f('doc_number', v)} placeholder="ID / Passport number" />
              <FormField label="Full Name" value={form.full_name as string ?? ''} onChange={v => f('full_name', v)} placeholder="As on document" span2 />
              <FormField label="First Name"  value={form.first_name as string ?? ''}  onChange={v => f('first_name', v)}  placeholder="Given name" />
              <FormField label="Last Name"   value={form.last_name as string ?? ''}   onChange={v => f('last_name', v)}   placeholder="Surname" />
              <FormField label="Date of Birth" value={form.date_of_birth as string ?? ''} onChange={v => f('date_of_birth', v)} type="date" />
              <div>
                <label style={LABEL_STYLE}>Nationality</label>
                <input
                  value={form.nationality as string ?? ''}
                  onChange={e => f('nationality', e.target.value.toUpperCase().slice(0,3))}
                  placeholder="RWA"
                  style={{ ...INPUT_STYLE, textTransform: 'uppercase', fontFamily: 'monospace' }}
                  maxLength={3}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Gender</label>
                <select value={form.gender as string ?? ''} onChange={e => f('gender', e.target.value)} style={INPUT_STYLE}>
                  <option value="">Unknown</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <FormField label="Expiry Date" value={form.expiry_date as string ?? ''} onChange={v => f('expiry_date', v)} type="date" />
              <FormField label="Issuing Country" value={form.issuing_country as string ?? ''} onChange={v => f('issuing_country', v.toUpperCase().slice(0,3))} placeholder="RWA" mono />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #1e293b' }} />

            {/* Context fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={LABEL_STYLE}>Border Post</label>
                <select value={form.border_post as string ?? ''} onChange={e => f('border_post', e.target.value)} style={INPUT_STYLE}>
                  <option value="">Select border post…</option>
                  {BORDER_POSTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL_STYLE}>Notes</label>
                <textarea
                  value={form.notes as string ?? ''}
                  onChange={e => f('notes', e.target.value)}
                  placeholder="Additional observations…"
                  rows={2}
                  style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: '56px' }}
                />
              </div>
            </div>

            {/* MRZ display (read-only if extracted) */}
            {(form.mrz_line1 || form.mrz_line2) && (
              <div style={{ background: '#0a0a0a', border: '1px solid #334155', borderRadius: '6px', padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: '#22c55e' }}>
                <div style={{ color: '#475569', marginBottom: '3px', fontSize: '9px' }}>MRZ DATA</div>
                <div>{form.mrz_line1 as string}</div>
                <div>{form.mrz_line2 as string}</div>
              </div>
            )}

            {/* Scan failed checkbox */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.scan_failed}
                onChange={e => f('scan_failed', e.target.checked)}
                style={{ width: 14, height: 14, accentColor: '#f97316' }}
              />
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Document unreadable / scan failed</span>
            </label>

            <button
              onClick={handleSubmit}
              disabled={submitting || (!form.doc_number && !form.full_name && !form.scan_failed)}
              style={{
                background: submitting ? '#1e293b' : 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff', border: 'none', borderRadius: '8px',
                padding: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting
                ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Verifying…</>
                : <><ScanLine style={{ width: 16, height: 16 }} /> Run Verification</>}
            </button>
          </div>
        </div>
      )}

      {/* ── RESULT VIEW ── */}
      {view === 'scan' && result && (
        <div style={{ maxWidth: '640px' }}>
          <VerificationResult result={result} onDismiss={resetScan} />
        </div>
      )}

      {/* ── LOGS VIEW ── */}
      {view === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '12px 16px' }}>
            {['ALL','CLEAN','FLAGGED','EXPIRED_DOC','SCAN_FAILED'].map(s => (
              <button key={s} onClick={() => { setLogFilter(s); loadLogs(1) }}
                style={{
                  padding: '4px 12px', borderRadius: '5px', border: 'none', fontSize: '11px', fontWeight: 700,
                  cursor: 'pointer',
                  background: logFilter === s ? '#1e293b' : 'transparent',
                  color: logFilter === s ? '#f1f5f9' : '#64748b',
                }}>
                {s.replace('_', ' ')}
              </button>
            ))}
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: '#94a3b8' }}>
              <input type="checkbox" checked={logsMine} onChange={e => { setLogsMine(e.target.checked); loadLogs(1) }}
                style={{ accentColor: '#6366f1' }} />
              My scans only
            </label>
            <button onClick={() => loadLogs(logsPage)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <RefreshCw style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {logsLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <Loader2 style={{ width: 24, height: 24, margin: '0 auto', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', color: '#475569' }}>
              No verification records found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {logs.map(log => {
                const st = STATUS_STYLE[log.verification_status] ?? STATUS_STYLE.MANUAL_REVIEW
                const isExpanded = expandedLog === log.id
                return (
                  <div key={log.id}
                    style={{ background: '#0f172a', border: `1px solid ${log.suspect_match || log.warrant_match ? '#ef444433' : '#1e293b'}`, borderLeft: `4px solid ${st.color}`, borderRadius: '8px', overflow: 'hidden' }}>
                    <div onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                      style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ background: st.bg, color: st.color, fontSize: '10px', fontWeight: 900, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.5px', flexShrink: 0 }}>
                        {st.label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.doc_number ?? '—'} &nbsp;·&nbsp; {log.full_name ?? 'Unknown'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569' }}>
                          {log.doc_type} · {log.scan_method} · {log.border_post ?? 'Unknown post'} · {formatDistanceToNow(new Date(log.verified_at), { addSuffix: true })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {log.warrant_match   && <MatchDot color="#ef4444" title="Warrant" />}
                        {log.watchlist_match && <MatchDot color="#f97316" title="Watchlist" />}
                        {log.interpol_match  && <MatchDot color="#a855f7" title="Interpol" />}
                      </div>
                      <span style={{ color: '#475569' }}>
                        {isExpanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                      </span>
                    </div>
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #1e293b', padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                        <LogDetail icon={<CreditCard style={{ width: 11, height: 11 }} />} label="Doc Number" value={log.doc_number} />
                        <LogDetail icon={<Globe style={{ width: 11, height: 11 }} />} label="Nationality" value={log.nationality} />
                        <LogDetail icon={<CalendarDays style={{ width: 11, height: 11 }} />} label="Expiry" value={log.expiry_date ? format(new Date(log.expiry_date), 'dd MMM yyyy') : null} />
                        <LogDetail icon={<MapPin style={{ width: 11, height: 11 }} />} label="Border Post" value={log.border_post} />
                        <LogDetail icon={<User style={{ width: 11, height: 11 }} />} label="Officer" value={log.badge_number} />
                        <LogDetail icon={<Clock style={{ width: 11, height: 11 }} />} label="Time" value={format(new Date(log.verified_at), 'dd MMM HH:mm')} />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Pagination */}
              {logsTotal > 20 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '8px' }}>
                  <button disabled={logsPage <= 1} onClick={() => loadLogs(logsPage - 1)}
                    style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px' }}>
                    Prev
                  </button>
                  <span style={{ color: '#64748b', fontSize: '12px', lineHeight: '30px' }}>
                    Page {logsPage} of {Math.ceil(logsTotal / 20)}
                  </span>
                  <button disabled={logsPage >= Math.ceil(logsTotal / 20)} onClick={() => loadLogs(logsPage + 1)}
                    style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px' }}>
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
      <span style={{ color: '#6366f1' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{title}</div>
        <div style={{ fontSize: '10px', color: '#64748b' }}>{sub}</div>
      </div>
    </div>
  )
}

const LABEL_STYLE: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }
const INPUT_STYLE: React.CSSProperties = { width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', color: '#f1f5f9', outline: 'none', boxSizing: 'border-box' }

function FormField({ label, value, onChange, placeholder, type = 'text', span2, mono }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; span2?: boolean; mono?: boolean
}) {
  return (
    <div style={span2 ? { gridColumn: '1 / -1' } : undefined}>
      <label style={LABEL_STYLE}>{label}</label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...INPUT_STYLE, fontFamily: mono ? 'monospace' : undefined }}
      />
    </div>
  )
}

function MatchDot({ color, title }: { color: string; title: string }) {
  return <span title={title} style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
}

function LogDetail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{value}</div>
    </div>
  )
}
