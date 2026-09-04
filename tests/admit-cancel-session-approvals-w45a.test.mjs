import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitCancelSessionApprovals helper (Wave 45A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('pending for session → cancelled count; other sessions untouched', () => {
    const ctx = platform.createPlatformContext()
    const a1 = ctx.approval.request({
      sessionId: 'sess-w45',
      kind: 'tool.exec',
      title: 'Wave 45A a',
    })
    const a2 = ctx.approval.request({
      sessionId: 'sess-w45',
      kind: 'ask_user',
    })
    const other = ctx.approval.request({
      sessionId: 'sess-other',
      kind: 'tool.exec',
    })
    assert.equal(a1.ok, true)
    assert.equal(a2.ok, true)
    assert.equal(other.ok, true)
    if (!a1.ok || !a2.ok || !other.ok) throw new Error('expected request ok')
    assert.equal(ctx.info().approvalsPending, 3)

    const result = platform.admitCancelSessionApprovals(ctx, 'sess-w45')
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.cancelled, 2)
    assert.equal(result.approvalsPending, 1)
    assert.equal(ctx.info().approvalsPending, 1)
    assert.equal(ctx.approval.list('sess-w45').length, 0)
    assert.equal(ctx.approval.list('sess-other').length, 1)
  })

  it('no pending / already cancelled → cancelled 0', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitCancelSessionApprovals(ctx, 'never-had')
    assert.equal(empty.ok, true)
    if (!empty.ok) throw new Error('expected ok')
    assert.equal(empty.cancelled, 0)
    assert.equal(empty.approvalsPending, 0)

    const created = ctx.approval.request({
      sessionId: 'sess-w45b',
      kind: 'tool.exec',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    const first = platform.admitCancelSessionApprovals(ctx, 'sess-w45b')
    assert.equal(first.ok, true)
    if (!first.ok) throw new Error('expected ok')
    assert.equal(first.cancelled, 1)
    assert.equal(first.approvalsPending, 0)

    const second = platform.admitCancelSessionApprovals(ctx, 'sess-w45b')
    assert.equal(second.ok, true)
    if (!second.ok) throw new Error('expected ok')
    assert.equal(second.cancelled, 0)
    assert.equal(second.approvalsPending, 0)
  })

  it('empty sessionId → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitCancelSessionApprovals(ctx, '')
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitCancelSessionApprovals(ctx, '   ')
    assert.equal(blank.ok, false)
  })

  it('custom origin passed through; ABI is 0.8.43-w58', () => {
    const ctx = platform.createPlatformContext()
    const created = ctx.approval.request({
      sessionId: 'sess-w45c',
      kind: 'tool.exec',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    const result = platform.admitCancelSessionApprovals(
      ctx,
      'sess-w45c',
      { origin: 'cli.diagnostic' },
    )
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(result.cancelled, 1)
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    assert.equal(ctx.abiVersion, '0.8.43-w58')
  })
})
