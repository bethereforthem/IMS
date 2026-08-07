import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * GET /api/v1/corrections/stats
 *
 * Custody aggregates computed over the whole `corrections_records` table.
 *
 * Every RCS page used to derive its stat cards, its facility filter and its
 * intake chart from whatever the first page of `/corrections` happened to
 * return — so "Total Inmates" was really "inmates on page one", the facility
 * buttons were a hardcoded pair that matched 5 of 36 records, and the
 * Corrections Rec. chart was rendered from a literal empty array. These are
 * the same numbers, taken from the database instead.
 */

const IN_CUSTODY_STATUSES = ['PRE_TRIAL', 'SENTENCED'] as const
const MONTHS_OF_HISTORY = 6
const RECENT_WINDOW_DAYS = 30
const REVIEW_WINDOW_DAYS = 14

interface Row {
  custody_status: string | null
  facility_name: string | null
  threat_level: number | null
  intake_date: string | null
  next_review: string | null
  release_date: string | null
  actual_release_at: string | null
  sentence_years: number | null
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const supabase = createServerSupabaseClient()

    // Only the columns the aggregates need — the wide row (with its free-text
    // offence description and notes) is never worth transferring for a count.
    const { data, error } = await supabase
      .from('corrections_records')
      .select(
        'custody_status, facility_name, threat_level, intake_date, next_review, ' +
        'release_date, actual_release_at, sentence_years'
      )

    if (error) {
      console.error('[GET /api/v1/corrections/stats]', error)
      return apiError('Failed to compute custody statistics', 500)
    }

    const rows = (data ?? []) as unknown as Row[]
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000

    const by_status: Record<string, number> = {}
    const by_threat: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    const facilities = new Map<string, { facility_name: string; total: number; in_custody: number; pre_trial: number; sentenced: number }>()

    // Last N calendar months, oldest first, pre-seeded so quiet months render
    // as a zero bar rather than disappearing from the axis.
    const months: { key: string; month: string; intake: number; releases: number }[] = []
    const monthIndex = new Map<string, number>()
    const cursor = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    for (let i = MONTHS_OF_HISTORY - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1))
      const key = monthKey(d)
      monthIndex.set(key, months.length)
      months.push({
        key,
        month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
        intake: 0,
        releases: 0,
      })
    }

    let in_custody = 0
    let high_threat = 0
    let reviews_due = 0
    let reviews_overdue = 0
    let admissions_recent = 0
    let releases_recent = 0
    let sentenceTotal = 0
    let sentenceCount = 0

    for (const r of rows) {
      const status = r.custody_status ?? 'UNKNOWN'
      by_status[status] = (by_status[status] ?? 0) + 1

      const inCustody = IN_CUSTODY_STATUSES.includes(status as typeof IN_CUSTODY_STATUSES[number])
      if (inCustody) in_custody++

      if (r.threat_level != null) {
        const t = String(r.threat_level)
        if (t in by_threat) by_threat[t]++
        if (r.threat_level >= 4) high_threat++
      }

      const facility = (r.facility_name ?? '').trim() || 'Unassigned'
      const f = facilities.get(facility) ?? { facility_name: facility, total: 0, in_custody: 0, pre_trial: 0, sentenced: 0 }
      f.total++
      if (inCustody) f.in_custody++
      if (status === 'PRE_TRIAL') f.pre_trial++
      if (status === 'SENTENCED') f.sentenced++
      facilities.set(facility, f)

      const intake = parseDate(r.intake_date)
      if (intake) {
        const idx = monthIndex.get(monthKey(intake))
        if (idx !== undefined) months[idx].intake++
        if (now - intake.getTime() <= RECENT_WINDOW_DAYS * dayMs) admissions_recent++
      }

      // A release only counts as having happened once `actual_release_at` is
      // set; `release_date` on its own is the scheduled date.
      const released = parseDate(r.actual_release_at)
      if (released) {
        const idx = monthIndex.get(monthKey(released))
        if (idx !== undefined) months[idx].releases++
        if (now - released.getTime() <= RECENT_WINDOW_DAYS * dayMs) releases_recent++
      }

      // A review that has come and gone without the record leaving custody is
      // overdue, and that is the number a superintendent needs to see.
      const review = parseDate(r.next_review)
      if (review && inCustody) {
        const diffDays = Math.ceil((review.getTime() - now) / dayMs)
        if (diffDays < 0) reviews_overdue++
        else if (diffDays <= REVIEW_WINDOW_DAYS) reviews_due++
      }

      if (status === 'SENTENCED' && r.sentence_years != null) {
        sentenceTotal += Number(r.sentence_years)
        sentenceCount++
      }
    }

    return apiSuccess({
      total: rows.length,
      in_custody,
      pre_trial: by_status.PRE_TRIAL ?? 0,
      sentenced: by_status.SENTENCED ?? 0,
      released: by_status.RELEASED ?? 0,
      transferred: by_status.TRANSFERRED ?? 0,
      escaped: by_status.ESCAPED ?? 0,
      deceased: by_status.DECEASED ?? 0,
      high_threat,
      reviews_due,
      reviews_overdue,
      admissions_recent,
      releases_recent,
      recent_window_days: RECENT_WINDOW_DAYS,
      review_window_days: REVIEW_WINDOW_DAYS,
      avg_sentence_years: sentenceCount > 0
        ? Number((sentenceTotal / sentenceCount).toFixed(1))
        : null,
      by_status,
      by_threat,
      by_facility: [...facilities.values()].sort((a, b) => b.total - a.total),
      monthly: months.map(({ month, intake, releases }) => ({ month, intake, releases })),
    })
  } catch (err) {
    console.error('[GET /api/v1/corrections/stats]', err)
    return apiError('Internal server error', 500)
  }
}, 'corrections:read')
