import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

let dataDir = ''

describe('search and archive', { concurrency: false }, () => {
  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'opptrix-search-'))
    process.env.OPPTRIX_DATA_DIR = dataDir
  })

  after(async () => {
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    getUserDataStore().close()
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  test('default session archive folders are seeded', async () => {
  const { SessionArchiveFolderStore, DEFAULT_SESSION_ARCHIVE_FOLDERS } = await import(
    '../packages/agent/dist/archive-folders.js'
  )
  const store = new SessionArchiveFolderStore()
  const folders = store.ensureDefaults()
  assert.equal(folders.length, DEFAULT_SESSION_ARCHIVE_FOLDERS.length)
  assert.ok(folders.some(f => f.id === 'research' && f.title === '投研精选'))
})

test('listActive hides archived sessions', async () => {
  const { SessionStore } = await import('../packages/agent/dist/sessions.js')
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')

  const sessions = new SessionStore()
  const a = sessions.create('活跃对话')
  const b = sessions.create('待归档')
  sessions.archive(b.id, 'research')

  const active = sessions.listActive()
  assert.ok(active.some(s => s.id === a.id))
  assert.ok(!active.some(s => s.id === b.id))

  getUserDataStore().close()
})

test('archived session can move to another folder', async () => {
  const { SessionStore } = await import('../packages/agent/dist/sessions.js')
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')

  const sessions = new SessionStore()
  const s = sessions.create('已归档')
  sessions.archive(s.id, 'research')

  const moved = sessions.archive(s.id, 'trades')
  assert.ok(moved)
  assert.equal(moved.archiveFolderId, 'trades')
  assert.ok(moved.archivedAt)

  const grouped = sessions.listArchivedByFolderAll()
  const trades = grouped.find(g => g.folder.id === 'trades')
  assert.ok(trades?.sessions.some(x => x.id === s.id))

  getUserDataStore().close()
})

test('default folders can be cleared', async () => {
  const { SessionStore } = await import('../packages/agent/dist/sessions.js')
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')

  const sessions = new SessionStore()
  const a = sessions.create('A')
  const b = sessions.create('B')
  sessions.archive(a.id, 'review')
  sessions.archive(b.id, 'review')

  const result = sessions.clearArchiveFolder('review')
  assert.equal(result.ok, true)
  assert.equal(result.deletedCount, 2)
  assert.equal(sessions.listArchivedByFolderAll().find(g => g.folder.id === 'review')?.sessions.length, 0)

  getUserDataStore().close()
})

test('FTS indexes and searches session content', async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')

  const store = getUserDataStore()

  store.indexSessionSearch({
    session_id: 'sess-1',
    title: '宁德时代走势分析',
    body: '讨论动力电池龙头估值与产能扩张',
    archived: 0,
    archive_folder_id: '',
    updated_at: new Date().toISOString(),
  })
  store.indexSessionSearch({
    session_id: 'sess-2',
    title: '归档笔记',
    body: '宁德时代 季度财报',
    archived: 1,
    archive_folder_id: 'research',
    updated_at: new Date().toISOString(),
  })

  const hits = store.searchSessions('宁德时代', { limit: 10, includeArchived: true })
  assert.ok(hits.length >= 2)
  assert.ok(hits.some(h => h.session_id === 'sess-2'))

  store.close()
})

test('ensureIndexes pages session/news into FTS without holding full article arrays', async () => {
  // 独立临时库，避免本 suite 前序 close()/FTS 手工灌入干扰 INDEX_FLAG 与检索。
  const isolatedDir = await mkdtemp(join(tmpdir(), 'opptrix-ensure-idx-'))
  const prevDataDir = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = isolatedDir
  try {
    const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
    const { SessionStore } = await import('../packages/agent/dist/sessions.js')
    const { SearchHub } = await import('../packages/search-hub/dist/hub.js')
    const { getEnrichmentStore } = await import('../packages/article-enrichment/dist/index.js')

    // 若前序用例关过 singleton，这里重新打开到 isolatedDir
    try {
      getUserDataStore().close()
    } catch {
      /* already closed */
    }

    const store = getUserDataStore()
    const sessions = new SessionStore()
    const sess = sessions.create('ensure index session')
    const record = sessions.get(sess.id)
    assert.ok(record)
    record.turns.push({
      role: 'user',
      content: 'talk about TOKENBYD session body',
      at: new Date().toISOString(),
    })
    sessions.save(record)

    const articleId = 'news-fts-1'
    store.setDocument('news_article', articleId, {
      id: articleId,
      subscription_id: 'sub-1',
      title: 'TOKENNEWTITLE weekly',
      link: 'https://example.com/a1',
      pub_date: new Date().toISOString(),
      summary: 'summary mentions TOKENSUMMARY',
      content_html: '<p>body keyword <strong>TOKENLFP</strong> production</p>',
      source_title: 'TestSource',
    })
    getEnrichmentStore().save({
      article_id: articleId,
      status: 'ready',
      segments: [
        {
          id: 'seg-1',
          kind: 'html_text',
          text: 'enrichment TOKENSOLIDSTATE materials',
          anchor: { insert: 'append_block' },
          created_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
      version: 1,
    })

    const stubHub = {
      marketData: { searchStocks: () => [] },
    }
    const hub = new SearchHub(/** @type {any} */ (stubHub), sessions)
    hub.ensureIndexes()

    assert.equal(store.getMetaFlag('search_index_v1'), true)

    const result = hub.search('TOKENBYD', 10)
    assert.ok(result.sessions.some(h => h.id === sess.id))

    assert.ok(hub.search('TOKENNEWTITLE', 10).news.some(h => h.id === articleId))
    assert.ok(hub.search('TOKENLFP', 10).news.some(h => h.id === articleId))
    assert.ok(hub.search('TOKENSOLIDSTATE', 10).news.some(h => h.id === articleId))

    hub.ensureIndexes()
    assert.ok(hub.search('TOKENLFP', 5).news.some(h => h.id === articleId))

    store.close()
  } finally {
    process.env.OPPTRIX_DATA_DIR = prevDataDir
    await rm(isolatedDir, { recursive: true, force: true })
  }
})
})
