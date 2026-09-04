import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitResolveApproval helper (Wave 28A / C1)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('pending → resolve true → approvalsPending drops; note optional', () => {
    const ctx = platform.createPlatformContext()
    const created = ctx.approval.request({
      sessionId: 'sess-w28',
      kind: 'tool.exec',
      title: 'Wave 28A fixture',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')
    assert.equal(ctx.info().approvalsPending, 1)

    const result = platform.admitResolveApproval(ctx, created.id, {
      approved: true,
      note: ' ship it ',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.resolved, true)
    assert.equal(result.approvalsPending, 0)
    assert.equal(ctx.info().approvalsPending, 0)
    assert.equal(ctx.approval.list().length, 0)
  })

  it('matching sessionId resolves; mismatch → session_mismatch', () => {
    const ctx = platform.createPlatformContext()
    const created = ctx.approval.request({
      sessionId: 'sess-bind',
      kind: 'tool.exec',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    const bad = platform.admitResolveApproval(
      ctx,
      created.id,
      { approved: true },
      { sessionId: 'other-sess' },
    )
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected fail')
    assert.equal(bad.error, 'session_mismatch')
    assert.equal(ctx.info().approvalsPending, 1)

    const ok = platform.admitResolveApproval(
      ctx,
      created.id,
      { approved: false },
      { sessionId: 'sess-bind' },
    )
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected ok')
    assert.equal(ok.resolved, true)
    assert.equal(ctx.info().approvalsPending, 0)

    // queue.resolve bind
    const c2 = ctx.approval.request({
      sessionId: 'sess-q',
      kind: 'ask_user',
    })
    assert.equal(c2.ok, true)
    if (!c2.ok) throw new Error('expected request ok')
    assert.equal(
      ctx.approval.resolve(c2.id, { approved: true }, { sessionId: 'wrong' }),
      false,
    )
    assert.equal(
      ctx.approval.resolve(c2.id, { approved: true }, { sessionId: 'sess-q' }),
      true,
    )
  })

  it('unknown id → resolved false; already resolved → resolved false', () => {
    const ctx = platform.createPlatformContext()
    const missing = platform.admitResolveApproval(ctx, 'missing-approval-id', {
      approved: false,
    })
    assert.equal(missing.ok, true)
    if (!missing.ok) throw new Error('expected ok')
    assert.equal(missing.resolved, false)
    assert.equal(missing.approvalsPending, 0)

    const created = ctx.approval.request({
      sessionId: 'sess-w28b',
      kind: 'ask_user',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    const first = platform.admitResolveApproval(ctx, created.id, {
      approved: false,
    })
    assert.equal(first.ok, true)
    if (!first.ok) throw new Error('expected ok')
    assert.equal(first.resolved, true)
    assert.equal(first.approvalsPending, 0)

    const second = platform.admitResolveApproval(ctx, created.id, {
      approved: true,
    })
    assert.equal(second.ok, true)
    if (!second.ok) throw new Error('expected ok')
    assert.equal(second.resolved, false)
    assert.equal(second.approvalsPending, 0)
  })

  it('empty id / non-boolean approved → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const empty = platform.admitResolveApproval(ctx, '', { approved: true })
    assert.equal(empty.ok, false)
    if (empty.ok) throw new Error('expected fail')
    assert.ok(typeof empty.error === 'string' && empty.error.length > 0)

    const blank = platform.admitResolveApproval(ctx, '   ', { approved: true })
    assert.equal(blank.ok, false)

    const badApproved = platform.admitResolveApproval(
      ctx,
      'any-id',
      /** @type {{ approved: boolean }} */ ({ approved: 'yes' }),
    )
    assert.equal(badApproved.ok, false)
    if (badApproved.ok) throw new Error('expected fail')
    assert.ok(badApproved.error.includes('approved'))
  })

  it('custom origin passed through; ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    const created = ctx.approval.request({
      sessionId: 'sess-w28c',
      kind: 'tool.exec',
    })
    assert.equal(created.ok, true)
    if (!created.ok) throw new Error('expected request ok')

    const result = platform.admitResolveApproval(
      ctx,
      created.id,
      { approved: true },
      { origin: 'cli.diagnostic' },
    )
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
