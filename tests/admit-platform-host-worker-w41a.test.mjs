import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformHostWorker (Wave 41A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(async () => {
    try {
      const ctx = platform.getPlatformContext()
      await ctx.extensions.host.stop()
    } catch {
      // no shared ctx / already stopped
    }
    platform.resetPlatformContextForTests()
  })

  it('default → ok + hostWorker stopped; matches info()', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformHostWorker(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.hostWorker, 'stopped')
    assert.equal(result.hostWorker, ctx.info().hostWorker)
  })

  it('custom origin; after host.start → running', async () => {
    const ctx = platform.createPlatformContext()
    const started = await ctx.extensions.host.start()
    assert.equal(started.ok, true, started.error)

    const result = platform.admitPlatformHostWorker(ctx, {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(result.hostWorker, 'running')
    assert.equal(result.hostWorker, ctx.info().hostWorker)

    await ctx.extensions.host.stop()
  })

  it('C-HOST-WORKER-DIAG + ABI 0.8.52-thin-a', async () => {
    const ctx = platform.createPlatformContext()
    const before = platform.admitPlatformHostWorker(ctx)
    assert.equal(before.ok, true)
    if (!before.ok) throw new Error('expected ok')
    assert.equal(before.hostWorker, 'stopped')

    const started = await ctx.extensions.host.start()
    assert.equal(started.ok, true, started.error)
    const running = platform.admitPlatformHostWorker(ctx)
    assert.equal(running.ok, true)
    if (!running.ok) throw new Error('expected ok')
    assert.equal(running.hostWorker, 'running')
    assert.equal(running.hostWorker, ctx.info().hostWorker)

    await ctx.extensions.host.stop()
    const after = platform.admitPlatformHostWorker(ctx)
    assert.equal(after.ok, true)
    if (!after.ok) throw new Error('expected ok')
    assert.equal(after.hostWorker, 'stopped')

    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
