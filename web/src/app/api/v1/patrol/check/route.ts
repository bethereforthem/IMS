import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { createHash } from 'crypto'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/patrol/check
// Village Leader NID check — returns ONLY found/clean + criminal classification.
// Full suspect identity is NEVER returned to village leaders.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const { nid, location_lat, location_lng, location_description } = body

    if (!nid || !/^\d{16}$/.test(String(nid))) {
      return apiError('NID must be exactly 16 digits', 400)
    }

    // SHA-256 hash matches PostgreSQL: encode(sha256('NID'::bytea), 'hex')
    const nid_hash = createHash('sha256').update(String(nid)).digest('hex')

    // Query suspect — deceased records are not actionable matches
    const { data: suspect, error: queryError } = await supabase
      .from('suspects')
      .select('id, status, threat_level, owning_institution')
      .eq('national_id_hash', nid_hash)
      .not('status', 'eq', 'DECEASED')
      .maybeSingle()

    if (queryError) {
      console.error('[patrol/check POST] query error', queryError)
      return apiError('Failed to perform NID check', 500)
    }

    const found = !!suspect

    if (!found) {
      await logAudit({
        event_type: 'NID_CHECK',
        actor: user,
        target_type: 'suspect',
        target_id: undefined,
        action: 'READ',
        after_state: { found: false },
      })
      return apiSuccess({ found: false })
    }

    // Create intelligence event (also triggers location_records via DB trigger if GPS provided)
    const eventPayload = {
      source_tag: 'NID_SCAN',
      suspect_id: suspect.id,
      officer_id: user.user_id,
      institution: user.institution,
      location_lat: location_lat ?? null,
      location_lng: location_lng ?? null,
      location_description: location_description ?? null,
      criminal_record_found: true,
      alert_generated: false,
      confidence: 1.0,
      event_timestamp: new Date().toISOString(),
      notes: 'NID check via Village Leader portal',
    }

    const { data: event, error: eventError } = await supabase
      .from('intelligence_events')
      .insert(eventPayload)
      .select()
      .single()

    if (eventError) {
      console.error('[patrol/check POST] event insert error', eventError)
    }

    // Create CRITICAL alert — title prefix "VILLAGE INTEL —" lets RNP identify source
    if (event) {
      const alertPayload = {
        intelligence_event_id: event.id,
        suspect_id: suspect.id,
        severity: 'CRITICAL',
        source_tag: 'NID_SCAN',
        title: 'VILLAGE INTEL — Criminal Record Found',
        message: `A village leader has detained an individual with a confirmed criminal record via NID scan.${
          location_description ? ` Location: ${location_description}.` : ''
        } Immediate police response required.`,
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

    await logAudit({
      event_type: 'NID_CHECK',
      actor: user,
      target_type: 'suspect',
      target_id: suspect.id,
      action: 'READ',
      after_state: { found: true, alert_sent: true },
    })

    // Return ONLY classification — no name, no full details
    return apiSuccess({
      found: true,
      classification: {
        status: suspect.status,
        threat_level: suspect.threat_level,
        owning_institution: suspect.owning_institution,
      },
    })
  } catch (err) {
    console.error('[patrol/check POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'nid:scan:result_only')
