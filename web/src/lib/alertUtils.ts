import type { Alert, AlertSeverity } from '@/types'

export type KnownInstitution = 'NISS' | 'RNP' | 'RDF' | 'RIB' | 'RCS' | 'VILLAGE_LEADER'

const FWD_RE = /^\[FWD:([A-Z_]+)\]\s*/

export function parseForwardedFrom(title: string): KnownInstitution | null {
  const m = title.match(FWD_RE)
  return m ? (m[1] as KnownInstitution) : null
}

export function stripFwdPrefix(title: string): string {
  return title.replace(FWD_RE, '')
}

const SRC_TAG_INST: Record<string, KnownInstitution | null> = {
  CCTV_NODE:         'RDF',
  INTERPOL_FEED:     'NISS',
  PARTNER_QUERY:     'NISS',
  FACE_SCAN:         'NISS',
  PATROL_REPORT:     'RNP',
  VILLAGE_NID_CHECK: 'RNP',
  OFFICER_REPORT:    null,
  NID_SCAN:          null,
  NID_MANUAL:        null,
  SYSTEM_ALERT:      null,
  SOS_EMERGENCY:     null,
  OFFICER_NID_CHECK: null,
}

export function alertSourceInstitution(alert: Alert): KnownInstitution | null {
  const fwd = parseForwardedFrom(alert.title)
  if (fwd) return fwd
  return SRC_TAG_INST[alert.source_tag] ?? null
}

export const INST_STYLE: Record<KnownInstitution, { badge: string; dot: string; label: string }> = {
  NISS:           { badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30', dot: 'bg-purple-400', label: 'NISS' },
  RNP:            { badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',       dot: 'bg-blue-400',   label: 'RNP'  },
  RDF:            { badge: 'bg-green-500/20 text-green-300 border border-green-500/30',    dot: 'bg-green-400',  label: 'RDF'  },
  RIB:            { badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',    dot: 'bg-amber-400',  label: 'RIB'  },
  RCS:            { badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',    dot: 'bg-slate-400',  label: 'RCS'  },
  VILLAGE_LEADER: { badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30', dot: 'bg-orange-400', label: 'VILLAGE' },
}

export const SEV_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-orange-500',
  MEDIUM:   'border-l-amber-500',
  LOW:      'border-l-blue-500',
}

export const SEV_BADGE: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400',
  HIGH:     'bg-orange-500/20 text-orange-400',
  MEDIUM:   'bg-amber-500/20 text-amber-400',
  LOW:      'bg-blue-500/20 text-blue-400',
}

export const SEV_ICON_CLS: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-400',
  HIGH:     'text-orange-400',
  MEDIUM:   'text-amber-400',
  LOW:      'text-blue-400',
}
