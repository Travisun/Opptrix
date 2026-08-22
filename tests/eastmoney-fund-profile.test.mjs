import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseEmArchivesApidata,
  parseEmJbgkHtml,
  parseEmPingzhongData,
  emReportPeriodToArchivesArgs,
} from '../packages/a-stock-layer/src/providers/eastmoney/api/fund.ts'
import {
  mapEmJjccToFundHoldings,
  mapEmLsjzToFundNavRows,
  mapEmToFundProfileRow,
} from '../packages/a-stock-layer/src/providers/eastmoney/normalize/fund.ts'

describe('eastmoney fund profile parsers', () => {
  it('parseEmJbgkHtml extracts paired table labels', () => {
    const html = `
      <table class="info w790">
        <tr><td>基金全称</td><td>测试基金全称</td><td>基金简称</td><td>测试简称</td></tr>
        <tr><td>基金代码</td><td>515150（主代码）</td><td>基金类型</td><td>指数型-股票</td></tr>
        <tr><td>基金管理人</td><td>富国基金</td><td>基金托管人</td><td>中国银行</td></tr>
      </table>`
    const fields = parseEmJbgkHtml(html)
    assert.equal(fields['基金全称'], '测试基金全称')
    assert.equal(fields['基金简称'], '测试简称')
    assert.equal(fields['基金代码'], '515150（主代码）')
    assert.equal(fields['基金管理人'], '富国基金')
  })

  it('parseEmPingzhongData reads string and JSON vars', () => {
    const raw = `var fS_name = "一带一路ETF富国";var fS_code = "515150";var syl_1n="14.03";var stockCodesNew=["1.600415","0.002202"];`
    const data = parseEmPingzhongData(raw)
    assert.equal(data.fS_name, '一带一路ETF富国')
    assert.equal(data.fS_code, '515150')
    assert.equal(data.syl_1n, '14.03')
    assert.deepEqual(data.stockCodesNew, ['1.600415', '0.002202'])
  })

  it('parseEmArchivesApidata unwraps jjcc HTML fragment', () => {
    const raw = `var apidata={ content:"<table><tr><td>1</td><td>600415</td></tr>"}`
    const content = parseEmArchivesApidata(raw)
    assert.ok(content?.includes('600415'))
  })

  it('emReportPeriodToArchivesArgs maps ISO date to year/month', () => {
    assert.deepEqual(emReportPeriodToArchivesArgs('2025-12-31'), { year: 2025, month: 12 })
  })

  it('mapEmToFundProfileRow merges jbgk + nav snapshot', () => {
    const row = mapEmToFundProfileRow(
      '515150',
      {
        fields: {
          '基金简称': '一带一路ETF富国',
          '基金全称': '富国中证国企一带一路交易型开放式指数证券投资基金',
          '基金类型': '指数型-股票',
          '基金管理人': '富国基金',
          '业绩比较基准': '中证国企一带一路指数收益率',
        },
        sections: { '投资目标': '紧密跟踪标的指数' },
      },
      { fS_name: '一带一路ETF富国', syl_1n: '14.03' },
      { FSRQ: '2026-08-21', DWJZ: '1.5604', LJJZ: '1.5604', JZZZL: '0.46' },
    )
    assert.equal(row?.code, '515150')
    assert.equal(row?.name, '一带一路ETF富国')
    assert.equal(row?.company, '富国基金')
    assert.equal(row?.unitNav, 1.5604)
    assert.equal(row?.navDate, '2026-08-21')
    assert.equal(row?.investTarget, '紧密跟踪标的指数')
    assert.equal(row?.return1y, 14.03)
    assert.equal(row?.source, 'eastmoney_fund')
  })

  it('mapEmLsjzToFundNavRows normalizes lsjz rows', () => {
    const rows = mapEmLsjzToFundNavRows('515150', [
      { FSRQ: '2026-08-21', DWJZ: '1.5604', LJJZ: '1.5604', JZZZL: '0.46' },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].date, '2026-08-21')
    assert.equal(rows[0].nav, 1.5604)
    assert.equal(rows[0].changePct, 0.46)
  })

  it('mapEmJjccToFundHoldings maps stock weights', () => {
    const rows = mapEmJjccToFundHoldings('515150', [
      {
        symbol: '600415',
        name: '小商品城',
        weight: '2.77%',
        shares: '142.47',
        marketValue: '2,272.40',
        reportDate: '2025-12-31',
      },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].holdingSymbol, '600415')
    assert.equal(rows[0].holdingName, '小商品城')
    assert.equal(rows[0].weight, 2.77)
    assert.equal(rows[0].reportDate, '2025-12-31')
  })
})
