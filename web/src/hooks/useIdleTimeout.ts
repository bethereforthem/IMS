'use client'
import { useEffect, useRef, useCallback, useState } from 'react'

const IDLE_MS    = 5 * 60 * 1000   // 5 minutes until logout
const WARN_MS    = 30 * 1000        // show warning 30 s before logout

const EVENTS: (keyof WindowEventMap)[] = [
  'mousemove', 'mousedown', 'keydown', 'scroll',
  'touchstart', 'click', 'wheel', 'pointermove',
]

export interface IdleState {
  /** True when the warning modal should be shown */
  warn: boolean
  /** Seconds remaining until auto-logout (only meaningful when warn=true) */
  secondsLeft: number
  /** Call this to reset the idle timer (user clicked "Stay logged in") */
  keepAlive: () => void
}

/**
 * Tracks user inactivity.
 * Calls `onLogout` after IDLE_MS of no activity.
 * Fires `warn=true` at IDLE_MS - WARN_MS so the UI can show a countdown modal.
 */
export function useIdleTimeout(onLogout: () => void): IdleState {
  const logoutTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [warn,        setWarn]        = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(30)

  const clearAll = useCallback(() => {
    if (logoutTimer.current)  clearTimeout(logoutTimer.current)
    if (warnTimer.current)    clearTimeout(warnTimer.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  const startCountdown = useCallback(() => {
    setWarn(true)
    setSecondsLeft(Math.round(WARN_MS / 1000))
    countdownRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [])

  const reset = useCallback(() => {
    clearAll()
    setWarn(false)
    setSecondsLeft(Math.round(WARN_MS / 1000))

    warnTimer.current   = setTimeout(startCountdown, IDLE_MS - WARN_MS)
    logoutTimer.current = setTimeout(() => {
      setWarn(false)
      onLogout()
    }, IDLE_MS)
  }, [clearAll, startCountdown, onLogout])

  // Start on mount, listen to activity events
  useEffect(() => {
    reset()
    EVENTS.forEach(ev => window.addEventListener(ev, reset, { passive: true }))
    return () => {
      clearAll()
      EVENTS.forEach(ev => window.removeEventListener(ev, reset))
    }
  }, [reset, clearAll])

  return { warn, secondsLeft, keepAlive: reset }
}
