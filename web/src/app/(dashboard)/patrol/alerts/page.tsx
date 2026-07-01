'use client'
import { useState, useEffect } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { useAuth } from '@/hooks/useAuth'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Bell, Info, AlertTriangle, ShieldAlert,
} from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'


const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-orange-500',
  MEDIUM:   'border-l-amber-500',
  LOW:      'border-l-slate-500',
}

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-950 text-red-400',
  HIGH:     'bg-orange-950 text-orange-400',
  MEDIUM:   'bg-amber-950 text-amber-400',
  LOW:      'bg-slate-800 text-slate-400',
}

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  const cls = 'h-4 w-4 shrink-0'
  if (severity === 'MEDIUM') return <AlertTriangle className={clsx(cls, 'text-amber-500')} />
  if (severity === 'HIGH') return <ShieldAlert className={clsx(cls, 'text-orange-500')} />
  return <Info className={clsx(cls, 'text-slate-400')} />
}

export default function PatrolAlertsPage() {
  const { user } = useAuth()
  const roleLabel = user?.role === 'IRONDO_PATROL' ? 'Irondo Patrol' : 'Dasso Officer'

  const [readState, setReadState] = useState<Record<string, boolean>>({})
  const [allAlerts, setAllAlerts] = useState<Alert[]>([])

  useEffect(() => {
    alertsApi.list({ limit: 100 }).then(r => {
      if (r.data?.alerts?.length) {
        setAllAlerts(r.data.alerts.filter(
          (a: Alert) => a.severity === 'LOW' || a.severity === 'MEDIUM'
        ))
      }
    }).catch(() => {})
  }, [])

  const alerts = allAlerts

  const activeCount = alerts.length
  const unreadCount = alerts.filter(a => {
    const isRead = readState[a.id] !== undefined ? readState[a.id] : a.is_read
    return !isRead
  }).length
  const actionCount = alerts.filter(a => a.requires_action).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Active Alerts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {roleLabel} · {user?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-patrol animate-pulse" />
          {roleLabel}
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
        <StatCard label="Active Alerts" value={activeCount} icon={Bell} variant="default" sub="Community-level" />
        <StatCard label="Unread" value={unreadCount} icon={Bell} variant="warn" sub="Pending review" />
        <StatCard label="Requiring Action" value={actionCount} icon={AlertTriangle} variant="warn" sub="Needs response" />
      </div>

      {/* Alert Cards */}
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No active alerts at this time.
          </div>
        )}
        {alerts.map(a => {
          const isRead = readState[a.id] !== undefined ? readState[a.id] : a.is_read
          return (
            <div
              key={a.id}
              className={clsx(
                'rounded-xl border bg-slate-900 p-5 border-l-4 transition-colors',
                SEVERITY_BORDER[a.severity],
                isRead ? 'border-slate-800 opacity-70' : 'border-slate-800'
              )}
            >
              <div className="flex items-start gap-3">
                <SeverityIcon severity={a.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{a.title}</span>
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', SEVERITY_BADGE[a.severity])}>
                        {a.severity}
                      </span>
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
