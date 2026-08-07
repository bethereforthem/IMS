/**
 * corrections-schema.ts — what `corrections_records` actually has, right now.
 *
 * `database/corrections_personal_info_migration.sql` adds the personal-info,
 * court-conclusion and visitor-log columns, and it has to be run by hand in the
 * Supabase SQL editor. Until somebody does, every write that mentions one of
 * those columns is rejected by PostgREST with 42703/PGRST204 — which surfaced
 * as a blanket 500 on "Save Changes" in the inmate record modal, and as a
 * silent drop of the entire personal-info form on intake.
 *
 * So rather than guessing, ask the database which columns exist and write only
 * those, reporting the rest back to the caller instead of failing the request
 * or pretending it saved.
 */
import { createServerSupabaseClient } from './supabase-server'

/**
 * Columns from `database/supabase_migration.sql`, which is what is actually
 * deployed. `database/schema.sql` describes a wider table — the deployed one
 * has neither the escape timestamps nor the verifying-officer link — so it is
 * the migration file, not the reference schema, that defines the safe floor.
 */
export const CORE_CORRECTIONS_COLUMNS = [
  'id', 'suspect_id', 'case_id', 'facility_name', 'cell_block',
  'custody_status', 'intake_date',
  'sentence_start', 'sentence_end', 'sentence_years',
  'offense_description', 'court_name',
  'next_review', 'release_date', 'actual_release_at',
  'threat_level', 'notes', 'created_at', 'updated_at',
] as const

/**
 * Columns that exist only once a migration has been run — the escape/custody
 * columns from `schema.sql` plus everything the personal-info migration adds.
 * Each is probed, so a partially migrated database degrades one field at a
 * time instead of failing the whole write.
 */
export const EXTENDED_CORRECTIONS_COLUMNS = [
  // schema.sql / 20260807_corrections_custody_columns.sql
  'facility_code', 'intake_verified_by', 'judge_name',
  'escape_reported_at', 'escape_recaptured_at',
  // corrections_personal_info_migration.sql
  'father_name', 'mother_name', 'sex', 'place_of_birth',
  'residential_address', 'domicile_address', 'phone_number', 'email',
  'national_id', 'marital_status', 'profession', 'properties_owned',
  'health_status', 'education_level', 'children_count', 'alternative_contact',
  'party_status', 'passport_photo_url',
  'presiding_judge', 'verdict_date', 'sentence_type', 'court_conclusion',
  'visitor_log',
] as const

// A migration is applied once and then never un-applied, so this only has to be
// discovered once per server process.
let cached: Set<string> | null = null

/** Drop the cache so a freshly applied migration is picked up without a restart. */
export function invalidateCorrectionsSchemaCache(): void {
  cached = null
}

/**
 * The column names `corrections_records` currently exposes.
 *
 * PostgREST answers `select=<col>&limit=0` with 42703 when a column does not
 * exist, which makes each probe a cheap, row-free existence check.
 */
export async function getCorrectionsColumns(): Promise<Set<string>> {
  if (cached) return cached

  const db = createServerSupabaseClient()
  const present = new Set<string>(CORE_CORRECTIONS_COLUMNS)

  const probes = await Promise.all(
    EXTENDED_CORRECTIONS_COLUMNS.map(async col => {
      const { error } = await db.from('corrections_records').select(col).limit(0)
      return [col, !error] as const
    })
  )
  for (const [col, ok] of probes) if (ok) present.add(col)

  cached = present
  return present
}

/**
 * Split a write payload into the part the database can store and the part it
 * cannot, so a caller can persist what it is able to and tell the operator
 * exactly what was left behind.
 */
export async function splitByAvailableColumns(
  payload: Record<string, unknown>
): Promise<{ supported: Record<string, unknown>; unsupported: string[] }> {
  const columns = await getCorrectionsColumns()
  const supported: Record<string, unknown> = {}
  const unsupported: string[] = []

  for (const [key, value] of Object.entries(payload)) {
    if (columns.has(key)) supported[key] = value
    else unsupported.push(key)
  }

  return { supported, unsupported }
}

/**
 * Narrow a wanted select-list to the columns that exist, so a read never 400s
 * on a database that is behind on migrations.
 */
export async function selectableColumns(wanted: readonly string[]): Promise<string[]> {
  const columns = await getCorrectionsColumns()
  return wanted.filter(c => columns.has(c))
}

/** Human-readable hint attached to responses that had to drop columns. */
export const MIGRATION_HINT =
  'Some fields could not be saved because this database is missing columns added by ' +
  'database/corrections_personal_info_migration.sql and/or ' +
  'database/migrations/20260807_corrections_custody_columns.sql.'
