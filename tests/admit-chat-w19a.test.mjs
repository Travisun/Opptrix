import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('admitChat (Wave 19A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('admitChat with text+sessionId → ok, origin web.chat, sessionId + traceId', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitChat(ctx, {
      text: '  hello chat  ',
      sessionId: 'sess-chat-1',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.envelope.origin, 'web.chat')
    assert.equal(result.envelope.sessionId, 'sess-chat-1')
    assert.equal(result.envelope.text, 'hello chat')
    assert.equal(typeof result.traceId, 'string')
    assert.ok(result.traceId.length > 0)
    assert.equal(result.envelope.traceId, result.traceId)
  })

  it('missing sessionId → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const bad = platform.admitChat(ctx, { text: 'hi', sessionId: '  ' })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected deny')
    assert.match(String(bad.error), /sessionId/i)
    assert.equal(ctx.listRecentChatAdmits().length, 0)
  })

  it('empty text → ok:false', () => {
    const ctx = platform.createPlatformContext()
    const bad = platform.admitChat(ctx, { text: '   ', sessionId: 'sess' })
    assert.equal(bad.ok, false)
    if (bad.ok) throw new Error('expected deny')
    assert.match(String(bad.error), /text/i)
    assert.equal(ctx.listRecentChatAdmits().length, 0)
  })

  it('custom origin honored', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitChat(ctx, {
      text: 'ping',
      sessionId: 's1',
      origin: 'cli.chat',
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.equal(result.envelope.origin, 'cli.chat')
  })

  it('principal attached onto envelope copy', () => {
    const ctx = platform.createPlatformContext()
    const result = platform.admitChat(ctx, {
      text: 'hi',
      sessionId: 's-prin',
      principal: { kind: 'user', id: 'u1' },
    })
    assert.equal(result.ok, true)
    if (!result.ok) throw new Error('expected ok')
    assert.deepEqual(result.envelope.principal, { kind: 'user', id: 'u1' })
  })

  it('two admits → ring length 2; info.chatAdmitsRecent; cap 16', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.listRecentChatAdmits().length, 0)
    assert.equal(ctx.info().chatAdmitsRecent, 0)

    const a = platform.admitChat(ctx, { text: 'one', sessionId: 's-a' })
    const b = platform.admitChat(ctx, { text: 'two', sessionId: 's-b' })
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)

    const recent = ctx.listRecentChatAdmits()
    assert.equal(recent.length, 2)
    assert.equal(ctx.info().chatAdmitsRecent, 2)
    assert.equal(recent[0].sessionId, 's-a')
    assert.equal(recent[0].origin, 'web.chat')
    assert.equal(recent[1].sessionId, 's-b')
    if (a.ok) assert.equal(recent[0].traceId, a.traceId)
    if (b.ok) assert.equal(recent[1].traceId, b.traceId)

    const cap = platform.CHAT_ADMIT_RING_CAP
    assert.equal(cap, 16)
    for (let i = 0; i < cap + 3; i += 1) {
      const r = platform.admitChat(ctx, {
        text: `msg-${i}`,
        sessionId: `cap-${i}`,
      })
      assert.equal(r.ok, true)
    }
    const capped = ctx.listRecentChatAdmits()
    assert.equal(capped.length, 16)
    assert.equal(ctx.info().chatAdmitsRecent, 16)
    // prior 2 + first 3 of loop dropped → first kept is cap-3
    assert.equal(capped[0].sessionId, 'cap-3')
    assert.equal(capped[15].sessionId, 'cap-18')
  })
})
