import { describe, it, expect } from 'vitest'
import {
  parseSinaCorpInfoFromHtml,
  parseSinaExecutivesFromHtml,
  parseSinaShareholdersFromHtml,
  parseSinaFundHoldingsFromHtml,
  parseSinaConceptPlatesFromHtml,
  parseSinaIndexMembershipFromHtml,
} from '../src/providers/sinafinance/api/corp.js'
import {
  mapSinaCorpInfoToProfile,
  mapSinaShareholders,
} from '../src/providers/sinafinance/normalize/corp.js'

const SAMPLE_CORP_HTML = `
<table><tr><td>公司名称：</td><td>中国三峡新能源(集团)股份有限公司</td></tr>
<tr><td>上市日期：</td><td><a>2021-06-10</a></td></tr>
<tr><td>董事会秘书：</td><td>杨丽迎</td></tr>
<tr><td>主营业务：</td><td>风能、太阳能的开发、投资和运营。</td></tr></table>
<tr><td>公司简介：</td><td>公司是国资委管理的唯一一家国有大型水利投资企业。</td></tr>
`

const SAMPLE_MANAGER_HTML = `
<table>
<tr><td>姓 名</td><td>职 务</td><td>起始日期</td><td>终止日期</td></tr>
<tr><td>朱承军</td><td>董事长</td><td>2026-01-15</td><td>2029-01-14</td></tr>
</table>
`

const SAMPLE_HOLDER_HTML = `
<table>
<tr><td>截至日期</td><td>2026-03-31</td></tr>
<tr><td>编号</td><td>股东名称</td><td>持股数量(股)</td><td>持股比例(%)</td><td>股本性质</td></tr>
<tr><td>1</td><td>中国长江三峡集团有限公司</td><td>8355203995↑</td><td>29.23↑</td><td>流通A股</td></tr>
</table>
`

describe('parseSinaCorpInfoFromHtml', () => {
  it('extracts label values', () => {
    const raw = parseSinaCorpInfoFromHtml(SAMPLE_CORP_HTML)
    const profile = mapSinaCorpInfoToProfile('600905', raw)
    expect(profile.orgName).toContain('三峡新能源')
    expect(profile.listingDate).toBe('2021-06-10')
    expect(profile.secretary).toBe('杨丽迎')
    expect(profile.mainBusiness).toContain('风能')
  })
})

describe('parseSinaExecutivesFromHtml', () => {
  it('parses executive rows', () => {
    const rows = parseSinaExecutivesFromHtml(SAMPLE_MANAGER_HTML)
    expect(rows[0]?.name).toBe('朱承军')
    expect(rows[0]?.title).toBe('董事长')
  })
})

describe('parseSinaShareholdersFromHtml', () => {
  it('parses holder table', () => {
    const { meta, rows } = parseSinaShareholdersFromHtml(SAMPLE_HOLDER_HTML)
    const mapped = mapSinaShareholders('600905', meta, rows)
    expect(mapped.some(r => r.type === 'holder' && r.name?.includes('长江三峡'))).toBe(true)
  })
})

describe('parseSinaFundHoldingsFromHtml', () => {
  it('parses fund blocks', () => {
    const html = `
    <table>
    <tr><td>截止日期</td><td>2026-06-16</td></tr>
    <tr><td>基金名称</td><td>基金代码</td><td>持仓数量(股)</td><td>占流通股比例(%)</td><td>持股市值（元）</td><td>占净值比例（%）</td></tr>
    <tr><td>南方国证绿色电力ETF</td><td>159061</td><td>1601300</td><td>0.0056</td><td>6597360</td><td>2.6</td></tr>
    </table>`
    const blocks = parseSinaFundHoldingsFromHtml(html)
    expect(blocks[0]?.fundCode).toBe('159061')
    expect(blocks[0]?.fundName).toContain('绿色电力')
  })
})

describe('parseSinaConceptPlatesFromHtml', () => {
  it('extracts concept names and nodes', () => {
    const html = `
    所属概念板块
    <table>
    <tr><td>概念板块</td><td>同概念个股</td></tr>
    <tr><td>光伏</td><td>点击查看</td></tr>
    </table>
    <a href="http://vip.stock.finance.sina.com.cn/mkt/#chgn_700014">x</a>`
    const rows = parseSinaConceptPlatesFromHtml(html)
    expect(rows[0]?.name).toBe('光伏')
    expect(rows[0]?.node).toBe('chgn_700014')
  })
})

describe('parseSinaIndexMembershipFromHtml', () => {
  it('parses index membership', () => {
    const html = `
    <table>
    <tr><td>所属指数</td></tr>
    <tr><td>指数名称</td><td>指数代码</td><td>进入日期</td><td>退出日期</td></tr>
    <tr><td>电力</td><td>801161</td><td>2021-06-18</td><td></td></tr>
    </table>`
    const rows = parseSinaIndexMembershipFromHtml(html)
    expect(rows[0]?.indexName).toBe('电力')
    expect(rows[0]?.indexCode).toBe('801161')
  })
})
