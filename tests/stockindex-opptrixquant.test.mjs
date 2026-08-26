/**
 * OpptrixQuant 升级（stockindex provider）— normalize / settings / manifest / custom methods
 *
 * 无 API Key 的单元级断言（不触发网络）；真实联调见 instrument-search-stockindex.test.mjs（env 门控）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// 隔离用户数据目录，避免读写真实用户库
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-stockindex-test-'))
process.env.OPPTRIX_DATA_DIR = tmpDataDir

const { parseOpptrixInstrumentId, opptrixNavToStandardRows, opptrixLatestNavToQuoteRow, opptrixInstrumentToProfileRow, opptrixMetricsToRow, opptrixInstrumentToStockIndexItem, stockIndexItemToInstrumentRef, stockIndexItemToListRow } =
  await import('../packages/a-stock-layer/dist/providers/stockindex/normalize.js')
const { STOCKINDEX_SETTINGS, STOCKINDEX_DEFAULT_BASE_URL, stockIndexBaseUrl, stockIndexApiKey } =
  await import('../packages/a-stock-layer/dist/providers/stockindex/settings.js')
const { STOCKINDEX_METHOD_DOCS, STOCKINDEX_CUSTOM } =
  await import('../packages/a-stock-layer/dist/providers/stockindex/custom-method-docs.js')
const { STOCKINDEX_SPEC } =
  await import('../packages/a-stock-layer/dist/providers/stockindex/manifest.js')
const { STOCKINDEX_HANDLER_CAPS } =
  await import('../packages/a-stock-layer/dist/providers/stockindex/handler.js')
const { StockIndexHttpClient } =
  await import('../packages/a-stock-layer/dist/providers/stockindex/api/http-client.js')
const { providerRequiresApiKey } =
  await import('../packages/shared/dist/provider-priority-order.js')
const { buildInstrumentNamespace, normalizeInstrumentRef } =
  await import('../packages/shared/dist/instrument-symbol.js')
const { Capability } = await import('../packages/market-data-core/dist/core/capabilities.js')

const HAS_KEY = Boolean(process.env.OPPTRIX_STOCKINDEX_API_KEY)

test('settings — 默认基地址为 quant.opptrix.net', () => {
  assert.equal(STOCKINDEX_DEFAULT_BASE_URL, 'https://quant.opptrix.net')
  assert.equal(STOCKINDEX_SETTINGS.title, 'Opptrix量化')
  assert.equal(STOCKINDEX_SETTINGS.subtitle, 'Opptrix量化社区提供的标的检索接口')
})

test('settings — apiKey 必填、enabled 默认 false、无可编辑 baseUrl、supportsTest', () => {
  const enabled = STOCKINDEX_SETTINGS.fields.find(f => f.key === 'enabled')
  const apiKey = STOCKINDEX_SETTINGS.fields.find(f => f.key === 'apiKey')
  const baseUrl = STOCKINDEX_SETTINGS.fields.find(f => f.key === 'baseUrl')
  assert.equal(enabled?.default, false)
  assert.equal(apiKey?.type, 'secret')
  assert.equal(apiKey?.required, true)
  assert.equal(apiKey?.masked, true)
  assert.equal(apiKey?.label, '数据密钥')
  assert.equal(apiKey?.helpUrl, 'https://quant.opptrix.net/')
  assert.equal(baseUrl, undefined)
  assert.equal(STOCKINDEX_SETTINGS.supportsTest, true)
  assert.equal(providerRequiresApiKey(STOCKINDEX_SETTINGS.fields), true)
})

test('settings — stockIndexBaseUrl 忽略 env 覆盖，恒为固定基址', () => {
  const prev = process.env.OPPTRIX_STOCKINDEX_BASE_URL
  process.env.OPPTRIX_STOCKINDEX_BASE_URL = 'https://evil.example.com'
  try {
    assert.equal(stockIndexBaseUrl(), 'https://quant.opptrix.net')
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_STOCKINDEX_BASE_URL
    else process.env.OPPTRIX_STOCKINDEX_BASE_URL = prev
  }
})

test('settings — stockIndexApiKey 读环境变量；无 Key 时 fromConfig 返回 null', () => {
  const prevKey = process.env.OPPTRIX_STOCKINDEX_API_KEY
  delete process.env.OPPTRIX_STOCKINDEX_API_KEY
  try {
    assert.equal(stockIndexApiKey(), '')
    assert.equal(StockIndexHttpClient.fromConfig(), null)
  } finally {
    if (prevKey !== undefined) process.env.OPPTRIX_STOCKINDEX_API_KEY = prevKey
  }
})

test('parseOpptrixInstrumentId — 冒号 instrument_id 分类映射', () => {
  const of = parseOpptrixInstrumentId('CN:of:009049')
  assert.equal(of?.market, 'CN')
  assert.equal(of?.assetClass, 'FUND')
  assert.equal(of?.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(normalizeInstrumentRef({ market: 'CN', assetClass: 'FUND', symbol: '009049', exchange: 'PF' })), 'CN:PF.009049')

  const fund = parseOpptrixInstrumentId('CN:fund:110022')
  assert.equal(fund?.assetClass, 'FUND')
  assert.equal(fund?.exchange, 'PF')

  const etf = parseOpptrixInstrumentId('CN:ETF:510300.SH')
  assert.equal(etf?.assetClass, 'ETF')
  assert.equal(etf?.exchange, 'SH')
  assert.equal(etf?.symbol, '510300')

  const lof = parseOpptrixInstrumentId('CN:LOF:161725.SZ')
  assert.equal(lof?.assetClass, 'LOF')
  assert.equal(lof?.exchange, 'SZ')

  const reit = parseOpptrixInstrumentId('CN:REIT:508000.SH')
  assert.equal(reit?.assetClass, 'REIT')
  assert.equal(reit?.exchange, 'SH')

  const ind = parseOpptrixInstrumentId('CN:IND:881121.TI')
  assert.equal(ind?.assetClass, 'INDEX')
  assert.equal(ind?.exchange, 'TI')
  assert.equal(ind?.symbol, '881121')

  const otc = parseOpptrixInstrumentId('CN:OTC:000037.OF')
  assert.equal(otc?.assetClass, 'FUND')
  assert.equal(otc?.exchange, 'PF')

  const stock = parseOpptrixInstrumentId('cn:stock:688981.sh')
  assert.equal(stock?.assetClass, 'EQUITY')
  assert.equal(stock?.exchange, 'SH')

  const us = parseOpptrixInstrumentId('US:stock:AAPL')
  assert.equal(us?.assetClass, 'EQUITY')

  const hk = parseOpptrixInstrumentId('HK:stock:00700')
  assert.equal(hk?.assetClass, 'EQUITY')
  assert.equal(hk?.symbol, '00700')

  assert.equal(parseOpptrixInstrumentId('CN:OF.009049'), null) // 点号旧格式走 legacy 解析
  assert.equal(parseOpptrixInstrumentId('not-an-id'), null)
})

test('opptrixInstrumentToStockIndexItem — 适配器保留旧字段', () => {
  const item = opptrixInstrumentToStockIndexItem({
    instrument_id: 'CN:etf:510300',
    market: 'CN',
    class_token: 'etf',
    symbol: '510300',
    name: '沪深300ETF',
    venue: 'SSE',
    sub_type: 'ETF',
    currency: 'CNY',
  })
  assert.equal(item.instrumentId, 'CN:etf:510300')
  assert.equal(item.assetType, 'etf')
  assert.equal(item.exchange, 'SH')
  assert.equal(item.industryName, 'ETF')
})

test('stockIndexItemToInstrumentRef — 冒号 instrument_id 优先解析', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN', code: '009049', instrumentId: 'CN:of:009049', assetType: 'of',
  })
  assert.equal(ref?.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('opptrixNavToStandardRows — changePct 计算 + 倒序', () => {
  const rows = opptrixNavToStandardRows([
    { product_code: '009049', as_of_date: '2024-01-03', nav_unit: '1.1000', nav_cumulative: '1.1000' },
    { product_code: '009049', as_of_date: '2024-01-02', nav_unit: '1.0000', nav_cumulative: '1.0000' },
    { product_code: '009049', as_of_date: '2024-01-01', nav_unit: '0.5000', nav_cumulative: '0.5000' },
  ])
  assert.equal(rows.length, 3)
  assert.equal(rows[0]?.date, '2024-01-03')
  assert.equal(rows[0]?.code, '009049')
  assert.ok(Math.abs((rows[0]?.changePct ?? 0) - 10) < 1e-9) // (1.10-1.00)/1.00*100
  assert.ok(Math.abs((rows[1]?.changePct ?? 0) - 100) < 1e-9) // (1.00-0.50)/0.50*100
  assert.equal(rows[0]?.source, 'stockindex')
  assert.equal(rows[0]?.per10kGain, null)
})

test('opptrixLatestNavToQuoteRow — FundLatestNavItem → StandardFundQuoteRow', () => {
  const row = opptrixLatestNavToQuoteRow({
    id: '009049',
    product_code: '009049',
    product_name: '易方达高端制造混合A',
    as_of_date: '2024-01-03',
    nav_unit: '1.2345',
    nav_cumulative: '1.2345',
    fund_assets: '1000000000',
    per_10k_gain: '0',
    annualized_7d: null,
    remarks: null,
  })
  assert.ok(row)
  assert.equal(row.code, '009049')
  assert.equal(row.name, '易方达高端制造混合A')
  assert.equal(row.unitNav, 1.2345)
  assert.equal(row.accNav, 1.2345)
  assert.equal(row.navDate, '2024-01-03')
  assert.equal(row.source, 'stockindex')
  assert.equal(row.fundAssets, 1000000000)
})

test('opptrixInstrumentToProfileRow — Instrument → StandardFundProfileRow', () => {
  const row = opptrixInstrumentToProfileRow({
    instrument_id: 'CN:of:009049',
    market: 'CN',
    class_token: 'of',
    symbol: '009049',
    name: '易方达高端制造混合发起式A',
    sub_type: '混合型',
    venue: null,
    currency: 'CNY',
    status: 'active',
  })
  assert.ok(row)
  assert.equal(row.code, '009049')
  assert.equal(row.name, '易方达高端制造混合发起式A')
  assert.equal(row.fundType, '混合型')
  assert.equal(row.source, 'stockindex')
  assert.equal(row.instrumentId, 'CN:of:009049')
})

test('opptrixMetricsToRow — 绩效指标数值化', () => {
  const row = opptrixMetricsToRow({
    product_code: '009049',
    product_name: '易方达高端制造混合A',
    as_of_date: '2024-01-03',
    total_return: '12.34',
    annual_return: '8.9',
    win_rate: '60',
    max_drawdown: '-5.5',
    annual_vol: '15.2',
    sharpe: '1.2',
    days: 200,
  })
  assert.ok(row)
  assert.equal(row.code, '009049')
  assert.equal(row.totalReturn, 12.34)
  assert.equal(row.annualReturn, 8.9)
  assert.equal(row.maxDrawdown, -5.5)
  assert.equal(row.sharpe, 1.2)
  assert.equal(row.days, 200)
  assert.equal(row.source, 'stockindex')
})

test('manifest — 绑定含 CN FUND 三能力、CN ETF ETF_LIST、不含 SECTOR_LIST', () => {
  assert.equal(STOCKINDEX_SPEC.title, 'Opptrix量化')
  assert.equal(STOCKINDEX_SPEC.defaultPriority, 115)
  const bindings = STOCKINDEX_SPEC.bindingsFor(115, 4)
  const key = b => `${b.market}:${b.assetClass}:${b.capability}`

  for (const cap of [Capability.FUND_PROFILE, Capability.FUND_NAV, Capability.FUND_QUOTE]) {
    assert.ok(bindings.some(b => key(b) === `CN:FUND:${cap}`), `missing CN:FUND:${cap}`)
  }
  // cnFundBindings 中的 FUND_LIST / FUND_HOLDINGS 被过滤
  assert.ok(!bindings.some(b => key(b) === `CN:FUND:${Capability.FUND_LIST}`))
  assert.ok(!bindings.some(b => key(b) === `CN:FUND:${Capability.FUND_HOLDINGS}`))
  // SECTOR_LIST 移除
  assert.ok(!bindings.some(b => b.capability === Capability.SECTOR_LIST))
  // CN ETF ETF_LIST 保留
  assert.ok(bindings.some(b => key(b) === `CN:ETF:${Capability.ETF_LIST}`))
  // CN/US/HK EQUITY 搜索/列表
  for (const market of ['CN', 'US', 'HK']) {
    assert.ok(bindings.some(b => key(b) === `${market}:EQUITY:${Capability.STOCK_LIST}`))
    assert.ok(bindings.some(b => key(b) === `${market}:EQUITY:${Capability.INSTRUMENT_SEARCH}`))
  }
})

test('caps — 含三 FUND 能力、不含 SECTOR_LIST；etfList 保留', () => {
  const caps = STOCKINDEX_HANDLER_CAPS
  assert.ok(caps.includes(Capability.FUND_PROFILE))
  assert.ok(caps.includes(Capability.FUND_NAV))
  assert.ok(caps.includes(Capability.FUND_QUOTE))
  assert.ok(caps.includes(Capability.ETF_LIST))
  assert.ok(!caps.includes(Capability.SECTOR_LIST))
})

test('custom methods — 含 fundMetrics 与 stockIndexListStocks，不含板块/行业', async () => {
  const { findCustomMethod } = await import('../packages/a-stock-layer/dist/core/custom-methods.js')
  const { listCustomMethodsForAgent } =
    await import('../packages/a-stock-layer/dist/core/custom-methods-agent.js')

  assert.ok(findCustomMethod('stockindex', 'fundMetrics'))
  assert.ok(findCustomMethod('stockindex', 'stockIndexListStocks'))
  assert.equal(findCustomMethod('stockindex', 'stockIndexListBoards'), undefined)
  assert.equal(findCustomMethod('stockindex', 'stockIndexListIndustries'), undefined)
  assert.equal(findCustomMethod('stockindex', 'stockIndexListBoardStocks'), undefined)
  assert.equal(findCustomMethod('stockindex', 'stockIndexListIndustryStocks'), undefined)

  const listed = listCustomMethodsForAgent({ providerId: 'stockindex' })
  const names = listed.providers[0]?.methods.map(m => m.method) ?? []
  assert.ok(names.includes('fundMetrics'))
  assert.ok(names.includes('stockIndexListStocks'))
  assert.ok(!names.some(n => n.includes('Board') || n.includes('Industry')))
})

test('fundMetrics 文档字段齐全', () => {
  const doc = STOCKINDEX_METHOD_DOCS.fundMetrics
  assert.ok(doc)
  assert.ok(doc.sourceUrl.includes('/api/v1/funds/{code}/metrics'))
  assert.ok(doc.params.some(p => p.name === 'code' && p.required))
  assert.ok(doc.usage.includes('fundMetrics'))
  assert.ok(doc.example.includes('fundMetrics'))
  assert.ok(STOCKINDEX_CUSTOM.some(m => m.method === 'fundMetrics'))
})

test('isFreeMarketDataProvider — stockindex 为付费源（需 API Key）', async () => {
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
  const { isFreeMarketDataProvider } =
    await import('../packages/a-stock-layer/dist/core/free-provider-throttle.js')
  const de = new MarketDataEngine(false)
  registerAllDrivers(de.registry)
  assert.equal(isFreeMarketDataProvider('stockindex'), false)
})

test('live 联调开关 — 有 Key 时直接命中 009049', { skip: !HAS_KEY }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
  const de = new MarketDataEngine(false)
  registerAllDrivers(de.registry)
  const hits = await searchInstrumentsOnline(de, '009049', 8, ['CN'])
  assert.ok(hits.some(h => h.code === 'CN:PF.009049'))
})
