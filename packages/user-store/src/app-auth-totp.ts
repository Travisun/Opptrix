/**
 * RFC 6238 TOTP (SHA-1, 30s, 6 digits, ±1 window) + RFC 4648 base32.
 * No extra dependencies.
 */
import crypto from 'node:crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const TOTP_PERIOD_SEC = 30
const TOTP_DIGITS = 6
const TOTP_WINDOW = 1
const SECRET_BYTES = 20

export function encodeBase32(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function decodeBase32(input: string): Buffer {
  const s = input.replace(/=+$/g, '').toUpperCase().replace(/\s+/g, '')
  if (!s) throw new Error('empty totp secret')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s) {
    const idx = B32.indexOf(ch)
    if (idx < 0) throw new Error('invalid base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecretBase32(): string {
  return encodeBase32(crypto.randomBytes(SECRET_BYTES))
}

function hmacByte(hmac: Buffer, index: number): number {
  const value = hmac[index]
  if (value === undefined) throw new Error('hmac truncated')
  return value
}

export function hotp(secret: Buffer, counter: number): string {
  const safe = Math.max(0, Math.floor(counter))
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(safe))
  const hmac = crypto.createHmac('sha1', secret).update(msg).digest()
  const offset = hmacByte(hmac, hmac.length - 1) & 0x0f
  const bin =
    ((hmacByte(hmac, offset) & 0x7f) << 24)
    | ((hmacByte(hmac, offset + 1) & 0xff) << 16)
    | ((hmacByte(hmac, offset + 2) & 0xff) << 8)
    | (hmacByte(hmac, offset + 3) & 0xff)
  const mod = 10 ** TOTP_DIGITS
  return String(bin % mod).padStart(TOTP_DIGITS, '0')
}

export function totpCodeAt(secretBase32: string, unixSeconds: number): string {
  const secret = decodeBase32(secretBase32)
  const counter = Math.floor(unixSeconds / TOTP_PERIOD_SEC)
  return hotp(secret, counter)
}

function normalizeOtp(code: string): string | null {
  const n = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(n)) return null
  return n
}

export function verifyTotpCode(
  secretBase32: string,
  code: string,
  nowMs = Date.now(),
): boolean {
  const expected = normalizeOtp(code)
  if (!expected) return false
  let secret: Buffer
  try {
    secret = decodeBase32(secretBase32)
  } catch {
    return false
  }
  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SEC)
  for (let w = -TOTP_WINDOW; w <= TOTP_WINDOW; w++) {
    const slot = counter + w
    if (slot < 0) continue
    const candidate = hotp(secret, slot)
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))) {
      return true
    }
  }
  return false
}

export function buildOtpauthUrl(username: string, secretBase32: string): string {
  const label = encodeURIComponent(`Opptrix:${username}`)
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: 'Opptrix',
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
