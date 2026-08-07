'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { StatCard } from '@/components/shared/StatCard'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { alertsApi, apiErrorMessage } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Bell, ShieldAlert, AlertTriangle, Info, Zap, Radio, X, Search, Loader2, Check,
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
  const { user } = useAuth()
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL')
  const [unreadOnly, setUnreadOnly]         = useState(false)
  const [actionOnly, setActionOnly]         = useState(false)
  const [search, setSearch]                 = useState('')
  const [allAlerts, setAllAlerts]           = useState<Alert[]>([])
  const [newBanner, setNewBanner]           = useState(0)
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [acking, setAcking]                 = useState<Record<string, boolean>>({})
  const [expanded, setExpanded]             = useState<Record<string, boolean>>({})

  const seenIdsRef     = useRef<Set<string>>(new Set())
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canAcknowledge = user?.role === 'RCS_SUPERINTENDENT'

  const fetchAlerts = useCallback(() => {
    return alertsApi.list({ limit: 200 }).then(r => {
      // An empty result is a real state — the feed used to keep the previous
      // list on screen when the server returned nothing.
      const fetched: Alert[] = r.data?.alerts ?? []
      const newIds = fetched.filter(a => !seenIdsRef.current.has(a.id))
      if (newIds.length > 0 && seenIdsRef.current.size > 0) {
        setNewBanner(newIds.length)
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = setTimeout(() => setNewBanner(0), 6000)
      }
      fetched.forEach(a => seenIdsRef.current.add(a.id))
      setAllAlerts(fetched)
      setError(null)
    }).catch(err => {
      setError(apiErrorMessage(err, 'Could not load alerts.'))
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAlerts()
    const id = setInterval(fetchAlerts, 30_000)
    return () => { clearInterval(id); if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current) }
  }, [fetchAlerts])

  /**
   * Acknowledge an alert. This used to flip a piece of component state and
   * nothing else — the alert stayed unread in the database, came back unread on
   * the next 30-second poll, and no other officer ever saw that it had been
   * seen. `is_read` is one-way on the server (it also records who read it and
   * when, and writes an ALERT_ACKNOWLEDGED audit entry), so there is no
   * "mark unread" to offer.
   */
  async function acknowledge(id: string) {
    setAcking(s => ({ ...s, [id]: true }))
    setAllAlerts(prev => prev.map(a => (a.id === id ? { ...a, is_read: true } : a)))
    try {
      await alertsApi.markRead(id)
      await fetchAlerts()
    } catch (err) {
      // Put it back — the operator must not be shown an acknowledgement that
      // never reached the database.
      setAllAlerts(prev => prev.map(a => (a.id === id ? { ...a, is_read: false } : a)))
      setError(apiErrorMessage(err, 'Could not acknowledge the alert.'))
    } finally {
      setAcking(s => {
        const next = { ...s }
        delete next[id]
        return next
      })
    }
  }

  const query = search.trim().toLowerCase()
  const alerts = allAlerts.filter(a => {
    const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter
    const matchUnread   = !unreadOnly || !a.is_read
    const matchAction   = !actionOnly || a.requires_action
    const matchSearch   = !query ||
      a.title.toLowerCase().includes(query) ||
      a.message.toLowerCase().includes(query) ||
      (a.suspect_name ?? '').toLowerCase().includes(query)
    return matchSeverity && matchUnread && matchAction && matchSearch
  })

  const totalCount    = allAlerts.length
  const unreadCount   = allAlerts.filter(a => !a.is_read).length
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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, message or suspect…"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-rcs/50"
          />
        </div>
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
        <button
          onClick={() => setActionOnly(v => !v)}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border',
            actionOnly
              ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
              : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
          )}
        >
          {actionOnly ? '● ' : '○ '}Action Required
        </button>
      </div>

      <p className="text-xs text-slate-500">
        {loading ? 'Loading…' : `Showing ${alerts.length} of ${totalCount} alerts`}
      </p>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => { setLoading(true); fetchAlerts() }} className="ml-auto text-xs underline hover:text-red-100">
            Retry
          </button>
        </div>
      )}

      {/* Alert Cards */}
      <div className="space-y-3">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}

        {!loading && !error && alerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            {totalCount === 0 ? 'No alerts have been raised for RCS.' : 'No alerts match the current filters.'}
          </div>
        )}
        {!loading && alerts.map(a => {
          const isRead       = a.is_read
          const isExpanded   = expanded[a.id] === true
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
                    </div>
                    {isRead ? (
                      <span className="flex items-center gap-1 text-[10px] text-green-500 shrink-0">
                        <Check className="h-3 w-3" /> Acknowledged
                      </span>
                    ) : canAcknowledge ? (
                      <button
                        onClick={() => acknowledge(a.id)}
                        disabled={acking[a.id]}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded px-2 py-1 transition-colors shrink-0 disabled:opacity-50"
                      >
                        {acking[a.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Acknowledge
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-600 shrink-0">Unread</span>
                    )}
                  </div>
                  <p className={clsx(
                    'text-xs text-slate-400 mt-1.5 leading-relaxed whitespace-pre-wrap',
                    !isExpanded && 'line-clamp-3'
                  )}>
                    {a.message}
                  </p>
                  {a.message.length > 180 && (
                    <button
                      onClick={() => setExpanded(s => ({ ...s, [a.id]: !isExpanded }))}
                      className="text-[10px] text-rcs hover:underline mt-1"
                    >
                      {isExpanded ? 'Show less' : 'Show full detail'}
                    </button>
                  )}
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
                    {isRead && a.read_at && (
                      <span className="text-[10px] text-slate-600">
                        Acknowledged {format(new Date(a.read_at), 'MMM dd HH:mm')}
                      </span>
                    )}
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
            <p className="text-sm font-bold text-amber-400 mb-1">Escape Alerting</p>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              Setting an inmate&apos;s custody status to ESCAPED writes the escape timestamp to the custody
              record and raises a CRITICAL alert to RCS, RNP, NISS and RDF, recorded in the audit trail.
              RFID wristband gate detection is not yet connected — escapes are reported by an officer until
              facility readers are integrated.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
