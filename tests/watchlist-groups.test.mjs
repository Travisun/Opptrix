import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  emptyWatchlistGroupsDocument,
  normalizeWatchlistGroupsDocument,
  WatchlistGroupsStore,
  WatchlistManager,
  watchlistItemKey,
} from '../packages/a-stock-layer/dist/index.js'
import { getUserDataStore } from '../packages/user-store/dist/index.js'
import { pickTestPort, stopProcess, waitForUrl } from './helpers.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

describe('watchlist groups document', () => {
  it('normalizes groups and prunes invalid membership', () => {
    const doc = normalizeWatchlistGroupsDocument({
      groups: [
        { id: 'b', title: 'B组', sortOrder: 1 },
        { id: 'a', title: 'A组', sortOrder: 0 },
        { id: 'a', title: '重复', sortOrder: 2 },
      ],
      membership: {
        'CN:SH.600519': ['a', 'missing'],
        '': ['a'],
        bad: 'not-array',
      },
    })
    assert.equal(doc.groups.length, 2)
    assert.equal(doc.groups[0]?.id, 'a')
    assert.deepEqual(doc.membership['CN:SH.600519'], ['a'])
    assert.equal(doc.membership.missing, undefined)
  })

  it('empty document defaults are stable', () => {
    const empty = emptyWatchlistGroupsDocument()
    assert.deepEqual(empty, { groups: [], membership: {} })
  })
})

describe('watchlist groups store isolation', () => {
  let tmpDir = ''

  it('setup temp data dir', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-watchlist-groups-'))
    process.env.OPPTRIX_DATA_DIR = tmpDir
    getUserDataStore().close()
  })

  it('persists groups in preference namespace separately from watchlist items', () => {
    const groupsStore = WatchlistGroupsStore.getInstance()
    const watchlist = new WatchlistManager()

    groupsStore.save({
      groups: [{ id: 'g1', title: '核心', sortOrder: 0 }],
      membership: { 'CN:SH.600519': ['g1'] },
    })
    watchlist.replace([{ code: '600519', name: '贵州茅台' }])

    const rawWatchlist = getUserDataStore().getDocument('watchlist', 'default')
    const rawGroups = getUserDataStore().getDocument('preference', 'watchlist_groups')

    assert.ok(Array.isArray(rawWatchlist?.items))
    assert.equal(rawWatchlist?.groups, undefined)
    assert.equal(rawGroups?.groups?.length, 1)
    assert.deepEqual(rawGroups?.membership?.['CN:SH.600519'], ['g1'])
  })

  it('watchlist replace prunes membership but keeps groups doc', () => {
    const groupsStore = WatchlistGroupsStore.getInstance()
    const watchlist = new WatchlistManager()

    groupsStore.save({
      groups: [{ id: 'g1', title: '核心', sortOrder: 0 }],
      membership: {
        'CN:SH.600519': ['g1'],
        'CN:SH.000001': ['g1'],
      },
    })
    watchlist.replace([{ code: '600519', name: '贵州茅台' }])

    const doc = groupsStore.load()
    assert.equal(doc.groups.length, 1)
    assert.deepEqual(doc.membership['CN:SH.600519'], ['g1'])
    assert.equal(doc.membership['CN:SH.000001'], undefined)
  })

  it('removeGroup clears membership references only', () => {
    const groupsStore = WatchlistGroupsStore.getInstance()
    groupsStore.save({
      groups: [{ id: 'g1', title: '核心', sortOrder: 0 }],
      membership: { 'CN:SH.600519': ['g1'] },
    })
    const next = groupsStore.removeGroup('g1')
    assert.equal(next.groups.length, 0)
    assert.deepEqual(next.membership, {})
    assert.equal(watchlistItemKey({ code: '600519', name: '贵州茅台' }), 'CN:SH.600519')
  })

  it('cleanup temp data dir', () => {
    getUserDataStore().close()
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe('API watchlist groups compatibility', () => {
  let dataDir = ''
  let port = 0

  it('setup', () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-watchlist-api-'))
    port = pickTestPort()
  })

  it('old PUT /api/watchlist items does not wipe groups', async () => {
    const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        OPPTRIX_DATA_DIR: dataDir,
        STOCK_RESEARCH_HOST: '127.0.0.1',
        STOCK_RESEARCH_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    try {
      await waitForUrl(`http://127.0.0.1:${port}/api/health`)

      const groupsPayload = {
        groups: [{ id: 'tech', title: '科技', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
        membership: { 'CN:SH.600519': ['tech'] },
      }
      const putGroups = await fetch(`http://127.0.0.1:${port}/api/watchlist/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupsPayload),
      })
      assert.equal(putGroups.status, 200)

      const putItems = await fetch(`http://127.0.0.1:${port}/api/watchlist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ code: '600519', name: '贵州茅台', industry: '白酒' }],
        }),
      })
      assert.equal(putItems.status, 200)

      const getGroups = await fetch(`http://127.0.0.1:${port}/api/watchlist/groups`)
      assert.equal(getGroups.status, 200)
      const groupsBody = await getGroups.json()
      assert.ok(groupsBody.success)
      assert.equal(groupsBody.data?.groups?.length, 1)
      assert.equal(groupsBody.data?.groups?.[0]?.title, '科技')
      assert.deepEqual(groupsBody.data?.membership?.['CN:SH.600519'], ['tech'])
    } finally {
      await stopProcess(child)
    }
  })

  it('GET /api/watchlist merges groups read-only for new clients', async () => {
    const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        OPPTRIX_DATA_DIR: dataDir,
        STOCK_RESEARCH_HOST: '127.0.0.1',
        STOCK_RESEARCH_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    try {
      await waitForUrl(`http://127.0.0.1:${port}/api/health`)
      const getResp = await fetch(`http://127.0.0.1:${port}/api/watchlist`)
      assert.equal(getResp.status, 200)
      const body = await getResp.json()
      assert.ok(body.success)
      assert.equal(body.data?.items?.length, 1)
      assert.equal(body.data?.groups?.length, 1)
      assert.ok(body.data?.membership)
    } finally {
      await stopProcess(child)
    }
  })

  it('cleanup', () => {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true })
  })
})

/**
 * Mirrors client-ui WatchlistGroupsContext enqueueSave contract:
 * serial chain + monotonic writeId; stale responses must not overwrite state.
 */
describe('watchlist groups client save queue invariants', () => {
  it('serial queue applies only latest writeId; stale response ignored', async () => {
    /** @type {{ groups: Array<{ id: string }>, membership: Record<string, string[]> }} */
    let state = { groups: [], membership: {} }
    let epoch = 0
    /** @type {Promise<void>} */
    let chain = Promise.resolve()
    /** @type {Array<{ id: string, groups: number }>} */
    const applied = []

    /**
     * @param {{ groups: Array<{ id: string }>, membership: Record<string, string[]> }} doc
     * @param {number} delayMs
     */
    function enqueueSave(doc, delayMs) {
      const writeId = ++epoch
      const run = async () => {
        await new Promise(r => setTimeout(r, delayMs))
        const saved = { groups: doc.groups.slice(), membership: { ...doc.membership } }
        if (writeId !== epoch) return
        state = saved
        applied.push({ id: `w${writeId}`, groups: saved.groups.length })
      }
      const next = chain.then(run, run)
      chain = next.then(() => undefined, () => undefined)
      return next
    }

    // First save is slower; second finishes later on the chain but is newer.
    const doc1 = { groups: [{ id: 'a' }], membership: {} }
    const doc2 = { groups: [{ id: 'a' }, { id: 'b' }], membership: {} }
    state = doc2 // optimistic latest
    const p1 = enqueueSave(doc1, 40)
    const p2 = enqueueSave(doc2, 5)
    await Promise.all([p1, p2])

    assert.equal(state.groups.length, 2)
    assert.deepEqual(state.groups.map(g => g.id), ['a', 'b'])
    // Only the latest writeId may apply; stale writeId=1 must be skipped.
    assert.deepEqual(applied, [{ id: 'w2', groups: 2 }])
  })
})
