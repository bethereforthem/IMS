import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError, getPagination } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { selectableColumns } from '@/lib/corrections-schema'

/**
 * GET /api/v1/corrections/events
 *
 * The custody activity feed.
 *
 * There is no `custody_events` table — the project models custody activity as
 * something read back off the records themselves, which is what the Events page
 * already did client-side. Two things were wrong with doing it in the browser:
 * the feed only ever covered whichever records fitted in one page of
 * `/corrections`, and it had no way to say *who* recorded an event, because the
 * actor lives in `audit_log`, not on the record.
 *
 * So the timeline is assembled here from both real sources:
 *   - date columns on `corrections_records` (intake, release, review, escape)
 *   - `audit_log` rows targeting a corrections record, which carry the officer
 *     who performed the action
 */

export type CustodyEventType =
  | 'INTAKE' | 'RELEASE' | 'REVIEW' | 'INCIDENT' | 'TRANSFER' | 'RECORD_UPDATE'

interface CustodyEvent {
  id: string
  event_type: CustodyEventType
  occurred_at: string
  description: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  correction_id: string | null
  inmate_name: string | null
  ims_reference: string | null
  facility: string | null
  cell_block: string | null
  custody_status: string | null
  officer_name: string | null
  officer_badge: string | null
  officer_institution: string | null
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  CORRECTIONS_CREATED: 'Custody record created',
  CORRECTIONS_UPDATED: 'Custody record updated',
  CORRECTIONS_RELEASED: 'Release recorded',
  CORRECTIONS_ESCAPE_REPORTED: 'Escape reported',
}

/** Audit actions that are already represented by a date column on the record. */
const AUDIT_EVENT_TYPE: Record<string, CustodyEventType> = {
  CORRECTIONS_CREATED: 'RECORD_UPDATE',
  CORRECTIONS_UPDATED: 'RECORD_UPDATE',
  CORRECTIONS_RELEASED: 'RELEASE',
  CORRECTIONS_ESCAPE_REPORTED: 'INCIDENT',
}

const VALID_TYPES = new Set<CustodyEventType>([
  'INTAKE', 'RELEASE', 'REVIEW', 'INCIDENT', 'TRANSFER', 'RECORD_UPDATE',
])

function iso(value: unknown): string | null {
  if (!value) return null
  const d = new Date(String(value))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const url = new URL(req.url)
    const typeFilter = url.searchParams.get('event_type')
    const facilityFilter = url.searchParams.get('facility')
    const search = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc'
    const { page, pageSize, offset } = getPagination(req)

    const supabase = createServerSupabaseClient()

    // The escape timestamps only exist once 20260807_corrections_custody_columns
    // has been applied. Asking for a column the table does not have makes
    // PostgREST reject the whole select, which would take the entire feed down
    // rather than just the escape events.
    const recordColumns = await selectableColumns([
      'id', 'facility_name', 'cell_block', 'custody_status', 'intake_date',
      'next_review', 'release_date', 'actual_release_at',
      'escape_reported_at', 'escape_recaptured_at',
    ])

    const [recordsRes, auditRes] = await Promise.all([
      supabase
        .from('corrections_records')
        .select(`${recordColumns.join(', ')}, suspects(full_name, ims_reference)`),
      // One query for every actor, joined in memory below — the alternative is
      // one lookup per event, which is exactly the N+1 this feed should avoid.
      supabase
        .from('audit_log')
        .select('id, event_type, action, target_id, actor_name, actor_badge, actor_institution, event_timestamp')
        .eq('target_type', 'corrections_record')
        .order('event_timestamp', { ascending: false })
        .limit(500),
    ])

    if (recordsRes.error) {
      console.error('[GET /api/v1/corrections/events] records', recordsRes.error)
      return apiError('Failed to load custody events', 500)
    }
    // The audit trail enriches the feed but must not be able to empty it.
    if (auditRes.error) {
      console.error('[GET /api/v1/corrections/events] audit', auditRes.error)
    }

    type RecordRow = {
      id: string
      facility_name: string | null
      cell_block: string | null
      custody_status: string | null
      intake_date: string | null
      next_review: string | null
      release_date: string | null
      actual_release_at: string | null
      // Present only once 20260807_corrections_custody_columns has been applied.
      escape_reported_at?: string | null
      escape_recaptured_at?: string | null
      suspects: { full_name: string | null; ims_reference: string | null } | null
    }

    const records = (recordsRes.data ?? []) as unknown as RecordRow[]
    const byId = new Map(records.map(r => [r.id, r]))
    const now = Date.now()
    const events: CustodyEvent[] = []

    const base = (r: RecordRow) => ({
      correction_id: r.id,
      inmate_name: r.suspects?.full_name ?? null,
      ims_reference: r.suspects?.ims_reference ?? null,
      facility: r.facility_name ?? null,
      cell_block: r.cell_block ?? null,
      custody_status: r.custody_status ?? null,
      officer_name: null,
      officer_badge: null,
      officer_institution: null,
    })

    for (const r of records) {
      const intake = iso(r.intake_date)
      if (intake) {
        events.push({
          ...base(r),
          id: `${r.id}:intake`,
          event_type: 'INTAKE',
          occurred_at: intake,
          status: 'COMPLETED',
          description: `Intake registered${r.cell_block ? ` · cell ${r.cell_block}` : ''}`,
        })
      }

      const actualRelease = iso(r.actual_release_at)
      const scheduledRelease = iso(r.release_date)
      if (actualRelease) {
        events.push({
          ...base(r),
          id: `${r.id}:release`,
          event_type: 'RELEASE',
          occurred_at: actualRelease,
          status: 'COMPLETED',
          description: 'Released from custody',
        })
      } else if (scheduledRelease) {
        events.push({
          ...base(r),
          id: `${r.id}:release-scheduled`,
          event_type: 'RELEASE',
          occurred_at: scheduledRelease,
          status: new Date(scheduledRelease).getTime() > now ? 'SCHEDULED' : 'OVERDUE',
          description: 'Scheduled release',
        })
      }

      const review = iso(r.next_review)
      if (review) {
        const future = new Date(review).getTime() > now
        const inCustody = r.custody_status === 'PRE_TRIAL' || r.custody_status === 'SENTENCED'
        events.push({
          ...base(r),
          id: `${r.id}:review`,
          event_type: 'REVIEW',
          occurred_at: review,
          status: future ? 'SCHEDULED' : inCustody ? 'OVERDUE' : 'COMPLETED',
          description: future ? 'Case review scheduled' : 'Case review date passed',
        })
      }

      const escape = iso(r.escape_reported_at)
      if (escape) {
        events.push({
          ...base(r),
          id: `${r.id}:escape`,
          event_type: 'INCIDENT',
          occurred_at: escape,
          status: 'COMPLETED',
          description: 'ESCAPE REPORTED — escape protocol triggered',
        })
      }
      const recapture = iso(r.escape_recaptured_at)
      if (recapture) {
        events.push({
          ...base(r),
          id: `${r.id}:recapture`,
          event_type: 'INCIDENT',
          occurred_at: recapture,
          status: 'COMPLETED',
          description: 'Recaptured and returned to custody',
        })
      }

      if (r.custody_status === 'TRANSFERRED') {
        const at = iso(r.actual_release_at) ?? iso(r.release_date)
        if (at) {
          events.push({
            ...base(r),
            id: `${r.id}:transfer`,
            event_type: 'TRANSFER',
            occurred_at: at,
            status: 'COMPLETED',
            description: `Transferred out of ${r.facility_name ?? 'facility'}`,
          })
        }
      }
    }

    for (const a of auditRes.data ?? []) {
      const r = a.target_id ? byId.get(a.target_id) : undefined
      const at = iso(a.event_timestamp)
      if (!at) continue
      events.push({
        id: `audit:${a.id}`,
        event_type: AUDIT_EVENT_TYPE[a.event_type] ?? 'RECORD_UPDATE',
        occurred_at: at,
        status: 'COMPLETED',
        description: AUDIT_EVENT_LABELS[a.event_type] ?? a.event_type.replace(/_/g, ' ').toLowerCase(),
        correction_id: a.target_id ?? null,
        inmate_name: r?.suspects?.full_name ?? null,
        ims_reference: r?.suspects?.ims_reference ?? null,
        facility: r?.facility_name ?? null,
        cell_block: r?.cell_block ?? null,
        custody_status: r?.custody_status ?? null,
        officer_name: a.actor_name ?? null,
        officer_badge: a.actor_badge ?? null,
        officer_institution: a.actor_institution ?? null,
      })
    }

    const facilities = [...new Set(events.map(e => e.facility).filter(Boolean) as string[])].sort()

    const filtered = events.filter(e => {
      if (typeFilter && VALID_TYPES.has(typeFilter as CustodyEventType) && e.event_type !== typeFilter) return false
      if (facilityFilter && e.facility !== facilityFilter) return false
      if (search) {
        const hay = `${e.inmate_name ?? ''} ${e.ims_reference ?? ''} ${e.officer_name ?? ''} ${e.description}`.toLowerCase()
        if (!hay.includes(search)) return false
      }
      return true
    })

    filtered.sort((a, b) => {
      const diff = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
      return order === 'asc' ? diff : -diff
    })

    const counts: Record<string, number> = {}
    for (const e of filtered) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1

    return apiSuccess({
      events: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      page_size: pageSize,
      counts,
      facilities,
    })
  } catch (err) {
    console.error('[GET /api/v1/corrections/events]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:read')
