import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-right-panel-cache-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('portfolio summary disk cache serves instantly before refresh', async () => {
  const {
    readPortfolioSummaryCache,
    writePortfolioSummaryCache,
    resetRightPanelCacheForTests,
  } = await import('../packages/research-hub/dist/right-panel-cache.js')
  const { ok } = await import('../packages/shared/dist/result.js')

  resetRightPanelCacheForTests()

  writePortfolioSummaryCache(ok({
    totalCost: 1000,
    totalMarketValue: 1100,
    totalUnrealizedPnl: 100,
    totalRealizedPnl: 0,
    totalPnl: 100,
    totalPnlPct: 10,
    holdingsCount: 1,
    tradesCount: 1,
    holdings: [{
      code: '600519',
      name: '贵州茅台',
      market: 'CN',
      shares: 100,
      costBasis: 10,
      currentPrice: 11,
      marketValue: 1100,
      unrealizedPnl: 100,
      unrealizedPnlPct: 10,
    }],
  }, 'cached summary'))

  const hit = readPortfolioSummaryCache()
  assert.ok(hit)
  assert.equal(hit.data.holdingsCount, 1)
  assert.match(hit.message, /cached/)
})

test('instrument quotes disk cache returns batch subset', async () => {
  const {
    readInstrumentQuotesCache,
    writeInstrumentQuoteCache,
    resetRightPanelCacheForTests,
  } = await import('../packages/research-hub/dist/right-panel-cache.js')

  resetRightPanelCacheForTests()

  const ref = { market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' }
  writeInstrumentQuoteCache({
    instrument: ref,
    code: '600519',
    name: '贵州茅台',
    price: 1800,
    change_pct: 1.2,
    source: 'live',
  })

  const { quotes, newestMs } = readInstrumentQuotesCache([ref])
  assert.equal(quotes.length, 1)
  assert.equal(quotes[0].price, 1800)
  assert.ok(newestMs > 0)
})

test('ResearchHub portfolio_summary returns disk cache when memory TTL expired', async () => {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const {
    writePortfolioSummaryCache,
    resetRightPanelCacheForTests,
  } = await import('../packages/research-hub/dist/right-panel-cache.js')
  const { ok } = await import('../packages/shared/dist/result.js')

  resetRightPanelCacheForTests()
  writePortfolioSummaryCache(ok({
    totalCost: 500,
    totalMarketValue: 520,
    totalUnrealizedPnl: 20,
    totalRealizedPnl: 0,
    totalPnl: 20,
    totalPnlPct: 4,
    holdingsCount: 1,
    tradesCount: 1,
    holdings: [],
  }, '组合缓存'))

  const hub = new ResearchHub()
  const result = await hub.dispatch('portfolio_summary', {})
  assert.equal(result.success, true)
  assert.equal(result.data?.from_cache, true)
  assert.equal(result.data?.totalMarketValue, 520)
})

test('ResearchHub instrument_quotes returns disk cache before live refresh', async () => {
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const {
    writeInstrumentQuoteCache,
    resetRightPanelCacheForTests,
  } = await import('../packages/research-hub/dist/right-panel-cache.js')

  resetRightPanelCacheForTests()
  const ref = { market: 'CN', assetClass: 'EQUITY', symbol: '000001', exchange: 'SH' }
  writeInstrumentQuoteCache({
    instrument: ref,
    code: '000001',
    name: '平安银行',
    price: 12.5,
    change_pct: -0.3,
    source: 'live',
  })

  const hub = new ResearchHub()
  const result = await hub.dispatch('instrument_quotes', { instruments: [ref] })
  assert.equal(result.success, true)
  assert.equal(result.data?.from_cache, true)
  assert.equal(result.data?.quotes?.[0]?.price, 12.5)
})
