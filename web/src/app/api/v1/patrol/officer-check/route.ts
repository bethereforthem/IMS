import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { createHash } from 'crypto'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/patrol/officer-check
// Officer-grade NID scan: returns FULL suspect profile (name, IMS ref, status,
// threat level, owning institution). Creates intel event + CRITICAL alert.
// Requires nid:scan — available to RNP, RDF, NISS roles.
// ---------------------------------------------------------------------------
export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const { nid, location_lat, location_lng, location_description } = body

    if (!nid || !/^\d{16}$/.test(String(nid))) {
      return apiError('NID must be exactly 16 digits', 400)
    }

    const nid_hash = createHash('sha256').update(String(nid)).digest('hex')

    const { data: suspect, error: queryError } = await supabase
      .from('suspects')
      .select('id, full_name, ims_reference, status, threat_level, owning_institution, nationality')
      .eq('nid_hash', nid_hash)
      .maybeSingle()

    if (queryError) {
      console.error('[patrol/officer-check POST] query error', queryError)
      return apiError('Failed to perform NID check', 500)
    }

    await logAudit({
      event_type: 'NID_CHECK',
      actor: user,
      target_type: 'suspect',
      target_id: suspect?.id,
      action: 'READ',
      after_state: { found: !!suspect, officer_grade: true },
    })

    if (!suspect) {
      return apiSuccess({ found: false })
    }

    const isActive = !['CLEARED'].includes(suspect.status)

    // Create intelligence event (triggers location_record via DB trigger if GPS present)
    const eventPayload = {
      source_tag: 'NID_SCAN',
      suspect_id: suspect.id,
      officer_id: user.user_id,
      institution: user.institution,
      location_lat: location_lat ?? null,
      location_lng: location_lng ?? null,
      location_description: location_description ?? null,
      criminal_record_found: isActive,
      alert_generated: false,
      confidence: 1.0,
      event_timestamp: new Date().toISOString(),
      notes: `Mobile NID scan by ${user.institution} officer`,
    }

    const { data: event, error: eventError } = await supabase
      .from('intelligence_events')
      .insert(eventPayload)
      .select()
      .single()

    if (eventError) {
      console.error('[patrol/officer-check POST] event insert error', eventError)
    }

    // Create CRITICAL alert for records with active status
    if (event && isActive) {
      const locNote = location_description ? ` Location: ${location_description}.` : ''
      const alertPayload = {
        intelligence_event_id: event.id,
        suspect_id: suspect.id,
        severity: 'CRITICAL',
        source_tag: 'NID_SCAN',
        title: `NID Match — ${suspect.full_name ?? 'Suspect Identified'}`,
        message: `${user.institution} officer confirmed NID match: ${suspect.full_name}. Status: ${suspect.status}. Threat Level: ${suspect.threat_level}/10.${locNote}`,
        target_institutions: null,
        is_read: false,
        requires_action: true,
        created_at: new Date().toISOString(),
      }
      const { error: alertError } = await supabase.from('alerts').insert(alertPayload)
      if (!alertError && event) {
        await supabase.from('intelligence_events').update({ alert_generated: true }).eq('id', event.id)
      }
    }

    return apiSuccess({
      found: true,
      suspect: {
        id: suspect.id,
        full_name: suspect.full_name,
        ims_reference: suspect.ims_reference,
        status: suspect.status,
        threat_level: suspect.threat_level,
        owning_institution: suspect.owning_institution,
        nationality: suspect.nationality,
      },
    })
  } catch (err) {
    console.error('[patrol/officer-check POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'nid:scan')
