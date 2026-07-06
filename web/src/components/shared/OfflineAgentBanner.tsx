'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { agentTrackingApi } from '@/lib/api'
import { alarmManager } from '@/lib/mapSounds'
import { PERMISSIONS } from '@/lib/rbac'
import { formatDistanceToNow } from 'date-fns'
import {
  WifiOff, MapPin, VolumeX, ExternalLink, RefreshCw, Wifi,
} from 'lucide-react'
import clsx from 'clsx'
import type { ActiveAgent } from '@/lib/api'

// ── Reason labels ─────────────────────────────────────────────────────────────

const REASON_LABEL: Record<string, string> = {
  TIMEOUT:          'Heartbeat timeout',
  NO_NETWORK:       'No network connection',
  GPS_DISABLED:     'GPS disabled',
  APP_TERMINATED:   'App terminated',
  PHONE_OFF:        'Device powered off',
}

const REASON_COLOR: Record<string, string> = {
  GPS_DISABLED: 'text-amber-400',
  default:      'text-orange-400',
}

function isOffline(agent: ActiveAgent): boolean {
  return agent.availability_status === 'OFFLINE' || agent.availability_status === 'GPS_DISABLED'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OfflineAgentBanner() {
  const { user } = useAuth()
  const [offlineAgents, setOfflineAgents] = useState<ActiveAgent[]>([])
  const [dismissed, setDismissed]         = useState<Set<string>>(new Set())
  const [silenced, setSilenced]           = useState(false)
  const seenRef                           = useRef<Set<string>>(new Set())
  const flashTimerRef                     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [flash, setFlash]                 = useState(false)

  // Commanders who can view agent tracking see this banner
  const canSee = !!user && !!(PERMISSIONS[user.role]?.has('agent_tracking:read'))

  const fetchAgents = useCallback(() => {
    if (!canSee) return
    agentTrackingApi.getActiveAgents()
      .then(r => {
        const all: ActiveAgent[] = r.data?.agents ?? []
        const offline = all.filter(isOffline)
          .filter(a => !dismissed.has(a.session_id))

        // New offline agents → sound + flash
        const newOffline = offline.filter(a => !seenRef.current.has(a.session_id))
        if (newOffline.length > 0) {
          newOffline.forEach(a => {
            seenRef.current.add(a.session_id)
            // GPS_DISABLED is lower priority than hard offline
            const soundType = a.availability_status === 'GPS_DISABLED' ? 'suspect' : 'offline'
            if (!silenced) alarmManager.register(a.session_id, soundType)
          })
          setFlash(true)
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
          flashTimerRef.current = setTimeout(() => setFlash(false), 1000)
        }

        // Drop alarm for agents that came back online
        setOfflineAgents(prev => {
          prev.forEach(prevAgent => {
            if (!offline.find(a => a.session_id === prevAgent.session_id)) {
              alarmManager.drop(prevAgent.session_id)
              seenRef.current.delete(prevAgent.session_id)
            }
          })
          return offline
        })
      })
      .catch(() => {})
  }, [canSee, dismissed, silenced])

  useEffect(() => {
    if (!canSee) return
    fetchAgents()
    const id = setInterval(fetchAgents, 15_000)
    return () => {
      clearInterval(id)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSee])

  function handleDismiss(sessionId: string) {
    alarmManager.drop(sessionId)
    seenRef.current.delete(sessionId)
    setDismissed(prev => new Set([...prev, sessionId]))
    setOfflineAgents(prev => prev.filter(a => a.session_id !== sessionId))
  }

  function handleSilence() {
    alarmManager.silence()
    setSilenced(true)
  }

  const visible = offlineAgents.filter(a => !dismissed.has(a.session_id))
  if (!canSee || visible.length === 0) return null

  const hasGpsOnly   = visible.every(a => a.availability_status === 'GPS_DISABLED')
  const borderColor  = hasGpsOnly ? 'border-amber-500' : 'border-orange-500'
  const bgColor      = hasGpsOnly ? 'bg-amber-950/80' : 'bg-orange-950/80'
  const headerBg     = hasGpsOnly ? 'bg-amber-900/60 border-amber-800' : 'bg-orange-900/60 border-orange-800'
  const titleColor   = hasGpsOnly ? 'text-amber-100' : 'text-orange-100'
  const badgeBg      = hasGpsOnly ? 'bg-amber-500' : 'bg-orange-500'
  const flashRgba    = hasGpsOnly ? 'rgba(245,158,11,0.12)' : 'rgba(249,115,22,0.14)'

  return (
    <>
      {flash && (
        <div
          className="fixed inset-0 z-[9993] pointer-events-none animate-pulse"
          style={{ background: flashRgba }}
        />
      )}

      <div className={clsx('mb-4 rounded-2xl border-2 shadow-2xl overflow-hidden', borderColor, bgColor)}>

        {/* Header */}
        <div className={clsx('flex items-center justify-between gap-3 px-4 py-2.5 border-b', headerBg)}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                hasGpsOnly ? 'bg-amber-400' : 'bg-orange-400')} />
              <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full',
                hasGpsOnly ? 'bg-amber-400' : 'bg-orange-400')} />
            </span>
            <span className={clsx('font-black text-sm tracking-widest uppercase', titleColor)}>
              {hasGpsOnly ? 'GPS Signal Lost' : 'Agents Offline'}
            </span>
            <span className={clsx('text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse', badgeBg)}>
              {visible.length} AGENT{visible.length !== 1 ? 'S' : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchAgents}
              className={clsx(
                'flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-lg transition-colors',
                hasGpsOnly
                  ? 'text-amber-300 hover:text-white border-amber-700 hover:border-amber-500'
                  : 'text-orange-300 hover:text-white border-orange-700 hover:border-orange-500'
              )}
              title="Refresh now"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            {!silenced && (
              <button
                onClick={handleSilence}
                className={clsx(
                  'flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-lg transition-colors',
                  hasGpsOnly
                    ? 'text-amber-300 hover:text-white border-amber-700 hover:border-amber-500'
                    : 'text-orange-300 hover:text-white border-orange-700 hover:border-orange-500'
                )}
              >
                <VolumeX className="h-3.5 w-3.5" />
                Silence
              </button>
            )}
          </div>
        </div>

        {/* Agent rows */}
        <div className="divide-y divide-orange-900/40 max-h-52 overflow-y-auto">
          {visible.map(agent => {
            const isGpsOnly    = agent.availability_status === 'GPS_DISABLED'
            const offlineSince = agent.offline_since
              ? formatDistanceToNow(new Date(agent.offline_since), { addSuffix: true })
              : 'recently'
            const lastSeen = agent.last_ping_at
              ? formatDistanceToNow(new Date(agent.last_ping_at), { addSuffix: true })
              : 'unknown'
            const reasonLabel = REASON_LABEL[agent.offline_reason ?? 'TIMEOUT'] ?? 'Unknown reason'
            const reasonCls   = REASON_COLOR[agent.offline_reason ?? ''] ?? REASON_COLOR.default
            const hasCoords   = agent.last_lat != null && agent.last_lng != null

            return (
              <div key={agent.session_id} className="flex items-start gap-4 px-4 py-3">
                {/* Icon */}
                {isGpsOnly ? (
                  <MapPin className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                ) : (
                  <WifiOff className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                )}

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-bold text-sm leading-tight">
                      {agent.agent_name ?? 'Unknown Agent'}
                    </p>
                    <span className={clsx(
                      'text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider',
                      isGpsOnly
                        ? 'bg-amber-900/60 text-amber-400 border border-amber-800'
                        : 'bg-orange-900/60 text-orange-400 border border-orange-800'
                    )}>
                      {agent.availability_status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-slate-400 text-[11px] mt-0.5">
                    {agent.agent_badge} · {agent.agent_institution}
                    {agent.report_title && (
                      <span className="text-slate-500"> · {agent.report_title}</span>
                    )}
                  </p>

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className={clsx('text-[10px] font-medium', reasonCls)}>
                      {reasonLabel}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      offline {offlineSince}
                    </span>
                    <span className="text-[10px] text-slate-700 font-mono">
                      last seen {lastSeen}
                    </span>
                    {hasCoords && (
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${agent.last_lat}&mlon=${agent.last_lng}&zoom=15`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white underline underline-offset-2 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Last GPS {Number(agent.last_lat).toFixed(4)}, {Number(agent.last_lng).toFixed(4)}
                      </a>
                    )}
                  </div>
                </div>

                {/* Dismiss / Agent back online button */}
                <button
                  onClick={() => handleDismiss(agent.session_id)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border shrink-0 self-center
                    bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-300 hover:text-white transition-all"
                  title="Dismiss this alert"
                >
                  <Wifi className="h-3.5 w-3.5" />
                  Dismiss
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className={clsx(
          'px-4 py-2 border-t',
          hasGpsOnly ? 'border-amber-900/50 bg-amber-950/40' : 'border-orange-900/50 bg-orange-950/40'
        )}>
          <p className={clsx('text-[10px] text-center',
            hasGpsOnly ? 'text-amber-800' : 'text-orange-800'
          )}>
            Status restores automatically when connectivity returns · Auto-refreshes every 15s
          </p>
        </div>
      </div>
    </>
  )
}
