/**
 * Offline audit: parses database/*.sql for real table/column/enum definitions,
 * then scans web/src for supabase queries and reports columns that do not exist,
 * invalid enum literals, and RBAC permissions no role can satisfy.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const DB_DIR = path.join(ROOT, 'database')
const SRC = path.join(ROOT, 'web', 'src')

const tables = {}
const enums = {}

function addCol(t, c) {
  tables[t] = tables[t] ?? new Set()
  tables[t].add(c)
}

for (const f of fs.readdirSync(DB_DIR).filter(x => x.endsWith('.sql'))) {
  const sql = fs.readFileSync(path.join(DB_DIR, f), 'utf8')
  let m
  const enumRe = /CREATE\s+TYPE\s+(?:public\.)?(\w+)\s+AS\s+ENUM\s*\(([\s\S]*?)\)\s*;/gi
  while ((m = enumRe.exec(sql))) {
    const n = m[1].toLowerCase()
    enums[n] = enums[n] ?? new Set()
    for (const v of m[2].matchAll(/'([^']+)'/g)) enums[n].add(v[1])
  }
  const addValRe = /ALTER\s+TYPE\s+(?:public\.)?(\w+)\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi
  while ((m = addValRe.exec(sql))) {
    const n = m[1].toLowerCase()
    enums[n] = enums[n] ?? new Set()
    enums[n].add(m[2])
  }
  const tblRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi
  while ((m = tblRe.exec(sql))) {
    const name = m[1]
    tables[name] = tables[name] ?? new Set()
    for (const line of m[2].split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('--')) continue
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\b/i.test(t)) continue
      const cm = t.match(/^"?(\w+)"?\s+/)
      if (cm) tables[name].add(cm[1])
    }
  }
  // ALTER TABLE x ADD COLUMN a ..., ADD COLUMN b ...;  (all clauses)
  const altStmtRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?(\w+)([\s\S]*?);/gi
  while ((m = altStmtRe.exec(sql))) {
    const t = m[1]
    for (const c of m[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) addCol(t, c[1])
    for (const c of m[2].matchAll(/RENAME\s+COLUMN\s+"?\w+"?\s+TO\s+"?(\w+)"?/gi)) addCol(t, c[1])
  }
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p)
  }
  return acc
}
const files = walk(SRC)
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/')
const findings = []
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length

const ENUM_OF = {
  'suspects.status': 'suspect_status',
  'suspects.clearance_level': 'clearance_level',
  'suspects.owning_institution': 'institution_type',
  'cases.status': 'case_status',
  'cases.lead_institution': 'institution_type',
  'corrections_records.custody_status': 'custody_status',
  'intelligence_events.source_tag': 'source_tag',
  'intelligence_events.institution': 'institution_type',
  'alerts.severity': 'alert_severity',
  'alerts.source_tag': 'source_tag',
  'users.institution': 'institution_type',
  'users.role': 'user_role',
}

// extract top-level keys of the object literal starting at `open` (index of '{')
function topLevelKeys(src, open) {
  let depth = 0, i = open, keys = [], buf = ''
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{' || ch === '[' || ch === '(') { depth++; if (depth === 1) { buf = ''; continue } }
    else if (ch === '}' || ch === ']' || ch === ')') { depth--; if (depth === 0) break }
    if (depth === 1) buf += ch
  }
  // strip strings so ':' inside strings doesn't count
  const cleaned = buf.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")
  for (const k of cleaned.matchAll(/(?:^|,)\s*(\w+)\s*:/g)) keys.push(k[1])
  return { keys, end: i }
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const marks = [...src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)]

  marks.forEach((mk, idx) => {
    const table = mk[1]
    const start = mk.index
    const end = idx + 1 < marks.length ? marks[idx + 1].index : src.length
    const seg = src.slice(start, Math.min(end, start + 2500))
    const baseLine = lineOf(src, start)
    if (!tables[table]) {
      findings.push({ kind: 'TABLE', file: rel(file), line: baseLine, msg: `unknown table '${table}'` })
      return
    }
    const cols = tables[table]
    const at = i => baseLine + seg.slice(0, i).split('\n').length - 1

    const colRe = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|order|contains)\(\s*['"]([\w.]+)['"]/g
    let c
    while ((c = colRe.exec(seg))) {
      if (c[2].includes('.')) continue          // foreign-table filter, legal in PostgREST
      const col = c[2]
      if (!cols.has(col)) {
        findings.push({ kind: 'COLUMN', file: rel(file), line: at(c.index), msg: `${table}.${col} missing (.${c[1]}())` })
      } else {
        const en = ENUM_OF[`${table}.${col}`]
        if (en && enums[en]) {
          const lit = seg.slice(c.index).match(/^\.\w+\(\s*['"][\w.]+['"]\s*,\s*['"]([A-Z_]+)['"]/)
          if (lit && !enums[en].has(lit[1])) {
            findings.push({ kind: 'ENUM', file: rel(file), line: at(c.index), msg: `${table}.${col} = '${lit[1]}' invalid; valid: ${[...enums[en]].join('|')}` })
          }
        }
      }
    }

    const selRe = /\.select\(\s*[`'"]([\s\S]*?)[`'"]\s*[,)]/g
    let s
    while ((s = selRe.exec(seg))) {
      const body = s[1]
      if (body.trim() === '*') continue
      let depth = 0, flat = ''
      for (const ch of body) {
        if (ch === '(') { depth++; continue }
        if (ch === ')') { depth--; continue }
        if (depth === 0) flat += ch
      }
      for (let piece of flat.split(',')) {
        piece = piece.trim()
        if (!piece || piece === '*') continue
        const col = piece.split(':').pop().trim()
        if (!/^\w+$/.test(col)) continue
        if (tables[col]) continue
        if (!cols.has(col)) {
          findings.push({ kind: 'COLUMN', file: rel(file), line: at(s.index), msg: `${table}.${col} missing (.select())` })
        }
      }
    }

    // brace-matched insert/update payloads only
    const insRe = /\.(insert|update|upsert)\(\s*(\{)/g
    let i2
    while ((i2 = insRe.exec(seg))) {
      const openIdx = i2.index + i2[0].lastIndexOf('{')
      const { keys } = topLevelKeys(seg, openIdx)
      for (const k of keys) {
        if (!cols.has(k)) {
          findings.push({ kind: 'COLUMN', file: rel(file), line: at(i2.index), msg: `${table}.${k} missing (.${i2[1]}())` })
        }
      }
    }
  })
}

const rbacSrc = fs.readFileSync(path.join(SRC, 'lib', 'rbac.ts'), 'utf8')
const permBlock = rbacSrc.slice(rbacSrc.indexOf('PERMISSIONS'))
const granted = new Set()
for (const p of permBlock.matchAll(/'([a-z_]+:[a-z_:]+)'/g)) granted.add(p[1])
const required = new Map()
for (const file of files.filter(f => f.includes(path.join('app', 'api')))) {
  const s2 = fs.readFileSync(file, 'utf8')
  for (const m of s2.matchAll(/\}\s*,\s*'([a-z_]+:[a-z_:]+)'\s*\)/g)) {
    if (!required.has(m[1])) required.set(m[1], [])
    required.get(m[1]).push(rel(file))
  }
}
for (const [perm, where] of required) {
  if (!granted.has(perm)) {
    findings.push({ kind: 'PERM', file: where.join(', '), line: 0, msg: `'${perm}' required but granted to NO role` })
  }
}

console.log(`schema: ${Object.keys(tables).length} tables, ${Object.keys(enums).length} enums | scanned ${files.length} files\n`)
const order = { TABLE: 0, COLUMN: 1, ENUM: 2, PERM: 3 }
findings.sort((a, b) => (order[a.kind] - order[b.kind]) || a.file.localeCompare(b.file) || a.line - b.line)
const seen = new Set()
let n = 0
for (const f of findings) {
  const key = `${f.kind}|${f.file}|${f.line}|${f.msg}`
  if (seen.has(key)) continue
  seen.add(key)
  console.log(`[${f.kind}] ${f.file}:${f.line} — ${f.msg}`)
  n++
}
console.log(`\n${n} findings`)
