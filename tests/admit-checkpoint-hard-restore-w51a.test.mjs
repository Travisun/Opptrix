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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-cp-hard-w51-'))
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

describe('admitCheckpointRestore hard apply (Wave 51A)', () => {
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

  it('soft path still applied:false when hook is wired', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })
      const sessionId = 'sess-w51-soft'
      ctx.checkpoint.save(sessionId, {
        phase: 'assistant',
        sessionId,
        title: 'from-cp',
        model: 'p:m',
        messageCount: 2,
        turnCount: 2,
        at: '2026-01-01T00:00:00.000Z',
      })

      const result = platform.admitCheckpointRestore(ctx, { sessionId })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.applied, false)
      assert.equal(result.note, 'soft_restore_no_engine_apply')
      assert.equal(result.truncated, undefined)
    })
  })

  it('apply:true updates title/model', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'old-title', model: 'old:model' })
      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })

      const { id } = ctx.checkpoint.save(record.id, {
        phase: 'user',
        sessionId: record.id,
        title: 'restored-title',
        model: 'new:model',
        messageCount: 0,
        turnCount: 0,
        at: '2026-01-01T00:00:00.000Z',
      })

      const result = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        checkpointId: id,
        apply: true,
        confirm: true,
      })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.applied, true)
      assert.equal(result.truncated, false)
      assert.equal(result.note, 'hard_restore_metadata_applied')

      const updated = store.get(record.id)
      assert.ok(updated)
      assert.equal(updated.title, 'restored-title')
      assert.equal(updated.model, 'new:model')
    })
  })

  it('apply:true with turnCount truncates turns/messages', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'trunc' })
      const now = new Date().toISOString()
      record.turns = [
        { role: 'user', content: 'u1', at: now },
        { role: 'assistant', content: 'a1', at: now },
        { role: 'user', content: 'u2', at: now },
        { role: 'assistant', content: 'a2', at: now },
      ]
      record.messages = [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u2' },
        { role: 'assistant', content: 'a2' },
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
      assert.equal(result.applied, true)
      assert.equal(result.truncated, true)

      const updated = store.get(record.id)
      assert.ok(updated)
      assert.equal(updated.turns.length, 2)
      assert.equal(updated.turns[1].content, 'a1')
      assert.equal(updated.messages.length, 2)
      assert.equal(updated.messages[1].content, 'a1')
    })
  })

  it('apply:true without confirm → confirm_required (no apply)', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'need-confirm' })
      let applied = 0
      ctx.bindCheckpointApply({
        apply(input) {
          applied += 1
          return store.applyCheckpoint(input)
        },
      })
      ctx.checkpoint.save(record.id, {
        phase: 'user',
        sessionId: record.id,
        title: 'should-not-apply',
        model: 'x:y',
        messageCount: 0,
        turnCount: 0,
        at: '2026-01-01T00:00:00.000Z',
      })

      const missing = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        apply: true,
      })
      assert.equal(missing.ok, false)
      if (missing.ok) throw new Error('expected fail')
      assert.equal(missing.error, 'confirm_required')
      assert.equal(applied, 0)

      const falseConfirm = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        apply: true,
        confirm: false,
      })
      assert.equal(falseConfirm.ok, false)
      if (falseConfirm.ok) throw new Error('expected fail')
      assert.equal(falseConfirm.error, 'confirm_required')
      assert.equal(applied, 0)

      const same = store.get(record.id)
      assert.ok(same)
      assert.equal(same.title, 'need-confirm')
    })
  })

  it('missing session / missing checkpoint / unwired hook handled', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()

      const unwired = platform.admitCheckpointRestore(ctx, {
        sessionId: 'any',
        apply: true,
        confirm: true,
      })
      assert.equal(unwired.ok, false)
      if (unwired.ok) throw new Error('expected fail')
      assert.match(unwired.error, /checkpoint apply not wired/)

      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })

      const noCp = platform.admitCheckpointRestore(ctx, {
        sessionId: 'never-saved',
        apply: true,
        confirm: true,
      })
      assert.equal(noCp.ok, false)
      if (noCp.ok) throw new Error('expected fail')
      assert.match(noCp.error, /checkpoint not found/)

      ctx.checkpoint.save('ghost-sess', {
        phase: 'user',
        sessionId: 'ghost-sess',
        title: 'x',
        messageCount: 0,
        turnCount: 0,
        at: '2026-01-01T00:00:00.000Z',
      })
      const noSession = platform.admitCheckpointRestore(ctx, {
        sessionId: 'ghost-sess',
        apply: true,
        confirm: true,
      })
      assert.equal(noSession.ok, false)
      if (noSession.ok) throw new Error('expected fail')
      assert.match(noSession.error, /session not found/)
    })
  })

  it('C-CHECKPOINT-HARD-RESTORE + ABI 0.9.0-phase-a', async () => {
    await withTempStore(async () => {
      const ctx = platform.createPlatformContext()
      const store = new agentMod.SessionStore()
      const record = store.create({ title: 'abi' })
      ctx.bindCheckpointApply({
        apply(input) {
          return store.applyCheckpoint(input)
        },
      })
      ctx.checkpoint.save(record.id, {
        phase: 'user',
        sessionId: record.id,
        title: 'abi-title',
        model: 'abi:model',
        messageCount: 0,
        turnCount: 0,
        at: '2026-01-01T00:00:00.000Z',
      })
      const result = platform.admitCheckpointRestore(ctx, {
        sessionId: record.id,
        apply: true,
        confirm: true,
      })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error('expected ok')
      assert.equal(result.applied, true)
      assert.equal(platform.PLATFORM_ABI_VERSION, '0.9.0-phase-a')
      assert.equal(ctx.abiVersion, '0.9.0-phase-a')
    })
  })
})
