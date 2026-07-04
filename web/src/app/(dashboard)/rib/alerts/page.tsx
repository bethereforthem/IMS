'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import clsx from 'clsx'
import {
  AlertTriangle, AlertCircle, Info, Bell, BellOff,
  ShieldAlert, ToggleLeft, ToggleRight, CheckCircle2, X,
} from 'lucide-react'
import type { AlertSeverity, Alert } from '@/types'
import {
  parseForwardedFrom, stripFwdPrefix, alertSourceInstitution,
  INST_STYLE, SEV_BORDER, SEV_BADGE,
} from '@/lib/alertUtils'

type SeverityFilter = AlertSeverity | 'ALL'

const SEVERITY_FILTERS: SeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

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
  const [newBanner, setNewBanner] = useState(0)

  const seenIdsRef     = useRef<Set<string>>(new Set())
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAlerts = useCallback(() => {
    alertsApi.list({ limit: 200 }).then(r => {
      if (!r.data?.alerts?.length) return
      const fetched: Alert[] = r.data.alerts
      const newIds = fetched.filter(a => !seenIdsRef.current.has(a.id))
      if (newIds.length > 0 && seenIdsRef.current.size > 0) {
        setNewBanner(newIds.length)
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = setTimeout(() => setNewBanner(0), 6000)
      }
      fetched.forEach(a => seenIdsRef.current.add(a.id))
      setAlerts(fetched)
      setReadState(prev => {
        const next = { ...prev }
        fetched.forEach((a: Alert) => { if (!(a.id in next)) next[a.id] = a.is_read })
        return next
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchAlerts()
    const id = setInterval(fetchAlerts, 30_000)
    return () => { clearInterval(id); if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current) }
  }, [fetchAlerts])

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
      {/* New alerts banner */}
      {newBanner > 0 && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-rib/40 bg-slate-900 px-4 py-2.5 shadow-xl animate-in slide-in-from-top-2">
          <Bell className="h-4 w-4 text-rib animate-pulse" />
          <span className="text-sm font-bold text-white">
            {newBanner} new alert{newBanner > 1 ? 's' : ''} arrived
          </span>
          <button onClick={() => setNewBanner(0)} className="ml-2 text-slate-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">RIB Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rib animate-pulse" />
          RIB Intel Unit · live 30s
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
          const isRead       = readState[alert.id]
          const srcInst      = alertSourceInstitution(alert)
          const fwdFrom      = parseForwardedFrom(alert.title)
          const cleanedTitle = stripFwdPrefix(alert.title)
          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-4 border-l-4 flex gap-4',
                SEV_BORDER[alert.severity],
                isRead ? 'opacity-70' : ''
              )}
            >
              {/* Icon */}
              <div className="shrink-0 pt-0.5">
                <SeverityIcon className={clsx('h-5 w-5', SEVERITY_ICON_COLOR[alert.severity])} />
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start gap-1.5 flex-wrap">
                  <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', SEV_BADGE[alert.severity])}>
                    {alert.severity}
                  </span>
                  {srcInst && INST_STYLE[srcInst] && (
                    <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INST_STYLE[srcInst].badge)}>
                      {fwdFrom ? `↩ FROM ${INST_STYLE[srcInst].label}` : INST_STYLE[srcInst].label}
                    </span>
                  )}
                  {alert.requires_action && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-rib bg-teal-950 border border-rib/20">
                      Action Required
                    </span>
                  )}
                  {isRead && (
                    <span className="text-[10px] text-slate-600 font-medium">Read</span>
                  )}
                </div>

                <p className="text-sm font-bold text-slate-100">{cleanedTitle}</p>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{alert.message}</p>

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
