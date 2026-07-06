import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyToken, signToken } from '@/lib/jwt'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-middleware'
import type { TokenResponse } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let refresh_token: string | undefined

  try {
    const body = await req.json()
    refresh_token = body.refresh_token
  } catch {
    return apiError('Invalid request body', 400)
  }

  if (!refresh_token) {
    return apiError('refresh_token is required', 400)
  }

  // 1. Verify the refresh token JWT
  let payload: Record<string, unknown>
  try {
    payload = await verifyToken(refresh_token)
  } catch {
    return apiError('Invalid or expired refresh token', 401)
  }

  if (payload.type !== 'refresh') {
    return apiError('Invalid token type', 401)
  }

  const userId = payload.sub as string
  const oldSessionId = payload.session_id as string

  const db = createServerSupabaseClient()

  // 2. Hash the refresh token and look up the session
  const refreshHash = createHash('sha256').update(refresh_token).digest('hex')

  const { data: session, error: sessionError } = await db
    .from('user_sessions')
    .select('id, user_id, revoked, expires_at')
    .eq('id', oldSessionId)
    .eq('user_id', userId)
    .eq('refresh_token_hash', refreshHash)
    .single()

  if (sessionError || !session) {
    return apiError('Refresh token not found or already used', 401)
  }

  if (session.revoked) {
    return apiError('Session has been revoked', 401)
  }

  if (new Date(session.expires_at) < new Date()) {
    return apiError('Refresh token has expired', 401)
  }

  // 3. Fetch the full user record
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, badge_number, full_name, role, clearance_level, institution, active, locked')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return apiError('User not found', 401)
  }

  if (!user.active || user.locked) {
    return apiError('Account is inactive or locked', 403)
  }

  // 4. Revoke the old session (rotation — one-use refresh tokens)
  await db
    .from('user_sessions')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('id', oldSessionId)

  // 5. Issue new tokens
  const newSessionId = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const ACCESS_TTL_SECONDS = 8 * 3600

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
      session_id: newSessionId,
      type: 'access',
    },
    '8h'
  )

  const newRefreshToken = await signToken(
    {
      sub: user.id,
      session_id: newSessionId,
      type: 'refresh',
    },
    '7d'
  )

  // 6. Store the new session
  const newRefreshHash = createHash('sha256').update(newRefreshToken).digest('hex')

  await db.from('user_sessions').insert({
    id: newSessionId,
    user_id: user.id,
    refresh_token_hash: newRefreshHash,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    revoked: false,
  }).then(({ error: e }) => { if (e) console.error('[refresh] session insert:', e.message) })

  // 7. Audit the token refresh
  await logAudit({
    event_type: 'AUTH_TOKEN_REFRESH',
    action: 'token_refresh',
    target_type: 'user',
    target_id: user.id,
    context: { ip_address: req.headers.get('x-forwarded-for') ?? null },
  })

  const response: TokenResponse = {
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TTL_SECONDS,
    user: {
      id: user.id,
      badge_number: user.badge_number,
      full_name: user.full_name,
      institution: user.institution,
      role: user.role,
      clearance_level: user.clearance_level,
      session_id: newSessionId,
      exp: now + ACCESS_TTL_SECONDS,
    },
  }

  return NextResponse.json(response)
}
