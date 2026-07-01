'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { Bell, AlertTriangle, XCircle, Info, CheckCheck, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'

type SeverityFilter = 'ALL' | AlertSeverity

const SEVERITY_FILTERS: SeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-amber-500',
  MEDIUM: 'border-l-yellow-500',
  LOW: 'border-l-slate-500',
}

const SEVERITY_ICON_CLASS: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-yellow-400',
  LOW: 'text-slate-400',
}

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-950 text-red-400',
  HIGH: 'bg-amber-950 text-amber-400',
  MEDIUM: 'bg-yellow-950 text-yellow-400',
  LOW: 'bg-slate-800 text-slate-400',
}

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  const cls = clsx('h-4 w-4 shrink-0', SEVERITY_ICON_CLASS[severity])
  if (severity === 'CRITICAL') return <XCircle className={cls} />
  if (severity === 'HIGH') return <AlertTriangle className={cls} />
  if (severity === 'MEDIUM') return <Bell className={cls} />
  return <Info className={cls} />
}

export default function AlertsPage() {
  const { user } = useAuth()
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [actionOnly, setActionOnly] = useState(false)
  const [allAlerts, setAllAlerts] = useState<Alert[]>([])
  const [readState, setReadState] = useState<Record<string, boolean>>({})

  useEffect(() => {
    alertsApi.list({ limit: 200 }).then(r => {
      if (r.data?.alerts?.length) {
        setAllAlerts(r.data.alerts)
        setReadState(Object.fromEntries(r.data.alerts.map((a: Alert) => [a.id, a.is_read])))
      }
    }).catch(() => {})
  }, [])

  const alerts = allAlerts.filter(a => {
    const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter
    const matchUnread = !unreadOnly || !readState[a.id]
    const matchAction = !actionOnly || a.requires_action
    return matchSeverity && matchUnread && matchAction
  })

  const totalCount = allAlerts.length
  const criticalCount = allAlerts.filter(a => a.severity === 'CRITICAL').length
  const unreadCount = allAlerts.filter(a => !readState[a.id]).length
  const actionCount = allAlerts.filter(a => a.requires_action).length

  function markRead(id: string) {
    setReadState(prev => ({ ...prev, [id]: true }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Alerts" value={totalCount} icon={Bell} variant="default" />
        <StatCard label="Critical" value={criticalCount} icon={XCircle} variant="danger" sub="Immediate response" />
        <StatCard label="Unread" value={unreadCount} icon={AlertTriangle} variant="warn" sub="Pending review" />
        <StatCard label="Action Required" value={actionCount} icon={Zap} variant="danger" sub="Needs response" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex gap-1">
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                severityFilter === f
                  ? 'bg-rnp text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setUnreadOnly(v => !v)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              unreadOnly
                ? 'border-rnp/50 bg-rnp/10 text-rnp'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            Unread only
          </button>
          <button
            onClick={() => setActionOnly(v => !v)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              actionOnly
                ? 'border-amber-500/50 bg-amber-950/30 text-amber-400'
                : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            Requires Action
          </button>
        </div>
      </div>

      {/* Alert count */}
      <p className="text-xs text-slate-500">
        Showing {alerts.length} of {totalCount} alerts
      </p>

      {/* Alert cards */}
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No alerts match the current filters.
          </div>
        )}
        {alerts.map(alert => {
          const isRead = readState[alert.id]
          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-4 transition-opacity',
                SEVERITY_BORDER[alert.severity],
                isRead && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-3">
                <SeverityIcon severity={alert.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={clsx(
                        'text-sm font-bold',
                        isRead ? 'text-slate-400' : 'text-white'
                      )}>
                        {alert.title}
                      </h3>
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        SEVERITY_BADGE[alert.severity]
                      )}>
                        {alert.severity}
                      </span>
                      {alert.requires_action && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-400">
                          ACTION REQUIRED
                        </span>
                      )}
                      {isRead && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                          <CheckCheck className="h-3 w-3" /> Read
                        </span>
                      )}
                    </div>
                    {!isRead && (
                      <button
                        onClick={() => markRead(alert.id)}
                        className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-md transition-colors shrink-0"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{alert.message}</p>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <SourceTagBadge tag={alert.source_tag} />
                    {alert.suspect_name && (
                      <span className="text-xs text-slate-400">
                        <span className="text-slate-500">Suspect:</span> {alert.suspect_name}
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
                      <span>{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
                      <span className="text-slate-700">·</span>
                      <span>{format(new Date(alert.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
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
