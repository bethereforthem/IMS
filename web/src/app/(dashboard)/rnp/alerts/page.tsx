'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { Bell, AlertTriangle, XCircle, Info, CheckCheck, Zap, X } from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'
import {
  parseForwardedFrom, stripFwdPrefix, alertSourceInstitution,
  INST_STYLE, SEV_BORDER, SEV_BADGE,
} from '@/lib/alertUtils'

type SeverityFilter = 'ALL' | AlertSeverity
const SEVERITY_FILTERS: SeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  const cls = clsx('h-4 w-4 shrink-0',
    severity === 'CRITICAL' ? 'text-red-400' :
    severity === 'HIGH'     ? 'text-amber-400' :
    severity === 'MEDIUM'   ? 'text-yellow-400' : 'text-slate-400'
  )
  if (severity === 'CRITICAL') return <XCircle className={cls} />
  if (severity === 'HIGH')     return <AlertTriangle className={cls} />
  if (severity === 'MEDIUM')   return <Bell className={cls} />
  return <Info className={cls} />
}

export default function AlertsPage() {
  const { user } = useAuth()
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [unreadOnly,    setUnreadOnly]     = useState(false)
  const [actionOnly,    setActionOnly]     = useState(false)
  const [forwarded,     setForwarded]      = useState(false)
  const [allAlerts,     setAllAlerts]      = useState<Alert[]>([])
  const [readState,     setReadState]      = useState<Record<string, boolean>>({})
  const [newBanner,     setNewBanner]      = useState(0)

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
      setAllAlerts(fetched)
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

  const alerts = allAlerts.filter(a => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
    if (unreadOnly && readState[a.id])    return false
    if (actionOnly && !a.requires_action) return false
    if (forwarded  && !parseForwardedFrom(a.title)) return false
    return true
  })

  const totalCount    = allAlerts.length
  const criticalCount = allAlerts.filter(a => a.severity === 'CRITICAL').length
  const unreadCount   = allAlerts.filter(a => !readState[a.id]).length
  const actionCount   = allAlerts.filter(a => a.requires_action).length
  const fwdCount      = allAlerts.filter(a => parseForwardedFrom(a.title)).length

  return (
    <div className="space-y-6">
      {/* New alerts banner */}
      {newBanner > 0 && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-rnp/40 bg-slate-900 px-4 py-2.5 shadow-xl animate-in slide-in-from-top-2">
          <Bell className="h-4 w-4 text-rnp animate-pulse" />
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
          <h1 className="text-xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rnp animate-pulse" />
          RNP Operations · live 30s
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Alerts"    value={totalCount}    icon={Bell}          variant="default" />
        <StatCard label="Critical"        value={criticalCount} icon={XCircle}       variant="danger"  sub="Immediate response" />
        <StatCard label="Unread"          value={unreadCount}   icon={AlertTriangle} variant="warn"    sub="Pending review" />
        <StatCard label="Action Required" value={actionCount}   icon={Zap}           variant="danger"  sub="Needs response" />
      </div>

      {/* Forwarded notice */}
      {fwdCount > 0 && (
        <div className="rounded-xl border border-purple-800/40 bg-purple-950/10 px-4 py-3 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
            ↩ FORWARDED
          </span>
          <p className="text-xs text-slate-400">
            <span className="text-white font-semibold">{fwdCount}</span> alert{fwdCount > 1 ? 's' : ''} forwarded from NISS or RDF — these include command instructions.
          </p>
        </div>
      )}

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
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Unread only',       active: unreadOnly, toggle: () => setUnreadOnly(v => !v), cls: 'border-rnp/50 bg-rnp/10 text-rnp' },
            { label: 'Requires Action',   active: actionOnly, toggle: () => setActionOnly(v => !v), cls: 'border-amber-500/50 bg-amber-950/30 text-amber-400' },
            { label: '↩ Forwarded Only',  active: forwarded,  toggle: () => setForwarded(v => !v), cls: 'border-purple-500/50 bg-purple-950/20 text-purple-400' },
          ].map(({ label, active, toggle, cls }) => (
            <button
              key={label}
              onClick={toggle}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                active ? cls : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">Showing {alerts.length} of {totalCount} alerts</p>

      {/* Alert cards */}
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No alerts match the current filters.
          </div>
        )}
        {alerts.map(alert => {
          const isRead       = readState[alert.id]
          const srcInst      = alertSourceInstitution(alert)
          const fwdFrom      = parseForwardedFrom(alert.title)
          const cleanedTitle = stripFwdPrefix(alert.title)

          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-4 transition-opacity',
                SEV_BORDER[alert.severity],
                isRead && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-3">
                <SeverityIcon severity={alert.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className={clsx('text-sm font-bold', isRead ? 'text-slate-400' : 'text-white')}>
                        {cleanedTitle}
                      </h3>
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', SEV_BADGE[alert.severity])}>
                        {alert.severity}
                      </span>
                      {/* Forwarded-from badge — most important for RNP */}
                      {fwdFrom && srcInst && INST_STYLE[srcInst] && (
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INST_STYLE[srcInst].badge)}>
                          ↩ FROM {INST_STYLE[srcInst].label}
                        </span>
                      )}
                      {!fwdFrom && srcInst && INST_STYLE[srcInst] && (
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INST_STYLE[srcInst].badge)}>
                          {INST_STYLE[srcInst].label}
                        </span>
                      )}
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
                        onClick={() => setReadState(s => ({ ...s, [alert.id]: true }))}
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
