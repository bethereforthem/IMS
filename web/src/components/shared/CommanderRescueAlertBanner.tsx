'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { commanderRescueApi } from '@/lib/api'
import { alarmManager } from '@/lib/mapSounds'
import { PERMISSIONS } from '@/lib/rbac'
import { formatDistanceToNow } from 'date-fns'
import {
  Crown, CheckCircle, VolumeX, ExternalLink, Radio,
} from 'lucide-react'
import clsx from 'clsx'
import type { Alert } from '@/types'

// ── GPS coordinate extractor ──────────────────────────────────────────────────

function parseGPS(message: string): { lat: number; lng: number } | null {
  const m = message.match(/GPS:\s*([-\d.]+),?\s+([-\d.]+)/)
  if (!m) return null
  const lat = parseFloat(m[1]), lng = parseFloat(m[2])
  if (isNaN(lat) || isNaN(lng)) return null
  return { lat, lng }
}

function isCommanderRescue(alert: Alert): boolean {
  return alert.title.startsWith('🆘')
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommanderRescueAlertBanner() {
  const { user } = useAuth()
  const [rescueAlerts, setRescueAlerts]   = useState<Alert[]>([])
  const [acking, setAcking]               = useState<Set<string>>(new Set())
  const [silenced, setSilenced]           = useState(false)
  const [flash, setFlash]                 = useState(false)
  const seenRef                           = useRef<Set<string>>(new Set())
  const flashTimerRef                     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Only commanders with commander_rescue:trigger can see this banner
  const canSee = !!user && !!(PERMISSIONS[user.role]?.has('commander_rescue:trigger'))

  const fetchRescues = useCallback(() => {
    if (!canSee) return
    commanderRescueApi.getActive()
      .then(r => {
        const all: Alert[] = r.data?.alerts ?? []
        const list = all.filter(isCommanderRescue)

        const newAlerts = list.filter(a => !seenRef.current.has(a.id))
        if (newAlerts.length > 0) {
          newAlerts.forEach(a => {
            seenRef.current.add(a.id)
            if (!silenced) alarmManager.register(a.id, 'commander')
          })
          setFlash(true)
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
          flashTimerRef.current = setTimeout(() => setFlash(false), 1200)
        }

        setRescueAlerts(prev => {
          prev.forEach(prevAlert => {
            if (!list.find(a => a.id === prevAlert.id)) {
              alarmManager.drop(prevAlert.id)
            }
          })
          return list
        })
      })
      .catch(() => {})
  }, [canSee, silenced])

  useEffect(() => {
    if (!canSee) return
    fetchRescues()
    const id = setInterval(fetchRescues, 12_000) // slightly faster poll than agent SOS — commanders need faster response
    return () => {
      clearInterval(id)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSee])

  async function handleAcknowledge(alertId: string) {
    setAcking(prev => new Set([...prev, alertId]))
    try {
      await commanderRescueApi.acknowledge(alertId)
      alarmManager.drop(alertId)
      seenRef.current.delete(alertId)
      setRescueAlerts(prev => prev.filter(a => a.id !== alertId))
    } catch { /* silent — retry on next poll */ }
    finally {
      setAcking(prev => { const n = new Set(prev); n.delete(alertId); return n })
    }
  }

  function handleSilence() {
    alarmManager.silence()
    setSilenced(true)
  }

  if (!canSee || rescueAlerts.length === 0) return null

  return (
    <>
      {/* Full-screen amber flash on new rescue alert */}
      {flash && (
        <div
          className="fixed inset-0 z-[9994] pointer-events-none animate-pulse"
          style={{ background: 'rgba(245,158,11,0.18)' }}
        />
      )}

      {/* Alert panel — rendered at top of page content (non-fixed) */}
      <div className="mb-4 rounded-2xl border-2 border-amber-500 bg-amber-950/80 shadow-2xl shadow-amber-950/50 overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 bg-amber-900/60 px-4 py-2.5 border-b border-amber-800">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
            </span>
            <span className="text-amber-100 font-black text-sm tracking-widest uppercase">
              Commander Rescue Alerts
            </span>
            <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
              {rescueAlerts.length} ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-amber-300 bg-amber-900/50 px-2.5 py-1 rounded-full border border-amber-800">
              <Radio className="h-3 w-3 animate-pulse" />
              Immediate Response Required
            </div>
            {!silenced && (
              <button
                onClick={handleSilence}
                className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-white border border-amber-700 hover:border-amber-500 px-2.5 py-1 rounded-lg transition-colors"
              >
                <VolumeX className="h-3.5 w-3.5" />
                Silence
              </button>
            )}
          </div>
        </div>

        {/* Rescue alert rows */}
        <div className="divide-y divide-amber-900/50 max-h-56 overflow-y-auto">
          {rescueAlerts.map(alert => {
            const gps      = parseGPS(alert.message)
            const isAcking = acking.has(alert.id)
            const age      = formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })

            return (
              <div key={alert.id} className="flex items-start gap-4 px-4 py-3">
                {/* Icon */}
                <Crown className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm leading-tight truncate">
                    {alert.title}
                  </p>
                  <p className="text-amber-300 text-[11px] mt-0.5 leading-relaxed line-clamp-2">
                    {alert.message}
                  </p>

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {gps ? (
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lng}&zoom=15`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-white underline underline-offset-2 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        GPS {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)} — View Map
                      </a>
                    ) : (
                      <span className="text-[10px] text-amber-600">GPS not available</span>
                    )}
                    <span className="text-[10px] text-amber-700 font-mono">{age}</span>
                  </div>
                </div>

                {/* Acknowledge / Dispatch button */}
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  disabled={isAcking}
                  className={clsx(
                    'flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all shrink-0 self-center',
                    isAcking
                      ? 'opacity-50 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-400'
                      : 'bg-green-800 hover:bg-green-700 border-green-600 text-white shadow-lg shadow-green-950/50'
                  )}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  {isAcking ? 'Dispatching…' : 'Dispatch'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-amber-900/50 bg-amber-950/40">
          <p className="text-[10px] text-amber-700 text-center">
            Dispatch confirms rescue team response has been initiated · Auto-refreshes every 12s
          </p>
        </div>
      </div>
    </>
  )
}
