import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformHands helper (Wave 46A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('empty → pendingCount 0; matches info().handsTicketsPending', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformHands(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.pendingCount, 0)
    assert.equal(result.handsTicketsPending, 0)
    assert.equal(result.pendingCount, ctx.info().handsTicketsPending)
    assert.equal(result.pendingCount, ctx.hands.pendingCount())
  })

  it('after issue → pendingCount 1; no ticket id/token in result', () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.ping' })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue')

    const result = platform.admitPlatformHands(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.pendingCount, 1)
    assert.equal(result.handsTicketsPending, 1)
    assert.equal(result.pendingCount, ctx.info().handsTicketsPending)
    assert.equal('ticket' in result, false)
    assert.equal('tickets' in result, false)
    assert.equal('id' in result, false)
    assert.equal('token' in result, false)
  })

  it('custom origin; C-HANDS-DIAG + ABI 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({ token: 'hands.ping' })
    assert.equal(issued.ok, true)

    const result = platform.admitPlatformHands(ctx, {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(result.pendingCount, 1)
    assert.equal(result.handsTicketsPending, ctx.info().handsTicketsPending)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })
})
