/**
 * CN:PF 命名空间对齐 — watchlist / 共享解析 / 搜索命中路径
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInstrumentNamespace,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
} from '@opptrix/shared'
import {
  legacyToInstrument,
  normalizeWatchlistItem,
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

test('parseInstrumentNamespace — CN:OF / CN:PF 公募基金', () => {
  const ofRef = parseInstrumentNamespace('CN:OF.009049')
  assert.equal(ofRef?.assetClass, 'FUND')
  assert.equal(ofRef?.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ofRef), 'CN:PF.009049')

  const pfRef = parseInstrumentNamespace('CN:PF.110022')
  assert.equal(pfRef?.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(pfRef), 'CN:PF.110022')
})

test('normalizeInstrumentRef — 场内 ETF 代码不落成 PF', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '510330',
    exchange: 'PF',
  })
  // 共享层 resolveCnInstrumentIdentity：场内 ETF（51/52/159 等）须走交易所行情
  assert.equal(buildInstrumentNamespace(ref), 'CN:SH.510330')
})

test('parseInstrumentNamespace — CN:SH / HK 命名空间', () => {
  const sh = parseInstrumentNamespace('CN:SH.600519')
  assert.equal(sh?.market, 'CN')
  assert.equal(sh?.symbol, '600519')
  assert.equal(sh?.exchange, 'SH')

  const hk = parseInstrumentNamespace('HK:HK.00002')
  assert.equal(hk?.market, 'HK')
  assert.equal(hk?.symbol, '00002')
})

test('normalizeInstrumentRef — US EQUITY', () => {
  const ref = normalizeInstrumentRef({
    market: 'US',
    assetClass: 'EQUITY',
    symbol: 'AAPL',
  })
  assert.equal(ref.market, 'US')
  assert.equal(ref.symbol, 'AAPL')
  assert.equal(buildInstrumentNamespace(ref), 'US:AAPL')
})
