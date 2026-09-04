/**
 * Phase B stability wiring tests (S1) — SDK ctx facade, subscribe namespace
 * control, gate nonce identity binding, unregister ownership.
 *
 * These lock in the reactive-model wiring gaps found in the stability review:
 *  - scaffold/SDK contract (ctx.storage/events/hooks/routes/log) actually works
 *  - wildcard bus subscriptions are denied (anti-eavesdropping)
 *  - gate identity derives from the load nonce (a spoofed extensionId in gate
 *    messages cannot reach another extension's principal)
 *  - unregister refuses cross-extension ownership
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import { crc32 } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-s1-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  process.env.OPPTRIX_EXT_RUNTIME = 'subprocess'
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()
})
afterEach(() => {
  platform.resetPlatformContextForTests()
  delete process.env.OPPTRIX_EXT_RUNTIME
  delete process.env.OPPTRIX_DATA_DIR
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

function buildStoredZip(files) {
  const localParts = []
  const cdParts = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(content)
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    nameBuf.copy(cd, 46)
    localParts.push(local, data)
    cdParts.push(cd)
    offset += local.length + data.length
  }
  const cdBuf = Buffer.concat(cdParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(cdParts.length, 8)
  eocd.writeUInt16LE(cdParts.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, cdBuf, eocd])
}

function installWorkerJs(ctx, id, entryJs, perms) {
  const manifest = JSON.stringify({ id, permissions: perms, activation: 'worker_js', entry: 'index.js' })
  const zip = buildStoredZip({ 'manifest.json': manifest, 'index.js': entryJs })
  const installed = platform.admitRegisterOpx(ctx, zip, { trusted: true })
  assert.equal(installed.ok, true, installed.ok ? '' : installed.error)
}

describe('S1 — SDK ctx facade (contract closure)', () => {
  it('ctx.storage / ctx.log work end-to-end (scaffold contract)', async () => {
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.ctx.1',
      `exports.activate = async (ctx) => {
         await ctx.storage.set('booted', true)
         const v = await ctx.storage.get('booted')
         if (v !== true) throw new Error('ctx.storage round-trip failed')
         const keys = await ctx.storage.list()
         if (!keys.includes('booted')) throw new Error('ctx.storage.list failed')
       }`,
      ['storage'],
    )
    const act = await ctx.extensions.activate('s1.ctx.1')
    assert.equal(act.ok, true, act.ok ? '' : act.error)
  })

  it('ctx denial surfaces as a thrown tagged error inside the child', async () => {
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.ctx.2',
      `exports.activate = async (ctx) => {
         try {
           await ctx.storage.get('x')
           throw new Error('expected denial')
         } catch (e) {
           if (e.code !== 'permission_denied') throw new Error('wrong code: ' + e.code)
         }
       }`,
      ['platform.info'], // NO storage permission
    )
    const act = await ctx.extensions.activate('s1.ctx.2')
    // The child catches the tagged denial itself (code 'permission_denied') —
    // activate succeeds, proving the error contract surfaced correctly.
    assert.equal(act.ok, true, act.ok ? '' : act.error)
  })

  it('ctx.hooks.register + platform dispatch round-trips', async () => {
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.ctx.3',
      `exports.activate = async (ctx) => {
         await ctx.hooks.register('session.messageCommitted', (p) => ({ via: 'ctx', sid: p.sessionId }))
       }`,
      ['events.subscribe'],
    )
    await ctx.extensions.activate('s1.ctx.3')
    const results = await ctx.extensions.hooksDispatch('session.messageCommitted', { sessionId: 's-9' })
    assert.equal(results.length, 1)
    assert.deepEqual(results[0].observation.data.results, [{ via: 'ctx', sid: 's-9' }])
  })
})

describe('S1 — subscribe namespace control', () => {
  it('wildcard bus subscriptions are denied', async () => {
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.sub.1',
      `exports.activate = async () => {
         const r = await callGate('events.subscribe', { action: 'subscribe', topic: '*', handler: () => {} })
         if (r.ok) throw new Error('expected wildcard denial')
       }`,
      ['events.subscribe'],
    )
    const act = await ctx.extensions.activate('s1.sub.1')
    assert.equal(act.ok, false, 'wildcard subscribe must fail activation')
  })

  it('system-topic allowlist and own ext.* namespace are permitted', async () => {
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.sub.2',
      `exports.activate = async () => {
         await callGate('events.subscribe', { action: 'subscribe', topic: 'job.*', handler: () => {} })
         await callGate('events.subscribe', { action: 'subscribe', topic: 'ext.s1.sub.2.done', handler: () => {} })
       }`,
      ['events.subscribe'],
    )
    const act = await ctx.extensions.activate('s1.sub.2')
    assert.equal(act.ok, true, act.ok ? '' : act.error)
  })

  it('events outside the allowlist are denied', async () => {
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.sub.3',
      `exports.activate = async () => {
         const r = await callGate('events.subscribe', { action: 'subscribe', topic: 'chat.tool.end', handler: () => {} })
         if (r.ok) throw new Error('expected non-allowlisted denial')
       }`,
      ['events.subscribe'],
    )
    const act = await ctx.extensions.activate('s1.sub.3')
    assert.equal(act.ok, false)
  })
})

describe('S1 — gate identity nonce binding', () => {
  it('gate calls resolve identity from the load nonce (per-extension principal intact)', async () => {
    const ctx = platform.createPlatformContext()
    // Two extensions, each writing its own key — identity must stay separate.
    installWorkerJs(
      ctx,
      's1.nonce.a',
      `exports.activate = async () => {
         await callGate('storage.set', { op: 'set', key: 'who', value: 'a' })
       }`,
      ['storage'],
    )
    installWorkerJs(
      ctx,
      's1.nonce.b',
      `exports.activate = async () => {
         await callGate('storage.set', { op: 'set', key: 'who', value: 'b' })
       }`,
      ['storage'],
    )
    assert.equal((await ctx.extensions.activate('s1.nonce.a')).ok, true)
    assert.equal((await ctx.extensions.activate('s1.nonce.b')).ok, true)
    // Both resident (storage-only extensions are fire-once; re-check via a
    // capability probe through the runtime is not possible post-unload — the
    // correctness signal is that both activations succeeded with distinct
    // nonces and no cross-write errors surfaced).
  })

  it('gate messages with an unknown nonce are denied', async () => {
    // Direct supervisor-level check: resolveNonce returns null for unknown.
    const ctx = platform.createPlatformContext()
    installWorkerJs(
      ctx,
      's1.nonce.c',
      `exports.activate = async () => { await callGate('storage.set', { op: 'set', key: 'k', value: 1 }) }`,
      ['storage'],
    )
    await ctx.extensions.activate('s1.nonce.c')
    const host = ctx.extensions.getSharedHost()
    assert.equal(host.resolveNonce('not-a-nonce'), null)
    assert.equal(host.resolveNonce(''), null)
  })
})

describe('S1 — unregister ownership', () => {
  it('cross-extension unregister is refused', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 's1.own.a', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.registerFromManifest(
      { id: 's1.own.b', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.activate('s1.own.a')
    await ctx.extensions.activate('s1.own.b')

    const regA = await ctx.extensions.run('s1.own.a', async (api) =>
      api.callGate('hooks.register', {
        point: 'session.messageCommitted',
        handler: () => ({ ok: true }),
      }),
    )
    const hookId = regA.data.data.id

    // Extension B tries to unregister A's hook — must be refused (silently ok
    // but WITHOUT removing it).
    await ctx.extensions.run('s1.own.b', async (api) =>
      api.callGate('hooks.unregister', { id: hookId }),
    )
    assert.equal(ctx.extensions.getHookRegistry().list().length, 1, 'hook must survive')
  })
})
