'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { alertsApi } from '@/lib/api'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle, Bell, ShieldAlert, Info, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'

const SEVERITY_FILTERS: (AlertSeverity | 'ALL')[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const severityConfig: Record<AlertSeverity, { label: string; color: string; border: string; bg: string; icon: React.ElementType }> = {
  CRITICAL: { label: 'CRITICAL', color: 'text-red-400', border: 'border-l-red-500', bg: 'bg-red-500/10', icon: ShieldAlert },
  HIGH: { label: 'HIGH', color: 'text-orange-400', border: 'border-l-orange-500', bg: 'bg-orange-500/10', icon: AlertTriangle },
  MEDIUM: { label: 'MEDIUM', color: 'text-amber-400', border: 'border-l-amber-500', bg: 'bg-amber-500/10', icon: AlertCircle },
  LOW: { label: 'LOW', color: 'text-blue-400', border: 'border-l-blue-500', bg: 'bg-blue-500/10', icon: Info },
}

const severityBadge: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  MEDIUM: 'bg-amber-500/20 text-amber-400',
  LOW: 'bg-blue-500/20 text-blue-400',
}

export default function NISSAlertsPage() {
  const { user } = useAuth()
  const [activeFilter, setActiveFilter] = useState<AlertSeverity | 'ALL'>('ALL')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [readState, setReadState] = useState<Record<string, boolean>>({})

  useEffect(() => {
    alertsApi.list({ limit: 200 }).then((r) => {
      if (r.data?.alerts?.length) {
        setAlerts(r.data.alerts)
        setReadState(Object.fromEntries(r.data.alerts.map((a: Alert) => [a.id, a.is_read])))
      }
    }).catch(() => {})
  }, [])

  const filteredAlerts = alerts.filter((a) => {
    if (activeFilter !== 'ALL' && a.severity !== activeFilter) return false
    if (unreadOnly && readState[a.id]) return false
    return true
  })

  const totalCount = alerts.length
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL').length
  const unreadCount = alerts.filter((a) => !readState[a.id]).length
  const actionCount = alerts.filter((a) => a.requires_action).length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">ALERTS MANAGEMENT</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Stats pills */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg">
          <Bell className="h-3.5 w-3.5" />
          Total: <span className="font-bold text-white">{totalCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 text-xs px-3 py-1.5 rounded-lg border border-red-500/20">
          <ShieldAlert className="h-3.5 w-3.5" />
          Critical: <span className="font-bold">{criticalCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 text-xs px-3 py-1.5 rounded-lg border border-amber-500/20">
          <Bell className="h-3.5 w-3.5" />
          Unread: <span className="font-bold">{unreadCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 bg-orange-500/10 text-orange-400 text-xs px-3 py-1.5 rounded-lg border border-orange-500/20">
          <AlertTriangle className="h-3.5 w-3.5" />
          Action Required: <span className="font-bold">{actionCount}</span>
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
                activeFilter === f
                  ? 'bg-niss text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="accent-niss h-3.5 w-3.5"
          />
          Unread only
        </label>
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No alerts match the current filters.
          </div>
        )}
        {filteredAlerts.map((alert) => {
          const cfg = severityConfig[alert.severity]
          const Icon = cfg.icon
          const isRead = readState[alert.id]

          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-4 transition-all',
                cfg.border,
                isRead && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-4">
                <div className={clsx('mt-0.5 flex-shrink-0 rounded-lg p-2', cfg.bg)}>
                  <Icon className={clsx('h-4 w-4', cfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', severityBadge[alert.severity])}>
                        {alert.severity}
                      </span>
                      {alert.requires_action && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                          Requires Action
                        </span>
                      )}
                      {!isRead && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-niss/20 text-niss">
                          Unread
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 flex-shrink-0">
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-white">{alert.title}</p>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">{alert.message}</p>
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <SourceTagBadge tag={alert.source_tag} />
                    {alert.suspect_name && (
                      <span className="text-xs text-slate-500">
                        Subject: <span className="text-slate-300 font-medium">{alert.suspect_name}</span>
                      </span>
                    )}
                    <button
                      onClick={() => setReadState((s) => ({ ...s, [alert.id]: !isRead }))}
                      className={clsx(
                        'ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors',
                        isRead
                          ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-niss/20 text-niss hover:bg-niss/30'
                      )}
                    >
                      <CheckCircle className="h-3 w-3" />
                      {isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
