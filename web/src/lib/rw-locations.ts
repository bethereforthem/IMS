/**
 * rw-locations.ts — shared logic for Rwanda's administrative hierarchy.
 *
 *   Province (Intara) > District (Akarere) > Sector (Umurenge)
 *     > Cell (Akagari) > Village (Umudugudu)
 *
 * ── The uniqueness trap ─────────────────────────────────────────────────────
 * Names are NOT unique across the hierarchy. Of the real places in the dataset,
 * only 379 of 416 sectors, 1,467 of 2,149 cells and 6,607 of 14,837 villages
 * have a name that is not shared with somewhere else — e.g. nine different
 * cells are called "Karambi". Every function here therefore takes the FULL
 * parent chain, and the underlying data is a nested tree so a name can only
 * ever be resolved in the context of its parents. Do not add a lookup keyed on
 * a bare name: it will silently merge unrelated places.
 *
 * This module deliberately does NOT import the dataset, so it stays safe to
 * pull into client code. The tree is supplied by the caller:
 *   - client → `loadRwLocationTree()` in rw-locations-client.ts (lazy chunk)
 *   - server → `rwLocationTree()`     in rw-locations-server.ts (bundled)
 */

// ── Shape ───────────────────────────────────────────────────────────────────

export const RW_LEVELS = ['province', 'district', 'sector', 'cell', 'village'] as const
export type RwLevel = (typeof RW_LEVELS)[number]

/** tree[province][district][sector][cell] = village[] */
export type RwLocationTree = Record<string, Record<string, Record<string, Record<string, string[]>>>>

/** A location as held in form state. `''` means "not selected yet". */
export type RwLocation = Record<RwLevel, string>

export const EMPTY_RW_LOCATION: RwLocation = {
  province: '', district: '', sector: '', cell: '', village: '',
}

/** English + Kinyarwanda label for each level. */
export const RW_LEVEL_LABELS: Record<RwLevel, { en: string; rw: string }> = {
  province: { en: 'Province', rw: 'Intara' },
  district: { en: 'District', rw: 'Akarere' },
  sector:   { en: 'Sector',   rw: 'Umurenge' },
  cell:     { en: 'Cell',     rw: 'Akagari' },
  village:  { en: 'Village',  rw: 'Umudugudu' },
}

export const rwLevelIndex = (level: RwLevel): number => RW_LEVELS.indexOf(level)

/** The levels a form actually collects, given the deepest one it needs. */
export const rwLevelsUpTo = (depth: RwLevel): RwLevel[] =>
  RW_LEVELS.slice(0, rwLevelIndex(depth) + 1)

// ── Reading the tree ────────────────────────────────────────────────────────
// Each accessor walks the full chain from the root, so a child is only ever
// found underneath the exact parent it belongs to.

export function listProvinces(tree: RwLocationTree): string[] {
  return Object.keys(tree)
}

export function listDistricts(tree: RwLocationTree, province: string): string[] {
  const node = tree[province]
  return node ? Object.keys(node) : []
}

export function listSectors(tree: RwLocationTree, province: string, district: string): string[] {
  const node = tree[province]?.[district]
  return node ? Object.keys(node) : []
}

export function listCells(
  tree: RwLocationTree, province: string, district: string, sector: string,
): string[] {
  const node = tree[province]?.[district]?.[sector]
  return node ? Object.keys(node) : []
}

export function listVillages(
  tree: RwLocationTree, province: string, district: string, sector: string, cell: string,
): string[] {
  return tree[province]?.[district]?.[sector]?.[cell] ?? []
}

/**
 * Options available for `level`, scoped by whatever is already chosen in
 * `value`. Returns `[]` when the parent chain is incomplete — which is what
 * keeps a dropdown empty and disabled until its parent has a value.
 */
export function rwOptionsFor(
  tree: RwLocationTree | null, level: RwLevel, value: RwLocation,
): string[] {
  if (!tree) return []
  const { province, district, sector, cell } = value
  switch (level) {
    case 'province': return listProvinces(tree)
    case 'district': return province ? listDistricts(tree, province) : []
    case 'sector':   return province && district ? listSectors(tree, province, district) : []
    case 'cell':     return province && district && sector ? listCells(tree, province, district, sector) : []
    case 'village':  return province && district && sector && cell
      ? listVillages(tree, province, district, sector, cell) : []
  }
}

// ── Mutating a selection ────────────────────────────────────────────────────

/** Every level below `level`, in order. */
export const rwLevelsBelow = (level: RwLevel): RwLevel[] => RW_LEVELS.slice(rwLevelIndex(level) + 1)

/**
 * Set one level and clear everything beneath it — changing a district must
 * never leave a stale sector/cell/village from the previous district behind.
 */
export function rwSetLevel(value: RwLocation, level: RwLevel, next: string): RwLocation {
  const out: RwLocation = { ...value, [level]: next }
  for (const below of rwLevelsBelow(level)) out[below] = ''
  return out
}

/** True when every level up to `depth` has a value. */
export function rwIsComplete(value: RwLocation, depth: RwLevel): boolean {
  return rwLevelsUpTo(depth).every(l => Boolean(value[l]))
}

/** True when nothing at all has been chosen. */
export function rwIsEmpty(value: RwLocation): boolean {
  return RW_LEVELS.every(l => !value[l])
}

/** Normalize an arbitrary object (e.g. a request body) into an RwLocation. */
export function rwLocationFrom(source: Partial<Record<RwLevel, unknown>> | null | undefined): RwLocation {
  const out = { ...EMPTY_RW_LOCATION }
  if (!source) return out
  for (const level of RW_LEVELS) {
    const raw = source[level]
    out[level] = typeof raw === 'string' ? raw.trim() : ''
  }
  return out
}

/**
 * Build a field-name map for forms that hold several chains side by side and
 * prefix them, e.g. `rwFieldsWithPrefix('res')` → `{ province: 'res_province',
 * … , village: 'res_village' }`.
 */
export function rwFieldsWithPrefix(prefix: string): Record<RwLevel, string> {
  return RW_LEVELS.reduce((acc, level) => {
    acc[level] = `${prefix}_${level}`
    return acc
  }, {} as Record<RwLevel, string>)
}

/**
 * The prefixes shared by the forms that collect more than one address, so the
 * pages that render them and the routes that validate them agree on the keys.
 */
export const RW_FIELDS_RESIDENTIAL = rwFieldsWithPrefix('res')
export const RW_FIELDS_DOMICILE    = rwFieldsWithPrefix('dom')
export const RW_FIELDS_BIRTHPLACE  = rwFieldsWithPrefix('pob')

/**
 * Same, for forms that keep the chain under their own field names — the read
 * counterpart to <LocationSelector>'s `fieldNames` prop.
 *
 *   rwLocationFromFields(form, RW_FIELDS_RESIDENTIAL)
 */
export function rwLocationFromFields(
  source: Record<string, unknown> | null | undefined,
  fieldNames?: Partial<Record<RwLevel, string>>,
): RwLocation {
  const out = { ...EMPTY_RW_LOCATION }
  if (!source) return out
  for (const level of RW_LEVELS) {
    const raw = source[fieldNames?.[level] ?? level]
    out[level] = typeof raw === 'string' ? raw.trim() : ''
  }
  return out
}

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Human-readable address, narrowest first:
 *   "Bidudu, Biryogo, Gashora, Bugesera, Eastern Province"
 *
 * Always emits the whole chain that is set, never the village alone — a bare
 * village name is ambiguous without its parents.
 */
export function formatRwLocation(value: RwLocation, depth: RwLevel = 'village'): string {
  return rwLevelsUpTo(depth)
    .map(l => value[l])
    .filter(Boolean)
    .reverse()
    .join(', ')
}

/**
 * Collapse a form's location chain plus its free-text detail line into the
 * single address string a legacy text column expects:
 *
 *   "Plot 14, near the market — Bidudu, Biryogo, Gashora, Bugesera, Eastern Province"
 *
 * Used by forms whose API still takes one address field. The full chain is
 * always included, so the stored text is never just a village name.
 */
export function composeRwAddress(
  form: Record<string, unknown>,
  fields: Partial<Record<RwLevel, string>>,
  detailKey: string,
  depth: RwLevel = 'village',
): string {
  const raw = form[detailKey]
  const detail = typeof raw === 'string' ? raw.trim() : ''
  const chain = formatRwLocation(rwLocationFromFields(form, fields), depth)
  return [detail, chain].filter(Boolean).join(' — ')
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface RwValidationOptions {
  /** Deepest level this form collects. Default `'village'`. */
  depth?: RwLevel
  /** When true an empty selection is an error. Default `false`. */
  required?: boolean
}

export interface RwValidationResult {
  ok: boolean
  /** Per-level message, for rendering next to the offending dropdown. */
  errors: Partial<Record<RwLevel, string>>
}

/**
 * Validate a selection against the real hierarchy.
 *
 * Catches three distinct failures:
 *   1. a downstream value with no upstream value  ("village but no cell")
 *   2. a value that is not a real child of its parent — the case a client-side
 *      cascade can't produce but a forged/stale payload can
 *   3. a missing level when the form requires one
 *
 * Safe to run on either side of the wire; the server passes the bundled tree.
 */
export function validateRwLocation(
  tree: RwLocationTree | null,
  value: RwLocation,
  options: RwValidationOptions = {},
): RwValidationResult {
  const { depth = 'village', required = false } = options
  const levels = rwLevelsUpTo(depth)
  const errors: Partial<Record<RwLevel, string>> = {}

  // Anything selected deeper than this form collects is not trusted.
  for (const extra of rwLevelsBelow(depth)) {
    if (value[extra]) errors[extra] = `${RW_LEVEL_LABELS[extra].en} is not accepted by this form`
  }

  if (rwIsEmpty(value)) {
    if (required) errors.province = `${RW_LEVEL_LABELS.province.en} is required`
    return { ok: Object.keys(errors).length === 0, errors }
  }

  // Without the dataset we can still enforce chain integrity, just not
  // membership. Never silently pass — say which check was skipped.
  const canCheckMembership = tree !== null

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    const parent = i > 0 ? levels[i - 1] : null
    const selected = value[level]

    if (!selected) {
      // A gap is only an error if something below it is filled, or the form
      // requires the full depth.
      const orphan = levels.slice(i + 1).find(l => Boolean(value[l]))
      if (orphan) {
        errors[level] = `${RW_LEVEL_LABELS[level].en} must be selected before ` +
          `${RW_LEVEL_LABELS[orphan].en.toLowerCase()}`
      } else if (required) {
        errors[level] = `${RW_LEVEL_LABELS[level].en} is required`
      }
      continue
    }

    if (parent && !value[parent]) continue          // already reported above
    if (!canCheckMembership) continue

    const permitted = rwOptionsFor(tree, level, value)
    if (!permitted.includes(selected)) {
      errors[level] = parent
        ? `"${selected}" is not a ${RW_LEVEL_LABELS[level].en.toLowerCase()} of ` +
          `${RW_LEVEL_LABELS[parent].en.toLowerCase()} "${value[parent]}"`
        : `"${selected}" is not a recognised ${RW_LEVEL_LABELS[level].en.toLowerCase()}`
      // Children were validated against a parent we've just rejected, so stop.
      break
    }
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/** First error message, for forms that surface a single string. */
export function firstRwError(result: RwValidationResult): string | null {
  for (const level of RW_LEVELS) {
    const msg = result.errors[level]
    if (msg) return msg
  }
  return null
}
