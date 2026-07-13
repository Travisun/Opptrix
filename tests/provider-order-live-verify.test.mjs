/**
 * 端到端验证：UI 拖拽保存的全局 sortOrder → registry 回退顺序一致
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-order-live-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

function swap(ids, a, b) {
  const next = [...ids]
  const ia = next.indexOf(a)
  const ib = next.indexOf(b)
  ;[next[ia], next[ib]] = [next[ib], next[ia]]
  return next
}

describe('provider order live verify', () => {
  it('catalog order, saveProviderOrder, and getProviders stay aligned', async () => {
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const { Capability } = await import('../packages/market-data-core/dist/core/capabilities.js')

    const engine = new MarketDataEngine(false)
    engine.providerLoader.registerBuiltins()

    const before = engine.listProviders()
    const ids = before.providers.map(p => p.providerId)
    assert.ok(ids.length >= 3, `need >=3 providers, got ${ids.join(', ')}`)

    const freeCandidates = ['zzshare', 'baostock', 'tencent', 'sinafinance'].filter(id => ids.includes(id))
    assert.ok(freeCandidates.length >= 2, `need >=2 free providers in catalog: ${ids.join(', ')}`)

    const [top, second] = freeCandidates
    const reordered = swap(ids, top, second)

    const saved = engine.saveProviderOrder(reordered)
    const savedIds = saved.providers.map(p => p.providerId)
    assert.deepEqual(savedIds, reordered, 'catalog should reflect saved order')

    const cnKline = engine.registry
      .getProviders('CN', 'EQUITY', Capability.STOCK_KLINE)
      .map(d => d.name)
    const eligible = freeCandidates.filter(id => cnKline.includes(id))
    assert.ok(eligible.length >= 2, `CN kline eligible: ${cnKline.join(', ')}`)

    const [expectFirst, expectSecond] = eligible
    const idxFirst = reordered.indexOf(expectFirst)
    const idxSecond = reordered.indexOf(expectSecond)
    const higherInUi = idxFirst < idxSecond ? expectFirst : expectSecond
    const lowerInUi = higherInUi === expectFirst ? expectSecond : expectFirst

    const posHigher = cnKline.indexOf(higherInUi)
    const posLower = cnKline.indexOf(lowerInUi)
    assert.ok(posHigher >= 0 && posLower >= 0)
    assert.ok(
      posHigher < posLower,
      `registry CN STOCK_KLINE order should match UI swap: ${cnKline.join(' > ')}; `
      + `expected ${higherInUi} before ${lowerInUi}`,
    )

    const topRuntime = saved.providers[0]
    assert.equal(topRuntime.providerId, reordered[0])
    assert.ok(typeof topRuntime.sortOrder === 'number')
  })
})
