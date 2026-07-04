'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Bell, ShieldAlert, AlertTriangle, Info, Zap, Radio, X,
} from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'
import {
  parseForwardedFrom, stripFwdPrefix, alertSourceInstitution,
  INST_STYLE, SEV_BORDER, SEV_BADGE,
} from '@/lib/alertUtils'

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const SEVERITY_ICON_CLS: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-500',
  HIGH:     'text-orange-500',
  MEDIUM:   'text-amber-500',
  LOW:      'text-slate-400',
}

function SeverityIcon({ severity, className }: { severity: AlertSeverity; className?: string }) {
  const cls = clsx(SEVERITY_ICON_CLS[severity], 'h-4 w-4 shrink-0', className)
  if (severity === 'CRITICAL') return <Zap className={cls} />
  if (severity === 'HIGH') return <ShieldAlert className={cls} />
  if (severity === 'MEDIUM') return <AlertTriangle className={cls} />
  return <Info className={cls} />
}

export default function RcsAlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [unreadOnly, setUnreadOnly]         = useState(false)
  const [allAlerts, setAllAlerts]           = useState<Alert[]>([])
  const [readState, setReadState]           = useState<Record<string, boolean>>({})
  const [newBanner, setNewBanner]           = useState(0)

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
    const isRead = readState[a.id] !== undefined ? readState[a.id] : a.is_read
    const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter
    const matchUnread   = !unreadOnly || !isRead
    return matchSeverity && matchUnread
  })

  const totalCount    = allAlerts.length
  const unreadCount   = allAlerts.filter(a => !(readState[a.id] !== undefined ? readState[a.id] : a.is_read)).length
  const actionCount   = allAlerts.filter(a => a.requires_action).length
  const criticalCount = allAlerts.filter(a => a.severity === 'CRITICAL').length

  return (
    <div className="space-y-6">
      {/* New alerts banner */}
      {newBanner > 0 && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-rcs/40 bg-slate-900 px-4 py-2.5 shadow-xl animate-in slide-in-from-top-2">
          <Bell className="h-4 w-4 text-rcs animate-pulse" />
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">Custody Alerts</h1>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rcs text-white">RCS</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">Rwanda Correctional Service — Security Alerts</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rcs animate-pulse" />
          RCS Secure · live 30s
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Alerts"    value={totalCount}    icon={Bell}          variant="default" sub="All alert records" />
        <StatCard label="Unread"          value={unreadCount}   icon={Bell}          variant="warn"    sub="Pending review" />
        <StatCard label="Action Required" value={actionCount}   icon={AlertTriangle} variant="warn"    sub="Needs response" />
        <StatCard label="Critical"        value={criticalCount} icon={Zap}           variant="danger"  sub="Highest priority" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-1 flex-wrap">
          {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as SeverityFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                severityFilter === f
                  ? 'bg-rcs text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setUnreadOnly(v => !v)}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border',
            unreadOnly
              ? 'border-rcs/50 bg-rcs/10 text-rcs'
              : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
          )}
        >
          {unreadOnly ? '● ' : '○ '}Unread Only
        </button>
      </div>

      <p className="text-xs text-slate-500">Showing {alerts.length} of {totalCount} alerts</p>

      {/* Alert Cards */}
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No alerts match the current filters.
          </div>
        )}
        {alerts.map(a => {
          const isRead       = readState[a.id] !== undefined ? readState[a.id] : a.is_read
          const srcInst      = alertSourceInstitution(a)
          const fwdFrom      = parseForwardedFrom(a.title)
          const cleanedTitle = stripFwdPrefix(a.title)
          return (
            <div
              key={a.id}
              className={clsx(
                'rounded-xl border bg-slate-900 p-5 border-l-4 transition-colors',
                SEV_BORDER[a.severity],
                isRead ? 'border-slate-800 opacity-70' : 'border-slate-800'
              )}
            >
              <div className="flex items-start gap-3">
                <SeverityIcon severity={a.severity} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-white">{cleanedTitle}</span>
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', SEV_BADGE[a.severity])}>
                        {a.severity}
                      </span>
                      {srcInst && INST_STYLE[srcInst] && (
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INST_STYLE[srcInst].badge)}>
                          {fwdFrom ? `↩ FROM ${INST_STYLE[srcInst].label}` : INST_STYLE[srcInst].label}
                        </span>
                      )}
                      {a.requires_action && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-950 text-orange-400">
                          Action Required
                        </span>
                      )}
                      {isRead && <span className="text-[10px] text-slate-500">Read</span>}
                    </div>
                    <button
                      onClick={() => setReadState(s => ({ ...s, [a.id]: !isRead }))}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                      {isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-3">{a.message}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <SourceTagBadge tag={a.source_tag} />
                    {a.suspect_name && (
                      <span className="text-[10px] text-slate-500">
                        Suspect: <span className="text-slate-400">{a.suspect_name}</span>
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      {' · '}
                      {format(new Date(a.created_at), 'MMM dd HH:mm')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Escape Protocol Notice */}
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/10 p-5">
        <div className="flex items-start gap-3">
          <Radio className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-400 mb-1">RFID Escape Detection — Active</p>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              All facility gates are equipped with RFID readers. Unauthorized gate events automatically trigger
              a CRITICAL alert and notify the RCS duty officer. The perimeter detection system operates 24/7
              with a response window of less than 30 seconds. Any inmate wristband detected outside authorized
              zones generates an immediate lockdown protocol alert.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
