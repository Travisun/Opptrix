import { describe, it, expect } from 'vitest'
import { SINA_REFERER, buildSinaStockReferer } from '../src/providers/sinafinance/api/types.js'
import { parseJsNewArray } from '../src/providers/sinafinance/api/js-array.js'
import { parseSinaDividendsFromHtml, parseSinaPivotFinancialTable, parseSinaBulletinListFromHtml, parseSinaAchievementNoticeFromHtml, parseSinaTwoColumnIssueFromHtml } from '../src/providers/sinafinance/api/finance-pages.js'
import { parseSinaShareUnlockFromHtml, parseSinaDragonTigerFromHtml } from '../src/providers/sinafinance/api/invest.js'
import { mapSinaDividends, mapSinaFinancialPivot } from '../src/providers/sinafinance/normalize/finance-ext.js'

describe('SINA_REFERER', () => {
  it('uses http finance.sina.com.cn', () => {
    expect(SINA_REFERER).toBe('http://finance.sina.com.cn/')
    expect(buildSinaStockReferer('sh600905')).toBe(
      'http://finance.sina.com.cn/realstock/company/sh600905/nc.shtml',
    )
  })
})

describe('parseSinaTwoColumnIssueFromHtml', () => {
  it('parses IPO fields', () => {
    const html = `
    <table>
    <tr><td>上市地</td><td>上海证券交易所</td></tr>
    <tr><td>发行价(元)</td><td>2.65</td></tr>
    </table>`
    const fields = parseSinaTwoColumnIssueFromHtml(html)
    expect(fields['发行价(元)']).toBe('2.65')
    expect(fields['上市地']).toBe('上海证券交易所')
  })
})

describe('parseJsNewArray', () => {
  it('parses bill_detail_list', () => {
    const text = `var bill_detail_list = new Array();
bill_detail_list[0] = new Array('14:13:27', '40000', '3.730', 'DOWN');`
    const rows = parseJsNewArray(text, 'bill_detail_list')
    expect(rows[0]).toEqual(['14:13:27', '40000', '3.730', 'DOWN'])
  })
})

describe('parseSinaDividendsFromHtml', () => {
  it('parses dividend rows', () => {
    const html = `
    <table>
    <tr><td>分红</td></tr>
    <tr><td>公告日期</td><td>分红方案(每10股)</td><td>进度</td><td>除权除息日</td><td>股权登记日</td><td>红股上市日</td></tr>
    <tr><td>送股(股)</td><td>转增(股)</td><td>派息(税前)(元)</td></tr>
    <tr><td>2025-08-13</td><td>0</td><td>0</td><td>0.67</td><td>实施</td><td>2025-08-19</td><td>2025-08-18</td><td>--</td></tr>
    </table>`
    const rows = parseSinaDividendsFromHtml(html)
    expect(rows[0]?.cashBonus).toBe('0.67')
    expect(rows[0]?.progress).toBe('实施')
    const mapped = mapSinaDividends('600905', rows)
    expect(mapped[0]?.cashBonus).toBe(0.67)
  })
})

describe('parseSinaPivotFinancialTable', () => {
  it('parses guide metrics', () => {
    const html = `
    <table>
    <tr><td>报告日期</td><td>2025-12-31</td><td>2025-06-30</td></tr>
    <tr><td>摊薄每股收益(元)</td><td>0.1442</td><td>0.1457</td></tr>
    <tr><td>营业收入</td><td>2,839,942.03</td><td>1,473,581.62</td></tr>
    </table>`
    const pivot = parseSinaPivotFinancialTable(html)
    expect(pivot?.periods).toEqual(['2025-12-31', '2025-06-30'])
    const fin = mapSinaFinancialPivot('600905', pivot, pivot)
    expect(fin[0]?.eps).toBe(0.1442)
    expect(fin[0]?.revenue).toBe(2839942.03)
  })
})

describe('parseSinaShareUnlockFromHtml', () => {
  it('parses unlock table', () => {
    const html = `
    <table>
    <tr><td>代码</td><td>名称</td><td>解禁日期</td><td>解禁数量(万股)</td><td>解禁股流通市值(亿元)</td></tr>
    <tr><td>600905</td><td>三峡能源</td><td>2025-01-16</td><td>179.36</td><td>0.0755</td></tr>
    </table>`
    const rows = parseSinaShareUnlockFromHtml(html)
    expect(rows[0]?.unlockDate).toBe('2025-01-16')
  })
})

describe('parseSinaDragonTigerFromHtml', () => {
  it('parses lhb blocks', () => {
    const html = `
    <a href="lookup_n.php?q=000004">000004</a></td><td><a>国华退</a>
    0.45 0 626.7334 267.3076 查看交易详情 上榜原因：退市整理的证券`
  const rows = parseSinaDragonTigerFromHtml(html, '2026-07-03')
    expect(rows[0]?.code).toBe('000004')
    expect(rows[0]?.reason).toContain('退市')
  })
})

describe('parseSinaAchievementNoticeFromHtml', () => {
  it('parses forecast blocks', () => {
    const html = `
    <table>
    <tr><td>三峡能源(600905)  业绩预告</td></tr>
    <tr><td>公告日期</td><td>2026-04-01</td></tr>
    <tr><td>报告期</td><td>2025-12-31</td></tr>
    <tr><td>类型</td><td>预降</td></tr>
    <tr><td>业绩预告摘要</td><td>预计净利润下降39.94%</td></tr>
    </table>`
    const rows = parseSinaAchievementNoticeFromHtml(html)
    expect(rows[0]?.forecastType).toBe('预降')
  })
})

describe('parseSinaBulletinListFromHtml', () => {
  it('parses datelist', () => {
    const html = `<div class="datelist">2025-04-30 三峡能源：2025年年度报告2024-04-30 三峡能源：2024年年度报告</div>`
    const rows = parseSinaBulletinListFromHtml(html, 'ndbg')
    expect(rows.length).toBe(2)
    expect(rows[0]?.title).toContain('2025年年度报告')
  })
})
