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

test('Engine resolveInstrumentQueryPlan JP snapshot', () => {
  const plan = resolveInstrumentQueryPlan(
    { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
    'snapshot',
  )
  assert.equal(plan?.kind, 'composite_snapshot')
  if (plan?.kind === 'composite_snapshot') {
    assert.equal(plan.market, 'JP')
    assert.equal(plan.symbol, '7203')
  }
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

test('instrumentRefKey includes crypto quote for dedupe', () => {
  const btc = normalizeInstrumentRef({
    market: 'CRYPTO',
    assetClass: 'CRYPTO_SPOT',
    symbol: 'btc',
    quote: 'usdt',
    exchange: 'binance',
  })
  assert.equal(instrumentRefKey(btc), 'CRYPTO:CRYPTO_SPOT:BTC:USDT:binance')
})
