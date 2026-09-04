import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('extension-host-worker Wave 13A', () => {
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
      // no shared ctx
    }
    platform.resetPlatformContextForTests()
  })

  it('real Worker: start → ping ok → callGateFromWorker increments meter → stop', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().hostWorker, 'stopped')
    assert.equal(ctx.info().abiVersion, '0.8.52-thin-a')

    const started = await ctx.extensions.host.start()
    assert.equal(started.ok, true, started.error)
    assert.equal(ctx.info().hostWorker, 'running')
    assert.equal(ctx.extensions.getHostSupervisor().status(), 'running')

    const ping = await ctx.extensions.host.ping()
    assert.equal(ping.ok, true, ping.error)

    const before = ctx.meter.snapshot().submitCount
    const obs = await ctx.extensions.host.callGateFromWorker('get_quotes', {
      code: '600519',
    })
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected observation ok')
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    await ctx.extensions.host.stop()
    assert.equal(ctx.info().hostWorker, 'stopped')

    const pingStopped = await ctx.extensions.host.ping()
    assert.equal(pingStopped.ok, false)
  })

  it('real Worker crash / terminate → crashed or stopped; server continues', async () => {
    const ctx = platform.createPlatformContext()
    const started = await ctx.extensions.host.start()
    assert.equal(started.ok, true, started.error)

    await ctx.extensions.getHostSupervisor().simulateCrash()
    await new Promise((r) => setTimeout(r, 120))
    const afterCrash = ctx.info().hostWorker
    assert.ok(
      afterCrash === 'crashed' || afterCrash === 'stopped',
      `expected crashed|stopped, got ${afterCrash}`,
    )

    // Parent process still healthy
    assert.equal(typeof ctx.meter.snapshot().submitCount, 'number')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')

    // Soft restart path
    const again = await ctx.extensions.host.start()
    assert.equal(again.ok, true, again.error)
    assert.equal(ctx.info().hostWorker, 'running')
    await ctx.extensions.host.stop()
    assert.equal(ctx.info().hostWorker, 'stopped')
  })

  it('in-process workerFactory MessageChannel still proves gate RPC', async () => {
    const events = (await import(
      pathToFileURL(path.join(here, '../packages/event-bus/dist/index.js')).href
    )).getEventDispatcher()
    const { gate, meter } = platform.createPlatformGate(events, {
      packs: platform.createPackRegistry(),
      packEnforce: false,
      maxSubmits: null,
    })
    const mgr = platform.createExtensionManager({
      events,
      gate,
      hostWorker: {
        workerFactory: () => platform.createInProcessHostWorkerHandle(),
      },
    })

    assert.equal(mgr.getHostSupervisor().status(), 'stopped')
    const started = await mgr.host.start()
    assert.equal(started.ok, true, started.error)
    assert.equal(mgr.getHostSupervisor().status(), 'running')

    const ping = await mgr.host.ping()
    assert.equal(ping.ok, true, ping.error)

    const before = meter.snapshot().submitCount
    const obs = await mgr.host.callGateFromWorker('data.quote', { x: 1 })
    assert.equal(obs.ok, true)
    assert.equal(meter.snapshot().submitCount, before + 1)

    await mgr.getHostSupervisor().simulateCrash()
    await new Promise((r) => setTimeout(r, 40))
    assert.equal(mgr.getHostSupervisor().status(), 'crashed')

    await mgr.host.stop()
    assert.equal(mgr.getHostSupervisor().status(), 'stopped')
  })
})
