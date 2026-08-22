import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveFuyaoFundRoute } from '../packages/a-stock-layer/src/providers/tonghuashun/api/fund-symbols.ts'
import {
  mapFundHoldingsToFundRows,
  mapFundNavRowsForFund,
  mapFundProfileToFundProfileRow,
  mapFundReturnsToPerformance,
} from '../packages/a-stock-layer/src/providers/tonghuashun/normalize/fund.ts'

describe('fuyao fund profile', () => {
  it('resolveFuyaoFundRoute maps OTC and exchange codes', () => {
    assert.deepEqual(resolveFuyaoFundRoute('009049'), { fundType: 'otc', thscode: '009049.OF' })
    assert.deepEqual(resolveFuyaoFundRoute('515150'), { fundType: 'exchange', thscode: '515150.SH' })
    assert.deepEqual(resolveFuyaoFundRoute('161725'), { fundType: 'exchange', thscode: '161725.SZ' })
    assert.deepEqual(resolveFuyaoFundRoute('025480.OF'), { fundType: 'otc', thscode: '025480.OF' })
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

  it('mapFundNavRowsForFund computes daily change', () => {
    const rows = mapFundNavRowsForFund('009049', [
      { nav_date: 1752508800000, unit_nav: 1.0 },
      { nav_date: 1752595200000, unit_nav: 1.02 },
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[1].changePct != null && Math.abs(rows[1].changePct - 2) < 1e-6, true)
  })
})
