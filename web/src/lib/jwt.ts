import { SignJWT, jwtVerify } from 'jose'

const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET!)

/**
 * Parse an expiry string like '8h', '7d', '5m' into seconds.
 */
function parseExpiryToSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/)
  if (!match) throw new Error(`Invalid expiresIn format: ${expiresIn}`)
  const value = parseInt(match[1], 10)
  const unit = match[2]
  switch (unit) {
    case 's': return value
    case 'm': return value * 60
    case 'h': return value * 3600
    case 'd': return value * 86400
    default: throw new Error(`Unknown time unit: ${unit}`)
  }
}

/**
 * Sign a JWT with the given payload and expiry.
 * expiresIn accepts strings like '8h', '7d', '5m'.
 */
export async function signToken(
  payload: Record<string, unknown>,
  expiresIn = '8h'
): Promise<string> {
  const secret = getSecret()
  const expirySeconds = parseExpiryToSeconds(expiresIn)

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expirySeconds)
    .sign(secret)
}

/**
 * Verify a JWT and return its payload. Throws on invalid or expired tokens.
 */
export async function verifyToken(token: string): Promise<Record<string, unknown>> {
  const secret = getSecret()
  const { payload } = await jwtVerify(token, secret)
  return payload as Record<string, unknown>
}

/**
 * Sign a short-lived step token used during the OTP flow.
 * Payload: { user_id, step: 'otp_pending' }
 * Expires in 5 minutes.
 */
export async function signOtpStepToken(userId: string): Promise<string> {
  return signToken({ user_id: userId, step: 'otp_pending' }, '5m')
}
