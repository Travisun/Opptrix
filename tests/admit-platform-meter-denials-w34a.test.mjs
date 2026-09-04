import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

const MAX_SUBMITS_ENV = 'OPPTRIX_PLATFORM_GATE_MAX_SUBMITS'

describe('admitPlatformMeterDenials helper (Wave 34A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {string | undefined} */
  let prevMaxSubmitsEnv

  beforeEach(async () => {
    prevMaxSubmitsEnv = process.env[MAX_SUBMITS_ENV]
    delete process.env[MAX_SUBMITS_ENV]
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    if (prevMaxSubmitsEnv === undefined) {
      delete process.env[MAX_SUBMITS_ENV]
    } else {
      process.env[MAX_SUBMITS_ENV] = prevMaxSubmitsEnv
    }
  })

  it('empty ring → ok with [] and zero counters', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformMeterDenials(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.denials))
    assert.equal(result.denials.length, 0)
    assert.equal(result.recentDenialCount, 0)
    assert.equal(result.denyCount, 0)
    assert.equal(result.submitCount, 0)
    assert.equal(result.errorCount, 0)
  })

  it('quota deny → admit returns denial; counters match meter snapshot', async () => {
    process.env[MAX_SUBMITS_ENV] = '1'
    platform.resetPlatformContextForTests()
    const ctx = platform.createPlatformContext()

    const first = await ctx.gate.submit(
      { token: 'ok', args: {} },
      async () => ({ ok: true }),
    )
    assert.equal(first.ok, true)

    const denied = await ctx.gate.submit(
      { token: 'quota-1', args: {} },
      async () => ({ should: 'not-run' }),
    )
    assert.equal(denied.ok, false)
    assert.equal(denied.denialCode, 'quota_exceeded')

    const snap = ctx.meter.snapshot()
    const result = platform.admitPlatformMeterDenials(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.denials.length, 1)
    assert.equal(result.denials[0]?.denialCode, 'quota_exceeded')
    assert.equal(result.denials[0]?.token, 'quota-1')
    assert.equal(result.recentDenialCount, snap.recentDenialCount)
    assert.equal(result.denyCount, snap.denyCount)
    assert.equal(result.submitCount, snap.submitCount)
    assert.equal(result.errorCount, snap.errorCount)
    assert.equal(result.recentDenialCount, 1)
    assert.equal(result.denyCount, 1)
  })

  it('custom origin passed through; ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformMeterDenials(ctx, {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
