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
import {
  buildDiscoverMiningSystemPrompt,
  discoverProfileAssetLabel,
} from '../packages/shared/dist/discover-mining-prompt.js'
import { gateInstrumentEvaluation } from '../packages/shared/dist/evaluate-instrument.js'
import { hasApplicationCapability } from '../packages/shared/dist/instrument-capabilities.js'
import { isLikelyCnEquityInput } from '../packages/shared/dist/instrument-ref.js'
import {
  momentumRegimeInputsFromKlines,
  computeMarketRegime,
} from '../packages/shared/dist/market-regime.js'
import {
  resolveRegimeStrategyIds,
  US_REGIME_STRATEGY_IDS,
} from '../packages/shared/dist/discover-profiles.js'
import { getPackDefinition } from '../packages/shared/dist/pack-registry.js'

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

test('discover mining system prompt is registry-driven', () => {
  const prompt = buildDiscoverMiningSystemPrompt({
    profile: 'jp_equity',
    finalTopN: 10,
    outputSchema: '{}',
  })
  assert.ok(prompt.includes('日本股市'))
  assert.ok(prompt.includes('screen_local_jp_stocks'))
  assert.ok(prompt.includes('search_local_instruments'))
  assert.equal(discoverProfileAssetLabel('hk_equity'), '港股（本地列表 keyword / industry_contains）')
})

test('gateInstrumentEvaluation — CN equity supported, US not', () => {
  assert.equal(gateInstrumentEvaluation({ market: 'CN', assetClass: 'EQUITY', symbol: '600519' }).status, 'supported')
  assert.equal(gateInstrumentEvaluation({ market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' }).status, 'not_supported')
  assert.equal(hasApplicationCapability({ market: 'HK', assetClass: 'EQUITY', symbol: '00700' }, 'discover_mine'), true)
})

test('regional list seeds sync writes instruments', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { MarketDataStore } = await import('../packages/market-data/dist/store.js')
  const { MarketDataSyncEngine } = await import('../packages/market-data/dist/sync/engine.js')
  const { getRegionalListSeeds } = await import('../packages/market-data/dist/sync/regional-list-seeds.js')

  const dir = mkdtempSync(join(tmpdir(), 'opptrix-regional-'))
  const dbPath = join(dir, 'market.db')
  process.env.OPPTRIX_MARKET_DB_PATH = dbPath

  const store = new MarketDataStore(dbPath)
  const engine = new MarketDataSyncEngine(store, new MarketDataEngine())
  await engine.sync({ jobs: ['jp_list'], mode: 'full' })

  assert.equal(store.countRegionalEquityInstruments('JP'), getRegionalListSeeds('JP').length)
  const toyota = store.db.prepare(`
    SELECT name FROM instruments WHERE market = 'JP' AND code = ?
  `).get('7203')
  assert.equal(toyota?.name, '丰田汽车')
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

test('US regime stub resolves strategy ids from SPY-like klines', () => {
  const klines = Array.from({ length: 130 }, (_, i) => ({
    close: 400 + i * 0.5,
    amount: 1e9,
  }))
  const inputs = momentumRegimeInputsFromKlines(klines)
  const snapshot = computeMarketRegime(inputs)
  const ids = resolveRegimeStrategyIds('us_equity', snapshot.regime, snapshot.suggested_strategy_ids)
  assert.ok(ids.length > 0)
  assert.ok(ids.every(id => US_REGIME_STRATEGY_IDS[snapshot.regime].includes(id)))
})

test('regional pack sync jobs include list and quotes', () => {
  assert.deepEqual(getPackDefinition('jp')?.syncJobs, ['jp_list', 'jp_quotes'])
  assert.deepEqual(getPackDefinition('hk')?.syncJobs, ['hk_list', 'hk_quotes'])
  assert.deepEqual(getPackDefinition('kr')?.syncJobs, ['kr_list', 'kr_quotes'])
})

test('toYahooFinanceSymbol maps regional codes', async () => {
  const { toYahooFinanceSymbol } = await import('../packages/a-stock-layer/dist/utils/regional-symbol.js')
  assert.equal(toYahooFinanceSymbol('JP', '7203'), '7203.T')
  assert.equal(toYahooFinanceSymbol('KR', '5930'), '005930.KS')
  assert.equal(toYahooFinanceSymbol('HK', '00700'), '0700.HK')
})
