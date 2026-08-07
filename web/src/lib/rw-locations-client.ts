'use client'
/**
 * rw-locations-client.ts — browser-side access to the location dataset.
 *
 * The tree is ~183 KB raw (~58 KB gzipped), so it is pulled in through a
 * dynamic import: webpack emits it as its own chunk that is fetched the first
 * time a LocationSelector mounts, rather than shipping it in the main bundle to
 * every page. The parsed tree is then held in module scope, so it is fetched
 * and parsed once per session no matter how many selectors are on screen.
 */
import { useEffect, useState } from 'react'
import type { RwLocationTree } from './rw-locations'

let cache: RwLocationTree | null = null
let inflight: Promise<RwLocationTree> | null = null

/** The tree if it has already been loaded, else `null`. Never triggers a fetch. */
export function peekRwLocationTree(): RwLocationTree | null {
  return cache
}

/** Fetch (or reuse) the dataset. Concurrent callers share one request. */
export function loadRwLocationTree(): Promise<RwLocationTree> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = import('@/generated/rw-locations.json')
      .then(mod => {
        cache = (mod.default ?? mod) as unknown as RwLocationTree
        return cache
      })
      .catch(err => {
        inflight = null                    // allow a retry on the next mount
        throw err
      })
  }
  return inflight
}

export interface RwLocationTreeState {
  tree: RwLocationTree | null
  loading: boolean
  error: Error | null
}

/** React binding for the loader. */
export function useRwLocationTree(): RwLocationTreeState {
  const [state, setState] = useState<RwLocationTreeState>(() => ({
    tree: cache,
    loading: cache === null,
    error: null,
  }))

  useEffect(() => {
    if (cache) return
    let alive = true
    loadRwLocationTree()
      .then(tree => { if (alive) setState({ tree, loading: false, error: null }) })
      .catch(error => { if (alive) setState({ tree: null, loading: false, error }) })
    return () => { alive = false }
  }, [])

  return state
}
