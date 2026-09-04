import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const indexSrcPath = path.join(here, '../apps/server/src/index.ts')

describe('admitChatBestEffort (Wave 20A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('successful admit increments listRecentChatAdmits / info.chatAdmitsRecent', () => {
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.listRecentChatAdmits().length, 0)
    assert.equal(ctx.info().chatAdmitsRecent, 0)

    const ok = platform.admitChatBestEffort(ctx, {
      text: '  hello chat  ',
      sessionId: 'sess-w20',
      origin: 'web.chat',
    })
    assert.equal(ok, true)

    const recent = ctx.listRecentChatAdmits()
    assert.equal(recent.length, 1)
    assert.equal(ctx.info().chatAdmitsRecent, 1)
    assert.equal(recent[0].sessionId, 'sess-w20')
    assert.equal(recent[0].origin, 'web.chat')
    assert.equal(typeof recent[0].traceId, 'string')
    assert.ok(recent[0].traceId.length > 0)
  })

  it('empty text → no-op, does not throw, ring unchanged', () => {
    const ctx = platform.createPlatformContext()
    const before = ctx.listRecentChatAdmits().length
    assert.equal(
      platform.admitChatBestEffort(ctx, { text: '   ', sessionId: 'sess' }),
      false,
    )
    assert.equal(
      platform.admitChatBestEffort(ctx, { text: '', sessionId: 'sess' }),
      false,
    )
    assert.equal(ctx.listRecentChatAdmits().length, before)
    assert.equal(ctx.info().chatAdmitsRecent, before)
  })

  it('when ingress.admit throws, helper swallows and returns false', () => {
    const ctx = platform.createPlatformContext()
    const throwing = {
      ingress: {
        admit() {
          throw new Error('ingress boom')
        },
      },
      rememberChatAdmit() {
        throw new Error('should not remember')
      },
    }
    assert.equal(
      platform.admitChatBestEffort(throwing, {
        text: 'hi',
        sessionId: 's-throw',
      }),
      false,
    )
    assert.equal(ctx.listRecentChatAdmits().length, 0)
  })

  it('HTTP chat routes wire admitChatBestEffort (source)', () => {
    const src = fs.readFileSync(indexSrcPath, 'utf8')
    assert.match(src, /admitChatBestEffort/)
    assert.match(src, /\/api\/sessions\/:id\/chat\/stream/)
    assert.match(src, /\/api\/sessions\/:id\/chat/)
    // Both primary routes call the helper before agent.chat
    const streamIdx = src.indexOf("'/api/sessions/:id/chat/stream'")
    const chatIdx = src.indexOf("'/api/sessions/:id/chat'")
    assert.ok(streamIdx > 0)
    assert.ok(chatIdx > streamIdx)
    const streamSlice = src.slice(streamIdx, chatIdx)
    assert.match(streamSlice, /admitChatBestEffort\s*\(\s*platform/)
    const chatSlice = src.slice(chatIdx, chatIdx + 1200)
    assert.match(chatSlice, /admitChatBestEffort\s*\(\s*platform/)
  })
})
