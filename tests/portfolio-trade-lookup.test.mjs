import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  portfolioHoldingsStorageKey,
  normalizeInstrumentRef,
  tryParseInstrumentInput,
} from '@opptrix/shared'

/** 与 client-ui portfolioTradeLookup 对齐的查询码（Node 测试不直接 import client-ui） */
function resolvePortfolioTradeLookupCode(code, market, assetClass) {
  const trimmed = String(code ?? '').trim()
  if (!trimmed) return trimmed

  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) {
    const ref = normalizeInstrumentRef(
      assetClass ? { ...parsed, assetClass } : parsed,
    )
    return portfolioHoldingsStorageKey(ref)
  }

  const fundNs = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(trimmed)
  if (fundNs) {
    return portfolioHoldingsStorageKey({
      market: 'CN',
      assetClass: 'FUND',
      symbol: fundNs[1],
      exchange: 'OF',
    })
  }

  const fundSuffix = /^(\d{6})\.(?:OF|PF)$/i.exec(trimmed)
  if (fundSuffix) {
    return portfolioHoldingsStorageKey({
      market: 'CN',
      assetClass: 'FUND',
      symbol: fundSuffix[1],
      exchange: 'OF',
    })
  }

  if (market === 'CN' && assetClass === 'FUND' && /^\d{6}$/.test(trimmed)) {
    return portfolioHoldingsStorageKey({
      market: 'CN',
      assetClass: 'FUND',
      symbol: trimmed,
      exchange: 'OF',
    })
  }

  if (market && market !== 'CN') return trimmed
  if (/^CN:/i.test(trimmed)) return trimmed
  return trimmed.replace(/\D/g, '').slice(-6).padStart(6, '0')
}

test('resolvePortfolioTradeLookupCode — OTC Opptrix ID must not double-prefix CN:PF', () => {
  const lookup = resolvePortfolioTradeLookupCode('CN:OTC:009049.OF', 'CN')
  assert.equal(lookup, 'CN:OTC:009049.OF')
  assert.ok(!lookup.includes('CN:PF.CN:'))
})

test('resolvePortfolioTradeLookupCode — legacy CN:PF and bare fund code', () => {
  assert.equal(
    resolvePortfolioTradeLookupCode('CN:PF.009049', 'CN'),
    'CN:OTC:009049.OF',
  )
  assert.equal(
    resolvePortfolioTradeLookupCode('009049', 'CN', 'FUND'),
    'CN:OTC:009049.OF',
  )
})

test('resolvePortfolioTradeLookupCode — CN equity / ETF / HK / US', () => {
  assert.equal(
    resolvePortfolioTradeLookupCode('CN:STOCK:600519.SH', 'CN'),
    'CN:STOCK:600519.SH',
  )
  assert.equal(
    resolvePortfolioTradeLookupCode('CN:ETF:510300.SH', 'CN'),
    'CN:ETF:510300.SH',
  )
  assert.equal(
    resolvePortfolioTradeLookupCode('HK:STOCK:00700.HK', 'HK'),
    'HK:STOCK:00700.HK',
  )
  assert.equal(
    resolvePortfolioTradeLookupCode('US:STOCK:AAPL.US', 'US'),
    'US:STOCK:AAPL.US',
  )
})

test('portfolio store getTrades — OTC lookup resolves stored Opptrix rows', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-pf-otc-lookup-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  try { getUserDataStore().close() } catch { /* */ }

  const { PortfolioStore } = await import('../packages/a-stock-layer/dist/portfolio/store.js')
  PortfolioStore.resetForTests()
  const store = PortfolioStore.getInstance()
  store.clearAll()
  store.addTrade({
    code: 'CN:OTC:009049.OF',
    market: 'CN',
    assetClass: 'FUND',
    name: '测试基金',
    tradeSide: 'buy',
    shares: 1000,
    price: 1.2,
    amount: 1200,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    totalFee: 0,
    tradeDate: '2024-06-01',
  })

  const broken = 'CN:PF.CN:OTC:009049.OF'
  assert.equal(store.getTrades(broken, 'CN').length, 0)

  const lookup = resolvePortfolioTradeLookupCode('CN:OTC:009049.OF', 'CN')
  assert.equal(store.getTrades(lookup, 'CN').length, 1)
  assert.equal(store.getTrades('CN:PF.009049', 'CN').length, 1)
  assert.equal(store.getTrades('009049', 'CN').length, 1)

  PortfolioStore.resetForTests()
  try { getUserDataStore().close() } catch { /* */ }
  fs.rmSync(tmp, { recursive: true, force: true })
})
