/**
 * session-state ContextProjection disk dual-write + usagePercent/compacted
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
} from '../packages/agent/dist/index.js'
import { resolveUserDataRoot } from '../packages/shared/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-sess-state-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
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
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
      { role: 'assistant', content: 'f' },
      { role: 'user', content: 'g' },
      { role: 'assistant', content: 'h' },
      { role: 'user', content: 'i' },
      { role: 'assistant', content: 'j' },
      { role: 'user', content: 'k' },
      { role: 'assistant', content: 'l' },
      { role: 'user', content: 'm' },
      { role: 'assistant', content: 'n' },
      { role: 'user', content: 'o' },
      { role: 'assistant', content: 'p' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'r' },
      { role: 'user', content: 's' },
      { role: 'assistant', content: 't' },
    ]
    const projection = installMicroProjection(messages, messages, 8, null)
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

    // usagePercent / compacted 序列化形状（API 字段，非全文）
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
