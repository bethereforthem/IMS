import { formatDistanceToNow, format } from 'date-fns'
import type { IntelligenceEvent } from '@/types'

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#22c55e',
}

const INSTITUTION_LABEL: Record<string, string> = {
  RNP:            'Rwanda National Police',
  RDF:            'Rwanda Defence Force',
  NISS:           'National Intelligence',
  VILLAGE_LEADER: 'Village Leader',
  RIB:            'Investigation Bureau',
  RCS:            'Correctional Service',
  SYSTEM:         'System',
}

export function parseAlertNotes(notes?: string): { type: string; description: string } {
  if (!notes) return { type: 'Alert', description: '' }
  if (notes.startsWith('SOS_EMERGENCY:')) {
    return { type: 'SOS Emergency', description: notes.replace('SOS_EMERGENCY:', '').trim() }
  }
  if (notes.startsWith('VILLAGE_NID_CHECK:')) {
    return { type: 'Village NID Check', description: notes.replace('VILLAGE_NID_CHECK:', '').trim() }
  }
  if (notes.startsWith('OFFICER_NID_CHECK:')) {
    return { type: 'Officer NID Match', description: notes.replace('OFFICER_NID_CHECK:', '').trim() }
  }
  try {
    const parsed = JSON.parse(notes) as Record<string, string>
    const desc = parsed.description ?? parsed.insecurity_type ?? parsed.title ?? ''
    const type = parsed.insecurity_type ?? parsed.priority ?? 'Report'
    return { type, description: desc }
  } catch {
    return { type: 'Alert', description: notes.slice(0, 120) }
  }
}

export function alertEventSeverity(ev: IntelligenceEvent): string {
  const notes = ev.notes ?? ''
  if (notes.startsWith('SOS_EMERGENCY:')) return 'CRITICAL'
  if (ev.criminal_record_found) return 'CRITICAL'
  return 'HIGH'
}

export function alertSignalIconHtml(severity: string): string {
  const color  = SEVERITY_COLOR[severity] ?? '#ef4444'
  const isSos  = severity === 'CRITICAL'
  const size   = isSos ? 30 : 24
  const half   = size / 2
  const pulse  = isSos
    ? `animation:ims-alert-pulse 0.8s ease-in-out infinite`
    : `animation:ims-alert-pulse 1.4s ease-in-out infinite`
  return `<div style="
    position:relative;width:${size}px;height:${size}px;
    background:${color};border-radius:50%;
    border:2.5px solid rgba(255,255,255,0.85);
    display:flex;align-items:center;justify-content:center;
    font-size:${half - 2}px;line-height:1;
    box-shadow:0 0 12px ${color};
    ${pulse};
  ">🔔</div>`
}

export function alertSignalPopupHtml(ev: IntelligenceEvent): string {
  const severity    = alertEventSeverity(ev)
  const bgColor     = SEVERITY_COLOR[severity] ?? '#ef4444'
  const { type, description } = parseAlertNotes(ev.notes)
  const institution = INSTITUTION_LABEL[ev.institution ?? ''] ?? (ev.institution ?? 'Unknown')
  const srcLabel    = ev.source_tag?.replace(/_/g, ' ') ?? '—'
  const coordStr    = `${ev.location_lat?.toFixed(5) ?? '?'}, ${ev.location_lng?.toFixed(5) ?? '?'}`
  const timeAgo     = (() => { try { return formatDistanceToNow(new Date(ev.created_at), { addSuffix: true }) } catch { return '—' } })()
  const timeExact   = (() => { try { return format(new Date(ev.created_at), 'dd MMM yyyy HH:mm') } catch { return '—' } })()
  const isSos       = (ev.notes ?? '').startsWith('SOS_EMERGENCY:')
  const suspectLine = ev.suspect_name
    ? `<div><span style="color:#64748b;font-weight:bold">SUBJECT </span><span style="color:#f87171">${ev.suspect_name}</span></div>`
    : ''

  return `
    <div style="min-width:240px;max-width:280px;background:#0f172a;color:#e2e8f0;border-radius:6px;padding:6px;font-family:system-ui;font-size:12px">
      <!-- Severity header -->
      <div style="background:${bgColor};border-radius:3px;padding:5px 12px;margin-bottom:8px;text-align:center">
        <span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:1px">
          ${isSos ? '🚨 ' : '⚠ '}${severity} ALERT
        </span>
      </div>

      <!-- Type label -->
      <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${type}</div>

      ${description ? `<div style="color:#cbd5e1;font-size:13px;margin-bottom:10px;line-height:1.5">${description.slice(0, 100)}${description.length > 100 ? '…' : ''}</div>` : ''}

      <!-- Details -->
      <div style="background:#1e293b;border-radius:4px;padding:8px 10px;font-family:'Courier New',monospace;font-size:10px;line-height:2">
        <div><span style="color:#64748b;font-weight:bold">FROM   </span><span style="color:#e2e8f0">${institution}</span></div>
        <div><span style="color:#64748b;font-weight:bold">SOURCE </span><span style="color:#e2e8f0">${srcLabel}</span></div>
        ${suspectLine}
        <div><span style="color:#64748b;font-weight:bold">GPS    </span><span style="color:#e2e8f0">${coordStr}</span></div>
        <div><span style="color:#64748b;font-weight:bold">TIME   </span><span style="color:#e2e8f0">${timeAgo}</span></div>
      </div>

      <div style="font-size:9px;color:#475569;text-align:right;margin-top:6px;font-family:'Courier New',monospace">${timeExact}</div>
    </div>
  `
}

export type AlertSoundType = 'sos' | 'criminal' | 'suspect'

export function alertEventSoundType(ev: IntelligenceEvent): AlertSoundType {
  if ((ev.notes ?? '').startsWith('SOS_EMERGENCY:')) return 'sos'
  if (ev.criminal_record_found) return 'criminal'
  return 'suspect'
}
