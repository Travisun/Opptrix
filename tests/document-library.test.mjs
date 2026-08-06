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
  setEmbeddingServiceForTests,
  setVectorStoreForTests,
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

const GRAPH_TABLES = [
  'entities',
  'edges',
  'graph_jobs',
  'graph_communities',
  'graph_community_members',
  'graph_community_documents',
]

function listGraphTables(db) {
  const placeholders = GRAPH_TABLES.map(() => '?').join(', ')
  return db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
  ).all(...GRAPH_TABLES).map(r => r.name).sort()
}

describe('doc-library schema', () => {
  it('MIGRATION_STEPS length matches DOC_LIBRARY_SCHEMA_VERSION', () => {
    assert.equal(MIGRATION_STEPS.length, DOC_LIBRARY_SCHEMA_VERSION)
    assert.equal(DOC_LIBRARY_SCHEMA_VERSION, 6)
  })

  it('migrate is idempotent', () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, 'doc-library.db')
    const db1 = openDocLibraryDb(dbPath)
    assert.equal(detectAppliedSchemaVersion(db1), DOC_LIBRARY_SCHEMA_VERSION)
    migrateDocLibrarySchema(db1)
    assert.equal(detectAppliedSchemaVersion(db1), DOC_LIBRARY_SCHEMA_VERSION)
    assert.deepEqual(listGraphTables(db1), [])
    const cols = db1.prepare('PRAGMA table_info(documents)').all()
    assert.ok(!cols.some(c => c.name === 'llm_graph_at'), 'llm_graph_at removed after v6')
    db1.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('migrates v1 library to latest without graph tables or llm_graph_at', async () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, 'doc-library.db')
    const { default: Database } = await import('better-sqlite3')
    const { MIGRATION_V1_SQL } = await import('../packages/doc-library/dist/index.js')
    const db = new Database(dbPath)
    db.exec(MIGRATION_V1_SQL)
    db.prepare('INSERT INTO schema_meta(version, applied_at) VALUES(1, ?)').run(new Date().toISOString())
    assert.equal(detectAppliedSchemaVersion(db), 1)
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), DOC_LIBRARY_SCHEMA_VERSION)
    const chunkCols = db.prepare('PRAGMA table_info(chunks)').all()
    assert.ok(chunkCols.some(c => c.name === 'embedded_at'))
    const docCols = db.prepare('PRAGMA table_info(documents)').all()
    assert.ok(docCols.some(c => c.name === 'source_type'))
    assert.ok(docCols.some(c => c.name === 'external_id'))
    assert.ok(!docCols.some(c => c.name === 'llm_graph_at'), 'v6 drops llm_graph_at')
    assert.deepEqual(listGraphTables(db), [])
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), DOC_LIBRARY_SCHEMA_VERSION)
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('v5 DROP removes legacy graph tables; v6 drops llm_graph_at', async () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, 'legacy-v4.db')
    const { default: Database } = await import('better-sqlite3')
    const {
      MIGRATION_V1_SQL,
    } = await import('../packages/doc-library/dist/index.js')
    const db = new Database(dbPath)
    db.exec(MIGRATION_V1_SQL)
    db.exec(`ALTER TABLE chunks ADD COLUMN embedded_at TEXT`)
    db.exec(`ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'report'`)
    db.exec(`ALTER TABLE documents ADD COLUMN external_id TEXT`)
    db.exec(`ALTER TABLE documents ADD COLUMN llm_graph_at TEXT`)
    db.exec(`
      CREATE TABLE entities (
        id TEXT NOT NULL PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_key TEXT NOT NULL UNIQUE,
        meta_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE edges (
        id TEXT NOT NULL PRIMARY KEY,
        from_entity_id TEXT NOT NULL,
        to_entity_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        document_id TEXT,
        chunk_id TEXT NOT NULL DEFAULT '',
        weight REAL NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'rule',
        meta_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE graph_jobs (
        id TEXT NOT NULL PRIMARY KEY,
        document_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );
      CREATE TABLE graph_communities (
        id TEXT NOT NULL PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        hub_key TEXT NOT NULL UNIQUE,
        hub_entity_id TEXT,
        document_count INTEGER NOT NULL DEFAULT 0,
        meta_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        summarized_at TEXT
      );
      CREATE TABLE graph_community_members (
        community_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        PRIMARY KEY (community_id, entity_id)
      );
      CREATE TABLE graph_community_documents (
        community_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        PRIMARY KEY (community_id, document_id)
      );
    `)
    const now = new Date().toISOString()
    for (const v of [1, 2, 3, 4]) {
      db.prepare('INSERT INTO schema_meta(version, applied_at) VALUES(?, ?)').run(v, now)
    }
    assert.ok(listGraphTables(db).length >= 4)
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), DOC_LIBRARY_SCHEMA_VERSION)
    assert.deepEqual(listGraphTables(db), [])
    const docs = db.prepare('PRAGMA table_info(documents)').all()
    assert.ok(!docs.some(c => c.name === 'llm_graph_at'), 'v6 drops llm_graph_at')
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), DOC_LIBRARY_SCHEMA_VERSION)
    assert.ok(!db.prepare('PRAGMA table_info(documents)').all().some(c => c.name === 'llm_graph_at'))
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('v6 drop llm_graph_at is idempotent from declared v5', async () => {
    const dir = tmpDir()
    const dbPath = path.join(dir, 'v5-with-col.db')
    const { default: Database } = await import('better-sqlite3')
    const { MIGRATION_V1_SQL } = await import('../packages/doc-library/dist/index.js')
    const db = new Database(dbPath)
    db.exec(MIGRATION_V1_SQL)
    db.exec(`ALTER TABLE chunks ADD COLUMN embedded_at TEXT`)
    db.exec(`ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'report'`)
    db.exec(`ALTER TABLE documents ADD COLUMN external_id TEXT`)
    db.exec(`ALTER TABLE documents ADD COLUMN llm_graph_at TEXT`)
    const now = new Date().toISOString()
    for (const v of [1, 2, 3, 4, 5]) {
      db.prepare('INSERT INTO schema_meta(version, applied_at) VALUES(?, ?)').run(v, now)
    }
    assert.ok(db.prepare('PRAGMA table_info(documents)').all().some(c => c.name === 'llm_graph_at'))
    assert.equal(detectAppliedSchemaVersion(db), 5)
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), 6)
    assert.ok(!db.prepare('PRAGMA table_info(documents)').all().some(c => c.name === 'llm_graph_at'))
    migrateDocLibrarySchema(db)
    assert.equal(detectAppliedSchemaVersion(db), 6)
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('doc-library hybrid without graph', () => {
  it('ingestFromText news embeds without graph tables', async () => {
    const dir = tmpDir()
    process.env.OPPTRIX_DATA_DIR = dir
    const store = new MemoryVectorStore()
    setVectorStoreForTests(store)
    const dbPath = path.join(dir, 'doc-library', 'news-ingest.db')
    const db = openDocLibraryDb(dbPath)
    assert.deepEqual(listGraphTables(db), [])
    const svc = new DocLibraryService(db)
    svc.setEmbeddingService(new EmbeddingService(new MockEmbeddingBackend(true)))
    svc.setVectorStore(store)

    const result = svc.ingestFromText({
      text: '今日贵州茅台(600519)获机构调研，维持买入评级。内容足够长用于入库校验。',
      name: '茅台获机构调研',
      sourceType: 'news',
      externalId: 'news-art-1',
    })
    assert.ok(result)
    assert.equal(result.parseStatus, 'ready')
    assert.equal(result.reused, false)

    for (let i = 0; i < 40; i++) {
      const chunks = db.prepare(`
        SELECT embedded_at FROM chunks WHERE document_id = ? LIMIT 1
      `).get(result.documentId)
      if (chunks?.embedded_at) break
      await new Promise(r => setTimeout(r, 25))
    }

    const doc = db.prepare(`
      SELECT source_type, external_id FROM documents WHERE id = ?
    `).get(result.documentId)
    assert.equal(doc.source_type, 'news')
    assert.equal(doc.external_id, 'news-art-1')
    assert.deepEqual(listGraphTables(db), [])

    const again = svc.ingestFromText({
      text: '今日贵州茅台(600519)获机构调研，维持买入评级。内容足够长用于入库校验。',
      name: '茅台获机构调研',
      sourceType: 'news',
      externalId: 'news-art-1',
    })
    assert.ok(again)
    assert.equal(again.documentId, result.documentId)
    assert.equal(again.reused, true)

    setVectorStoreForTests(null)
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.OPPTRIX_DATA_DIR
  })

  it('library hybrid + source_type prefilters and embeds', async () => {
    const dir = tmpDir()
    process.env.OPPTRIX_DATA_DIR = dir
    const store = new MemoryVectorStore()
    const emb = new EmbeddingService(new MockEmbeddingBackend(true))
    setVectorStoreForTests(store)
    setEmbeddingServiceForTests(emb)
    const dbPath = path.join(dir, 'doc-library', 'hybrid-src.db')
    const db = openDocLibraryDb(dbPath)
    const svc = new DocLibraryService(db)
    svc.setEmbeddingService(emb)
    svc.setVectorStore(store)

    const now = new Date().toISOString()
    for (const row of [
      { id: 'hy-r', sha: 'sha-hy-r', st: 'report', text: 'HYBRIDSRCREPORT111 semiconductor thesis' },
      { id: 'hy-n', sha: 'sha-hy-n', st: 'news', text: 'HYBRIDSRCNEWS222 market headline digest' },
    ]) {
      db.prepare(`
        INSERT INTO documents(
          id, content_sha256, name, mime, kind, byte_size, blob_path,
          source_type, external_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'text/plain', 'text', 10, '/t', ?, NULL, ?, ?)
      `).run(row.id, row.sha, row.id + '.txt', row.st, now, now)
      db.prepare(`
        INSERT INTO parse_artifacts(
          document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint
        ) VALUES (?, 'text-l0', 't', 'ready', 1, 40, NULL, NULL, ?, NULL)
      `).run(row.id, now)
      const chunkId = `${row.id}:c0`
      db.prepare(`
        INSERT INTO chunks(id, document_id, seq, page, offset, text, char_count, embedded_at)
        VALUES (?, ?, 0, 1, 0, ?, ?, NULL)
      `).run(chunkId, row.id, row.text, row.text.length)
      db.prepare(`INSERT INTO fts_chunks(chunk_id, document_id, text) VALUES (?, ?, ?)`)
        .run(chunkId, row.id, row.text)
      await svc.scheduleEmbed(row.id)
    }

    const reportHybrid = await svc.searchHybrid('', 'HYBRIDSRCREPORT111', {
      scope: 'library',
      sourceType: 'report',
      limit: 5,
    })
    assert.ok(reportHybrid.length >= 1)
    assert.equal(reportHybrid[0].document_id, 'hy-r')
    assert.ok(reportHybrid.every(h => h.document_id === 'hy-r'))

    // FTS 严格按 source_type 过滤；hybrid 预筛 documentIds 不得泄漏 news 文档
    const ftsCross = svc.searchFts('', 'HYBRIDSRCNEWS222', {
      scope: 'library',
      sourceType: 'report',
      limit: 5,
    })
    assert.equal(ftsCross.length, 0)

    const newsFilter = await svc.searchHybrid('', 'HYBRIDSRCNEWS222', {
      scope: 'library',
      sourceType: 'report',
      limit: 5,
    })
    assert.ok(newsFilter.every(h => h.document_id !== 'hy-n'), 'source_type 预筛不得返回 news 文档')

    const newsHit = await svc.searchHybrid('', 'HYBRIDSRCNEWS222', {
      scope: 'library',
      sourceType: 'news',
      limit: 5,
    })
    assert.ok(newsHit.length >= 1)
    assert.equal(newsHit[0].document_id, 'hy-n')
    assert.ok(newsHit.every(h => h.document_id === 'hy-n'))

    setEmbeddingServiceForTests(null)
    setVectorStoreForTests(null)
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.OPPTRIX_DATA_DIR
  })
})

describe('doc-library ingest + FTS + session filter', () => {
  let dir = ''
  let svc = null
  /** @type {import('better-sqlite3').Database | null} */
  let db = null

  before(() => {
    dir = tmpDir()
    process.env.OPPTRIX_DATA_DIR = dir
    // 避免 ingest 路径加载本机语义模型 / LanceDB（否则进程退出可能 SIGABRT）
    const memStore = new MemoryVectorStore()
    const mockEmb = new EmbeddingService(new MockEmbeddingBackend(false))
    setVectorStoreForTests(memStore)
    setEmbeddingServiceForTests(mockEmb)
    const dbPath = path.join(dir, 'doc-library', 'doc-library.db')
    db = openDocLibraryDb(dbPath)
    svc = new DocLibraryService(db)
    svc.setParseRunner(fakeRunner)
    svc.setVectorStore(memStore)
    svc.setEmbeddingService(mockEmb)
  })

  after(() => {
    setEmbeddingServiceForTests(null)
    setVectorStoreForTests(null)
    try { db?.close() } catch { /* ignore */ }
    db = null
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

  it('sync text-l0 for txt/csv/json without waiting async parse', () => {
    for (const [name, mime, body] of [
      ['notes.txt', 'text/plain', '纯文本附件正文足够长用于入库预览与检索'],
      ['table.csv', 'text/csv', 'col1,col2\na,b\nc,d\nenough_chars_here_ok'],
      ['data.json', 'application/json', '{"title":"demo","body":"enough characters for useful text"}'],
    ]) {
      const data = Buffer.from(body, 'utf8')
      const ing = svc.ingestFromAttachment({
        sessionId: `sess-text-${name}`,
        attachmentId: `att-${name}`,
        name,
        mime,
        kind: 'other',
        data,
        source: 'import',
      })
      assert.equal(ing.parseStatus, 'ready', name)
      assert.ok((ing.charCount ?? 0) >= 24, name)
      const st = svc.getParseStatus(ing.documentId)
      assert.equal(st?.status, 'ready', name)
      const artifact = svc.getRepository().getParseArtifact(ing.documentId)
      assert.equal(artifact?.engine_id, 'text-l0', name)
      const md = svc.getRepository().readMarkdown(ing.documentId)
      assert.ok(md && md.includes(body.slice(0, 8)), name)
    }
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

describe('doc-library library scope search', () => {
  let dir = ''
  let svc = null
  /** @type {import('better-sqlite3').Database | null} */
  let db = null

  before(() => {
    dir = tmpDir()
    process.env.OPPTRIX_DATA_DIR = dir
    const memStore = new MemoryVectorStore()
    const mockEmb = new EmbeddingService(new MockEmbeddingBackend(true))
    setVectorStoreForTests(memStore)
    setEmbeddingServiceForTests(mockEmb)
    const dbPath = path.join(dir, 'doc-library', 'doc-library-library.db')
    db = openDocLibraryDb(dbPath)
    svc = new DocLibraryService(db)
    svc.setParseRunner(fakeRunner)
    svc.setVectorStore(memStore)
    svc.setEmbeddingService(mockEmb)
  })

  after(() => {
    setEmbeddingServiceForTests(null)
    setVectorStoreForTests(null)
    try { db?.close() } catch { /* ignore */ }
    db = null
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.OPPTRIX_DATA_DIR
  })

  async function waitReady(documentId) {
    for (let i = 0; i < 40; i++) {
      if (svc.getParseStatus(documentId)?.status === 'ready') return
      await new Promise(r => setTimeout(r, 25))
    }
  }

  async function seedLibraryDoc(documentId, sha, name, sourceType, chunkText, linkSession) {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO documents(
        id, content_sha256, name, mime, kind, byte_size, blob_path,
        source_type, external_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'application/pdf', 'pdf', 10, '/tmp/x', ?, NULL, ?, ?)
    `).run(documentId, sha, name, sourceType, now, now)
    db.prepare(`
      INSERT INTO parse_artifacts(
        document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint
      ) VALUES (?, 'pdf-extract-l0', 't', 'ready', 1, 80, NULL, NULL, ?, NULL)
    `).run(documentId, now)
    const chunkId = `${documentId}:c0`
    db.prepare(`
      INSERT INTO chunks(id, document_id, seq, page, offset, text, char_count, embedded_at)
      VALUES (?, ?, 0, 1, 0, ?, ?, NULL)
    `).run(chunkId, documentId, chunkText, chunkText.length)
    db.prepare(`
      INSERT INTO fts_chunks(chunk_id, document_id, text) VALUES (?, ?, ?)
    `).run(chunkId, documentId, chunkText)
    if (linkSession) {
      db.prepare(`
        INSERT INTO session_documents(session_id, document_id, attachment_id, linked_at)
        VALUES (?, ?, ?, ?)
      `).run(linkSession.sessionId, documentId, linkSession.attachmentId, now)
    }
    await svc.scheduleEmbed(documentId)
    return chunkId
  }

  it('library FTS finds ready docs without session link', async () => {
    await seedLibraryDoc('lib-report-1', 'sha-lib-r1', 'report.pdf', 'report', 'LIBREPORT999 unique alpha thesis', null)
    await seedLibraryDoc('lib-news-1', 'sha-lib-n1', 'news.md', 'news', 'LIBNEWS888 market headline digest', null)

    const reportHits = svc.searchFts('', 'LIBREPORT999', { scope: 'library', limit: 5 })
    assert.ok(reportHits.length >= 1)
    assert.equal(reportHits[0].document_id, 'lib-report-1')
    assert.equal(reportHits[0].attachment_id, null)

    const newsHits = svc.searchFts('', 'LIBNEWS888', { scope: 'library', sourceType: 'news', limit: 5 })
    assert.ok(newsHits.length >= 1)
    assert.equal(newsHits[0].document_id, 'lib-news-1')

    const filtered = svc.searchFts('', 'LIBNEWS888', { scope: 'library', sourceType: 'report', limit: 5 })
    assert.equal(filtered.length, 0)
  })

  it('library FTS excludes non-ready parse artifacts', async () => {
    const now = new Date().toISOString()
    const documentId = 'lib-pending-1'
    db.prepare(`
      INSERT INTO documents(
        id, content_sha256, name, mime, kind, byte_size, blob_path,
        source_type, external_id, created_at, updated_at
      ) VALUES (?, 'sha-pend', 'pending.pdf', 'application/pdf', 'pdf', 10, '/tmp/x', 'report', NULL, ?, ?)
    `).run(documentId, now, now)
    db.prepare(`
      INSERT INTO parse_artifacts(
        document_id, engine_id, engine_version, status, page_count, char_count, md_path, error, ready_at, parse_fingerprint
      ) VALUES (?, 'pdf-extract-l0', 't', 'pending', NULL, NULL, NULL, NULL, NULL, NULL)
    `).run(documentId)
    const chunkId = `${documentId}:c0`
    db.prepare(`
      INSERT INTO chunks(id, document_id, seq, page, offset, text, char_count, embedded_at)
      VALUES (?, ?, 0, 1, 0, ?, ?, NULL)
    `).run(chunkId, documentId, 'PENDINGTERM777 should not appear', 28)
    db.prepare(`
      INSERT INTO fts_chunks(chunk_id, document_id, text) VALUES (?, ?, ?)
    `).run(chunkId, documentId, 'PENDINGTERM777 should not appear')

    const hits = svc.searchFts('', 'PENDINGTERM777', { scope: 'library', limit: 5 })
    assert.equal(hits.length, 0)
  })

  it('library hybrid searches full vector index without session', async () => {
    const chunkId = await seedLibraryDoc(
      'lib-hybrid-1',
      'sha-lib-h1',
      'hybrid.pdf',
      'report',
      'LIBHYBRID666 cross-session semantic target',
      null,
    )

    const ftsOnly = svc.searchFts('', 'LIBHYBRID666', { scope: 'library', limit: 5 })
    assert.ok(ftsOnly.length >= 1)

    const hybrid = await svc.searchHybrid('', 'LIBHYBRID666', { scope: 'library', limit: 5 })
    assert.ok(hybrid.length >= 1)
    assert.ok(hybrid.some(h => h.chunk_id === chunkId || h.excerpt.includes('LIBHYBRID666')))
    assert.equal(hybrid[0].attachment_id, null)
  })

  it('session scope still filters by session when doc exists in library', async () => {
    await seedLibraryDoc(
      'lib-sess-a',
      'sha-sa',
      'a.pdf',
      'report',
      'SESSIONSCOPE111 only in session a',
      { sessionId: 'lib-sess-a', attachmentId: 'att-a' },
    )
    await seedLibraryDoc(
      'lib-sess-b',
      'sha-sb',
      'b.pdf',
      'report',
      'SESSIONSCOPE222 only in session b',
      { sessionId: 'lib-sess-b', attachmentId: 'att-b' },
    )

    const hitsA = svc.searchFts('lib-sess-a', 'SESSIONSCOPE111', { limit: 5 })
    assert.ok(hitsA.length >= 1)
    const hitsCross = svc.searchFts('lib-sess-a', 'SESSIONSCOPE222', { limit: 5 })
    assert.equal(hitsCross.length, 0)

    const libHits = svc.searchFts('', 'SESSIONSCOPE111', { scope: 'library', limit: 5 })
    assert.ok(libHits.length >= 1)
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
