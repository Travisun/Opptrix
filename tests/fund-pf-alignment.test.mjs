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

test('stockIndexItemToInstrumentRef — CN:PF instrumentId', () => {
  const ref = stockIndexItemToInstrumentRef({
    market: 'CN',
    code: '510330',
    instrumentId: 'CN:PF.510330',
    assetType: 'fund',
  })
  assert.ok(ref)
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.510330')
})
