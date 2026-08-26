import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyValuationToStockRealtime,
  buildValuationProfileMetrics,
  mapLimitDownRow,
  mapValuationSnapshotItem,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/normalize/index.js'
import {
  computeEtfPremiumRate,
  mapFundHoldingsToEtfRows,
  mapFundHistoricalBarsToKlines,
  mapFundHoldersToProfileFields,
  mapFundMarketSnapshotToStockRealtime,
  mapFundNavRows,
  mapFundProfileToEtfProfileRow,
  mapFundReturnsToPerformance,
  mapFundTickerToListItem,
  pickFundHolderRow,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/normalize/fund.js'

test('mapValuationSnapshotItem maps pe_ttm→pe and pb_mrq→pb', () => {
  const mapped = mapValuationSnapshotItem({
    thscode: '600519.SH',
    pe_ttm: 21.3567,
    pe_mrq: 20.8841,
    pb_mrq: 7.1532,
    ps_ttm: 10.3284,
    pcf_ttm: 19.7716,
  })
  assert.ok(mapped)
  assert.equal(mapped.pe, 21.3567)
  assert.equal(mapped.pb, 7.1532)
  assert.equal(mapped.extras.pe_mrq, 20.8841)
  assert.equal(mapped.extras.ps_ttm, 10.3284)
  assert.equal(mapped.extras.pcf_ttm, 19.7716)
})

test('mapLimitDownRow maps type limit_down and aliases', () => {
  const mapped = mapLimitDownRow({
    thscode: '000001.SZ',
    name: '平安银行',
    trade_date: '2024-01-15',
    price_change_ratio_pct: -9.98,
    limit_down_reason: '大盘拖累',
    last_limit_time: '09:35',
  })
  assert.equal(mapped.code, '000001')
  assert.equal(mapped.name, '平安银行')
  assert.equal(mapped.type, 'limit_down')
  assert.equal(mapped.date, '2024-01-15')
  assert.equal(mapped.changePct, -9.98)
  assert.equal(mapped.reason, '大盘拖累')
})

test('applyValuationToStockRealtime merges pe/pb without breaking other fields', () => {
  const rt = applyValuationToStockRealtime({
    code: '600519',
    name: '贵州茅台',
    price: 1800,
    changePct: 1.2,
    pe: null,
    pb: null,
    turnoverRate: null,
    volume: 100,
    amount: 200,
  }, mapValuationSnapshotItem({ pe_ttm: 21.3, pb_mrq: 7.1 }))
  assert.equal(rt.pe, 21.3)
  assert.equal(rt.pb, 7.1)
  assert.equal(rt.price, 1800)
})

test('buildValuationProfileMetrics uses Chinese labels', () => {
  const metrics = buildValuationProfileMetrics({ pe_ttm: 21.3, pb_mrq: 7.1, ps_ttm: 10.2 })
  assert.ok(metrics.some(m => m.label === '市盈率（TTM）' && m.value.includes('21')))
  assert.ok(metrics.some(m => m.label === '市净率（MRQ）'))
  assert.ok(metrics.some(m => m.label === '市销率（TTM）'))
})

test('pickFundHolderRow prefers separate scope with latest report', () => {
  const row = pickFundHolderRow([
    { merge_scope: 'merged', report_date_ms: 1609344000000, holder_amount: 100 },
    { merge_scope: 'separate', report_date_ms: 1767110400000, holder_amount: 3951034 },
  ])
  assert.equal(row?.holder_amount, 3951034)
})

test('mapFundHoldersToProfileFields maps holder_amount and ins_position', () => {
  const fields = mapFundHoldersToProfileFields([
    {
      merge_scope: 'separate',
      report_date_ms: 1767110400000,
      holder_amount: 3951034,
      avg_holder_share: 10159.83,
      ins_position: 0.97,
      psnl_rate: 99.03,
    },
  ])
  assert.ok(fields)
  assert.equal(fields.holderAmount, 3951034)
  assert.equal(fields.avgHolderShare, 10159.83)
  assert.equal(fields.instHolderRatio, 0.97)
  assert.equal(fields.indivHolderRatio, 99.03)
  assert.ok(fields.holderReportDate)
})

test('mapFundProfileToEtfProfileRow merges holder fields', () => {
  const row = mapFundProfileToEtfProfileRow('510300', {
    fund_name: '沪深300ETF',
    estab_date: 1386028800000,
  }, {
    holders: {
      holderAmount: 1000,
      instHolderRatio: 12.5,
      indivHolderRatio: 87.5,
    },
  })
  assert.equal(row.holderAmount, 1000)
  assert.equal(row.instHolderRatio, 12.5)
})

test('computeEtfPremiumRate uses percent convention', () => {
  const premium = computeEtfPremiumRate(4.753, 4.71)
  assert.ok(premium != null)
  assert.ok(Math.abs(premium - 0.913) < 0.01)
})

test('mapFundProfileToEtfProfileRow maps Fuyao profile + nav + premium', () => {
  const row = mapFundProfileToEtfProfileRow('510300', {
    thscode: '510300.SH',
    ticker: '510300',
    fund_name: '沪深300ETF',
    estab_date: 1386028800000,
    mgmt_name: '华夏基金管理有限公司',
    manager_name: '张某某',
  }, {
    nav: 4.71,
    premiumRate: 0.91,
    returns: { return_year: 19.66, return_nowyear: 2.49 },
  })
  assert.equal(row.code, '510300')
  assert.equal(row.name, '沪深300ETF')
  assert.equal(row.fundType, 'ETF')
  assert.equal(row.manager, '张某某')
  assert.equal(row.company, '华夏基金管理有限公司')
  assert.equal(row.nav, 4.71)
  assert.equal(row.premiumRate, 0.91)
  assert.equal(row.source, 'tonghuashun')
  assert.equal(row.performance?.w52, 19.66)
  assert.equal(row.performance?.year, 2.49)
})

test('mapFundNavRows converts nav_date ms and changePct', () => {
  const t0 = Date.UTC(2025, 6, 15) // 2025-07-15 UTC
  const t1 = Date.UTC(2025, 6, 16)
  const rows = mapFundNavRows('510300', [
    { nav_date: t0, unit_nav: 4.0, adj_nav: 4.1 },
    { nav_date: t1, unit_nav: 4.1, adj_nav: 4.2 },
  ], 0.5)
  assert.equal(rows.length, 2)
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(rows[0].date))
  assert.equal(rows[0].nav, 4.0)
  assert.equal(rows[0].accNav, 4.1)
  assert.equal(rows[0].changePct, null)
  assert.ok(rows[1].changePct != null && rows[1].changePct > 2.4 && rows[1].changePct < 2.6)
  assert.equal(rows[1].premiumRate, 0.5)
})

test('mapFundHoldingsToEtfRows maps hold_ratio to weight', () => {
  const rows = mapFundHoldingsToEtfRows('510300', [
    { thscode: '300750.SZ', ticker: '300750', stock_name: '宁德时代', hold_ratio: 4.67 },
  ], '2025-06-30')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].holdingSymbol, '300750')
  assert.equal(rows[0].holdingName, '宁德时代')
  assert.equal(rows[0].weight, 4.67)
  assert.equal(rows[0].reportDate, '2025-06-30')
})

test('mapFundMarketSnapshotToStockRealtime aligns with stock snapshot fields', () => {
  const rt = mapFundMarketSnapshotToStockRealtime({
    thscode: '510300.SH',
    ticker: '510300',
    last_price: 4.753,
    open_price: 4.775,
    high_price: 4.825,
    low_price: 4.724,
    prev_price: 4.838,
    price_change_ratio_pct: -1.756924,
    price_change: -0.085,
    volume: 1657822800,
    turnover: 7909234100,
    turnover_ratio_pct: 9.01,
  }, '沪深300ETF')
  assert.equal(rt.code, '510300')
  assert.equal(rt.name, '沪深300ETF')
  assert.equal(rt.price, 4.753)
  assert.equal(rt.changePct, -1.756924)
  assert.equal(rt.turnoverRate, 9.01)
})

test('mapFundHistoricalBarsToKlines computes changePct from prior close', () => {
  const klines = mapFundHistoricalBarsToKlines('510300', [
    { date_ms: 1626624000000, open_price: 4.728, high_price: 4.769, low_price: 4.687, close_price: 4.759, volume: 100, turnover: 200 },
    { date_ms: 1626710400000, open_price: 4.721, high_price: 4.76, low_price: 4.712, close_price: 4.746, volume: 110, turnover: 210 },
  ])
  assert.equal(klines.length, 2)
  assert.equal(klines[0].changePct, null)
  assert.ok(Math.abs((klines[1].changePct ?? 0) - (-0.273) ) < 0.01)
})

test('mapFundReturnsToPerformance maps Fuyao return_* fields including w13/w26/year3', () => {
  const perf = mapFundReturnsToPerformance({
    return_month: -3.33,
    return_tmonth: 5.5,
    return_hyear: 8.2,
    return_year: 19.66,
    return_nowyear: 2.49,
    return_now: 121.58,
    return_tyear: 45.6,
  })
  assert.ok(perf)
  assert.equal(perf.w4, -3.33)
  assert.equal(perf.w13, 5.5)
  assert.equal(perf.w26, 8.2)
  assert.equal(perf.w52, 19.66)
  assert.equal(perf.year, 2.49)
  assert.equal(perf.total, 121.58)
  assert.equal(perf.year3, 45.6)
})

test('mapFundTickerToListItem filters non-ETF codes', () => {
  assert.equal(mapFundTickerToListItem({
    thscode: '600519.SH',
    ticker: '600519',
    name: '贵州茅台',
    asset_type: 'a-share',
  }), null)
  const etf = mapFundTickerToListItem({
    thscode: '510300.SH',
    ticker: '510300',
    name: '沪深300ETF',
    exchange: 'SH',
    asset_type: 'fund-etf',
  })
  assert.ok(etf)
  assert.equal(etf.code, '510300')
  assert.equal(etf.industry, 'ETF')
})
