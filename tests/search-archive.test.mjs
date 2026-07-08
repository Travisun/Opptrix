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
})
