/**
 * Local owner auth repository — single-row app_owner + hashed sessions.
 */
import type Database from 'better-sqlite3'
import { assertOwnerPassword, normalizeOwnerUsername } from '@opptrix/shared'
import {
  decryptAuthSecret,
  encryptAuthSecret,
  generateRecoveryCodes,
  hashPasswordScrypt,
  parseRecoveryHashesJson,
  randomPasswordSalt,
  verifyPasswordScrypt,
  verifyRecoveryCode,
} from './app-auth-crypto.js'
import { initAppAuthSchema, OWNER_ROW_ID } from './app-auth-schema.js'
import {
  buildOtpauthUrl,
  generateTotpSecretBase32,
  verifyTotpCode,
} from './app-auth-totp.js'
import {
  getAuthSessionByTokenHash,
  insertAuthSession,
  issueAuthSession,
  listAuthSessions,
  revokeAllAuthSessions,
  revokeAuthSession,
  touchAuthSession,
  wipeAuthTables,
  type AuthSessionPublic,
  type AuthSessionRow,
  type CreateSessionInput,
} from './app-auth-sessions.js'

export {
  APP_AUTH_SCHEMA_MIGRATION_KEY,
  AUTH_SESSION_TTL_DESKTOP_MS,
  AUTH_SESSION_TTL_WEB_MS,
  initAppAuthSchema,
  OWNER_ROW_ID,
} from './app-auth-schema.js'
export {
  generateSessionToken,
  hashSessionToken,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  randomPasswordSalt,
  isAuthSafeModeEnv,
  resetAuthKeyCacheForTests,
  generateRecoveryCodes,
  verifyRecoveryCode,
} from './app-auth-crypto.js'
export {
  generateTotpSecretBase32,
  totpCodeAt,
  verifyTotpCode,
  buildOtpauthUrl,
  encodeBase32,
  decodeBase32,
  hotp,
} from './app-auth-totp.js'
export type { AuthSessionPublic, AuthSessionRow, CreateSessionInput } from './app-auth-sessions.js'

export interface OwnerPublic {
  username: string
  totp_enabled: boolean
  created_at: string
}

interface OwnerRow {
  id: string
  username: string
  password_salt: Buffer
  password_hash: Buffer
  totp_secret_enc: Buffer | null
  totp_secret_iv: Buffer | null
  totp_secret_tag: Buffer | null
  totp_enabled: number
  recovery_codes_json: string | null
  created_at: string
  updated_at: string
}

function nowIso(): string {
  return new Date().toISOString()
}

export class AppAuthRepository {
  private pendingTotpSecret: string | null = null

  constructor(private readonly db: Database.Database) {
    initAppAuthSchema(db)
  }

  private readOwner(): OwnerRow | null {
    const row = this.db.prepare('SELECT * FROM app_owner WHERE id = ?').get(OWNER_ROW_ID) as
      | OwnerRow
      | undefined
    return row ?? null
  }

  isClaimed(): boolean {
    return this.readOwner() != null
  }

  getOwnerPublic(): OwnerPublic | null {
    const row = this.readOwner()
    if (!row) return null
    return {
      username: row.username,
      totp_enabled: row.totp_enabled === 1,
      created_at: row.created_at,
    }
  }

  createOwner(input: { username: string; password: string }): void {
    if (this.isClaimed()) throw new Error('账户已创建')
    const username = normalizeOwnerUsername(input.username)
    assertOwnerPassword(input.password)
    const salt = randomPasswordSalt()
    const hash = hashPasswordScrypt(input.password, salt)
    const ts = nowIso()
    this.db.prepare(`
      INSERT INTO app_owner(
        id, username, password_salt, password_hash, totp_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(OWNER_ROW_ID, username, salt, hash, ts, ts)
  }

  verifyPassword(password: string): boolean {
    const row = this.readOwner()
    if (!row) return false
    return verifyPasswordScrypt(password, row.password_salt, row.password_hash)
  }

  verifyUsernamePassword(username: string, password: string): boolean {
    const row = this.readOwner()
    if (!row) return false
    if (username.trim() !== row.username) {
      verifyPasswordScrypt(password, row.password_salt, row.password_hash)
      return false
    }
    return verifyPasswordScrypt(password, row.password_salt, row.password_hash)
  }

  setPassword(newPassword: string): void {
    const row = this.readOwner()
    if (!row) throw new Error('尚未创建账户')
    assertOwnerPassword(newPassword)
    const salt = randomPasswordSalt()
    const hash = hashPasswordScrypt(newPassword, salt)
    this.db.prepare(`
      UPDATE app_owner SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?
    `).run(salt, hash, nowIso(), OWNER_ROW_ID)
  }

  setTotpPendingSecret(secretPlain: string): void {
    if (!this.isClaimed()) throw new Error('尚未创建账户')
    this.pendingTotpSecret = secretPlain.trim()
  }

  beginTotpSetup(): { otpauth_url: string; secret: string } {
    const owner = this.getOwnerPublic()
    if (!owner) throw new Error('尚未创建账户')
    const secret = generateTotpSecretBase32()
    this.pendingTotpSecret = secret
    return { secret, otpauth_url: buildOtpauthUrl(owner.username, secret) }
  }

  confirmTotp(code: string): { recovery_codes: string[] } {
    const pending = this.pendingTotpSecret
    if (!pending) throw new Error('请先开始两步验证设置')
    if (!verifyTotpCode(pending, code)) throw new Error('验证码不正确')
    const { ciphertext, iv, tag } = encryptAuthSecret(pending)
    const { plain, hashes } = generateRecoveryCodes()
    this.db.prepare(`
      UPDATE app_owner SET
        totp_secret_enc = ?, totp_secret_iv = ?, totp_secret_tag = ?,
        totp_enabled = 1, recovery_codes_json = ?, updated_at = ?
      WHERE id = ?
    `).run(ciphertext, iv, tag, JSON.stringify(hashes), nowIso(), OWNER_ROW_ID)
    this.pendingTotpSecret = null
    return { recovery_codes: plain }
  }

  disableTotp(password: string, code?: string): void {
    const row = this.readOwner()
    if (!row) throw new Error('尚未创建账户')
    if (!verifyPasswordScrypt(password, row.password_salt, row.password_hash)) {
      throw new Error('密码不正确')
    }
    if (row.totp_enabled === 1) {
      const totpOk = code ? this.verifyTotp(code) : false
      const recoveryOk = code
        ? verifyRecoveryCode(code, parseRecoveryHashesJson(row.recovery_codes_json))
        : false
      if (!totpOk && !recoveryOk) throw new Error('验证码不正确')
    }
    this.clearTotpFields()
  }

  /**
   * Host/CLI recovery — clear TOTP + recovery codes without old password.
   * No-op if unclaimed.
   */
  forceClearTotp(): void {
    if (!this.isClaimed()) return
    this.clearTotpFields()
  }

  /**
   * Host/CLI recovery — set new password without old password.
   * By default disables TOTP and revokes all sessions.
   */
  adminResetPassword(opts: { newPassword: string; disableTotp?: boolean }): {
    username: string
    totpWasEnabled: boolean
    totpDisabled: boolean
    sessionsRevoked: number
  } {
    const row = this.readOwner()
    if (!row) throw new Error('尚未创建账户')
    const totpWasEnabled = row.totp_enabled === 1
    const shouldDisableTotp = opts.disableTotp !== false
    this.setPassword(opts.newPassword)
    let totpDisabled = false
    if (shouldDisableTotp) {
      this.clearTotpFields()
      totpDisabled = totpWasEnabled
    }
    const sessionsRevoked = this.revokeAllSessions()
    return {
      username: row.username,
      totpWasEnabled,
      totpDisabled,
      sessionsRevoked,
    }
  }

  private clearTotpFields(): void {
    this.db.prepare(`
      UPDATE app_owner SET
        totp_secret_enc = NULL, totp_secret_iv = NULL, totp_secret_tag = NULL,
        totp_enabled = 0, recovery_codes_json = NULL, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), OWNER_ROW_ID)
    this.pendingTotpSecret = null
  }

  verifyTotp(code: string): boolean {
    const row = this.readOwner()
    if (!row || row.totp_enabled !== 1) return false
    if (!row.totp_secret_enc || !row.totp_secret_iv || !row.totp_secret_tag) return false
    try {
      const secret = decryptAuthSecret({
        ciphertext: row.totp_secret_enc,
        iv: row.totp_secret_iv,
        tag: row.totp_secret_tag,
      })
      return verifyTotpCode(secret, code)
    } catch {
      return false
    }
  }

  createSession(input: CreateSessionInput): { id: string; expires_at: string } {
    return insertAuthSession(this.db, input)
  }

  issueSession(input: Omit<CreateSessionInput, 'tokenPlain'>): {
    id: string
    token: string
    expires_at: string
  } {
    return issueAuthSession(this.db, input)
  }

  touchSession(id: string): void {
    touchAuthSession(this.db, id)
  }

  getSessionByTokenHash(hash: string): AuthSessionRow | null {
    return getAuthSessionByTokenHash(this.db, hash)
  }

  listSessions(): AuthSessionPublic[] {
    return listAuthSessions(this.db)
  }

  revokeSession(id: string): boolean {
    return revokeAuthSession(this.db, id)
  }

  revokeAllSessions(exceptId?: string): number {
    return revokeAllAuthSessions(this.db, exceptId)
  }

  wipeOwnerForSafeMode(): void {
    wipeAuthTables(this.db)
    this.pendingTotpSecret = null
  }
}
