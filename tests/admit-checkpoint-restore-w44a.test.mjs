import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitCheckpointRestore helper (Wave 44A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('save → restore by id returns payload; applied false', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w44'
    const { id } = ctx.checkpoint.save(sessionId, { n: 1, label: 'hit' })

    const result = platform.admitCheckpointRestore(ctx, {
      sessionId,
      checkpointId: id,
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(result.checkpoint)
    assert.equal(result.checkpoint.id, id)
    assert.equal(typeof result.checkpoint.at, 'string')
    assert.deepEqual(result.checkpoint.payload, { n: 1, label: 'hit' })
    assert.equal(result.applied, false)
    assert.equal(result.note, 'soft_restore_no_engine_apply')
  })

  it('omit checkpointId → latest for session; applied false', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w44-latest'
    ctx.checkpoint.save(sessionId, { n: 1 })
    const second = ctx.checkpoint.save(sessionId, { n: 2, label: 'newest' })

    const result = platform.admitCheckpointRestore(ctx, { sessionId })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.ok(result.checkpoint)
    assert.equal(result.checkpoint.id, second.id)
    assert.deepEqual(result.checkpoint.payload, { n: 2, label: 'newest' })
    assert.equal(result.applied, false)
    assert.equal(result.note, 'soft_restore_no_engine_apply')
  })

  it('unknown id / empty session → null or error; applied false on miss', () => {
    const ctx = platform.createPlatformContext()
    const miss = platform.admitCheckpointRestore(ctx, {
      sessionId: 'never-saved',
      checkpointId: 'no-such-id',
    })
    assert.equal(miss.ok, true)
    if (!miss.ok) throw new Error('expected ok')
    assert.equal(miss.checkpoint, null)
    assert.equal(miss.applied, false)
    assert.equal(miss.note, 'soft_restore_no_engine_apply')

    const emptyLatest = platform.admitCheckpointRestore(ctx, {
      sessionId: 'never-saved',
    })
    assert.equal(emptyLatest.ok, true)
    if (!emptyLatest.ok) throw new Error('expected ok')
    assert.equal(emptyLatest.checkpoint, null)
    assert.equal(emptyLatest.applied, false)

    const emptySid = platform.admitCheckpointRestore(ctx, { sessionId: '' })
    assert.equal(emptySid.ok, false)
    if (emptySid.ok) throw new Error('expected fail')
    assert.ok(typeof emptySid.error === 'string' && emptySid.error.length > 0)

    const blankSid = platform.admitCheckpointRestore(ctx, { sessionId: '   ' })
    assert.equal(blankSid.ok, false)
  })

  it('checkpointId belonging to another session → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const { id } = ctx.checkpoint.save('sess-owner', { n: 9 })
    const wrong = platform.admitCheckpointRestore(ctx, {
      sessionId: 'sess-other',
      checkpointId: id,
    })
    assert.equal(wrong.ok, false)
    if (wrong.ok) throw new Error('expected fail')
    assert.ok(typeof wrong.error === 'string' && wrong.error.length > 0)
  })

  it('custom origin passed through; ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-origin'
    ctx.checkpoint.save(sessionId, { ok: true })
    const result = platform.admitCheckpointRestore(
      ctx,
      { sessionId },
      { origin: 'cli.diagnostic' },
    )
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(result.applied, false)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
