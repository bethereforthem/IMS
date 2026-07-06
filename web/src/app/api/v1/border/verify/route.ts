import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api-middleware'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logAudit } from '@/lib/audit'
import { createHash } from 'crypto'
import type { AuthPayload } from '@/lib/rbac'

export const runtime = 'nodejs'

// POST /api/v1/border/verify
// Border officer submits extracted document data; server checks IMS databases
// and returns a clean/flagged result with full audit trail.
export const POST = withAuth(
  async (req: NextRequest, { user }: { user: AuthPayload }) => {
    const db = createServerSupabaseClient()

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

    const {
      doc_type, doc_number, full_name, first_name, last_name,
      date_of_birth, nationality, gender, expiry_date,
      issuing_country, issuing_authority,
      mrz_line1, mrz_line2, raw_ocr_text,
      scan_method, ocr_confidence, scan_failed, scan_failure_reason,
      border_post, location_lat, location_lng,
      device_type, device_info,
      notes,
    } = body as Record<string, string | number | boolean | null>

    if (!doc_type) return apiError('doc_type is required', 400)
    if (!scan_failed && !doc_number && !full_name) {
      return apiError('doc_number or full_name required unless scan_failed', 400)
    }

    // ── IMS lookups ───────────────────────────────────────────────────────────

    let suspect_match    = false
    let warrant_match    = false
    let watchlist_match  = false
    let interpol_match   = false
    let ims_suspect_id: string | null = null

    const docNum = typeof doc_number === 'string' ? doc_number.trim() : null

    if (docNum && !scan_failed) {
      // Hash the document number for suspects table lookup (passport_number stored plain)
      const nidHash = createHash('sha256').update(docNum).digest('hex')

      // Check suspects by passport number or NID hash
      const { data: suspect } = await db
        .from('suspects')
        .select('id, status, first_name, last_name, passport_number')
        .or(`national_id_hash.eq.${nidHash},passport_number.eq.${docNum}`)
        .not('status', 'eq', 'CLEARED')
        .maybeSingle()

      if (suspect) {
        suspect_match   = true
        ims_suspect_id  = suspect.id

        // Check active warrants
        const { data: warrant } = await db
          .from('warrants')
          .select('id')
          .eq('suspect_id', suspect.id)
          .eq('active', true)
          .maybeSingle()
        warrant_match = !!warrant

        // Check watchlists
        const { data: wl } = await db
          .from('watchlist_entries')
          .select('id')
          .eq('suspect_id', suspect.id)
          .maybeSingle()
        watchlist_match = !!wl

        // Check Interpol notices
        const { data: interpol } = await db
          .from('interpol_notices')
          .select('id')
          .eq('suspect_id', suspect.id)
          .maybeSingle()
        interpol_match = !!interpol
      }
    }

    // ── Outcome classification ────────────────────────────────────────────────

    let verification_status = 'CLEAN'
    let risk_level = 'LOW'
    let alert_id: string | null = null

    const expiryDate = typeof expiry_date === 'string' ? new Date(expiry_date) : null
    const docExpired = expiryDate ? expiryDate < new Date() : false

    if (scan_failed) {
      verification_status = 'SCAN_FAILED'
      risk_level = 'MEDIUM'
    } else if (suspect_match || warrant_match || watchlist_match || interpol_match) {
      verification_status = 'FLAGGED'
      risk_level = warrant_match || interpol_match ? 'CRITICAL' : 'HIGH'
    } else if (docExpired) {
      verification_status = 'EXPIRED_DOC'
      risk_level = 'MEDIUM'
    }

    // ── Create alert for flagged persons ──────────────────────────────────────

    if (verification_status === 'FLAGGED' && ims_suspect_id) {
      const { data: intel } = await db
        .from('intelligence_events')
        .insert({
          source_tag: 'BORDER_SCAN',
          suspect_id: ims_suspect_id,
          officer_id: user.user_id,
          institution: user.institution,
          location_lat: location_lat ?? null,
          location_lng: location_lng ?? null,
          location_description: border_post ? `Border post: ${border_post}` : null,
          criminal_record_found: true,
          alert_generated: false,
          confidence: 1.0,
          event_timestamp: new Date().toISOString(),
          notes: `Document scan: ${doc_type} ${docNum ?? ''}. ${warrant_match ? 'ACTIVE WARRANT. ' : ''}${interpol_match ? 'INTERPOL NOTICE. ' : ''}`,
        })
        .select('id')
        .single()

      if (intel) {
        const alertMessages: string[] = []
        if (warrant_match)   alertMessages.push('ACTIVE WARRANT')
        if (interpol_match)  alertMessages.push('INTERPOL NOTICE')
        if (watchlist_match) alertMessages.push('ON WATCHLIST')
        if (suspect_match)   alertMessages.push('KNOWN SUSPECT')

        const { data: alert } = await db
          .from('alerts')
          .insert({
            intelligence_event_id: intel.id,
            suspect_id: ims_suspect_id,
            severity: risk_level,
            source_tag: 'BORDER_SCAN',
            title: `BORDER ALERT — ${alertMessages.join(' · ')}`,
            message: `${user.institution} border officer scanned a document (${doc_type}: ${docNum ?? 'unknown'}) that matches a flagged individual. ${alertMessages.join('. ')}.${border_post ? ` Location: ${border_post}.` : ''}`,
            requires_action: true,
            is_read: false,
          })
          .select('id')
          .single()

        alert_id = alert?.id ?? null

        await db
          .from('intelligence_events')
          .update({ alert_generated: !!alert_id })
          .eq('id', intel.id)
      }
    }

    // ── Write verification log ────────────────────────────────────────────────

    const { data: verif, error: verifErr } = await db
      .from('border_verifications')
      .insert({
        doc_type,
        doc_number:   docNum,
        full_name:    full_name ?? ([first_name, last_name].filter(Boolean).join(' ') || null),
        first_name:   first_name ?? null,
        last_name:    last_name  ?? null,
        date_of_birth,
        nationality,
        gender,
        expiry_date,
        issuing_country,
        issuing_authority,
        mrz_line1,
        mrz_line2,
        raw_ocr_text,
        scan_method:  scan_method ?? 'MANUAL',
        ocr_confidence,
        scan_failed:  !!scan_failed,
        scan_failure_reason,
        ims_suspect_id,
        suspect_match,
        warrant_match,
        watchlist_match,
        interpol_match,
        verification_status,
        risk_level,
        alert_id,
        notes,
        officer_id:   user.user_id,
        badge_number: user.badge_number,
        institution:  user.institution,
        device_type,
        device_info,
        border_post,
        location_lat,
        location_lng,
      })
      .select('id, verified_at')
      .single()

    if (verifErr) {
      console.error('[border/verify] insert error', verifErr)
      return apiError('Failed to save verification log', 500)
    }

    // ── Fetch suspect details if flagged (for display) ────────────────────────

    let suspectDetails = null
    if (ims_suspect_id) {
      const { data: s } = await db
        .from('suspects')
        .select('id, ims_reference, first_name, last_name, status, threat_level, date_of_birth, nationality, passport_number')
        .eq('id', ims_suspect_id)
        .single()

      if (s) {
        // Also fetch warrants summary
        const { data: warrants } = await db
          .from('warrants')
          .select('id, warrant_type, charges, issued_at, active')
          .eq('suspect_id', ims_suspect_id)
          .eq('active', true)
          .limit(3)

        suspectDetails = { ...s, active_warrants: warrants ?? [] }
      }
    }

    await logAudit({
      event_type: 'BORDER_VERIFY',
      actor: user,
      target_type: 'border_verification',
      target_id: verif?.id,
      action: 'CREATE',
      after_state: { verification_status, risk_level, doc_type, suspect_match, warrant_match },
    })

    return apiSuccess({
      verification_id: verif?.id,
      verification_status,
      risk_level,
      doc_expired: docExpired,
      suspect_match,
      warrant_match,
      watchlist_match,
      interpol_match,
      alert_id,
      suspect: suspectDetails,
      verified_at: verif?.verified_at,
    })
  },
  'border:verify',
)
