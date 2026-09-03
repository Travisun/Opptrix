import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  SqlitePluginKvStore,
  exportPluginData,
  importPluginData,
  createUserDbFacade,
  defaultUserDbPolicy,
  UserDbAccessError,
} from '../packages/plugin-storage/dist/index.js'

test('plugin-storage kv roundtrip', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-plugin-'))
  const store = new SqlitePluginKvStore({
    pluginId: 'com.example.alpha',
    dataRoot: path.join(root, 'com.example.alpha'),
    quotaBytes: 1024 * 1024,
  })
  try {
    store.set('prefs', { theme: 'dark' })
    assert.equal(store.get('prefs')?.theme, 'dark')
    assert.deepEqual(store.keys('pre'), ['prefs'])
    store.delete('prefs')
    assert.equal(store.get('prefs'), null)
  } finally {
    store.close()
  }
})

test('plugin-storage export import', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-plugin-'))
  const dataRoot = path.join(root, 'com.example.beta')
  const store = new SqlitePluginKvStore({
    pluginId: 'com.example.beta',
    dataRoot,
  })
  store.set('a', 1)
  store.close()

  const payload = exportPluginData('com.example.beta', { dataRoot })
  assert.equal(payload.kv.a, 1)

  importPluginData('com.example.beta', {
    ...payload,
    kv: { b: 2 },
  }, { merge: false, dataRoot })

  const store2 = new SqlitePluginKvStore({
    pluginId: 'com.example.beta',
    dataRoot,
  })
  assert.equal(store2.get('b'), 2)
  assert.equal(store2.get('a'), null)
  store2.close()
})

test('user-db facade enforces namespace policy', () => {
  const docs = new Map()
  const keyOf = (ns, id) => `${ns}\0${id}`
  const store = {
    getDocument(namespace, id) {
      return docs.get(keyOf(namespace, id)) ?? null
    },
    setDocument(namespace, id, data) {
      docs.set(keyOf(namespace, id), data)
    },
    deleteDocument(namespace, id) {
      docs.delete(keyOf(namespace, id))
    },
    listDocumentPage() {
      return []
    },
  }

  const facade = createUserDbFacade(store, defaultUserDbPolicy('com.example.gamma'))
  const ns = 'ext:com.example.gamma'
  facade.set(ns, 'doc1', { ok: true })
  assert.deepEqual(facade.get(ns, 'doc1'), { ok: true })

  assert.throws(
    () => facade.get('watchlist', 'default'),
    UserDbAccessError,
  )
})
