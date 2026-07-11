import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveInstrumentFromParams,
  instrumentRefsFromList,
  normalizeInstrumentHubParams,
} from '../packages/shared/dist/instrument-param.js'
import {
  normalizeInstrumentRef,
  canonicalHkSymbol,
  instrumentRefLabel,
} from '../packages/shared/dist/instrument-symbol.js'
import { instrumentRefKey } from '../packages/shared/dist/instrument-ref.js'
import {
  INSTRUMENT_HUB_FEATURE,
  LEGACY_HUB_FEATURE_SHIM,
  resolveInstrumentHubFeature,
} from '../packages/shared/dist/instrument-hub.js'
import {
  resolveInstrumentQueryPlan,
} from '../packages/a-stock-layer/dist/core/instrument-query.js'

test('resolveInstrumentFromParams — legacy code and explicit market', () => {
  const cn = resolveInstrumentFromParams({ code: '600519' })
  assert.equal(cn?.market, 'CN')
  assert.equal(cn?.symbol, '600519')

  const us = resolveInstrumentFromParams({ market: 'US', symbol: 'AAPL' })
  assert.equal(us?.market, 'US')
  assert.equal(us?.symbol, 'AAPL')

  const crypto = resolveInstrumentFromParams({ code: 'BTC/USDT' })
  assert.equal(crypto?.market, 'CRYPTO')
  assert.equal(crypto?.symbol, 'BTC')
  assert.equal(crypto?.quote, 'USDT')

  const prefixed = resolveInstrumentFromParams({ code: 'HK:0700' })
  assert.equal(prefixed?.market, 'HK')
  assert.equal(prefixed?.symbol, '00700')
})

test('instrumentRefsFromList batch resolves mixed legacy codes', () => {
  const refs = instrumentRefsFromList(['600519', 'AAPL'])
  assert.equal(refs.length, 2)
  assert.equal(refs[0]?.market, 'CN')
  assert.equal(refs[1]?.market, 'US')
})

test('instrumentRefsFromList resolves CN-only numeric codes', () => {
  const refs = instrumentRefsFromList(['600519', '000001', '510300'])
  assert.equal(refs.length, 3)
  assert.ok(refs.every(r => r.market === 'CN'))
  assert.equal(refs[0]?.symbol, '600519')
  assert.equal(refs[2]?.assetClass, 'ETF')
})

test('LEGACY_HUB_FEATURE_SHIM maps major legacy features to instrument capabilities', () => {
  const expected = [
    ['stock_detail', 'snapshot'],
    ['stock_quotes', 'quotes'],
    ['stock_chart', 'chart'],
    ['stock_kline', 'chart'],
    ['stock_cyq', 'cyq'],
    ['us_snapshot', 'snapshot'],
    ['us_realtime', 'quotes'],
    ['us_kline', 'chart'],
    ['crypto_snapshot', 'snapshot'],
    ['crypto_realtime', 'quotes'],
    ['crypto_kline', 'chart'],
    ['batch_stock_snapshots', 'batch_snapshots'],
    ['stock_diagnosis', 'evaluation'],
    ['latest_evaluation', 'evaluation'],
    ['strategy_signal', 'strategy_signal'],
    ['strategy_verify', 'strategy_verify'],
    ['institution_rating', 'institution_rating'],
    ['institution_report', 'institution_report'],
    ['search_stocks', 'search'],
    ['etf_snapshot', 'snapshot'],
  ]
  for (const [legacy, cap] of expected) {
    assert.equal(LEGACY_HUB_FEATURE_SHIM[legacy], cap, `${legacy} → ${cap}`)
    assert.equal(resolveInstrumentHubFeature(legacy), INSTRUMENT_HUB_FEATURE[cap], `${legacy} feature name`)
  }
})

test('legacy hub feature shims map to instrument_*', () => {
  assert.equal(resolveInstrumentHubFeature('stock_detail'), INSTRUMENT_HUB_FEATURE.snapshot)
  assert.equal(resolveInstrumentHubFeature('us_kline'), INSTRUMENT_HUB_FEATURE.chart)
  assert.equal(LEGACY_HUB_FEATURE_SHIM.stock_cyq, 'cyq')
})

test('normalizeInstrumentHubParams injects instrument object', () => {
  const out = normalizeInstrumentHubParams({ code: '600519' })
  assert.ok(out.instrument)
  assert.equal(out.instrument.market, 'CN')
})

test('Engine resolveInstrumentQueryPlan uses registry for US realtime', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
    'realtime',
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.market, 'US')
    assert.equal(plan.method, 'realtime')
    assert.deepEqual(plan.args, ['AAPL'])
  }
})

test('Engine resolveInstrumentQueryPlan CN ETF uses registry asset class', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'ETF', symbol: '510300' },
    'realtime',
  )
  assert.equal(plan?.kind, 'cn_realtime')
})

test('Engine resolveInstrumentQueryPlan CRYPTO realtime', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'BTC', quote: 'USDT' },
    'realtime',
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.market, 'CRYPTO')
    assert.equal(plan.method, 'realtime')
    assert.deepEqual(plan.args, ['BTC/USDT'])
  }
})

test('Engine resolveInstrumentQueryPlan HK kline', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'HK', assetClass: 'EQUITY', symbol: '00700' },
    'kline',
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.market, 'HK')
    assert.equal(plan.method, 'kline')
    assert.deepEqual(plan.args, ['00700', 'daily', '', '', 120])
  }
})

test('Engine resolveInstrumentQueryPlan JP snapshot returns null (not connected)', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
    'snapshot',
  )
  assert.equal(plan, null)
})

test('Engine resolveInstrumentQueryPlan KR instrument_search returns null (not connected)', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'KR', assetClass: 'EQUITY', symbol: '005930' },
    'instrument_search',
    { keyword: '三星' },
  )
  assert.equal(plan, null)
})

test('Engine resolveInstrumentQueryPlan CN ETF nav uses registry', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'ETF', symbol: '510300' },
    'etf_nav',
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.method, 'etfNav')
    assert.deepEqual(plan.args, ['510300'])
  }
})

test('Engine resolveInstrumentQueryPlan CN ETF snapshot uses composite', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'ETF', symbol: '510300' },
    'etf_snapshot',
  )
  assert.equal(plan?.kind, 'cn_etf_snapshot')
  if (plan?.kind === 'cn_etf_snapshot') {
    assert.equal(plan.symbol, '510300')
  }
})

test('AkShare custom methods are registered', async () => {
  const { listProviderCustomMethods } = await import('../packages/a-stock-layer/dist/core/custom-methods.js')
  const ak = listProviderCustomMethods('akshare')
  assert.equal(ak.length, 1)
  assert.ok(ak[0] && ak[0].methods.length >= 200)
  assert.ok(ak[0].methods.some(m => m.method === 'bondZhHsDaily'))
})

test('Engine resolveInstrumentQueryPlan CN instrument_search uses registry', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'EQUITY', symbol: '000001' },
    'instrument_search',
    { keyword: '600519', pageSize: 20 },
  )
  assert.equal(plan?.kind, 'registry')
  if (plan?.kind === 'registry') {
    assert.equal(plan.method, 'instrumentSearch')
    assert.deepEqual(plan.args, ['600519', 'CN', 20])
  }
})

test('canonical symbol normalization across markets', () => {
  assert.equal(canonicalHkSymbol('700'), '00700')
  assert.equal(canonicalHkSymbol('0700'), '00700')
  const hk = normalizeInstrumentRef({ market: 'HK', assetClass: 'EQUITY', symbol: '700' })
  assert.equal(hk.symbol, '00700')
  assert.equal(instrumentRefLabel(hk), 'HK:00700')
  const cn = normalizeInstrumentRef({ market: 'CN', assetClass: 'EQUITY', symbol: '519' })
  assert.equal(cn.symbol, '000519')
})

test('instrumentRefKey uses stock-index namespace without assetClass', () => {
  const sz = normalizeInstrumentRef({
    market: 'CN', assetClass: 'EQUITY', symbol: '000977', exchange: 'SZ',
  })
  assert.equal(instrumentRefKey(sz), 'CN:SZ.000977')
  const sh = normalizeInstrumentRef({
    market: 'CN', assetClass: 'INDEX', symbol: '000977', exchange: 'SH',
  })
  assert.equal(instrumentRefKey(sh), 'CN:SH.000977')

  const btc = normalizeInstrumentRef({
    market: 'CRYPTO',
    assetClass: 'CRYPTO_SPOT',
    symbol: 'btc',
    quote: 'usdt',
    exchange: 'binance',
  })
  assert.equal(instrumentRefKey(btc), 'CRYPTO:BINANCE.BTC/USDT')
})

test('parseInstrumentNamespace — CN:SZ.000009', async () => {
  const { parseInstrumentNamespace, buildInstrumentNamespace, instrumentRefLabel } = await import(
    '../packages/shared/dist/instrument-symbol.js'
  )
  const ref = parseInstrumentNamespace('CN:SZ.000009')
  assert.equal(ref?.market, 'CN')
  assert.equal(ref?.symbol, '000009')
  assert.equal(ref?.exchange, 'SZ')
  assert.equal(buildInstrumentNamespace(ref), 'CN:SZ.000009')
  assert.equal(instrumentRefLabel(ref), 'CN:SZ.000009')
})

test('parseInstrumentRef resolves namespace in symbol field', async () => {
  const { parseInstrumentRef } = await import('../packages/shared/dist/instrument-ref.js')
  const ref = parseInstrumentRef({ market: 'CN', symbol: 'CN:SZ.000009' })
  assert.equal(ref?.symbol, '000009')
  assert.equal(ref?.exchange, 'SZ')
})

test('listCustomMethodsForAgent truncates large providers and supports keyword', async () => {
  const { listCustomMethodsForAgent } = await import('../packages/a-stock-layer/dist/core/custom-methods-agent.js')
  const all = listCustomMethodsForAgent()
  const ak = all.providers.find(p => p.providerId === 'akshare')
  assert.ok(ak)
  assert.ok(ak.methodCount > 50)
  assert.equal(ak.truncated, true)
  assert.ok(ak.categoryHints?.length)
  const bond = listCustomMethodsForAgent({ providerId: 'akshare', keyword: 'bond', limit: 10 })
  assert.ok(bond.providers[0].methods.length <= 10)
  assert.ok(bond.providers[0].methods.some(m => m.method.toLowerCase().includes('bond')))
  const baostock = listCustomMethodsForAgent({ providerId: 'baostock' })
  assert.ok(baostock.providers[0].methods.length > 0)
  assert.ok(!baostock.providers[0].truncated)
})

test('resolveCnInstrumentIdentity — exchange-first for ambiguous 000977', async () => {
  const {
    resolveCnInstrumentIdentity,
    normalizeInstrumentRef,
    parseCanonicalInstrumentInput,
  } = await import('../packages/shared/dist/instrument-symbol.js')

  const szStock = resolveCnInstrumentIdentity({
    market: 'CN', symbol: '000977', exchange: 'SZ', assetClass: 'EQUITY',
  })
  assert.equal(szStock.exchange, 'SZ')
  assert.equal(szStock.assetClass, 'EQUITY')

  const shIndex = resolveCnInstrumentIdentity({
    market: 'CN', symbol: '000977', exchange: 'SH', assetClass: 'INDEX',
  })
  assert.equal(shIndex.exchange, 'SH')
  assert.equal(shIndex.assetClass, 'INDEX')

  const parsed = parseCanonicalInstrumentInput('CN:SZ.000009')
  assert.equal(parsed?.exchange, 'SZ')
  assert.equal(parsed?.symbol, '000009')
  assert.equal(parsed?.assetClass, 'EQUITY')

  const normalized = normalizeInstrumentRef({
    market: 'CN', symbol: '000977', exchange: 'SZ', assetClass: 'EQUITY',
  })
  assert.equal(normalized.exchange, 'SZ')
  assert.equal(normalized.assetClass, 'EQUITY')
})

test('inferCnAssetClassFromSymbol — 000977 defaults to SZ equity without exchange', async () => {
  const { inferCnAssetClassFromSymbol, isCnIndexSymbolByExchange } = await import(
    '../packages/shared/dist/instrument-symbol.js'
  )
  assert.equal(inferCnAssetClassFromSymbol('000977'), 'EQUITY')
  assert.equal(inferCnAssetClassFromSymbol('000977', 'SZ'), 'EQUITY')
  assert.equal(inferCnAssetClassFromSymbol('000977', 'SH'), 'INDEX')
  assert.equal(isCnIndexSymbolByExchange('000977', 'SH'), true)
  assert.equal(isCnIndexSymbolByExchange('000977', 'SZ'), false)
})

test('inferCnAssetClassFromSymbol — 000001 defaults to equity, 000300 stays index', async () => {
  const { inferCnAssetClassFromSymbol } = await import('../packages/shared/dist/instrument-symbol.js')
  assert.equal(inferCnAssetClassFromSymbol('000001'), 'EQUITY')
  assert.equal(inferCnAssetClassFromSymbol('000001', 'SH'), 'INDEX')
  assert.equal(inferCnAssetClassFromSymbol('000300'), 'INDEX')
  assert.equal(inferCnAssetClassFromSymbol('000300', 'SH'), 'INDEX')
})

test('Engine resolveInstrumentQueryPlan CN realtime preserves exchange', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'EQUITY', symbol: '000977', exchange: 'SZ' },
    'realtime',
  )
  assert.equal(plan?.kind, 'cn_realtime')
  if (plan?.kind === 'cn_realtime') {
    assert.equal(plan.symbol, '000977')
    assert.equal(plan.exchange, 'SZ')
  }

  const indexPlan = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'INDEX', symbol: '000977', exchange: 'SH' },
    'realtime',
  )
  assert.equal(indexPlan?.kind, 'cn_realtime')
  if (indexPlan?.kind === 'cn_realtime') {
    assert.equal(indexPlan.symbol, '000977')
    assert.equal(indexPlan.exchange, 'SH')
  }
})

test('parseInstrumentNamespace — CN colon typo CN:SH:000977', async () => {
  const { parseInstrumentNamespace, buildInstrumentNamespace } = await import('../packages/shared/dist/instrument-symbol.js')
  const ref = parseInstrumentNamespace('CN:SH:000977')
  assert.ok(ref)
  assert.equal(ref.exchange, 'SH')
  assert.equal(ref.assetClass, 'INDEX')
  assert.equal(buildInstrumentNamespace(ref), 'CN:SH.000977')
})

test('parseCanonicalInstrumentInput — CN:SH:000977 body exchange', async () => {
  const { parseCanonicalInstrumentInput, buildInstrumentNamespace } = await import('../packages/shared/dist/instrument-symbol.js')
  const ref = parseCanonicalInstrumentInput('CN:SH:000977')
  assert.ok(ref)
  assert.equal(ref.exchange, 'SH')
  assert.equal(ref.assetClass, 'INDEX')
  assert.equal(buildInstrumentNamespace(ref), 'CN:SH.000977')
})

test('cnSecSymbol — 000977 exchange disambiguation', async () => {
  const { cnSecSymbol } = await import('../packages/a-stock-layer/dist/utils/helpers.js')
  assert.equal(cnSecSymbol('000977', 'SZ'), 'sz000977')
  assert.equal(cnSecSymbol('000977', 'SH'), 'sh000977')
})

test('mergeDetailQuoteRows prefers exchange-aware fallback name', async () => {
  const { mergeDetailQuoteRows } = await import('../packages/research-hub/dist/stock-detail-normalize.js')
  const merged = mergeDetailQuoteRows('000977', { name: '内地低碳', price: 1 }, { name: '浪潮信息', price: 2 })
  assert.equal(merged?.name, '浪潮信息')
  assert.equal(merged?.price, 2)
  assert.equal(merged?.pe, null)
})

test('normalizeCustomMethodArgs converts instrument formats per provider', async () => {
  const { normalizeCustomMethodArgs } = await import('../packages/a-stock-layer/dist/core/custom-method-args.js')
  const { findCustomMethod } = await import('../packages/a-stock-layer/dist/core/custom-methods.js')

  const bsDef = findCustomMethod('baostock', 'bsStockConcept')
  assert.ok(bsDef)
  const bs = normalizeCustomMethodArgs('baostock', bsDef, ['600519.SH'])
  assert.equal(bs.args[0], '600519.SH')

  const tfDef = findCustomMethod('tickflow', 'fetchDepth')
  assert.ok(tfDef)
  const tf = normalizeCustomMethodArgs('tickflow', tfDef, [{ market: 'CN', symbol: '600519' }])
  assert.equal(tf.args[0], '600519.SH')

  const tcDef = findCustomMethod('tencent', 'tencentCnIndexSnapshot')
  assert.ok(tcDef)
  const tc = normalizeCustomMethodArgs('tencent', tcDef, ['major', false, 'sh600519,sz399001'])
  assert.match(String(tc.args[2]), /sh600519/)
  assert.match(String(tc.args[2]), /sz399001/)
})

test('wireProviderSymbolArg — 000977 per provider and exchange', async () => {
  const { wireProviderSymbolArg, wireRegistryMethodArgs } = await import(
    '../packages/a-stock-layer/dist/core/provider-wire.js'
  )
  const szEquity = { market: 'CN', assetClass: 'EQUITY', symbol: '000977', exchange: 'SZ' }
  const shIndex = { market: 'CN', assetClass: 'INDEX', symbol: '000977', exchange: 'SH' }

  assert.equal(wireProviderSymbolArg('tencent', 'code', 'realtime', szEquity), 'sz000977')
  assert.equal(wireProviderSymbolArg('tencent', 'code', 'realtime', shIndex), 'sh000977')
  assert.equal(wireProviderSymbolArg('sinafinance', 'code', 'moneyFlow', szEquity), 'sz000977')
  assert.equal(wireProviderSymbolArg('tushare', 'code', 'profile', szEquity), '000977.SZ')
  assert.equal(wireProviderSymbolArg('tushare', 'code', 'profile', shIndex), '000977.SH')
  assert.equal(wireProviderSymbolArg('tencent', 'code', 'profile', szEquity), '000977')
  assert.equal(wireProviderSymbolArg('baostock', 'code', 'kline', szEquity), '000977.SZ')

  const wired = wireRegistryMethodArgs('tencent', 'realtime', ['000977'], szEquity)
  assert.equal(wired[0], 'sz000977')
  const wiredTushare = wireRegistryMethodArgs('tushare', 'financials', ['000977', '', 'all'], szEquity)
  assert.equal(wiredTushare[0], '000977.SZ')
  assert.equal(wiredTushare[1], '')
  assert.equal(wiredTushare[2], 'all')
})

test('resolveInstrumentQueryPlan US/HK/Crypto registry carries ref for wire', () => {
  const us = resolveInstrumentQueryPlan(
    { market: 'US', assetClass: 'EQUITY', symbol: 'aapl' },
    'realtime',
  )
  assert.equal(us?.kind, 'registry')
  if (us?.kind === 'registry') {
    assert.equal(us.ref?.market, 'US')
    assert.equal(us.ref?.symbol, 'AAPL')
    assert.equal(us.args[0], 'AAPL')
  }

  const hk = resolveInstrumentQueryPlan(
    { market: 'HK', assetClass: 'EQUITY', symbol: '700' },
    'kline',
    { count: 60 },
  )
  assert.equal(hk?.kind, 'registry')
  if (hk?.kind === 'registry') {
    assert.equal(hk.ref?.market, 'HK')
    assert.equal(hk.ref?.symbol, '00700')
    assert.equal(hk.args[0], '00700')
  }

  const crypto = resolveInstrumentQueryPlan(
    { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'BTC', quote: 'USDT' },
    'realtime',
  )
  assert.equal(crypto?.kind, 'registry')
  if (crypto?.kind === 'registry') {
    assert.equal(crypto.ref?.market, 'CRYPTO')
    assert.equal(crypto.ref?.symbol, 'BTC')
    assert.equal(crypto.args[0], 'BTC/USDT')
  }
})

test('ensureCnSecSymbol — idempotent for wired sec input', async () => {
  const { ensureCnSecSymbol, bareCnSymbol, secFullCode } = await import(
    '../packages/a-stock-layer/dist/utils/helpers.js'
  )
  assert.equal(ensureCnSecSymbol('sz000977'), 'sz000977')
  assert.equal(ensureCnSecSymbol('SH000977'), 'sh000977')
  assert.equal(secFullCode('sz000977'), 'sz000977')
  assert.equal(bareCnSymbol('sz000977'), '000977')
  assert.equal(bareCnSymbol('000977.SZ'), '000977')
})

test('wireProviderSymbolArg — dot-suffix providers with exchange', async () => {
  const { wireProviderSymbolArg } = await import(
    '../packages/a-stock-layer/dist/core/provider-wire.js'
  )
  const szEquity = { market: 'CN', assetClass: 'EQUITY', symbol: '000977', exchange: 'SZ' }
  assert.equal(wireProviderSymbolArg('tickflow', 'code', 'realtime', szEquity), '000977.SZ')
  assert.equal(wireProviderSymbolArg('zzshare', 'code', 'kline', szEquity), '000977.SZ')
  assert.equal(wireProviderSymbolArg('baostock', 'code', 'kline', szEquity), '000977.SZ')
  assert.equal(wireProviderSymbolArg('tonghuashun', 'code', 'realtime', szEquity), '000977.SZ')
})

test('resolveTencentWireMarket — single provider multi-market wire', async () => {
  const { resolveTencentWireMarket, bareTencentWireSymbol } = await import(
    '../packages/a-stock-layer/dist/providers/tencent/market-router.js'
  )
  assert.equal(resolveTencentWireMarket('AAPL'), 'US')
  assert.equal(resolveTencentWireMarket('00700'), 'HK')
  assert.equal(resolveTencentWireMarket('sz000977'), 'CN')
  assert.equal(bareTencentWireSymbol('sz000977'), '000977')
})

test('resolveInstrumentQueryPlan — detail capabilities CN/US/HK', () => {
  const cnRef = { market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' }
  const dividend = resolveInstrumentQueryPlan(cnRef, 'dividend')
  assert.equal(dividend?.kind, 'registry')
  if (dividend?.kind === 'registry') {
    assert.equal(dividend.method, 'dividend')
    assert.equal(dividend.ref?.exchange, 'SH')
  }

  const notices = resolveInstrumentQueryPlan(cnRef, 'notices', { page: 1, pageSize: 20 })
  assert.equal(notices?.kind, 'registry')
  if (notices?.kind === 'registry') {
    assert.equal(notices.method, 'news')
    assert.equal(notices.args[3], 'notice')
  }

  const usRef = { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' }
  const usNews = resolveInstrumentQueryPlan(usRef, 'news', { page: 1, pageSize: 10 })
  assert.equal(usNews?.kind, 'registry')
  if (usNews?.kind === 'registry') assert.equal(usNews.method, 'news')

  const hkRef = { market: 'HK', assetClass: 'EQUITY', symbol: '00700' }
  const hkDiv = resolveInstrumentQueryPlan(hkRef, 'dividend', { page: 1, pageSize: 10 })
  assert.equal(hkDiv?.kind, 'registry')
  if (hkDiv?.kind === 'registry') assert.equal(hkDiv.method, 'dividend')

  const hkTech = resolveInstrumentQueryPlan(hkRef, 'technical_analysis')
  assert.equal(hkTech?.kind, 'registry')
  if (hkTech?.kind === 'registry') assert.equal(hkTech.method, 'technicalAnalysis')
})

test('stockMetaLookupKey — composite exchange:code', async () => {
  const { MarketDataStore } = await import('../packages/market-data/dist/store.js')
  const store = new MarketDataStore(':memory:')
  try {
    assert.equal(store.stockMetaLookupKey('000977', 'SZ'), 'SZ:000977')
    assert.equal(store.stockMetaLookupKey('600519'), '600519')
  } finally {
    store.close()
  }
})
