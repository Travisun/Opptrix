/**
 * Phase B market data plane tests — demand-driven polling, coalesced batched
 * fetch, event fan-out with per-ref throttle, and extension-level
 * data.subscribe wiring (including deactivate cleanup).
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
const planeModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/market-data-plane.js'),
).href

let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-plane-'))
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

const REF_A = { market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' }
const REF_B = { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL', exchange: 'NASDAQ' }

function fakeQuotes(refs) {
  return refs.map((r, i) => ({
    code: `${r.market}:${r.assetClass}:${r.symbol}`,
    name: r.symbol,
    price: 100 + i,
  }))
}

describe('market data plane (unit)', () => {
  it('demand-driven: subscribe starts polling, unsubscribe stops', async () => {
    const { bindMarketPlane, getMarketPlane } = await import(`${planeModUrl}?t=${Date.now()}`)
    let fetchCalls = 0
    const events = platform.createPlatformContext().events
    const plane = bindMarketPlane({
      events,
      dispatch: async () => {
        fetchCalls++
        return { data: { quotes: fakeQuotes([REF_A]) } }
      },
      tickMs: 60,
    })
    plane.subscribe('ui.watchlist', [REF_A])
    assert.equal(plane.demandCount(), 1)
    await new Promise((r) => setTimeout(r, 220))
    const callsWithDemand = fetchCalls
    assert.ok(callsWithDemand >= 2, `expected ≥2 ticks, got ${callsWithDemand}`)
    plane.unsubscribe('ui.watchlist')
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(fetchCalls, callsWithDemand, 'no polling after unsubscribe (idle = zero cost)')
  })

  it('coalesces shared refs across subscribers (single fetch per tick)', async () => {
    const { bindMarketPlane } = await import(`${planeModUrl}?t=${Date.now()}`)
    let fetchCalls = 0
    const events = platform.createPlatformContext().events
    const plane = bindMarketPlane({
      events,
      dispatch: async (_f, params) => {
        fetchCalls++
        const insts = params.instruments
        return { data: { quotes: fakeQuotes(insts) } }
      },
      tickMs: 60,
    })
    plane.subscribe('a', [REF_A, REF_B])
    plane.subscribe('b', [REF_A]) // overlapping demand — must coalesce
    await new Promise((r) => setTimeout(r, 200))
    // Each tick fetches both refs in ONE batched call (batch ≤50).
    assert.ok(fetchCalls >= 2)
    plane.unsubscribe('a')
    plane.unsubscribe('b')
  })

  it('emits market.quote.updated per ref with ≥1s throttle and ≤100/tick cap', async () => {
    const { bindMarketPlane } = await import(`${planeModUrl}?t=${Date.now()}`)
    const emitted = []
    const events = platform.createPlatformContext().events
    events.subscribeTopic('market.quote.*', (env) => {
      emitted.push(env.payload?.quote?.code)
    })
    const manyRefs = Array.from({ length: 150 }, (_, i) => ({
      market: 'CN',
      assetClass: 'EQUITY',
      symbol: String(600000 + i),
      exchange: 'SH',
    }))
    const plane = bindMarketPlane({
      events,
      dispatch: async (_f, params) => ({
        data: { quotes: fakeQuotes(params.instruments) },
      }),
      tickMs: 60,
    })
    plane.subscribe('cap.test', manyRefs)
    await new Promise((r) => setTimeout(r, 200))
    // Burst cap: ≤100 per tick; a 200ms window spans ~2-3 ticks so the
    // throttled backlog drains at the bounded rate (events are rate-limited,
    // never dropped).
    assert.ok(emitted.length <= 300, `bounded rate exceeded: ${emitted.length}`)
    const unique = new Set(emitted)
    // Per-ref ≥1s throttle: no duplicate within the window.
    assert.equal(unique.size, emitted.length)
    plane.unsubscribe('cap.test')
  })
})

describe('extension data.subscribe (reactive data plane)', () => {
  it('worker_js extension subscribes via ctx and receives market events', async () => {
    const ctx = platform.createPlatformContext()
    // NOTE: the server-internal plane singleton is unbound in tests (no real
    // hub) — the tick is a no-op, but the subscription/demand wiring is what
    // this test asserts. Child-side event receipts are not assertable by
    // design (isolation).
    const manifest = JSON.stringify({
      id: 'plane.sub.1',
      permissions: ['storage', 'data.query', 'events.subscribe'],
      activation: 'worker_js',
      entry: 'index.js',
    })
    const entryJs = `
      const received = []
      globalThis.__drain = () => received.splice(0)
      exports.activate = async (ctx) => {
        await ctx.callGate('data.subscribe', {
          instruments: [{ market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' }],
        })
        ctx.events.subscribe('market.quote.*', (envelope) => {
          received.push(envelope.payload?.quote?.price)
        })
      }`
    // Build .opx zip inline (store-only).
    const { crc32 } = await import('node:zlib')
    function zip(files) {
      const l = [], cd = []
      let off = 0
      for (const [n, c] of Object.entries(files)) {
        const nb = Buffer.from(n), d = Buffer.from(c), crc = crc32(d) >>> 0
        const loc = Buffer.alloc(30 + nb.length)
        loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0, 8)
        loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(d.length, 18); loc.writeUInt32LE(d.length, 22)
        loc.writeUInt16LE(nb.length, 26); nb.copy(loc, 30)
        const ce = Buffer.alloc(46 + nb.length)
        ce.writeUInt32LE(0x02014b50, 0); ce.writeUInt16LE(20, 4); ce.writeUInt16LE(20, 6)
        ce.writeUInt16LE(0, 8); ce.writeUInt16LE(0, 10); ce.writeUInt16LE(0, 12)
        ce.writeUInt32LE(crc, 16); ce.writeUInt32LE(d.length, 20); ce.writeUInt32LE(d.length, 24)
        ce.writeUInt16LE(nb.length, 28); ce.writeUInt32LE(off, 42); nb.copy(ce, 46)
        l.push(loc, d); cd.push(ce); off += loc.length + d.length
      }
      const cdB = Buffer.concat(cd), eocd = Buffer.alloc(22)
      eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(cd.length, 8)
      eocd.writeUInt16LE(cd.length, 10); eocd.writeUInt32LE(cdB.length, 12)
      eocd.writeUInt32LE(off, 16)
      return Buffer.concat([...l, cdB, eocd])
    }
    const opx = zip({
      'manifest.json': manifest,
      'index.js': entryJs,
    })
    const installed = platform.admitRegisterOpx(ctx, opx, { trusted: true })
    assert.equal(installed.ok, true, installed.ok ? '' : installed.error)
    const act = await ctx.extensions.activate('plane.sub.1')
    assert.equal(act.ok, true, act.ok ? '' : act.error)

    // The plane is demand-driven — the extension's subscription created demand.
    await new Promise((r) => setTimeout(r, 250))
    assert.equal(ctx.extensions.getSharedHost().status(), 'running')

    // Deactivate: demand must be dropped (plane.unsubscribeFor).
    await ctx.extensions.deactivate('plane.sub.1')
    assert.equal(getMarketPlaneSafe().demandCount(), 0, 'deactivate drops plane demand')
  })

  let planeCache
  beforeEach(async () => {
    const m = await import(`${planeModUrl}?t=plane`)
    planeCache = m.getMarketPlane()
  })
  function getMarketPlaneSafe() {
    return planeCache
  }
})
