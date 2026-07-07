import { describe, it, expect } from 'vitest'
import {
  parseSinaAllBulletinListFromHtml,
  parseSinaBulletinDetailFromHtml,
} from '../src/providers/sinafinance/api/bulletins.js'
import {
  parseSinaInsiderTradesFromHtml,
  parseSinaStockCommentFromHtml,
} from '../src/providers/sinafinance/api/invest.js'
import { parseSinaPriceHistoryFromHtml } from '../src/providers/sinafinance/api/market.js'

describe('parseSinaAllBulletinListFromHtml', () => {
  it('parses datelist with links and pagination hint', () => {
    const html = `
      <div class="datelist"><ul>
        2026-06-30&nbsp;<a href='/corp/view/vCB_AllBulletinDetail.php?stockid=600905&id=12419343'>三峡能源：股东会法律意见书</a>
        2026-06-29&nbsp;<a href="/corp/view/vCB_AllBulletinDetail.php?stockid=600905&id=12419341">三峡能源：股东会决议公告</a>
      </ul></div>
      <a href="?stockid=600905&Page=2">下一页</a>`
    const parsed = parseSinaAllBulletinListFromHtml(html, 1)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]?.date).toBe('2026-06-30')
    expect(parsed.items[0]?.title).toContain('法律意见书')
    expect(parsed.items[0]?.link).toContain('id=12419343')
    expect(parsed.items[0]?.id).toBe('12419343')
    expect(parsed.hasNext).toBe(true)
  })
})

describe('parseSinaBulletinDetailFromHtml', () => {
  it('extracts pdf url and html fallback', () => {
    const html = `
      <title>三峡能源(600905)_公司公告_测试公告新浪财经_新浪网</title>
      <a href="http://file.finance.sina.com.cn/x/124.PDF">PDF</a>
      <div id="content">公告正文第一段内容</div>`
    const parsed = parseSinaBulletinDetailFromHtml(html)
    expect(parsed.pdfUrls[0]).toContain('.PDF')
    expect(parsed.htmlText).toContain('公告正文')
    expect(parsed.title).toContain('三峡能源')
  })
})

describe('parseSinaStockCommentFromHtml', () => {
  it('parses qgqp row', () => {
    const html = `
    <table>
    <tr><td>代码</td><td>名称</td><td>千股千评</td><td>最新价</td><td>涨跌额</td><td>涨跌幅</td><td>昨收</td><td>今开</td></tr>
    <tr><td>600905</td><td>三峡能源</td><td>业绩一般，建议趋势明朗后交易</td><td>3.74</td><td>-0.06</td><td>-1.579</td><td>3.8</td><td>3.8</td></tr>
    </table>`
    const row = parseSinaStockCommentFromHtml(html, '600905')
    expect(row?.comment).toContain('业绩一般')
    expect(row?.price).toBe('3.74')
  })
})

describe('parseSinaInsiderTradesFromHtml', () => {
  it('parses insider trade table', () => {
    const html = `
    <table>
    <tr><td>股票代码</td><td>股票名称</td><td>变动人</td><td>变动类型</td><td>变动股数</td><td>成交均价</td><td>变动金额(万元)</td><td>变动后持股数</td><td>变动原因</td><td>变动日期</td><td>持股种类</td><td>与董监高关系</td><td>董监高职务</td></tr>
    <tr><td>600905</td><td>三峡能源</td><td>张三</td><td>增持</td><td>10000</td><td>3.70</td><td>3.70</td><td>50000</td><td>二级市场</td><td>2026-01-10</td><td>A股</td><td>本人</td><td>董事</td></tr>
    </table>`
    const rows = parseSinaInsiderTradesFromHtml(html)
    expect(rows[0]?.person).toBe('张三')
    expect(rows[0]?.changeType).toBe('增持')
  })
})

describe('parseSinaPriceHistoryFromHtml', () => {
  it('parses price distribution table', () => {
    const html = `
    <table>
    <tr><td>成交价(元)</td><td>成交量(股)</td><td>占比</td><td>占比图</td></tr>
    <tr><td>3.76</td><td>7198200</td><td>7.10%</td><td></td></tr>
    <tr><td>3.75</td><td>31643498</td><td>31.21%</td><td></td></tr>
    </table>`
    const rows = parseSinaPriceHistoryFromHtml(html)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.price).toBe('3.76')
    expect(rows[1]?.ratio).toBe('31.21%')
  })
})
