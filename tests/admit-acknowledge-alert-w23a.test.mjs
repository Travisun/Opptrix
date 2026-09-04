import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitAcknowledgeAlert helper (Wave 23A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('push alert → ack true → alertsPending drops', () => {
    const ctx = platform.createPlatformContext()
    const id = ctx.alerts.pushForTests({
      kind: 'diag.ack',
      title: 'Wave 23A fixture',
      payload: { wave: '23a' },
    })
    assert.ok(typeof id === 'string' && id.length > 0)
    assert.equal(ctx.info().alertsPending, 1)

    const result = platform.admitAcknowledgeAlert(ctx, id)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.acknowledged, true)
    assert.equal(result.alertsPending, 0)
    assert.equal(ctx.info().alertsPending, 0)
    assert.equal(ctx.alerts.list()[0]?.acknowledged, true)
  })

  it('unknown id → acknowledged false', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitAcknowledgeAlert(ctx, 'missing-alert-id')
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.acknowledged, false)
    assert.equal(result.alertsPending, 0)
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
  })

  it('empty id → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitAcknowledgeAlert(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitAcknowledgeAlert(ctx, '   ')
    assert.equal(blank.ok, false)
  })

  it('ABI is 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })
})
