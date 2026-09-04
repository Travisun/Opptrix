import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitAndRememberJobWake ring (Wave 8)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('admitAndRemember fills ring and returns admit result', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitAndRememberJobWake(ctx, {
      sessionId: 'sess-a',
      text: 'wake',
      jobId: 'wake-1',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.envelope.origin, 'job.wake')
    assert.equal(result.envelope.jobId, 'wake-1')

    const recent = ctx.listRecentJobWakes()
    assert.equal(recent.length, 1)
    assert.equal(recent[0].traceId, result.traceId)
    assert.equal(recent[0].sessionId, 'sess-a')
    assert.equal(recent[0].jobId, 'wake-1')
    assert.equal(recent[0].origin, 'job.wake')
    assert.equal(ctx.info().jobWakesRecent, 1)
  })

  it('does not remember when admit fails', () => {
    const ctx = platform.createPlatformContext()
    const bad = platform.admitAndRememberJobWake(ctx, { sessionId: '  ' })
    assert.equal(bad.ok, false)
    assert.equal(ctx.listRecentJobWakes().length, 0)
    assert.equal(ctx.info().jobWakesRecent, 0)
  })

  it('cap 16 drops oldest (newest last)', () => {
    const ctx = platform.createPlatformContext()
    const cap = platform.JOB_WAKE_RING_CAP
    assert.equal(cap, 16)

    for (let i = 0; i < cap + 3; i += 1) {
      const r = platform.admitAndRememberJobWake(ctx, {
        sessionId: `s${i}`,
        jobId: `j${i}`,
      })
      assert.equal(r.ok, true)
    }

    const recent = ctx.listRecentJobWakes()
    assert.equal(recent.length, 16)
    assert.equal(ctx.info().jobWakesRecent, 16)
    // dropped 0,1,2 — first kept is s3
    assert.equal(recent[0].sessionId, 's3')
    assert.equal(recent[0].jobId, 'j3')
    assert.equal(recent[15].sessionId, 's18')
    assert.equal(recent[15].jobId, 'j18')
  })

  it('listRecentJobWakes returns copies (mutation-safe)', () => {
    const ctx = platform.createPlatformContext()
    platform.admitAndRememberJobWake(ctx, { sessionId: 's', jobId: 'j' })
    const a = ctx.listRecentJobWakes()
    a[0].sessionId = 'mutated'
    a.pop()
    const b = ctx.listRecentJobWakes()
    assert.equal(b.length, 1)
    assert.equal(b[0].sessionId, 's')
  })
})
