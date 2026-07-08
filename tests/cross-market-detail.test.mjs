import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCrossMarketDetailPayload,
  mergeCrossMarketQuote,
  normalizeCrossMarketArticles,
  normalizeCrossMarketNotices,
  normalizeCrossMarketRelatedStocks,
  normalizeHkDividends,
  normalizeHkFinancialHistory,
  normalizeHkTencentProfile,
  normalizeHkTradingDistribution,
  normalizeUsFinancialHistory,
  normalizeUsSeniorTrades,
  normalizeUsTencentProfile,
} from '../packages/research-hub/dist/cross-market-detail.js'

test('normalizeUsTencentProfile maps industry and description', () => {
  const profile = normalizeUsTencentProfile('AAPL', {
    companyName: 'Apple Inc.',
    listingDate: '1980-12-12',
    exchange: 'NASDAQ',
    website: 'apple.com',
    description: 'Designs consumer electronics.',
    industry: { name: 'Technology' },
    revenueBreakdown: [{
      date: '2025-09-30',
      currency: '美元',
      segments: [{ label: 'iPhone', sales: '100亿', ratio: '50%' }, { label: 'Services' }],
    }],
  })
  assert.equal(profile.name, 'Apple Inc.')
  assert.equal(profile.industry, 'Technology')
  assert.match(String(profile.mainBusiness), /iPhone/)
  assert.equal(Array.isArray(profile.revenueBreakdown), true)
  assert.equal(profile.revenueBreakdown[0]?.segments.length, 2)
})

test('normalizeHkTencentProfile maps jiankuang fields', () => {
  const profile = normalizeHkTencentProfile('00700', {
    chiName: '腾讯控股',
    website: 'tencent.com',
    business: '互联网',
    raw: {
      ChiName: '腾讯控股有限公司',
      ListedDate: '2004-06-16',
      Chairman: '马化腾',
      BriefIntroduction: '简介',
      STOCK_SUM: '9092516289',
      WEEK_YIELD: '1.11',
      plate: [{ name: '数码解决方案服务' }],
    },
  })
  assert.equal(profile.listingDate, '2004-06-16')
  assert.equal(profile.chairman, '马化腾')
  assert.equal(profile.industry, '数码解决方案服务')
  assert.equal(profile.weekDividendYield, 1.11)
})

test('normalizeUsFinancialHistory maps annual rows', () => {
  const rows = normalizeUsFinancialHistory('AAPL', {
    items: [{
      year: '2024',
      income: { revenue: 100, netIncome: 20 },
      balance: { totalAssets: 200, totalLiabilities: 80 },
      cash: { netCashChange: 15 },
    }],
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.reportDate, '2024')
  assert.equal(rows[0]?.revenue, 100)
  assert.equal(rows[0]?.netProfit, 20)
})

test('normalizeCrossMarketNotices keeps official notices only', () => {
  const notices = normalizeCrossMarketNotices('00700', {
    items: [
      { id: 'nokHKEX-EPS-20260708-12237939', title: '公告B', time: '2026-07-08', type: '0', url: '' },
      { id: 'nesSN20260708181108988817cb', title: '新闻A', time: '2026-07-08', type: '2', url: 'https://a' },
    ],
  })
  assert.equal(notices.length, 1)
  assert.equal(notices[0]?.type, 'notice')
  assert.equal(notices[0]?.title, '公告B')
  assert.match(String(notices[0]?.url), /detail-v2\/index\.html#\/index\?id=nokHKEX/)
})

test('normalizeHkFinancialHistory maps income and balance tables', () => {
  const income = {
    tables: [[
      [['', ''], ['20241231', {}]],
      [['营业收入', {}], ['6602.57亿元', {}, '10.00']],
      [['归属母公司所有者净利润', {}], ['1940.73亿元', {}, '5.00']],
    ]],
  }
  const balance = {
    tables: [[
      [['', ''], ['20241231', {}]],
      [['资产总计', {}], ['10500.00亿元', {}]],
      [['总负债', {}], ['4200.00亿元', {}]],
    ]],
  }
  const rows = normalizeHkFinancialHistory('00700', income, balance)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.reportDate, '2024-12-31')
  assert.equal(rows[0]?.revenue, 6602.57e8)
  assert.equal(rows[0]?.netProfit, 1940.73e8)
  assert.equal(rows[0]?.totalAssets, 10500e8)
})

test('normalizeHkDividends includes recent summary', () => {
  const rows = normalizeHkDividends('00700', {
    recent: [{ content: '派息 3.2 港元', exDate: '2026-06-01', payDate: '2026-06-20' }],
    items: [],
  })
  assert.equal(rows.length, 1)
  assert.match(String(rows[0]?.plan), /港元/)
})

test('normalizeCrossMarketArticles keeps news items with links', () => {
  const articles = normalizeCrossMarketArticles('00700', {
    items: [
      { id: 'nesSN20260708181108988817cb', title: '新闻A', time: '2026-07-08', url: 'https://a' },
      { id: 'nokHKEX-EPS-20260708-12237939', title: '公告B', time: '2026-07-08', type: '0', url: '' },
    ],
  })
  assert.equal(articles.length, 2)
  assert.equal(articles[0]?.type, 'article')
})

test('mergeCrossMarketQuote enriches week52 fields', () => {
  const merged = mergeCrossMarketQuote({ code: 'AAPL', price: 100 }, {
    week52High: 120,
    week52Low: 80,
    currency: 'USD',
  })
  assert.equal(merged?.week52High, 120)
  assert.equal(merged?.currency, 'USD')
})

test('normalizeCrossMarketRelatedStocks maps peer rows', () => {
  const rows = normalizeCrossMarketRelatedStocks('US', {
    items: [{ code: 'MSFT', name: '微软', price: 388.84, changePct: 0.54 }],
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.code, 'MSFT')
  assert.equal(rows[0]?.market, 'US')
})

test('normalizeUsSeniorTrades maps insider rows', () => {
  const rows = normalizeUsSeniorTrades('AAPL', {
    items: [{
      name: 'Mr. Ben Borders',
      date: '2026-06-16',
      shares: '116',
      value: '34236',
      detail: 'Open market sale',
    }],
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.personName, 'Mr. Ben Borders')
  assert.equal(rows[0]?.tradeDate, '2026-06-16')
})

test('normalizeHkTradingDistribution maps price levels', () => {
  const data = normalizeHkTradingDistribution('00700', {
    trading: {
      priceLevels: [{ price: 478.8, volume: 3751065, volumeRatio: 1 }],
      largeOrderPct: 90.6,
    },
  })
  assert.equal(data?.priceLevels.length, 1)
  assert.equal(data?.largeOrderPct, 90.6)
})

test('buildCrossMarketDetailPayload preserves snapshot klines', () => {
  const payload = buildCrossMarketDetailPayload('HK', '00700', {
    code: '00700',
    quote: { code: '00700', price: 400 },
    recentKlines: [{ date: '2026-07-01', close: 390 }],
  }, {
    notices: [{ code: '00700', title: 'test', date: '2026-07-01' }],
    articles: [{ code: '00700', title: 'news', date: '2026-07-01' }],
  })
  assert.equal(payload.market, 'HK')
  assert.equal(payload.recentKlines.length, 1)
  assert.equal(payload.notices.length, 1)
  assert.equal(payload.articles.length, 1)
})
