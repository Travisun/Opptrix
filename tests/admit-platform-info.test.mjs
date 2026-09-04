import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformInfo helper', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('admits with default origin and returns flat-ready info', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformInfo(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.info.abiVersion, platform.PLATFORM_ABI_VERSION)
    assert.equal(typeof result.info.meter.denyCount, 'number')
  })

  it('respects custom origin', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformInfo(ctx, { origin: 'cli.diagnostic' })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
  })
})
