import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const agentModUrl = pathToFileURL(
  path.join(here, '../packages/agent/dist/index.js'),
).href
const eventBusModUrl = pathToFileURL(
  path.join(here, '../packages/event-bus/dist/index.js'),
).href

describe('platform-gate K2', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {typeof import('../packages/agent/dist/index.js')} */
  let agent
  /** @type {typeof import('../packages/event-bus/dist/index.js')} */
  let eventBus

  beforeEach(async () => {
    platform = await import(platformModUrl)
    agent = await import(agentModUrl)
    eventBus = await import(eventBusModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('passthrough returns same data as exec', async () => {
    const gate = agent.createPassthroughGate()
    const payload = { quotes: [{ code: '600519', price: 1 }] }
    const obs = await gate.submit(
      { token: 'get_quotes', args: { code: '600519' } },
      async () => payload,
    )
    assert.equal(obs.ok, true)
    assert.equal(obs.data, payload)
    assert.equal(typeof obs.auditId, 'string')
    assert.ok(obs.auditId.length > 0)
  })

  it('passthrough keeps tool-level { error } in data with ok:true', async () => {
    const gate = agent.createPassthroughGate()
    const errPayload = { error: 'upstream failed' }
    const obs = await gate.submit(
      { token: 'broken_tool', args: {} },
      async () => errPayload,
    )
    assert.equal(obs.ok, true)
    assert.deepEqual(obs.data, errPayload)
  })

  it('every submit gets a unique auditId', async () => {
    const gate = agent.createPassthroughGate()
    const ids = new Set()
    for (let i = 0; i < 8; i++) {
      const obs = await gate.submit(
        { token: 'noop', args: { i } },
        async () => ({ i }),
      )
      ids.add(obs.auditId)
    }
    assert.equal(ids.size, 8)
  })

  it('createPlatformContext wires a non-null gate + meter', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
    assert.ok(ctx.gate)
    assert.equal(typeof ctx.gate.submit, 'function')
    assert.ok(ctx.meter)
    assert.equal(typeof ctx.meter.snapshot, 'function')
    assert.equal(typeof ctx.meter.listRecentDenials, 'function')
    assert.equal(typeof ctx.meter.recordUsage, 'function')
    const snap = ctx.meter.snapshot()
    assert.equal(snap.submitCount, 0)
    assert.equal(snap.errorCount, 0)
    assert.equal(snap.denyCount, 0)
    assert.equal(snap.recentDenialCount, 0)
    assert.equal(snap.tokenInTotal, 0)
    assert.equal(snap.tokenOutTotal, 0)
    assert.ok(Array.isArray(snap.recent))
    assert.deepEqual(ctx.meter.listRecentDenials(), [])
  })

  it('platform gate emits chat.tool.end with auditId + token', async () => {
    const ctx = platform.createPlatformContext()
    /** @type {Array<{ name: string, payload: Record<string, unknown> }>} */
    const seen = []
    const unsub = ctx.events.subscribe((env) => {
      seen.push({ name: env.name, payload: /** @type {Record<string, unknown>} */ (env.payload) })
    })

    const payload = { ok: true, value: 42 }
    const obs = await ctx.gate.submit(
      { token: 'get_instrument_snapshot', args: { symbol: '600519' } },
      async () => payload,
    )

    assert.equal(obs.ok, true)
    assert.equal(obs.data, payload)
    unsub()

    const end = seen.find((e) => e.name === eventBus.SystemEvents.chat.toolEnd)
    assert.ok(end)
    assert.equal(end.payload.auditId, obs.auditId)
    assert.equal(end.payload.token, 'get_instrument_snapshot')

    const snap = ctx.meter.snapshot()
    assert.equal(snap.submitCount, 1)
    assert.equal(snap.errorCount, 0)
    assert.equal(snap.recent.length, 1)
    assert.equal(snap.recent[0]?.auditId, obs.auditId)
    assert.equal(snap.recent[0]?.ok, true)
  })

  it('platform gate increments errorCount and rethrows when exec throws', async () => {
    const ctx = platform.createPlatformContext()
    await assert.rejects(
      () => ctx.gate.submit(
        { token: 'get_quotes', args: {} },
        async () => {
          throw new Error('boom')
        },
      ),
      /boom/,
    )
    const snap = ctx.meter.snapshot()
    assert.equal(snap.submitCount, 1)
    assert.equal(snap.errorCount, 1)
    assert.equal(snap.recent.length, 1)
    assert.equal(snap.recent[0]?.ok, false)
    assert.equal(typeof snap.recent[0]?.auditId, 'string')
  })
})
