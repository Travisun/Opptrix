/**
 * 标的在线搜索 — OpptrixQuant（stockindex 单源）回归
 *
 * 需要 `OPPTRIX_STOCKINDEX_API_KEY`（真实联调）；无 Key 时自动跳过。
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const HAS_KEY = Boolean(process.env.OPPTRIX_STOCKINDEX_API_KEY)

test('searchInstrumentsOnline — CN 公募基金 009049 → CN:PF', { timeout: 30_000, skip: !HAS_KEY }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
  const de = new MarketDataEngine(false)
  registerAllDrivers(de.registry)

  const hits = await searchInstrumentsOnline(de, '009049', 8, ['CN'])
  const fund = hits.find(h => h.instrument.symbol === '009049' && h.instrument.assetClass === 'FUND')
  assert.ok(fund, '应命中 009049 公募基金')
  assert.equal(fund.code, 'CN:PF.009049')
  assert.equal(fund.refLabel, 'CN:PF.009049')
  assert.equal(fund.source, 'stock_index')
  assert.ok(fund.name?.includes('易方达') || fund.name?.includes('009049'))
})

test('searchInstrumentsOnline — CN 股票与 US 标的', { timeout: 30_000, skip: !HAS_KEY }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
  const de = new MarketDataEngine(false)
  registerAllDrivers(de.registry)

  const cn = await searchInstrumentsOnline(de, '600519', 5, ['CN'])
  assert.ok(cn.some(h => h.instrument.symbol === '600519' && h.instrument.assetClass !== 'FUND'))

  const us = await searchInstrumentsOnline(de, 'AAPL', 5, ['US'])
  assert.ok(us.some(h => h.instrument.symbol === 'AAPL'))
  assert.ok(us.every(h => h.source === 'stock_index'))
})

test('searchInstrumentsOnline — 基金名称关键词', { timeout: 30_000, skip: !HAS_KEY }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
  const de = new MarketDataEngine(false)
  registerAllDrivers(de.registry)

  const hits = await searchInstrumentsOnline(de, '易方达高端制造', 5, ['CN'])
  assert.ok(hits.length > 0)
  const pfHit = hits.find(h => h.instrument.assetClass === 'FUND' && h.code.startsWith('CN:PF.'))
  assert.ok(pfHit, '名称搜基金应返回 CN:PF 命名空间')
})
