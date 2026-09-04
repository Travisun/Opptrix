import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('memory-facade Wave 12A', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('getWorking returns null before bind; fake reader normalizes snapshot', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.memory.getWorking('sess-a'), null)

    ctx.memory.bindWorkingSource((sessionId) => {
      if (sessionId !== 'sess-a') return null
      return {
        goal: 'analyze 600519',
        entities: '600519',
        facts: 'PE ~20',
        workingState: 'next: cashflow',
        updatedAt: '2026-01-01T00:00:00.000Z',
        compactVersion: 3,
        sourceMessageCount: 12,
      }
    })

    const snap = ctx.memory.getWorking('sess-a')
    assert.ok(snap)
    assert.equal(snap.goal, 'analyze 600519')
    assert.equal(snap.entities, '600519')
    assert.equal(snap.facts, 'PE ~20')
    assert.equal(snap.workingState, 'next: cashflow')
    assert.equal(snap.updatedAt, '2026-01-01T00:00:00.000Z')
    assert.equal(snap.compactVersion, 3)
    assert.equal(snap.sourceMessageCount, 12)
    assert.equal(snap.nonEmpty, true)
    assert.equal(ctx.memory.getWorking('other'), null)
  })

  it('getWorking marks empty meaningful fields as nonEmpty:false', () => {
    const ctx = platform.createPlatformContext()
    ctx.memory.bindWorkingSource(() => ({
      goal: '  ',
      entities: '',
      facts: '',
      workingState: '\t',
      updatedAt: '',
      compactVersion: 1,
      sourceMessageCount: 0,
    }))
    const snap = ctx.memory.getWorking('s')
    assert.ok(snap)
    assert.equal(snap.nonEmpty, false)
  })

  it('promote without provenance fails with provenance_required', () => {
    const ctx = platform.createPlatformContext()
    const denied = ctx.memory.promote({
      sessionId: 'sess-a',
      kind: 'fact',
      content: 'PE ~20',
    })
    assert.equal(denied.ok, false)
    if (denied.ok) throw new Error('expected deny')
    assert.equal(denied.denialCode, 'provenance_required')
    assert.match(denied.error, /provenance/)
    assert.equal(ctx.memory.listDurable().length, 0)
    assert.equal(ctx.info().memoryDurable, 0)

    const blankSource = ctx.memory.promote({
      sessionId: 'sess-a',
      kind: 'fact',
      content: 'PE ~20',
      provenance: { source: '   ' },
    })
    assert.equal(blankSource.ok, false)
    if (blankSource.ok) throw new Error('expected deny')
    assert.equal(blankSource.denialCode, 'provenance_required')
  })

  it('promote with provenance stores entry; listDurable filters by session', () => {
    const ctx = platform.createPlatformContext()
    const ok = ctx.memory.promote({
      sessionId: 'sess-a',
      kind: 'fact',
      content: 'PE ~20',
      provenance: { source: 'tool:get_quotes', ref: 'msg-1' },
    })
    assert.equal(ok.ok, true)
    if (!ok.ok) throw new Error('expected promote ok')
    assert.equal(typeof ok.id, 'string')
    assert.ok(ok.id.length > 0)

    const ok2 = ctx.memory.promote({
      sessionId: 'sess-b',
      kind: 'note',
      content: 'watchlist',
      provenance: { source: 'user', at: '2026-01-01T00:00:00.000Z' },
    })
    assert.equal(ok2.ok, true)

    assert.equal(ctx.info().memoryDurable, 2)
    const all = ctx.memory.listDurable()
    assert.equal(all.length, 2)
    const onlyA = ctx.memory.listDurable('sess-a')
    assert.equal(onlyA.length, 1)
    assert.equal(onlyA[0]?.id, ok.id)
    assert.equal(onlyA[0]?.kind, 'fact')
    assert.equal(onlyA[0]?.content, 'PE ~20')
    assert.equal(onlyA[0]?.provenance.source, 'tool:get_quotes')
    assert.equal(onlyA[0]?.provenance.ref, 'msg-1')
  })

  it('promote rejects when durable cap (256) is full', () => {
    const ctx = platform.createPlatformContext()
    for (let i = 0; i < platform.DURABLE_MEMORY_CAP; i += 1) {
      const r = ctx.memory.promote({
        sessionId: 'sess-cap',
        kind: 'bulk',
        content: `item-${i}`,
        provenance: { source: 'test' },
      })
      assert.equal(r.ok, true)
    }
    assert.equal(ctx.memory.listDurable().length, platform.DURABLE_MEMORY_CAP)
    const full = ctx.memory.promote({
      sessionId: 'sess-cap',
      kind: 'bulk',
      content: 'overflow',
      provenance: { source: 'test' },
    })
    assert.equal(full.ok, false)
    if (full.ok) throw new Error('expected full')
    assert.match(full.error, /full/i)
    assert.equal(ctx.info().memoryDurable, platform.DURABLE_MEMORY_CAP)
  })

  it('promote requires sessionId/kind/content', () => {
    const ctx = platform.createPlatformContext()
    const noSession = ctx.memory.promote({
      sessionId: '  ',
      kind: 'k',
      content: 'c',
      provenance: { source: 's' },
    })
    assert.equal(noSession.ok, false)

    const noKind = ctx.memory.promote({
      sessionId: 's',
      kind: '',
      content: 'c',
      provenance: { source: 's' },
    })
    assert.equal(noKind.ok, false)

    const noContent = ctx.memory.promote({
      sessionId: 's',
      kind: 'k',
      content: '  ',
      provenance: { source: 's' },
    })
    assert.equal(noContent.ok, false)
  })
})
