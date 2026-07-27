import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROMPT_QUEUE_MAX_PER_SESSION,
  PROMPT_QUEUE_STORAGE_KEY,
  clearSessionPromptQueue,
  enqueueQueuedPrompt,
  listQueuedPrompts,
  normalizeQueuedPrompt,
  promoteQueuedPrompt,
  removeQueuedPrompt,
  resolveDrainAction,
  shiftQueuedPrompt,
  takeQueuedPromptById,
  writePromptQueueStore,
} from '../client-ui/src/chat/sessionPromptQueue.ts'

const SESSION = 'sess-test-queue'

function installMemoryLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    clear: () => { map.clear() },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
}

describe('sessionPromptQueue', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
    writePromptQueueStore({})
  })

  afterEach(() => {
    writePromptQueueStore({})
  })

  it('normalizes valid and rejects empty prompts', () => {
    assert.equal(normalizeQueuedPrompt(null), null)
    assert.equal(normalizeQueuedPrompt({ text: '  ' }), null)
    const ok = normalizeQueuedPrompt({ id: 'a', text: ' hello ', createdAt: 1 })
    assert.deepEqual(ok, { id: 'a', text: 'hello', createdAt: 1 })
  })

  it('enqueues, lists, removes, and clears by session', () => {
    const a = enqueueQueuedPrompt(SESSION, { text: '第一句' })
    assert.equal(a.ok, true)
    const b = enqueueQueuedPrompt(SESSION, { text: '第二句' })
    assert.equal(b.ok, true)
    assert.equal(listQueuedPrompts(SESSION).length, 2)

    removeQueuedPrompt(SESSION, a.ok ? a.item.id : '')
    assert.equal(listQueuedPrompts(SESSION).length, 1)
    assert.equal(listQueuedPrompts(SESSION)[0]?.text, '第二句')

    clearSessionPromptQueue(SESSION)
    assert.equal(listQueuedPrompts(SESSION).length, 0)
  })

  it('rejects when queue is full', () => {
    for (let i = 0; i < PROMPT_QUEUE_MAX_PER_SESSION; i += 1) {
      const r = enqueueQueuedPrompt(SESSION, { text: `t${i}` })
      assert.equal(r.ok, true)
    }
    const full = enqueueQueuedPrompt(SESSION, { text: 'overflow' })
    assert.equal(full.ok, false)
    if (!full.ok) assert.equal(full.reason, 'full')
    assert.equal(listQueuedPrompts(SESSION).length, PROMPT_QUEUE_MAX_PER_SESSION)
  })

  it('promotes item to front and shifts next', () => {
    enqueueQueuedPrompt(SESSION, { text: 'a' })
    enqueueQueuedPrompt(SESSION, { text: 'b' })
    const third = enqueueQueuedPrompt(SESSION, { text: 'c' })
    assert.equal(third.ok, true)
    if (!third.ok) return

    promoteQueuedPrompt(SESSION, third.item.id)
    assert.equal(listQueuedPrompts(SESSION)[0]?.id, third.item.id)

    const shifted = shiftQueuedPrompt(SESSION)
    assert.equal(shifted.item?.id, third.item.id)
    assert.equal(shifted.items.length, 2)
    assert.equal(shifted.items[0]?.text, 'a')
  })

  it('takeQueuedPromptById removes specific item', () => {
    const first = enqueueQueuedPrompt(SESSION, { text: 'a' })
    const second = enqueueQueuedPrompt(SESSION, { text: 'b' })
    assert.equal(first.ok && second.ok, true)
    if (!first.ok || !second.ok) return

    const taken = takeQueuedPromptById(SESSION, second.item.id)
    assert.equal(taken.item?.id, second.item.id)
    assert.equal(taken.items.length, 1)
    assert.equal(taken.items[0]?.id, first.item.id)
  })

  it('persists to localStorage key', () => {
    enqueueQueuedPrompt(SESSION, { text: 'persist-me' })
    const raw = localStorage.getItem(PROMPT_QUEUE_STORAGE_KEY)
    assert.ok(raw)
    const parsed = JSON.parse(raw)
    assert.equal(parsed[SESSION][0].text, 'persist-me')
  })
})

describe('resolveDrainAction', () => {
  it('skips when already streaming, pending ask, or stop intent', () => {
    assert.deepEqual(
      resolveDrainAction({ kind: 'auto' }, { hasPendingUserPrompt: false, alreadyStreaming: true }),
      { action: 'skip' },
    )
    assert.deepEqual(
      resolveDrainAction({ kind: 'auto' }, { hasPendingUserPrompt: true, alreadyStreaming: false }),
      { action: 'skip' },
    )
    assert.deepEqual(
      resolveDrainAction({ kind: 'none' }, { hasPendingUserPrompt: false, alreadyStreaming: false }),
      { action: 'skip' },
    )
  })

  it('shifts on auto and takes on runItem', () => {
    assert.deepEqual(
      resolveDrainAction({ kind: 'auto' }, { hasPendingUserPrompt: false, alreadyStreaming: false }),
      { action: 'shift' },
    )
    assert.deepEqual(
      resolveDrainAction(
        { kind: 'runItem', itemId: 'x' },
        { hasPendingUserPrompt: false, alreadyStreaming: false },
      ),
      { action: 'take', itemId: 'x' },
    )
  })
})
