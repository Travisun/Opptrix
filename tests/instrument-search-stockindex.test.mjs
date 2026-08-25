/**
 * 标的搜索 — 扶摇 + Tickflow 编排 / 排序 / 别名回归
 *
 * 单元：排序 / 别名 / looksLikeInstrumentCode（无 Key）；
 * 联调：需 `FUYAO_TOKEN` 或 `OPPTRIX_FUYAO_API_KEY`（CN 名称）；精确代码走 Tickflow free。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeInstrumentRef, buildInstrumentNamespace } from '../packages/shared/dist/instrument-symbol.js'

const HAS_FUYAO = Boolean(
  process.env.FUYAO_TOKEN
  || process.env.OPPTRIX_FUYAO_API_KEY
  || process.env.OPPTRIX_TONGHUASHUN_API_KEY,
)

function makeHit(market, symbol, name, assetClass = 'EQUITY') {
  const instrument = normalizeInstrumentRef({
    market,
    assetClass,
    symbol,
    exchange: market === 'HK' ? 'HK' : market === 'CN' && assetClass === 'FUND' ? 'PF' : undefined,
  })
  const ns = buildInstrumentNamespace(instrument)
  return {
    code: ns,
    name,
    market: instrument.market,
    assetClass: instrument.assetClass,
    exchange: instrument.exchange ?? null,
    instrument,
    refLabel: ns,
    source: 'online',
  }
}

test('rankInstrumentSearchHits — 00700 精确匹配港股优先于无关 CN 基金', async () => {
  const {
    rankInstrumentSearchHits,
  } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')

  const clutter = [
    makeHit('CN', '000700', '某货币基金A', 'FUND'),
    makeHit('CN', '007001', '某债券基金', 'FUND'),
    makeHit('CN', '159700', '某ETF', 'ETF'),
    makeHit('CN', '000701', '某股票', 'EQUITY'),
    makeHit('CN', '000702', '某股票2', 'EQUITY'),
    makeHit('CN', '000703', '某股票3', 'EQUITY'),
    makeHit('CN', '000704', '某股票4', 'EQUITY'),
    makeHit('CN', '000705', '某股票5', 'EQUITY'),
    makeHit('HK', '00700', '腾讯控股', 'EQUITY'),
    makeHit('CN', '000706', '某股票6', 'EQUITY'),
  ]

  const ranked = rankInstrumentSearchHits(clutter, '00700')
  const top8 = ranked.slice(0, 8)
  const hk = top8.find(h => h.market === 'HK' && h.instrument.symbol === '00700')
  assert.ok(hk, 'limit=8 时必须含 HK:00700')
  assert.equal(ranked[0]?.market, 'HK')
  assert.equal(ranked[0]?.instrument.symbol, '00700')
  const fundIdx = ranked.findIndex(h => h.assetClass === 'FUND')
  const hkIdx = ranked.findIndex(h => h.market === 'HK' && h.instrument.symbol === '00700')
  assert.ok(fundIdx < 0 || hkIdx < fundIdx, '精确 HK:00700 应排在无关 FUND 之前')
})

test('resolveSearchAliasTargets — 腾讯 / 阿里 别名注入', async () => {
  const {
    resolveSearchAliasTargets,
  } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')

  const tencent = resolveSearchAliasTargets('腾讯')
  assert.ok(tencent.some(t => t.market === 'HK' && t.symbol === '00700'))

  const ali = resolveSearchAliasTargets('阿里')
  assert.ok(ali.some(t => t.market === 'US' && t.symbol === 'BABA'))
  assert.ok(ali.some(t => t.market === 'HK' && t.symbol === '09988'))

  const apple = resolveSearchAliasTargets('苹果')
  assert.ok(apple.some(t => t.market === 'US' && t.symbol === 'AAPL'))

  assert.deepEqual(resolveSearchAliasTargets('不存在的别名xyz'), [])
})

test('looksLikeInstrumentCode — 代码形态识别', async () => {
  const { looksLikeInstrumentCode } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  assert.equal(looksLikeInstrumentCode('AAPL'), true)
  assert.equal(looksLikeInstrumentCode('00700'), true)
  assert.equal(looksLikeInstrumentCode('600519'), true)
  assert.equal(looksLikeInstrumentCode('贵州茅台'), false)
  assert.equal(looksLikeInstrumentCode('腾讯'), false)
})

test('rankInstrumentSearchHits — AAPL / 茅台码不破坏精确匹配', async () => {
  const { rankInstrumentSearchHits } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const aapl = rankInstrumentSearchHits([
    makeHit('US', 'AAPL', 'Apple'),
    makeHit('US', 'AAP', 'Advance Auto'),
  ], 'AAPL')
  assert.equal(aapl[0]?.instrument.symbol, 'AAPL')

  const moutai = rankInstrumentSearchHits([
    makeHit('CN', '600519', '贵州茅台'),
    makeHit('CN', '600518', '康美药业'),
  ], '600519')
  assert.equal(moutai[0]?.instrument.symbol, '600519')
})

test('searchInstrumentsOnline — 中文别名兜底（无扶摇亦可返回美/港）', { timeout: 15_000 }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const de = new MarketDataEngine(false)

  const tencent = await searchInstrumentsOnline(de, '腾讯', 10)
  assert.ok(
    tencent.some(h => h.market === 'HK' && h.instrument.symbol === '00700'),
    '腾讯应返回 HK:00700（别名或 Tickflow）',
  )

  const ali = await searchInstrumentsOnline(de, '阿里', 10)
  assert.ok(
    ali.some(h => h.market === 'US' && h.instrument.symbol === 'BABA'),
    '阿里应返回 US:BABA（别名）',
  )
  assert.ok(
    ali.some(h => h.market === 'HK' && h.instrument.symbol === '09988'),
    '阿里应返回 HK:09988（别名）',
  )
})

test('searchInstrumentsOnline — 无扶摇 Key 时别名仍可用', { timeout: 15_000 }, async () => {
  const prev = process.env.OPPTRIX_STOCKINDEX_API_KEY
  delete process.env.OPPTRIX_STOCKINDEX_API_KEY
  try {
    const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
    const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
    const de = new MarketDataEngine(false)
    const hits = await searchInstrumentsOnline(de, '腾讯', 5)
    assert.ok(hits.length > 0, '别名路径仍应有结果')
    assert.ok(hits.every(h => h.source === 'online' || h.source === 'stock_index' || h.source === 'alias'))
  } finally {
    if (prev !== undefined) process.env.OPPTRIX_STOCKINDEX_API_KEY = prev
  }
})

test('searchInstrumentsOnline — 扶摇 CN 名称「茅台」', { timeout: 30_000, skip: !HAS_FUYAO }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const de = new MarketDataEngine(false)

  const hits = await searchInstrumentsOnline(de, '茅台', 10, ['CN'])
  assert.ok(
    hits.some(h => h.instrument.symbol === '600519' && h.market === 'CN'),
    '扶摇应能搜到贵州茅台 600519',
  )
  assert.ok(hits.every(h => h.source === 'online'))
})

test('searchInstrumentsOnline — Tickflow 精确 AAPL / 600519', { timeout: 30_000 }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const de = new MarketDataEngine(false)

  const us = await searchInstrumentsOnline(de, 'AAPL', 5, ['US'])
  // Tickflow free 通常可用；失败时至少不抛
  if (us.length) {
    assert.ok(us.some(h => h.instrument.symbol === 'AAPL'))
  }

  const cn = await searchInstrumentsOnline(de, '600519', 5, ['CN'])
  if (cn.length) {
    assert.ok(cn.some(h => h.instrument.symbol === '600519'))
  }
})
