import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitCheckpointGet helper (Wave 36A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('save → admit get returns payload copy', () => {
    const ctx = platform.createPlatformContext()
    const { id } = ctx.checkpoint.save('sess-w36', { n: 1, label: 'hit' })

    const result = platform.admitCheckpointGet(ctx, id)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.deepEqual(result.payload, { n: 1, label: 'hit' })
  })

  it('unknown id → payload null', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitCheckpointGet(ctx, 'never-saved')
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.payload, null)
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
  })

  it('empty / blank id → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitCheckpointGet(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitCheckpointGet(ctx, '   ')
    assert.equal(blank.ok, false)
  })

  it('custom origin passed through; ABI is 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    const { id } = ctx.checkpoint.save('sess-origin', { ok: true })
    const result = platform.admitCheckpointGet(ctx, id, {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
