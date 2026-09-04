/**
 * Phase A lifecycle tests — persistence + R0/R1 compliance.
 *
 * R0: extensions must not block startup; /api/health independent; fail-open.
 * R1: ordered shutdown deactivates + flushes + stops host worker, bounded.
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

// Isolate each test's data dir so persistence is hermetic.
let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-lc-'))
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

describe('Phase A — persistence', () => {
  it('registers an extension and persists it to registry.db', async () => {
    const ctx = platform.createPlatformContext()
    const reg = await ctx.extensions.register('lc.persist.1', { trusted: true })
    assert.equal(reg.ok, true, reg.ok ? '' : reg.error)

    // The registry file should exist after a persist call.
    const registryPath = path.join(dataDir, 'extensions', 'registry.db')
    assert.ok(fs.existsSync(registryPath), 'registry.db should exist after register')
  })

  it('ready() loads persisted records after a fresh manager construction', async () => {
    const ctx = platform.createPlatformContext()
    const reg = await ctx.extensions.register('lc.persist.2', { trusted: true })
    assert.equal(reg.ok, true, reg.ok ? '' : reg.error)
    const act = await ctx.extensions.activate('lc.persist.2')
    assert.equal(act.ok, true)

    // Simulate restart: create a brand-new manager pointing at the same registry.db.
    const registryPath = path.join(dataDir, 'extensions', 'registry.db')
    const store = platform.createExtensionRegistryStore(registryPath)
    const fresh = platform.createExtensionManager({ registry: store })

    // Before ready(), the new manager is empty.
    assert.equal(fresh.list().length, 0)

    // ready() loads persisted records.
    await fresh.ready()
    const listed = fresh.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].id, 'lc.persist.2')
    // After ready(), previously-active extension is re-activated.
    assert.equal(listed[0].state, 'active')
    store.close()
  })

  it('activate/deactivate persist state transitions', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.register('lc.persist.3', { trusted: true })
    await ctx.extensions.activate('lc.persist.3')
    await ctx.extensions.deactivate('lc.persist.3')

    const registryPath = path.join(dataDir, 'extensions', 'registry.db')
    const store = platform.createExtensionRegistryStore(registryPath)
    const fresh = platform.createExtensionManager({ registry: store })
    await fresh.ready()
    const listed = fresh.list()
    assert.equal(listed.length, 1)
    // deactivate persisted state=inactive; ready() only re-activates 'active' records.
    assert.equal(listed[0].state, 'inactive')
    store.close()
  })
})

describe('Phase A — R0 compliance', () => {
  it('ready() is idempotent and non-throwing even if registry load fails', async () => {
    // Inject a registry whose loadAll() throws — simulates a corrupt registry.db.
    const brokenRegistry = {
      loadAll() {
        throw new Error('corrupt registry')
      },
      upsert() {},
      remove() {},
      close() {},
    }
    const mgr = platform.createExtensionManager({ registry: brokenRegistry })
    // Should not throw.
    await assert.doesNotReject(() => mgr.ready())
  })

  it('ready() is idempotent on repeated calls', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.register('lc.r0.ready', { trusted: true })
    // Second ready() is a no-op (records already loaded).
    await ctx.extensions.ready()
    await ctx.extensions.ready()
    assert.equal(ctx.extensions.list().length, 1)
  })

  it('R0: extension with catalog_only activation registers + activates without host worker', async () => {
    const ctx = platform.createPlatformContext()
    const reg = await ctx.extensions.register('lc.r0.catalog', { trusted: true })
    assert.equal(reg.ok, true)
    const act = await ctx.extensions.activate('lc.r0.catalog')
    assert.equal(act.ok, true)
    assert.equal(act.experimental, undefined) // catalog_only is not experimental
    assert.equal(ctx.extensions.getHostSupervisor().status(), 'stopped')
  })
})

describe('Phase A — R1 compliance', () => {
  it('shutdown() deactivates active extensions and stops host worker', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.register('lc.r1.1', { trusted: true })
    await ctx.extensions.activate('lc.r1.1')
    assert.equal(ctx.extensions.list()[0].state, 'active')

    await ctx.extensions.shutdown()
    assert.equal(ctx.extensions.list()[0].state, 'inactive')
    assert.equal(ctx.extensions.getHostSupervisor().status(), 'stopped')
  })

  it('shutdown() is idempotent and non-throwing', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.register('lc.r1.2', { trusted: true })
    await ctx.extensions.activate('lc.r1.2')
    await assert.doesNotReject(() => ctx.extensions.shutdown())
    // Second call must also not throw.
    await assert.doesNotReject(() => ctx.extensions.shutdown())
  })

  it('shutdown() persists deactivated state so restart does not re-activate', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.register('lc.r1.3', { trusted: true })
    await ctx.extensions.activate('lc.r1.3')
    await ctx.extensions.shutdown()

    const registryPath = path.join(dataDir, 'extensions', 'registry.db')
    const store = platform.createExtensionRegistryStore(registryPath)
    const fresh = platform.createExtensionManager({ registry: store })
    await fresh.ready()
    const listed = fresh.list()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].state, 'inactive') // was deactivated by shutdown()
    store.close()
  })
})
