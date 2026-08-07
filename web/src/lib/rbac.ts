import type { Institution, UserRole, ClearanceLevel } from '@/types'

export interface AuthPayload {
  user_id: string
  badge_number: string
  full_name: string
  institution: string
  role: string
  clearance: string
  session_id: string
  exp: number
  has_accepted_policies?: boolean
}

// ---------------------------------------------------------------------------
// Permission sets per role (mirrors FastAPI rbac.py exactly)
// ---------------------------------------------------------------------------
export const PERMISSIONS: Record<string, Set<string>> = {
  NISS_DIRECTOR: new Set([
    'suspects:read', 'suspects:write', 'suspects:classify',
    'cases:read', 'cases:write',
    'location:read:all', 'location:read:top_secret',
    'nid:scan', 'interpol:query', 'interpol:manage',
    'corrections:read', 'corrections:write',
    'watchlist:read', 'watchlist:write',
    'siem:read', 'siem:manage',
    'revocation:any', 'emergency_lockdown', 'international:manage',
    'audit:read',
    'alerts:read', 'alerts:acknowledge',
    'camera_nodes:manage', 'source_attribution:read',
    'intel:events:write',
    'field_reports:read', 'field_reports:write', 'field_reports:assign',
    'agent_tracking:read', 'agent_tracking:manage',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  NISS_OFFICER: new Set([
    'suspects:read', 'suspects:write',
    'cases:read', 'cases:write',
    'location:read:all', 'location:read:top_secret',
    'nid:scan', 'interpol:query',
    'corrections:read',
    'watchlist:read',
    'siem:read',
    'revocation:any', 'international:manage',
    'audit:read',
    'alerts:read', 'alerts:acknowledge',
    'source_attribution:read',
    'intel:events:write',
    'field_reports:read', 'field_reports:write', 'field_reports:assign',
    'agent_tracking:read', 'agent_tracking:manage',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  RNP_COMMANDER: new Set([
    'suspects:read', 'suspects:write',
    'cases:read', 'cases:write',
    'location:read:limited',
    'nid:scan', 'interpol:query',
    'corrections:read',
    'watchlist:read', 'watchlist:write',
    'revocation:own',
    'alerts:read', 'alerts:acknowledge',
    'audit:read:own_institution',
    'source_attribution:read',
    'intel:events:write',
    'field_reports:read', 'field_reports:write',
    'agent_tracking:read',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  RNP_DETECTIVE: new Set([
    'suspects:read', 'suspects:write',
    'cases:read', 'cases:write',
    'location:read:limited',
    'nid:scan', 'interpol:query',
    'corrections:read',
    'watchlist:read', 'watchlist:write',
    'alerts:read', 'alerts:acknowledge',
    'source_attribution:read',
    'intel:events:write',
    'field_reports:read', 'field_reports:write',
    'agent_tracking:read',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  RNP_PATROL: new Set([
    'suspects:read',
    'nid:scan',
    'watchlist:read',
    'alerts:read',
    'field_reports:write',
    'agent_tracking:read',
  ]),

  RIB_INVESTIGATOR: new Set([
    'suspects:read', 'suspects:write',
    'cases:read', 'cases:write',
    'location:read:limited',
    'nid:scan', 'interpol:query',
    'corrections:read',
    'watchlist:read', 'watchlist:write',
    'revocation:own',
    'alerts:read', 'alerts:acknowledge',
    'source_attribution:read',
    'intel:events:write',
    'field_reports:read',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  RIB_ANALYST: new Set([
    'suspects:read',
    'cases:read',
    'nid:scan',
    'watchlist:read',
    'alerts:read', 'alerts:acknowledge',
    'source_attribution:read',
    'field_reports:read',
    // The RIB Analysis Unit menu offers an AI Intelligence page, but this was
    // the only institution role in the system without the permission behind it
    // — every peer analyst-grade role (NISS_OFFICER, RNP_DETECTIVE,
    // RIB_INVESTIGATOR) already has both. Without them the page 403'd on load
    // and the module was unreachable for the role it exists for.
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  RDF_COMMANDER: new Set([
    'suspects:read',
    'cases:read',
    'location:read:border',
    'nid:scan', 'interpol:query',
    'watchlist:read',
    'revocation:own',
    'alerts:read', 'alerts:acknowledge',
    'source_attribution:read',
    'field_reports:read', 'field_reports:write',
    'agent_tracking:read',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
    'border:verify', 'border:verify:logs',
  ]),

  RDF_BORDER_OFFICER: new Set([
    'suspects:read',
    'nid:scan',
    'watchlist:read',
    'alerts:read',
    'source_attribution:read',
    'field_reports:write',
    'agent_tracking:read',
    'border:verify', 'border:verify:logs',
  ]),

  RCS_SUPERINTENDENT: new Set([
    'suspects:read',
    'cases:read',
    'corrections:read', 'corrections:write',
    'nid:scan',
    'watchlist:read',
    'revocation:own',
    'alerts:read', 'alerts:acknowledge',
    'source_attribution:read',
    'commander_rescue:trigger',
    'ai_intelligence:read', 'ai_intelligence:analyze',
  ]),

  RCS_OFFICER: new Set([
    'suspects:read',
    'corrections:read', 'corrections:write',
    'nid:scan',
    'watchlist:read',
    // The RCS menu offers Alerts to every RCS role and the Custody Overview
    // renders an alert feed and a dashboard stat block, but neither endpoint
    // was reachable without this — a correction officer got a 403 on
    // /alerts and on /dashboard/stats, so their overview showed
    // "Could not load statistics" and their Alerts page was permanently empty.
    // Read-only: acknowledging an alert stays with the superintendent.
    'alerts:read',
  ]),

  VILLAGE_LEADER: new Set([
    'watchlist:read',
    'nid:scan:result_only',
    'intel:report',
  ]),

  SIEM_ANALYST: new Set([
    'siem:read', 'siem:manage',
    'audit:read',
    'revocation:own',
    'suspects:read',
    'alerts:read',
    'source_attribution:read',
  ]),

  SYSTEM_ADMIN: new Set([
    'camera_nodes:manage',
    'siem:read',
    'revocation:own',
    'audit:read',
    'alerts:read',
    'admin:read',
    'admin:write',
    'admin:users',
    'admin:controls',
    'admin:security',
    'admin:analytics',
  ]),
}

// ---------------------------------------------------------------------------
// Clearance ranking (higher = more access)
// ---------------------------------------------------------------------------
export const CLEARANCE_RANK: Record<string, number> = {
  UNCLASSIFIED: 0,
  CONFIDENTIAL: 1,
  SECRET: 2,
  TOP_SECRET: 3,
}

/**
 * The classifications a holder of `clearance` may read.
 *
 * `CLEARANCE_RANK` existed but nothing compared a record's classification
 * against the caller's clearance, so every classified row on `suspects`,
 * `cases` and `intelligence_events` was readable by anyone who could reach the
 * endpoint — an UNCLASSIFIED patrol officer included.
 *
 * Unknown or missing clearance falls back to UNCLASSIFIED: a token that does
 * not say what it is cleared for gets the least access, never the most.
 */
export function allowedClearances(clearance: string | undefined | null): string[] {
  const rank = CLEARANCE_RANK[clearance ?? ''] ?? CLEARANCE_RANK.UNCLASSIFIED
  return Object.keys(CLEARANCE_RANK).filter(level => CLEARANCE_RANK[level] <= rank)
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------
export function dashboardRouteForRole(role: string): string {
  if (role === 'SYSTEM_ADMIN') return '/admin'
  if (role.startsWith('NISS') || role === 'SIEM_ANALYST') return '/niss'
  if (role.startsWith('RNP')) return '/rnp'
  if (role.startsWith('RIB')) return '/rib'
  if (role.startsWith('RDF')) return '/rdf'
  if (role.startsWith('RCS')) return '/rcs'
  if (role === 'VILLAGE_LEADER') return '/patrol'
  return '/login'
}

export function institutionForRole(role: string): Institution {
  if (role.startsWith('NISS') || role === 'SIEM_ANALYST' || role === 'SYSTEM_ADMIN') return 'NISS'
  if (role.startsWith('RNP')) return 'RNP'
  if (role.startsWith('RIB')) return 'RIB'
  if (role.startsWith('RDF')) return 'RDF'
  if (role.startsWith('RCS')) return 'RCS'
  if (role === 'VILLAGE_LEADER') return 'VILLAGE_LEADER'
  return 'SYSTEM'
}

// Check if a role has a specific permission
export function hasPermission(role: string, permission: string): boolean {
  return PERMISSIONS[role]?.has(permission) ?? false
}
