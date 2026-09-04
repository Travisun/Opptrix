import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitPromoteMemory helper (Wave 37A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('promote → id + entry + memoryDurable 1; listDurable sees it', () => {
    const ctx = platform.createPlatformContext()
    const sessionId = 'sess-w37'

    const result = platform.admitPromoteMemory(ctx, {
      sessionId,
      kind: 'fact',
      content: 'PE ~20',
      provenance: { source: 'w37a-test', ref: 't1' },
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'web.diagnostic')
    assert.ok(result.traceId.length > 0)
    assert.ok(typeof result.id === 'string' && result.id.length > 0)
    assert.equal(result.entry.id, result.id)
    assert.equal(result.entry.sessionId, sessionId)
    assert.equal(result.entry.kind, 'fact')
    assert.equal(result.entry.content, 'PE ~20')
    assert.equal(result.entry.provenance.source, 'w37a-test')
    assert.equal(result.entry.provenance.ref, 't1')
    assert.equal(result.memoryDurable, 1)

    const listed = ctx.memory.listDurable(sessionId)
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, result.id)
  })

  it('missing provenance → ok:false denialCode provenance_required', () => {
    const ctx = platform.createPlatformContext()
    const noProv = platform.admitPromoteMemory(ctx, {
      sessionId: 'sess-w37-np',
      kind: 'note',
      content: 'x',
    })
    assert.equal(noProv.ok, false)
    if (noProv.ok) throw new Error('expected fail')
    assert.equal(noProv.denialCode, 'provenance_required')
    assert.ok(noProv.error.includes('provenance'))

    const blankSrc = platform.admitPromoteMemory(ctx, {
      sessionId: 'sess-w37-np',
      kind: 'note',
      content: 'x',
      provenance: { source: '   ' },
    })
    assert.equal(blankSrc.ok, false)
    if (blankSrc.ok) throw new Error('expected fail')
    assert.equal(blankSrc.denialCode, 'provenance_required')
    assert.equal(ctx.info().memoryDurable, 0)
  })

  it('empty sessionId / kind / content → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const emptySid = platform.admitPromoteMemory(ctx, {
      sessionId: '',
      kind: 'fact',
      content: 'c',
      provenance: { source: 's' },
    })
    assert.equal(emptySid.ok, false)

    const emptyKind = platform.admitPromoteMemory(ctx, {
      sessionId: 's',
      kind: '  ',
      content: 'c',
      provenance: { source: 's' },
    })
    assert.equal(emptyKind.ok, false)

    const emptyContent = platform.admitPromoteMemory(ctx, {
      sessionId: 's',
      kind: 'fact',
      content: '',
      provenance: { source: 's' },
    })
    assert.equal(emptyContent.ok, false)
  })

  it('custom origin passed through; ABI is 0.8.52-thin-a', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitPromoteMemory(
      ctx,
      {
        sessionId: 'sess-origin',
        kind: 'note',
        content: 'kept',
        provenance: { source: 'cli' },
      },
      { origin: 'cli.diagnostic' },
    )
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.origin, 'cli.diagnostic')
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
    assert.equal(ctx.abiVersion, '0.8.52-thin-a')
  })
})
