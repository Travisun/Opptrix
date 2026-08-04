import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DocLibraryService,
  MIGRATION_STEPS,
  DOC_LIBRARY_SCHEMA_VERSION,
  detectAppliedSchemaVersion,
  migrateDocLibrarySchema,
  openDocLibraryDb,
  sha256Buffer,
  EmbeddingService,
  MockEmbeddingBackend,
  MemoryVectorStore,
  rrfFuse,
  isEmbeddingModelInstalled,
} from '../packages/doc-library/dist/index.js'

/** @type {import('../packages/doc-library/dist/index.js').ParseRunner} */
const fakeRunner = {
  engineId: 'pdf-extract-l0',
  engineVersion: 'test',
  async run(blob) {
    const tag = blob.toString('utf8')
    return {
      pageCount: 2,
      charCount: 120,
      markdown: `<!-- page:1 -->\n${tag}\n目标价 120 元\n\n<!-- page:2 -->\n风险提示`,
      chunks: [
        { page: 1, offset: 0, text: `${tag} 目标价 120 元 评级 买入` },
        { page: 2, offset: 30, text: `${tag} 风险提示 市场波动` },
      ],
    }
  },
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-doclib-'))
}

describe('doc-library schema', () => {
  it('MIGRATION_STEPS length matches DOC_LIBRARY_SCHEMA_VERSION', () => {
    assert.equal(MIGRATION_STEPS.length, DOC_LIBRARY_SCHEMA_VERSION)
  })

  it('migrate is idempotent', () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, 'doc-library.db')
    const db1 = openDocLibraryDb(dbPath)
    assert.equal(detectAppliedSchemaVersion(db1), DOC_LIBRARY_SCHEMA_VERSION)
    migrateDocLibrarySchema(db1)
    assert.equal(detectAppliedSchemaVersion(db1), DOC_LIBRARY_SCHEMA_VERSION)
    db1.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('migrates v1 library to v2 with embedded_at', async () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, 'doc-library.db')
    const { default: Database } = await import('better-sqlite3')
    const { MIGRATION_V1_SQL } = await import('../packages/doc-library/dist/index.js')
    const db = new Database(dbPath)
    db.exec(MIGRATION_V1_SQL)
    db.prepare('INSERT INTO schema_meta(version, applied_at) VALUES(1, ?)').run(new Date().toISOString())
    assert.equal(detectAppliedSchemaVersion(db), 1)
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), 2)
    const cols = db.prepare('PRAGMA table_info(chunks)').all()
    assert.ok(cols.some(c => c.name === 'embedded_at'))
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), 2)
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('doc-library ingest + FTS + session filter', () => {
  let dir = ''
  let svc = null

  before(() => {
    dir = tmpDir()
    process.env.OPPTRIX_DATA_DIR = dir
    const dbPath = path.join(dir, 'doc-library', 'doc-library.db')
    const db = openDocLibraryDb(dbPath)
    svc = new DocLibraryService(db)
    svc.setParseRunner(fakeRunner)
  })

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.OPPTRIX_DATA_DIR
  })

  async function waitReady(documentId) {
    for (let i = 0; i < 40; i++) {
      if (svc.getParseStatus(documentId)?.status === 'ready') return
      await new Promise(r => setTimeout(r, 25))
    }
  }

  it('reuses document on same SHA256', async () => {
    const data = Buffer.from('same-pdf-content-for-sha-test')
    const sha = sha256Buffer(data)

    const first = svc.ingestFromAttachment({
      sessionId: 'sess-a',
      attachmentId: 'att-1',
      name: 'report-a.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      data,
      source: 'import',
    })
    assert.equal(first.reused, false)
    assert.equal(first.contentSha256, sha)

    for (let i = 0; i < 30; i++) {
      const st = svc.getParseStatus(first.documentId)
      if (st?.status === 'ready') break
      await new Promise(r => setTimeout(r, 20))
    }
    assert.equal(svc.getParseStatus(first.documentId)?.status, 'ready')

    const second = svc.ingestFromAttachment({
      sessionId: 'sess-b',
      attachmentId: 'att-2',
      name: 'report-b.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      data,
      source: 'import',
    })
    assert.equal(second.reused, true)
    assert.equal(second.documentId, first.documentId)
    assert.equal(second.parseStatus, 'ready')
  })

  it('FTS search respects session filter', async () => {
    const dataA = Buffer.from('ALPHATERM999-only-in-session-a')
    const dataB = Buffer.from('BETATERM888-only-in-session-b')

    const ingA = svc.ingestFromAttachment({
      sessionId: 'sess-fts-a',
      attachmentId: 'att-a',
      name: 'a.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      data: dataA,
      source: 'import',
    })
    const ingB = svc.ingestFromAttachment({
      sessionId: 'sess-fts-b',
      attachmentId: 'att-b',
      name: 'b.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      data: dataB,
      source: 'import',
    })

    await waitReady(ingA.documentId)
    await waitReady(ingB.documentId)

    const hitsA = svc.searchFts('sess-fts-a', 'ALPHATERM999', { limit: 5 })
    assert.ok(hitsA.length >= 1)

    const hitsB = svc.searchFts('sess-fts-b', 'ALPHATERM999', { limit: 5 })
    assert.equal(hitsB.length, 0)

    const listA = svc.listSessionDocuments('sess-fts-a')
    assert.equal(listA.length, 1)
    assert.equal(listA[0].status, 'ready')

    const listB = svc.listSessionDocuments('sess-fts-b')
    assert.equal(listB.length, 1)
    assert.notEqual(listA[0].document_id, listB[0].document_id)
  })

  it('searchHybrid degrades to FTS when embedding unavailable', async () => {
    const data = Buffer.from('HYBRIDFALLBACK777 target price outlook')
    const ing = svc.ingestFromAttachment({
      sessionId: 'sess-hybrid',
      attachmentId: 'att-h',
      name: 'h.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      data,
      source: 'import',
    })
    await waitReady(ing.documentId)

    // 确保无可用 embedding 后端
    svc.setEmbeddingService(new EmbeddingService(new MockEmbeddingBackend(false)))
    assert.equal(svc.getEmbeddingService().isReady(), false)
    assert.equal(isEmbeddingModelInstalled(path.join(dir, 'models', 'multilingual-e5-small')), false)

    const fts = svc.searchFts('sess-hybrid', 'HYBRIDFALLBACK777', { limit: 5 })
    const hybrid = await svc.searchHybrid('sess-hybrid', 'HYBRIDFALLBACK777', { limit: 5 })
    assert.ok(fts.length >= 1)
    assert.equal(hybrid.length, fts.length)
    assert.equal(hybrid[0].chunk_id, fts[0].chunk_id)
  })

  it('searchHybrid RRF merges FTS + mock vectors', async () => {
    const data = Buffer.from('RRFFUSE555 semantic finance thesis')
    const ing = svc.ingestFromAttachment({
      sessionId: 'sess-rrf',
      attachmentId: 'att-rrf',
      name: 'rrf.pdf',
      mime: 'application/pdf',
      kind: 'pdf',
      data,
      source: 'import',
    })
    await waitReady(ing.documentId)

    const embedding = new EmbeddingService(new MockEmbeddingBackend(true))
    const store = new MemoryVectorStore()
    svc.setEmbeddingService(embedding)
    svc.setVectorStore(store)
    await svc.scheduleEmbed(ing.documentId)

    const hits = await svc.searchHybrid('sess-rrf', 'RRFFUSE555', { limit: 5 })
    assert.ok(hits.length >= 1)
    assert.ok(hits.some(h => h.excerpt.includes('RRFFUSE555') || h.chunk_id.includes(ing.documentId)))
  })
})

describe('doc-library rrf + e5 prefix contract', () => {
  it('rrfFuse ranks overlap higher', () => {
    const fused = rrfFuse(
      [
        [{ chunk_id: 'a' }, { chunk_id: 'b' }],
        [{ chunk_id: 'b' }, { chunk_id: 'c' }],
      ],
      { limit: 3 },
    )
    assert.equal(fused[0], 'b')
  })

  it('MockEmbeddingBackend uses query:/passage: prefixes distinctly', async () => {
    const backend = new MockEmbeddingBackend(true)
    const q = await backend.embedQuery('alpha')
    const p = (await backend.embedPassages(['alpha']))[0]
    assert.equal(q.length, 384)
    assert.equal(p.length, 384)
    // 前缀不同 → 向量不同
    assert.notDeepEqual(q, p)
  })
})
