#!/usr/bin/env node
/**
 * generate-openapi.js — build an OpenAPI 3.0.3 spec from the real route files.
 *
 * Walks src/app/api/v1/ **\/route.ts, and for every exported HTTP method reads:
 *   - the permission string passed to withAuth(handler, 'perm:name')
 *   - the banner comment above the export        → summary / description
 *   - searchParams.get('x') calls                → query parameters
 *   - [id] folder segments                       → path parameters
 *   - await req.json() destructuring / body.x    → request body fields
 *
 * Output: src/generated/openapi.json  (served by GET /api/v1/openapi)
 *
 *   node scripts/generate-openapi.js
 */
const fs = require('fs')
const path = require('path')

const WEB_ROOT = path.resolve(__dirname, '..')
const API_ROOT = path.join(WEB_ROOT, 'src', 'app', 'api', 'v1')
const OUT_FILE = path.join(WEB_ROOT, 'src', 'generated', 'openapi.json')

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

// ── Source scanning helpers ─────────────────────────────────────────────────
// A tiny string/comment-aware scanner. We cannot use a regex to find the end of
// a withAuth(...) call because handler bodies contain nested parens, and both
// strings and comments contain unbalanced ones.

// A `/` starts a regex literal (rather than division) only when the previous
// significant character cannot end an operand. Routes contain things like
// String(v).replace(/"/g, '""') — without this the `"` inside the regex would
// be read as a string opener and paren counting would drift.
const REGEX_ALLOWED_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '<', '>', '~', '\n'])

/**
 * If a literal or comment starts at `i`, return the index of its last character;
 * otherwise return -1. `prev` is the last significant character seen.
 */
function skipLiteral(src, i, prev) {
  const c = src[i]
  const next = src[i + 1]

  if (c === '/' && next === '/') {                  // line comment
    const end = src.indexOf('\n', i)
    return end === -1 ? src.length - 1 : end
  }
  if (c === '/' && next === '*') {                  // block comment
    const end = src.indexOf('*/', i + 2)
    return end === -1 ? src.length - 1 : end + 1
  }
  if (c === "'" || c === '"' || c === '`') {        // string / template literal
    let j = i + 1
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue }
      if (src[j] === c) return j
      j++
    }
    return src.length - 1
  }
  if (c === '/' && REGEX_ALLOWED_PREV.has(prev)) {  // regex literal
    let j = i + 1
    let inClass = false
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue }
      if (src[j] === '\n') return -1                // not a regex after all
      if (src[j] === '[') inClass = true
      else if (src[j] === ']') inClass = false
      else if (src[j] === '/' && !inClass) {
        while (j + 1 < src.length && /[a-z]/.test(src[j + 1])) j++
        return j
      }
      j++
    }
    return -1
  }
  return -1
}

/** Walk from an opening paren to its match, skipping strings, comments, regexes. */
function matchParen(src, openIdx) {
  let depth = 0
  let prev = ''
  for (let i = openIdx; i < src.length; i++) {
    const skipped = skipLiteral(src, i, prev)
    if (skipped !== -1) { i = skipped; prev = 'x'; continue }

    const c = src[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
    if (!/\s/.test(c)) prev = c
    else if (c === '\n') prev = '\n'
  }
  return -1
}

/** Split a call's argument text on top-level commas (same skipping rules). */
function topLevelSplit(src) {
  const parts = []
  let depth = 0
  let start = 0
  let prev = ''
  for (let i = 0; i < src.length; i++) {
    const skipped = skipLiteral(src, i, prev)
    if (skipped !== -1) { i = skipped; prev = 'x'; continue }

    const c = src[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) { parts.push(src.slice(start, i)); start = i + 1 }

    if (!/\s/.test(c)) prev = c
    else if (c === '\n') prev = '\n'
  }
  parts.push(src.slice(start))
  return parts
}

/** Collect the contiguous // comment block immediately above `index`. */
function bannerAbove(src, index) {
  const before = src.slice(0, index).split('\n')
  const lines = []
  for (let i = before.length - 2; i >= 0; i--) {
    const line = before[i].trim()
    if (line === '') { if (lines.length) break; continue }
    if (!line.startsWith('//')) break
    lines.unshift(line.replace(/^\/+\s?/, '').trim())
  }
  return lines
    .filter(l => l && !/^[-=─_]{3,}$/.test(l))
    .filter(l => !/^(GET|POST|PUT|PATCH|DELETE)\s+\/api\//i.test(l))
}

// ── Route discovery ─────────────────────────────────────────────────────────

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (entry.name === 'route.ts') acc.push(full)
  }
  return acc
}

/** src/app/api/v1/suspects/[id]/warrants/route.ts → /suspects/{id}/warrants */
function urlPathOf(file) {
  const rel = path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/')
  const segments = rel === '' ? [] : rel.split('/')
  return '/' + segments.map(s => (s.startsWith('[') ? `{${s.slice(1, -1).replace(/^\.\.\./, '')}}` : s)).join('/')
}

function tagOf(urlPath) {
  const first = urlPath.split('/').filter(Boolean)[0]
  return first ? first.replace(/[{}]/g, '') : 'root'
}

// ── Per-method extraction ───────────────────────────────────────────────────

function extractQueryParams(body) {
  const names = new Set()
  const re = /searchParams\.get\(\s*['"]([^'"]+)['"]\s*\)/g
  let m
  while ((m = re.exec(body))) names.add(m[1])
  if (/getPagination\s*\(/.test(body)) { names.add('page'); names.add('page_size') }
  return [...names]
}

function extractBodyFields(body) {
  if (!/await\s+req\.json\(\)/.test(body)) return null
  const names = new Set()

  // const { a, b: c = 1, d } = body   /  = await req.json()
  const destructure = /(?:const|let)\s*\{([^}]+)\}\s*=\s*(?:body|await\s+req\.json\(\))/g
  let m
  while ((m = destructure.exec(body))) {
    for (const raw of m[1].split(',')) {
      const name = raw.split(':')[0].split('=')[0].trim().replace(/^\.\.\./, '')
      if (/^[A-Za-z_]\w*$/.test(name)) names.add(name)
    }
  }

  // body.fieldName
  const dotted = /\bbody\.([A-Za-z_]\w*)/g
  while ((m = dotted.exec(body))) names.add(m[1])

  return [...names]
}

function parseFile(file) {
  const src = fs.readFileSync(file, 'utf8')
  const urlPath = urlPathOf(file)
  const operations = []

  // 1. withAuth-wrapped handlers (the overwhelming majority)
  const guarded = new RegExp(`export\\s+const\\s+(${METHODS.join('|')})\\s*=\\s*withAuth\\s*\\(`, 'g')
  const seen = new Set()
  let m
  while ((m = guarded.exec(src))) {
    const method = m[1]
    const openIdx = src.indexOf('(', m.index + m[0].length - 1)
    const closeIdx = matchParen(src, openIdx)
    if (closeIdx === -1) {
      console.warn(`  ! unbalanced withAuth( in ${path.relative(WEB_ROOT, file)} (${method})`)
      continue
    }
    const args = src.slice(openIdx + 1, closeIdx)
    const parts = topLevelSplit(args)
    const last = parts.length > 1 ? parts[parts.length - 1].trim() : ''
    const permMatch = last.match(/^(['"])(.+?)\1$/)

    seen.add(method)
    operations.push({
      method,
      permission: permMatch ? permMatch[2] : null,
      public: false,
      banner: bannerAbove(src, m.index),
      query: extractQueryParams(args),
      bodyFields: extractBodyFields(args),
    })
  }

  // 2. Unguarded exports (public endpoints such as /auth/login)
  const bare = new RegExp(
    `export\\s+(?:const\\s+(${METHODS.join('|')})\\s*=|async\\s+function\\s+(${METHODS.join('|')})\\b)`,
    'g'
  )
  while ((m = bare.exec(src))) {
    const method = m[1] || m[2]
    if (seen.has(method)) continue
    seen.add(method)
    const tail = src.slice(m.index)
    operations.push({
      method,
      permission: null,
      public: true,
      banner: bannerAbove(src, m.index),
      query: extractQueryParams(tail),
      bodyFields: extractBodyFields(tail),
    })
  }

  return { urlPath, operations }
}

// ── Spec assembly ───────────────────────────────────────────────────────────

const ERROR_RESPONSES = {
  400: { $ref: '#/components/responses/BadRequest' },
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  500: { $ref: '#/components/responses/ServerError' },
}

function build(routes) {
  const paths = {}
  const tags = new Set()
  let opCount = 0
  let publicCount = 0
  const permissions = new Set()

  for (const { urlPath, operations } of routes.sort((a, b) => a.urlPath.localeCompare(b.urlPath))) {
    if (!operations.length) continue
    const tag = tagOf(urlPath)
    tags.add(tag)
    paths[urlPath] = paths[urlPath] || {}

    const pathParams = [...urlPath.matchAll(/\{(\w+)\}/g)].map(x => ({
      name: x[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description: `${x[1]} of the target record`,
    }))

    for (const op of operations) {
      opCount++
      if (op.public) publicCount++
      if (op.permission) permissions.add(op.permission)

      const parameters = [
        ...pathParams,
        ...op.query.map(name => ({
          name,
          in: 'query',
          required: false,
          schema: name === 'page' || name === 'page_size' ? { type: 'integer' } : { type: 'string' },
        })),
      ]

      const description = [
        op.permission
          ? `**Required permission:** \`${op.permission}\``
          : op.public
          ? '**Public endpoint** — no authentication required.'
          : '**Authenticated** — any valid session, no specific permission.',
        ...op.banner,
      ].join('\n\n')

      const operation = {
        tags: [tag],
        summary: op.banner[0] || `${op.method} ${urlPath}`,
        description,
        operationId: `${op.method.toLowerCase()}${urlPath.replace(/[/{}-]/g, '_')}`,
        parameters: parameters.length ? parameters : undefined,
        security: op.public ? [] : [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Success',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          ...ERROR_RESPONSES,
        },
      }
      if (op.permission) operation['x-required-permission'] = op.permission

      if (op.bodyFields) {
        const properties = {}
        for (const f of op.bodyFields) properties[f] = { type: 'string' }
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: Object.keys(properties).length ? properties : undefined,
                additionalProperties: true,
              },
            },
          },
        }
      }

      paths[urlPath][op.method.toLowerCase()] = operation
    }
  }

  return {
    spec: {
      openapi: '3.0.3',
      info: {
        title: 'IMS — Rwanda Intelligence Management System API',
        version: '3.0.0',
        description: [
          '**Classification: RESTRICTED — Authorized Personnel Only.**',
          '',
          'Generated directly from the route handlers in `src/app/api/v1/` by',
          '`scripts/generate-openapi.js`. Do not edit by hand — re-run the script instead.',
          '',
          '## Auth flow',
          '1. `POST /auth/login` — badge number + password → `access_token` + `refresh_token`',
          '2. Send `Authorization: Bearer <access_token>` on every other request',
          '3. `POST /auth/refresh` rotates the pair before expiry',
          '',
          'Each operation lists the permission it requires. Permissions are granted per role',
          'in `src/lib/rbac.ts`; clearance level is checked separately on classified records.',
        ].join('\n'),
      },
      servers: [
        { url: '/api/v1', description: 'This host' },
        { url: 'http://localhost:3000/api/v1', description: 'Local development' },
      ],
      tags: [...tags].sort().map(name => ({ name })),
      paths,
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
        responses: {
          BadRequest: {
            description: 'Validation error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          Unauthorized: {
            description: 'Missing, invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          Forbidden: {
            description: 'Authenticated but lacking the required permission or clearance',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          ServerError: {
            description: 'Unexpected server error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    stats: { opCount, publicCount, permissions: [...permissions].sort(), pathCount: Object.keys(paths).length },
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(API_ROOT)) {
    console.error(`API root not found: ${API_ROOT}`)
    process.exit(1)
  }

  const files = walk(API_ROOT)
  console.log(`Scanning ${files.length} route files under src/app/api/v1 …`)

  const routes = files.map(parseFile)
  const empty = routes.filter(r => !r.operations.length)
  for (const r of empty) console.warn(`  ! no HTTP exports detected: ${r.urlPath}`)

  const { spec, stats } = build(routes)

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(spec, null, 2) + '\n', 'utf8')

  console.log(`\n  paths        ${stats.pathCount}`)
  console.log(`  operations   ${stats.opCount} (${stats.publicCount} public)`)
  console.log(`  permissions  ${stats.permissions.length} distinct`)
  console.log(`\nWrote ${path.relative(WEB_ROOT, OUT_FILE)}`)
}

main()
