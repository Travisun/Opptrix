import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DISCOVER_PROFILE_REGISTRY,
  getDiscoverProfileDefinition,
} from '../packages/shared/dist/discover-profile-registry.js'
import {
  assessDiscoverProfileReadiness,
  discoverPrescreenMode,
  listDiscoverProfileMeta,
} from '../packages/shared/dist/discover-profiles.js'
import {
  buildDefaultMarketPackConfig,
  normalizeMarketDataPackConfig,
  allPackIds,
} from '../packages/shared/dist/pack-registry.js'
import { discoverMiningToolNamesForProfile } from '../packages/shared/dist/discover-mining-tools.js'

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
  assert.equal(getDiscoverProfileDefinition('kr_equity')?.localScreenFeature, 'local_kr_screen')

  const jpTools = discoverMiningToolNamesForProfile('jp_equity')
  assert.ok(jpTools.includes('screen_local_jp_stocks'))
  assert.ok(jpTools.includes('get_local_jp_screen_schema'))
})

test('discover readiness uses regional counts from context', () => {
  const packs = buildDefaultMarketPackConfig()
  packs.jp.enabled = true
  const ctx = {
    packs,
    stock_count: 5000,
    etf_count: 800,
    us_count: 3000,
    crypto_count: 200,
    jp_count: 120,
    kr_count: 0,
    hk_count: 0,
    cn_is_ready: true,
  }
  const jp = assessDiscoverProfileReadiness('jp_equity', ctx)
  assert.equal(jp.ready, true)
  assert.equal(jp.mode, 'local')

  const kr = assessDiscoverProfileReadiness('kr_equity', ctx)
  assert.equal(kr.ready, false)
})

test('listDiscoverProfileMeta exposes jp/kr profiles', () => {
  const ids = listDiscoverProfileMeta().map(row => row.id)
  assert.ok(ids.includes('jp_equity'))
  assert.ok(ids.includes('kr_equity'))
  assert.equal(DISCOVER_PROFILE_REGISTRY.length, 6)
})
