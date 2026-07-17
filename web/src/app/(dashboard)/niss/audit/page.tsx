'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { auditApi } from '@/lib/api'
import { format } from 'date-fns'
import { Download, ShieldAlert, Users, Loader2, PlusCircle, Trash2 } from 'lucide-react'
import clsx from 'clsx'

interface AuditEntry {
  id: number
  event_timestamp: string
  event_type: string
  action: string
  actor_name: string | null
  actor_badge: string | null
  actor_institution: string | null
  target_type: string | null
  target_id: string | null
  ip_address: string | null
}

const INSTITUTIONS = ['ALL', 'NISS', 'RNP', 'RIB', 'RDF', 'RCS', 'SYSTEM']
const ACTIONS = ['ALL', 'CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT']

const actionBadge: Record<string, string> = {
  CREATE: 'bg-green-500/20 text-green-400',
  UPDATE: 'bg-blue-500/20 text-blue-400',
  DELETE: 'bg-red-500/20 text-red-400',
  READ:   'bg-slate-500/20 text-slate-400',
  LOGIN:  'bg-purple-500/20 text-purple-400',
  LOGOUT: 'bg-amber-500/20 text-amber-400',
  EXPORT: 'bg-orange-500/20 text-orange-400',
}

export default function NISSAuditPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [institutionFilter, setInstitutionFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string | number> = { limit: 100 }
    if (institutionFilter !== 'ALL') params.institution = institutionFilter
    if (actionFilter !== 'ALL') params.action = actionFilter
    auditApi.list(params)
      .then(r => {
        setEntries((r.data?.entries ?? []) as unknown as AuditEntry[])
        setTotal(r.data?.total ?? 0)
        setActionCounts(r.data?.action_counts ?? {})
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [institutionFilter, actionFilter])

  useEffect(() => { load() }, [load])

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ export: 'csv', limit: '5000' })
      if (institutionFilter !== 'ALL') params.set('institution', institutionFilter)
      if (actionFilter !== 'ALL') params.set('action', actionFilter)
      const token = document.cookie.split('; ').find(r => r.startsWith('ims_access_token='))?.split('=')[1]
      const res = await fetch(`/api/v1/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
    finally { setExporting(false) }
  }

  const creates = actionCounts.CREATE ?? 0
  const deletes = actionCounts.DELETE ?? 0
  const uniqueUsers = new Set(entries.map(e => e.actor_badge).filter(Boolean)).size

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
            { label: 'Total Events', value: total, icon: ShieldAlert, cls: 'text-slate-300 border-slate-700' },
            { label: 'Creates', value: creates, icon: PlusCircle, cls: 'text-green-400 border-green-500/20 bg-green-500/5' },
            { label: 'Deletes', value: deletes, icon: Trash2, cls: 'text-red-400 border-red-500/20 bg-red-500/5' },
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
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Audit Log
        </button>
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
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Event</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-600">
                    Loading audit trail…
                  </td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-600">
                    No audit events match the current filters.
                  </td>
                </tr>
              )}
              {!loading && entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/50 text-xs hover:bg-slate-800/20">
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                    {format(new Date(e.event_timestamp), 'MMM d, HH:mm:ss')}
                  </td>
                  <td className="px-4 py-3 font-mono text-niss whitespace-nowrap">{e.actor_badge ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{e.actor_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full">
                      {e.actor_institution ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-400 text-[10px]">{e.event_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-slate-500 text-[10px]">
                      {e.target_type ? `${e.target_type}${e.target_id ? ` · ${String(e.target_id).slice(0, 8)}` : ''}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', actionBadge[e.action] ?? 'bg-slate-800 text-slate-400')}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-[10px]">{e.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
