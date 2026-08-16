/**
 * AgentEngine contextUsage 内存缓存 — hit / miss / invalidate
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AgentEngine,
  resetExpertCatalogServiceForTests,
} from '../packages/agent/dist/index.js'
import { resetBuiltinExpertCacheForTests } from '../packages/agent/dist/experts/local-json-provider.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ctx-usage-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  getUserDataStore().close()
  resetBuiltinExpertCacheForTests()
  resetExpertCatalogServiceForTests()
  return fn().finally(() => {
    getUserDataStore().close()
    resetExpertCatalogServiceForTests()
    resetBuiltinExpertCacheForTests()
    fs.rmSync(tmp, { recursive: true, force: true })
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
  })
}

function makeEngine() {
  return new AgentEngine(new ResearchHub(), {
    defaultScorecard: 'balanced',
    defaultTopN: 10,
  })
}

test('getCachedSessionContextUsage miss returns null without compute', async () => {
  await withTempStore(async () => {
    const engine = makeEngine()
    const session = await engine.createSession({ title: '缓存测试' })
    assert.equal(engine.getCachedSessionContextUsage(session.id), null)
  })
})

test('empty session returns cacheHitPercent 0', async () => {
  await withTempStore(async () => {
    const engine = makeEngine()
    const session = await engine.createSession({ title: 'empty-cache' })
    const usage = await engine.getSessionContextUsage(session.id)
    assert.ok(usage)
    assert.equal(usage.cacheHitPercent, 0)
  })
})

test('getSessionContextUsage caches; hit returns same snapshot; invalidate clears', async () => {
  await withTempStore(async () => {
    const engine = makeEngine()
    const session = await engine.createSession({ title: '缓存测试' })

    const first = await engine.getSessionContextUsage(session.id)
    assert.ok(first)
    assert.equal(first.estimated, true)
    assert.ok(typeof first.usedTokens === 'number')
    assert.ok(typeof first.limitTokens === 'number')

    const cached = engine.getCachedSessionContextUsage(session.id)
    assert.equal(cached, first)

    const second = await engine.getSessionContextUsage(session.id)
    assert.equal(second, first)

    engine.clearSessionContextRef(session.id)
    assert.equal(engine.getCachedSessionContextUsage(session.id), null)

    const third = await engine.getSessionContextUsage(session.id)
    assert.ok(third)
    assert.notEqual(third, first)

    const forced = await engine.getSessionContextUsage(session.id, { force: true })
    assert.ok(forced)
    assert.notEqual(forced, third)
    assert.equal(engine.getCachedSessionContextUsage(session.id), forced)
  })
})

test('setProviders clears all contextUsage cache', async () => {
  await withTempStore(async () => {
    const engine = makeEngine()
    const session = await engine.createSession({ title: 'providers' })
    await engine.getSessionContextUsage(session.id)
    assert.ok(engine.getCachedSessionContextUsage(session.id))

    engine.setProviders([], undefined)
    assert.equal(engine.getCachedSessionContextUsage(session.id), null)
  })
})

test('deleteSession drops that session cache entry', async () => {
  await withTempStore(async () => {
    const engine = makeEngine()
    const a = await engine.createSession({ title: 'a' })
    const b = await engine.createSession({ title: 'b' })
    await engine.getSessionContextUsage(a.id)
    await engine.getSessionContextUsage(b.id)
    assert.ok(engine.getCachedSessionContextUsage(a.id))
    assert.ok(engine.getCachedSessionContextUsage(b.id))

    engine.deleteSession(a.id)
    assert.equal(engine.getCachedSessionContextUsage(a.id), null)
    assert.ok(engine.getCachedSessionContextUsage(b.id))
  })
})

test('chat emits done before resolving (no LLM configured path)', async () => {
  await withTempStore(async () => {
    const engine = makeEngine()
    engine.setProviders([], undefined)
    const session = await engine.createSession({ title: 'done-order' })
    const order = []
    await engine.chat(session.id, 'hello', undefined, {
      onProgress: (e) => {
        if (e.type === 'done') order.push('done')
      },
    })
    order.push('resolved')
    assert.deepEqual(order, ['done', 'resolved'])
  })
})
