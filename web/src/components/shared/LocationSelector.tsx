'use client'
/**
 * LocationSelector — the shared Rwanda address picker.
 *
 * Five cascading <select>s: Province > District > Sector > Cell > Village.
 * Each level is populated only from the children of the level above it, and
 * choosing a new value at any level clears everything beneath it.
 *
 * Use this anywhere a form collects a Rwandan location. Do not re-implement the
 * cascade locally and do not collect a location as free text: sector, cell and
 * village names repeat across the country (nine different cells are named
 * "Karambi"), so a name is only meaningful alongside its full parent chain.
 *
 *   <LocationSelector
 *     idPrefix="suspect-residence"
 *     value={location}
 *     onChange={next => setLocation(next)}
 *     depth="village"          // stop shallower with 'cell' | 'sector' | ...
 *     required
 *     classNames={{ label: LBL, select: SEL }}
 *   />
 *
 * The dataset is fetched as a lazy chunk on first mount and cached for the rest
 * of the session — see rw-locations-client.ts.
 */
import { useMemo } from 'react'
import { useRwLocationTree } from '@/lib/rw-locations-client'
import {
  RW_LEVEL_LABELS,
  rwLevelsUpTo,
  rwOptionsFor,
  rwSetLevel,
  validateRwLocation,
  type RwLevel,
  type RwLocation,
} from '@/lib/rw-locations'

export interface LocationSelectorClassNames {
  wrapper?: string
  grid?: string
  field?: string
  label?: string
  select?: string
  error?: string
  hint?: string
}

export interface LocationSelectorProps {
  /**
   * Unique per instance — used to build the id/htmlFor pair for every
   * dropdown, so labels stay correctly associated when a page renders more
   * than one selector (e.g. a suspect address and a crime scene).
   */
  idPrefix: string
  value: RwLocation
  /**
   * Receives the full updated chain, plus the same data flattened onto this
   * form's own field names (see `fieldNames`) for reducer-style state.
   */
  onChange: (next: RwLocation, patch: Record<string, string>) => void
  /** Deepest level this form needs. Default `'village'`. */
  depth?: RwLevel
  /** Marks every collected level required, and renders the asterisk. */
  required?: boolean
  disabled?: boolean
  /** Canonical level → this form's field name. Defaults to the level name. */
  fieldNames?: Partial<Record<RwLevel, string>>
  /** Show "Province / Intara" style labels. */
  bilingual?: boolean
  columns?: 1 | 2 | 3
  classNames?: LocationSelectorClassNames
  /** Inline validation messages. Default true. */
  showErrors?: boolean
  /** Server-side errors to merge in, keyed by level. */
  errors?: Partial<Record<RwLevel, string>>
  /** Rendered under the group, e.g. to explain what the address is for. */
  hint?: string
}

const DEFAULTS: Required<LocationSelectorClassNames> = {
  wrapper: 'space-y-3',
  grid: 'grid grid-cols-1 sm:grid-cols-3 gap-3',
  field: '',
  label: 'block text-[11px] font-medium text-slate-400 mb-1 uppercase tracking-wide',
  select: 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white ' +
          'focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20',
  error: 'mt-1 text-[11px] text-red-400',
  hint: 'text-[11px] text-slate-500',
}

// A disabled dropdown must not rely on colour alone to read as unavailable, so
// it also gets the native `disabled` semantics (announced by screen readers and
// skipped by tab order), a not-allowed cursor, reduced opacity, and a
// placeholder that states which field to fill in first.
const DISABLED_SELECT = 'opacity-50 cursor-not-allowed'

const GRID_COLS: Record<1 | 2 | 3, string> = {
  1: 'grid grid-cols-1 gap-3',
  2: 'grid grid-cols-1 sm:grid-cols-2 gap-3',
  3: 'grid grid-cols-1 sm:grid-cols-3 gap-3',
}

export default function LocationSelector({
  idPrefix,
  value,
  onChange,
  depth = 'village',
  required = false,
  disabled = false,
  fieldNames,
  bilingual = false,
  columns = 3,
  classNames,
  showErrors = true,
  errors: externalErrors,
  hint,
}: LocationSelectorProps) {
  const { tree, loading, error: loadError } = useRwLocationTree()
  const cn = { ...DEFAULTS, ...classNames }
  const levels = rwLevelsUpTo(depth)

  // Depend on the selected names rather than the identity of `value`, since
  // callers commonly build it inline (`rwLocationFrom(person)`) and would
  // otherwise defeat both memos on every render.
  const { province, district, sector, cell, village } = value

  // Options for every level, scoped by the current selection.
  const optionsByLevel = useMemo(() => {
    const out = {} as Record<RwLevel, string[]>
    for (const level of rwLevelsUpTo(depth)) out[level] = rwOptionsFor(tree, level, value)
    return out
  }, [tree, depth, province, district, sector, cell, village]) // eslint-disable-line react-hooks/exhaustive-deps

  // Local validation, merged with anything the server sent back.
  const validation = useMemo(
    () => validateRwLocation(tree, value, { depth, required }),
    [tree, depth, required, province, district, sector, cell, village], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const errors = { ...validation.errors, ...externalErrors }

  const emit = (level: RwLevel, next: string) => {
    const updated = rwSetLevel(value, level, next)
    // Patch covers every level this selector manages — including the ones
    // `rwSetLevel` just cleared, so the host form drops the stale descendants
    // rather than only the level that changed. Levels deeper than `depth` are
    // omitted: this selector never set them, so it must not blank them either.
    const patch: Record<string, string> = {}
    for (const l of rwLevelsUpTo(depth)) patch[fieldNames?.[l] ?? l] = updated[l]
    onChange(updated, patch)
  }

  if (loadError) {
    return (
      <div className={cn.wrapper}>
        <p className="text-[11px] text-red-400">
          Could not load the location list. Refresh the page to try again.
        </p>
      </div>
    )
  }

  return (
    <div className={cn.wrapper}>
      <div className={classNames?.grid ?? GRID_COLS[columns]}>
        {levels.map((level, i) => {
          const parent = i > 0 ? levels[i - 1] : null
          const parentValue = parent ? value[parent] : null
          const options = optionsByLevel[level]
          const label = RW_LEVEL_LABELS[level]

          // Locked until the level above it has a value.
          const blocked = Boolean(parent) && !parentValue
          const isDisabled = disabled || loading || blocked
          const id = `${idPrefix}-${level}`
          const errId = `${id}-error`
          const message = showErrors ? errors[level] : undefined

          // A prefilled or legacy value that is not a child of the selected
          // parent would otherwise render as a silently blank <select>. Keep it
          // visible and flagged so the user can see what needs correcting.
          const isOrphanValue = Boolean(value[level]) && !options.includes(value[level])

          const placeholder = loading
            ? 'Loading…'
            : blocked
              ? `Select ${RW_LEVEL_LABELS[parent!].en.toLowerCase()} first`
              : `Select ${label.en}`

          return (
            <div key={level} className={cn.field}>
              <label htmlFor={id} className={cn.label}>
                {bilingual ? `${label.en} / ${label.rw}` : label.en}
                {required && <span className="text-red-400" aria-hidden="true"> *</span>}
              </label>

              <select
                id={id}
                name={fieldNames?.[level] ?? level}
                value={value[level]}
                disabled={isDisabled}
                required={required}
                aria-required={required || undefined}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? errId : undefined}
                onChange={e => emit(level, e.target.value)}
                className={`${cn.select}${isDisabled ? ` ${DISABLED_SELECT}` : ''}`}
              >
                <option value="">{placeholder}</option>
                {isOrphanValue && (
                  <option value={value[level]}>{value[level]} — not in dataset</option>
                )}
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>

              {message && <p id={errId} className={cn.error} role="alert">{message}</p>}
            </div>
          )
        })}
      </div>
      {hint && <p className={cn.hint}>{hint}</p>}
    </div>
  )
}
