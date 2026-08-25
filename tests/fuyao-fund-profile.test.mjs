import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCnListedFundSymbol, isCnLofSymbol } from '../packages/a-stock-layer/dist/core/fund-instrument.js'
import { resolveFuyaoFundRoute } from '../packages/a-stock-layer/dist/providers/tonghuashun/api/fund-symbols.js'
import {
  FUYAO_FUND_NAV_RECENT_OPTS,
  FUYAO_FUND_NAV_SERIES_OPTS,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/markets/cn/fund.js'
import {
  mapFundAllocationRow,
  mapFundDividendRows,
  mapFundDrawdownRows,
  mapFundHoldersRow,
  mapFundHoldingsToFundRows,
  mapFundNavRowsForFund,
  mapFundProfileToFundProfileRow,
  mapFundReturnsDetail,
  mapFundReturnsToPerformance,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/normalize/fund.js'

describe('cn lof instrument', () => {
  it('isCnLofSymbol distinguishes LOF from 159 ETF segment', () => {
    assert.equal(isCnLofSymbol('161725'), true)
    assert.equal(isCnLofSymbol('160216'), true)
    assert.equal(isCnLofSymbol('159915'), false)
    assert.equal(isCnLofSymbol('510300'), false)
    assert.equal(isCnListedFundSymbol('161725'), true)
    assert.equal(isCnListedFundSymbol('159915'), true)
  })
})

describe('fuyao fund profile', () => {
  it('resolveFuyaoFundRoute maps OTC and exchange codes', () => {
    assert.deepEqual(resolveFuyaoFundRoute('009049'), { fundType: 'otc', thscode: '009049.OF' })
    assert.deepEqual(resolveFuyaoFundRoute('515150'), { fundType: 'exchange', thscode: '515150.SH' })
    assert.deepEqual(resolveFuyaoFundRoute('161725'), { fundType: 'exchange', thscode: '161725.SZ' })
    assert.deepEqual(resolveFuyaoFundRoute('025480.OF'), { fundType: 'otc', thscode: '025480.OF' })
  })

  it('fundNav / profile / quote pass documented range + nav_type', () => {
    // fundNav：五年序列（侧边栏走势）；不传 range 时扶摇最多 1 条
    assert.equal(FUYAO_FUND_NAV_SERIES_OPTS.range, 'fyear')
    assert.equal(FUYAO_FUND_NAV_SERIES_OPTS.nav_type, 'unit,adj')
    // profile / quote：近月序列以便 latest+prev 算 changePct
    assert.equal(FUYAO_FUND_NAV_RECENT_OPTS.range, 'month')
    assert.equal(FUYAO_FUND_NAV_RECENT_OPTS.nav_type, 'unit,adj')
  })

  it('mapFundReturnsToPerformance maps return_year to w52', () => {
    const perf = mapFundReturnsToPerformance({ return_year: 12.5, return_month: 1.2 })
    assert.equal(perf?.w52, 12.5)
    assert.equal(perf?.w4, 1.2)
  })

  it('mapFundProfileToFundProfileRow merges nav and returns', () => {
    const row = mapFundProfileToFundProfileRow('009049', {
      fund_name: '测试基金',
      manager_name: '张三',
      mgmt_name: '测试公司',
      fund_scale: 5e9,
      estab_date: 1609459200000,
      rate_info: [{ rate_type: '管理费', standard_rate: 1.2 }],
    }, {
      navItems: [
        { nav_date: 1752595200000, unit_nav: 1.01, adj_nav: 1.15 },
        { nav_date: 1752508800000, unit_nav: 1.0, adj_nav: 1.14 },
      ],
      returns: { return_year: 8.5 },
    })
    assert.equal(row.code, '009049')
    assert.equal(row.name, '测试基金')
    assert.equal(row.unitNav, 1.01)
    // adj_nav → accNav（复权净值口径，非累计净值）
    assert.equal(row.accNav, 1.15)
    assert.equal(row.changePct != null && Math.abs(row.changePct - 1) < 1e-6, true)
    assert.equal(row.return1y, 8.5)
    assert.equal(row.scale, 50)
    assert.equal(row.expenseRatio, 1.2)
    assert.equal(row.establishDate, '2021-01-01')
  })

  it('mapFundHoldingsToFundRows normalizes portfolio holdings', () => {
    const rows = mapFundHoldingsToFundRows('009049', [
      {
        ticker: '300750',
        stock_name: '宁德时代',
        hold_ratio: 4.67,
        asset_type: 'stock',
        end_date_ms: 1785513600000,
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].holdingSymbol, '300750')
    assert.equal(rows[0].holdingName, '宁德时代')
    assert.equal(rows[0].weight, 4.67)
    assert.equal(rows[0].source, 'tonghuashun')
  })

  it('mapFundNavRowsForFund maps multi-day series with daily change', () => {
    const rows = mapFundNavRowsForFund('009049', [
      { nav_date: 1752508800000, unit_nav: 1.0, adj_nav: 1.1 },
      { nav_date: 1752595200000, unit_nav: 1.02, adj_nav: 1.12 },
      { nav_date: 1752681600000, unit_nav: 1.03, adj_nav: 1.13 },
    ])
    assert.equal(rows.length, 3)
    assert.equal(rows[0].changePct, null)
    assert.equal(rows[1].changePct != null && Math.abs(rows[1].changePct - 2) < 1e-6, true)
    assert.equal(rows[2].nav, 1.03)
    assert.equal(rows[2].accNav, 1.13)
  })

  it('mapFundReturnsToPerformance maps year2 / year5', () => {
    const perf = mapFundReturnsToPerformance({
      return_twoyear: 20,
      return_fyear: 80,
      return_year: 10,
    })
    assert.equal(perf?.year2, 20)
    assert.equal(perf?.year5, 80)
    assert.equal(perf?.w52, 10)
  })

  it('mapFundReturnsDetail maps ranks', () => {
    const row = mapFundReturnsDetail('009049', {
      return_year: 12.5,
      rank_year: 23,
      count_year: 400,
    })
    assert.equal(row.performance?.w52, 12.5)
    assert.equal(row.ranks?.w52?.rank, 23)
    assert.equal(row.ranks?.w52?.total, 400)
  })

  it('mapFundDrawdownRows maps a single-object blob', () => {
    const rows = mapFundDrawdownRows('009049', [{
      drawdown_year: -18.2,
      drawdown_month: -3.1,
    }])
    assert.ok(rows.some(r => r.period === 'w52' && r.value === -18.2))
    assert.ok(rows.some(r => r.period === 'w4' && r.value === -3.1))
  })

  it('mapFundAllocationRow maps assets and industries', () => {
    const row = mapFundAllocationRow('009049', [
      { stock_ratio: 85.2, bond_ratio: 10, report_date_ms: 1719792000000 },
    ], [
      { industry_name: '电子', hold_ratio: 22.5 },
    ])
    assert.equal(row.assets.find(a => a.name === '股票')?.ratio, 85.2)
    assert.equal(row.industries[0]?.name, '电子')
    assert.equal(row.industries[0]?.ratio, 22.5)
    assert.equal(row.reportDate, '2024-07-01')
  })

  it('mapFundHoldersRow maps structure and top holders', () => {
    const row = mapFundHoldersRow('009049', [
      { holder_amount: 12000, ins_position: 40, psnl_rate: 60, merge_scope: 'separate', report_date_ms: 1719792000000 },
    ], [
      { holder_name: '某银行', hold_share: 1e7, hold_ratio: 8.5 },
    ])
    assert.ok(row)
    assert.equal(row.holderAmount, 12000)
    assert.equal(row.instHolderRatio, 40)
    assert.equal(row.top[0]?.name, '某银行')
    assert.equal(row.top[0]?.ratio, 8.5)
  })

  it('mapFundDividendRows maps ex-date and amount', () => {
    const rows = mapFundDividendRows('009049', [
      { ex_date_ms: 1719792000000, record_date_ms: 1719705600000, unit_dividend: 0.12, bonus_type: '现金分红' },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2024-07-01')
    assert.equal(rows[0].amount, 0.12)
    assert.equal(rows[0].type, '现金分红')
  })
})
