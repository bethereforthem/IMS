'use client'

import { ShieldCheck, ShieldAlert, AlertTriangle, Clock, User, FileText, Globe, CalendarDays } from 'lucide-react'
import type { BorderVerifyResult } from '@/lib/api'
import { format, isAfter } from 'date-fns'

interface VerificationResultProps {
  result: BorderVerifyResult
  onDismiss: () => void
}

const STATUS_CONFIG = {
  CLEAN:         { bg: '#052e16', border: '#22c55e44', color: '#22c55e', icon: ShieldCheck,  label: 'CLEARED — No Records Found' },
  FLAGGED:       { bg: '#450a0a', border: '#ef444466', color: '#ef4444', icon: ShieldAlert,  label: 'FLAGGED — Matches Found in IMS' },
  EXPIRED_DOC:   { bg: '#431407', border: '#f9731666', color: '#f97316', icon: Clock,        label: 'EXPIRED DOCUMENT' },
  SCAN_FAILED:   { bg: '#1e293b', border: '#64748b66', color: '#94a3b8', icon: AlertTriangle, label: 'SCAN FAILED — Manual Review Required' },
  MANUAL_REVIEW: { bg: '#1e1b4b', border: '#6366f166', color: '#a5b4fc', icon: AlertTriangle, label: 'MANUAL REVIEW REQUIRED' },
  DETAINED:      { bg: '#450a0a', border: '#ef444466', color: '#ef4444', icon: ShieldAlert,  label: 'DETAINED' },
  CLEARED:       { bg: '#052e16', border: '#22c55e44', color: '#22c55e', icon: ShieldCheck,  label: 'CLEARED' },
}

const RISK_COLOR = { LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }

export default function VerificationResult({ result, onDismiss }: VerificationResultProps) {
  const cfg = STATUS_CONFIG[result.verification_status] ?? STATUS_CONFIG.MANUAL_REVIEW
  const Icon = cfg.icon
  const riskColor = RISK_COLOR[result.risk_level] ?? '#94a3b8'
  const isFlagged = ['FLAGGED','DETAINED'].includes(result.verification_status)

  return (
    <div style={{
      border: `2px solid ${cfg.color}`,
      borderRadius: '12px',
      overflow: 'hidden',
      background: cfg.bg,
      animation: isFlagged ? 'pulse-border 1.5s ease-in-out 3' : undefined,
    }}>
      {/* Header banner */}
      <div style={{
        background: cfg.color,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <Icon style={{ width: 24, height: 24, color: '#fff', flexShrink: 0 }} />
        <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff', letterSpacing: '0.5px', flex: 1 }}>
          {cfg.label}
        </span>
        <span style={{
          background: 'rgba(0,0,0,0.25)', color: '#fff',
          fontSize: '11px', fontWeight: 800, padding: '3px 10px',
          borderRadius: '20px', letterSpacing: '0.5px',
        }}>
          {result.risk_level}
        </span>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Match flags */}
        {isFlagged && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {result.suspect_match   && <Flag label="SUSPECT MATCH"   color="#ef4444" />}
            {result.warrant_match   && <Flag label="ACTIVE WARRANT"  color="#dc2626" />}
            {result.watchlist_match && <Flag label="WATCHLIST MATCH" color="#f97316" />}
            {result.interpol_match  && <Flag label="INTERPOL NOTICE" color="#a855f7" />}
            {result.doc_expired     && <Flag label="EXPIRED DOCUMENT" color="#f59e0b" />}
          </div>
        )}

        {result.doc_expired && !isFlagged && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Flag label="DOCUMENT EXPIRED" color="#f59e0b" />
          </div>
        )}

        {/* Suspect details */}
        {result.suspect && (
          <div style={{ background: '#0f172a', border: '1px solid #ef444444', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User style={{ width: 12, height: 12 }} /> IMS Record
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <DetailRow label="Name"        value={[result.suspect.first_name, result.suspect.last_name].filter(Boolean).join(' ')} />
              <DetailRow label="IMS Ref"     value={result.suspect.ims_reference} />
              <DetailRow label="Status"      value={result.suspect.status} />
              <DetailRow label="Threat"      value={`${result.suspect.threat_level}/5`} />
              {result.suspect.date_of_birth && (
                <DetailRow label="DOB" value={format(new Date(result.suspect.date_of_birth), 'dd MMM yyyy')} />
              )}
              {result.suspect.nationality && (
                <DetailRow label="Nationality" value={result.suspect.nationality} />
              )}
            </div>

            {result.suspect.active_warrants.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  Active Warrants ({result.suspect.active_warrants.length})
                </div>
                {result.suspect.active_warrants.map(w => (
                  <div key={w.id} style={{ background: '#1e293b', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px', fontSize: '12px', color: '#cbd5e1' }}>
                    <div style={{ fontWeight: 700, color: '#f97316' }}>{w.warrant_type}</div>
                    <div>{w.charges}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      Issued: {format(new Date(w.issued_at), 'dd MMM yyyy')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Verification metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <InfoCard icon={<FileText style={{ width: 13, height: 13 }} />} label="Verification ID" value={result.verification_id.slice(0, 8).toUpperCase()} />
          <InfoCard icon={<Clock style={{ width: 13, height: 13 }} />} label="Verified At"
            value={format(new Date(result.verified_at), 'HH:mm:ss dd MMM yyyy')} />
          {result.alert_id && (
            <InfoCard icon={<AlertTriangle style={{ width: 13, height: 13 }} />} label="Alert Created" value={result.alert_id.slice(0, 8).toUpperCase()} color="#f97316" />
          )}
        </div>

        {/* Instruction for flagged */}
        {isFlagged && (
          <div style={{ background: '#450a0a', border: '1px solid #ef444433', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#fca5a5', lineHeight: 1.6 }}>
            ⚠️ <strong>Action required:</strong> Detain the individual, do not allow crossing. An alert has been sent to command. Wait for further instructions.
          </div>
        )}

        <button
          onClick={onDismiss}
          style={{
            background: isFlagged ? '#ef4444' : '#1e293b',
            color: '#fff', border: 'none', borderRadius: '8px',
            padding: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
          }}
        >
          {isFlagged ? 'Acknowledged — Proceed with Detention' : 'New Verification'}
        </button>
      </div>

      <style>{`
        @keyframes pulse-border {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0.3); }
        }
      `}</style>
    </div>
  )
}

function Flag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      fontSize: '10px', fontWeight: 900, padding: '3px 10px',
      borderRadius: '4px', letterSpacing: '0.5px',
    }}>{label}</span>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function InfoCard({ icon, label, value, color = '#64748b' }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '7px', padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color, marginBottom: '2px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}
