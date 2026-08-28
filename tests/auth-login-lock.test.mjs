import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const memUrl = pathToFileURL(join(root, 'apps/server/dist/auth-memory.js')).href

describe('auth login lock (Scheme A)', () => {
  /** @type {typeof import('../apps/server/dist/auth-memory.js')} */
  let mem

  beforeEach(async () => {
    mem = await import(`${memUrl}?t=${Date.now()}`)
    mem.resetAuthMemoryForTests()
  })

  it('soft rate allows 30 attempts per window', () => {
    for (let i = 0; i < 30; i++) {
      assert.equal(mem.consumeAuthRateLimit('203.0.113.1'), true, `attempt ${i + 1}`)
    }
    assert.equal(mem.consumeAuthRateLimit('203.0.113.1'), false)
    assert.equal(mem.consumeAuthRateLimit('203.0.113.2'), true)
  })

  it('locks after 5 failures for 30 minutes then +35 per extra fail', () => {
    const ip = '198.51.100.7'
    for (let i = 1; i <= 4; i++) {
      const s = mem.recordLoginFailure(ip)
      assert.equal(s.locked, false, `fail ${i}`)
      assert.equal(s.fails, i)
    }
    const fifth = mem.recordLoginFailure(ip)
    assert.equal(fifth.locked, true)
    assert.equal(fifth.fails, 5)
    assert.ok(fifth.retryAfterSec >= 29 * 60 && fifth.retryAfterSec <= 30 * 60)

    const sixth = mem.recordLoginFailure(ip)
    assert.equal(sixth.locked, true)
    assert.equal(sixth.fails, 6)
    assert.ok(sixth.retryAfterSec >= 64 * 60 && sixth.retryAfterSec <= 65 * 60)

    assert.equal(mem.getLoginLockStatus(ip).locked, true)
    mem.clearLoginFailures(ip)
    assert.equal(mem.getLoginLockStatus(ip).locked, false)
  })
})
