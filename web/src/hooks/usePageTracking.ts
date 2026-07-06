'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { adminPortalApi } from '@/lib/api'

export function usePageTracking() {
  const pathname = usePathname()
  const visitIdRef = useRef<string | null>(null)
  const prevPathRef = useRef<string | null>(null)

  useEffect(() => {
    const path = pathname ?? ''

    // Close out the previous page visit
    const closeVisit = (p: string, vid: string) => {
      adminPortalApi.trackPageLeave(p, vid).catch(() => {})
    }

    // Open new visit
    const openVisit = (p: string) => {
      const title = typeof document !== 'undefined' ? document.title : ''
      adminPortalApi.trackPageEnter(p, title)
        .then(r => { visitIdRef.current = r.data?.visit_id ?? null })
        .catch(() => {})
    }

    // If there was a previous page with an open visit, close it
    if (prevPathRef.current && visitIdRef.current) {
      closeVisit(prevPathRef.current, visitIdRef.current)
      visitIdRef.current = null
    }

    prevPathRef.current = path
    openVisit(path)

    // Close on unmount / tab close
    return () => {
      if (path && visitIdRef.current) {
        closeVisit(path, visitIdRef.current)
        visitIdRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
}
