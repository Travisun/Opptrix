/**
 * 方案 A：UI 解析收拢 shared + 关注列表迁移幂等（写 Opptrix ID）
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCanonicalInstrumentInput,
  tryParseInstrumentInput,
  isAmbiguousNumericCode,
  buildInstrumentNamespace,
} from '../packages/shared/dist/instrument-symbol.js'
import {
  migrateWatchlistItemInstrumentIdV1,
  migrateWatchlistItemsInstrumentIdV1,
  looksLikeFakeCnPadFromShortCode,
} from '../packages/a-stock-layer/dist/watchlist/migrate-instrument-id.js'
import { normalizeWatchlistItem } from '../packages/a-stock-layer/dist/watchlist/instrument.js'

test('shared tryParse ≡ parseCanonical：700 / 00700 / HK:00700 / 600519', () => {
  assert.equal(tryParseInstrumentInput, parseCanonicalInstrumentInput)

  assert.equal(tryParseInstrumentInput('700'), null)
  assert.equal(tryParseInstrumentInput('00700'), null)
  assert.equal(isAmbiguousNumericCode('700'), true)

  const hk = tryParseInstrumentInput('HK:00700')
  assert.equal(hk?.market, 'HK')
  assert.equal(hk?.symbol, '00700')
  assert.equal(buildInstrumentNamespace(hk), 'HK:00700')

  const cn = tryParseInstrumentInput('600519')
  assert.equal(cn?.market, 'CN')
  assert.equal(cn?.symbol, '600519')
})

test('关注列表迁移：合法项规范化；假 CN pad 短码清除；幂等', () => {
  const items = [
    {
      code: '600519',
      name: '贵州茅台',
      instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '600519', exchange: 'SH' },
    },
    {
      code: '700',
      name: '腾讯',
      industry: '港股',
      instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '000700', exchange: 'SZ' },
    },
    {
      code: '700',
      name: '未知短码',
      // 无 market 提示、假 CN
      instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '000700', exchange: 'SZ' },
    },
    {
      code: 'HK:00700',
      name: '腾讯控股',
    },
    {
      code: 'US:AAPL',
      name: 'Apple',
    },
  ]

  assert.equal(looksLikeFakeCnPadFromShortCode(items[1]), true)
  assert.equal(looksLikeFakeCnPadFromShortCode(items[2]), true)

  const once = migrateWatchlistItemsInstrumentIdV1(items).map(normalizeWatchlistItem)
  const twice = migrateWatchlistItemsInstrumentIdV1(once).map(normalizeWatchlistItem)

  assert.deepEqual(
    once.map(i => ({ code: i.code, market: i.instrument?.market, symbol: i.instrument?.symbol })),
    twice.map(i => ({ code: i.code, market: i.instrument?.market, symbol: i.instrument?.symbol })),
  )

  const maotai = once.find(i => i.name === '贵州茅台')
  assert.ok(maotai?.instrument)
  assert.equal(maotai.instrument.market, 'CN')
  assert.equal(maotai.code, 'CN:STOCK:600519.SH')

  const tencentHint = once.find(i => i.name === '腾讯')
  assert.equal(tencentHint?.instrument?.market, 'HK')
  assert.equal(tencentHint?.instrument?.symbol, '00700')
  assert.equal(tencentHint?.code, 'HK:STOCK:00700.HK')

  const unresolved = once.find(i => i.name === '未知短码')
  assert.equal(unresolved?.code, '700')
  assert.equal(unresolved?.instrument, undefined)

  const hkNs = once.find(i => i.name === '腾讯控股')
  assert.equal(hkNs?.instrument?.market, 'HK')
  assert.equal(hkNs?.code, 'HK:STOCK:00700.HK')

  const aapl = once.find(i => i.name === 'Apple')
  assert.equal(aapl?.instrument?.market, 'US')
  assert.equal(aapl?.instrument?.symbol, 'AAPL')
  assert.equal(aapl?.code, 'US:STOCK:AAPL.US')
})

test('单条迁移失败不丢数据（异常输入原样返回）', () => {
  const weird = { code: '700', name: 'x', instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '000700' } }
  const out = migrateWatchlistItemInstrumentIdV1(weird)
  assert.equal(out.name, 'x')
  // 假 CN 被清；code 保留短码
  assert.equal(out.code, '700')
  assert.equal(out.instrument, undefined)
})

test('normalizeWatchlistItem：歧义短码不发明假 CN；可解析项写 Opptrix', () => {
  const row = normalizeWatchlistItem({ code: '700', name: '短码' })
  assert.equal(row.code, '700')
  assert.equal(row.instrument, undefined)

  const hk = normalizeWatchlistItem({ code: 'HK:00700', name: '腾讯' })
  assert.equal(hk.instrument?.market, 'HK')
  assert.equal(hk.code, 'HK:STOCK:00700.HK')
})

test('未消歧项不得解析成任何可下单 market（无 PENDING/假 JP）', async () => {
  // client-ui 逻辑通过 a-stock-layer normalize + shared tryParse 对齐
  const unresolved = normalizeWatchlistItem({ code: '700', name: '短码' })
  assert.equal(unresolved.instrument, undefined)

  const { tryParseInstrumentInput } = await import('../packages/shared/dist/instrument-symbol.js')
  assert.equal(tryParseInstrumentInput('700'), null)
  assert.equal(tryParseInstrumentInput('00700'), null)

  // 迁移后无 industry 的假 CN 也不应留下可路由身份
  const cleared = migrateWatchlistItemInstrumentIdV1({
    code: '700',
    name: 'x',
    instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '000700', exchange: 'SZ' },
  })
  assert.equal(cleared.instrument, undefined)
  assert.notEqual(cleared.instrument?.exchange, 'PENDING')
  assert.notEqual(cleared.instrument?.market, 'JP')
})

test('旧版关注命名空间 → Opptrix：CN:ETF / A股 / 港美 + 幂等', async () => {
  const {
    migrateWatchlistLegacyNamespaceItems,
    isLegacyWatchlistNamespaceCode,
  } = await import('../packages/a-stock-layer/dist/watchlist/migrate-legacy-namespace.js')

  assert.equal(isLegacyWatchlistNamespaceCode('CN:ETF.510300'), true)
  assert.equal(isLegacyWatchlistNamespaceCode('CN:STOCK:600519.SH'), false)

  const items = [
    { code: 'CN:ETF.510300', name: '沪深300ETF' },
    { code: '600519', name: '贵州茅台' },
    { code: 'HK:00700', name: '腾讯控股' },
    { code: 'US:AAPL', name: 'Apple' },
    { code: 'CN:STOCK:600100.SH', name: '已迁移', instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '600100', exchange: 'SH' } },
  ]

  const once = migrateWatchlistLegacyNamespaceItems(items)
  assert.equal(once.changed, 4)
  const etf = once.items.find(i => i.name === '沪深300ETF')
  assert.equal(etf?.code, 'CN:ETF:510300.SH')
  assert.equal(etf?.instrument?.assetClass, 'ETF')

  const maotai = once.items.find(i => i.name === '贵州茅台')
  assert.equal(maotai?.code, 'CN:STOCK:600519.SH')

  const twice = migrateWatchlistLegacyNamespaceItems(once.items)
  assert.equal(twice.changed, 0)
  assert.deepEqual(
    once.items.map(i => i.code),
    twice.items.map(i => i.code),
  )
})
