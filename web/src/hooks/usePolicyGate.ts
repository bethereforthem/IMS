'use client'
import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { policyApi } from '@/lib/api'

// Module-level cache: once a user is confirmed as having accepted all active policies,
// skip the DB check when DashboardShell remounts (e.g., navigating between institutions).
// This Set is cleared automatically when logout triggers window.location.href = '/login',
// which causes a full page reload and resets all module-level state.
const sessionAccepted = new Set<string>()

// Checks whether the logged-in user has accepted all active policy documents.
// If any are pending, redirects to /agree?next=<current_path>.
// The check runs at most once per DashboardShell mount; once confirmed accepted within
// a session, subsequent institution-navigation remounts skip the API call entirely.
export function usePolicyGate() {
  const { user, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const checked  = useRef(false)

  useEffect(() => {
    if (loading || !user || checked.current) return
    // Already confirmed accepted in this session — no need to hit the DB again
    if (sessionAccepted.has(user.badge_number)) return
    checked.current = true

    // Fast path: JWT flag set at login means the user has previously accepted all
    // policies. Skip the API round-trip and cache immediately.
    if (user.has_accepted_policies) {
      sessionAccepted.add(user.badge_number)
      return
    }

    policyApi.getPending()
      .then(res => {
        if (res.data.all_accepted) {
          // Cache: skip further checks while this page session is alive
          sessionAccepted.add(user.badge_number)
        } else if (res.data.pending.length > 0) {
          const next = encodeURIComponent(pathname ?? '/')
          router.replace(`/agree?next=${next}`)
        }
      })
      .catch(() => {
        // On network error, don't block access — policies are best-effort on failure
      })
  }, [loading, user, pathname, router])
}
