/**
 * Opptrix 统一标的 ID + 扶摇 fund 路由
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseOpptrixInstrumentId,
  normalizeInstrumentRef,
  buildInstrumentNamespace,
  buildOpptrixInstrumentId,
} from '../packages/shared/dist/instrument-symbol.js'
import { resolveFuyaoFundRoute } from '../packages/a-stock-layer/dist/providers/tonghuashun/api/fund-symbols.js'
import { resolveInstrumentQueryPlan } from '../packages/a-stock-layer/dist/core/instrument-query.js'
import { usesCnExchangeFundRealtimeRoute } from '../packages/a-stock-layer/dist/core/instrument.js'

test('REIT 扶摇档案/净值：fund_type=otc，thscode 保留 .SH/.SZ 后缀', () => {
  const route = resolveFuyaoFundRoute('508000.SH', { assetClass: 'REIT' })
  assert.ok(route)
  assert.equal(route.fundType, 'otc')
  assert.equal(route.thscode, '508000.SH')

  const reitSz = resolveFuyaoFundRoute('180102.SZ', { assetClass: 'REIT' })
  assert.ok(reitSz)
  assert.equal(reitSz.fundType, 'otc')
  assert.equal(reitSz.thscode, '180102.SZ')

  const bare = resolveFuyaoFundRoute('508000', { assetClass: 'REIT' })
  assert.ok(bare)
  assert.equal(bare.fundType, 'otc')
  assert.match(bare.thscode, /^508000\.(SH|SZ)$/)

  const bareWithEx = resolveFuyaoFundRoute('180102', { assetClass: 'REIT', exchange: 'SZ' })
  assert.ok(bareWithEx)
  assert.equal(bareWithEx.fundType, 'otc')
  assert.equal(bareWithEx.thscode, '180102.SZ')
})

test('ETF / LOF 扶摇 NAV 走 exchange', () => {
  const etf = resolveFuyaoFundRoute('510050', { assetClass: 'ETF' })
  assert.ok(etf)
  assert.equal(etf.fundType, 'exchange')
  assert.match(etf.thscode, /^510050\.(SH|SZ)$/)

  const lof = resolveFuyaoFundRoute('160105', { assetClass: 'LOF' })
  assert.ok(lof)
  assert.equal(lof.fundType, 'exchange')
})

test('LOF 走场内基金查询计划（etf_nav / exchange）', () => {
  assert.ok(usesCnExchangeFundRealtimeRoute('160105', 'LOF'))
  assert.ok(!usesCnExchangeFundRealtimeRoute('600519', 'EQUITY'))
  assert.ok(usesCnExchangeFundRealtimeRoute('160105'))

  const ref = normalizeInstrumentRef(parseOpptrixInstrumentId('CN:LOF:160105.SZ'))
  assert.equal(ref.assetClass, 'LOF')

  const navPlan = resolveInstrumentQueryPlan(ref, 'etf_nav')
  assert.ok(navPlan)
  assert.equal(navPlan.kind, 'registry')
  assert.equal(navPlan.assetClass, 'LOF')
  assert.equal(navPlan.method, 'etfNav')

  const snapPlan = resolveInstrumentQueryPlan(ref, 'etf_snapshot')
  assert.ok(snapPlan)
  assert.equal(snapPlan.kind, 'composite_snapshot')
  assert.equal(snapPlan.assetClass, 'LOF')
})

test('buildOpptrixInstrumentId — 在线搜索展示；内部键仍用命名空间', () => {
  const stock = normalizeInstrumentRef({
    market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH',
  })
  assert.equal(buildOpptrixInstrumentId(stock), 'CN:STOCK:600519.SH')
  assert.equal(buildInstrumentNamespace(stock), 'CN:SH.600519')

  const reit = normalizeInstrumentRef(parseOpptrixInstrumentId('CN:REIT:508000.SH'))
  assert.equal(buildOpptrixInstrumentId(reit), 'CN:REIT:508000.SH')

  const ind = normalizeInstrumentRef(parseOpptrixInstrumentId('CN:IND:881121.TI'))
  assert.equal(ind.assetClass, 'INDEX')
  assert.equal(ind.exchange, 'TI')
  assert.equal(buildOpptrixInstrumentId(ind), 'CN:IND:881121.TI')
  assert.equal(buildInstrumentNamespace(ind), 'CN:TI.881121')
})

test('US canonicalUsSymbol strips Tickflow .US suffix — no AAPL.US.US', () => {
  const fromTickflow = normalizeInstrumentRef({
    market: 'US',
    assetClass: 'EQUITY',
    symbol: 'AAPL.US',
  })
  assert.equal(fromTickflow.symbol, 'AAPL')
  assert.equal(buildOpptrixInstrumentId(fromTickflow), 'US:STOCK:AAPL.US')

  const fromLeak = normalizeInstrumentRef({
    market: 'US',
    assetClass: 'EQUITY',
    symbol: 'STOCK:AAPL.US',
  })
  assert.equal(fromLeak.symbol, 'AAPL')
  assert.equal(buildOpptrixInstrumentId(fromLeak), 'US:STOCK:AAPL.US')

  const roundtrip = parseOpptrixInstrumentId('US:STOCK:AAPL.US')
  assert.ok(roundtrip)
  assert.equal(buildOpptrixInstrumentId(normalizeInstrumentRef(roundtrip)), 'US:STOCK:AAPL.US')

  const leakedClassToken = normalizeInstrumentRef({
    market: 'US',
    assetClass: 'EQUITY',
    symbol: 'STOCKAAPL',
  })
  assert.equal(leakedClassToken.symbol, 'AAPL')
  assert.equal(buildOpptrixInstrumentId(leakedClassToken), 'US:STOCK:AAPL.US')

  const leakedOpptrix = parseOpptrixInstrumentId('US:STOCK:STOCKAAPL.US.US')
  assert.ok(leakedOpptrix)
  assert.equal(leakedOpptrix.symbol, 'AAPL')
  assert.equal(buildOpptrixInstrumentId(normalizeInstrumentRef(leakedOpptrix)), 'US:STOCK:AAPL.US')
})

test('HK canonicalHkSymbol strips leaked STOCK class token prefix', () => {
  const leaked = normalizeInstrumentRef({
    market: 'HK',
    assetClass: 'EQUITY',
    symbol: 'STOCK00700',
  })
  assert.equal(leaked.symbol, '00700')
  assert.equal(buildOpptrixInstrumentId(leaked), 'HK:STOCK:00700.HK')
})
