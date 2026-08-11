/**
 * session-state ContextProjection disk + SQLite pointer + usagePercent/compacted
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  parseContextProjection,
  writeContextProjectionToDisk,
  readContextProjectionFromDisk,
  resolveContextProjectionPath,
  computeContextUsagePercent,
  installMicroProjection,
  hydrateContextProjection,
  contextProjectionToRef,
  isContextProjectionRef,
  CONTEXT_PROJECTION_PATH_KEY,
  SessionStore,
} from '../packages/agent/dist/index.js'
import { resolveUserDataRoot } from '../packages/shared/dist/index.js'
import { deleteSessionStateDirectory } from '../packages/agent-workspace/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-sess-state-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    getUserDataStore().close()
    await fn(tmp)
  } finally {
    getUserDataStore().close()
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

function longMessages() {
  const messages = []
  for (let i = 0; i < 20; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` })
  }
  return messages
}

test('computeContextUsagePercent clamps 0–100', () => {
  assert.equal(computeContextUsagePercent(62, 100), 62)
  assert.equal(computeContextUsagePercent(0, 100), 0)
  assert.equal(computeContextUsagePercent(150, 100), 100)
  assert.equal(computeContextUsagePercent(10, 0), 0)
})

test('parseContextProjection rejects invalid / accepts valid', () => {
  assert.equal(parseContextProjection(null), null)
  assert.equal(parseContextProjection({ schemaVersion: 2 }), null)
  assert.equal(parseContextProjection({
    schemaVersion: 1,
    messages: [{ role: 'user', content: 'hi' }],
    coveredCount: 1,
    keepRecent: 16,
    projectionVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  })?.coveredCount, 1)
})

test('projection dual-write lands under session-state not agent-workspace', async () => {
  await withTmpDataDir(async (tmp) => {
    assert.equal(resolveUserDataRoot(), tmp)
    const sessionId = 'proj-disk-1'
    const projection = installMicroProjection(longMessages(), longMessages(), 8, null)
    assert.ok(projection)
    writeContextProjectionToDisk(sessionId, projection)
    const filePath = resolveContextProjectionPath(sessionId)
    assert.match(filePath, /session-state/)
    assert.ok(!filePath.includes('agent-workspace'))
    assert.equal(filePath.startsWith(path.join(tmp, 'session-state')), true)
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'))
    assert.equal(raw.schemaVersion, 1)
    assert.ok(Array.isArray(raw.messages))
    const loaded = readContextProjectionFromDisk(sessionId)
    assert.ok(loaded)
    assert.equal(loaded.coveredCount, projection.coveredCount)
    assert.equal(loaded.projectionVersion, projection.projectionVersion)

    const usedTokens = 6200
    const limitTokens = 10000
    const payload = {
      usedTokens,
      limitTokens,
      remainingTokens: limitTokens - usedTokens,
      modelRef: 'p:m',
      estimated: true,
      usagePercent: computeContextUsagePercent(usedTokens, limitTokens),
      compacted: Boolean(loaded),
    }
    assert.equal(payload.usagePercent, 62)
    assert.equal(payload.compacted, true)
    assert.equal('messages' in payload, false)
    assert.equal('contextProjection' in payload, false)

    writeContextProjectionToDisk(sessionId, null)
    assert.equal(readContextProjectionFromDisk(sessionId), null)
  })
})

test('ContextProjectionRef pointer write / hydrate / fail-closed / delete', async () => {
  await withTmpDataDir(async () => {
    const projection = installMicroProjection(longMessages(), longMessages(), 8, null)
    assert.ok(projection)
    const ref = contextProjectionToRef(projection)
    assert.equal(ref.storage, 'disk')
    assert.equal(ref.pathKey, CONTEXT_PROJECTION_PATH_KEY)
    assert.equal(ref.compacted, true)
    assert.ok(isContextProjectionRef(ref))
    assert.equal(isContextProjectionRef(projection), false)

    const sessionId = 'proj-ptr-1'
    writeContextProjectionToDisk(sessionId, projection)
    const warm = hydrateContextProjection(sessionId, ref)
    assert.ok(warm.projection)
    assert.equal(warm.projection.coveredCount, projection.coveredCount)
    assert.equal(warm.needsPointerRewrite, false)

    // 旧全文：无盘时写盘 + 标记需改指针
    writeContextProjectionToDisk(sessionId, null)
    const backfill = hydrateContextProjection(sessionId, projection)
    assert.ok(backfill.projection)
    assert.equal(backfill.needsPointerRewrite, true)
    assert.ok(readContextProjectionFromDisk(sessionId))

    // 指针无盘 → fail-closed null
    writeContextProjectionToDisk(sessionId, null)
    const miss = hydrateContextProjection(sessionId, ref)
    assert.equal(miss.projection, null)

    writeContextProjectionToDisk(sessionId, projection)
    await deleteSessionStateDirectory(sessionId)
    assert.equal(readContextProjectionFromDisk(sessionId), null)
  })
})

test('SessionStore save persists pointer only; get hydrates full', async () => {
  await withTmpDataDir(async () => {
    const store = new SessionStore()
    const record = store.create('指针会话')
    const projection = installMicroProjection(longMessages(), longMessages(), 8, null)
    assert.ok(projection)
    record.contextProjection = projection
    store.save(record)

    const raw = getUserDataStore().getDocument('session', record.id)
    assert.ok(raw)
    assert.ok(isContextProjectionRef(raw.contextProjection))
    assert.equal('messages' in (raw.contextProjection ?? {}), false)
    assert.ok(readContextProjectionFromDisk(record.id))

    const loaded = store.get(record.id)
    assert.ok(loaded?.contextProjection)
    assert.equal(loaded.contextProjection.schemaVersion, 1)
    assert.ok(Array.isArray(loaded.contextProjection.messages))
    assert.equal(loaded.contextProjection.coveredCount, projection.coveredCount)

    // meta 不下发全文
    const meta = store.listAll().find(s => s.id === record.id)
    assert.ok(meta)
    assert.equal('contextProjection' in meta, false)

    // 旧全文回填：直接写 SQLite 全文，读时 hydrate + 改指针
    getUserDataStore().setDocument('session', record.id, {
      ...raw,
      contextProjection: projection,
    })
    writeContextProjectionToDisk(record.id, null)
    const migrated = store.get(record.id)
    assert.ok(migrated?.contextProjection?.messages)
    const after = getUserDataStore().getDocument('session', record.id)
    assert.ok(isContextProjectionRef(after?.contextProjection))
  })
})
