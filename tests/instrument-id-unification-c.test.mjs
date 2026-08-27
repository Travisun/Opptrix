/**
 * 方案 B 遗留完备：HK 全表补零 + 关注未消歧唯一写回
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planHkCanonicalPad,
  needsHkCanonicalPad,
  nameCompleteness,
} from '../packages/market-data/dist/repair-hk-canonical-pad.js'
import {
  disambiguateWatchlistItemsLocal,
  disambiguateWatchlistItemFromHits,
  disambiguateWatchlistItemOutcome,
  pickUniqueInstrumentRef,
  watchlistItemNeedsDisambiguation,
  filterExactDigitHits,
  applyResolvedInstrument,
} from '../packages/a-stock-layer/dist/watchlist/disambiguate-instrument.js'
import { normalizeWatchlistItem } from '../packages/a-stock-layer/dist/watchlist/instrument.js'
import { canonicalHkSymbol } from '../packages/shared/dist/instrument-symbol.js'

test('needsHkCanonicalPad：700 需补；00700 不动；非数字不动', () => {
  assert.equal(needsHkCanonicalPad('700'), true)
  assert.equal(needsHkCanonicalPad('0700'), true)
  assert.equal(needsHkCanonicalPad('00700'), false)
  assert.equal(needsHkCanonicalPad('AAPL'), false)
  assert.equal(canonicalHkSymbol('700'), '00700')
})

test('planHkCanonicalPad：短码 rename；已五位跳过；冲突保留更完整名称', () => {
  const rows = [
    {
      market: 'HK',
      exchange: 'HK',
      code: '700',
      asset_class: 'EQUITY',
      name: '腾讯',
      instrument_ns: 'HK:700',
      list_date: null,
      delist_date: null,
      status: 'active',
      extra: null,
    },
    {
      market: 'HK',
      exchange: 'HK',
      code: '00700',
      asset_class: 'EQUITY',
      name: '腾讯控股',
      instrument_ns: 'HK:00700',
      list_date: null,
      delist_date: null,
      status: 'active',
      extra: null,
    },
    {
      market: 'HK',
      exchange: 'HK',
      code: '9988',
      asset_class: 'EQUITY',
      name: null,
      instrument_ns: null,
      list_date: null,
      delist_date: null,
      status: 'active',
      extra: null,
    },
  ]

  const plans = planHkCanonicalPad(rows)
  assert.ok(plans.some(p => p.kind === 'merge_drop_source'))
  const merge = plans.find(p => p.kind === 'merge_drop_source')
  assert.equal(merge?.kind, 'merge_drop_source')
  if (merge?.kind === 'merge_drop_source') {
    assert.equal(merge.source.code, '700')
    assert.equal(merge.target.code, '00700')
    assert.ok(nameCompleteness(merge.keepName) >= nameCompleteness('腾讯控股'))
  }

  const renameOnly = planHkCanonicalPad([rows[2]])
  assert.equal(renameOnly.length, 1)
  assert.equal(renameOnly[0].kind, 'rename')
  if (renameOnly[0].kind === 'rename') {
    assert.equal(renameOnly[0].toCode, '09988')
  }

  // 幂等：已五位无计划
  const twice = planHkCanonicalPad([rows[1]])
  assert.equal(twice.length, 0)
})

test('关注消歧：唯一 HK 本地命中可写回；多命中不写；跑两次幂等', () => {
  const unresolved = normalizeWatchlistItem({ code: '700', name: '未知短码' })
  assert.equal(watchlistItemNeedsDisambiguation(unresolved), true)
  assert.equal(unresolved.instrument, undefined)

  const hkHit = {
    instrument: { market: 'HK', assetClass: 'EQUITY', symbol: '00700', exchange: 'HK' },
    name: '腾讯控股',
  }
  const cnHit = {
    instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '000700', exchange: 'SZ' },
    name: '模塑科技',
  }

  const unique = disambiguateWatchlistItemFromHits(unresolved, [hkHit])
  assert.equal(unique.instrument?.market, 'HK')
  assert.equal(unique.instrument?.symbol, '00700')
  assert.equal(unique.code, 'HK:STOCK:00700.HK')

  const ambiguous = disambiguateWatchlistItemFromHits(unresolved, [hkHit, cnHit])
  assert.equal(ambiguous.instrument, undefined)
  assert.equal(ambiguous.code, '700')

  const outcome = disambiguateWatchlistItemOutcome(unresolved, [hkHit, cnHit])
  assert.equal(outcome.status, 'ambiguous')
  assert.ok(outcome.status === 'ambiguous' && outcome.candidates.length >= 2)
  if (outcome.status === 'ambiguous') {
    assert.ok(outcome.candidates.every(c => c.code && c.instrument.market && c.instrument.symbol))
    const pick = outcome.candidates.find(c => c.instrument.market === 'HK')
    assert.ok(pick)
    const applied = applyResolvedInstrument(unresolved, pick.instrument, pick.name)
    assert.equal(applied.instrument?.market, 'HK')
    assert.equal(applied.instrument?.symbol, '00700')
    assert.equal(watchlistItemNeedsDisambiguation(applied), false)
  }

  const lookupUnique = () => [hkHit]
  const once = disambiguateWatchlistItemsLocal([unresolved], lookupUnique)
  const twice = disambiguateWatchlistItemsLocal(once.items, lookupUnique)
  assert.equal(once.resolved, 1)
  assert.equal(twice.resolved, 0)
  assert.deepEqual(
    once.items.map(i => ({ code: i.code, market: i.instrument?.market, symbol: i.instrument?.symbol })),
    twice.items.map(i => ({ code: i.code, market: i.instrument?.market, symbol: i.instrument?.symbol })),
  )

  const multiLookup = () => [hkHit, cnHit]
  const noWrite = disambiguateWatchlistItemsLocal([unresolved], multiLookup)
  assert.equal(noWrite.resolved, 0)
  assert.equal(noWrite.items[0].instrument, undefined)
  assert.ok((noWrite.candidatesByCode['700'] ?? []).length >= 2)
})

test('filterExactDigitHits / pickUnique：同数字不同市场视为多命中', () => {
  const hits = filterExactDigitHits(
    [
      { instrument: { market: 'HK', assetClass: 'EQUITY', symbol: '00700' } },
      { instrument: { market: 'CN', assetClass: 'EQUITY', symbol: '000700' } },
    ],
    '700',
  )
  assert.equal(hits.length, 2)
  assert.equal(pickUniqueInstrumentRef(hits), null)
  assert.ok(pickUniqueInstrumentRef([hits[0]]))
})
