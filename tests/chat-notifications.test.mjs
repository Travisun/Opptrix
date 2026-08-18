import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChatAskNotification,
  buildChatDoneNotification,
  isAttendingChat,
  isAwayFromForeground,
  isChatTurnCompleteEvent,
  shouldNotify,
  truncateNotificationText,
} from '../client-ui/src/platform/chatNotifications.ts'

const require = createRequire(import.meta.url)
const {
  mapDarwinAuthorizationStatus,
  sanitizeNotificationPayload,
} = require('../apps/desktop/electron/notifications.cjs')

describe('chat notification attention', () => {
  const attending = {
    activeSessionId: 'sess-1',
    view: 'chat',
    documentVisible: true,
    windowFocused: true,
  }

  it('isAttendingChat only when watching that chat session', () => {
    assert.equal(isAttendingChat('sess-1', attending), true)
    assert.equal(isAttendingChat('sess-2', attending), false)
    assert.equal(isAttendingChat('sess-1', { ...attending, view: 'news' }), false)
    assert.equal(isAttendingChat('sess-1', { ...attending, documentVisible: false }), false)
    assert.equal(isAttendingChat('sess-1', { ...attending, windowFocused: false }), false)
  })

  it('shouldNotify is inverse of attending', () => {
    assert.equal(shouldNotify('sess-1', attending), false)
    assert.equal(shouldNotify('sess-1', { ...attending, view: 'settings' }), true)
    assert.equal(shouldNotify('sess-2', attending), true)
  })

  it('awayDuringGeneration forces notify even when currently attending', () => {
    assert.equal(
      shouldNotify('sess-1', { ...attending, awayDuringGeneration: true }),
      true,
    )
    assert.equal(
      shouldNotify('sess-1', { ...attending, awayDuringGeneration: false }),
      false,
    )
  })

  it('isAwayFromForeground when hidden or blurred', () => {
    assert.equal(isAwayFromForeground({ documentVisible: true, windowFocused: true }), false)
    assert.equal(isAwayFromForeground({ documentVisible: false, windowFocused: true }), true)
    assert.equal(isAwayFromForeground({ documentVisible: true, windowFocused: false }), true)
  })
})

describe('isChatTurnCompleteEvent', () => {
  it('treats draft reply with content as incomplete', () => {
    assert.equal(
      isChatTurnCompleteEvent({ type: 'reply', content: 'hello', draft: true }),
      false,
    )
  })

  it('treats final reply without draft as incomplete', () => {
    assert.equal(
      isChatTurnCompleteEvent({ type: 'reply', content: 'hello' }),
      false,
    )
  })

  it('treats uncancelled done as complete', () => {
    assert.equal(isChatTurnCompleteEvent({ type: 'done' }), true)
    assert.equal(isChatTurnCompleteEvent({ type: 'done', cancelled: false }), true)
  })

  it('treats cancelled done as incomplete', () => {
    assert.equal(isChatTurnCompleteEvent({ type: 'done', cancelled: true }), false)
  })

  it('treats user_prompt and thinking as incomplete', () => {
    assert.equal(isChatTurnCompleteEvent({ type: 'user_prompt' }), false)
    assert.equal(isChatTurnCompleteEvent({ type: 'thinking' }), false)
  })
})

describe('chat notification builders', () => {
  it('buildChatDoneNotification uses copy and tag', () => {
    const payload = buildChatDoneNotification('abc_12', '贵州茅台投研')
    assert.equal(payload.title, '对话已生成完成')
    assert.equal(payload.body, '贵州茅台投研')
    assert.equal(payload.silent, true)
    assert.equal(payload.tag, 'chat:done:abc_12')
    assert.equal(payload.sessionId, 'abc_12')
    assert.equal(payload.kind, 'chat_done')
  })

  it('buildChatAskNotification truncates long body', () => {
    const long = '问'.repeat(200)
    const payload = buildChatAskNotification('s1', long)
    assert.equal(payload.title, '需要你的确认')
    assert.ok(payload.body)
    assert.ok((payload.body?.length ?? 0) <= 120)
    assert.equal(payload.silent, true)
    assert.equal(payload.tag, 'chat:ask:s1')
    assert.equal(payload.kind, 'chat_ask')
  })

  it('truncateNotificationText collapses whitespace', () => {
    assert.equal(truncateNotificationText('  a   b  '), 'a b')
    assert.equal(truncateNotificationText(''), '')
  })
})

describe('sanitizeNotificationPayload', () => {
  it('accepts valid chat payload', () => {
    const out = sanitizeNotificationPayload({
      title: '对话已生成完成',
      body: '摘要',
      silent: true,
      tag: 'chat:done:sess1',
      sessionId: 'sess1',
      kind: 'chat_done',
      extraIgnored: true,
    })
    assert.deepEqual(out, {
      title: '对话已生成完成',
      body: '摘要',
      silent: true,
      tag: 'chat:done:sess1',
      sessionId: 'sess1',
      kind: 'chat_done',
    })
  })

  it('rejects empty or overlong title', () => {
    assert.equal(sanitizeNotificationPayload({ title: '  ' }), null)
    assert.equal(sanitizeNotificationPayload({ title: 'x'.repeat(121) }), null)
  })

  it('drops invalid tag and sessionId', () => {
    const out = sanitizeNotificationPayload({
      title: '需要你的确认',
      tag: 'bad tag!',
      sessionId: '../evil',
      kind: 'chat_ask',
    })
    assert.equal(out?.title, '需要你的确认')
    assert.equal(out?.tag, undefined)
    assert.equal(out?.sessionId, undefined)
    assert.equal(out?.kind, 'chat_ask')
  })

  it('truncates body and ignores unknown kind', () => {
    const out = sanitizeNotificationPayload({
      title: 't',
      body: 'b'.repeat(250),
      kind: 'other',
    })
    assert.equal(out?.body?.length, 200)
    assert.equal(out?.kind, undefined)
  })
})

describe('mapDarwinAuthorizationStatus', () => {
  it('maps authorized family to granted', () => {
    assert.equal(mapDarwinAuthorizationStatus('authorized'), 'granted')
    assert.equal(mapDarwinAuthorizationStatus('provisional'), 'granted')
    assert.equal(mapDarwinAuthorizationStatus('temporary'), 'granted')
    assert.equal(mapDarwinAuthorizationStatus('ephemeral'), 'granted')
  })

  it('maps denied family to denied', () => {
    assert.equal(mapDarwinAuthorizationStatus('denied'), 'denied')
    assert.equal(mapDarwinAuthorizationStatus('restricted'), 'denied')
  })

  it('maps undetermined to default (never fake granted)', () => {
    assert.equal(mapDarwinAuthorizationStatus('not-determined'), 'default')
    assert.equal(mapDarwinAuthorizationStatus(''), 'default')
    assert.equal(mapDarwinAuthorizationStatus(undefined), 'default')
  })
})
