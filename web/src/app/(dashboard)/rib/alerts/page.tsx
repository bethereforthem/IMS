'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import {
  AlertTriangle, AlertCircle, Info, Bell, BellOff,
  ShieldAlert, ToggleLeft, ToggleRight, CheckCircle2,
} from 'lucide-react'
import type { AlertSeverity, Alert } from '@/types'

type SeverityFilter = AlertSeverity | 'ALL'

const SEVERITY_FILTERS: SeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-amber-500',
  MEDIUM:   'border-l-yellow-400',
  LOW:      'border-l-slate-500',
}

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-400 bg-red-950',
  HIGH:     'text-amber-400 bg-amber-950',
  MEDIUM:   'text-yellow-400 bg-yellow-950',
  LOW:      'text-slate-400 bg-slate-800',
}

const SEVERITY_ICON: Record<AlertSeverity, React.ElementType> = {
  CRITICAL: ShieldAlert,
  HIGH:     AlertTriangle,
  MEDIUM:   AlertCircle,
  LOW:      Info,
}

const SEVERITY_ICON_COLOR: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-500',
  HIGH:     'text-amber-500',
  MEDIUM:   'text-yellow-400',
  LOW:      'text-slate-500',
}

export default function RIBAlertsPage() {
  const { user } = useAuth()
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [actionOnly, setActionOnly] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [readState, setReadState] = useState<Record<string, boolean>>({})

  useEffect(() => {
    alertsApi.list({ limit: 200 }).then(r => {
      if (r.data?.alerts?.length) {
        setAlerts(r.data.alerts)
        setReadState(Object.fromEntries(r.data.alerts.map((a: Alert) => [a.id, a.is_read])))
      }
    }).catch(() => {})
  }, [])

  const toggleRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setReadState(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const filtered = alerts.filter(a => {
    const matchesSeverity = severityFilter === 'ALL' || a.severity === severityFilter
    const matchesAction   = !actionOnly || a.requires_action
    return matchesSeverity && matchesAction
  })

  const criticalCount       = alerts.filter(a => a.severity === 'CRITICAL').length
  const unreadCount         = alerts.filter(a => !readState[a.id]).length
  const actionRequiredCount = alerts.filter(a => a.requires_action).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">RIB Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Intel Unit
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Alerts" value={alerts.length} icon={Bell} />
        <StatCard label="Critical" value={criticalCount} icon={ShieldAlert} variant="danger" sub="Immediate action required" />
        <StatCard label="Unread" value={unreadCount} icon={BellOff} variant="warn" sub="Awaiting review" />
        <StatCard label="Action Required" value={actionRequiredCount} icon={AlertTriangle} sub="Pending response" />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {SEVERITY_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={clsx(
                'text-[11px] font-semibold uppercase px-3 py-1 rounded-full border transition-colors',
                severityFilter === s
                  ? 'bg-rib border-rib text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActionOnly(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
          >
            {actionOnly
              ? <ToggleRight className="h-5 w-5 text-rib" />
              : <ToggleLeft  className="h-5 w-5 text-slate-600" />
            }
            Action Required Only
          </button>
          <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
            {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500 text-sm">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No alerts match your filters.
          </div>
        )}
        {filtered.map(alert => {
          const SeverityIcon = SEVERITY_ICON[alert.severity]
          const isRead = readState[alert.id]
          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-4 border-l-4 flex gap-4',
                SEVERITY_BORDER[alert.severity],
                isRead ? 'opacity-70' : ''
              )}
            >
              {/* Icon */}
              <div className="shrink-0 pt-0.5">
                <SeverityIcon className={clsx('h-5 w-5', SEVERITY_ICON_COLOR[alert.severity])} />
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={clsx(
                    'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                    SEVERITY_BADGE[alert.severity]
                  )}>
                    {alert.severity}
                  </span>
                  {alert.requires_action && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-rib bg-teal-950 border border-rib/20">
                      Action Required
                    </span>
                  )}
                  {isRead && (
                    <span className="text-[10px] text-slate-600 font-medium">Read</span>
                  )}
                </div>

                <p className="text-sm font-bold text-slate-100">{alert.title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{alert.message}</p>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <SourceTagBadge tag={alert.source_tag} />
                  {alert.suspect_name && (
                    <span className="font-medium text-slate-400">· {alert.suspect_name}</span>
                  )}
                </div>
              </div>

              {/* Right side */}
              <div className="shrink-0 flex flex-col items-end gap-2">
                <button
                  onClick={e => toggleRead(alert.id, e)}
                  title={isRead ? 'Mark as unread' : 'Mark as read'}
                  className={clsx(
                    'text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors',
                    isRead
                      ? 'border-slate-700 text-slate-600 hover:text-slate-400'
                      : 'border-rib/30 text-rib hover:bg-rib/10'
                  )}
                >
                  {isRead ? 'Mark Unread' : 'Mark Read'}
                </button>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                  </p>
                  <p className="text-[10px] text-slate-600 whitespace-nowrap">
                    {format(new Date(alert.created_at), 'MMM d, HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
