/**
 * chat-attachments：deleteSession 级联清理 + 启动孤儿扫
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AgentEngine,
  deleteSessionAttachments,
  pruneOrphanChatAttachments,
  resetExpertCatalogServiceForTests,
  saveAttachment,
  listSessionAttachmentMetas,
} from '../packages/agent/dist/index.js'
import { resetBuiltinExpertCacheForTests } from '../packages/agent/dist/experts/local-json-provider.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'

function withTempStore(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-att-life-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  getUserDataStore().close()
  resetBuiltinExpertCacheForTests()
  resetExpertCatalogServiceForTests()
  return Promise.resolve()
    .then(() => fn(tmp))
    .finally(() => {
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

describe('deleteSessionAttachments', () => {
  it('removes session attachment directory after fake upload', async () => {
    await withTempStore(async (tmp) => {
      const sessionId = 'sess-keep-clean'
      const meta = saveAttachment({
        sessionId,
        name: 'note.png',
        mime: 'image/png',
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      })
      assert.ok(meta.id)
      assert.equal(listSessionAttachmentMetas(sessionId).length, 1)

      const sessionPath = path.join(tmp, 'chat-attachments', sessionId)
      assert.equal(fs.existsSync(sessionPath), true)

      assert.equal(deleteSessionAttachments(sessionId), true)
      assert.equal(fs.existsSync(sessionPath), false)
      assert.equal(listSessionAttachmentMetas(sessionId).length, 0)

      // idempotent
      assert.equal(deleteSessionAttachments(sessionId), false)
    })
  })
})

describe('pruneOrphanChatAttachments', () => {
  it('removes unknown session dirs and keeps known ones', async () => {
    await withTempStore(async (tmp) => {
      const keepId = 'sess-alive'
      const orphanId = 'sess-orphan-gone'
      saveAttachment({
        sessionId: keepId,
        name: 'a.png',
        mime: 'image/png',
        data: Buffer.from('keep'),
      })
      saveAttachment({
        sessionId: orphanId,
        name: 'b.png',
        mime: 'image/png',
        data: Buffer.from('drop'),
      })

      const root = path.join(tmp, 'chat-attachments')
      assert.equal(fs.existsSync(path.join(root, keepId)), true)
      assert.equal(fs.existsSync(path.join(root, orphanId)), true)

      const removed = pruneOrphanChatAttachments([keepId])
      assert.equal(removed, 1)
      assert.equal(fs.existsSync(path.join(root, keepId)), true)
      assert.equal(fs.existsSync(path.join(root, orphanId)), false)
      assert.equal(listSessionAttachmentMetas(keepId).length, 1)
      assert.equal(listSessionAttachmentMetas(orphanId).length, 0)

      assert.equal(pruneOrphanChatAttachments([keepId]), 0)
    })
  })
})

describe('AgentEngine.deleteSession cascades attachments', () => {
  it('deletes chat-attachments session dir when session is deleted', async () => {
    await withTempStore(async (tmp) => {
      const agent = makeEngine()
      const session = await agent.createSession({ title: '附件清理测' })
      saveAttachment({
        sessionId: session.id,
        name: 'shot.png',
        mime: 'image/png',
        data: Buffer.from('x'),
      })
      const sessionPath = path.join(tmp, 'chat-attachments', session.id)
      assert.equal(fs.existsSync(sessionPath), true)

      agent.deleteSession(session.id)
      assert.equal(fs.existsSync(sessionPath), false)
      assert.equal(agent.getSession(session.id), null)
    })
  })
})
