import assert from 'node:assert/strict'
import test, { after } from 'node:test'
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
import {
  UNIFIED_INSTRUMENT_MINING_TOOLS,
  discoverMiningToolNamesForProfile,
} from '../packages/shared/dist/discover-mining-tools.js'
import {
  buildDiscoverMiningSystemPrompt,
  discoverProfileAssetLabel,
} from '../packages/shared/dist/discover-mining-prompt.js'
import { gateInstrumentEvaluation } from '../packages/shared/dist/evaluate-instrument.js'
import { gateInstrumentAnalytics, resolveInstrumentAnalyticsProfile } from '../packages/shared/dist/instrument-analytics.js'
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

after(async () => {
  const { resetMarketDataRuntime } = await import('../packages/market-data/dist/runtime.js')
  resetMarketDataRuntime()
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  getUserDataStore().close()
})

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
  assert.equal(discoverPrescreenMode('cn_equity'), 'blocked')
  assert.equal(getDiscoverProfileDefinition('cn_equity')?.miningReady, false)
  assert.equal(discoverPrescreenMode('jp_equity'), 'blocked')
  assert.equal(discoverPrescreenMode('hk_equity'), 'list_filter')
  assert.equal(getDiscoverProfileDefinition('hk_equity')?.localScreenFeature, 'local_hk_screen')

  const jpTools = discoverMiningToolNamesForProfile('jp_equity')
  assert.equal(jpTools.length, 0)
  assert.ok(!jpTools.includes('screen_local_jp_stocks'))

  const hkTools = discoverMiningToolNamesForProfile('hk_equity')
  assert.ok(hkTools.includes('search_instruments'))
  assert.ok(!hkTools.includes('screen_hk_universe'))
  assert.ok(!hkTools.includes('get_local_hk_screen_schema'))

  assert.deepEqual(discoverFactorsForProfile('hk_equity'), ['keyword', 'industry_contains'])
})

test('discover mining tools for cn_equity are empty after strategy removal', () => {
  const cnTools = discoverMiningToolNamesForProfile('cn_equity')
  assert.deepEqual(cnTools, [])
  assert.equal(getDiscoverProfileDefinition('cn_equity')?.miningToolGroup, 'none')
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

test('discover readiness uses online mode for StockIndex profiles', () => {
  const packs = buildDefaultMarketPackConfig()
  packs.us.enabled = true
  packs.hk.enabled = true
  const ctx = {
    packs,
    stock_count: 5000,
    etf_count: 800,
    us_count: 0,
    crypto_count: 200,
    jp_count: 0,
    kr_count: 0,
    hk_count: 0,
    cn_is_ready: true,
  }
  const cn = assessDiscoverProfileReadiness('cn_equity', ctx)
  assert.equal(cn.ready, false)
  assert.equal(cn.mode, 'blocked')
  assert.ok(cn.message.includes('A 股自动选股策略已移除'))

  const us = assessDiscoverProfileReadiness('us_equity', ctx)
  assert.equal(us.ready, true)
  assert.equal(us.mode, 'online')

  const jp = assessDiscoverProfileReadiness('jp_equity', ctx)
  assert.equal(jp.ready, false)
  assert.equal(jp.mode, 'blocked')

  const hk = assessDiscoverProfileReadiness('hk_equity', ctx)
  assert.equal(hk.ready, true)
  assert.equal(hk.mode, 'online')
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
    profile: 'hk_equity',
    finalTopN: 10,
    outputSchema: '{}',
  })
  assert.ok(prompt.includes('港股'))
  assert.ok(prompt.includes('search_instruments'))
  assert.ok(prompt.includes('get_instrument_snapshot'))
  assert.equal(discoverProfileAssetLabel('hk_equity'), '港股（StockIndex 在线列表 keyword / industry_contains）')
})

test('us_equity mining uses unified instrument tools not legacy US quote', () => {
  const usTools = discoverMiningToolNamesForProfile('us_equity')
  assert.ok(usTools.includes('get_instrument_snapshot'))
  assert.ok(!usTools.includes('get_us_stock_quote'))
  assert.ok(!usTools.includes('get_us_stock_snapshot'))
  for (const tool of UNIFIED_INSTRUMENT_MINING_TOOLS) {
    assert.ok(usTools.includes(tool), `expected us_equity mining to include ${tool}`)
  }
})

test('UNIFIED_INSTRUMENT_MINING_TOOLS shared across active non-CN discover groups', () => {
  for (const profile of ['us_equity', 'crypto_spot', 'hk_equity']) {
    const tools = discoverMiningToolNamesForProfile(profile)
    for (const tool of UNIFIED_INSTRUMENT_MINING_TOOLS) {
      assert.ok(tools.includes(tool), `${profile} should include ${tool}`)
    }
  }
  assert.equal(discoverMiningToolNamesForProfile('jp_equity').length, 0)
  assert.equal(discoverMiningToolNamesForProfile('kr_equity').length, 0)
})

test('cn_equity mining tool group is disabled', () => {
  const cnTools = discoverMiningToolNamesForProfile('cn_equity')
  assert.equal(cnTools.length, 0)
  assert.ok(!cnTools.includes('batch_instrument_snapshots'))
  assert.ok(!cnTools.includes('evaluate_instrument'))
})

test('CHAT_MCP_TOOL_NAMES exposes all registered tools', async () => {
  const { CHAT_MCP_TOOL_NAMES } = await import('../packages/agent/dist/unified-mcp-tools.js')
  const { ToolRegistry } = await import('../packages/agent/dist/tools.js')
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const hub = new ResearchHub()
  const registry = new ToolRegistry(hub)
  const chatTools = new Set(CHAT_MCP_TOOL_NAMES(registry))
  assert.ok(chatTools.has('get_instrument_snapshot'))
  assert.ok(chatTools.has('get_market_regime'))
  assert.ok(chatTools.has('search_instruments'))
  assert.ok(!chatTools.has('get_watchlist_radar'))
  assert.ok(!chatTools.has('search_etfs'))
  assert.ok(!chatTools.has('get_etf_scorecard'))
  assert.ok(!chatTools.has('evaluate_stock'))
  assert.ok(!chatTools.has('search_stocks'))
})

test('discoverMiningToolNames in agent aligns with shared registry', async () => {
  const { discoverMiningToolNames } = await import('../packages/agent/dist/tool-meta.js')
  assert.deepEqual(discoverMiningToolNames('jp_equity'), discoverMiningToolNamesForProfile('jp_equity'))
  assert.deepEqual(discoverMiningToolNames('us_equity'), discoverMiningToolNamesForProfile('us_equity'))
})

test('gateInstrumentEvaluation — CN equity supported, US technical bundle', () => {
  assert.equal(gateInstrumentEvaluation({ market: 'CN', assetClass: 'EQUITY', symbol: '600519' }).status, 'supported')
  assert.equal(gateInstrumentEvaluation({ market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' }).status, 'supported')
  assert.equal(hasApplicationCapability({ market: 'HK', assetClass: 'EQUITY', symbol: '00700' }, 'discover_mine'), true)
})

test('gateInstrumentAnalytics — US strategy_signal supported', () => {
  assert.equal(
    gateInstrumentAnalytics({ market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' }, 'strategy_signal').status,
    'supported',
  )
  assert.equal(
    gateInstrumentAnalytics({ market: 'JP', assetClass: 'EQUITY', symbol: '7203' }, 'technical_indicators').status,
    'supported',
  )
})

test('gateInstrumentAnalytics — CN evaluation still cn_factor_scorecard', () => {
  const ref = { market: 'CN', assetClass: 'EQUITY', symbol: '600519' }
  assert.equal(gateInstrumentAnalytics(ref, 'evaluation').status, 'supported')
  assert.equal(resolveInstrumentAnalyticsProfile(ref).mode, 'cn_factor_scorecard')
})

test('stock-index search maps CN/US instruments', { timeout: 30_000 }, async () => {
  const { searchInstrumentsOnline } = await import('../packages/a-stock-layer/dist/search/instrument-search.js')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { registerAllDrivers } = await import('../packages/a-stock-layer/dist/providers/register.js')
  const de = new MarketDataEngine(false)
  registerAllDrivers(de.registry)
  const cn = await searchInstrumentsOnline(de, '600519', 5, ['CN'])
  assert.ok(cn.some(h => h.instrument.symbol === '600519'))
  const us = await searchInstrumentsOnline(de, 'AAPL', 5, ['US'])
  assert.ok(us.some(h => h.instrument.symbol === 'AAPL'))
})

test('cross-market list sync jobs are no-op', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { MarketDataEngine } = await import('../packages/a-stock-layer/dist/engine.js')
  const { MarketDataStore } = await import('../packages/market-data/dist/store.js')
  const { MarketDataSyncEngine } = await import('../packages/market-data/dist/sync/engine.js')

  const dir = mkdtempSync(join(tmpdir(), 'opptrix-regional-'))
  const dbPath = join(dir, 'market.db')
  process.env.OPPTRIX_MARKET_DB_PATH = dbPath

  const store = new MarketDataStore(dbPath)
  const mdEngine = new MarketDataEngine(false)
  try {
    const engine = new MarketDataSyncEngine(store, mdEngine)
    const result = await engine.sync({ jobs: ['jp_list'], mode: 'full' })
    assert.equal(result.jobs.jp_list, 'skipped')
    assert.equal(store.countRegionalEquityInstruments('JP'), 0)
  } finally {
    store.close()
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
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

test('normalizeRegionalSymbol and regionalTodayString', async () => {
  const { normalizeRegionalSymbol } = await import('../packages/a-stock-layer/dist/utils/regional-symbol.js')
  const { regionalTodayString, isRegionalTradingWeekday, isRegionalTradingDay, isRegionalHoliday } = await import('../packages/a-stock-layer/dist/utils/regional-calendar.js')
  assert.equal(normalizeRegionalSymbol('KR', '5930'), '005930')
  assert.equal(normalizeRegionalSymbol('HK', '700'), '00700')
  assert.match(regionalTodayString('JP'), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(typeof isRegionalTradingWeekday('HK'), 'boolean')
  assert.equal(isRegionalHoliday('JP', '2026-01-01'), true)
  assert.equal(isRegionalTradingDay('JP', new Date('2026-01-01T03:00:00Z')), false)
})

test('stock-index client maps instrument ids', async () => {
  const { stockIndexItemToInstrumentRef } = await import('../packages/a-stock-layer/dist/providers/stockindex/normalize.js')
  const { buildInstrumentNamespace } = await import('../packages/shared/dist/instrument-symbol.js')
  const ref = stockIndexItemToInstrumentRef({
    instrumentId: 'CN:SH.600519',
    code: '600519',
    nameCn: '贵州茅台',
    market: 'CN',
    exchange: 'SH',
  })
  assert.equal(ref?.market, 'CN')
  assert.equal(ref?.symbol, '600519')
  assert.equal(buildInstrumentNamespace(ref), 'CN:SH.600519')
})

test('parseYahooSearchQuotes extracts symbols', async () => {
  const { parseYahooSearchQuotes } = await import('../packages/a-stock-layer/dist/utils/yahoo-search.js')
  const rows = parseYahooSearchQuotes({
    quotes: [{ symbol: '0700.HK', longname: 'Tencent', quoteType: 'EQUITY' }],
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].symbol, '0700.HK')
})

test('inferNewsSourceHints maps group titles to markets', async () => {
  const { inferNewsSourceHints, scoreNewsItemForInstrument } = await import('../packages/shared/dist/news-source-hints.js')
  const cn = inferNewsSourceHints('A股要闻')
  assert.ok(cn.market_hints.includes('CN'))
  assert.ok(cn.relevance > 0)
  const us = inferNewsSourceHints('美股科技 RSS')
  assert.ok(us.market_hints.includes('US'))
  const score = scoreNewsItemForInstrument(
    { market: 'JP', assetClass: 'EQUITY', symbol: '7203' },
    { title: '日股晨报', sort_order: 0 },
  )
  assert.ok(score > 0.5)
})

test('agent system rules include analysis and news playbooks', async () => {
  const { buildAgentSystemRules, instrumentAnalysisStepsForRef } = await import('../packages/shared/dist/agent-prompt-guide.js')
  const rules = buildAgentSystemRules()
  assert.ok(rules.includes('【标的分析路径'))
  assert.ok(rules.includes('【资讯调阅'))
  assert.ok(rules.includes('【标准 Instrument API'))
  assert.ok(rules.includes('【数据源扩展'))
  assert.ok(rules.includes('仅使用当前会话已加载的 MCP 工具'))
  assert.doesNotMatch(rules, /screen_stocks/)
  assert.doesNotMatch(rules, /get_local_/)
  assert.doesNotMatch(rules, /market_db_/)
  assert.doesNotMatch(rules, /【已停用/)
  assert.ok(rules.includes('market_hints'))
  assert.ok(rules.includes('JP/KR'))
  const cnSteps = instrumentAnalysisStepsForRef({ market: 'CN', assetClass: 'EQUITY', symbol: '600519' })
  assert.ok(cnSteps.includes('evaluate_instrument'))
  const usSteps = instrumentAnalysisStepsForRef({ market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' })
  assert.ok(usSteps.includes('get_instrument_indicators'))
  const jpSteps = instrumentAnalysisStepsForRef({ market: 'JP', assetClass: 'EQUITY', symbol: '7203' })
  assert.ok(jpSteps.includes('暂未接入'))
})

test('discover blocked profile prompt includes news retrieval playbook', () => {
  const prompt = buildDiscoverMiningSystemPrompt({
    profile: 'cn_equity',
    finalTopN: 10,
    outputSchema: '{}',
  })
  assert.ok(prompt.includes('【资讯调阅'))
  assert.ok(prompt.includes('list_news_groups'))
  assert.ok(prompt.includes('暂未接入') || prompt.includes('暂不支持'))
})
