import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mapFundHoldersToProfileFields,
  mapFundNavRowsForFund,
  mapFundProfileToFundProfileRow,
  mapFundReturnsToPerformance,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/normalize/fund.js'

describe('tonghuashun fund profile parsers', () => {
  it('mapFundReturnsToPerformance reads return fields', () => {
    const perf = mapFundReturnsToPerformance({
      return_month: 1.2,
      return_year: 14.03,
      return_now: 25.5,
    })
    assert.equal(perf?.w4, 1.2)
    assert.equal(perf?.w52, 14.03)
    assert.equal(perf?.total, 25.5)
  })

  it('mapFundHoldersToProfileFields extracts holder metrics', () => {
    const fields = mapFundHoldersToProfileFields([
      {
        merge_scope: 'separate',
        report_date_ms: Date.parse('2025-12-31'),
        holder_amount: 12000,
        avg_holder_share: 8500,
        ins_position: 42.5,
        psnl_rate: 57.5,
      },
    ])
    assert.equal(fields?.holderAmount, 12000)
    assert.equal(fields?.instHolderRatio, 42.5)
    assert.equal(fields?.holderReportDate, '2025-12-31')
  })

  it('mapFundProfileToFundProfileRow merges profile + nav snapshot', () => {
    const row = mapFundProfileToFundProfileRow(
      '515150',
      {
        fund_name: '一带一路ETF富国',
        fund_type: '指数型-股票',
        manager_name: '富国基金',
        mgmt_name: '富国基金管理有限公司',
        estab_date: Date.parse('2019-04-16'),
        invest_target: '紧密跟踪标的指数',
      },
      {
        navItems: [{ nav_date: Date.parse('2026-08-21'), unit_nav: 1.5604, adj_nav: 1.5604 }],
        returns: { return_year: 14.03 },
        holders: mapFundHoldersToProfileFields([
          {
            merge_scope: 'separate',
            report_date_ms: Date.parse('2025-12-31'),
            holder_amount: 5000,
          },
        ]),
      },
    )
    assert.equal(row.code, '515150')
    assert.equal(row.name, '一带一路ETF富国')
    assert.equal(row.company, '富国基金管理有限公司')
    assert.equal(row.unitNav, 1.5604)
    assert.equal(row.investTarget, '紧密跟踪标的指数')
    assert.equal(row.return1y, 14.03)
    assert.equal(row.source, 'tonghuashun')
  })

  it('mapFundNavRowsForFund normalizes multi-day nav series', () => {
    const rows = mapFundNavRowsForFund('515150', [
      { nav_date: Date.parse('2026-08-19'), unit_nav: 1.54, adj_nav: 1.54 },
      { nav_date: Date.parse('2026-08-20'), unit_nav: 1.552, adj_nav: 1.552 },
      { nav_date: Date.parse('2026-08-21'), unit_nav: 1.5604, adj_nav: 1.5604 },
    ])
    assert.equal(rows.length, 3)
    assert.equal(rows[2].date, '2026-08-21')
    assert.equal(rows[2].nav, 1.5604)
    assert.ok(rows[1].changePct != null && rows[1].changePct > 0)
    assert.ok(rows[2].changePct != null && rows[2].changePct > 0)
    assert.equal(rows[2].source, 'tonghuashun')
  })
})
