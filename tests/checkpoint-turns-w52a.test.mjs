import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href
const agentModUrl = pathToFileURL(
  path.join(here, '../packages/agent/dist/index.js'),
).href
const userStoreModUrl = pathToFileURL(
  path.join(here, '../packages/user-store/dist/index.js'),
).href

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-cp-turns-w52-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  return (async () => {
    const { getUserDataStore } = await import(userStoreModUrl)
    getUserDataStore().close()
    try {
      return await fn()
    } finally {
      getUserDataStore().close()
      fs.rmSync(tmp, { recursive: true, force: true })
      if (prev == null) delete process.env.OPPTRIX_DATA_DIR
      else process.env.OPPTRIX_DATA_DIR = prev
    }
  })()
}

describe('checkpoint turns snapshot (Wave 52A)', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform
  /** @type {typeof import('../packages/agent/dist/index.js')} */
  let agentMod

  beforeEach(async () => {
    platform = await import(platformModUrl)
    agentMod = await import(agentModUrl)
    platform.resetPlatformContextForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
  })

  it('save via hooks includes bounded turns (cap + content truncate)', () => {
    const ctx = platform.createPlatformContext()
    const { CHECKPOINT_TURNS_CAP, CHECKPOINT_TURN_CONTENT_MAX, boundCheckpointTurns } = agentMod
    assert.equal(CHECKPOINT_TURNS_CAP, 32)
    assert.equal(CHECKPOINT_TURN_CONTENT_MAX, 8 * 1024)

    const fat = 'x'.repeat(CHECKPOINT_TURN_CONTENT_MAX + 500)
    /** @type {Array<{ role: string, content: string, at: string, toolsUsed?: string[] }>} */
    const turns = []
    for (let i = 0; i < CHECKPOINT_TURNS_CAP + 8; i++) {
      turns.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i === CHECKPOINT_TURNS_CAP + 7 ? fat : `t${i}`,
        at: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
        toolsUsed: ['heavy'],
      })
    }

    const sliced = boundCheckpointTurns(turns)
    assert.ok(sliced)
    assert.equal(sliced.length, CHECKPOINT_TURNS_CAP)
    assert.equal(sliced[0].content, 't8')
    assert.equal(sliced[sliced.length - 1].content.length, CHECKPOINT_TURN_CONTENT_MAX)
    assert.equal(sliced[0].toolsUsed, undefined)

    /** @type {import('../packages/agent/dist/turn-checkpoint.js').TurnCheckpointHooks} */
    const hooks = {
      save(snapshot) {
        ctx.checkpoint.save(snapshot.sessionId, { ...snapshot })
      },
    }
    const sessionId = 'sess-w52-cap'
    hooks.save({
      phase: 'assistant',
      sessionId,
      title: 'cap',
      messageCount: turns.length,
      turnCount: turns.length,
      at: '2026-01-01T00:00:00.000Z',
      turns: sliced,
    })
    const latest = ctx.checkpoint.latest(sessionId)
    assert.ok(latest)
    const payloadTurns = /** @type {{ turns?: unknown[] }} */ (latest.payload).turns
    assert.ok(Array.isArray(payloadTurns))
    assert.equal(payloadTurns.length, CHECKPOINT_TURNS_CAP)
  })

  it('hard restore with turns replaces transcript (precedence over turnCount)', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'live' })
      const now = new Date().toISOString()
      record.turns = [
        { role: 'user', content: 'live-u1', at: now },
        { role: 'assistant', content: 'live-a1', at: now },
        { role: 'user', content: 'live-u2', at: now },
        { role: 'assistant', content: 'live-a2', at: now },
      ]
      record.messages = [
        { role: 'user', content: 'live-u1' },
        { role: 'assistant', content: 'live-a1' },
        { role: 'user', content: 'live-u2' },
        { role: 'assistant', content: 'live-a2' },
      ]
      record.sessionMemory = {
        goal: 'g',
        constraints: '',
        entities: '',
        facts: '',
        decisions: '',
        openQuestions: '',
        rejected: '',
        workingState: '',
        updatedAt: now,
        sourceMessageCount: 4,
        compactVersion: 1,
      }
      store.save(record)

      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })

      ctx.checkpoint.save(record.id, {
        phase: 'assistant',
        sessionId: record.id,
        title: 'from-cp',
        model: 'cp:model',
        messageCount: 2,
        turnCount: 1,
        at: now,
        turns: [
          { role: 'user', content: 'snap-u', at: now },
          { role: 'assistant', content: 'snap-a', at: now },
        ],
      })

      const result = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        apply: true,
        confirm: true,
      })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.applied, true)
      assert.equal(result.truncated, true)

      const updated = store.get(record.id)
      assert.ok(updated)
      assert.equal(updated.title, 'from-cp')
      assert.equal(updated.model, 'cp:model')
      assert.equal(updated.turns.length, 2)
      assert.equal(updated.turns[0].content, 'snap-u')
      assert.equal(updated.turns[1].content, 'snap-a')
      assert.equal(updated.messages.length, 2)
      assert.equal(updated.messages[1].content, 'snap-a')
      // turnCount:1 must NOT win when turns present
      assert.notEqual(updated.turns.length, 1)
      assert.equal(updated.sessionMemory, null)
    })
  })

  it('soft path unchanged (applied:false; session not mutated)', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'soft' })
      const now = new Date().toISOString()
      record.turns = [{ role: 'user', content: 'keep', at: now }]
      record.messages = [{ role: 'user', content: 'keep' }]
      store.save(record)

      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })

      ctx.checkpoint.save(record.id, {
        phase: 'user',
        sessionId: record.id,
        title: 'would-change',
        messageCount: 1,
        turnCount: 1,
        at: now,
        turns: [{ role: 'user', content: 'replaced', at: now }],
      })

      const result = platform.admitCheckpointRestore(ctx, { sessionId: record.id })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.applied, false)
      assert.equal(result.note, 'soft_restore_no_engine_apply')
      assert.ok(result.checkpoint)
      assert.ok(Array.isArray(/** @type {{ turns?: unknown }} */ (result.checkpoint.payload).turns))

      const same = store.get(record.id)
      assert.ok(same)
      assert.equal(same.title, 'soft')
      assert.equal(same.turns[0].content, 'keep')
    })
  })

  it('without turns, turnCount truncate still works (W51)', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'trunc' })
      const now = new Date().toISOString()
      record.turns = [
        { role: 'user', content: 'u1', at: now },
        { role: 'assistant', content: 'a1', at: now },
        { role: 'user', content: 'u2', at: now },
      ]
      record.messages = [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u2' },
      ]
      store.save(record)
      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })
      ctx.checkpoint.save(record.id, {
        phase: 'assistant',
        sessionId: record.id,
        title: 'trunc',
        messageCount: 2,
        turnCount: 2,
        at: now,
      })
      const result = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        apply: true,
        confirm: true,
      })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.truncated, true)
      const updated = store.get(record.id)
      assert.ok(updated)
      assert.equal(updated.turns.length, 2)
      assert.equal(updated.turns[1].content, 'a1')
    })
  })

  it('C-CHECKPOINT-TURNS + ABI 0.8.52-thin-a', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'abi' })
      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })
      const now = '2026-01-01T00:00:00.000Z'
      ctx.checkpoint.save(record.id, {
        phase: 'assistant',
        sessionId: record.id,
        title: 'abi-turns',
        messageCount: 2,
        turnCount: 2,
        at: now,
        turns: [
          { role: 'user', content: 'u', at: now },
          { role: 'assistant', content: 'a', at: now },
        ],
      })
      const result = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        apply: true,
        confirm: true,
      })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.applied, true)
      const updated = store.get(record.id)
      assert.ok(updated)
      assert.equal(updated.turns.length, 2)
      assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.52-thin-a')
      assert.equal(ctx.abiVersion, '0.8.52-thin-a')
    })
  })
})
