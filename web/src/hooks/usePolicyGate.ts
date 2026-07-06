'use client'
import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { policyApi } from '@/lib/api'

// Checks whether the logged-in user has accepted all active policy documents.
// If any are pending, redirects to /agree?next=<current_path>.
// Runs once per mount (not on every navigation) — the DashboardShell re-mounts
// only when the user navigates to a different layout group.
export function usePolicyGate() {
  const { user, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const checked  = useRef(false)

  useEffect(() => {
    if (loading || !user || checked.current) return
    checked.current = true

    policyApi.getPending()
      .then(res => {
        if (!res.data.all_accepted && res.data.pending.length > 0) {
          const next = encodeURIComponent(pathname ?? '/')
          router.replace(`/agree?next=${next}`)
        }
      })
      .catch(() => {
        // On network error, don't block access — policies are best-effort on failure
      })
  }, [loading, user, pathname, router])
}
