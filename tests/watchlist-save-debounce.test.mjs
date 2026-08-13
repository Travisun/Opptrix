import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

describe('watchlist save debounce', () => {
  /** @type {string} */
  let tmpDir
  /** @type {typeof import('../packages/a-stock-layer/dist/index.js').WatchlistStore} */
  let WatchlistStore
  /** @type {typeof import('../packages/user-store/dist/index.js').getUserDataStore} */
  let getUserDataStore

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-watchlist-debounce-'))
    process.env.OPPTRIX_DATA_DIR = tmpDir
    ;({ getUserDataStore } = await import('../packages/user-store/dist/index.js'))
    getUserDataStore().close()
    ;({ WatchlistStore } = await import('../packages/a-stock-layer/dist/index.js'))
    WatchlistStore.resetForTests()
  })

  after(() => {
    try {
      WatchlistStore.resetForTests()
    } catch { /* ignore */ }
    try {
      getUserDataStore().close()
    } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('replace updates memory immediately; multiple replaces coalesce to one setDocument', async () => {
    const uds = getUserDataStore()
    let setDocumentCalls = 0
    const orig = uds.setDocument.bind(uds)
    uds.setDocument = (namespace, id, data) => {
      if (namespace === 'watchlist' && id === 'default') setDocumentCalls += 1
      return orig(namespace, id, data)
    }

    try {
      const store = WatchlistStore.getInstance()
      store.replace([{ code: '600519', name: '贵州茅台' }])
      store.replace([{ code: '000001', name: '平安银行' }])
      store.replace([{ code: '300750', name: '宁德时代' }])

      assert.equal(store.list().length, 1)
      assert.match(store.list()[0]?.code ?? '', /300750/)
      assert.equal(setDocumentCalls, 0, 'disk write should still be pending')

      await delay(280)
      assert.equal(setDocumentCalls, 1, 'debounce should flush once')

      const disk = uds.getDocument('watchlist', 'default')
      assert.match(disk?.items?.[0]?.code ?? '', /300750/)

      store.replace([{ code: '600000', name: '浦发银行' }])
      assert.match(store.list()[0]?.code ?? '', /600000/)
      const beforeFlush = setDocumentCalls
      store.flush()
      assert.equal(setDocumentCalls, beforeFlush + 1)
      assert.match(uds.getDocument('watchlist', 'default')?.items?.[0]?.code ?? '', /600000/)
    } finally {
      uds.setDocument = orig
    }
  })
})
