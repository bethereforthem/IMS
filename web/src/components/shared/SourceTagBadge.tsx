import clsx from 'clsx'
import type { SourceTag } from '@/types'

const labelMap: Record<SourceTag, string> = {
  CCTV_NODE:     'CCTV',
  FACE_SCAN:     'Face Scan',
  NID_SCAN:      'NID Scan',
  NID_MANUAL:    'NID Manual',
  INTERPOL_FEED: 'Interpol',
  PARTNER_QUERY: 'Partner',
  OFFICER_REPORT:'Officer',
  SYSTEM_ALERT:  'System',
}
const colorMap: Record<SourceTag, string> = {
  CCTV_NODE:     'bg-blue-950 text-blue-300 border-blue-800',
  FACE_SCAN:     'bg-purple-950 text-purple-300 border-purple-800',
  NID_SCAN:      'bg-teal-950 text-teal-300 border-teal-800',
  NID_MANUAL:    'bg-cyan-950 text-cyan-300 border-cyan-800',
  INTERPOL_FEED: 'bg-red-950 text-red-300 border-red-800',
  PARTNER_QUERY: 'bg-orange-950 text-orange-300 border-orange-800',
  OFFICER_REPORT:'bg-slate-800 text-slate-300 border-slate-700',
  SYSTEM_ALERT:  'bg-yellow-950 text-yellow-300 border-yellow-800',
}

export function SourceTagBadge({ tag }: { tag: SourceTag }) {
  return (
    <span className={clsx('inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', colorMap[tag])}>
      {labelMap[tag]}
    </span>
  )
}
