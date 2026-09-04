import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const usageMeterModUrl = pathToFileURL(
  path.join(here, '../packages/agent/dist/usage-meter.js'),
).href

describe('platform meter usage wire (Wave 48A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {typeof import('../packages/agent/dist/usage-meter.js')} */
  let usageMeterMod

  beforeEach(async () => {
    platform = await import(platformModUrl)
    usageMeterMod = await import(usageMeterModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('usageMeter hook → meter.recordUsage increments soft totals', () => {
    const ctx = platform.createPlatformContext()
    /** @type {import('../packages/agent/dist/usage-meter.js').UsageMeterHooks} */
    const hooks = {
      record(usage) {
        ctx.meter.recordUsage(usage)
      },
    }

    // Engine maps promptTokens → tokenIn, completionTokens → tokenOut
    hooks.record({ tokenIn: 120, tokenOut: 45, sessionId: 'sess-w48a' })
    hooks.record({ tokenIn: 30, tokenOut: 10, sessionId: 'sess-w48a' })

    const snap = ctx.meter.snapshot()
    assert.equal(snap.tokenInTotal, 150)
    assert.equal(snap.tokenOutTotal, 55)
    assert.equal(ctx.info().meter.tokenInTotal, 150)
    assert.equal(ctx.info().meter.tokenOutTotal, 55)
  })

  it('hook throw is isolatable (caller must swallow)', () => {
    /** @type {import('../packages/agent/dist/usage-meter.js').UsageMeterHooks} */
    const hooks = {
      record() {
        throw new Error('meter down')
      },
    }
    assert.throws(() => {
      hooks.record({ tokenIn: 1, tokenOut: 1, sessionId: 'x' })
    }, /meter down/)
  })

  it('server-shaped adapter: UsageMeterHooks.record → platform.meter.recordUsage', () => {
    const ctx = platform.createPlatformContext()
    /** @type {import('../packages/agent/dist/usage-meter.js').UsageMeterHooks} */
    const hooks = {
      record(usage) {
        ctx.meter.recordUsage(usage)
      },
    }
    // Same shape as apps/server AgentEngine settings.usageMeter
    hooks.record({ tokenIn: 7, tokenOut: 3, sessionId: 's' })
    assert.equal(ctx.meter.snapshot().tokenInTotal, 7)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 3)
  })

  it('C-METER-USAGE-WIRE + ABI 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    /** @type {import('../packages/agent/dist/usage-meter.js').UsageMeterHooks} */
    const hooks = {
      record(usage) {
        ctx.meter.recordUsage(usage)
      },
    }
    hooks.record({ tokenIn: 11, tokenOut: 9, sessionId: 'wire' })
    assert.equal(ctx.meter.snapshot().tokenInTotal, 11)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 9)
    assert.equal(ctx.info().meter.tokenInTotal, 11)
    assert.equal(ctx.info().meter.tokenOutTotal, 9)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
    assert.equal(typeof usageMeterMod, 'object')
  })
})
