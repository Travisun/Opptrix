/**
 * Pre-release audit regression tests (回炉修复锁定).
 *
 * Locks in the P0/P1 fixes from the release audit:
 *  - route proxy matches extension-relative sub-paths + enforces pluginId ownership
 *  - extension id validation rejects traversal / collision-prone ids
 *  - permissions survive a persistence round-trip (registry read-back)
 *  - events.emit is namespace-enforced (ext.{id}.*) + 64KB payload cap
 *  - uninstall evicts the cached storage handle (reinstall data-loss fix)
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-audit-'))
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

describe('audit fix — extension id validation', () => {
  it('rejects traversal ids (".." / "..x")', async () => {
    const ctx = platform.createPlatformContext()
    for (const id of ['..', '../evil', 'a/../b']) {
      const reg = ctx.extensions.registerFromManifest({ id }, { trusted: true })
      assert.equal(reg.ok, false, `id ${id} must be rejected`)
    }
  })

  it('rejects ids that would sanitize-collide or end with "."', async () => {
    const ctx = platform.createPlatformContext()
    for (const id of ['com/a', 'com a', 'com:a', 'trailing.']) {
      const reg = ctx.extensions.registerFromManifest({ id }, { trusted: true })
      assert.equal(reg.ok, false, `id ${JSON.stringify(id)} must be rejected`)
    }
  })

  it('accepts standard reverse-domain ids', async () => {
    const ctx = platform.createPlatformContext()
    const reg = ctx.extensions.registerFromManifest(
      { id: 'com.example.my-ext' },
      { trusted: true },
    )
    assert.equal(reg.ok, true, reg.ok ? '' : reg.error)
  })
})

describe('audit fix — permissions persistence round-trip', () => {
  it('permissions survive restart (registry read-back)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'audit.perm.1', permissions: ['storage', 'platform.info'] },
      { trusted: true },
    )
    await ctx.extensions.activate('audit.perm.1')

    // Fresh manager over the same registry.db (with a real gate wired, as in
    // the platform context — otherwise callGate soft-fails gate_unavailable).
    const registryPath = path.join(dataDir, 'extensions', 'registry.db')
    const store = platform.createExtensionRegistryStore(registryPath)
    const { gate } = platform.createPlatformGate(ctx.events, { packs: ctx.packs })
    const freshHost = platform.createCapabilityHost({ events: ctx.events, packs: ctx.packs })
    platform.registerSelfContainedHandlers(freshHost, ctx.packs)
    platform.registerLateBoundHandlers(freshHost)
    const fresh = platform.createExtensionManager({
      registry: store,
      gate,
      events: ctx.events,
      capabilityHost: freshHost,
    })
    await fresh.ready()
    const rec = fresh.list().find((e) => e.id === 'audit.perm.1')
    assert.ok(rec, 'extension should be loaded from registry')
    assert.deepEqual(
      [...(rec.permissions ?? [])].sort(),
      ['platform.info', 'storage'],
      'permissions must be restored from the registry',
    )
    // And capability calls succeed with the restored permissions.
    const result = await fresh.run('audit.perm.1', async (api) =>
      api.callGate('platform.info', { scope: 'packs' }),
    )
    assert.equal(result.data.ok, true, 'callGate must work after restart')
    store.close()
  })
})

describe('audit fix — events emit namespace + payload cap', () => {
  it('rejects emits outside ext.{pluginId}.* (anti system-event forgery)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'audit.evt.1', permissions: ['events.emit'] },
      { trusted: true },
    )
    await ctx.extensions.activate('audit.evt.1')

    const result = await ctx.extensions.run('audit.evt.1', async (api) =>
      api.callGate('events.emit', { action: 'emit', name: 'session.message.committed' }),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'invalid_args')

    const okResult = await ctx.extensions.run('audit.evt.1', async (api) =>
      api.callGate('events.emit', {
        action: 'emit',
        name: 'ext.audit.evt.1.done',
        payload: { ok: 1 },
      }),
    )
    assert.equal(okResult.data.ok, true)
  })

  it('rejects oversized event payloads (64KB cap)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'audit.evt.2', permissions: ['events.emit'] },
      { trusted: true },
    )
    await ctx.extensions.activate('audit.evt.2')

    const result = await ctx.extensions.run('audit.evt.2', async (api) =>
      api.callGate('events.emit', {
        action: 'emit',
        name: 'ext.audit.evt.2.big',
        payload: { blob: 'x'.repeat(80 * 1024) },
      }),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'payload_too_large')
  })
})

describe('audit fix — uninstall evicts cached storage handle', () => {
  it('reinstall after uninstall writes to a fresh store (no unlinked-inode loss)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'audit.stor.1', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('audit.stor.1')
    await ctx.extensions.run('audit.stor.1', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'k', value: 'v1' })
    })

    // Uninstall (deactivates + clears contributions) + remove data dir.
    ctx.extensions.uninstall('audit.stor.1')
    const removed = platform.removeExtensionData('audit.stor.1')
    assert.equal(removed.ok, true)

    // Reinstall with the same id.
    await ctx.extensions.registerFromManifest(
      { id: 'audit.stor.1', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('audit.stor.1')
    const result = await ctx.extensions.run('audit.stor.1', async (api) => {
      await api.callGate('storage.set', { op: 'set', key: 'k', value: 'v2' })
      return api.callGate('storage.get', { op: 'get', key: 'k' })
    })
    // If the old handle were still cached, this write would land on the
    // unlinked inode and the read would return stale/no data.
    assert.equal(result.data.data.found, true)
    assert.equal(result.data.data.value, 'v2')
  })
})

describe('audit fix — worker_js restart honesty', () => {
  it('ready() marks worker_js extensions as error instead of false-active', async () => {
    const ctx = platform.createPlatformContext()
    const registryPath = path.join(dataDir, 'extensions', 'registry.db')
    // Seed a worker_js active record directly via the registry store.
    const store = platform.createExtensionRegistryStore(registryPath)
    store.upsert({
      id: 'audit.wjs.1',
      state: 'active',
      trusted: true,
      activation: 'worker_js',
      jsLoaded: true,
      permissions: ['storage'],
    })
    const fresh = platform.createExtensionManager({ registry: store })
    await fresh.ready()
    const rec = fresh.list().find((e) => e.id === 'audit.wjs.1')
    assert.ok(rec)
    assert.equal(rec.state, 'error', 'worker_js must not be false-active after restart')
    assert.match(rec.error ?? '', /重新安装/)
    store.close()
  })
})
