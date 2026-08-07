import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from './jwt'
import { PERMISSIONS } from './rbac'
import { checkAccess } from './access-enforcement'
import type { AuthPayload } from './rbac'

export type ApiHandler = (
  req: NextRequest,
  ctx: { user: AuthPayload; params?: Record<string, string> }
) => Promise<NextResponse>

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function apiSuccess(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/** Wrap an error response with { error, timestamp } */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json(
    { error: message, timestamp: new Date().toISOString() },
    { status }
  )
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

export interface PaginationResult {
  page: number
  pageSize: number
  offset: number
}

export const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 20

/** Parse a positive integer query param, falling back when absent or malformed. */
function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  // Number('') is 0 and parseInt('12abc') is 12 — neither is a valid page size,
  // so require a clean integer rather than salvaging whatever prefix parses.
  if (!Number.isInteger(n)) return fallback
  return n
}

/**
 * Extract page / page_size from query params and compute offset.
 *
 * `limit` and `offset` are accepted as aliases. The whole client library sends
 * `limit`, which this helper used to ignore — so every caller silently received
 * the 20-row default. That truncated the Wanted Suspects list to 20 of 99 and
 * made every client-side stat card count a fraction of the table.
 */
export function getPagination(req: NextRequest): PaginationResult {
  const url = new URL(req.url)

  const page = Math.max(1, intParam(url, 'page', 1))

  const requested = url.searchParams.has('page_size')
    ? intParam(url, 'page_size', DEFAULT_PAGE_SIZE)
    : intParam(url, 'limit', DEFAULT_PAGE_SIZE)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested))

  // An explicit `offset` wins over the page-derived one so cursor-style callers
  // and page-style callers can share these routes.
  const offset = url.searchParams.has('offset')
    ? Math.max(0, intParam(url, 'offset', 0))
    : (page - 1) * pageSize

  return { page, pageSize, offset }
}

// ---------------------------------------------------------------------------
// Auth middleware HOF
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler with JWT verification and optional permission check.
 *
 * Usage:
 *   export const GET = withAuth(myHandler, 'suspects:read')
 *   export const POST = withAuth(myHandler)  // auth-only, no permission check
 */
export function withAuth(
  handler: ApiHandler,
  requiredPermission?: string
): (req: NextRequest, ctx?: unknown) => Promise<NextResponse> {
  return async (req: NextRequest, ctx?: unknown) => {
    try {
      // 1. Extract bearer token
      const authHeader = req.headers.get('authorization') ?? ''
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null

      if (!token) {
        return apiError('Authentication required', 401)
      }

      // 2. Verify JWT signature and expiry
      let payload: Record<string, unknown>
      try {
        payload = await verifyToken(token)
      } catch {
        return apiError('Invalid or expired token', 401)
      }

      // 3. Ensure this is a full access token (not the OTP step token)
      if (payload.type !== 'access') {
        return apiError('Invalid token type', 401)
      }

      // 4. Build the AuthPayload context object
      const user: AuthPayload = {
        user_id: payload.user_id as string,
        badge_number: payload.badge_number as string,
        full_name: payload.full_name as string,
        institution: payload.institution as string,
        role: payload.role as string,
        clearance: (payload.clearance ?? payload.clearance_level) as string,
        session_id: payload.session_id as string,
        exp: payload.exp as number,
        has_accepted_policies: payload.has_accepted_policies as boolean | undefined,
      }

      // 5. RBAC permission check
      if (requiredPermission) {
        const rolePerms = PERMISSIONS[user.role]
        if (!rolePerms || !rolePerms.has(requiredPermission)) {
          return apiError('Insufficient permissions', 403)
        }
      }

      // 6. Session revocation + System Controls lockdowns. A valid signature
      //    used to be enough on its own, which left every "terminate session"
      //    and every lock/disable switch in the admin portal with no effect
      //    until the token expired.
      const denial = await checkAccess(user, new URL(req.url).pathname)
      if (denial) {
        return apiError(denial.message, denial.status)
      }

      // 7. Delegate to the actual route handler
      // Next.js 15+ passes params as a Promise — await works for both forms
      const routeCtx = ctx as
        | { params?: Record<string, string> | Promise<Record<string, string>> }
        | undefined
      const params = routeCtx?.params ? await routeCtx.params : undefined
      return await handler(req, { user, params })
    } catch (err) {
      console.error('[withAuth]', err)
      return apiError('Internal server error', 500)
    }
  }
}
