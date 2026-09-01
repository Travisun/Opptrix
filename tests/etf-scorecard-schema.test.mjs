/**
 * ETF 决策雷达：scorecard SQL 对齐 stock_quotes_daily schema；
 * Hub etf_scorecard 须 await，异常应落成 ResearchResult 而非未处理 rejection。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MarketDataStore } from '../packages/market-data/dist/store.js'
import { computeEtfScorecard } from '../packages/market-data/dist/query/etf-scorecard.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'

describe('etf scorecard schema + hub await', () => {
  it('computeEtfScorecard does not query missing amount column', () => {
    const store = new MarketDataStore(':memory:')
    try {
      const cols = store.db.prepare(`PRAGMA table_info(stock_quotes_daily)`).all()
        .map(/** @param {{ name: string }} r */ r => r.name)
      assert.ok(!cols.includes('amount'), 'schema must not have amount on stock_quotes_daily')

      const now = new Date().toISOString()
      store.db.prepare(`
        INSERT INTO instruments (code, market, asset_class, name, exchange, status, updated_at)
        VALUES ('510300', 'CN', 'ETF', '沪深300ETF', 'SH', 'active', ?)
      `).run(now)
      store.db.prepare(`
        INSERT INTO stock_quotes_daily (trade_date, code, close, pe, pb, market_cap, turnover_rate, volume_ratio, change_pct, synced_at)
        VALUES ('2026-08-11', '510300', 4.2, NULL, NULL, NULL, 0.5, 1.0, 0.1, ?)
      `).run(now)

      const card = computeEtfScorecard(store, '510300')
      assert.ok(card, 'expected scorecard for seeded ETF')
      assert.equal(card.code, '510300')
      assert.equal(card.source, 'local')
      assert.ok(Array.isArray(card.dimensions))
      assert.ok(card.dimensions.some(d => d.key === 'scale_liquidity'))
    } finally {
      store.close()
    }
  })

  it('hub.dispatch etf_scorecard settles without unhandled rejection', async () => {
    const hub = new ResearchHub()
    const result = await hub.dispatch('etf_scorecard', { code: '510300' })
    assert.equal(typeof result.success, 'boolean')
    assert.equal(typeof result.message, 'string')
    assert.ok(!String(result.message).includes('no such column: amount'))
    if (result.success) {
      const data = /** @type {{ code?: string, source?: string }} */ (result.data)
      // Hub 在线路径经 instrumentHubCode 返回 Opptrix ETF ID
      assert.equal(data?.code, 'CN:ETF:510300.SH')
      assert.ok(data?.source === 'local' || data?.source === 'online')
    } else {
      assert.ok(result.message.length > 0)
      assert.ok(!String(result.message).includes('no such column'))
    }
  })
})
