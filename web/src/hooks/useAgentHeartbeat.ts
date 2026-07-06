'use client'

import { useEffect, useRef, useCallback } from 'react'
import Cookies from 'js-cookie'

// ── Constants ─────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 20_000  // 20s — must be < OFFLINE_THRESHOLD_SECONDS (90s)
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = Cookies.get('ims_access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function postHeartbeat(lat?: number | null, lng?: number | null): Promise<void> {
  await fetch(`${BASE_URL}/agent-tracking/heartbeat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body:    JSON.stringify({ location_lat: lat ?? null, location_lng: lng ?? null }),
  })
}

// keepalive: true keeps the request alive across page unload — same as sendBeacon but with auth
function beaconOffline(reason: string, lat?: number | null, lng?: number | null): void {
  const token = Cookies.get('ims_access_token')
  if (!token) return
  try {
    fetch(`${BASE_URL}/agent-tracking/offline`, {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:      JSON.stringify({ reason, location_lat: lat ?? null, location_lng: lng ?? null }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* best-effort — fires on beforeunload */ }
}

async function postOffline(reason: string, lat?: number | null, lng?: number | null): Promise<void> {
  await fetch(`${BASE_URL}/agent-tracking/offline`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body:    JSON.stringify({ reason, location_lat: lat ?? null, location_lng: lng ?? null }),
  })
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useAgentHeartbeat
 * Runs for all authenticated users on the dashboard.
 * Sends regular heartbeats and proactive offline notifications.
 * Should be mounted once in DashboardShell.
 */
export function useAgentHeartbeat(): void {
  const gpsRef        = useRef<{ lat: number; lng: number } | null>(null)
  const gpsWatchRef   = useRef<number | null>(null)
  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const isOnlineRef   = useRef(true)

  // ── GPS watch (background, best-effort) ─────────────────────────────────────
  const startGPS = useCallback(() => {
    if (!navigator.geolocation || gpsWatchRef.current !== null) return
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        gpsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      },
      err => {
        // GPS disabled or permission denied → notify server
        if (err.code === GeolocationPositionError.PERMISSION_DENIED ||
            err.code === GeolocationPositionError.POSITION_UNAVAILABLE) {
          const gps = gpsRef.current
          postOffline('GPS_DISABLED', gps?.lat ?? null, gps?.lng ?? null).catch(() => {})
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }, [])

  const stopGPS = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
  }, [])

  // ── Main effect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Start GPS monitoring
    startGPS()

    // Send initial heartbeat immediately
    const gps = gpsRef.current
    postHeartbeat(gps?.lat, gps?.lng).catch(() => {})

    // Periodic heartbeat
    heartbeatRef.current = setInterval(() => {
      if (!isOnlineRef.current) return  // don't waste cycles when we know we're offline
      const pos = gpsRef.current
      postHeartbeat(pos?.lat, pos?.lng).catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)

    // ── Network offline event ──────────────────────────────────────────────────
    function handleNetworkOffline() {
      isOnlineRef.current = false
      const gps = gpsRef.current
      // Try to notify server — may fail if truly no network, but attempt anyway
      postOffline('NO_NETWORK', gps?.lat ?? null, gps?.lng ?? null).catch(() => {})
    }

    // ── Network online recovery ────────────────────────────────────────────────
    function handleNetworkOnline() {
      isOnlineRef.current = true
      // Immediately send heartbeat to restore ONLINE status on server
      const pos = gpsRef.current
      postHeartbeat(pos?.lat, pos?.lng).catch(() => {})
    }

    // ── Page unload (app terminated / browser closed) ──────────────────────────
    function handleBeforeUnload() {
      const gps = gpsRef.current
      // keepalive fetch survives page unload
      beaconOffline('APP_TERMINATED', gps?.lat ?? null, gps?.lng ?? null)
    }

    window.addEventListener('offline',       handleNetworkOffline)
    window.addEventListener('online',        handleNetworkOnline)
    window.addEventListener('beforeunload',  handleBeforeUnload)

    return () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      stopGPS()
      window.removeEventListener('offline',      handleNetworkOffline)
      window.removeEventListener('online',       handleNetworkOnline)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [startGPS, stopGPS])
}
