/**
 * Owner-auth crypto: scrypt passwords, session token hashes,
 * AES-256-GCM for TOTP secrets (separate auth.key, mode 0600).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

const AUTH_KEY_FILE = 'auth.key'
const KEY_BYTES = 32
const IV_BYTES = 12
const SALT_BYTES = 16
const SCRYPT_KEYLEN = 32
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const
const SESSION_TOKEN_BYTES = 32
const RECOVERY_CODE_COUNT = 8
const RECOVERY_CODE_BYTES = 5

export function isAuthSafeModeEnv(): boolean {
  return process.env.OPPTRIX_AUTH_SAFE_MODE?.trim() === '1'
}

export function randomPasswordSalt(): Buffer {
  return crypto.randomBytes(SALT_BYTES)
}

export function hashPasswordScrypt(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS)
}

export function verifyPasswordScrypt(
  password: string,
  salt: Buffer,
  expectedHash: Buffer,
): boolean {
  const actual = hashPasswordScrypt(password, salt)
  if (actual.length !== expectedHash.length) return false
  return crypto.timingSafeEqual(actual, expectedHash)
}

export function generateSessionToken(): string {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

export function hashSessionToken(tokenPlain: string): string {
  return crypto.createHash('sha256').update(tokenPlain, 'utf8').digest('hex')
}

export interface EncryptedBlob {
  ciphertext: Buffer
  iv: Buffer
  tag: Buffer
}

function resolveAuthKeyPath(): string {
  const fromEnv = process.env.OPPTRIX_AUTH_KEY_PATH?.trim()
  if (fromEnv) return fromEnv
  return path.join(resolveUserDataRoot(), AUTH_KEY_FILE)
}

let cachedKey: Buffer | null = null

export function resetAuthKeyCacheForTests(): void {
  cachedKey = null
}

function loadOrCreateAuthKey(): Buffer {
  if (cachedKey) return cachedKey
  const keyPath = resolveAuthKeyPath()
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  if (fs.existsSync(keyPath)) {
    const buf = fs.readFileSync(keyPath)
    if (buf.length !== KEY_BYTES) {
      throw new Error('auth.key 长度无效，请勿手动编辑')
    }
    cachedKey = buf
    return buf
  }
  const key = crypto.randomBytes(KEY_BYTES)
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  try {
    fs.chmodSync(keyPath, 0o600)
  } catch {
    /* Windows 等可能不支持 chmod */
  }
  cachedKey = key
  return key
}

export function encryptAuthSecret(plain: string): EncryptedBlob {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', loadOrCreateAuthKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { ciphertext, iv, tag: cipher.getAuthTag() }
}

export function decryptAuthSecret(blob: EncryptedBlob): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadOrCreateAuthKey(), blob.iv)
  decipher.setAuthTag(blob.tag)
  const plain = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()])
  return plain.toString('utf8')
}

function formatRecoveryCode(raw: Buffer): string {
  const hex = raw.toString('hex').toUpperCase()
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`
}

export function hashRecoveryCode(plain: string): string {
  const normalized = plain.trim().toUpperCase().replace(/\s+/g, '')
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export function generateRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain: string[] = []
  const hashes: string[] = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = formatRecoveryCode(crypto.randomBytes(RECOVERY_CODE_BYTES))
    plain.push(code)
    hashes.push(hashRecoveryCode(code))
  }
  return { plain, hashes }
}

export function verifyRecoveryCode(plain: string, hashes: string[]): boolean {
  const h = hashRecoveryCode(plain)
  const target = Buffer.from(h, 'hex')
  for (const stored of hashes) {
    const buf = Buffer.from(stored, 'hex')
    if (buf.length === target.length && crypto.timingSafeEqual(buf, target)) {
      return true
    }
  }
  return false
}

export function parseRecoveryHashesJson(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(x => String(x ?? '')).filter(Boolean)
  } catch {
    return []
  }
}
