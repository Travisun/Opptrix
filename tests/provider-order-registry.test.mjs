import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MarketDataEngine } from '../packages/a-stock-layer/dist/engine.js'
import { Capability } from '../packages/market-data-core/dist/core/capabilities.js'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-provider-order-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true })
  }
})

function swapProviderOrder(ids, a, b) {
  const next = [...ids]
  const ia = next.indexOf(a)
  const ib = next.indexOf(b)
  assert.ok(ia >= 0 && ib >= 0, `providers ${a}/${b} must exist in catalog`)
  ;[next[ia], next[ib]] = [next[ib], next[ia]]
  return next
}

describe('provider order → registry fallback', () => {
  it('saveProviderOrder updates CN STOCK_KLINE fallback order for eligible providers', () => {
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()

    const catalog = engine.listProviders()
    const ids = catalog.providers.map(p => p.providerId)
    assert.ok(ids.length >= 2)

    const cnKlineBefore = engine.registry
      .getProviders('CN', 'EQUITY', Capability.STOCK_KLINE)
      .map(d => d.name)
    const candidates = ['zzshare', 'baostock', 'tencent'].filter(
      id => cnKlineBefore.includes(id),
    )
    assert.ok(candidates.length >= 2, `need >=2 free CN kline providers, got ${cnKlineBefore.join(', ')}`)

    const [first, second] = candidates
    const idxFirst = cnKlineBefore.indexOf(first)
    const idxSecond = cnKlineBefore.indexOf(second)
    const higher = idxFirst < idxSecond ? first : second
    const lower = higher === first ? second : first

    const reordered = swapProviderOrder(ids, higher, lower)
    engine.saveProviderOrder(reordered)

    const cnKlineAfter = engine.registry
      .getProviders('CN', 'EQUITY', Capability.STOCK_KLINE)
      .map(d => d.name)
    const afterHigher = cnKlineAfter.indexOf(higher)
    const afterLower = cnKlineAfter.indexOf(lower)
    assert.ok(afterHigher >= 0 && afterLower >= 0)
    assert.ok(
      afterLower < afterHigher,
      `expected ${lower} before ${higher} after swap, got ${cnKlineAfter.join(' > ')}`,
    )
  })

  it('disabled or missing-secret providers keep effectivePriority 0 and stay out of fallback', () => {
    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()

    engine.saveProviderConfig('tickflow', {
      enabled: false,
      extra: { apiKey: '' },
    })
    const tickflow = engine.getProviderConfig('tickflow')
    assert.ok(tickflow)
    assert.equal(tickflow.effectivePriority, 0)

    const cnKline = engine.registry
      .getProviders('CN', 'EQUITY', Capability.STOCK_KLINE)
      .map(d => d.name)
    assert.ok(!cnKline.includes('tickflow'), 'tickflow should not participate without key')
  })
})
