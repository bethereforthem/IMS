#!/usr/bin/env node
/**
 * generate-locations.js — build the Rwanda administrative-division datasets
 * from the authoritative CSV.
 *
 * Source:  data/Rwanda_Administrative_Divisions.csv   (repo root)
 *          columns: Province,District,Sector,Cell,Village
 *
 * Outputs:
 *   web/src/generated/rw-locations.json      nested tree, lazy-loaded by the
 *                                            LocationSelector component and
 *                                            used for server-side validation
 *   database/migrations/20260806_rwanda_locations.sql
 *                                            normalized tables + seed
 *
 * Names are NOT unique across the hierarchy (only 379/416 sectors, 1467/2149
 * cells and 6607/14837 villages are globally unique), so every structure this
 * script emits is keyed on the full parent path:
 *   - the JSON is a nested tree (path is implicit in the nesting)
 *   - the SQL tables key each row on (parent_id, name), never on name alone
 *
 *   node scripts/generate-locations.js
 */
const fs = require('fs')
const path = require('path')

const WEB_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(WEB_ROOT, '..')
const CSV_FILE = path.join(REPO_ROOT, 'data', 'Rwanda_Administrative_Divisions.csv')
const JSON_OUT = path.join(WEB_ROOT, 'src', 'generated', 'rw-locations.json')
const SQL_OUT = path.join(REPO_ROOT, 'database', 'migrations', '20260806_rwanda_locations.sql')

const LEVELS = ['Province', 'District', 'Sector', 'Cell', 'Village']

// Expected shape of the source data. If the CSV is ever replaced these act as a
// tripwire rather than silently emitting a half-empty dataset.
const EXPECTED = { rows: 14837, provinces: 5, districts: 30, sectors: 416, cells: 2149, villages: 14837 }

// ── CSV parsing ─────────────────────────────────────────────────────────────
// The current file is unquoted, but a future export might not be, so parse
// RFC-4180 style rather than assuming split(',') is safe.

function parseCsvLine(line) {
  const out = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ }   // escaped quote
        else quoted = false
      } else field += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(field); field = ''
    } else field += ch
  }
  out.push(field)
  return out
}

function readRows() {
  if (!fs.existsSync(CSV_FILE)) {
    throw new Error(`Source CSV not found at ${CSV_FILE}`)
  }
  const text = fs.readFileSync(CSV_FILE, 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)

  const header = parseCsvLine(lines[0]).map(h => h.trim())
  if (header.join(',') !== LEVELS.join(',')) {
    throw new Error(`Unexpected CSV header: got "${header.join(',')}", want "${LEVELS.join(',')}"`)
  }

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    const cols = parseCsvLine(raw).map(c => c.trim())
    if (cols.length !== 5) {
      throw new Error(`Line ${i + 1}: expected 5 columns, got ${cols.length} — ${JSON.stringify(raw)}`)
    }
    if (cols.some(c => c === '')) {
      throw new Error(`Line ${i + 1}: empty component in path — ${JSON.stringify(raw)}`)
    }
    rows.push(cols)
  }
  return rows
}

// ── Tree construction ───────────────────────────────────────────────────────
// tree[province][district][sector][cell] = [village, ...]

function buildTree(rows) {
  const tree = Object.create(null)
  let duplicates = 0

  for (const [province, district, sector, cell, village] of rows) {
    const d = (tree[province] ||= Object.create(null))
    const s = (d[district] ||= Object.create(null))
    const c = (s[sector] ||= Object.create(null))
    const v = (c[cell] ||= [])
    // A duplicate here means the same full path appears twice — dedupe so the
    // <select> never renders two identical options.
    if (v.includes(village)) { duplicates++; continue }
    v.push(village)
  }

  // Sort every level alphabetically so dropdown order is stable and scannable.
  const sorted = Object.create(null)
  for (const p of Object.keys(tree).sort(cmp)) {
    sorted[p] = Object.create(null)
    for (const d of Object.keys(tree[p]).sort(cmp)) {
      sorted[p][d] = Object.create(null)
      for (const s of Object.keys(tree[p][d]).sort(cmp)) {
        sorted[p][d][s] = Object.create(null)
        for (const c of Object.keys(tree[p][d][s]).sort(cmp)) {
          sorted[p][d][s][c] = tree[p][d][s][c].slice().sort(cmp)
        }
      }
    }
  }
  return { tree: sorted, duplicates }
}

// Locale-aware compare so "Cité" sorts sensibly next to plain ASCII names.
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const cmp = (a, b) => collator.compare(a, b)

function countTree(tree) {
  let provinces = 0, districts = 0, sectors = 0, cells = 0, villages = 0
  for (const p of Object.keys(tree)) {
    provinces++
    for (const d of Object.keys(tree[p])) {
      districts++
      for (const s of Object.keys(tree[p][d])) {
        sectors++
        for (const c of Object.keys(tree[p][d][s])) {
          cells++
          villages += tree[p][d][s][c].length
        }
      }
    }
  }
  return { provinces, districts, sectors, cells, villages }
}

// Ambiguity report — kept visible so anyone regenerating this data is reminded
// why every lookup here is keyed on the full parent path.
//   entities     how many real places exist at this level
//   distinct     how many distinct names those places share between them
//   unambiguous  how many of those names identify exactly one place
function uniquenessReport(rows) {
  return [2, 3, 4].map(idx => {
    const byName = new Map()
    const entities = new Set()
    for (const row of rows) {
      const fullPath = row.slice(0, idx + 1).join(' > ')
      entities.add(fullPath)
      const set = byName.get(row[idx]) || new Set()
      set.add(fullPath)
      byName.set(row[idx], set)
    }
    let unambiguous = 0
    for (const set of byName.values()) if (set.size === 1) unambiguous++
    return { level: LEVELS[idx], entities: entities.size, distinct: byName.size, unambiguous }
  })
}

// ── SQL emission ────────────────────────────────────────────────────────────

const sqlStr = s => `'${String(s).replace(/'/g, "''")}'`

function buildSql(tree) {
  const provinces = [], districts = [], sectors = [], cells = [], villages = []
  let pid = 0, did = 0, sid = 0, cid = 0, vid = 0

  for (const p of Object.keys(tree)) {
    const myPid = ++pid
    provinces.push([myPid, p])
    for (const d of Object.keys(tree[p])) {
      const myDid = ++did
      districts.push([myDid, myPid, d])
      for (const s of Object.keys(tree[p][d])) {
        const mySid = ++sid
        sectors.push([mySid, myDid, s])
        for (const c of Object.keys(tree[p][d][s])) {
          const myCid = ++cid
          cells.push([myCid, mySid, c])
          for (const v of tree[p][d][s][c]) {
            villages.push([++vid, myCid, v])
          }
        }
      }
    }
  }

  // Batched multi-row INSERTs — 14,837 individual statements would be slow to
  // apply and unpleasant to read.
  const insertBatches = (table, cols, rows, batchSize = 500) => {
    const out = []
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize)
      const values = chunk
        .map(r => `  (${r.map(f => (typeof f === 'number' ? f : sqlStr(f))).join(', ')})`)
        .join(',\n')
      out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values};`)
    }
    return out.join('\n\n')
  }

  return `-- ============================================================
-- Rwanda Administrative Divisions — normalized reference tables
-- GENERATED FILE — do not edit by hand.
--   source:    data/Rwanda_Administrative_Divisions.csv
--   generator: web/scripts/generate-locations.js
--
-- Province > District > Sector > Cell > Village
--   ${provinces.length} provinces, ${districts.length} districts, ${sectors.length} sectors,
--   ${cells.length} cells, ${villages.length} villages
--
-- NOTE ON UNIQUENESS: sector / cell / village names are NOT globally unique.
-- Every table below is therefore UNIQUE on (parent_id, name) and never on
-- name alone. Always resolve a location through its full parent chain.
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS rw_villages  CASCADE;
DROP TABLE IF EXISTS rw_cells     CASCADE;
DROP TABLE IF EXISTS rw_sectors   CASCADE;
DROP TABLE IF EXISTS rw_districts CASCADE;
DROP TABLE IF EXISTS rw_provinces CASCADE;

CREATE TABLE rw_provinces (
  id    SMALLINT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE rw_districts (
  id           SMALLINT PRIMARY KEY,
  province_id  SMALLINT NOT NULL REFERENCES rw_provinces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  UNIQUE (province_id, name)
);

CREATE TABLE rw_sectors (
  id           INTEGER PRIMARY KEY,
  district_id  SMALLINT NOT NULL REFERENCES rw_districts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  UNIQUE (district_id, name)
);

CREATE TABLE rw_cells (
  id         INTEGER PRIMARY KEY,
  sector_id  INTEGER NOT NULL REFERENCES rw_sectors(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  UNIQUE (sector_id, name)
);

CREATE TABLE rw_villages (
  id       INTEGER PRIMARY KEY,
  cell_id  INTEGER NOT NULL REFERENCES rw_cells(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  UNIQUE (cell_id, name)
);

CREATE INDEX idx_rw_districts_province ON rw_districts (province_id);
CREATE INDEX idx_rw_sectors_district   ON rw_sectors   (district_id);
CREATE INDEX idx_rw_cells_sector       ON rw_cells     (sector_id);
CREATE INDEX idx_rw_villages_cell      ON rw_villages  (cell_id);

-- Name lookups are only meaningful alongside the parent key, but a plain name
-- index still helps the "which parents have this name?" disambiguation query.
CREATE INDEX idx_rw_villages_name ON rw_villages (name);
CREATE INDEX idx_rw_cells_name    ON rw_cells    (name);
CREATE INDEX idx_rw_sectors_name  ON rw_sectors  (name);

-- ── Seed data ───────────────────────────────────────────────────────────────

${insertBatches('rw_provinces', ['id', 'name'], provinces)}

${insertBatches('rw_districts', ['id', 'province_id', 'name'], districts)}

${insertBatches('rw_sectors', ['id', 'district_id', 'name'], sectors)}

${insertBatches('rw_cells', ['id', 'sector_id', 'name'], cells)}

${insertBatches('rw_villages', ['id', 'cell_id', 'name'], villages)}

-- ── Convenience view: fully-resolved village paths ──────────────────────────
-- Use this to look a location up by its complete chain, e.g. when validating a
-- submitted form payload directly in SQL.
CREATE OR REPLACE VIEW rw_locations_full AS
SELECT
  v.id       AS village_id,
  v.name     AS village,
  c.id       AS cell_id,
  c.name     AS cell,
  s.id       AS sector_id,
  s.name     AS sector,
  d.id       AS district_id,
  d.name     AS district,
  p.id       AS province_id,
  p.name     AS province
FROM rw_villages  v
JOIN rw_cells     c ON c.id = v.cell_id
JOIN rw_sectors   s ON s.id = c.sector_id
JOIN rw_districts d ON d.id = s.district_id
JOIN rw_provinces p ON p.id = d.province_id;

COMMIT;
`
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const rows = readRows()
  const { tree, duplicates } = buildTree(rows)
  const counts = countTree(tree)

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true })
  fs.mkdirSync(path.dirname(SQL_OUT), { recursive: true })

  fs.writeFileSync(JSON_OUT, JSON.stringify(tree), 'utf8')
  fs.writeFileSync(SQL_OUT, buildSql(tree), 'utf8')

  const kb = f => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`
  console.log(`✓ parsed ${rows.length} rows from ${path.relative(REPO_ROOT, CSV_FILE)}`)
  if (duplicates) console.log(`  (${duplicates} duplicate full paths collapsed)`)
  console.log(`  provinces=${counts.provinces} districts=${counts.districts} ` +
              `sectors=${counts.sectors} cells=${counts.cells} villages=${counts.villages}`)
  for (const r of uniquenessReport(rows)) {
    console.log(`  ${r.level.padEnd(8)} ${String(r.entities).padStart(5)} places / ` +
                `${String(r.distinct).padStart(5)} distinct names / ` +
                `${String(r.unambiguous).padStart(5)} names identify exactly one place`)
  }
  console.log(`✓ ${path.relative(REPO_ROOT, JSON_OUT)}  (${kb(JSON_OUT)})`)
  console.log(`✓ ${path.relative(REPO_ROOT, SQL_OUT)}  (${kb(SQL_OUT)})`)

  const mismatches = Object.entries(EXPECTED)
    .filter(([k, v]) => (k === 'rows' ? rows.length : counts[k]) !== v)
    .map(([k, v]) => `${k}: expected ${v}, got ${k === 'rows' ? rows.length : counts[k]}`)
  if (mismatches.length) {
    console.error('\n✗ dataset does not match expected shape:\n  ' + mismatches.join('\n  '))
    process.exit(1)
  }
}

main()
