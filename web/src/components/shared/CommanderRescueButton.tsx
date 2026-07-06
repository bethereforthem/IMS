'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { commanderRescueApi } from '@/lib/api'
import { PERMISSIONS } from '@/lib/rbac'
import { Crown, MapPin, X, Zap, Radio, CheckCircle } from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

type RescuePhase = 'idle' | 'holding' | 'confirming' | 'sending' | 'active'

interface GPSCoords {
  lat: number
  lng: number
  accuracy?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HOLD_DURATION_MS = 3000
const HOLD_TICK_MS     = 80
const PING_INTERVAL_MS = 12000
const MIN_PING_GAP_MS  = 8000

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommanderRescueButton() {
  const { user } = useAuth()

  const canTrigger = !!user && !!(PERMISSIONS[user.role]?.has('commander_rescue:trigger'))

  const [phase, setPhase]         = useState<RescuePhase>('idle')
  const [holdPct, setHoldPct]     = useState(0)
  const [gps, setGps]             = useState<GPSCoords | null>(null)
  const [gpsErr, setGpsErr]       = useState<string | null>(null)
  const [sendErr, setSendErr]     = useState<string | null>(null)
  const [elapsed, setElapsed]     = useState(0)
  const [activeSince, setActiveSince] = useState<Date | null>(null)
  const [alertId, setAlertId]     = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rescueTeams, setRescueTeams] = useState<string[]>([])
  const [resolving, setResolving] = useState(false)

  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gpsWatchRef  = useRef<number | null>(null)
  const lastPingRef  = useRef<number>(0)
  const gpsRef       = useRef<GPSCoords | null>(null)

  // Keep gpsRef synced so ping closure always has latest coords
  useEffect(() => { gpsRef.current = gps }, [gps])

  // ── GPS watch ───────────────────────────────────────────────────────────────
  const startGPSWatch = useCallback(() => {
    if (!navigator.geolocation) { setGpsErr('Geolocation not supported'); return }
    if (gpsWatchRef.current !== null) return
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setGpsErr(null)
      },
      err => setGpsErr(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 4000 }
    )
  }, [])

  const stopGPSWatch = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
    setGps(null)
    setGpsErr(null)
  }, [])

  useEffect(() => {
    if (phase === 'confirming' || phase === 'active') startGPSWatch()
    if (phase === 'idle') stopGPSWatch()
  }, [phase, startGPSWatch, stopGPSWatch])

  // ── Ping interval during active ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !sessionId) return

    const sendPing = async () => {
      const coords = gpsRef.current
      if (!coords) return
      const now = Date.now()
      if (now - lastPingRef.current < MIN_PING_GAP_MS) return
      lastPingRef.current = now
      try {
        await commanderRescueApi.sendPing({
          session_id: sessionId,
          lat: coords.lat,
          lng: coords.lng,
          accuracy_m: coords.accuracy,
        })
      } catch { /* fire-and-forget */ }
    }

    sendPing()
    pingTimerRef.current = setInterval(sendPing, PING_INTERVAL_MS)
    return () => {
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
    }
  }, [phase, sessionId])

  // ── Elapsed counter ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !activeSince) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - activeSince.getTime()) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase, activeSince])

  // ── Hold logic ───────────────────────────────────────────────────────────────
  function startHold() {
    if (phase !== 'idle') return
    setPhase('holding')
    setHoldPct(0)
    let pct = 0
    const increment = (HOLD_TICK_MS / HOLD_DURATION_MS) * 100
    holdTimerRef.current = setInterval(() => {
      pct = Math.min(pct + increment, 100)
      setHoldPct(pct)
      if (pct >= 100) finishHold()
    }, HOLD_TICK_MS)
  }

  function cancelHold() {
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
    if (phase === 'holding') { setPhase('idle'); setHoldPct(0) }
  }

  function finishHold() {
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
    setHoldPct(100)
    setPhase('confirming')
    setSendErr(null)
  }

  // ── Send rescue ───────────────────────────────────────────────────────────────
  async function sendRescue() {
    setPhase('sending')
    setSendErr(null)
    const coords = gpsRef.current
    try {
      const res = await commanderRescueApi.trigger({
        location_lat:         coords?.lat ?? null,
        location_lng:         coords?.lng ?? null,
        location_description: coords
          ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
          : undefined,
      })
      if (res.data?.sent) {
        setAlertId(res.data.alert_id)
        setSessionId(res.data.tracking_session_id ?? null)
        setRescueTeams(res.data.rescue_teams ?? [])
        setActiveSince(new Date())
        setElapsed(0)
        setPhase('active')
      } else {
        setSendErr('Rescue alert failed to send — please retry.')
        setPhase('confirming')
      }
    } catch {
      setSendErr('Network error — check connection and retry.')
      setPhase('confirming')
    }
  }

  // ── Resolve / mark safe ───────────────────────────────────────────────────────
  async function resolveRescue() {
    if (!alertId || resolving) return
    setResolving(true)
    const sid = sessionId
    const aid = alertId

    // Stop tracking immediately
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
    stopGPSWatch()

    try {
      await commanderRescueApi.resolve(aid, sid ?? undefined)
    } catch { /* silent */ }

    setPhase('idle')
    setAlertId(null)
    setSessionId(null)
    setActiveSince(null)
    setElapsed(0)
    setHoldPct(0)
    setRescueTeams([])
    setResolving(false)
  }

  if (!user || !canTrigger) return null

  const R    = 28
  const CIRC = 2 * Math.PI * R

  return (
    <>
      {/* ── Own Rescue Active Banner ─────────────────────────────────────────── */}
      {phase === 'active' && (
        <div
          className="fixed top-0 inset-x-0 z-[9997] flex items-center justify-between gap-3 bg-amber-600 border-b-2 border-amber-400 px-4 py-2.5"
          role="alert"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
            </span>
            <span className="text-white font-black text-sm tracking-wide">COMMANDER RESCUE ACTIVE</span>
            <span className="text-amber-200 text-xs font-mono shrink-0">· {formatElapsed(elapsed)}</span>
            {gps && (
              <span className="text-amber-200 text-xs hidden md:block truncate">
                · GPS {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
                {gps.accuracy && ` ±${Math.round(gps.accuracy)}m`}
              </span>
            )}
            {!gps && (
              <span className="text-amber-300 text-xs hidden md:block">· Acquiring GPS…</span>
            )}
            {rescueTeams.length > 0 && (
              <span className="text-amber-200 text-xs hidden lg:block shrink-0">
                · Rescue: {rescueTeams.join(' + ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-amber-200 bg-amber-800/50 px-2.5 py-1 rounded-full">
              <Radio className="h-3 w-3 animate-pulse" />
              Live Tracking
            </div>
            <button
              onClick={resolveRescue}
              disabled={resolving}
              className={clsx(
                'flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border',
                resolving
                  ? 'opacity-50 cursor-not-allowed bg-amber-800 border-amber-700'
                  : 'bg-green-700 hover:bg-green-600 border-green-500'
              )}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {resolving ? 'Resolving…' : 'Mark Safe'}
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ───────────────────────────────────────────────── */}
      {phase === 'confirming' && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl border-2 border-amber-500 bg-slate-950 shadow-2xl shadow-amber-950/80 overflow-hidden">

            {/* Header */}
            <div className="bg-amber-600 px-5 py-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Crown className="h-6 w-6 text-white animate-pulse" />
                <span className="text-white font-black text-xl tracking-widest">COMMANDER RESCUE</span>
              </div>
              <p className="text-amber-200 text-xs">Dispatches rescue teams · Activates live tracking</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Commander info */}
              <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-center">
                <p className="text-white font-bold text-sm">{user.full_name}</p>
                <p className="text-amber-300 text-xs mt-0.5">{user.badge_number} · {user.institution}</p>
              </div>

              {/* GPS status */}
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <MapPin className={clsx(
                  'h-4 w-4 shrink-0',
                  gps ? 'text-green-400' : 'text-amber-400 animate-pulse'
                )} />
                <div className="min-w-0">
                  {gps ? (
                    <>
                      <p className="text-xs text-green-400 font-semibold">GPS Acquired</p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                        {gps.accuracy && ` ±${Math.round(gps.accuracy)}m`}
                      </p>
                    </>
                  ) : gpsErr ? (
                    <>
                      <p className="text-xs text-amber-400 font-semibold">GPS Unavailable</p>
                      <p className="text-[10px] text-slate-500 truncate">{gpsErr}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-amber-400 font-semibold">Acquiring location…</p>
                      <p className="text-[10px] text-slate-500">Alert will send even without GPS</p>
                    </>
                  )}
                </div>
              </div>

              {sendErr && (
                <p className="text-red-400 text-xs text-center bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2">
                  {sendErr}
                </p>
              )}

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                Your live location will be continuously transmitted until you mark yourself safe.
                Only press if you genuinely require immediate rescue.
              </p>
            </div>

            <div className="px-5 pb-5 space-y-2">
              <button
                onClick={sendRescue}
                className="w-full flex items-center justify-center gap-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-black py-4 rounded-xl text-base transition-all shadow-lg shadow-amber-900/60 border border-amber-500"
              >
                <Zap className="h-5 w-5" />
                SEND RESCUE REQUEST
              </button>
              <button
                onClick={() => { setPhase('idle'); setSendErr(null) }}
                className="w-full py-2.5 text-slate-400 hover:text-white text-sm font-medium rounded-xl hover:bg-slate-800/60 transition-colors"
              >
                Cancel — I am safe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sending Overlay ───────────────────────────────────────────────────── */}
      {phase === 'sending' && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black/85 backdrop-blur-md">
          <div className="text-center px-8">
            <div className="h-14 w-14 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mx-auto mb-5" />
            <p className="text-white font-black text-lg">Dispatching Rescue Teams…</p>
            <p className="text-slate-400 text-sm mt-1">Contacting rescue units. Do not close.</p>
          </div>
        </div>
      )}

      {/* ── Floating Commander Rescue Button (hidden when rescue active) ─────── */}
      {phase !== 'active' && (
        <div className="fixed bottom-24 right-6 z-[9989] select-none">
          <div className="relative group">

            {/* Idle outer pulse rings */}
            {phase === 'idle' && (
              <>
                <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping"
                     style={{ animationDuration: '2.6s' }} />
                <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping"
                     style={{ animationDuration: '3.2s', animationDelay: '0.8s' }} />
              </>
            )}

            {/* SVG progress ring */}
            <svg
              className="absolute inset-0 -rotate-90 pointer-events-none"
              width="64" height="64"
              viewBox="0 0 64 64"
              aria-hidden="true"
            >
              <circle cx="32" cy="32" r={R} fill="none" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.25" />
              {phase === 'holding' && (
                <circle
                  cx="32" cy="32" r={R}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="3.5"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - holdPct / 100)}
                  strokeLinecap="round"
                  style={{ transition: `stroke-dashoffset ${HOLD_TICK_MS}ms linear` }}
                />
              )}
            </svg>

            {/* Main button */}
            <button
              aria-label="Commander Rescue — hold for 3 seconds to activate"
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={e => { e.preventDefault(); startHold() }}
              onTouchEnd={e => { e.preventDefault(); cancelHold() }}
              onContextMenu={e => e.preventDefault()}
              className={clsx(
                'relative w-16 h-16 rounded-full flex items-center justify-center',
                'transition-all duration-150 select-none touch-none cursor-pointer',
                'border-2 border-white/20',
                phase === 'holding'
                  ? 'bg-amber-500 scale-95 shadow-[0_0_28px_rgba(245,158,11,0.9)]'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.5)] hover:shadow-[0_0_22px_rgba(245,158,11,0.75)]'
              )}
            >
              <Crown className="h-7 w-7 text-white" />
            </button>

            {/* Tooltip / countdown label */}
            <div className={clsx(
              'absolute bottom-full right-0 mb-2.5 pointer-events-none',
              phase === 'holding' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              'transition-opacity'
            )}>
              <div className={clsx(
                'text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap border',
                phase === 'holding'
                  ? 'bg-amber-900 text-amber-200 border-amber-700'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              )}>
                {phase === 'holding'
                  ? `Hold… ${Math.max(0, Math.ceil(((100 - holdPct) / 100) * (HOLD_DURATION_MS / 1000)))}s`
                  : 'Hold 3s — Commander Rescue'}
              </div>
            </div>

            {/* "COMMANDERS ONLY" label below button */}
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[9px] text-amber-500 font-bold tracking-widest uppercase">
                Cmdr Only
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Active rescue mini-button: "Mark Safe" ───────────────────────────── */}
      {phase === 'active' && (
        <div className="fixed bottom-24 right-6 z-[9989]">
          <button
            onClick={resolveRescue}
            disabled={resolving}
            className={clsx(
              'w-16 h-16 rounded-full flex flex-col items-center justify-center gap-0.5',
              'border-2 transition-all shadow-lg text-white',
              resolving
                ? 'opacity-60 cursor-not-allowed bg-slate-700 border-slate-600'
                : 'bg-green-700 hover:bg-green-600 border-green-500 shadow-green-900/60'
            )}
            title="Mark yourself safe and close rescue"
          >
            <CheckCircle className="h-6 w-6" />
            <span className="text-[8px] font-black tracking-wider leading-none">SAFE</span>
          </button>
        </div>
      )}
    </>
  )
}
