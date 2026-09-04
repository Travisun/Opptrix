/**
 * Phase A capability routing + permission enforcement tests.
 *
 * Observation structure: callGate → CapabilityObservation { ok, data }.
 * run() wraps it: { ok, data: CapabilityObservation }.
 * So a successful capability result lives at result.data.data.
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-cap-'))
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

// Unwrap run() → observation → capability result.
function capResult(runResult) {
  return runResult.data.data
}

describe('Phase A — capability routing', () => {
  it('platform.info returns packs snapshot', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'cap.info.1', permissions: ['platform.info'] },
      { trusted: true },
    )
    await ctx.extensions.activate('cap.info.1')

    const result = await ctx.extensions.run('cap.info.1', async (api) =>
      api.callGate('platform.info', { scope: 'packs' }),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.ok, true)
    const obs = result.data
    assert.ok(Array.isArray(obs.data.packs))
    assert.ok(obs.data.packs.some((p) => p.id === 'research'))
  })

  it('events.subscribe observes system events', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'cap.events.1', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.activate('cap.events.1')

    const received = []
    const result = await ctx.extensions.run('cap.events.1', async (api) =>
      api.callGate('events.subscribe', {
        action: 'subscribe',
        topic: 'job.*',
        handler: (envelope) => received.push(envelope.name),
      }),
    )
    assert.equal(result.ok, true)
    ctx.events.emit('job.terminal', { jobId: 'x' }, { kind: 'system', id: 'test' })
    assert.ok(received.includes('job.terminal'))
  })

  it('storage.set/get round-trips per extension', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'cap.store.1', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('cap.store.1')

    const setResult = await ctx.extensions.run('cap.store.1', async (api) =>
      api.callGate('storage.set', { op: 'set', key: 'k1', value: 'v1' }),
    )
    assert.equal(setResult.data.ok, true)

    const getResult = await ctx.extensions.run('cap.store.1', async (api) =>
      api.callGate('storage.get', { op: 'get', key: 'k1' }),
    )
    assert.equal(getResult.data.ok, true)
    assert.equal(getResult.data.data.value, 'v1')
    assert.equal(getResult.data.data.found, true)
  })

  it('storage is isolated between extensions', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'cap.store.2a', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.registerFromManifest(
      { id: 'cap.store.2b', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('cap.store.2a')
    await ctx.extensions.activate('cap.store.2b')

    await ctx.extensions.run('cap.store.2a', async (api) =>
      api.callGate('storage.set', { op: 'set', key: 'secret', value: 'alpha' }),
    )
    const result = await ctx.extensions.run('cap.store.2b', async (api) =>
      api.callGate('storage.get', { op: 'get', key: 'secret' }),
    )
    assert.equal(result.data.data.found, false) // extension 2b cannot read 2a's data
  })
})

describe('Phase A — permission enforcement', () => {
  it('denies a capability when manifest lacks the required permission', async () => {
    const ctx = platform.createPlatformContext()
    const reg = await ctx.extensions.registerFromManifest(
      { id: 'cap.perm.1', name: 'no-perms' },
      { trusted: true },
    )
    assert.equal(reg.ok, true)
    await ctx.extensions.activate('cap.perm.1')

    const result = await ctx.extensions.run('cap.perm.1', async (api) =>
      api.callGate('storage.get', { op: 'get', key: 'x' }),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'permission_denied')
  })

  it('allows a capability when manifest declares the permission', async () => {
    const ctx = platform.createPlatformContext()
    const reg = await ctx.extensions.registerFromManifest(
      { id: 'cap.perm.2', permissions: ['storage'] },
      { trusted: true },
    )
    assert.equal(reg.ok, true)
    await ctx.extensions.activate('cap.perm.2')

    const result = await ctx.extensions.run('cap.perm.2', async (api) =>
      api.callGate('storage.set', { op: 'set', key: 'a', value: 1 }),
    )
    assert.equal(result.data.ok, true)
  })

  it('denies unknown capability tokens with structured denial', async () => {
    const ctx = platform.createPlatformContext()
    const reg = await ctx.extensions.registerFromManifest(
      { id: 'cap.perm.3', permissions: ['storage', 'llm', 'data.query', 'shell', 'schedule', 'events.subscribe', 'events.emit', 'platform.info', 'sessions.read'] },
      { trusted: true },
    )
    assert.equal(reg.ok, true)
    await ctx.extensions.activate('cap.perm.3')

    const result = await ctx.extensions.run('cap.perm.3', async (api) =>
      api.callGate('unknown.token', {}),
    )
    assert.equal(result.data.ok, false)
    assert.equal(result.data.denialCode, 'unknown_capability')
  })
})
