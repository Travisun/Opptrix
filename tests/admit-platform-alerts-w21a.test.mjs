import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformAlerts helper (Wave 21A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('empty ring → ok with [] and alertsPending 0', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformAlerts(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.alerts))
    assert.equal(result.alerts.length, 0)
    assert.equal(result.alertsPending, 0)
  })

  it('pushForTests alert → admit returns it; alertsPending >= 1', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(typeof ctx.alerts.pushForTests, 'function')
    const id = ctx.alerts.pushForTests({
      kind: 'diag.test',
      title: 'Wave 21A fixture',
      payload: { wave: '21a' },
    })
    assert.ok(typeof id === 'string' && id.length > 0)

    const result = platform.admitPlatformAlerts(ctx)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.alerts.length, 1)
    assert.equal(result.alerts[0]?.id, id)
    assert.equal(result.alerts[0]?.kind, 'diag.test')
    assert.equal(result.alerts[0]?.title, 'Wave 21A fixture')
    assert.ok(result.alertsPending >= 1)
    assert.equal(result.alertsPending, ctx.info().alertsPending)
  })

  it('ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
