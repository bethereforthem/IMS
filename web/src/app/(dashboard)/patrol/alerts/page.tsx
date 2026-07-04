'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { useAuth } from '@/hooks/useAuth'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { Bell, Info, AlertTriangle, ShieldAlert, X } from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'
import {
  parseForwardedFrom, stripFwdPrefix, alertSourceInstitution,
  INST_STYLE, SEV_BORDER, SEV_BADGE,
} from '@/lib/alertUtils'

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  const cls = 'h-4 w-4 shrink-0'
  if (severity === 'CRITICAL') return <ShieldAlert className={clsx(cls, 'text-red-400')} />
  if (severity === 'HIGH')     return <AlertTriangle className={clsx(cls, 'text-orange-500')} />
  if (severity === 'MEDIUM')   return <AlertTriangle className={clsx(cls, 'text-amber-500')} />
  return <Info className={clsx(cls, 'text-slate-400')} />
}

export default function PatrolAlertsPage() {
  const { user } = useAuth()

  const [readState, setReadState] = useState<Record<string, boolean>>({})
  const [allAlerts, setAllAlerts] = useState<Alert[]>([])
  const [newBanner, setNewBanner] = useState(0)

  const seenIdsRef     = useRef<Set<string>>(new Set())
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAlerts = useCallback(() => {
    alertsApi.list({ limit: 100 }).then(r => {
      if (!r.data?.alerts?.length) return
      const fetched: Alert[] = r.data.alerts.filter(
        (a: Alert) => a.severity === 'LOW' || a.severity === 'MEDIUM'
      )
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

  const alerts = allAlerts
  const activeCount = alerts.length
  const unreadCount = alerts.filter(a => !(readState[a.id] !== undefined ? readState[a.id] : a.is_read)).length
  const actionCount = alerts.filter(a => a.requires_action).length

  return (
    <div className="space-y-6">
      {/* New alerts banner */}
      {newBanner > 0 && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-patrol/40 bg-slate-900 px-4 py-2.5 shadow-xl animate-in slide-in-from-top-2">
          <Bell className="h-4 w-4 text-patrol animate-pulse" />
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
          <h1 className="text-xl font-bold text-white">Active Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">Village Leader · {user?.full_name}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
          Village Leader · live 30s
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-800/40 bg-blue-950/15 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300/80 leading-relaxed">
            As a patrol officer, you receive community-level alerts. Critical operational details are managed
            by RNP command. If you observe a situation requiring escalation, submit an officer report immediately.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Alerts"    value={activeCount} icon={Bell}          variant="default" sub="Community-level" />
        <StatCard label="Unread"           value={unreadCount} icon={Bell}          variant="warn"    sub="Pending review" />
        <StatCard label="Requiring Action" value={actionCount} icon={AlertTriangle} variant="warn"    sub="Needs response" />
      </div>

      {/* Alert Cards */}
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No active alerts at this time.
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
                <SeverityIcon severity={a.severity} />
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
                    </div>
                    <button
                      onClick={() => setReadState(s => ({ ...s, [a.id]: !isRead }))}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                      {isRead ? 'Mark Unread' : 'Mark Read'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{a.message}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <SourceTagBadge tag={a.source_tag} />
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
    </div>
  )
}
