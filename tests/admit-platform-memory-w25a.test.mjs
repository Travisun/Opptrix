import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformMemory helper (Wave 25A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('unbound working null + durableCount 0; promote then durableCount 1', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w25'

    const empty = platform.admitPlatformMemory(ctx, { sessionId })
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected ok')
    assert.equal(empty.origin, 'web.diagnostic')
    assert.ok(empty.traceId.length > 0)
    assert.equal(empty.working, null)
    assert.equal(empty.durableCount, 0)
    assert.equal(empty.memoryDurable, 0)

    const promoted = ctx.memory.promote({
      sessionId,
      kind: 'fact',
      content: 'PE ~20',
      provenance: { source: 'w25a-test' },
    })
    assert.equal(promoted.ok, true)

    const after = platform.admitPlatformMemory(ctx, { sessionId })
    assert.equal(after.ok, true)
    if (!after.ok) throw new Error('expected ok')
    assert.equal(after.working, null)
    assert.equal(after.durableCount, 1)
    assert.equal(after.memoryDurable, 1)
  })

  it('bound working snapshot returned; other session durableCount 0', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w25-work'
    ctx.memory.bindWorkingSource((sid) => {
      if (sid !== sessionId) return null
      return {
        goal: 'analyze',
        entities: '600519',
        facts: 'f',
        workingState: 'next',
        updatedAt: '2026-01-01T00:00:00.000Z',
        compactVersion: 1,
        sourceMessageCount: 2,
      }
    })
    ctx.memory.promote({
      sessionId,
      kind: 'note',
      content: 'kept',
      provenance: { source: 'w25a' },
    })

    const hit = platform.admitPlatformMemory(ctx, { sessionId })
    assert.equal(hit.ok, true)
    if (!hit.ok) throw new Error('expected ok')
    assert.ok(hit.working)
    assert.equal(
      /** @type {{ goal?: string }} */ (hit.working).goal,
      'analyze',
    )
    assert.equal(hit.durableCount, 1)
    assert.equal(hit.memoryDurable, 1)

    const other = platform.admitPlatformMemory(ctx, { sessionId: 'other' })
    assert.equal(other.ok, true)
    if (!other.ok) throw new Error('expected ok')
    assert.equal(other.working, null)
    assert.equal(other.durableCount, 0)
    assert.equal(other.memoryDurable, 1)
  })

  it('empty / blank sessionId → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitPlatformMemory(ctx, { sessionId: '' })
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitPlatformMemory(ctx, { sessionId: '   ' })
    assert.equal(blank.ok, false)
  })

  it('custom origin passed through; ABI is 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformMemory(ctx, {
      sessionId: 'sess-origin',
      origin: 'cli.diagnostic',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })
})
