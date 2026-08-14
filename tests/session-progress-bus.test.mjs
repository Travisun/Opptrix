import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = join(import.meta.dirname, '..')

async function loadBus() {
  return import(pathToFileURL(join(repoRoot, 'apps/server/dist/session-progress-bus.js')).href)
}

describe('session-progress-bus', () => {
  /** @type {Awaited<ReturnType<typeof loadBus>> | null} */
  let bus = null

  afterEach(() => {
    bus?.resetSessionProgressBusForTests?.()
    bus = null
  })

  it('publish delivers to subscribers; unsubscribe stops delivery', async () => {
    bus = await loadBus()
    /** @type {unknown[]} */
    const events = []
    const unsub = bus.subscribeSessionProgress('sess-1', (e) => {
      events.push(e)
    })
    assert.equal(bus.sessionProgressListenerCountForTests('sess-1'), 1)

    bus.publishSessionProgress('sess-1', { type: 'thinking', label: '正在继续' })
    bus.publishSessionProgress('sess-other', { type: 'thinking', label: '忽略' })
    assert.equal(events.length, 1)
    assert.equal(/** @type {{ label?: string }} */ (events[0]).label, '正在继续')

    unsub()
    assert.equal(bus.sessionProgressListenerCountForTests('sess-1'), 0)
    bus.publishSessionProgress('sess-1', { type: 'thinking', label: '不应收到' })
    assert.equal(events.length, 1)
  })
})

/** 与 client-ui/src/chat/turnWakeCountdown.ts 同口径的合约测试（避免直载 Vite/TS） */
function formatWakeCountdownLabel(secondsLeft) {
  const s = Math.max(0, Math.floor(secondsLeft))
  if (s < 60) return `约 ${s} 秒后继续检查`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (r === 0) return `约 ${m} 分后继续检查`
  return `约 ${m} 分 ${r} 秒后继续检查`
}

describe('turnWakeCountdown label contract', () => {
  it('formats seconds / minutes', () => {
    assert.match(formatWakeCountdownLabel(45), /约 45 秒后继续检查/)
    assert.match(formatWakeCountdownLabel(90), /约 1 分 30 秒后继续检查/)
    assert.match(formatWakeCountdownLabel(120), /约 2 分后继续检查/)
  })
})
