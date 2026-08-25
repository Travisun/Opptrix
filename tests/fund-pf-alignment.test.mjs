/**
 * CN:PF 命名空间对齐 — watchlist / stockindex / 搜索命中路径
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInstrumentNamespace } from '@opptrix/shared'
import {
  legacyToInstrument,
  normalizeWatchlistItem,
  stockIndexItemToInstrumentRef,
} from '@opptrix/a-stock-layer'

test('legacyToInstrument — CN:OF 兼容解析为 FUND + PF', () => {
  const ref = legacyToInstrument('CN:OF.009049')
  assert.equal(ref.market, 'CN')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.symbol, '009049')
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('legacyToInstrument — CN:PF 直接解析', () => {
  const ref = legacyToInstrument('CN:PF.110022')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.110022')
})

test('normalizeWatchlistItem — 旧 code CN:OF 规范为 CN:PF', () => {
  const item = normalizeWatchlistItem({ code: 'CN:OF.009049', name: '某基金' })
  assert.equal(item.code, 'CN:PF.009049')
  assert.equal(item.instrument?.assetClass, 'FUND')
  assert.equal(item.instrument?.exchange, 'PF')
})

test('stockIndexItemToInstrumentRef — CN:OF instrumentId + assetType fund', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN',
    code: '009049',
    instrumentId: 'CN:OF.009049',
    assetType: 'fund',
  })
  assert.ok(ref)
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('stockIndexItemToInstrumentRef — 远程 CN:PF instrumentId 直接采用', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN',
    code: '009049',
    instrumentId: 'CN:PF.009049',
    exchange: 'PF',
    assetType: 'fund',
    board: 'fund',
    nameCn: '易方达高端制造混合发起式A',
  })
  assert.ok(ref)
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('stockIndexItemToInstrumentRef — CN:SZ + 基金名称落成 CN:PF', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN',
    code: '009049',
    instrumentId: 'CN:SZ.009049',
    nameCn: '某混合型基金',
    assetType: 'equity',
  })
  assert.ok(ref)
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('stockIndexItemToInstrumentRef — CN:PF instrumentId（ETF 代码段落交易所行情，不落 PF）', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN',
    code: '510330',
    instrumentId: 'CN:PF.510330',
    assetType: 'fund',
  })
  assert.ok(ref)
  // 共享层 resolveCnInstrumentIdentity：场内 ETF（51/52/159 等）须走交易所行情，不可落成 PF 公募基金
  assert.equal(buildInstrumentNamespace(ref), 'CN:SH.510330')
})

test('stockIndexItemToInstrumentRef — OpptrixQuant 冒号 instrument_id CN:of:009049 → CN:PF', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN',
    code: '009049',
    instrumentId: 'CN:of:009049',
    assetType: 'of',
    nameCn: '易方达高端制造混合发起式A',
  })
  assert.ok(ref)
  assert.equal(ref.market, 'CN')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('stockIndexItemToInstrumentRef — OpptrixQuant 冒号 CN:fund 与 CN:etf', () => {
  const fund = stockIndexItemToInstrumentRef({
    market: 'CN', code: '110022', instrumentId: 'CN:fund:110022',
  })
  assert.equal(fund?.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(fund), 'CN:PF.110022')

  const etf = stockIndexItemToInstrumentRef({
    market: 'CN', code: '510300', instrumentId: 'CN:etf:510300',
  })
  assert.equal(etf?.assetClass, 'ETF')
  assert.equal(buildInstrumentNamespace(etf), 'CN:SH.510300')
})

test('stockIndexItemToInstrumentRef — US:stock:AAPL → US EQUITY', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'US',
    code: 'AAPL',
    instrumentId: 'US:stock:AAPL',
    nameCn: '苹果',
  })
  assert.ok(ref)
  assert.equal(ref.market, 'US')
  assert.equal(ref.assetClass, 'EQUITY')
  assert.equal(ref.symbol, 'AAPL')
  assert.equal(buildInstrumentNamespace(ref), 'US:AAPL')
})

test('stockIndexItemToInstrumentRef — venue SSE → SH / SZSE → SZ', () => {
  const sh = stockIndexItemToInstrumentRef({
    market: 'CN', code: '600519', venue: 'SSE',
  })
  assert.equal(sh?.exchange, 'SH')
  assert.equal(buildInstrumentNamespace(sh), 'CN:SH.600519')

  const sz = stockIndexItemToInstrumentRef({
    market: 'CN', code: '000002', venue: 'SZSE',
  })
  assert.equal(sz?.exchange, 'SZ')
  assert.equal(buildInstrumentNamespace(sz), 'CN:SZ.000002')

  const hk = stockIndexItemToInstrumentRef({
    market: 'HK', code: '00700', venue: 'HKEX',
  })
  assert.equal(hk?.exchange, 'HK')
  assert.equal(buildInstrumentNamespace(hk), 'HK:00700')
})
