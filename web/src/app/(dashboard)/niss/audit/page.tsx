'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { format } from 'date-fns'
import { Download, ShieldAlert, Users, XCircle, Flag } from 'lucide-react'
import clsx from 'clsx'

interface AuditEntry {
  id: string
  timestamp: string
  badge_number: string
  full_name: string
  institution: string
  action: string
  resource: string
  result: 'SUCCESS' | 'DENIED' | 'FLAGGED'
  ip_address: string
}

const AUDIT_LOG: AuditEntry[] = [
  { id: 'aul-01', timestamp: '2026-06-30T06:02:11Z', badge_number: 'NISS-OFF-001', full_name: 'Col. Jean-Pierre Habimana', institution: 'NISS', action: 'LOGIN', resource: 'AUTH_SERVICE', result: 'SUCCESS', ip_address: '196.20.14.3' },
  { id: 'aul-02', timestamp: '2026-06-30T06:05:44Z', badge_number: 'NISS-OFF-001', full_name: 'Col. Jean-Pierre Habimana', institution: 'NISS', action: 'VIEW_SUSPECT', resource: 'RWA-IMS-2025-00002', result: 'SUCCESS', ip_address: '196.20.14.3' },
  { id: 'aul-03', timestamp: '2026-06-30T06:07:18Z', badge_number: 'NISS-OFF-001', full_name: 'Col. Jean-Pierre Habimana', institution: 'NISS', action: 'VIEW_INTELLIGENCE', resource: 'EVENTS_FEED', result: 'SUCCESS', ip_address: '196.20.14.3' },
  { id: 'aul-04', timestamp: '2026-06-29T22:45:01Z', badge_number: 'RNP-DET-004', full_name: 'Insp. Bernard Nzeyimana', institution: 'RNP', action: 'SEARCH_SUSPECTS', resource: 'SUSPECTS_API', result: 'FLAGGED', ip_address: '196.20.11.87' },
  { id: 'aul-05', timestamp: '2026-06-29T22:44:58Z', badge_number: 'RNP-DET-004', full_name: 'Insp. Bernard Nzeyimana', institution: 'RNP', action: 'SEARCH_SUSPECTS', resource: 'SUSPECTS_API', result: 'FLAGGED', ip_address: '196.20.11.87' },
  { id: 'aul-06', timestamp: '2026-06-29T09:15:03Z', badge_number: 'NISS-OFF-003', full_name: 'Agnes Uwingabire', institution: 'NISS', action: 'MFA_FAILURE', resource: 'AUTH_SERVICE', result: 'DENIED', ip_address: '196.20.9.201' },
  { id: 'aul-07', timestamp: '2026-06-29T09:16:44Z', badge_number: 'NISS-OFF-003', full_name: 'Agnes Uwingabire', institution: 'NISS', action: 'MFA_FAILURE', resource: 'AUTH_SERVICE', result: 'DENIED', ip_address: '196.20.9.201' },
  { id: 'aul-08', timestamp: '2026-06-29T09:17:10Z', badge_number: 'NISS-OFF-003', full_name: 'Agnes Uwingabire', institution: 'NISS', action: 'MFA_FAILURE', resource: 'AUTH_SERVICE', result: 'DENIED', ip_address: '196.20.9.201' },
  { id: 'aul-09', timestamp: '2026-06-29T08:00:30Z', badge_number: 'RIB-ANL-001', full_name: 'Lt. Celestin Rugema', institution: 'RIB', action: 'LOGIN', resource: 'AUTH_SERVICE', result: 'SUCCESS', ip_address: '196.20.17.55' },
  { id: 'aul-10', timestamp: '2026-06-29T08:45:00Z', badge_number: 'RIB-ANL-001', full_name: 'Lt. Celestin Rugema', institution: 'RIB', action: 'VIEW_LOCATION', resource: 'LOCATION_INTEL', result: 'FLAGGED', ip_address: '196.20.17.55' },
  { id: 'aul-11', timestamp: '2026-06-28T19:30:00Z', badge_number: 'RDF-BRD-001', full_name: 'Capt. Olivier Nshimiyimana', institution: 'RDF', action: 'VIEW_CASE', resource: 'RIB-2025-DT-00008', result: 'SUCCESS', ip_address: '196.20.5.22' },
  { id: 'aul-12', timestamp: '2026-06-28T14:10:00Z', badge_number: 'RCS-SUP-001', full_name: 'Warden Florence Mukagasana', institution: 'RCS', action: 'EXPORT_REPORT', resource: 'CORRECTIONS_MODULE', result: 'SUCCESS', ip_address: '196.20.8.130' },
  { id: 'aul-13', timestamp: '2026-06-27T02:47:00Z', badge_number: 'RCS-OFF-002', full_name: 'Diomede Nkurunziza', institution: 'RCS', action: 'LOGIN', resource: 'AUTH_SERVICE', result: 'FLAGGED', ip_address: '196.20.8.145' },
  { id: 'aul-14', timestamp: '2026-06-26T11:00:00Z', badge_number: 'RNP-CMD-001', full_name: 'Comm. Alice Nyiraneza', institution: 'RNP', action: 'EMERGENCY_LOCKDOWN_ATTEMPT', resource: 'SYSTEM_CONTROL', result: 'DENIED', ip_address: '196.20.11.4' },
  { id: 'aul-15', timestamp: '2026-06-25T18:00:00Z', badge_number: 'NISS-OFF-002', full_name: 'Maj. Sylvain Uwimana', institution: 'NISS', action: 'LOGOUT', resource: 'AUTH_SERVICE', result: 'SUCCESS', ip_address: '196.20.14.7' },
]

const INSTITUTIONS = ['ALL', ...Array.from(new Set(AUDIT_LOG.map((e) => e.institution)))]
const ACTIONS = ['ALL', ...Array.from(new Set(AUDIT_LOG.map((e) => e.action)))]
const RESULTS = ['ALL', 'SUCCESS', 'DENIED', 'FLAGGED'] as const

const resultBadge: Record<AuditEntry['result'], string> = {
  SUCCESS: 'bg-green-500/20 text-green-400',
  DENIED: 'bg-red-500/20 text-red-400',
  FLAGGED: 'bg-amber-500/20 text-amber-400',
}

export default function NISSAuditPage() {
  const { user } = useAuth()
  const [institutionFilter, setInstitutionFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [resultFilter, setResultFilter] = useState<'ALL' | AuditEntry['result']>('ALL')

  const filtered = AUDIT_LOG.filter((e) => {
    if (institutionFilter !== 'ALL' && e.institution !== institutionFilter) return false
    if (actionFilter !== 'ALL' && e.action !== actionFilter) return false
    if (resultFilter !== 'ALL' && e.result !== resultFilter) return false
    return true
  })

  const denied = AUDIT_LOG.filter((e) => e.result === 'DENIED').length
  const flagged = AUDIT_LOG.filter((e) => e.result === 'FLAGGED').length
  const uniqueUsers = new Set(AUDIT_LOG.map((e) => e.badge_number)).size

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">AUDIT LOG</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Stats + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          {[
            { label: 'Total Events', value: AUDIT_LOG.length, icon: ShieldAlert, cls: 'text-slate-300 border-slate-700' },
            { label: 'Denied', value: denied, icon: XCircle, cls: 'text-red-400 border-red-500/20 bg-red-500/5' },
            { label: 'Flagged', value: flagged, icon: Flag, cls: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
            { label: 'Unique Users', value: uniqueUsers, icon: Users, cls: 'text-niss border-niss/20 bg-niss/5' },
          ].map((s) => (
            <div
              key={s.label}
              className={clsx('inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border', s.cls)}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}: <span className="font-bold">{s.value}</span>
            </div>
          ))}
        </div>
        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export Audit Log
          </button>
          <div className="absolute right-0 top-full mt-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 text-[10px] text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            Available in production
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {INSTITUTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setInstitutionFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                institutionFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setActionFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                actionFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RESULTS.map((f) => (
            <button
              key={f}
              onClick={() => setResultFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                resultFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Badge</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Institution</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Resource</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Result</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-600">
                    No audit events match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                    {format(new Date(e.timestamp), 'MMM d, HH:mm:ss')}
                  </td>
                  <td className="px-4 py-3 font-mono text-niss whitespace-nowrap">{e.badge_number}</td>
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{e.full_name}</td>
                  <td className="px-4 py-3">
                    <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full">
                      {e.institution}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-400 text-[10px]">{e.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-500 text-[10px]">{e.resource}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', resultBadge[e.result])}>
                      {e.result}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-[10px]">{e.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
