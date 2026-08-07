/**
 * rw-locations-server.ts — server-side access to the location dataset.
 *
 * Route handlers must never trust a submitted location chain: the client is the
 * only thing enforcing the cascade, and a payload can be replayed, hand-rolled
 * or simply stale after a dataset update. Everything arriving from a form goes
 * through `assertRwLocation` before it is persisted.
 *
 * The dataset is imported statically here, so this module belongs to the server
 * bundle only. Client components must go through rw-locations-client.ts, which
 * loads the same data as a lazy chunk — importing this file from the browser
 * would put 183 KB into the main bundle.
 */
import treeJson from '@/generated/rw-locations.json'
import {
  RW_LEVELS,
  formatRwLocation,
  rwLocationFrom,
  rwLocationFromFields,
  validateRwLocation,
  type RwLevel,
  type RwLocation,
  type RwLocationTree,
  type RwValidationOptions,
} from './rw-locations'

const TREE = treeJson as unknown as RwLocationTree

export function rwLocationTree(): RwLocationTree {
  return TREE
}

export interface RwAssertResult {
  ok: boolean
  /** Trimmed, validated chain — safe to persist. */
  value: RwLocation
  /** Narrowest-first string, e.g. for a legacy free-text address column. */
  formatted: string
  /** `null` when ok; otherwise a message naming the offending level. */
  error: string | null
  errors: Partial<Record<RwLevel, string>>
}

/**
 * Re-validate a submitted chain against the authoritative dataset.
 *
 * Confirms the district really belongs to that province, the sector to that
 * district, and so on — the checks that make a name meaningful, given sector,
 * cell and village names repeat across the country.
 */
export function assertRwLocation(
  body: Partial<Record<RwLevel, unknown>> | null | undefined,
  options: RwValidationOptions = {},
): RwAssertResult {
  const value = rwLocationFrom(body)
  const result = validateRwLocation(TREE, value, options)

  let error: string | null = null
  for (const level of RW_LEVELS) {
    if (result.errors[level]) { error = result.errors[level]!; break }
  }

  return {
    ok: result.ok,
    value,
    formatted: formatRwLocation(value, options.depth ?? 'village'),
    error,
    errors: result.errors,
  }
}

export interface RwLocationCheck {
  /** Where this chain came from, used to build a readable error. */
  label: string
  /** The object holding the chain — a request body, a nested person, … */
  value: unknown
  /** Field-name map, when the chain is not under the canonical keys. */
  fields?: Partial<Record<RwLevel, string>>
  depth?: RwLevel
  required?: boolean
}

/**
 * Validate several chains at once — a case report carries one per person plus
 * the crime scene, and rejecting the whole payload on the first bad one would
 * make it tedious to correct.
 *
 * Chains that are entirely empty pass unless `required`, so this can be applied
 * to optional address fields without forcing them to be filled in.
 */
export function assertRwLocations(checks: RwLocationCheck[]): { ok: boolean; errors: string[] } {
  const errors: string[] = []

  for (const check of checks) {
    if (!check.value || typeof check.value !== 'object') continue
    const source = check.value as Record<string, unknown>
    const value = check.fields
      ? rwLocationFromFields(source, check.fields)
      : rwLocationFrom(source as Partial<Record<RwLevel, unknown>>)

    const result = validateRwLocation(TREE, value, {
      depth: check.depth ?? 'village',
      required: check.required ?? false,
    })
    if (result.ok) continue

    for (const level of RW_LEVELS) {
      const msg = result.errors[level]
      if (msg) errors.push(`${check.label}: ${msg}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export { formatRwLocation, rwLocationFrom, rwLocationFromFields }
export type { RwLevel, RwLocation }
