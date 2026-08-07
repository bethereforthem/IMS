'use client'
import { useEffect, useState } from 'react'
import { correctionsApi } from '@/lib/api'

/**
 * The facility names that actually appear in `corrections_records`.
 *
 * Both custody modals used to offer the same hardcoded list of six prisons,
 * with option values ("Mageragere") that did not match their labels
 * ("Mageragere Prison") or the values already stored. Editing a record held at
 * any of the other seven facilities showed an empty select, and saving from
 * that state rewrote the inmate's facility to whatever was picked.
 *
 * `facility_name` is free text in the schema, so this is offered as suggestions
 * rather than a closed list — a new facility can still be typed in.
 */
export function useFacilities(): { facilities: string[]; loading: boolean } {
  const [facilities, setFacilities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    correctionsApi.stats()
      .then(r => {
        if (cancelled) return
        setFacilities((r.data?.by_facility ?? []).map(f => f.facility_name).filter(f => f !== 'Unassigned'))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { facilities, loading }
}
