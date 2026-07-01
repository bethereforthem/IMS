import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { signToken } from '@/lib/jwt'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Parse body
    let badge_number: string | undefined
    let password: string | undefined
    try {
      const body = await req.json()
      badge_number = body.badge_number as string
      password = body.password as string
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!badge_number || !password) {
      return NextResponse.json({ error: 'badge_number and password are required' }, { status: 400 })
    }

    const db = createServerSupabaseClient()
    const ipAddress = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined

    // 2. Fetch user — only columns that exist in the actual DB
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, badge_number, full_name, role, clearance_level, institution, active, locked, mfa_failures, password_hash')
      .eq('badge_number', badge_number)
      .eq('active', true)
      .single()

    if (userError || !user) {
      console.error('[login] user lookup failed', badge_number, userError?.code, userError?.message)
      await logAudit({ event_type: 'AUTH_FAILED', action: 'unknown_badge', target_type: 'badge', target_id: badge_number, ip_address: ipAddress }).catch(() => {})
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // 3. Check lock
    if (user.locked) {
      return NextResponse.json({ error: 'Account is locked. Contact your security officer.' }, { status: 403 })
    }

    // 4. Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash as string)
    if (!passwordValid) {
      const newFailures = ((user.mfa_failures as number) ?? 0) + 1
      await db.from('users').update({ mfa_failures: newFailures }).eq('id', user.id)
      await logAudit({ event_type: 'AUTH_FAILED', action: 'invalid_password', target_type: 'user', target_id: user.id as string, ip_address: ipAddress }).catch(() => {})
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // 5. Issue tokens
    const session_id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const ACCESS_TTL = 8 * 3600

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
        session_id,
        type: 'access',
      },
      '8h'
    )

    const refreshToken = await signToken(
      { sub: user.id, session_id, type: 'refresh' },
      '7d'
    )

    // 6. Persist session (non-fatal if fails)
    const refreshHash = createHash('sha256').update(refreshToken).digest('hex')
    await db.from('user_sessions').insert({
      id: session_id,
      user_id: user.id,
      refresh_token_hash: refreshHash,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      revoked: false,
    }).then(({ error: e }) => { if (e) console.error('[login] session insert:', e.message) })

    // 7. Update last login
    await db.from('users').update({ last_login_at: new Date().toISOString(), mfa_failures: 0 }).eq('id', user.id)

    await logAudit({ event_type: 'AUTH_LOGIN', action: 'login_success', target_type: 'user', target_id: user.id as string, ip_address: ipAddress }).catch(() => {})

    console.log(`[login] SUCCESS: ${user.badge_number} (${user.full_name})`)

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL,
      user: {
        id: user.id,
        badge_number: user.badge_number,
        full_name: user.full_name,
        institution: user.institution,
        role: user.role,
        clearance_level: user.clearance_level,
        session_id,
        exp: now + ACCESS_TTL,
      },
    })
  } catch (err) {
    console.error('[login] UNHANDLED ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
