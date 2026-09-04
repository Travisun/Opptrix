import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformJobs helper (Wave 26A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('empty list → ok with [] and jobsListed matching info', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformJobs(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.jobs))
    assert.equal(result.jobsListed, ctx.info().jobsListed)
    assert.equal(result.jobs.length, result.jobsListed)
  })

  it('optional sessionId still ok; custom origin passed through', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformJobs(ctx, {
      sessionId: 'sess-w26',
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.jobs))
    assert.equal(result.jobsListed, ctx.info().jobsListed)
  })

  it('ABI is 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
