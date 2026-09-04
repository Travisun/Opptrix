import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformExtensions helper (Wave 35A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('empty catalog → ok with [] + extensionsActive 0 + hostWorker stopped', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformExtensions(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.extensions))
    assert.equal(result.extensions.length, 0)
    assert.equal(result.extensionsActive, 0)
    assert.equal(result.extensionsActive, ctx.info().extensionsActive)
    assert.equal(result.hostWorker, 'stopped')
    assert.equal(result.hostWorker, ctx.info().hostWorker)
  })

  it('register inactive → list includes record; active count stays 0', () => {
    const ctx = platform.createPlatformContext()
    const reg = ctx.extensions.register('ext-w35', { trusted: true })
    assert.equal(reg.ok, true)

    const result = platform.admitPlatformExtensions(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.extensions.length, 1)
    assert.equal(result.extensions[0]?.id, 'ext-w35')
    assert.equal(result.extensions[0]?.state, 'inactive')
    assert.equal(result.extensionsActive, 0)
    assert.equal(result.hostWorker, 'stopped')
  })

  it('activate → extensionsActive matches info(); custom origin', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.register('ext-active', { trusted: true }).ok, true)
    const act = await ctx.extensions.activate('ext-active')
    assert.equal(act.ok, true)

    const result = platform.admitPlatformExtensions(ctx, {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(result.extensionsActive, 1)
    assert.equal(result.extensionsActive, ctx.info().extensionsActive)
    assert.equal(result.extensions.find((r) => r.id === 'ext-active')?.state, 'active')
  })

  it('ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
