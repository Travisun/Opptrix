import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPlatformApprovals helper (Wave 27A / C1)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('missing sessionId → ok:false sessionId required (C1 no global dump)', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformApprovals(ctx)
    assert.equal(result.ok, false)
    if (result.ok) throw new Error('expected fail')
    assert.equal(result.error, 'sessionId required')
  })

  it('empty list for session → ok with [] and approvalsPending matching info', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPlatformApprovals(ctx, {
      sessionId: 'sess-empty',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(Array.isArray(result.approvals))
    assert.equal(result.approvals.length, 0)
    assert.equal(result.approvalsPending, ctx.info().approvalsPending)
    assert.equal(result.approvalsPending, 0)
  })

  it('lists pending for sessionId; filters other sessions; custom origin', () => {
    const ctx = platform.createPlatformContext()
    const a = ctx.approval.request({
      sessionId: 'sess-a',
      kind: 'tool.exec',
      title: 'A',
    })
    const b = ctx.approval.request({
      sessionId: 'sess-b',
      kind: 'ask_user',
      title: 'B',
    })
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)

    const filtered = platform.admitPlatformApprovals(ctx, {
      sessionId: 'sess-a',
      origin: 'cli.diagnostic',
    })
    assert.equal(filtered.ok, true)
    if (!filtered.ok) throw new Error('expected ok')
    assert.equal(filtered.origin, 'cli.diagnostic')
    assert.ok(filtered.traceId.length > 0)
    assert.equal(filtered.approvals.length, 1)
    assert.equal(filtered.approvals[0]?.sessionId, 'sess-a')
    // Global pending count (not filtered length).
    assert.equal(filtered.approvalsPending, 2)
  })

  it('ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
