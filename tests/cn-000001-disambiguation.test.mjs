import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveInstrumentQueryPlan } from '../packages/a-stock-layer/dist/core/instrument-query.js'
import { Capability } from '../packages/a-stock-layer/dist/core/capabilities.js'
import { inferCnAssetClass } from '../packages/a-stock-layer/dist/core/instrument.js'
import {
  isShIndexCode,
  resolveStockMarketCode,
} from '../packages/a-stock-layer/dist/utils/helpers.js'
import {
  toThsCode,
  toThsCodeFromRef,
  toIndexThsCode,
} from '../packages/a-stock-layer/dist/providers/tonghuashun/api/symbols.js'
import {
  toTickflowSymbol,
  toTickflowIndexSymbol,
} from '../packages/a-stock-layer/dist/providers/tickflow/api/symbols.js'
import { toTsCode as zzshareToTsCode } from '../packages/a-stock-layer/dist/providers/zzshare/api/symbols.js'
import { routeInstrumentQuotes } from '../packages/research-hub/dist/instrument-router.js'

test('toThsCode: SZ.000001 is Ping An Bank, SH.000001 is index, bare defaults SZ', () => {
  assert.equal(toThsCode('000001', 'SZ'), '000001.SZ')
  assert.equal(toThsCode('000001', 'SH'), '000001.SH')
  assert.equal(toThsCode('000001'), '000001.SZ')
  assert.equal(toThsCodeFromRef({ symbol: '000001', exchange: 'SZ' }), '000001.SZ')
  assert.equal(toThsCodeFromRef({ symbol: '000001', exchange: 'SH' }), '000001.SH')
  assert.equal(toIndexThsCode('000001'), '000001.SH')
})

test('toTickflowSymbol: 000001.SZ vs 000001.SH', () => {
  assert.equal(toTickflowSymbol('CN', '000001', 'SZ'), '000001.SZ')
  assert.equal(toTickflowSymbol('CN', '000001', 'SH'), '000001.SH')
  assert.equal(toTickflowSymbol('CN', '000001'), '000001.SZ')
  assert.equal(toTickflowIndexSymbol('000001'), '000001.SH')
  assert.equal(toTickflowIndexSymbol('399001'), '399001.SZ')
})

test('zzshare toTsCode does not map bare 000001 to SH index', () => {
  assert.equal(zzshareToTsCode('000001'), '000001.SZ')
  assert.equal(zzshareToTsCode('000001', 'SZ'), '000001.SZ')
  assert.equal(zzshareToTsCode('000001', 'SH'), '000001.SH')
  assert.equal(zzshareToTsCode('000300'), '000300.SH')
})

test('helpers identity: bare 000001 is SZ/EQUITY, not SH index', () => {
  assert.equal(isShIndexCode('000001'), false)
  assert.equal(inferCnAssetClass('000001'), 'EQUITY')
  assert.equal(resolveStockMarketCode('000001'), 'SZ')
  assert.equal(isShIndexCode('000300'), true)
  assert.equal(inferCnAssetClass('000300'), 'INDEX')
})

test('resolveInstrumentQueryPlan: CN:SZ.000001 EQUITY is stock snapshot, not INDEX_REALTIME', () => {
  const sz = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'EQUITY', symbol: '000001', exchange: 'SZ' },
    'realtime',
  )
  assert.equal(sz?.kind, 'cn_realtime')
  if (sz?.kind === 'cn_realtime') {
    assert.equal(sz.symbol, '000001')
    assert.equal(sz.exchange, 'SZ')
    assert.equal(sz.assetClass, 'EQUITY')
  }
  assert.notEqual(sz?.kind, 'registry')
  if (sz?.kind === 'registry') {
    assert.notEqual(sz.capability, Capability.INDEX_REALTIME)
    assert.notEqual(sz.method, 'indexRealtime')
  }
})

test('resolveInstrumentQueryPlan: CN:SH.000001 INDEX is INDEX_REALTIME', () => {
  const sh = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'INDEX', symbol: '000001', exchange: 'SH' },
    'realtime',
  )
  assert.equal(sh?.kind, 'registry')
  if (sh?.kind === 'registry') {
    assert.equal(sh.assetClass, 'INDEX')
    assert.equal(sh.capability, Capability.INDEX_REALTIME)
    assert.equal(sh.method, 'indexRealtime')
    assert.deepEqual(sh.args, ['000001'])
  }
})

test('resolveInstrumentQueryPlan kline keeps assetClass; 000001 EQUITY is not index kline', () => {
  const equity = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'EQUITY', symbol: '000001', exchange: 'SZ' },
    'kline',
  )
  assert.equal(equity?.kind, 'cn_kline')
  if (equity?.kind === 'cn_kline') {
    assert.equal(equity.assetClass, 'EQUITY')
    assert.equal(equity.exchange, 'SZ')
  }

  const index = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'INDEX', symbol: '000001', exchange: 'SH' },
    'kline',
  )
  assert.equal(index?.kind, 'registry')
  if (index?.kind === 'registry') {
    assert.equal(index.assetClass, 'INDEX')
    assert.equal(index.method, 'indexKline')
    assert.deepEqual(index.args, ['000001', 'daily', '', '', 120])
  }
})

test('toIndexThsCode is only for INDEX path (plan method), equity uses toThsCode + exchange', () => {
  const equity = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'EQUITY', symbol: '000001', exchange: 'SZ' },
    'realtime',
  )
  assert.notEqual(equity && 'method' in equity ? equity.method : '', 'indexRealtime')
  assert.equal(toThsCode('000001', 'SZ'), '000001.SZ')
  const index = resolveInstrumentQueryPlan(
    { market: 'CN', assetClass: 'INDEX', symbol: '000001', exchange: 'SH' },
    'realtime',
  )
  assert.equal(index && 'method' in index ? index.method : '', 'indexRealtime')
  assert.equal(toIndexThsCode('000001'), '000001.SH')
})

test('routeInstrumentQuotes matches 000001 by exchange, not bare code', async () => {
  const handlers = {
    stockQuotes: async (refs) => ({
      success: true,
      message: 'ok',
      elapsed: 0,
      data: {
        quotes: refs.map(r => ({
          code: r.symbol,
          name: '平安银行',
          price: 11.5,
          exchange: r.exchange,
          instrument: r,
        })),
      },
    }),
    cnInstrumentRealtime: async (ref) => ({
      success: true,
      message: 'ok',
      elapsed: 0,
      data: {
        code: ref.symbol,
        name: '上证指数',
        price: 3100,
        exchange: ref.exchange,
        instrument: ref,
      },
    }),
  }

  const resp = await routeInstrumentQuotes({
    instruments: [
      { market: 'CN', assetClass: 'EQUITY', symbol: '000001', exchange: 'SZ' },
      { market: 'CN', assetClass: 'INDEX', symbol: '000001', exchange: 'SH' },
    ],
  }, handlers)

  assert.equal(resp.success, true)
  const byEx = new Map(resp.data.quotes.map(q => [q.instrument.exchange, q]))
  assert.equal(byEx.get('SZ')?.name, '平安银行')
  assert.equal(byEx.get('SZ')?.price, 11.5)
  assert.equal(byEx.get('SH')?.name, '上证指数')
  assert.equal(byEx.get('SH')?.price, 3100)
})
