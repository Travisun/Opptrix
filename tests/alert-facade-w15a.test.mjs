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

describe('alert-facade Wave 15A', () => {
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

  it('job.terminal via platform.events → list has alert', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.info().alertsPending, 0)
    assert.equal(ctx.alerts.list().length, 0)

    ctx.events.emit(eventBus.SystemEvents.job.terminal, {
      jobId: 'job-42',
      status: 'completed',
    })

    const listed = ctx.alerts.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.kind, 'job.terminal')
    assert.equal(listed[0]?.title, 'Job job-42 completed')
    assert.equal(listed[0]?.acknowledged, false)
    assert.equal(listed[0]?.payload.jobId, 'job-42')
    assert.equal(listed[0]?.payload.status, 'completed')
    assert.equal(ctx.info().alertsPending, 1)
  })

  it('acknowledge drops alertsPending; clear empties ring', () => {
    const ctx = platform.createPlatformContext()
    ctx.events.emit(eventBus.SystemEvents.job.terminal, {
      jobId: 'j1',
      status: 'failed',
    })
    const id = ctx.alerts.list()[0]?.id
    assert.ok(id)
    assert.equal(ctx.info().alertsPending, 1)

    assert.equal(ctx.alerts.acknowledge(id), true)
    assert.equal(ctx.alerts.list()[0]?.acknowledged, true)
    assert.equal(ctx.info().alertsPending, 0)
    assert.equal(ctx.alerts.list({ includeAcknowledged: false }).length, 0)
    assert.equal(ctx.alerts.list({ includeAcknowledged: true }).length, 1)

    ctx.alerts.clear()
    assert.equal(ctx.alerts.list().length, 0)
    assert.equal(ctx.info().alertsPending, 0)
  })

  it('extension.crashed also pushes alert', () => {
    const ctx = platform.createPlatformContext()
    ctx.events.emit(eventBus.SystemEvents.extension.crashed, {
      extensionId: 'ext-a',
      reason: 'worker exit',
    })
    const listed = ctx.alerts.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.kind, 'extension.crashed')
    assert.equal(listed[0]?.title, 'Extension ext-a crashed')
    assert.equal(ctx.info().alertsPending, 1)
  })

  it('ring cap drops oldest (ALERT_RING_CAP)', () => {
    const ctx = platform.createPlatformContext()
    const cap = platform.ALERT_RING_CAP
    assert.equal(cap, 64)
    for (let i = 0; i < cap + 3; i += 1) {
      ctx.events.emit(eventBus.SystemEvents.job.terminal, {
        jobId: `j-${i}`,
        status: 'completed',
      })
    }
    const listed = ctx.alerts.list()
    assert.equal(listed.length, cap)
    assert.equal(listed[0]?.payload.jobId, 'j-3')
    assert.equal(listed[listed.length - 1]?.payload.jobId, `j-${cap + 2}`)
  })

  it('list limit returns newest N', () => {
    const ctx = platform.createPlatformContext()
    for (let i = 0; i < 5; i += 1) {
      assert.ok(ctx.alerts.pushForTests)
      ctx.alerts.pushForTests({
        kind: 'manual',
        title: `t-${i}`,
        payload: { i },
      })
    }
    const last2 = ctx.alerts.list({ limit: 2 })
    assert.equal(last2.length, 2)
    assert.equal(last2[0]?.title, 't-3')
    assert.equal(last2[1]?.title, 't-4')
  })

  it('listener soft: emit still succeeds when alert push path is exercised', () => {
    const ctx = platform.createPlatformContext()
    assert.doesNotThrow(() => {
      ctx.events.emit(eventBus.SystemEvents.job.terminal, {
        jobId: 'soft',
        status: 'cancelled',
      })
    })
    assert.equal(ctx.alerts.list().length, 1)
  })
})
