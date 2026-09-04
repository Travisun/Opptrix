import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('checkpoint-latest Wave 16A', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('ABI is 0.9.0-phase-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
    assert.equal(ctx.abiVersion, '0.9.0-phase-a')
  })

  it('save 2 → latest is second (id+at+payload); get still payload-only', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w16'
    const first = ctx.checkpoint.save(sessionId, { n: 1, label: 'first' })
    const second = ctx.checkpoint.save(sessionId, { n: 2, label: 'second' })

    const latest = ctx.checkpoint.latest(sessionId)
    assert.ok(latest)
    assert.equal(latest.id, second.id)
    assert.notEqual(latest.id, first.id)
    assert.equal(typeof latest.at, 'string')
    assert.ok(latest.at.length > 0)
    assert.deepEqual(latest.payload, { n: 2, label: 'second' })

    // get remains payload-only (no id/at wrapper)
    const byGet = ctx.checkpoint.get(second.id)
    assert.deepEqual(byGet, { n: 2, label: 'second' })
    assert.equal(/** @type {Record<string, unknown> | null} */ (byGet)?.id, undefined)
  })

  it('empty / blank sessionId → null; unknown session → null', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.checkpoint.latest(''), null)
    assert.equal(ctx.checkpoint.latest('   '), null)
    assert.equal(ctx.checkpoint.latest('never-saved'), null)
  })

  it('latest payload is a copy (mutation does not affect store)', () => {
    const ctx = platform.createPlatformContext()
    const { id } = ctx.checkpoint.save('sess-copy', { k: 'v' })
    const latest = ctx.checkpoint.latest('sess-copy')
    assert.ok(latest)
    assert.equal(latest.id, id)
    latest.payload.k = 'mutated'
    assert.deepEqual(ctx.checkpoint.get(id), { k: 'v' })
    assert.deepEqual(ctx.checkpoint.latest('sess-copy')?.payload, { k: 'v' })
  })
})
