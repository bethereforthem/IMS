import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import type { AuthPayload } from '@/lib/rbac'

// ---------------------------------------------------------------------------
// POST /api/v1/patrol/report
// Village Leader community insecurity report with the person's full civil
// profile. The reported person is matched against the national suspects
// registry (by NID hash, then exact name) — or registered if unknown — so the
// report is permanently linked to every other record (cases, warrants,
// custody, prior reports) held on that person by any institution.
// Creates an OFFICER_REPORT intelligence event + HIGH alert to RNP.
// ---------------------------------------------------------------------------

interface PersonProfile {
  full_name?: string
  party_status?: string
  father_name?: string
  mother_name?: string
  date_of_birth?: string
  sex?: string
  place_of_birth?: string
  residential_address?: string
  domicile_address?: string
  telephone?: string
  email?: string
  national_id_or_passport?: string
  nationality?: string
  marital_status?: string
  profession?: string
  properties?: string
  health_status?: string
  education_level?: string
  number_of_children?: string
  alternative_contact?: string
}

// suspects.nationality is CHAR(3) ISO alpha-3
function toAlpha3(nationality?: string): string | null {
  if (!nationality) return null
  const n = nationality.trim().toLowerCase()
  if (!n) return null
  if (['rwanda', 'rwandan', 'rwandese', 'rwa'].includes(n)) return 'RWA'
  const letters = n.replace(/[^a-z]/g, '').toUpperCase()
  return letters ? letters.slice(0, 3).padEnd(3, 'X') : null
}

function maskId(raw: string): string {
  const tail = raw.slice(-4)
  return `••••${tail}`
}

export const POST = withAuth(async (req: NextRequest, { user }: { user: AuthPayload; params?: Record<string, string> }) => {
  try {
    const supabase = createServerSupabaseClient()
    const body = await req.json()
    const {
      person_name,
      person,
      description,
      insecurity_type,
      location_lat,
      location_lng,
      location_description,
      file_urls,
    } = body as {
      person_name?: string
      person?: PersonProfile
      description?: string
      insecurity_type?: string
      location_lat?: number | null
      location_lng?: number | null
      location_description?: string
      file_urls?: string[]
    }

    if (!insecurity_type || !description) {
      return apiError('insecurity_type and description are required', 400)
    }

    const profile: PersonProfile = person ?? {}
    const fullName = (profile.full_name ?? person_name ?? '').trim()

    // --- Identity resolution against the national suspects registry --------
    // NID: only the SHA-256 of the digits is ever stored (system convention);
    // non-numeric identifiers are treated as passport numbers.
    const rawId = (profile.national_id_or_passport ?? '').trim()
    const idDigits = rawId.replace(/\D/g, '')
    const nidHash = idDigits.length >= 8
      ? createHash('sha256').update(idDigits).digest('hex')
      : null
    const passportNumber = !nidHash && rawId ? rawId.slice(0, 30) : null

    let suspectId: string | null = null
    let matchedExisting = false

    if (nidHash) {
      const { data } = await supabase
        .from('suspects')
        .select('id')
        .eq('national_id_hash', nidHash)
        .limit(1)
        .maybeSingle()
      if (data) { suspectId = data.id; matchedExisting = true }
    }

    if (!suspectId && fullName.length >= 3) {
      // ilike without wildcards = case-insensitive exact match
      const { data } = await supabase
        .from('suspects')
        .select('id, national_id_hash')
        .ilike('full_name', fullName)
        .limit(1)
        .maybeSingle()
      // Never merge into a record that carries a different verified NID
      if (data && (!nidHash || !data.national_id_hash || data.national_id_hash === nidHash)) {
        suspectId = data.id
        matchedExisting = true
      }
    }

    const sex = (profile.sex ?? '').trim().toUpperCase().charAt(0) || null
    const gender = sex === 'M' || sex === 'F' ? sex : null
    const dob = profile.date_of_birth || null

    if (suspectId) {
      // Enrich the existing registry record with any identity fields it lacks
      const { data: existing } = await supabase
        .from('suspects')
        .select('date_of_birth, gender, nationality, national_id_hash, passport_number')
        .eq('id', suspectId)
        .single()
      if (existing) {
        const fills: Record<string, unknown> = {}
        if (!existing.date_of_birth && dob) fills.date_of_birth = dob
        if (!existing.gender && gender) fills.gender = gender
        if (!existing.nationality && profile.nationality) fills.nationality = toAlpha3(profile.nationality)
        if (!existing.national_id_hash && nidHash) fills.national_id_hash = nidHash
        if (!existing.passport_number && passportNumber) fills.passport_number = passportNumber
        if (Object.keys(fills).length > 0) {
          fills.updated_at = new Date().toISOString()
          await supabase.from('suspects').update(fills).eq('id', suspectId)
        }
      }
    } else if (fullName.length >= 3) {
      // Unknown person → register them so every future record links up
      const nameParts = fullName.split(/\s+/)
      const { data: created, error: createError } = await supabase
        .from('suspects')
        .insert({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || null,
          status: 'ACTIVE',
          clearance_level: 'UNCLASSIFIED',
          date_of_birth: dob,
          gender,
          nationality: toAlpha3(profile.nationality),
          national_id_hash: nidHash,
          passport_number: passportNumber,
          owning_institution: 'RNP',
          threat_level: 1,
          notes: `Registered from a village leader community report by ${user.badge_number} (${user.full_name}) on ${new Date().toISOString().slice(0, 10)}. Suspected: ${String(insecurity_type).replace(/_/g, ' ')}.`,
          created_by: user.user_id,
        })
        .select('id')
        .single()
      if (createError) {
        console.error('[patrol/report POST] suspect create error', createError)
      } else if (created) {
        suspectId = created.id
        await logAudit({
          event_type: 'SUSPECT_CREATED',
          action: 'CREATE',
          actor: user,
          target_type: 'suspect',
          target_id: created.id,
          after_state: { full_name: fullName, source: 'COMMUNITY_REPORT' },
        })
      }
    }

    // Full profile travels in the event notes (plaintext NID is never stored)
    const storedProfile = {
      ...profile,
      full_name: fullName || 'Unknown',
      national_id_or_passport: rawId ? (nidHash ? maskId(rawId) : rawId) : '',
    }

    const notes = JSON.stringify({
      person_name: fullName || 'Unknown',
      insecurity_type,
      description,
      file_urls: Array.isArray(file_urls) ? file_urls : [],
      person_profile: storedProfile,
      matched_existing_record: matchedExisting,
    })

    const eventPayload = {
      source_tag: 'OFFICER_REPORT',
      suspect_id: suspectId,
      officer_id: user.user_id,
      institution: user.institution,
      location_lat: location_lat ?? null,
      location_lng: location_lng ?? null,
      location_description: location_description ?? null,
      criminal_record_found: matchedExisting,
      alert_generated: false,
      confidence: null,
      notes,
      event_timestamp: new Date().toISOString(),
    }

    const { data: event, error: eventError } = await supabase
      .from('intelligence_events')
      .insert(eventPayload)
      .select()
      .single()

    if (eventError || !event) {
      console.error('[patrol/report POST] event insert error', eventError)
      return apiError('Failed to submit report', 500)
    }

    const typeLabel = String(insecurity_type).replace(/_/g, ' ')
    const alertPayload = {
      intelligence_event_id: event.id,
      suspect_id: suspectId,
      severity: 'HIGH',
      source_tag: 'OFFICER_REPORT',
      title: matchedExisting
        ? 'VILLAGE INTEL — Report on KNOWN IMS Subject'
        : 'VILLAGE INTEL — Community Insecurity Report',
      message: `Village leader reports: ${typeLabel}. Person: ${fullName || 'Unknown'}.${
        matchedExisting ? ' Subject already has records in the IMS registry.' : ''
      }${location_description ? ` Location: ${location_description}.` : ''} ${String(description).slice(0, 120)}`,
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

    await logAudit({
      event_type: 'COMMUNITY_REPORT_SUBMITTED',
      actor: user,
      target_type: 'intelligence_event',
      target_id: event.id,
      action: 'CREATE',
      after_state: {
        insecurity_type,
        person_name: fullName || 'Unknown',
        suspect_id: suspectId,
        matched_existing_record: matchedExisting,
      },
    })

    return apiSuccess({ ...event, suspect_id: suspectId, matched_existing_record: matchedExisting }, 201)
  } catch (err) {
    console.error('[patrol/report POST]', err)
    return apiError('Internal server error', 500)
  }
}, 'intel:report')
