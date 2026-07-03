import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DISCOVER_PROFILE_REGISTRY,
  getDiscoverProfileDefinition,
} from '../packages/shared/dist/discover-profile-registry.js'
import {
  assessDiscoverProfileReadiness,
  discoverPrescreenMode,
  discoverFactorsForProfile,
  listDiscoverProfileMeta,
} from '../packages/shared/dist/discover-profiles.js'
import {
  buildDefaultMarketPackConfig,
  normalizeMarketDataPackConfig,
  allPackIds,
} from '../packages/shared/dist/pack-registry.js'
import { discoverMiningToolNamesForProfile } from '../packages/shared/dist/discover-mining-tools.js'
import { isLikelyCnEquityInput } from '../packages/shared/dist/instrument-ref.js'

test('pack registry includes six markets with backward-compatible normalize', () => {
  assert.deepEqual(allPackIds(), ['cn', 'us', 'crypto', 'hk', 'jp', 'kr'])
  const defaults = buildDefaultMarketPackConfig()
  assert.equal(defaults.cn.enabled, true)
  assert.equal(defaults.jp.enabled, false)

  const legacy = normalizeMarketDataPackConfig({ us: { enabled: true, prepared_at: '2026-01-01' } })
  assert.equal(legacy.us.enabled, true)
  assert.equal(legacy.jp.enabled, false)
  assert.equal(legacy.kr.prepared_at, null)
})

test('discover profile registry drives prescreen mode and mining tools', () => {
  assert.equal(discoverPrescreenMode('cn_equity'), 'factor_screen')
  assert.equal(discoverPrescreenMode('jp_equity'), 'list_filter')
  assert.equal(discoverPrescreenMode('hk_equity'), 'list_filter')
  assert.equal(getDiscoverProfileDefinition('kr_equity')?.localScreenFeature, 'local_kr_screen')
  assert.equal(getDiscoverProfileDefinition('hk_equity')?.localScreenFeature, 'local_hk_screen')

  const jpTools = discoverMiningToolNamesForProfile('jp_equity')
  assert.ok(jpTools.includes('screen_local_jp_stocks'))
  assert.ok(jpTools.includes('get_local_jp_screen_schema'))
  assert.ok(jpTools.includes('search_local_instruments'))
  assert.ok(!jpTools.includes('batch_stock_snapshots'))

  const hkTools = discoverMiningToolNamesForProfile('hk_equity')
  assert.ok(hkTools.includes('screen_local_hk_stocks'))
  assert.ok(hkTools.includes('get_local_hk_screen_schema'))

  assert.deepEqual(discoverFactorsForProfile('hk_equity'), ['keyword', 'industry_contains'])
})

test('discover mining tools empty for unknown profile — no CN fallback', () => {
  assert.deepEqual(discoverMiningToolNamesForProfile('cn_equity').slice(0, 2), [
    'get_market_db_status',
    'get_market_db_sync_state',
  ])
})

test('isLikelyCnEquityInput gates CN-only hub APIs', () => {
  assert.equal(isLikelyCnEquityInput('600519'), true)
  assert.equal(isLikelyCnEquityInput('510300'), true)
  assert.equal(isLikelyCnEquityInput('AAPL'), false)
  assert.equal(isLikelyCnEquityInput('US:AAPL'), false)
  assert.equal(isLikelyCnEquityInput('HK:0700'), false)
  assert.equal(isLikelyCnEquityInput('JP:7203'), false)
  assert.equal(isLikelyCnEquityInput('BTC/USDT'), false)
})

test('discover readiness uses regional counts from context', () => {
  const packs = buildDefaultMarketPackConfig()
  packs.jp.enabled = true
  packs.hk.enabled = true
  const ctx = {
    packs,
    stock_count: 5000,
    etf_count: 800,
    us_count: 3000,
    crypto_count: 200,
    jp_count: 120,
    kr_count: 0,
    hk_count: 45,
    cn_is_ready: true,
  }
  const jp = assessDiscoverProfileReadiness('jp_equity', ctx)
  assert.equal(jp.ready, true)
  assert.equal(jp.mode, 'local')

  const kr = assessDiscoverProfileReadiness('kr_equity', ctx)
  assert.equal(kr.ready, false)

  const hk = assessDiscoverProfileReadiness('hk_equity', ctx)
  assert.equal(hk.ready, true)
  assert.equal(hk.mode, 'local')
})

test('listDiscoverProfileMeta exposes jp/kr/hk profiles', () => {
  const ids = listDiscoverProfileMeta().map(row => row.id)
  assert.ok(ids.includes('jp_equity'))
  assert.ok(ids.includes('kr_equity'))
  assert.ok(ids.includes('hk_equity'))
  assert.equal(DISCOVER_PROFILE_REGISTRY.length, 7)
})

test('supplement pack ids include hk jp kr', async () => {
  const { isSupplementPackId, SUPPLEMENT_PACK_IDS } = await import('../packages/shared/dist/pack-registry.js')
  assert.deepEqual(SUPPLEMENT_PACK_IDS, ['us', 'crypto', 'hk', 'jp', 'kr'])
  assert.equal(isSupplementPackId('jp'), true)
  assert.equal(isSupplementPackId('cn'), false)
})
