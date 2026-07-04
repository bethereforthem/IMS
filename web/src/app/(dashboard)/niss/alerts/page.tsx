'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { alertsApi } from '@/lib/api'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle, CheckCircle, Bell, ShieldAlert, Info, AlertCircle,
  Share2, X, Loader2,
} from 'lucide-react'
import clsx from 'clsx'
import type { Alert, AlertSeverity } from '@/types'
import {
  parseForwardedFrom, stripFwdPrefix, alertSourceInstitution,
  INST_STYLE, SEV_BORDER, SEV_BADGE,
} from '@/lib/alertUtils'

const SEVERITY_FILTERS: (AlertSeverity | 'ALL')[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const SEV_ICON: Record<AlertSeverity, React.ElementType> = {
  CRITICAL: ShieldAlert,
  HIGH: AlertTriangle,
  MEDIUM: AlertCircle,
  LOW: Info,
}

// ── Share Modal ──────────────────────────────────────────────────────────────

function ShareModal({
  alert,
  onClose,
  onShared,
}: {
  alert: Alert
  onClose: () => void
  onShared: (target: string) => void
}) {
  const [target, setTarget] = useState<'RNP' | 'RDF'>('RNP')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!instructions.trim()) { setError('Instructions are required'); return }
    setLoading(true); setError('')
    try {
      const r = await alertsApi.share(alert.id, { target_institution: target, instructions })
      if (r.data?.shared_alert_id) { onShared(target); onClose() }
      else setError('Share failed — please try again')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-niss" />
            <h2 className="text-sm font-bold text-white">Share Alert</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2">
            <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">Alert</p>
            <p className="text-xs font-medium text-white truncate">{stripFwdPrefix(alert.title)}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Target Institution</label>
            <div className="flex gap-2">
              {(['RNP', 'RDF'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-xs font-bold border transition-colors',
                    target === t
                      ? t === 'RNP'
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-green-700 border-green-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Instructions for {target}
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={4}
              placeholder={`Describe the task and how ${target} should handle this case…`}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-niss"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !instructions.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-niss text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
            Share Alert →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NISSAlertsPage() {
  const { user } = useAuth()
  const [activeFilter, setActiveFilter] = useState<AlertSeverity | 'ALL'>('ALL')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [readState, setReadState] = useState<Record<string, boolean>>({})
  const [shareTarget, setShareTarget] = useState<Alert | null>(null)
  const [newBanner, setNewBanner] = useState(0)
  const [sharedSuccesses, setSharedSuccesses] = useState<Record<string, string>>({})

  const seenIdsRef = useRef<Set<string>>(new Set())
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
    return () => {
      clearInterval(id)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    }
  }, [fetchAlerts])

  const filteredAlerts = alerts.filter(a => {
    if (activeFilter !== 'ALL' && a.severity !== activeFilter) return false
    if (unreadOnly && readState[a.id]) return false
    return true
  })

  const totalCount    = alerts.length
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length
  const unreadCount   = alerts.filter(a => !readState[a.id]).length
  const actionCount   = alerts.filter(a => a.requires_action).length

  return (
    <div className="space-y-6">
      {/* New alerts banner */}
      {newBanner > 0 && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-niss/40 bg-slate-900 px-4 py-2.5 shadow-xl animate-in slide-in-from-top-2">
          <Bell className="h-4 w-4 text-niss animate-pulse" />
          <span className="text-sm font-bold text-white">
            {newBanner} new alert{newBanner > 1 ? 's' : ''} arrived
          </span>
          <button onClick={() => setNewBanner(0)} className="ml-2 text-slate-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">ALERTS MANAGEMENT</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.clearance_level} clearance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-niss animate-pulse" />
          NISS — National Intelligence
        </div>
      </div>

      {/* Stats pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total',           value: totalCount,    cls: 'bg-slate-800 text-slate-300',                                    icon: Bell         },
          { label: 'Critical',        value: criticalCount, cls: 'bg-red-500/10 text-red-400 border border-red-500/20',            icon: ShieldAlert   },
          { label: 'Unread',          value: unreadCount,   cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',      icon: Bell         },
          { label: 'Action Required', value: actionCount,   cls: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',   icon: AlertTriangle },
        ].map(({ label, value, cls, icon: Icon }) => (
          <span key={label} className={clsx('inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg', cls)}>
            <Icon className="h-3.5 w-3.5" />
            {label}: <span className="font-bold">{value}</span>
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
                activeFilter === f ? 'bg-niss text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => setUnreadOnly(e.target.checked)}
            className="accent-niss h-3.5 w-3.5"
          />
          Unread only
        </label>
        <span className="text-xs text-slate-600 ml-auto">
          {filteredAlerts.length} / {totalCount} · live polling 30s
        </span>
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No alerts match the current filters.
          </div>
        )}
        {filteredAlerts.map(alert => {
          const Icon         = SEV_ICON[alert.severity]
          const isRead       = readState[alert.id]
          const srcInst      = alertSourceInstitution(alert)
          const fwdFrom      = parseForwardedFrom(alert.title)
          const cleanedTitle = stripFwdPrefix(alert.title)
          const sharedTo     = sharedSuccesses[alert.id]

          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-4 transition-all',
                SEV_BORDER[alert.severity],
                isRead && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex-shrink-0">
                  <Icon className={clsx('h-4 w-4',
                    alert.severity === 'CRITICAL' ? 'text-red-400' :
                    alert.severity === 'HIGH'     ? 'text-orange-400' :
                    alert.severity === 'MEDIUM'   ? 'text-amber-400' : 'text-blue-400'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Badges */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', SEV_BADGE[alert.severity])}>
                        {alert.severity}
                      </span>
                      {srcInst && INST_STYLE[srcInst] && (
                        <span className={clsx('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', INST_STYLE[srcInst].badge)}>
                          {fwdFrom ? `↩ FROM ${INST_STYLE[srcInst].label}` : INST_STYLE[srcInst].label}
                        </span>
                      )}
                      {alert.requires_action && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                          Action Required
                        </span>
                      )}
                      {!isRead && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-niss/20 text-niss">Unread</span>
                      )}
                      {sharedTo && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                          ✓ Shared → {sharedTo}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 flex-shrink-0">
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <p className="mt-1.5 text-sm font-semibold text-white">{cleanedTitle}</p>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed line-clamp-3">{alert.message}</p>

                  {/* Footer */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <SourceTagBadge tag={alert.source_tag} />
                    {alert.suspect_name && (
                      <span className="text-xs text-slate-500">
                        Subject: <span className="text-slate-300 font-medium">{alert.suspect_name}</span>
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      {!sharedTo && (
                        <button
                          onClick={() => setShareTarget(alert)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-niss/10 text-niss hover:bg-niss/20 transition-colors"
                        >
                          <Share2 className="h-3 w-3" />
                          Share
                        </button>
                      )}
                      <button
                        onClick={() => setReadState(s => ({ ...s, [alert.id]: !isRead }))}
                        className={clsx(
                          'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors',
                          isRead ? 'bg-slate-800 text-slate-400 hover:text-slate-200' : 'bg-niss/20 text-niss hover:bg-niss/30'
                        )}
                      >
                        <CheckCircle className="h-3 w-3" />
                        {isRead ? 'Mark Unread' : 'Mark Read'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {shareTarget && (
        <ShareModal
          alert={shareTarget}
          onClose={() => setShareTarget(null)}
          onShared={target => {
            setSharedSuccesses(s => ({ ...s, [shareTarget.id]: target }))
            setShareTarget(null)
          }}
        />
      )}
    </div>
  )
}
