import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('platform meter soft usage (Wave 47A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('defaults token totals to 0; info exposes them', () => {
    const ctx = platform.createPlatformContext()
    const snap = ctx.meter.snapshot()
    assert.equal(snap.tokenInTotal, 0)
    assert.equal(snap.tokenOutTotal, 0)
    assert.equal(typeof ctx.meter.recordUsage, 'function')
    const infoMeter = ctx.info().meter
    assert.equal(infoMeter.tokenInTotal, 0)
    assert.equal(infoMeter.tokenOutTotal, 0)
  })

  it('recordUsage increments; info mirrors snapshot', () => {
    const ctx = platform.createPlatformContext()
    ctx.meter.recordUsage({ tokenIn: 100, tokenOut: 40, sessionId: 's1' })
    ctx.meter.recordUsage({ tokenIn: 10.9, tokenOut: 2.1 })
    const snap = ctx.meter.snapshot()
    assert.equal(snap.tokenInTotal, 110)
    assert.equal(snap.tokenOutTotal, 42)
    assert.equal(ctx.info().meter.tokenInTotal, 110)
    assert.equal(ctx.info().meter.tokenOutTotal, 42)
  })

  it('ignores negative / NaN / non-finite; clamps per-call delta', () => {
    const ctx = platform.createPlatformContext()
    const cap = platform.METER_USAGE_DELTA_CAP
    assert.equal(cap, 1_000_000)

    ctx.meter.recordUsage({ tokenIn: -1, tokenOut: Number.NaN })
    ctx.meter.recordUsage({ tokenIn: Number.POSITIVE_INFINITY, tokenOut: -0.5 })
    assert.equal(ctx.meter.snapshot().tokenInTotal, 0)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 0)

    ctx.meter.recordUsage({ tokenIn: cap + 50, tokenOut: cap + 1 })
    assert.equal(ctx.meter.snapshot().tokenInTotal, cap)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, cap)
  })

  it('C-METER-USAGE + ABI 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    ctx.meter.recordUsage({ tokenIn: 3, tokenOut: 7 })
    assert.equal(ctx.meter.snapshot().tokenInTotal, 3)
    assert.equal(ctx.meter.snapshot().tokenOutTotal, 7)
    assert.equal(ctx.info().meter.tokenInTotal, 3)
    assert.equal(ctx.info().meter.tokenOutTotal, 7)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
