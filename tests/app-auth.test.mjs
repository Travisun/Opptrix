import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-app-auth-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
  process.env.OPPTRIX_AUTH_KEY_PATH = join(dataDir, 'auth.key')
})

after(async () => {
  try {
    const { getUserDataStore, resetAuthKeyCacheForTests } = await import('../packages/user-store/dist/index.js')
    getUserDataStore().close()
    resetAuthKeyCacheForTests()
  } catch {
    /* store may not have been opened */
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

describe('app-auth crypto', () => {
  it('scrypt hashes and verifies with timing-safe compare', async () => {
    const { randomPasswordSalt, hashPasswordScrypt, verifyPasswordScrypt } =
      await import('../packages/user-store/dist/index.js')
    const salt = randomPasswordSalt()
    const hash = hashPasswordScrypt('correct horse', salt)
    assert.equal(hash.length, 32)
    assert.equal(verifyPasswordScrypt('correct horse', salt, hash), true)
    assert.equal(verifyPasswordScrypt('wrong password', salt, hash), false)
  })

  it('TOTP RFC 6238 SHA-1 6-digit vector and ±1 window', async () => {
    const { totpCodeAt, verifyTotpCode, encodeBase32 } =
      await import('../packages/user-store/dist/index.js')
    const secretAscii = Buffer.from('12345678901234567890', 'ascii')
    const secret = encodeBase32(secretAscii)
    assert.equal(totpCodeAt(secret, 59), '287082')
    assert.equal(verifyTotpCode(secret, '287082', 59_000), true)
    assert.equal(verifyTotpCode(secret, '287082', 59_000 + 30_000), true)
    assert.equal(verifyTotpCode(secret, '287082', 59_000 - 30_000), true)
    assert.equal(verifyTotpCode(secret, '000000', 59_000), false)
  })
})

describe('auth credentials rules', () => {
  it('username and password policy', async () => {
    const {
      validateUsernameInput,
      validatePasswordInput,
      normalizeOwnerUsername,
    } = await import('@opptrix/shared')
    assert.equal(validateUsernameInput('ab12'), '用户名至少 5 位')
    assert.equal(validateUsernameInput('abcde'), '用户名需同时包含英文与数字，或使用邮箱')
    assert.equal(validateUsernameInput('user1'), null)
    assert.equal(validateUsernameInput('owner@example.com'), null)
    assert.equal(normalizeOwnerUsername(' User1 '), 'User1')
    assert.ok(validatePasswordInput('password1'))
    assert.ok(validatePasswordInput('Password1'))
    assert.equal(validatePasswordInput('Owner1!pass'), null)
    assert.equal(validatePasswordInput('Owner1!pass', 'Owner1!passx'), '两次输入的密码不一致')
  })
})

describe('app-auth repository', () => {
  it('claim, session, totp, wipe', async () => {
    const { getUserDataStore, totpCodeAt } = await import('../packages/user-store/dist/index.js')
    const auth = getUserDataStore().appAuth
    assert.equal(auth.isClaimed(), false)
    assert.throws(() => auth.createOwner({ username: 'owner1', password: 'password1' }))
    auth.createOwner({ username: 'owner1', password: 'Owner1!pass' })
    assert.equal(auth.isClaimed(), true)
    assert.equal(auth.getOwnerPublic()?.username, 'owner1')
    assert.throws(() => auth.createOwner({ username: 'x', password: 'Owner1!pass' }))
    assert.equal(auth.verifyPassword('Owner1!pass'), true)
    assert.equal(auth.verifyUsernamePassword('owner1', 'nope'), false)

    const issued = auth.issueSession({ label: 'test', desktop: true })
    assert.ok(issued.token.length >= 32)
    const row = auth.getSessionByTokenHash(
      (await import('../packages/user-store/dist/index.js')).hashSessionToken(issued.token),
    )
    assert.ok(row)
    assert.equal(row.desktop, 1)
    assert.equal(auth.listSessions().length, 1)

    const setup = auth.beginTotpSetup()
    assert.ok(setup.otpauth_url.startsWith('otpauth://totp/'))
    const code = totpCodeAt(setup.secret, Math.floor(Date.now() / 1000))
    const rec = auth.confirmTotp(code)
    assert.equal(rec.recovery_codes.length, 8)
    assert.equal(auth.getOwnerPublic()?.totp_enabled, true)
    assert.equal(auth.verifyTotp(code), true)

    auth.wipeOwnerForSafeMode()
    assert.equal(auth.isClaimed(), false)
    assert.equal(auth.listSessions().length, 0)
  })

  it('adminResetPassword clears TOTP by default and revokes sessions; --keep-totp path via disableTotp:false', async () => {
    const { getUserDataStore, totpCodeAt, resetAuthKeyCacheForTests } =
      await import('../packages/user-store/dist/index.js')
    getUserDataStore().close()
    resetAuthKeyCacheForTests()
    const auth = getUserDataStore().appAuth
    if (auth.isClaimed()) auth.wipeOwnerForSafeMode()
    auth.createOwner({ username: 'admin1', password: 'Admin1!pass' })
    const setup = auth.beginTotpSetup()
    const code = totpCodeAt(setup.secret, Math.floor(Date.now() / 1000))
    auth.confirmTotp(code)
    assert.equal(auth.getOwnerPublic()?.totp_enabled, true)
    auth.issueSession({ label: 'a', desktop: false })
    auth.issueSession({ label: 'b', desktop: true })
    assert.equal(auth.listSessions().length, 2)

    const reset = auth.adminResetPassword({ newPassword: 'Admin2!pass' })
    assert.equal(reset.username, 'admin1')
    assert.equal(reset.totpWasEnabled, true)
    assert.equal(reset.totpDisabled, true)
    assert.equal(reset.sessionsRevoked, 2)
    assert.equal(auth.verifyPassword('Admin2!pass'), true)
    assert.equal(auth.verifyPassword('Admin1!pass'), false)
    assert.equal(auth.getOwnerPublic()?.totp_enabled, false)
    assert.equal(auth.listSessions().length, 0)

    // re-enable TOTP, reset with keep-totp
    const setup2 = auth.beginTotpSetup()
    const code2 = totpCodeAt(setup2.secret, Math.floor(Date.now() / 1000))
    auth.confirmTotp(code2)
    auth.issueSession({ label: 'c', desktop: false })
    const keep = auth.adminResetPassword({ newPassword: 'Admin3!pass', disableTotp: false })
    assert.equal(keep.totpWasEnabled, true)
    assert.equal(keep.totpDisabled, false)
    assert.equal(keep.sessionsRevoked, 1)
    assert.equal(auth.getOwnerPublic()?.totp_enabled, true)
    assert.equal(auth.verifyPassword('Admin3!pass'), true)
    assert.equal(auth.listSessions().length, 0)
  })

  it('forceClearTotp clears TOTP without password; no-op when unclaimed', async () => {
    const { getUserDataStore, totpCodeAt, resetAuthKeyCacheForTests } =
      await import('../packages/user-store/dist/index.js')
    getUserDataStore().close()
    resetAuthKeyCacheForTests()
    const auth = getUserDataStore().appAuth
    if (auth.isClaimed()) auth.wipeOwnerForSafeMode()
    auth.forceClearTotp() // no-op
    auth.createOwner({ username: 'force1', password: 'Force1!pass' })
    const setup = auth.beginTotpSetup()
    const code = totpCodeAt(setup.secret, Math.floor(Date.now() / 1000))
    auth.confirmTotp(code)
    assert.equal(auth.getOwnerPublic()?.totp_enabled, true)
    auth.forceClearTotp()
    assert.equal(auth.getOwnerPublic()?.totp_enabled, false)
    assert.equal(auth.verifyPassword('Force1!pass'), true)
  })
})

describe('claimed gate helpers', () => {
  it('evaluateAccessGate: unclaimed always open, claimed always auth', async () => {
    const { evaluateAccessGate, authRequired } = await import('@opptrix/shared')
    assert.equal(evaluateAccessGate(false, true), 'open')
    assert.equal(evaluateAccessGate(false, false), 'open')
    assert.equal(evaluateAccessGate(true, true), 'auth_required')
    assert.equal(evaluateAccessGate(true, false), 'auth_required')
    assert.equal(authRequired(true, false), true)
    assert.equal(authRequired(false, true), false)
    assert.equal(authRequired(false, false), false)
  })
})
