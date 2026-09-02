import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChatAskNotification,
  buildChatDoneNotification,
  dispatchOpenChatFromNotification,
  isAttendingChat,
  isAwayFromForeground,
  isChatTurnCompleteEvent,
  isWebNotificationSupported,
  maybeShowChatLocalNotification,
  OPPTRIX_OPEN_CHAT_EVENT,
  shouldNotify,
  truncateNotificationText,
} from '../client-ui/src/platform/chatNotifications.ts'

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

describe('web notification helpers', () => {
  const away = {
    activeSessionId: 'sess-1',
    view: 'chat',
    documentVisible: false,
    windowFocused: false,
  }

  it('isWebNotificationSupported is false without Notification in Node', () => {
    assert.equal(isWebNotificationSupported(), false)
  })

  it('maybeShowChatLocalNotification skips when attending (web or electron)', async () => {
    const attending = {
      activeSessionId: 'sess-1',
      view: 'chat',
      documentVisible: true,
      windowFocused: true,
    }
    const result = await maybeShowChatLocalNotification(
      'sess-1',
      attending,
      buildChatDoneNotification('sess-1', 't'),
    )
    assert.equal(result, 'skipped')
  })

  it('maybeShowChatLocalNotification skips web path when Notification unsupported', async () => {
    const result = await maybeShowChatLocalNotification(
      'sess-1',
      away,
      buildChatDoneNotification('sess-1', 't'),
    )
    assert.equal(result, 'skipped')
  })

  it('maybeShowChatLocalNotification shows via mocked Notification when not attending', async () => {
    const calls = []
    /** @type {Array<{ type: string, detail: unknown }>} */
    const events = []
    const FakeNotification = class {
      static permission = 'granted'
      static requestPermission = async () => 'granted'
      /**
       * @param {string} title
       * @param {NotificationOptions} [opts]
       */
      constructor(title, opts) {
        calls.push({ title, opts })
        this.onclick = null
      }
      close() {}
    }
    const g = globalThis
    const prevNotification = g.Notification
    const prevWindow = g.window
    g.Notification = FakeNotification
    g.window = {
      focus() {},
      dispatchEvent(ev) {
        events.push({ type: ev.type, detail: ev.detail })
        return true
      },
    }
    try {
      const result = await maybeShowChatLocalNotification(
        'sess-9',
        away,
        buildChatAskNotification('sess-9', '请确认'),
      )
      assert.equal(result, 'shown')
      assert.equal(calls.length, 1)
      assert.equal(calls[0].title, '需要你的确认')
      assert.equal(calls[0].opts?.tag, 'chat:ask:sess-9')
      assert.equal(typeof calls[0].opts?.silent, 'boolean')

      const n = new FakeNotification('x', {})
      n.onclick = () => {
        dispatchOpenChatFromNotification('sess-9')
      }
      n.onclick()
      assert.equal(events.some((e) => e.type === OPPTRIX_OPEN_CHAT_EVENT), true)
      const open = events.find((e) => e.type === OPPTRIX_OPEN_CHAT_EVENT)
      assert.deepEqual(open?.detail, { sessionId: 'sess-9' })
    } finally {
      if (prevNotification === undefined) delete g.Notification
      else g.Notification = prevNotification
      if (prevWindow === undefined) delete g.window
      else g.window = prevWindow
    }
  })

  it('maybeShowChatLocalNotification returns denied when permission denied', async () => {
    const FakeNotification = class {
      static permission = 'denied'
      static requestPermission = async () => 'denied'
      constructor() {
        throw new Error('should not construct')
      }
    }
    const g = globalThis
    const prev = g.Notification
    g.Notification = FakeNotification
    try {
      const result = await maybeShowChatLocalNotification(
        'sess-1',
        away,
        buildChatDoneNotification('sess-1'),
      )
      assert.equal(result, 'denied')
    } finally {
      if (prev === undefined) delete g.Notification
      else g.Notification = prev
    }
  })

  it('dispatchOpenChatFromNotification emits custom event', () => {
    const events = []
    const g = globalThis
    const prevWindow = g.window
    g.window = {
      focus() {},
      dispatchEvent(ev) {
        events.push(ev)
        return true
      },
    }
    try {
      dispatchOpenChatFromNotification('abc')
      assert.equal(events.length, 1)
      assert.equal(events[0].type, OPPTRIX_OPEN_CHAT_EVENT)
      assert.deepEqual(events[0].detail, { sessionId: 'abc' })
    } finally {
      if (prevWindow === undefined) delete g.window
      else g.window = prevWindow
    }
  })
})
