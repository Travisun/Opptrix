import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('approval queue + admitJobWake (Wave 6A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('rejects when pending cap 64 is reached', () => {
    const q = platform.createApprovalQueue()
    for (let i = 0; i < 64; i += 1) {
      const r = q.request({ sessionId: 's', kind: `k${i}` })
      assert.equal(r.ok, true)
    }
    const overflow = q.request({ sessionId: 's', kind: 'overflow' })
    assert.equal(overflow.ok, false)
    if (overflow.ok) throw new Error('expected full')
    assert.match(overflow.error, /full/i)
    assert.equal(q.list().length, 64)
  })

  it('accepts custom id and rejects duplicate', () => {
    const q = platform.createApprovalQueue()
    const r1 = q.request({ sessionId: 's', kind: 'k', id: 'fixed-w6' })
    assert.equal(r1.ok, true)
    if (!r1.ok) throw new Error('expected ok')
    assert.equal(r1.id, 'fixed-w6')
    const r2 = q.request({ sessionId: 's', kind: 'k', id: 'fixed-w6' })
    assert.equal(r2.ok, false)
    if (r2.ok) throw new Error('expected duplicate')
    assert.equal(r2.error, 'duplicate approval id')
  })

  it('admitJobWake attaches jobId without starting chat', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitJobWake(ctx, {
      sessionId: 's1',
      jobId: 'j9',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.envelope.origin, 'job.wake')
    assert.equal(result.envelope.jobId, 'j9')
  })
})
