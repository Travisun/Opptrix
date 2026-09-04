/**
 * Phase A Tier 1 per-extension storage tests.
 *
 * KV get/set/list/delete + export/import round-trip + quota + uninstall cleanup.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-stor-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()
})
afterEach(() => {
  platform.resetPlatformContextForTests()
  delete process.env.OPPTRIX_DATA_DIR
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

function reg(ctx, id, perms = ['storage']) {
  return ctx.extensions.registerFromManifest({ id, permissions: perms }, { trusted: true })
}

describe('Tier 1 storage', () => {
  it('list returns keys with optional prefix', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(reg(ctx, 'stor.list').ok, true)
    await ctx.extensions.activate('stor.list')

    await ctx.extensions.run('stor.list', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'a', value: 1 })
      await api.callGate('storage.set', { op: 'set', key: 'b', value: 2 })
      await api.callGate('storage.set', { op: 'set', key: 'other', value: 3 })
    })
    const result = await ctx.extensions.run('stor.list', async (api) =>
      api.callGate('storage.list', { op: 'list', prefix: 'a' }),
    )
    assert.equal(result.data.data.keys.length, 1)
    assert.equal(result.data.data.keys[0], 'a')
  })

  it('export → delete → import round-trips data', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(reg(ctx, 'stor.exp').ok, true)
    await ctx.extensions.activate('stor.exp')

    const exported = await ctx.extensions.run('stor.exp', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'greeting', value: 'hello' })
      return api.callGate('storage.export', { op: 'export' })
    })
    assert.equal(exported.data.ok, true)
    const payload = exported.data.data
    assert.equal(payload.pluginId, 'stor.exp')
    assert.equal(payload.kv.greeting, 'hello')

    // Delete the key, then re-import.
    await ctx.extensions.run('stor.exp', async (api) => {
      await api.callGate('storage.delete', { op: 'delete', key: 'greeting' })
    })
    const afterDelete = await ctx.extensions.run('stor.exp', async (api) =>
      api.callGate('storage.get', { op: 'get', key: 'greeting' }),
    )
    assert.equal(afterDelete.data.data.found, false)

    const imported = await ctx.extensions.run('stor.exp', async (api) =>
      api.callGate('storage.import', { op: 'import', payload }),
    )
    assert.equal(imported.data.ok, true)

    const afterImport = await ctx.extensions.run('stor.exp', async (api) =>
      api.callGate('storage.get', { op: 'get', key: 'greeting' }),
    )
    assert.equal(afterImport.data.data.found, true)
    assert.equal(afterImport.data.data.value, 'hello')
  })

  it('quota enforcement returns a clean error on oversized write', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(reg(ctx, 'stor.quota').ok, true)
    await ctx.extensions.activate('stor.quota')

    // Allocate a store with a tiny quota and write past it.
    const { SqlitePluginKvStore } = await import('@opptrix/plugin-storage')
    const store = new SqlitePluginKvStore({ pluginId: 'stor.quota', quotaBytes: 64 })
    const big = 'x'.repeat(200)
    let threw = false
    try {
      store.set('big', big)
    } catch {
      threw = true
    }
    assert.ok(threw, 'expected quota exceeded error')
    store.close()
  })

  it('removeExtensionData cleans up the data directory', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(reg(ctx, 'stor.clean').ok, true)
    await ctx.extensions.activate('stor.clean')

    await ctx.extensions.run('stor.clean', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'x', value: 1 })
    })
    const pluginDataDir = path.join(dataDir, 'plugin-data', 'stor.clean')
    assert.ok(fs.existsSync(pluginDataDir), 'plugin-data dir should exist')

    const removed = platform.removeExtensionData('stor.clean')
    assert.equal(removed.ok, true)
    assert.ok(!fs.existsSync(pluginDataDir), 'plugin-data dir should be removed')
  })

  it('delete removes a single key', async () => {
    const ctx = platform.createPlatformContext()
    assert.equal(reg(ctx, 'stor.del').ok, true)
    await ctx.extensions.activate('stor.del')

    await ctx.extensions.run('stor.del', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'k', value: 'v' })
    })
    const delResult = await ctx.extensions.run('stor.del', async (api) =>
      api.callGate('storage.delete', { op: 'delete', key: 'k' }),
    )
    assert.equal(delResult.data.ok, true)
    const getResult = await ctx.extensions.run('stor.del', async (api) =>
      api.callGate('storage.get', { op: 'get', key: 'k' }),
    )
    assert.equal(getResult.data.data.found, false)
  })
})
