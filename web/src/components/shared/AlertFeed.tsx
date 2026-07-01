'use client'
import { useState, useEffect } from 'react'
import { statsApi } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { AlertTriangle, Bell, Info, XCircle } from 'lucide-react'
import type { Alert } from '@/types'
import type { AxiosResponse } from 'axios'

const severityIcon = {
  CRITICAL: XCircle,
  HIGH:     AlertTriangle,
  MEDIUM:   Bell,
  LOW:      Info,
}
const severityColor = {
  CRITICAL: 'text-red-400 bg-red-950/60 border-red-900',
  HIGH:     'text-amber-400 bg-amber-950/60 border-amber-900',
  MEDIUM:   'text-yellow-400 bg-yellow-950/40 border-yellow-900',
  LOW:      'text-slate-400 bg-slate-800/60 border-slate-700',
}

interface Props {
  limit?: number
  initialAlerts?: Alert[]
}

export function AlertFeed({ limit = 8, initialAlerts = [] }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts)
  const [loading, setLoading] = useState(initialAlerts.length === 0)

  useEffect(() => {
    statsApi.getRecentAlerts(limit)
      .then((r: AxiosResponse<Alert[]>) => { if (r.data?.length) setAlerts(r.data) })
      .catch(() => {})
      .finally(() => setLoading(false))

    const interval = setInterval(() => {
      statsApi.getRecentAlerts(limit)
        .then((r: AxiosResponse<Alert[]>) => { if (r.data?.length) setAlerts(r.data) })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [limit])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-800" />
        ))}
      </div>
    )
  }

  if (!alerts.length) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 py-10 text-center text-sm text-slate-500">
        No active alerts
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.slice(0, limit).map(alert => {
        const Icon = severityIcon[alert.severity]
        return (
          <div
            key={alert.id}
            className={clsx('flex items-start gap-3 rounded-lg border p-3 text-sm', severityColor[alert.severity])}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{alert.title}</p>
              <p className="text-xs opacity-80 mt-0.5 line-clamp-2">{alert.message}</p>
              <p className="text-[11px] opacity-50 mt-0.5">
                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })} · {alert.source_tag.replace('_', ' ')}
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold uppercase opacity-70">{alert.severity}</span>
              {alert.requires_action && (
                <span className="text-[9px] font-bold uppercase bg-current/10 px-1.5 py-0.5 rounded opacity-80">ACTION</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
