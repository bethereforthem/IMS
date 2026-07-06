'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'

/**
 * Attempts to obtain the device GPS position once on mount.
 * If granted, injects X-GPS-Lat and X-GPS-Lng headers on every
 * subsequent Axios request so the server-side audit log can store them.
 */
export function useGeoAudit() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        api.defaults.headers.common['X-GPS-Lat'] = String(coords.latitude)
        api.defaults.headers.common['X-GPS-Lng'] = String(coords.longitude)
      },
      () => {
        // Permission denied or unavailable — proceed without GPS
        delete api.defaults.headers.common['X-GPS-Lat']
        delete api.defaults.headers.common['X-GPS-Lng']
      },
      { timeout: 5000, maximumAge: 120000 },
    )
  }, [])
}
