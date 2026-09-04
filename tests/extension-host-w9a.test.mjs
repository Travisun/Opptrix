import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const eventBusModUrl = pathToFileURL(
  path.join(here, '../packages/event-bus/dist/index.js'),
).href

describe('extension-host Wave 9A', () => {
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

  it('register → activate → run callGate → observation ok; meter.submitCount increases', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.register('ext-a', { trusted: true }).ok, true)
    assert.equal((await ctx.extensions.activate('ext-a')).ok, true)

    const before = ctx.meter.snapshot().submitCount
    const result = await ctx.extensions.run('ext-a', async (api) => {
      return api.callGate('get_quotes', { code: '600519' })
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    const obs = /** @type {{ ok: boolean, auditId?: string }} */ (result.data)
    assert.equal(obs.ok, true)
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(ctx.meter.snapshot().submitCount, before + 1)

    const info = ctx.info()
    assert.equal(info.extensions, 1)
    assert.equal(info.extensionsActive, 1)
    assert.equal(info.abiVersion, '0.8.52-thin-a')
  })

  it('run while inactive → ok:false without throw', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.register('ext-idle', { trusted: true }).ok, true)
    const result = await ctx.extensions.run('ext-idle', async () => ({ x: 1 }))
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('expected fail')
    assert.match(result.error, /not active/)
    assert.equal(ctx.extensions.list()[0]?.state, 'inactive')
  })

  it('work throws → ok:false + state error; bootScan clears to inactive', async () => {
    const ctx = platform.createPlatformContext()
    /** @type {string[]} */
    const crashed = []
    const unsub = ctx.events.subscribe((env) => {
      if (env.name === eventBus.SystemEvents.extension.crashed) {
        crashed.push(String(/** @type {{ id?: string }} */ (env.payload).id ?? ''))
      }
    })

    assert.equal(ctx.extensions.register('ext-boom', { trusted: true }).ok, true)
    assert.equal((await ctx.extensions.activate('ext-boom')).ok, true)

    const result = await ctx.extensions.run('ext-boom', async () => {
      throw new Error('boom-inside')
    })
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('expected fail')
    assert.match(result.error, /boom-inside/)
    const rec = ctx.extensions.list().find((r) => r.id === 'ext-boom')
    assert.equal(rec?.state, 'error')
    assert.match(String(rec?.error ?? ''), /boom-inside/)
    assert.deepEqual(crashed, ['ext-boom'])

    await assert.doesNotReject(() => ctx.extensions.bootScan())
    assert.equal(
      ctx.extensions.list().find((r) => r.id === 'ext-boom')?.state,
      'inactive',
    )
    unsub()
  })

  it('callGate is the only Host API path (no hub / agent / store)', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.register('ext-api', { trusted: true }).ok, true)
    assert.equal((await ctx.extensions.activate('ext-api')).ok, true)

    const result = await ctx.extensions.run('ext-api', async (api) => {
      const keys = Object.keys(api).sort()
      assert.deepEqual(keys, ['callGate'])
      assert.equal(typeof api.callGate, 'function')
      assert.equal(api.hub, undefined)
      assert.equal(api.agent, undefined)
      assert.equal(api.store, undefined)
      return { keys }
    })
    assert.equal(result.ok, true)
  })

  it('register rejects empty and duplicate; run timeout marks error', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.extensions.register('', { trusted: true }).ok, false)
    assert.equal(ctx.extensions.register('  ', { trusted: true }).ok, false)
    assert.equal(ctx.extensions.register('dup', { trusted: true }).ok, true)
    const dup = ctx.extensions.register('dup', { trusted: true })
    assert.equal(dup.ok, false)
    if (dup.ok) throw new Error('expected duplicate fail')
    assert.match(dup.error, /already registered/)

    assert.equal((await ctx.extensions.activate('dup')).ok, true)
    const timed = await ctx.extensions.run(
      'dup',
      async () => {
        await new Promise((r) => setTimeout(r, 200))
        return { late: true }
      },
      { timeoutMs: 30 },
    )
    assert.equal(timed.ok, false)
    if (timed.ok) throw new Error('expected timeout')
    assert.match(timed.error, /timeout/)
    assert.equal(ctx.extensions.list().find((r) => r.id === 'dup')?.state, 'error')
  })
})
