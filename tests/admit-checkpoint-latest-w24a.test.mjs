import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitCheckpointLatest helper (Wave 24A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('save 2 → admit latest is second (id+at+payload)', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w24'
    ctx.checkpoint.save(sessionId, { n: 1 })
    const second = ctx.checkpoint.save(sessionId, { n: 2, label: 'newest' })

    const result = platform.admitCheckpointLatest(ctx, sessionId)
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(result.latest)
    assert.equal(result.latest.id, second.id)
    assert.equal(typeof result.latest.at, 'string')
    assert.deepEqual(result.latest.payload, { n: 2, label: 'newest' })
  })

  it('unknown session → latest null', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitCheckpointLatest(ctx, 'never-saved')
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.latest, null)
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
  })

  it('empty / blank sessionId → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitCheckpointLatest(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitCheckpointLatest(ctx, '   ')
    assert.equal(blank.ok, false)
  })

  it('ABI is 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
