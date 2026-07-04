'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { alertsApi } from '@/lib/api'
import { AlertTriangle, Shield, Info, Bell, BellOff, Share2, X, Loader2 } from 'lucide-react'
import { SourceTagBadge } from '@/components/shared/SourceTagBadge'
import { formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import type { AlertSeverity, Alert } from '@/types'
import {
  parseForwardedFrom, stripFwdPrefix, alertSourceInstitution,
  INST_STYLE, SEV_BORDER, SEV_BADGE,
} from '@/lib/alertUtils'

const SEVERITY_FILTERS: (AlertSeverity | 'ALL')[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

type PostFilter = 'ALL' | 'GATUNA' | 'RUBAVU' | 'RUSIZI' | 'NYAGATARE'
const POST_FILTERS: PostFilter[] = ['ALL', 'GATUNA', 'RUBAVU', 'RUSIZI', 'NYAGATARE']

const severityIcon: Record<AlertSeverity, typeof AlertTriangle> = {
  CRITICAL: AlertTriangle,
  HIGH:     AlertTriangle,
  MEDIUM:   Info,
  LOW:      Shield,
}

// ── Share Modal (RDF → RNP only) ─────────────────────────────────────────────

function ShareModal({ alert, onClose, onShared }: {
  alert: Alert
  onClose: () => void
  onShared: () => void
}) {
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  async function submit() {
    if (!instructions.trim()) { setError('Instructions are required'); return }
    setLoading(true); setError('')
    try {
      const r = await alertsApi.share(alert.id, { target_institution: 'RNP', instructions })
      if (r.data?.shared_alert_id) { onShared(); onClose() }
      else setError('Share failed — please try again')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-rdf" />
            <h2 className="text-sm font-bold text-white">Share Alert → RNP</h2>
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
          <div className="rounded-lg border border-blue-800/40 bg-blue-950/10 px-3 py-2 text-xs text-blue-300">
            This alert will be forwarded to <span className="font-bold">RNP</span> with your instructions.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Instructions for RNP</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={4}
              placeholder="Describe how RNP should handle this border case…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-rdf"
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
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rdf text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
            Share to RNP →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RDFAlertsPage() {
  const { user } = useAuth()
  const [alerts, setAlerts]                 = useState<Alert[]>([])
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'ALL'>('ALL')
  const [postFilter, setPostFilter]         = useState<PostFilter>('ALL')
  const [readState, setReadState]           = useState<Record<string, boolean>>({})
  const [shareTarget, setShareTarget]       = useState<Alert | null>(null)
  const [newBanner, setNewBanner]           = useState(0)
  const [sharedIds, setSharedIds]           = useState<Set<string>>(new Set())

  const seenIdsRef    = useRef<Set<string>>(new Set())
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

  const toggleRead = (id: string) => setReadState(prev => ({ ...prev, [id]: !prev[id] }))

  const filtered = alerts.filter(a => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
    if (postFilter !== 'ALL') {
      const lower = a.message.toLowerCase() + a.title.toLowerCase()
      if (!lower.includes(postFilter.toLowerCase())) return false
    }
    return true
  })

  const unreadCount = Object.values(readState).filter(v => !v).length

  return (
    <div className="space-y-6">
      {/* New alerts banner */}
      {newBanner > 0 && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-xl border border-rdf/40 bg-slate-900 px-4 py-2.5 shadow-xl animate-in slide-in-from-top-2">
          <Bell className="h-4 w-4 text-rdf animate-pulse" />
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
          <h1 className="text-xl font-bold text-white">RDF BORDER ALERTS</h1>
          <p className="text-sm text-slate-400 mt-0.5">{user?.full_name} · {user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-3 py-1.5 rounded-lg">
          <div className="h-1.5 w-1.5 rounded-full bg-rdf animate-pulse" />
          RDF Border Command
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500">
          <span className="text-white font-semibold">{unreadCount}</span> unread ·{' '}
          <span className="text-white font-semibold">{alerts.filter(a => a.requires_action).length}</span> require action ·{' '}
          <span className="text-slate-600">live 30s</span>
        </span>
        {alerts.filter(a => a.severity === 'CRITICAL').length > 0 && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 animate-pulse">
            {alerts.filter(a => a.severity === 'CRITICAL').length} CRITICAL
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Severity:</span>
            {SEVERITY_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setSeverityFilter(f as AlertSeverity | 'ALL')}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                  severityFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Border Post:</span>
          {POST_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setPostFilter(f)}
              className={clsx(
                'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                postFilter === f ? 'bg-rdf text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Showing <span className="text-white font-semibold">{filtered.length}</span> of {alerts.length} alerts
      </p>

      {/* Alert cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-sm text-slate-600">No alerts match the current filters.</p>
          </div>
        )}
        {filtered.map(alert => {
          const SevIcon      = severityIcon[alert.severity]
          const isRead       = readState[alert.id]
          const srcInst      = alertSourceInstitution(alert)
          const fwdFrom      = parseForwardedFrom(alert.title)
          const cleanedTitle = stripFwdPrefix(alert.title)
          const wasShared    = sharedIds.has(alert.id)

          return (
            <div
              key={alert.id}
              className={clsx(
                'rounded-xl border border-slate-800 bg-slate-900 p-5 border-l-4 transition-opacity',
                SEV_BORDER[alert.severity],
                isRead && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <SevIcon className={clsx(
                    'h-4 w-4 shrink-0 mt-0.5',
                    alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'text-red-400' :
                    alert.severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-400'
                  )} />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Badges */}
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
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                          ACTION REQUIRED
                        </span>
                      )}
                      {isRead && <span className="text-[10px] text-slate-600 uppercase font-semibold">READ</span>}
                      {wasShared && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          ✓ Shared → RNP
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">{cleanedTitle}</p>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{alert.message}</p>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <SourceTagBadge tag={alert.source_tag} />
                      {alert.suspect_name && (
                        <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                          {alert.suspect_name}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {/* Share button — RDF can share to RNP */}
                  {!wasShared && !fwdFrom && (
                    <button
                      onClick={() => setShareTarget(alert)}
                      className="p-1.5 rounded-lg text-rdf hover:text-white bg-rdf/10 hover:bg-rdf/20 transition-colors"
                      title="Share to RNP"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => toggleRead(alert.id)}
                    className={clsx(
                      'p-1.5 rounded-lg transition-colors',
                      isRead
                        ? 'text-slate-600 hover:text-slate-400 bg-slate-800/50'
                        : 'text-rdf hover:text-white bg-rdf/10 hover:bg-rdf/20'
                    )}
                    title={isRead ? 'Mark as unread' : 'Mark as read'}
                  >
                    {isRead ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Emergency Protocol */}
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wide">Emergency Protocol — CRITICAL Border Alert</h3>
        </div>
        <div className="space-y-1.5 text-xs text-slate-400 leading-relaxed">
          <p>When a <span className="text-amber-400 font-semibold">CRITICAL</span> border alert fires, the duty officer must immediately:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Contact <span className="text-white font-medium">RNP Border Police</span> at the relevant post via secure radio (Channel 7).</li>
            <li>Activate <span className="text-white font-medium">all border camera nodes</span> to maximum recording.</li>
            <li>Notify <span className="text-white font-medium">NISS Command Centre</span> via secure line within 15 minutes.</li>
            <li>If suspect is <span className="text-orange-400 font-semibold">INTERPOL_FLAGGED</span>, notify the ICPO Liaison Officer immediately.</li>
            <li>Use the <span className="text-rdf font-semibold">Share → RNP</span> button to forward the alert with instructions.</li>
          </ol>
        </div>
      </div>

      {/* Share modal */}
      {shareTarget && (
        <ShareModal
          alert={shareTarget}
          onClose={() => setShareTarget(null)}
          onShared={() => {
            setSharedIds(s => new Set([...s, shareTarget.id]))
            setShareTarget(null)
          }}
        />
      )}
    </div>
  )
}
