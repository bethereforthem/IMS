import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { signToken } from '@/lib/jwt'
import { logAudit } from '@/lib/audit'
import { institutionForRole } from '@/lib/rbac'

export const runtime = 'nodejs'

// ── User-Agent parsing ──────────────────────────────────────────────────────

interface UAInfo {
  device_type: 'DESKTOP' | 'MOBILE' | 'TABLET'
  browser: string
  os: string
}

function parseUserAgent(ua: string): UAInfo {
  const s = ua.toLowerCase()
  const device_type: UAInfo['device_type'] =
    /ipad|tablet|playbook|silk/.test(s) ? 'TABLET'
    : /mobile|iphone|ipod|android.*mobile|windows phone/.test(s) ? 'MOBILE'
    : 'DESKTOP'

  const browser =
    /edg\//.test(s)     ? 'Edge'
    : /opr\/|opera/.test(s) ? 'Opera'
    : /chrome\//.test(s)    ? 'Chrome'
    : /firefox\//.test(s)   ? 'Firefox'
    : /safari\//.test(s)    ? 'Safari'
    : /msie|trident/.test(s)? 'IE'
    : 'Unknown'

  const os =
    /windows nt 10/.test(s) ? 'Windows 10/11'
    : /windows nt/.test(s)  ? 'Windows'
    : /mac os x/.test(s)    ? 'macOS'
    : /android/.test(s)     ? 'Android'
    : /iphone|ipad|ipod/.test(s) ? 'iOS'
    : /linux/.test(s)       ? 'Linux'
    : 'Unknown'

  return { device_type, browser, os }
}

// ── Geolocation via ip-api.com (free, no key) ───────────────────────────────

interface GeoInfo {
  country_code: string | null
  country_name: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  is_vpn: boolean
  is_proxy: boolean
  isp: string | null
}

async function geoLookup(ip: string): Promise<GeoInfo> {
  const empty: GeoInfo = {
    country_code: null, country_name: null, city: null,
    latitude: null, longitude: null, is_vpn: false, is_proxy: false, isp: null,
  }
  // Skip loopback / private IPs
  if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/.test(ip)) return empty
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon,isp,proxy,hosting`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) return empty
    const d = await res.json()
    if (d.status !== 'success') return empty
    return {
      country_code: d.countryCode ?? null,
      country_name: d.country ?? null,
      city: d.city ?? null,
      latitude: typeof d.lat === 'number' ? d.lat : null,
      longitude: typeof d.lon === 'number' ? d.lon : null,
      is_vpn: !!(d.hosting),
      is_proxy: !!(d.proxy),
      isp: d.isp ?? null,
    }
  } catch {
    return empty
  }
}

// ── IDS helpers ──────────────────────────────────────────────────────────────

async function createSecurityIncident(
  db: ReturnType<typeof createServerSupabaseClient>,
  params: {
    incident_type: string
    severity: 'MEDIUM' | 'HIGH' | 'CRITICAL'
    user_id?: string
    session_id?: string
    badge_number: string
    full_name?: string
    institution?: string
    ip_address?: string | null
    country_code?: string | null
    country_name?: string | null
    city?: string | null
    description: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw_data?: any
    auto_blocked?: boolean
  }
): Promise<string | null> {
  try {
    // Create a CRITICAL alert first
    const { data: alert } = await db.from('alerts').insert({
      type: 'SECURITY_INCIDENT',
      severity: params.severity,
      title: `🚨 IDS Alert: ${params.incident_type.replace(/_/g, ' ')}`,
      description: params.description,
      source_institution: params.institution ?? 'SYSTEM',
      requires_action: params.severity === 'CRITICAL',
      is_read: false,
    }).select('id').single()

    const { data: incident } = await db.from('security_incidents').insert({
      incident_type: params.incident_type,
      severity: params.severity,
      user_id: params.user_id ?? null,
      session_id: params.session_id ?? null,
      badge_number: params.badge_number,
      full_name: params.full_name ?? null,
      institution: params.institution ?? null,
      ip_address: params.ip_address ?? null,
      country_code: params.country_code ?? null,
      country_name: params.country_name ?? null,
      city: params.city ?? null,
      description: params.description,
      raw_data: params.raw_data ?? null,
      auto_blocked: params.auto_blocked ?? false,
      alert_id: alert?.id ?? null,
    }).select('id').single()

    return incident?.id ?? null
  } catch (e) {
    console.error('[login:IDS] failed to create incident:', e)
    return null
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

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
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
               ?? req.headers.get('x-real-ip')
               ?? ''
    const userAgentRaw = req.headers.get('user-agent') ?? ''

    // 2. Parse UA + geo in parallel
    const [ua, geo] = await Promise.all([
      Promise.resolve(parseUserAgent(userAgentRaw)),
      geoLookup(rawIp),
    ])

    // 3. Fetch user (no `institution` column — derived from role via institutionForRole)
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, badge_number, full_name, role, clearance_level, active, locked, mfa_failures, password_hash')
      .eq('badge_number', badge_number)
      .eq('active', true)
      .single()
    const institution = user ? institutionForRole(user.role as string) : ''

    if (userError || !user) {
      // Log failed attempt
      await db.from('login_attempts').insert({
        badge_number,
        success: false,
        ip_address: rawIp || null,
        user_agent: userAgentRaw || null,
        ...ua,
        ...geo,
        failure_reason: 'UNKNOWN_BADGE',
      }).then(({ error: e }) => { if (e) console.error('[login] attempt log:', e.message) })

      await logAudit({ event_type: 'AUTH_FAILED', action: 'unknown_badge', target_type: 'badge', target_id: badge_number, context: { ip_address: rawIp } }).catch(() => {})
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // 4. Check lock
    if (user.locked) {
      await db.from('login_attempts').insert({
        user_id: user.id, badge_number,
        success: false,
        ip_address: rawIp || null,
        user_agent: userAgentRaw || null,
        ...ua, ...geo,
        failure_reason: 'ACCOUNT_LOCKED',
        full_name: user.full_name, institution: institution, role: user.role,
      }).then(({ error: e }) => { if (e) console.error('[login] attempt log:', e.message) })

      return NextResponse.json({ error: 'Account is locked. Contact your security officer.' }, { status: 403 })
    }

    // 5. Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash as string)
    if (!passwordValid) {
      const newFailures = ((user.mfa_failures as number) ?? 0) + 1
      await db.from('users').update({ mfa_failures: newFailures }).eq('id', user.id)

      await db.from('login_attempts').insert({
        user_id: user.id, badge_number,
        success: false,
        ip_address: rawIp || null,
        user_agent: userAgentRaw || null,
        ...ua, ...geo,
        failure_reason: 'INVALID_PASSWORD',
        full_name: user.full_name, institution: institution, role: user.role,
      }).then(({ error: e }) => { if (e) console.error('[login] attempt log:', e.message) })

      await logAudit({ event_type: 'AUTH_FAILED', action: 'invalid_password', target_type: 'user', target_id: user.id as string, context: { ip_address: rawIp } }).catch(() => {})

      // IDS: check for credential stuffing (>10 distinct badges from same IP in 10 min)
      if (rawIp) {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const { count } = await db
          .from('login_attempts')
          .select('badge_number', { count: 'exact', head: false })
          .eq('ip_address', rawIp)
          .eq('success', false)
          .gte('attempted_at', cutoff)
          .then(r => ({ count: r.data?.length ?? 0 }))
        if (count >= 10) {
          await createSecurityIncident(db, {
            incident_type: 'CREDENTIAL_STUFFING',
            severity: 'CRITICAL',
            user_id: user.id as string,
            badge_number,
            full_name: user.full_name as string,
            institution: institution as string,
            ip_address: rawIp,
            ...geo,
            description: `Credential stuffing detected: ${count} failed login attempts from IP ${rawIp} in 10 minutes.`,
            raw_data: { ip: rawIp, fail_count: count, cutoff },
          })
        }
      }

      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // 6. Issue tokens
    const session_id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const ACCESS_TTL = 8 * 3600

    // Fetch has_accepted_policies separately so login never breaks if the column
    // hasn't been added yet (migration not yet run → defaults to false).
    let has_accepted_policies = false
    try {
      const { data: policyRow } = await db
        .from('users')
        .select('has_accepted_policies')
        .eq('id', user.id as string)
        .single()
      has_accepted_policies = (policyRow as { has_accepted_policies?: boolean } | null)?.has_accepted_policies ?? false
    } catch { /* column not yet migrated — default false */ }

    const accessToken = await signToken(
      {
        sub: user.id,
        user_id: user.id,
        badge_number: user.badge_number,
        full_name: user.full_name,
        institution: institution,
        role: user.role,
        clearance: user.clearance_level,
        clearance_level: user.clearance_level,
        has_accepted_policies,
        session_id,
        type: 'access',
      },
      '8h'
    )

    const refreshToken = await signToken(
      { sub: user.id, session_id, type: 'refresh' },
      '7d'
    )

    // 7. Persist session with enriched data
    const refreshHash = createHash('sha256').update(refreshToken).digest('hex')
    await db.from('user_sessions').insert({
      id: session_id,
      user_id: user.id,
      refresh_token_hash: refreshHash,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      revoked: false,
      ip_address: rawIp || null,
      user_agent: userAgentRaw || null,
      ...ua,
      ...geo,
      full_name: user.full_name,
      badge_number: user.badge_number,
      institution: institution,
      role: user.role,
      last_active_at: new Date().toISOString(),
    }).then(({ error: e }) => { if (e) console.error('[login] session insert:', e.message) })

    // 8. Log successful attempt
    await db.from('login_attempts').insert({
      user_id: user.id, badge_number,
      success: true,
      ip_address: rawIp || null,
      user_agent: userAgentRaw || null,
      ...ua, ...geo,
      full_name: user.full_name, institution: institution, role: user.role,
    }).then(({ error: e }) => { if (e) console.error('[login] attempt log:', e.message) })

    // 9. Update last login + reset failures
    await db.from('users').update({ last_login_at: new Date().toISOString(), mfa_failures: 0 }).eq('id', user.id)
    await logAudit({ event_type: 'AUTH_LOGIN', action: 'login_success', target_type: 'user', target_id: user.id as string, context: { ip_address: rawIp } }).catch(() => {})

    // 10. Run IDS checks (fire-and-forget, non-blocking)
    runIDSChecks(db, {
      user_id: user.id as string,
      session_id,
      badge_number: user.badge_number as string,
      full_name: user.full_name as string,
      institution: institution as string,
      ip_address: rawIp,
      geo,
    }).catch(e => console.error('[login:IDS] background check failed:', e))

    console.log(`[login] SUCCESS: ${user.badge_number} (${user.full_name}) from ${geo.country_name ?? rawIp}`)

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: ACCESS_TTL,
      user: {
        id: user.id,
        badge_number: user.badge_number,
        full_name: user.full_name,
        institution: institution,
        role: user.role,
        clearance_level: user.clearance_level,
        has_accepted_policies,
        session_id,
        exp: now + ACCESS_TTL,
      },
    })
  } catch (err) {
    console.error('[login] UNHANDLED ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── IDS background checks ───────────────────────────────────────────────────

async function runIDSChecks(
  db: ReturnType<typeof createServerSupabaseClient>,
  ctx: {
    user_id: string
    session_id: string
    badge_number: string
    full_name: string
    institution: string
    ip_address: string
    geo: GeoInfo
  }
) {
  const { user_id, session_id, badge_number, full_name, institution, ip_address, geo } = ctx
  const commonCtx = { user_id, session_id, badge_number, full_name, institution, ip_address, ...geo }

  const checks: Promise<void>[] = []

  // ACCESS_OUTSIDE_RWANDA
  if (geo.country_code && geo.country_code !== 'RW') {
    checks.push(createSecurityIncident(db, {
      incident_type: 'ACCESS_OUTSIDE_RWANDA',
      severity: 'CRITICAL',
      ...commonCtx,
      description: `Login from outside Rwanda: ${geo.city ?? ''}${geo.city ? ', ' : ''}${geo.country_name} (${geo.country_code}) — IP: ${ip_address}`,
      raw_data: { country_code: geo.country_code, country_name: geo.country_name, city: geo.city, ip: ip_address },
    }).then(() => {}))
  }

  // VPN_DETECTED
  if (geo.is_vpn) {
    checks.push(createSecurityIncident(db, {
      incident_type: 'VPN_DETECTED',
      severity: 'HIGH',
      ...commonCtx,
      description: `VPN/hosting provider detected for ${full_name} (${badge_number}) — ISP: ${geo.isp ?? 'unknown'}, IP: ${ip_address}`,
      raw_data: { isp: geo.isp, ip: ip_address },
    }).then(() => {}))
  }

  // PROXY_DETECTED
  if (geo.is_proxy) {
    checks.push(createSecurityIncident(db, {
      incident_type: 'PROXY_DETECTED',
      severity: 'HIGH',
      ...commonCtx,
      description: `Proxy/anonymizer detected for ${full_name} (${badge_number}) — ISP: ${geo.isp ?? 'unknown'}, IP: ${ip_address}`,
      raw_data: { isp: geo.isp, ip: ip_address },
    }).then(() => {}))
  }

  // MULTIPLE_FAILED_LOGINS (>5 failures in last 15 min for this badge)
  checks.push((async () => {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: fails } = await db
      .from('login_attempts')
      .select('id')
      .eq('badge_number', badge_number)
      .eq('success', false)
      .gte('attempted_at', cutoff)
    const count = fails?.length ?? 0
    if (count >= 5) {
      await createSecurityIncident(db, {
        incident_type: 'MULTIPLE_FAILED_LOGINS',
        severity: 'HIGH',
        ...commonCtx,
        description: `${count} failed login attempts for ${badge_number} in the last 15 minutes before successful login.`,
        raw_data: { fail_count: count, cutoff },
      })
    }
  })())

  // IMPOSSIBLE_TRAVEL: last successful login from different country within 2 hours
  if (geo.country_code) {
    checks.push((async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
      const { data: prev } = await db
        .from('login_attempts')
        .select('country_code, country_name, city, attempted_at')
        .eq('user_id', user_id)
        .eq('success', true)
        .gte('attempted_at', twoHoursAgo)
        .order('attempted_at', { ascending: false })
        .limit(1)
        .single()

      if (prev && prev.country_code && prev.country_code !== geo.country_code) {
        await createSecurityIncident(db, {
          incident_type: 'IMPOSSIBLE_TRAVEL',
          severity: 'CRITICAL',
          ...commonCtx,
          description: `Impossible travel: ${full_name} logged in from ${geo.country_name} but had a recent login from ${prev.country_name ?? prev.country_code} within 2 hours.`,
          raw_data: {
            previous: { country_code: prev.country_code, country_name: prev.country_name, at: prev.attempted_at },
            current:  { country_code: geo.country_code, country_name: geo.country_name },
          },
        })
      }
    })())
  }

  // UNUSUAL_HOUR_ACCESS: login between 00:00–04:59 UTC
  const hour = new Date().getUTCHours()
  if (hour >= 0 && hour < 5) {
    checks.push(createSecurityIncident(db, {
      incident_type: 'UNUSUAL_HOUR_ACCESS',
      severity: 'MEDIUM',
      ...commonCtx,
      description: `Unusual hour access: ${full_name} (${badge_number}) logged in at ${String(hour).padStart(2, '0')}:xx UTC (off-hours window 00:00–04:59).`,
      raw_data: { utc_hour: hour },
    }).then(() => {}))
  }

  await Promise.allSettled(checks)
}
