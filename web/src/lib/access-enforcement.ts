/**
 * access-enforcement.ts — runtime enforcement of session revocation and the
 * System Controls switches.
 *
 * Both were previously write-only. A JWT was accepted purely on its signature
 * and expiry, so:
 *   - "Terminate session" on Live Activity, the session revocation done by a
 *     password reset, and Emergency Lockdown's "revoke all non-NISS sessions"
 *     changed a database column and nothing else — the holder kept working for
 *     the full 8-hour token lifetime.
 *   - Lock System / Lock Institution / Disable Service on the System Controls
 *     page wrote to `system_controls` and were read back only to render the
 *     System Health page. Nothing consulted them on a real request.
 *
 * Both checks run inside `withAuth`, so they cover every authenticated route.
 * Results are cached briefly to keep the cost to roughly one extra round-trip
 * per session per TTL rather than one per request.
 */
import { createServerSupabaseClient } from './supabase-server'
import type { AuthPayload } from './rbac'

// Short enough that a revocation takes effect while an operator is still
// watching the screen, long enough to absorb polling dashboards.
const SESSION_TTL_MS  = 15_000
// Controls change only when an administrator flips a switch, and every write
// path invalidates this cache explicitly — so it can be cached far longer than
// sessions. Each round-trip to the database costs ~1-3s here, and this check
// runs on every authenticated request.
const CONTROLS_TTL_MS = 60_000

// Roles that stay reachable while the system is locked, so an administrator
// can always undo a lockdown. Mirrors the emergency-lockdown route's own list.
export const LOCKDOWN_EXEMPT_ROLES_LIST = [
  'NISS_DIRECTOR', 'NISS_OFFICER', 'SIEM_ANALYST', 'SYSTEM_ADMIN',
] as const
const LOCKDOWN_EXEMPT_ROLES = new Set<string>(LOCKDOWN_EXEMPT_ROLES_LIST)

// Which service switch governs which API prefix. Anything unlisted is always
// permitted — a switch must never silently gate a route nobody mapped.
const SERVICE_ROUTE_PREFIXES: Array<{ service: string; prefixes: string[] }> = [
  { service: 'agent_tracking',   prefixes: ['/api/v1/agent-tracking'] },
  { service: 'commander_rescue', prefixes: ['/api/v1/commander-rescue'] },
  { service: 'sos',              prefixes: ['/api/v1/alerts/sos'] },
  { service: 'intelligence',     prefixes: ['/api/v1/intelligence'] },
  { service: 'camera_nodes',     prefixes: ['/api/v1/infrastructure/cameras'] },
  { service: 'interpol',         prefixes: ['/api/v1/interpol', '/api/v1/partners'] },
]

// Administering the controls must never be gated by the controls themselves,
// or a bad switch could not be undone.
const ALWAYS_ALLOWED_PREFIXES = [
  '/api/v1/admin',
  '/api/v1/auth',
  '/api/v1/policies',
]

interface SessionState { revoked: boolean; missing: boolean; checkedAt: number }
interface ControlsState {
  systemLocked: boolean
  lockedInstitutions: Set<string>
  disabledServices: Set<string>
  checkedAt: number
}

const sessionCache = new Map<string, SessionState>()
let controlsCache: ControlsState | null = null

/** Drop a session from the cache so a revocation applies on the next request. */
export function invalidateSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId)
}

/** Drop the controls cache so a toggle applies on the next request. */
export function invalidateControlsCache(): void {
  controlsCache = null
}

async function readSessionState(sessionId: string): Promise<SessionState> {
  const cached = sessionCache.get(sessionId)
  if (cached && Date.now() - cached.checkedAt < SESSION_TTL_MS) return cached

  const db = createServerSupabaseClient()
  const { data, error } = await db
    .from('user_sessions')
    .select('revoked, expires_at')
    .eq('id', sessionId)
    .maybeSingle()

  // On a lookup error keep serving the request: an unreachable database must
  // not lock every operator out of the system mid-incident.
  if (error) {
    console.error('[access-enforcement] session lookup failed:', error.message)
    return { revoked: false, missing: true, checkedAt: Date.now() }
  }

  const state: SessionState = {
    revoked: data ? data.revoked === true : false,
    // No row can mean a legitimately pruned history, so it is not treated as a
    // revocation — the JWT's own expiry still bounds it.
    missing: !data,
    checkedAt: Date.now(),
  }
  sessionCache.set(sessionId, state)

  // Keep the map from growing without bound on a long-lived server.
  if (sessionCache.size > 5000) {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [id, s] of sessionCache) if (s.checkedAt < cutoff) sessionCache.delete(id)
  }

  return state
}

async function readControlsState(): Promise<ControlsState> {
  if (controlsCache && Date.now() - controlsCache.checkedAt < CONTROLS_TTL_MS) {
    return controlsCache
  }

  const empty: ControlsState = {
    systemLocked: false,
    lockedInstitutions: new Set(),
    disabledServices: new Set(),
    checkedAt: Date.now(),
  }

  const db = createServerSupabaseClient()
  const { data, error } = await db.from('system_controls').select('key, value')

  if (error) {
    console.error('[access-enforcement] controls lookup failed:', error.message)
    return empty   // fail open rather than lock the estate out on a read error
  }

  const state: Record<string, unknown> = {}
  for (const row of data ?? []) {
    try { state[row.key] = JSON.parse(row.value) } catch { state[row.key] = row.value }
  }

  const parseList = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw as string[]
    if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
    return []
  }
  const parseMap = (raw: unknown): Record<string, string> => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, string>
    if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
    return {}
  }

  controlsCache = {
    systemLocked: state.system_locked === true || state.system_locked === 'true',
    lockedInstitutions: new Set(Object.keys(parseMap(state.institution_lockdowns))),
    disabledServices: new Set(parseList(state.disabled_services)),
    checkedAt: Date.now(),
  }
  return controlsCache
}

function serviceForPath(pathname: string): string | null {
  for (const { service, prefixes } of SERVICE_ROUTE_PREFIXES) {
    if (prefixes.some(p => pathname.startsWith(p))) return service
  }
  return null
}

export interface AccessDenial { message: string; status: number }

/**
 * Whether this account may sign in at all.
 *
 * `checkAccess` only guards requests that already carry a token, and the login
 * route does not go through `withAuth` — so a locked institution could still
 * authenticate and pick up a session. This is the gate for that.
 *
 * Roles in LOCKDOWN_EXEMPT_ROLES are always allowed through, otherwise an
 * institution-wide lock could shut the administrators out of their own console.
 */
export async function checkLoginAllowed(
  role: string,
  institution: string,
): Promise<AccessDenial | null> {
  if (LOCKDOWN_EXEMPT_ROLES.has(role)) return null

  const controls = await readControlsState()

  if (controls.systemLocked) {
    return {
      message: 'The system is currently locked by an administrator. Sign-in is unavailable.',
      status: 403,
    }
  }

  if (controls.lockedInstitutions.has(institution)) {
    return {
      message: `Sign-in for ${institution} is currently locked by an administrator.`,
      status: 403,
    }
  }

  return null
}

/**
 * Decide whether this request may proceed. Returns `null` to allow.
 */
export async function checkAccess(
  user: AuthPayload,
  pathname: string,
): Promise<AccessDenial | null> {
  const exempt = ALWAYS_ALLOWED_PREFIXES.some(p => pathname.startsWith(p))

  // Both lookups are usually cache hits, but on a miss they must not run one
  // after the other — this sits in front of every authenticated request and a
  // round-trip to the database is not cheap.
  const [session, controls] = await Promise.all([
    user.session_id ? readSessionState(user.session_id) : Promise.resolve(null),
    exempt ? Promise.resolve(null) : readControlsState(),
  ])

  // 1. Session revocation — the check that makes every "terminate session"
  //    control in the portal actually mean something.
  if (session?.revoked) {
    return { message: 'Session has been revoked. Please sign in again.', status: 401 }
  }

  if (!controls) return null

  // 2. Whole-system lock
  if (controls.systemLocked && !LOCKDOWN_EXEMPT_ROLES.has(user.role)) {
    return { message: 'System is locked by an administrator.', status: 503 }
  }

  // 3. Per-institution lock
  if (controls.lockedInstitutions.has(user.institution) && !LOCKDOWN_EXEMPT_ROLES.has(user.role)) {
    return { message: `Access for ${user.institution} is currently locked by an administrator.`, status: 503 }
  }

  // 4. Per-service switch
  const service = serviceForPath(pathname)
  if (service && controls.disabledServices.has(service)) {
    return { message: `The ${service.replace(/_/g, ' ')} service is currently disabled by an administrator.`, status: 503 }
  }

  return null
}
