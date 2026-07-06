import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { hasPermission, type AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// GET /api/v1/audit
// Full-featured audit log search for admins and institution commanders.
export const GET = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  const hasFullAudit      = hasPermission(user.role, 'audit:read')
  const hasOwnAudit       = hasPermission(user.role, 'audit:read:own_institution')
  const isAdmin           = hasPermission(user.role, 'admin:read')

  if (!hasFullAudit && !hasOwnAudit && !isAdmin) {
    return apiError('Insufficient permissions', 403)
  }

  const db  = createServerSupabaseClient()
  const url = new URL(req.url)

  // ── Filters ────────────────────────────────────────────────────────────────
  const actor_id     = url.searchParams.get('actor_id')
  const actor_name   = url.searchParams.get('actor_name')     // partial match
  const actor_badge  = url.searchParams.get('actor_badge')
  const action       = url.searchParams.get('action')         // CREATE|UPDATE|DELETE|READ
  const event_type   = url.searchParams.get('event_type')
  const target_type  = url.searchParams.get('target_type')
  const target_id    = url.searchParams.get('target_id')
  const institution  = url.searchParams.get('institution')
  const from         = url.searchParams.get('from')           // ISO datetime
  const to           = url.searchParams.get('to')
  const exportCsv    = url.searchParams.get('export') === 'csv'

  const { pageSize, offset } = getPagination(req)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(pageSize), 10)
  const limit = exportCsv ? 5000 : Math.min(200, Math.max(1, rawLimit))

  // ── Build query ────────────────────────────────────────────────────────────
  let query = db
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('event_timestamp', { ascending: false })
    .range(offset, offset + limit - 1)

  // Scope to own institution unless full audit access
  if (!hasFullAudit && !isAdmin && hasOwnAudit) {
    query = query.eq('actor_institution', user.institution)
  } else if (institution) {
    query = query.eq('actor_institution', institution)
  }

  if (actor_id)    query = query.eq('actor_id', actor_id)
  if (actor_badge) query = query.ilike('actor_badge', `%${actor_badge}%`)
  if (actor_name)  query = query.ilike('actor_name',  `%${actor_name}%`)
  if (action)      query = query.eq('action', action)
  if (event_type)  query = query.eq('event_type', event_type)
  if (target_type) query = query.eq('target_type', target_type)
  if (target_id)   query = query.eq('target_id', target_id)
  if (from)        query = query.gte('event_timestamp', from)
  if (to)          query = query.lte('event_timestamp', to)

  const { data: entries, count, error } = await query
  if (error) return apiError('Failed to fetch audit log', 500)

  // ── CSV export ──────────────────────────────────────────────────────────────
  if (exportCsv) {
    const rows = (entries ?? []) as Record<string, unknown>[]
    const cols = ['id','event_timestamp','action','event_type','actor_name','actor_badge',
                  'actor_role','actor_institution','target_type','target_id',
                  'ip_address','gps_lat','gps_lng','device_info','justification']
    const csvHeader = cols.join(',')
    const csvBody = rows.map(r =>
      cols.map(c => {
        const v = r[c]
        if (v === null || v === undefined) return ''
        const s = String(v).replace(/"/g, '""')
        return s.includes(',') || s.includes('\n') ? `"${s}"` : s
      }).join(',')
    ).join('\n')

    return new NextResponse(`${csvHeader}\n${csvBody}`, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit_log_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  // ── Summary stats for the admin dashboard ──────────────────────────────────
  const actionCounts = (entries ?? []).reduce<Record<string, number>>((acc, e) => {
    const a = (e as Record<string, unknown>).action as string
    acc[a] = (acc[a] ?? 0) + 1
    return acc
  }, {})

  return apiSuccess({
    entries: entries ?? [],
    total:   count ?? 0,
    action_counts: actionCounts,
  })
})
