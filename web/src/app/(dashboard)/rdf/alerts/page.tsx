'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { alertsApi } from '@/lib/api'
import { AlertTriangle, Shield, Info, CheckCircle, Bell, BellOff } from 'lucide-react'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { AlertSeverity, Alert } from '@/types'

const SEVERITY_FILTERS: (AlertSeverity | 'ALL')[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

type PostFilter = 'ALL' | 'GATUNA' | 'RUBAVU' | 'RUSIZI' | 'NYAGATARE'
const POST_FILTERS: PostFilter[] = ['ALL', 'GATUNA', 'RUBAVU', 'RUSIZI', 'NYAGATARE']

const severityBorder: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-orange-500',
  MEDIUM:   'border-l-amber-500',
  LOW:      'border-l-slate-500',
}
const severityBadge: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400',
  HIGH:     'bg-orange-500/20 text-orange-400',
  MEDIUM:   'bg-amber-500/20 text-amber-400',
  LOW:      'bg-slate-500/20 text-slate-400',
}
const severityIcon: Record<AlertSeverity, typeof AlertTriangle> = {
  CRITICAL: AlertTriangle,
  HIGH:     AlertTriangle,
  MEDIUM:   Info,
  LOW:      Shield,
}

export default function RDFAlertsPage() {
  const { user } = useAuth()
  const [alerts, setAlerts]                     = useState<Alert[]>([])
  const [severityFilter, setSeverityFilter]     = useState<AlertSeverity | 'ALL'>('ALL')
  const [postFilter, setPostFilter]             = useState<PostFilter>('ALL')
  const [readState, setReadState]               = useState<Record<string, boolean>>({})

  useEffect(() => {
    alertsApi.list({ limit: 200 }).then(r => {
      if (r.data?.alerts?.length) {
        const fetched: Alert[] = r.data.alerts
        setAlerts(fetched)
        setReadState(Object.fromEntries(fetched.map((a: Alert) => [a.id, a.is_read])))
      }
    }).catch(() => {})
  }, [])

  const toggleRead = (id: string) =>
    setReadState(prev => ({ ...prev, [id]: !prev[id] }))

  const filtered = alerts.filter(a => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
    if (postFilter !== 'ALL') {
      const lower = a.message.toLowerCase() + a.title.toLowerCase()
      if (!lower.includes(postFilter.toLowerCase())) return false
    }
    return true
  })

  const unreadCount = Object.values(readState).filter(v => !v).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">RDF BORDER ALERTS</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500">
          <span className="text-white font-semibold">{unreadCount}</span> unread ·{' '}
          <span className="text-white font-semibold">{alerts.filter(a => a.requires_action).length}</span> require action
        </span>
        {alerts.filter(a => a.severity === 'CRITICAL').length > 0 && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 animate-pulse">
            {alerts.filter(a => a.severity === 'CRITICAL').length} CRITICAL
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Severity:</span>
            {SEVERITY_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setSeverityFilter(f as AlertSeverity | 'ALL')}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                  severityFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Border Post:</span>
          {POST_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setPostFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                postFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-500">
        Showing <span className="text-white font-semibold">{filtered.length}</span> of {alerts.length} alerts
      </p>

      {/* Alert cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-sm text-slate-600">No alerts match the current filters.</p>
          </div>
        )}
        {filtered.map(alert => {
          const SevIcon = severityIcon[alert.severity]
          const isRead = readState[alert.id]
          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-4 transition-opacity',
                severityBorder[alert.severity],
                isRead && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <SevIcon className={clsx(
                    'h-4 w-4 shrink-0 mt-0.5',
                    alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'text-red-400' :
                    alert.severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-400'
                  )} />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', severityBadge[alert.severity])}>
                        {alert.severity}
                      </span>
                      {alert.requires_action && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                          ACTION REQUIRED
                        </span>
                      )}
                      {isRead && (
                        <span className="text-[10px] text-slate-600 uppercase font-semibold">READ</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">{alert.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{alert.message}</p>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <SourceTagBadge tag={alert.source_tag} />
                      {alert.suspect_name && (
                        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                          {alert.suspect_name}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleRead(alert.id)}
                  className={clsx(
                    'shrink-0 p-1.5 rounded-lg transition-colors',
                    isRead
                      ? 'text-slate-600 hover:text-slate-400 bg-slate-800/50'
                      : 'text-rdf hover:text-white bg-rdf/10 hover:bg-rdf/20'
                  )}
                  title={isRead ? 'Mark as unread' : 'Mark as read'}
                >
                  {isRead ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Emergency Protocol info box */}
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">Emergency Protocol — CRITICAL Border Alert</h3>
        </div>
        <div className="space-y-1.5 text-xs text-slate-400 leading-relaxed">
          <p>When a <span className="text-amber-400 font-semibold">CRITICAL</span> border alert fires, the duty officer must immediately:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Contact <span className="text-white font-medium">RNP Border Police</span> at the relevant post via secure radio (Channel 7).</li>
            <li>Activate <span className="text-white font-medium">all GTN-BORDER camera nodes</span> to maximum recording — verify heartbeats in Camera Nodes panel.</li>
            <li>Notify <span className="text-white font-medium">NISS Command Centre</span> via secure line and submit an initial incident report within 15 minutes.</li>
            <li>If suspect is <span className="text-orange-400 font-semibold">INTERPOL_FLAGGED</span>, cross-notify the ICPO Liaison Officer immediately.</li>
            <li>Log all actions in the IMS event log with officer badge and timestamp for audit trail.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
