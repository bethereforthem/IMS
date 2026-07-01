'use client'
import { useState, useEffect } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Bell, ShieldAlert, AlertTriangle, Info, Zap, Radio,
} from 'lucide-react'
import clsx from 'clsx'
import type { AlertSeverity } from '@/types'

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH:     'border-l-orange-500',
  MEDIUM:   'border-l-amber-500',
  LOW:      'border-l-slate-500',
}

const SEVERITY_ICON_CLS: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-500',
  HIGH:     'text-orange-500',
  MEDIUM:   'text-amber-500',
  LOW:      'text-slate-400',
}

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-950 text-red-400',
  HIGH:     'bg-orange-950 text-orange-400',
  MEDIUM:   'bg-amber-950 text-amber-400',
  LOW:      'bg-slate-800 text-slate-400',
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
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [readState, setReadState] = useState<Record<string, boolean>>({})

  const alerts = DAM_ALERTS.filter(a => {
    const isRead = readState[a.id] !== undefined ? readState[a.id] : a.is_read
    const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter
    const matchUnread = !unreadOnly || !isRead
    return matchSeverity && matchUnread
  })

  const totalCount = DAM_ALERTS.length
  const unreadCount = DAM_ALERTS.filter(a => {
    const isRead = readState[a.id] !== undefined ? readState[a.id] : a.is_read
    return !isRead
  }).length
  const actionCount = DAM_ALERTS.filter(a => a.requires_action).length
  const criticalCount = DAM_ALERTS.filter(a => a.severity === 'CRITICAL').length

  return (
    <div className="space-y-6">
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
          RCS Secure
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Alerts" value={totalCount} icon={Bell} variant="default" sub="All alert records" />
        <StatCard label="Unread" value={unreadCount} icon={Bell} variant="warn" sub="Pending review" />
        <StatCard label="Action Required" value={actionCount} icon={AlertTriangle} variant="warn" sub="Needs response" />
        <StatCard label="Critical" value={criticalCount} icon={Zap} variant="danger" sub="Highest priority" />
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
                <SeverityIcon severity={a.severity} className="mt-0.5" />
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
                      {isRead && (
                        <span className="text-[10px] text-slate-500">Read</span>
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
