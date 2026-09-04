import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const shutdownModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/sidecar-shutdown.js'),
).href
const eventBusModUrl = pathToFileURL(
  path.join(here, '../packages/event-bus/dist/index.js'),
).href

describe('platform-context K1', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {typeof import('../packages/event-bus/dist/index.js')} */
  let eventBus

  beforeEach(async () => {
    platform = await import(platformModUrl)
    eventBus = await import(eventBusModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('createPlatformContext exposes abi + event bus stubs', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.abiVersion, platform.PLATFORM_ABI_VERSION)
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
    assert.ok(ctx.extensions)
    assert.equal(typeof ctx.extensions.list, 'function')
    assert.equal(typeof ctx.extensions.register, 'function')
    assert.equal(typeof ctx.extensions.activate, 'function')
    assert.equal(typeof ctx.extensions.run, 'function')
    assert.equal(typeof ctx.info().extensionsActive, 'number')
    assert.ok(ctx.packs)
    assert.equal(typeof ctx.packs.list, 'function')
    assert.equal(ctx.packs.isEnabled('research'), true)
    assert.ok(ctx.meter)
    assert.equal(typeof ctx.meter.snapshot, 'function')
    assert.ok(ctx.gate)
    assert.equal(typeof ctx.gate.submit, 'function')
    assert.ok(ctx.hands)
    assert.equal(typeof ctx.hands.issue, 'function')
    assert.equal(typeof ctx.hands.invoke, 'function')
    assert.equal(typeof ctx.info().handsTicketsPending, 'number')
    assert.ok(ctx.memory)
    assert.equal(typeof ctx.memory.getWorking, 'function')
    assert.equal(typeof ctx.memory.promote, 'function')
    assert.equal(typeof ctx.memory.listDurable, 'function')
    assert.equal(typeof ctx.info().memoryDurable, 'number')
    assert.ok(ctx.alerts)
    assert.equal(typeof ctx.alerts.list, 'function')
    assert.equal(typeof ctx.alerts.acknowledge, 'function')
    assert.equal(typeof ctx.alerts.clear, 'function')
    assert.equal(typeof ctx.info().alertsPending, 'number')
    assert.equal(typeof ctx.info().hostWorker, 'string')
    assert.equal(ctx.info().hostWorker, 'stopped')
    assert.equal(typeof ctx.extensions.host.start, 'function')
    assert.equal(typeof ctx.jobs.list, 'function')
    assert.equal(typeof ctx.jobs.cancel, 'function')
    assert.equal(typeof ctx.events.emit, 'function')
    assert.equal(typeof ctx.events.subscribe, 'function')

    const again = platform.createPlatformContext()
    assert.equal(again, ctx)
    assert.equal(platform.getPlatformContext(), ctx)
  })

  it('getPlatformContext throws before create', () => {
    assert.throws(() => platform.getPlatformContext(), /not created/)
  })

  it('emits app.startup / shuttingDown / shutdown via dispatcher', () => {
    const ctx = platform.createPlatformContext()
    /** @type {string[]} */
    const names = []
    const unsub = ctx.events.subscribe((env) => {
      names.push(env.name)
    })

    ctx.events.emit(eventBus.SystemEvents.app.startup, { at: 't0' })
    ctx.events.emit(eventBus.SystemEvents.app.shuttingDown, { signal: 'SIGTERM' })
    ctx.events.emit(eventBus.SystemEvents.app.shutdown, { signal: 'SIGTERM' })

    assert.deepEqual(names, [
      eventBus.SystemEvents.app.startup,
      eventBus.SystemEvents.app.shuttingDown,
      eventBus.SystemEvents.app.shutdown,
    ])
    unsub()
  })

  it('sidecar onShuttingDown runs before stopSchedulers; onShutdown after stores', async () => {
    const { runSidecarShutdown } = await import(shutdownModUrl)
    /** @type {string[]} */
    const steps = []

    await runSidecarShutdown({
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      forceExitMs: 60_000,
      settleMs: 0,
      onShuttingDown: () => {
        steps.push('onShuttingDown')
      },
      stopSchedulers: () => {
        steps.push('stopSchedulers')
      },
      closeBrowsers: async () => {
        steps.push('closeBrowsers')
      },
      closeHttpApp: async () => {
        steps.push('closeHttpApp')
      },
      unloadLlama: async () => {
        steps.push('unloadLlama')
      },
      closeDocLibrary: async () => {
        steps.push('closeDocLibrary')
      },
      closeMarketDuck: async () => {
        steps.push('closeMarketDuck')
      },
      closeMarketStore: () => {
        steps.push('closeMarketStore')
      },
      closeUserStore: () => {
        steps.push('closeUserStore')
      },
      onShutdown: () => {
        steps.push('onShutdown')
      },
      scheduleForceExit: (fn, ms) => setTimeout(fn, ms),
      clearForceExit: (t) => clearTimeout(t),
      exitProcess: (code) => {
        steps.push(`exit:${code}`)
      },
    })

    assert.deepEqual(steps, [
      'onShuttingDown',
      'stopSchedulers',
      'closeBrowsers',
      'closeHttpApp',
      'unloadLlama',
      'closeDocLibrary',
      'closeMarketDuck',
      'closeMarketStore',
      'closeUserStore',
      'onShutdown',
      'exit:0',
    ])
    assert.ok(steps.indexOf('onShuttingDown') < steps.indexOf('stopSchedulers'))
    assert.ok(steps.indexOf('closeUserStore') < steps.indexOf('onShutdown'))
    assert.ok(steps.indexOf('onShutdown') < steps.indexOf('exit:0'))
  })

  it('omitting optional hooks keeps backward-compatible order', async () => {
    const { runSidecarShutdown } = await import(shutdownModUrl)
    /** @type {string[]} */
    const steps = []

    await runSidecarShutdown({
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      forceExitMs: 60_000,
      settleMs: 0,
      stopSchedulers: () => {
        steps.push('stopSchedulers')
      },
      closeBrowsers: async () => {
        steps.push('closeBrowsers')
      },
      closeHttpApp: async () => {
        steps.push('closeHttpApp')
      },
      unloadLlama: async () => {
        steps.push('unloadLlama')
      },
      closeDocLibrary: async () => {
        steps.push('closeDocLibrary')
      },
      closeMarketDuck: async () => {
        steps.push('closeMarketDuck')
      },
      closeMarketStore: () => {
        steps.push('closeMarketStore')
      },
      closeUserStore: () => {
        steps.push('closeUserStore')
      },
      scheduleForceExit: (fn, ms) => setTimeout(fn, ms),
      clearForceExit: (t) => clearTimeout(t),
      exitProcess: (code) => {
        steps.push(`exit:${code}`)
      },
    })

    assert.deepEqual(steps, [
      'stopSchedulers',
      'closeBrowsers',
      'closeHttpApp',
      'unloadLlama',
      'closeDocLibrary',
      'closeMarketDuck',
      'closeMarketStore',
      'closeUserStore',
      'exit:0',
    ])
  })
})
