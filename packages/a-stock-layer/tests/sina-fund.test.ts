import { describe, it, expect } from 'vitest'
import {
  SINA_FUND_FINANCIAL_INDICATOR_FIELDS,
  SINA_FUND_INCOME_STATEMENT_FIELDS,
  buildSinaFundAnnouncementUrl,
  buildSinaFundDetailUrl,
  mapFundStatementPeriods,
  parseOpenFundHq,
  parseExchangeEtfHq,
} from '../src/providers/sinafinance/api/fund.js'

describe('buildSinaFundDetailUrl', () => {
  it('builds fund quotes page url', () => {
    expect(buildSinaFundDetailUrl('159937')).toBe(
      'https://finance.sina.com.cn/fund/quotes/159937/bc.shtml',
    )
  })
})

describe('buildSinaFundAnnouncementUrl', () => {
  it('builds announcement detail url', () => {
    expect(buildSinaFundAnnouncementUrl('5316869')).toContain('FundGG_Info.php?id=5316869')
  })
})

describe('parseOpenFundHq', () => {
  it('parses of{code} fields', () => {
    const parsed = parseOpenFundHq(['博时黄金ETF', '8.5754', '3.3672', '8.6249', '-0.57', '2026-07-07'])
    expect(parsed.name).toBe('博时黄金ETF')
    expect(parsed.unitNav).toBe(8.5754)
    expect(parsed.accNav).toBe(3.3672)
    expect(parsed.changePct).toBe(-0.57)
    expect(parsed.navDate).toBe('2026-07-07')
  })
})

describe('parseExchangeEtfHq', () => {
  it('parses exchange quote fields', () => {
    const parts = ['黄金9999', '8.569', '8.611', '8.575', '8.599', '8.544', '8.575', '8.577', '51663900', '442891567.000']
    const parsed = parseExchangeEtfHq(parts)
    expect(parsed.exchangePrice).toBe(8.575)
    expect(parsed.exchangeVolume).toBe(51663900)
    expect(parsed.exchangeChangePct).toBeCloseTo(-0.418, 2)
  })
})

describe('mapFundStatementPeriods', () => {
  it('maps financial indicator rows with semantic labels', () => {
    const periods = mapFundStatementPeriods(
      [{ bgq: '2025-12-31 00:00:00', bqlr: '100', bqjsy: '80', jcjz: '1000', dwjz: '1.5' }],
      SINA_FUND_FINANCIAL_INDICATOR_FIELDS,
    )
    expect(periods).toHaveLength(1)
    expect(periods[0].reportDate).toBe('2025-12-31')
    expect(periods[0].metrics.periodProfit).toBe(100)
    expect(periods[0].metrics.periodEndUnitNav).toBe(1.5)
  })

  it('skips empty values and maps income statement fields', () => {
    const periods = mapFundStatementPeriods(
      [{ REPORTDATE: '2025-06-30 00:00:00', ICST_NEW1: '500', ICST_NEW16: '50', ICST_NEW28: '450', ICST_NEW4: '--' }],
      SINA_FUND_INCOME_STATEMENT_FIELDS,
    )
    expect(periods[0].metrics.revenue).toBe(500)
    expect(periods[0].metrics.expenses).toBe(50)
    expect(periods[0].metrics.netProfit).toBe(450)
    expect(periods[0].metrics).not.toHaveProperty('absInterestIncome')
  })
})
