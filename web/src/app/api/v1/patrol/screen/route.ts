import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/patrol/screen
// Village Leader community screening — checks a newcomer by full name or
// NID/passport number and returns ONLY clean/record-found + classification.
// No identity details are ever returned at this permission level.
// Name lookups are case-insensitive EXACT matches (no partial search) so the
// registry cannot be enumerated. A record match logs an NID_MANUAL sighting
// event; WANTED / INTERPOL_FLAGGED matches raise a CRITICAL alert to RNP.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const { query, location_lat, location_lng, location_description } = body as {
      query?: string
      location_lat?: number | null
      location_lng?: number | null
      location_description?: string
    }

    const q = (query ?? '').trim()
    if (q.length < 3) {
      return apiError('Provide a full name or an ID number (at least 3 characters)', 400)
    }

    const digits = q.replace(/\D/g, '')
    const isIdQuery = digits.length >= 8

    let matchQuery = supabase
      .from('suspects')
      .select('id, full_name, status, threat_level, owning_institution')
      .not('status', 'eq', 'DECEASED')
      .limit(5)

    if (isIdQuery) {
      const hash = createHash('sha256').update(digits).digest('hex')
      matchQuery = matchQuery.eq('national_id_hash', hash)
    } else {
      // ilike without wildcards = case-insensitive exact full-name match
      matchQuery = matchQuery.ilike('full_name', q)
    }

    const { data: matches, error: queryError } = await matchQuery

    if (queryError) {
      console.error('[patrol/screen POST] query error', queryError)
      return apiError('Failed to perform screening', 500)
    }

    const found = !!matches?.length

    if (!found) {
      await logAudit({
        event_type: 'COMMUNITY_SCREENING',
        actor: user,
        target_type: 'suspect',
        target_id: undefined,
        action: 'READ',
        after_state: { found: false, query_type: isIdQuery ? 'ID' : 'NAME' },
      })
      return apiSuccess({ found: false })
    }

    const alertStatuses = ['WANTED', 'INTERPOL_FLAGGED']

    for (const suspect of matches) {
      const eventPayload = {
        source_tag: 'NID_MANUAL',
        suspect_id: suspect.id,
        officer_id: user.user_id,
        institution: user.institution,
        location_lat: location_lat ?? null,
        location_lng: location_lng ?? null,
        location_description: location_description ?? null,
        criminal_record_found: true,
        alert_generated: false,
        confidence: isIdQuery ? 1.0 : 0.8,
        event_timestamp: new Date().toISOString(),
        notes: `Community screening via Village Leader portal (${isIdQuery ? 'ID' : 'name'} match)`,
      }

      const { data: event, error: eventError } = await supabase
        .from('intelligence_events')
        .insert(eventPayload)
        .select()
        .single()

      if (eventError) {
        console.error('[patrol/screen POST] event insert error', eventError)
        continue
      }

      if (alertStatuses.includes(suspect.status)) {
        const alertPayload = {
          intelligence_event_id: event.id,
          suspect_id: suspect.id,
          severity: 'CRITICAL',
          source_tag: 'NID_MANUAL',
          title: 'VILLAGE INTEL — Wanted Person Sighted',
          message: `A village leader screened a newcomer and matched a ${suspect.status.replace('_', ' ')} record.${
            location_description ? ` Location: ${location_description}.` : ''
          } Immediate police follow-up required.`,
          target_institutions: null,
          is_read: false,
          requires_action: true,
          created_at: new Date().toISOString(),
        }
        const { error: alertError } = await supabase.from('alerts').insert(alertPayload)
        if (!alertError) {
          await supabase
            .from('intelligence_events')
            .update({ alert_generated: true })
            .eq('id', event.id)
        }
      }
    }

    await logAudit({
      event_type: 'COMMUNITY_SCREENING',
      actor: user,
      target_type: 'suspect',
      target_id: matches[0].id,
      action: 'READ',
      after_state: {
        found: true,
        match_count: matches.length,
        query_type: isIdQuery ? 'ID' : 'NAME',
        alert_sent: matches.some(m => alertStatuses.includes(m.status)),
      },
    })

    // Classification only — never identity details
    return apiSuccess({
      found: true,
      matches: matches.map(m => ({
        status: m.status,
        threat_level: m.threat_level,
        owning_institution: m.owning_institution,
      })),
    })
  } catch (err) {
    console.error('[patrol/screen POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'nid:scan:result_only')
