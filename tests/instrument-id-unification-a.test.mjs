/**
 * 方案 A：多市场标的 ID 统一化最小闭环
 * — 歧义短码不得 pad 成 CN；Tickflow 灌库字段；本地 hit namespace
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCanonicalInstrumentInput,
  isAmbiguousNumericCode,
  isUnambiguousCnDigits,
  buildInstrumentNamespace,
  normalizeInstrumentRef,
} from '../packages/shared/dist/instrument-symbol.js'
import {
  isLikelyCnEquityInput,
  instrumentRefKey,
  instrumentDisplayCode,
} from '../packages/shared/dist/instrument-ref.js'
import {
  resolveInstrumentFromParams,
  instrumentRefsFromList,
} from '../packages/shared/dist/instrument-param.js'

test('歧义 1–5 位裸数字：权威解析返回 null，不得变成 pad 后的 CN', () => {
  assert.equal(isAmbiguousNumericCode('700'), true)
  assert.equal(isAmbiguousNumericCode('00700'), true)
  assert.equal(isAmbiguousNumericCode('0700'), true)
  assert.equal(isUnambiguousCnDigits('600519'), true)
  assert.equal(isUnambiguousCnDigits('700'), false)

  assert.equal(parseCanonicalInstrumentInput('700'), null)
  assert.equal(parseCanonicalInstrumentInput('00700'), null)
  assert.equal(parseCanonicalInstrumentInput('0700'), null)

  assert.equal(isLikelyCnEquityInput('700'), false)
  assert.equal(isLikelyCnEquityInput('00700'), false)
  assert.equal(isLikelyCnEquityInput('600519'), true)

  assert.equal(resolveInstrumentFromParams({ code: '700' }), null)
  assert.equal(resolveInstrumentFromParams({ code: '00700' }), null)

  const refs = instrumentRefsFromList(['700', '00700', '600519'])
  assert.equal(refs.length, 1)
  assert.equal(refs[0]?.market, 'CN')
  assert.equal(refs[0]?.symbol, '600519')
})

test('显式港股 / 后缀可解析；与假想 CN:SZ.000700 分键', () => {
  const hk = parseCanonicalInstrumentInput('HK:00700')
  assert.equal(hk?.market, 'HK')
  assert.equal(hk?.symbol, '00700')
  assert.equal(buildInstrumentNamespace(hk), 'HK:00700')

  const hkDot = parseCanonicalInstrumentInput('00700.HK')
  assert.equal(hkDot?.market, 'HK')
  assert.equal(hkDot?.symbol, '00700')
  assert.equal(instrumentRefKey(hkDot), 'HK:00700')

  const hkShort = parseCanonicalInstrumentInput('HK:700')
  assert.equal(hkShort?.symbol, '00700')

  const cnPad = parseCanonicalInstrumentInput('CN:SZ.000700')
  assert.ok(cnPad)
  assert.equal(cnPad.market, 'CN')
  assert.equal(cnPad.symbol, '000700')
  assert.notEqual(instrumentRefKey(hk), instrumentRefKey(cnPad))
})

test('6 位无歧义仍可解析 CN', () => {
  const cn = parseCanonicalInstrumentInput('600519')
  assert.equal(cn?.market, 'CN')
  assert.equal(cn?.symbol, '600519')
  assert.match(buildInstrumentNamespace(cn), /^CN:(SH|SZ|BJ)\.600519$/)
})

test('Tickflow list item → persist 字段：HK 五位 + assetClass + region', async () => {
  const { mapTickflowInstrumentToListItem } = await import(
    '../packages/a-stock-layer/dist/providers/tickflow/normalize/instruments.js'
  )
  const { resolveListRowPersistFields } = await import(
    '../packages/market-data/dist/sync/persist-universe.js'
  )

  const hkRow = mapTickflowInstrumentToListItem({
    symbol: '00700.HK',
    exchange: 'HK',
    code: '00700',
    region: 'HK',
    name: '腾讯控股',
    type: 'stock',
  })
  assert.equal(hkRow.region, 'HK')
  assert.equal(hkRow.assetClass, 'EQUITY')
  assert.equal(hkRow.code, '00700')

  const hkPersist = resolveListRowPersistFields('HK', hkRow, { exchange: 'HK' })
  assert.ok(hkPersist)
  assert.equal(hkPersist.code, '00700')
  assert.equal(hkPersist.market, 'HK')
  assert.equal(hkPersist.exchange, 'HK')
  assert.equal(hkPersist.assetClass, 'EQUITY')

  const etfRow = mapTickflowInstrumentToListItem({
    symbol: '510300.SH',
    exchange: 'SH',
    code: '510300',
    region: 'CN',
    name: '沪深300ETF',
    type: 'etf',
  })
  assert.equal(etfRow.region, 'CN')
  assert.equal(etfRow.assetClass, 'ETF')
  assert.equal(etfRow.market, 'SH')

  const etfPersist = resolveListRowPersistFields('CN', etfRow, { exchange: 'SH' })
  assert.ok(etfPersist)
  assert.equal(etfPersist.assetClass, 'ETF')
  assert.equal(etfPersist.exchange, 'SH')
  assert.equal(etfPersist.code, '510300')

  const usRow = mapTickflowInstrumentToListItem({
    symbol: 'AAPL.US',
    exchange: 'US',
    code: 'AAPL',
    region: 'US',
    name: 'Apple',
    type: 'stock',
  })
  const usPersist = resolveListRowPersistFields('US', usRow)
  assert.ok(usPersist)
  assert.equal(usPersist.code, 'AAPL')
  assert.equal(usPersist.market, 'US')
})

test('本地 hit 形态：namespace code + 完整 InstrumentRef', () => {
  const instrument = normalizeInstrumentRef({
    market: 'HK',
    assetClass: 'EQUITY',
    symbol: '00700',
    exchange: 'HK',
  })
  const code = instrumentDisplayCode(instrument)
  assert.equal(code, 'HK:00700')
  assert.equal(instrument.market, 'HK')
  assert.equal(instrument.symbol, '00700')
})

test('looksLikeInstrumentCode — 4–5 位与短码可精确补强', async () => {
  const { looksLikeInstrumentCode } = await import(
    '../packages/a-stock-layer/dist/search/instrument-search.js'
  )
  assert.equal(looksLikeInstrumentCode('00700'), true)
  assert.equal(looksLikeInstrumentCode('0700'), true)
  assert.equal(looksLikeInstrumentCode('700'), true)
  assert.equal(looksLikeInstrumentCode('600519'), true)
})
