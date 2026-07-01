import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from './jwt'
import { PERMISSIONS } from './rbac'
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

/** Extract page / page_size from query params and compute offset */
export function getPagination(req: NextRequest): PaginationResult {
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('page_size') ?? '20', 10))
  )
  return { page, pageSize, offset: (page - 1) * pageSize }
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
      }

      // 5. RBAC permission check
      if (requiredPermission) {
        const rolePerms = PERMISSIONS[user.role]
        if (!rolePerms || !rolePerms.has(requiredPermission)) {
          return apiError('Insufficient permissions', 403)
        }
      }

      // 6. Delegate to the actual route handler
      const routeCtx = ctx as { params?: Record<string, string> } | undefined
      return await handler(req, { user, params: routeCtx?.params })
    } catch (err) {
      console.error('[withAuth]', err)
      return apiError('Internal server error', 500)
    }
  }
}
