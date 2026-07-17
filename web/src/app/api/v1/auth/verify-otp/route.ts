import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyToken, signToken } from '@/lib/jwt'
import { logAudit, extractAuditContext } from '@/lib/audit'
import { apiError } from '@/lib/api-middleware'
import type { TokenResponse } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let session_token: string | undefined
  let otp: string | undefined

  // 1. Parse body
  try {
    const body = await req.json()
    session_token = body.session_token
    otp = body.otp
  } catch {
    return apiError('Invalid request body', 400)
  }

  if (!session_token || !otp) {
    return apiError('session_token and otp are required', 400)
  }

  const ctx = extractAuditContext(req)

  // 2. Verify the step token and check that it is an OTP-pending token
  let stepPayload: Record<string, unknown>
  try {
    stepPayload = await verifyToken(session_token)
  } catch {
    return apiError('Invalid or expired session token', 401)
  }

  if (stepPayload.step !== 'otp_pending') {
    return apiError('Invalid session token', 401)
  }

  const userId = stepPayload.user_id as string
  if (!userId) {
    return apiError('Invalid session token', 401)
  }

  const db = createServerSupabaseClient()

  // 3. Hash the submitted OTP
  const otpHash = createHash('sha256').update(otp.trim()).digest('hex')

  // 4. Look up a valid OTP record
  const { data: otpRecord, error: otpError } = await db
    .from('otp_verifications')
    .select('id, otp_hash, expires_at, used')
    .eq('user_id', userId)
    .eq('otp_hash', otpHash)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (otpError || !otpRecord) {
    await logAudit({
      event_type: 'AUTH_FAILED',
      action: 'invalid_otp',
      target_type: 'user',
      target_id: userId,
      context: ctx,
    })
    return apiError('Invalid or expired OTP', 401)
  }

  // 5. Mark the OTP as used
  await db
    .from('otp_verifications')
    .update({ used: true })
    .eq('id', otpRecord.id)

  // 6. Fetch the full user record
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, badge_number, full_name, email, role, clearance_level, institution, active, locked')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return apiError('User not found', 401)
  }

  if (!user.active || user.locked) {
    return apiError('Account is inactive or locked', 403)
  }

  // 7. Generate a session ID
  const session_id = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const ACCESS_TTL_SECONDS = 8 * 3600 // 8 hours

  // 7b. Safely fetch has_accepted_policies — defaults false if column not yet migrated
  let has_accepted_policies = false
  try {
    const { data: policyRow } = await db
      .from('users')
      .select('has_accepted_policies')
      .eq('id', userId)
      .single()
    has_accepted_policies = (policyRow as { has_accepted_policies?: boolean } | null)?.has_accepted_policies ?? false
  } catch { /* column not yet migrated — default false */ }

  // 8. Sign the full access token
  const accessToken = await signToken(
    {
      sub: user.id,
      user_id: user.id,
      badge_number: user.badge_number,
      full_name: user.full_name,
      institution: user.institution,
      role: user.role,
      clearance: user.clearance_level,
      clearance_level: user.clearance_level,
      has_accepted_policies,
      session_id,
      type: 'access',
    },
    '8h'
  )

  // 9. Sign the refresh token (7 days)
  const refreshToken = await signToken(
    {
      sub: user.id,
      session_id,
      type: 'refresh',
    },
    '7d'
  )

  // 10. Hash the refresh token and store the session
  const refreshHash = createHash('sha256').update(refreshToken).digest('hex')

  await db.from('user_sessions').insert({
    id: session_id,
    user_id: user.id,
    refresh_token_hash: refreshHash,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    revoked: false,
  }).then(({ error: e }) => { if (e) console.error('[verify-otp] session insert:', e.message) })

  // 11. Update last_login_at and reset MFA failure counter
  await db
    .from('users')
    .update({
      last_login_at: new Date().toISOString(),
      mfa_failures: 0,
    })
    .eq('id', user.id)

  // 12. Log successful login
  await logAudit({
    event_type: 'AUTH_LOGIN',
    action: 'login_success',
    target_type: 'user',
    target_id: user.id,
    context: ctx,
  })

  // 13. Return TokenResponse
  const response: TokenResponse = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TTL_SECONDS,
    user: {
      id: user.id,
      badge_number: user.badge_number,
      full_name: user.full_name,
      institution: user.institution,
      role: user.role,
      clearance_level: user.clearance_level,
      has_accepted_policies,
      session_id,
      exp: now + ACCESS_TTL_SECONDS,
    },
  }

  return NextResponse.json(response)
}
