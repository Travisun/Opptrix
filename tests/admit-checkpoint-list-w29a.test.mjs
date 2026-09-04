import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitCheckpointList helper (Wave 29A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('save 2 → admit list has both (id+at, order preserved)', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w29'
    const first = ctx.checkpoint.save(sessionId, { n: 1 })
    const second = ctx.checkpoint.save(sessionId, { n: 2, label: 'newest' })

    const result = platform.admitCheckpointList(ctx, sessionId)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.checkpoints.length, 2)
    assert.equal(result.checkpoints[0]?.id, first.id)
    assert.equal(result.checkpoints[1]?.id, second.id)
    assert.equal(typeof result.checkpoints[0]?.at, 'string')
    assert.equal(typeof result.checkpoints[1]?.at, 'string')
    assert.equal(Object.keys(result.checkpoints[0] ?? {}).sort().join(','), 'at,id')
  })

  it('unknown session → checkpoints []', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitCheckpointList(ctx, 'never-saved')
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.deepEqual(result.checkpoints, [])
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
  })

  it('empty / blank sessionId → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitCheckpointList(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitCheckpointList(ctx, '   ')
    assert.equal(blank.ok, false)
  })

  it('custom origin passed through; ABI is 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitCheckpointList(ctx, 'sess-origin', {
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
