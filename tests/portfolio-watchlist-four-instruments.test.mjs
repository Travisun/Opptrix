/**
 * 关注列表四类标的 — 持仓录入 CRUD、场外基金自定义费率、收益计算（每类 ≥50 笔成交）
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { calcHoldingPnlFromTrades } from '../packages/shared/dist/portfolio-return.js'

/** @typedef {{ label: string, code: string, market: string, assetClass: string, markPrice: number, markCap: 'realtime' | 'fund_quote', queryCode?: string, displayCode?: string }} InstrumentSpec */

/** @type {InstrumentSpec[]} */
const WATCHLIST_FOUR = [
  {
    label: 'CN 个股',
    code: '600519',
    market: 'CN',
    assetClass: 'EQUITY',
    markPrice: 1800,
    markCap: 'realtime',
  },
  {
    label: 'CN ETF',
    code: '510300',
    market: 'CN',
    assetClass: 'ETF',
    markPrice: 4.52,
    markCap: 'realtime',
  },
  {
    label: 'CN 场外基金',
    code: '009049',
    market: 'CN',
    assetClass: 'FUND',
    markPrice: 1.35,
    markCap: 'fund_quote',
    queryCode: 'CN:OTC:009049.OF',
    displayCode: 'CN:OTC:009049.OF',
  },
  {
    label: 'HK 个股',
    code: '00700',
    market: 'HK',
    assetClass: 'EQUITY',
    markPrice: 380,
    markCap: 'realtime',
  },
]

const MIN_TRADES = 52

/** @param {InstrumentSpec} spec */
function enginePriceFor(spec) {
  return {
    async queryInstrumentData(ref, cap) {
      assert.equal(cap, spec.markCap, `${spec.label} 应走 ${spec.markCap}`)
      assert.equal(ref.market, spec.market)
      assert.equal(ref.assetClass, spec.assetClass)
      return {
        data: [{ name: spec.label, price: spec.markPrice, unitNav: spec.markPrice }],
      }
    },
  }
}

/**
 * @param {import('../packages/a-stock-layer/dist/portfolio/manager.js').PortfolioManager} pm
 * @param {InstrumentSpec} spec
 */
async function seedManyTrades(pm, spec) {
  const ids = []
  for (let i = 0; i < MIN_TRADES; i++) {
    const month = String((i % 12) + 1).padStart(2, '0')
    const day = String((i % 28) + 1).padStart(2, '0')
    const date = `2024-${month}-${day}`
    const price = Math.round(spec.markPrice * (0.92 + (i % 15) * 0.005) * 100) / 100
    let side = 'buy'
    let shares = 10 + (i % 4)
    if (i >= 20 && i % 2 === 1) {
      side = 'sell'
      shares = 5
    }
    const fn = side === 'buy' ? pm.buy.bind(pm) : pm.sell.bind(pm)
    const row = await fn(spec.code, shares, price, date, spec.label, spec.market, spec.assetClass)
    assert.equal(row.market, spec.market)
    assert.equal(row.assetClass, spec.assetClass)
    if (spec.displayCode) assert.equal(row.code, spec.displayCode)
    ids.push(row.id)
  }
  return ids
}

/** @param {import('../packages/a-stock-layer/dist/portfolio/store.js').PortfolioStore} store */
function tradesForSpec(store, spec) {
  const code = spec.queryCode ?? spec.code
  return store.getTrades(code, spec.market)
}

describe('portfolio watchlist — four instruments × 50+ trades CRUD & PnL', () => {
  /** @type {string} */
  let tmpDir
  /** @type {typeof import('../packages/a-stock-layer/dist/portfolio/manager.js').PortfolioManager} */
  let PortfolioManager
  /** @type {typeof import('../packages/a-stock-layer/dist/portfolio/store.js').PortfolioStore} */
  let PortfolioStore
  /** @type {typeof import('../packages/user-store/dist/index.js').getUserDataStore} */
  let getUserDataStore

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-portfolio-four-'))
    process.env.OPPTRIX_DATA_DIR = tmpDir
    ;({ getUserDataStore } = await import('../packages/user-store/dist/index.js'))
    getUserDataStore().close()
    ;({ PortfolioManager } = await import('../packages/a-stock-layer/dist/portfolio/manager.js'))
    ;({ PortfolioStore } = await import('../packages/a-stock-layer/dist/portfolio/store.js'))
    PortfolioStore.resetForTests()
  })

  after(() => {
    try { PortfolioStore.resetForTests() } catch { /* ignore */ }
    try { getUserDataStore().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  for (const spec of WATCHLIST_FOUR) {
    it(`${spec.label} — 录入 ≥${MIN_TRADES} 笔、查删、持仓与收益`, async () => {
      const store = PortfolioStore.getInstance()
      store.clearAll()

      const pm = new PortfolioManager(enginePriceFor(spec))
      const ids = await seedManyTrades(pm, spec)

      // Read — 全量与按标的
      const all = store.getTrades()
      assert.equal(all.length, MIN_TRADES, 'store 应保留全部成交')
      const filtered = tradesForSpec(store, spec)
      assert.equal(filtered.length, MIN_TRADES, '按标的查询应返回全部成交')
      assert.ok(filtered.every(t => t.assetClass === spec.assetClass))

      // Delete — 删一笔后少 1
      const removedId = ids[10]
      assert.equal(pm.removeTrade(removedId), true)
      assert.equal(tradesForSpec(store, spec).length, MIN_TRADES - 1)

      // Holdings + mark price
      const holdings = await pm.holdings(true)
      assert.equal(holdings.length, 1)
      const h = holdings[0]
      assert.equal(h.assetClass, spec.assetClass)
      assert.equal(h.currentPrice, spec.markPrice)
      assert.ok(h.shares > 0)

      // PnL 与 shared 加权成本一致
      const lots = tradesForSpec(store, spec).map(t => ({
        id: t.id,
        tradeSide: t.tradeSide,
        shares: t.shares,
        price: t.price,
        amount: t.amount,
        totalFee: t.totalFee,
        tradeDate: t.tradeDate,
      }))
      const expected = calcHoldingPnlFromTrades(lots, spec.markPrice)
      assert.equal(h.shares, expected.shares)
      assert.equal(h.totalCost, expected.totalCost)
      assert.equal(h.realizedPnl, expected.realizedPnl)
      assert.equal(h.unrealizedPnl, expected.unrealizedPnl)
      assert.equal(h.totalPnl, expected.totalPnl)
      assert.equal(h.totalPnlPct, expected.totalPnlPct)

      store.clearAll()
    })
  }

  it('四类标的同账本 — 各 ≥50 笔、summary 汇总与 clearInstrument 隔离', async () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()

    for (const spec of WATCHLIST_FOUR) {
      const pm = new PortfolioManager(enginePriceFor(spec))
      await seedManyTrades(pm, spec)
    }

    assert.equal(store.getTrades().length, MIN_TRADES * WATCHLIST_FOUR.length)

    // 同一 PortfolioStore — 任意 PortfolioManager 实例均可拉全量 summary
    const anyPm = new PortfolioManager({
      async queryInstrumentData(ref, cap) {
        const hit = WATCHLIST_FOUR.find(
          s => s.market === ref.market && s.assetClass === ref.assetClass,
        )
        const price = hit?.markPrice ?? 100
        return { data: [{ price, unitNav: price }] }
      },
    })
    const fullSummary = await anyPm.summary(true)
    assert.equal(fullSummary.holdingsCount, WATCHLIST_FOUR.length)
    assert.equal(fullSummary.tradesCount, MIN_TRADES * WATCHLIST_FOUR.length)
    assert.ok(fullSummary.totalCost > 0)
    assert.ok(Number.isFinite(fullSummary.totalPnl))

    let sumCost = 0
    let sumPnl = 0
    for (const h of fullSummary.holdings) {
      sumCost += h.totalCost
      sumPnl += h.totalPnl
    }
    assert.equal(Math.round(sumCost * 100) / 100, fullSummary.totalCost)
    assert.equal(
      Math.round((sumPnl) * 100) / 100,
      Math.round((fullSummary.totalUnrealizedPnl + fullSummary.totalRealizedPnl) * 100) / 100,
    )

    // clearInstrument 只清 HK，其余三类仍在
    const hk = WATCHLIST_FOUR.find(s => s.market === 'HK')
    const cleared = anyPm.clearInstrument(hk.code, hk.market)
    assert.equal(cleared.removed, MIN_TRADES)
    assert.equal(store.getTrades().length, MIN_TRADES * (WATCHLIST_FOUR.length - 1))

    store.clearAll()
  })
})

describe('portfolio watchlist — OTC fund custom fees × 50+ trades', () => {
  /** @type {string} */
  let tmpDir
  /** @type {typeof import('../packages/a-stock-layer/dist/portfolio/manager.js').PortfolioManager} */
  let PortfolioManager
  /** @type {typeof import('../packages/a-stock-layer/dist/portfolio/store.js').PortfolioStore} */
  let PortfolioStore
  /** @type {typeof import('../packages/user-store/dist/index.js').getUserDataStore} */
  let getUserDataStore

  const FUND = WATCHLIST_FOUR[2]

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-portfolio-otc-fee-'))
    process.env.OPPTRIX_DATA_DIR = tmpDir
    ;({ getUserDataStore } = await import('../packages/user-store/dist/index.js'))
    getUserDataStore().close()
    ;({ PortfolioManager } = await import('../packages/a-stock-layer/dist/portfolio/manager.js'))
    ;({ PortfolioStore } = await import('../packages/a-stock-layer/dist/portfolio/store.js'))
    PortfolioStore.resetForTests()
  })

  after(() => {
    try { PortfolioStore.resetForTests() } catch { /* ignore */ }
    try { getUserDataStore().close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it(`场外基金 — 自定义申购/赎回费率、${MIN_TRADES}+ 笔改费率重算`, async () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()

    const pm = new PortfolioManager(enginePriceFor(FUND))

    // 自定义申购 0.12%、赎回 0.5%
    pm.setInstrumentFees(FUND.displayCode, {
      ledgerKind: 'otc_fund',
      subscriptionFee: { mode: 'rate', rate: 0.0012 },
      redemptionFee: { mode: 'rate', rate: 0.005 },
    }, FUND.market)

    const feeInfo = pm.getInstrumentFees(FUND.displayCode, FUND.market, FUND.assetClass)
    assert.equal(feeInfo.ledgerKind, 'otc_fund')

    for (let i = 0; i < MIN_TRADES; i++) {
      const month = String((i % 12) + 1).padStart(2, '0')
      const day = String((i % 28) + 1).padStart(2, '0')
      const price = 1.2 + (i % 20) * 0.01
      const side = i >= 25 && i % 2 === 1 ? 'sell' : 'buy'
      const shares = side === 'buy' ? 100 : 50
      const fn = side === 'buy' ? pm.buy.bind(pm) : pm.sell.bind(pm)
      await fn(FUND.code, shares, price, `2023-${month}-${day}`, FUND.label, FUND.market, FUND.assetClass)
    }

    const rows = tradesForSpec(store, FUND)
    assert.equal(rows.length, MIN_TRADES)

    for (const t of rows) {
      if (t.tradeSide === 'buy') {
        const expectedSub = Math.round(t.amount * 0.0012 * 100) / 100
        assert.equal(t.commission, expectedSub, `buy id=${t.id} 申购费`)
        assert.equal(t.totalFee, expectedSub)
        assert.equal(t.stampDuty, 0)
      } else {
        const expectedRed = Math.round(t.amount * 0.005 * 100) / 100
        assert.equal(t.commission, expectedRed, `sell id=${t.id} 赎回费`)
        assert.equal(t.totalFee, expectedRed)
      }
    }

    // Update — 调低申购费率，应重算历史 buy
    const { recalculatedTrades } = store.setInstrumentFees(
      FUND.displayCode,
      FUND.market,
      {
        ledgerKind: 'otc_fund',
        subscriptionFee: { mode: 'rate', rate: 0.0008 },
        redemptionFee: { mode: 'rate', rate: 0.005 },
      },
    )
    assert.ok(recalculatedTrades >= 20, '改费率应重算多笔 buy')

    const afterUpdate = tradesForSpec(store, FUND).filter(t => t.tradeSide === 'buy')
    for (const t of afterUpdate) {
      const expectedSub = Math.round(t.amount * 0.0008 * 100) / 100
      assert.equal(t.commission, expectedSub)
    }

    // PnL 仍与 shared 一致
    const holdings = await pm.holdings(true)
    assert.equal(holdings.length, 1)
    const lots = tradesForSpec(store, FUND).map(t => ({
      id: t.id,
      tradeSide: t.tradeSide,
      shares: t.shares,
      price: t.price,
      amount: t.amount,
      totalFee: t.totalFee,
      tradeDate: t.tradeDate,
    }))
    const expected = calcHoldingPnlFromTrades(lots, FUND.markPrice)
    assert.equal(holdings[0].totalPnl, expected.totalPnl)
    assert.equal(holdings[0].realizedPnl, expected.realizedPnl)

    // 恢复默认费率
    store.setInstrumentFees(FUND.displayCode, FUND.market, {})
    const zeroFeeBuys = tradesForSpec(store, FUND).filter(t => t.tradeSide === 'buy')
    assert.ok(zeroFeeBuys.every(t => t.totalFee === 0))

    store.clearAll()
  })

  it('场外基金 — 固定申购费 override', async () => {
    const store = PortfolioStore.getInstance()
    store.clearAll()
    const pm = new PortfolioManager(enginePriceFor(FUND))

    pm.setInstrumentFees(FUND.displayCode, {
      ledgerKind: 'otc_fund',
      subscriptionFee: { mode: 'fixed', fixed: 2.5 },
    }, FUND.market)

    for (let i = 0; i < MIN_TRADES; i++) {
      const day = String((i % 28) + 1).padStart(2, '0')
      await pm.buy(FUND.code, 50, 1.1, `2022-06-${day}`, FUND.label, FUND.market, FUND.assetClass)
    }

    const rows = tradesForSpec(store, FUND)
    assert.equal(rows.length, MIN_TRADES)
    assert.ok(rows.every(t => t.totalFee === 2.5))

    const h = (await pm.holdings(true))[0]
    const lots = rows.map(t => ({
      id: t.id,
      tradeSide: t.tradeSide,
      shares: t.shares,
      price: t.price,
      amount: t.amount,
      totalFee: t.totalFee,
      tradeDate: t.tradeDate,
    }))
    assert.equal(h.totalPnl, calcHoldingPnlFromTrades(lots, FUND.markPrice).totalPnl)

    store.clearAll()
  })
})
