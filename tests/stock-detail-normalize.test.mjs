import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  dedupeStockNewsItems,
  enrichCnStockProfile,
  enrichShareholderView,
  mergeDetailQuoteRows,
  mergeStockProfileRows,
  normalizeShareholderPayload,
  normalizeStockProfileRow,
} from '../packages/research-hub/dist/stock-detail-normalize.js'

test('normalizeShareholderPayload maps Sina meta + holder rows', () => {
  const rows = [
    {
      code: '600519',
      asOfDate: '2024-09-30',
      holderCount: '128,456',
      type: 'meta',
      holderCategory: 'float',
    },
    { code: '600519', rank: 1, name: '中国贵州茅台酒厂', shares: '6.78亿', ratio: '54.00%', type: 'holder', holderCategory: 'float' },
    { code: '600519', rank: 2, name: '香港中央结算', shares: '0.82亿', ratio: '6.54%', type: 'holder', holderCategory: 'float' },
  ]
  const out = normalizeShareholderPayload('600519', rows)
  assert.ok(out)
  assert.equal(out.reportDate, '2024-09-30')
  assert.equal(out.shareholderCount, 128456)
  assert.equal(out.top10Shareholders?.length, 2)
  assert.equal(out.top10Shareholders?.[0]?.name, '中国贵州茅台酒厂')
  assert.ok((out.top10Shareholders?.[0]?.sharesHeld ?? 0) > 6e7)
})

test('normalizeShareholderPayload maps Tushare top10 floatholder rows', () => {
  const rows = [
    {
      code: '600519',
      holder_name: '中国贵州茅台酒厂',
      hold_amount: 678000000,
      hold_ratio: 54,
      end_date: '20240930',
      source: 'top10_floatholders',
    },
    {
      code: '600519',
      holder_name: '香港中央结算',
      hold_amount: 82000000,
      hold_ratio: 6.54,
      end_date: '20240930',
      source: 'top10_floatholders',
    },
  ]
  const out = normalizeShareholderPayload('600519', rows)
  assert.ok(out)
  assert.equal(out.top10Shareholders?.length, 2)
  assert.equal(out.top10Shareholders?.[1]?.sharePct, 6.54)
})

test('dedupeStockNewsItems removes duplicate notices', () => {
  const items = dedupeStockNewsItems([
    { code: '600519', title: '年度报告', date: '2024-03-28', url: 'https://a' },
    { code: '600519', title: '年度报告', date: '2024-03-28', url: 'https://a' },
    { code: '600519', title: '分红公告', date: '2024-06-01', url: 'https://b' },
  ])
  assert.equal(items.length, 2)
})

test('normalizeStockProfileRow maps snake_case aliases', () => {
  const out = normalizeStockProfileRow('600519', {
    code: '600519',
    org_name: '贵州茅台酒股份有限公司',
    setup_date: '1999-11-20',
    list_date: '2001-08-27',
    main_business: '白酒',
    reg_capital: 125619.78,
  })
  assert.ok(out)
  assert.equal(out.orgName, '贵州茅台酒股份有限公司')
  assert.equal(out.foundDate, '1999-11-20')
  assert.equal(out.listingDate, '2001-08-27')
  assert.equal(out.regCapital, 125619.78)
})

test('mergeStockProfileRows prefers richer sinafinance and fills gaps from tencent', () => {
  const out = mergeStockProfileRows('600519', [
    {
      code: '600519',
      name: '贵州茅台',
      orgName: '贵州茅台酒股份有限公司',
      listingDate: '2001-08-27',
      foundDate: '1999-11-20',
      address: '贵州省仁怀市茅台镇',
      orgTel: '0851-22386002',
      issuePrice: 31.39,
      regCapital: 125619.78,
      concepts: ['白酒', '沪股通'],
    },
    {
      code: '600519',
      name: '贵州茅台',
      province: '贵州',
      concepts: ['MSCI', '白酒'],
    },
  ])
  assert.ok(out)
  assert.equal(out.orgName, '贵州茅台酒股份有限公司')
  assert.equal(out.address, '贵州省仁怀市茅台镇')
  assert.equal(out.province, '贵州')
  assert.deepEqual(out.concepts, ['白酒', '沪股通', 'MSCI'])
})

test('mergeDetailQuoteRows keeps fallback volume and tencent valuation fields', () => {
  const out = mergeDetailQuoteRows('600519', {
    code: '600519',
    price: 1199.3,
    pe: 18.13,
    pb: 6.44,
    volumeRatio: 0.66,
    turnoverRate: 0.21,
    marketCap: 1499223000000,
    circulatingMarketCap: 1499223000000,
    volume: 25776,
  }, {
    code: '600519',
    price: 1199.3,
    volume: 2577602,
    amount: 3071933498,
    high: 1200.98,
    low: 1177,
  })
  assert.ok(out)
  assert.equal(out.volume, 2577602)
  assert.equal(out.pe, 18.13)
  assert.equal(out.volumeRatio, 0.66)
  assert.equal(out.high, 1200.98)
})

test('enrichShareholderView derives avg holdings and concentration', () => {
  const out = enrichShareholderView({
    code: '600519',
    reportDate: '2024-09-30',
    shareholderCount: 100000,
    top10Shareholders: [
      { rank: 1, name: 'A', sharePct: 40 },
      { rank: 2, name: 'B', sharePct: 20 },
    ],
  }, {
    price: 100,
    circulatingMarketCap: 1e10,
    holderHistory: [
      { date: '20240630', count: 110000 },
      { date: '20240930', count: 100000 },
    ],
  })
  assert.ok(out)
  assert.ok(out.shareholderCountChange != null)
  assert.ok(out.avgFreeShares != null)
  assert.ok(out.avgHoldingValue != null)
  assert.equal(out.holdFocus, '较为集中')
})

test('enrichCnStockProfile merges industry rank, plates, executives and ratings', () => {
  const base = mergeStockProfileRows('600519', [{
    code: '600519',
    name: '贵州茅台',
    orgName: '贵州茅台酒股份有限公司',
    industry: '白酒',
  }])
  const out = enrichCnStockProfile('600519', base, {
    industryRank: {
      industryName: '白酒',
      peRank: 3,
      marketCapRank: 1,
      epsRank: 2,
      industryAvgPe: 28.5,
      pe: 18.1,
      eps: 68.5,
    },
    plates: [
      { plateType: 'industry', plateName: '白酒', plateCode: 'BK0477' },
      { plateType: 'industry', plateName: '酿酒行业', plateCode: 'BK0896' },
      { plateType: 'concept', plateName: '沪股通', tag: '热门' },
      { plateType: 'area', plateName: '贵州板块' },
    ],
    institutionRating: {
      ratings: {
        desc: '近半年内',
        mr: { name: '买入', num: 12 },
        zc: { name: '增持', num: 8 },
      },
      targetPrice: { avg: '2100', high: '2300', low: '1900' },
      recentReports: [{ title: '维持买入评级', time: '2025-12-01', tzpj: '买入' }],
    },
    executives: [
      { name: '张德芹', title: '董事长', startDate: '2024-05-29' },
      { name: '王莉', title: '代总经理', startDate: '2024-05-29' },
    ],
    indexMembership: [
      { indexName: '上证50', indexCode: '000016', enterDate: '2004-01-02' },
    ],
  })
  assert.ok(out)
  assert.equal(out.industryRank.peRank, 3)
  assert.equal(out.industrySecondary, '酿酒行业')
  assert.deepEqual(out.concepts, ['白酒', '酿酒行业', '沪股通', '贵州板块'])
  assert.equal(out.conceptPlates[0].tag, '热门')
  assert.equal(out.chairman, '张德芹')
  assert.equal(out.institutionRating.buy, 12)
  assert.equal(out.institutionRating.period, '近半年内')
  assert.equal(out.indexMembership[0].indexName, '上证50')
  assert.equal(out.executives.length, 2)
})

test('enrichCnStockProfile fills industry from plates when missing', () => {
  const out = enrichCnStockProfile('600519', { code: '600519' }, {
    plates: [{ plateType: 'industry', plateName: '白酒' }],
  })
  assert.ok(out)
  assert.equal(out.industry, '白酒')
})
