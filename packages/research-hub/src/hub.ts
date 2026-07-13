import { MarketDataEngine, computeIndicators, computeLatestChipProfile, computeChipDistribution, isMissingLivePrice, normalizeCode, normalizePreOpenRealtimeQuote,
  parseCryptoPair,
  pickIntradaySession, parseStockMarket, resolveMarket, resolveStockMarketCode,
  loadTushareConfig, saveTushareConfig, isBseCode, isCnEtfCode, inferCnAssetClass,
  formatProviderMethodArgs,
  wireRegistryMethodArgs,
  cnTodayString, shouldPreferTodayIntraday, type StockMarket,
  type NewsItem, type MoneyFlow, type Dividend,
  crossMarketChartTimeZone,
  hkFdaysToIntradayItems,
  intradaySessionDateFromKlines,
  isCrossMarketTradingDay,
  isHkFdaysPayload,
  minuteKlinesToIntradayItems,
} from '@opptrix/a-stock-layer'
import { resolveProvidersDir } from '@opptrix/shared'
import type { IntradayTrendFetchResult, IntradayTrendSession } from '@opptrix/a-stock-layer'
import type { StockListItem, FinancialSummary, StockKline } from '@opptrix/shared'
import { ConsolidatedEngine, formatInstitutionReport } from '@opptrix/institutions'
import { ClosingReport, IndustryMining, MorningBrief, mermaidIndustryChain } from '@opptrix/skills'
import {
  EvaluationEngine, createScorecard, Screener, PortfolioAnalyzer,
  REGISTRY, BacktestEngine, SnapshotStore, IndustryNeutralizer,
  computeGbmBreakdown,
} from '@opptrix/stock-eval'
import { getMarketDataService, CN_MANUAL_SYNC_JOBS } from '@opptrix/market-data-store'
import {
  ok, fail, computeMarketRegime, computeMaPositionPct, computePricePercentile,
  computeTurnoverVs20d, computeHv20Pct, momentumRegimeInputsFromKlines,
  type ResearchResult,
  assessAllDiscoverProfileReadiness,
  assessDiscoverProfileReadiness,
  isDiscoverStrategyProfile,
  resolveRegimeStrategyIds,
  ETF_REGIME_DETAIL,
  US_REGIME_DETAIL,
  type MarketRegimeScope,
  listScorecardsForProfile,
  resolveScorecardName,
  scorecardProfileFromDiscover,
  type DiscoverProfileReadinessContext,
  type DiscoverStrategyProfile,
  isLikelyCnEquityInput,
  gateInstrumentAnalytics,
  resolveInstrumentFromParams,
  resolveCnInstrumentRef,
  normalizeInstrumentHubParams,
  instrumentRefsFromList,
  normalizeInstrumentRef,
  instrumentRefKey,
  buildInstrumentNamespace,
  type InstrumentRef,
  type InstrumentHubCapability,
} from '@opptrix/shared'
import {
  quickAssess,
  verifyStrategy,
  buildTrendBrief,
  gatherStrategyData,
  buildTechnicalEvaluation,
  buildInstrumentIndicators,
  verifyStrategyForRef,
} from '@opptrix/t-strategy'
import { serializeInstitutionData } from './serialize.js'
import { formatVerificationReport, generateStrategyReport } from '@opptrix/t-strategy'
import {
  newsArticleDetail,
  newsArticlesList,
  newsCenterStatus,
  newsGroupsList,
  newsSourcesList,
} from './news-hub.js'
import { noticeContent } from './notice-content-hub.js'
import {
  routeInstrumentCapabilities,
  routeInstrumentChart,
  routeInstrumentCyq,
  routeInstrumentInstitutionRating,
  routeInstrumentInstitutionReport,
  routeInstrumentQuotes,
  routeInstrumentSearch,
  routeInstrumentSnapshot,
  type InstrumentRouteHandlers,
} from './instrument-router.js'
import {
  routeInstrumentEvaluation,
  routeInstrumentIndicators,
  routeInstrumentStrategySignal,
  routeInstrumentStrategyVerify,
  type InstrumentAnalyticsRouteHandlers,
} from './instrument-analytics-router.js'
import {
  routeInstrumentBatchSnapshots,
  type InstrumentBatchRouteHandlers,
} from './instrument-batch-router.js'
import {
  dedupeStockNewsItems,
  enrichCnStockProfile,
  enrichDetailProfileFromQuote,
  enrichShareholderView,
  holderHistoryFromRows,
  mergeDetailQuoteRows,
  mergeStockProfileRows,
  normalizeShareholderPayload,
} from './stock-detail-normalize.js'
import {
  buildCrossMarketDetailPayload,
  mergeCrossMarketQuote,
  normalizeCrossMarketArticles,
  normalizeCrossMarketNotices,
  normalizeCrossMarketRelatedStocks,
  normalizeHkDividends,
  normalizeHkFinancialHistory,
  normalizeHkTencentProfile,
  normalizeHkTradingDistribution,
  normalizeUsFinancialHistory,
  normalizeUsSeniorTrades,
  normalizeUsShareholders,
  normalizeUsTencentProfile,
} from './cross-market-detail.js'
import { searchInstrumentsUnified } from './instrument-search-unified.js'
import type { LocalInstrumentInsights } from '@opptrix/shared'

function cryptoRefFromPair(pair: string): import('@opptrix/shared').InstrumentRef {
  const p = parseCryptoPair(pair)
  if (p) {
    return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: p.base, quote: p.quote }
  }
  return { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: pair, quote: 'USDT' }
}

function instrumentQueryError(r: { success: boolean }, fallback: string): string {
  if ('error' in r && r.error) return String(r.error)
  return fallback
}

function instrumentQueryData<T>(r: { success: boolean }): T | undefined {
  if (!r.success || !('data' in r)) return undefined
  return r.data as T
}

interface WatchlistRadarItem {
  code: string
  name: string
  total_score: number | null
  scorecard: string | null
  from_store: boolean
  pe: number | null
  pb: number | null
  pe_percentile: number | null
  pb_percentile: number | null
  main_net: number | null
  flow_date: string | null
}

/** Unified research hub — single entry for feature dispatch */
export class ResearchHub {
  readonly de = new MarketDataEngine()
  readonly ee = new EvaluationEngine(this.de)
  readonly store = new SnapshotStore()
  readonly neutralizer = new IndustryNeutralizer(this.de)
  readonly institutions = new ConsolidatedEngine(this.de)
  readonly screener = new Screener(this.ee, this.de)
  readonly portfolio = new PortfolioAnalyzer(this.ee, this.de)
  readonly backtest = new BacktestEngine(this.ee, this.de)
  readonly closingReport = new ClosingReport(this.de)
  readonly morningBrief = new MorningBrief(this.de)
  readonly industrySkill = new IndustryMining(this.de)
  get marketData() {
    return getMarketDataService()
  }
  private readonly stockNameCache = new Map<string, string>()

  initMarketDataAutoSync(): void {
    this.notifyMarketDataUiReady()
  }

  /** UI shell ready — start L0 automatic sync (single entry, no hardcoded job list). */
  notifyMarketDataUiReady(): void {
    this.marketData.notifyUiReady()
  }

  /** Fallback when desktop UI never signals ready within timeout. */
  ensureMarketDataUiReadyFallback(): void {
    this.marketData.ensureBootSyncFallback()
  }

  /** @deprecated Use notifyMarketDataUiReady */
  initMarketDataAutoResume(): void {
    this.notifyMarketDataUiReady()
  }

  async dispatch(feature: string, params: Record<string, unknown>): Promise<ResearchResult> {
    const t0 = Date.now()
    try {
      switch (feature) {
        case 'stock_diagnosis': {
          const ref = this.resolveInstrumentRefFromParams(params)
          if (ref) return this.dispatchInstrumentCapability('evaluation', params, t0)
          return this.stockDiagnosis(String(params.code), String(params.scorecard ?? '综合评估'), t0)
        }
        case 'institution_rating':
          return this.dispatchInstrumentCapability('institution_rating', normalizeInstrumentHubParams(params), t0)
        case 'institution_report':
          return this.dispatchInstrumentCapability('institution_report', normalizeInstrumentHubParams(params), t0)
        case 'screening': return this.screening(params, t0)
        case 'strategy_signal': return this.instrumentStrategySignal(params, t0)
        case 'instrument_evaluation': return this.instrumentEvaluation(params, t0)
        case 'instrument_strategy_signal': return this.instrumentStrategySignal(params, t0)
        case 'instrument_indicators': return this.instrumentIndicators(params, t0)
        case 'instrument_strategy_verify': return this.instrumentStrategyVerify(params, t0)
        case 'trend_brief': {
          const ref = resolveInstrumentFromParams(params)
          if (ref && ref.market !== 'CN') {
            return fail('趋势研判暂仅支持 A 股', t0)
          }
          const cnRef = ref ?? (params.code ? resolveCnInstrumentRef(String(params.code)) : null)
          if (!cnRef) return fail('code 或 instrument 必填', t0)
          return this.trendBrief(cnRef, params, t0)
        }
        case 'strategy_verify': {
          const ref = resolveInstrumentFromParams(params)
          if (ref) return this.dispatchInstrumentCapability('strategy_verify', { ...params, instrument: ref }, t0)
          return this.strategyVerify(params, t0)
        }
        case 'strategy_verify_report': return this.strategyVerifyReport(params, t0)
        case 'portfolio_analysis': return this.portfolioAnalysis(params, t0)
        case 'industry_mining': return this.industryMining(String(params.industry), t0)
        case 'industry_mermaid': return this.industryMermaid(String(params.industry), t0)
        case 'market_report': return this.marketReport(String(params.type ?? 'closing'), t0)
        case 'market_dynamics': return this.marketDynamics(t0)
        case 'search_stocks':
          return this.dispatchInstrumentCapability('search', { keyword: params.keyword, ...params }, t0)
        case 'stock_quotes': {
          const refs = instrumentRefsFromList(params.codes)
          const list = refs.length
            ? refs
            : (params.codes as string[] | undefined)?.map(code =>
              resolveInstrumentFromParams({ code, market: 'CN' }),
            ).filter((r): r is InstrumentRef => r != null) ?? []
          return this.instrumentQuotes({ instruments: list.length ? list : params.codes, ...params }, t0)
        }
        case 'watchlist_radar': return this.watchlistRadar(params.codes as string[] | undefined, t0)
        case 'watchlist_list': return this.watchlistList(t0)
        case 'watchlist_save': return this.watchlistSave(params, t0)
        case 'market_db_status': return this.marketDbStatus(t0)
        case 'market_db_sync': return this.marketDbSync(params, t0)
        case 'market_db_sync_state': return this.marketDbSyncState(t0)
        case 'market_data_packs': return this.marketDataPacks(t0)
        case 'market_data_packs_save': return this.marketDataPacksSave(params, t0)
        case 'market_data_pack_prepare': return this.marketDataPackPrepare(params, t0)
        case 'discover_profile_readiness': return this.discoverProfileReadiness(params, t0)
        case 'discover_scorecards': return this.discoverScorecards(params, t0)
        case 'market_industry_stats': return this.marketIndustryStats(params, t0)
        case 'market_industry_stocks': return this.marketIndustryStocks(params, t0)
        case 'market_regime': return this.marketRegime(params, t0)
        case 'local_industry_list': return this.localIndustryList(params, t0)
        case 'local_industry_screen': return this.localIndustryScreen(params, t0)
        case 'list_screen_factors': return this.listScreenFactors(t0)
        case 'local_universe_screen_schema': return this.localUniverseScreenSchema(t0)
        case 'local_universe_screen': return this.localUniverseScreen(params, t0)
        case 'batch_stock_snapshots': return this.instrumentBatchSnapshots(params, t0)
        case 'instrument_batch_snapshots': return this.instrumentBatchSnapshots(params, t0)
        case 'instrument_cyq': return this.instrumentCyq(params, t0)
        case 'instrument_institution_rating': return this.instrumentInstitutionRating(params, t0)
        case 'instrument_institution_report': return this.instrumentInstitutionReport(params, t0)
        case 'stock_kline':
          return this.instrumentChart(normalizeInstrumentHubParams({ ...params, period: 'daily' }), t0)
        case 'stock_cyq':
          return this.instrumentCyq(normalizeInstrumentHubParams(params), t0)
        case 'stock_chart':
          return this.instrumentChart(normalizeInstrumentHubParams(params), t0)
        case 'stock_detail':
          return this.instrumentSnapshot(normalizeInstrumentHubParams(params), t0)
        case 'backtest': return this.runBacktest(params, t0)
        case 'latest_evaluation': {
          const ref = resolveInstrumentFromParams(params)
          const code = ref?.symbol ?? String(params.code ?? '')
          return this.latestEvaluation(code, ref ? { ...params, instrument: ref } : params, t0)
        }
        case 'portfolio_trades': return this.portfolioTrades(String(params.code ?? ''), params.market != null ? String(params.market) : undefined, t0)
        case 'portfolio_holdings': return this.portfolioHoldings(t0)
        case 'portfolio_summary': return this.portfolioSummary(t0)
        case 'news_center_status': return newsCenterStatus(t0)
        case 'news_groups_list': return newsGroupsList(t0)
        case 'news_sources_list': return newsSourcesList(t0)
        case 'news_articles_list': return newsArticlesList(params, t0)
        case 'news_article_detail': return await newsArticleDetail(params, t0)
        case 'notice_content':
        case 'instrument_notice_content':
          return await noticeContent(params, t0)
        case 'tushare_config': return ok(this.de.providerCatalog.tusharePublicLegacy(), 'Tushare 配置', t0)
        case 'tushare_config_save': return this.tushareConfigSave(params, t0)
        case 'tushare_test': return this.tushareTest(params, t0)
        case 'provider_list': return ok(this.de.listProviders(), '数据源列表', t0)
        case 'provider_config': return this.providerConfig(params, t0)
        case 'provider_config_save': return this.providerConfigSave(params, t0)
        case 'provider_test': return this.providerTest(params, t0)
        case 'provider_binding_overrides': return this.providerBindingOverrides(params, t0)
        case 'provider_binding_override_save': return this.providerBindingOverrideSave(params, t0)
        case 'provider_rescan': return await this.providerRescan(t0)
        case 'provider_uninstall': return await this.providerUninstall(params, t0)
        case 'provider_reload': return await this.providerReload(params, t0)
        case 'provider_installed_list': return this.providerInstalledList(t0)
        case 'etf_list': return this.etfList(params, t0)
        case 'etf_snapshot': {
          const ref = resolveInstrumentFromParams(params)
          if (!ref) return fail('instrument 或 code 必填', t0)
          return this.dispatchInstrumentCapability('snapshot', { ...params, instrument: ref }, t0)
        }
        case 'etf_nav': return this.queryEtfInstrumentData(params, 'etf_nav', t0)
        case 'etf_holdings': return this.queryEtfInstrumentData(params, 'etf_holdings', t0)
        case 'local_etf_list': return await this.localEtfList(params, t0)
        case 'local_etf_nav': return await this.localEtfNav(String(params.code ?? ''), params, t0)
        case 'local_etf_holdings': return await this.localEtfHoldings(String(params.code ?? ''), params, t0)
        case 'local_etf_screen_schema': return this.localEtfScreenSchema(t0)
        case 'local_etf_screen': return this.localEtfScreen(params, t0)
        case 'etf_scorecard': {
          const ref = resolveInstrumentFromParams(params)
          if (!ref) return fail('instrument 或 code 必填', t0)
          return this.etfScorecard(ref, t0)
        }
        case 'etf_scorecard_schema': return this.etfScorecardSchema(t0)
        case 'search_local_instruments':
          return this.instrumentSearch(params, t0)
        case 'local_instruments_summary': return this.localInstrumentsSummary(t0)
        case 'instrument_snapshot': return this.instrumentSnapshot(params, t0)
        case 'instrument_quotes': return this.instrumentQuotes(params, t0)
        case 'instrument_chart': return this.instrumentChart(params, t0)
        case 'instrument_search': return this.instrumentSearch(params, t0)
        case 'instrument_capabilities': return this.instrumentCapabilities(params, t0)
        case 'local_us_screen_schema': return this.localUsScreenSchema(t0)
        case 'local_us_screen': return this.localUsScreen(params, t0)
        case 'local_crypto_screen_schema': return this.localCryptoScreenSchema(t0)
        case 'local_crypto_screen': return this.localCryptoScreen(params, t0)
        case 'local_jp_screen_schema': return this.localJpScreenSchema(t0)
        case 'local_jp_screen': return this.localJpScreen(params, t0)
        case 'local_kr_screen_schema': return this.localKrScreenSchema(t0)
        case 'local_kr_screen': return this.localKrScreen(params, t0)
        case 'local_hk_screen_schema': return this.localHkScreenSchema(t0)
        case 'local_hk_screen': return this.localHkScreen(params, t0)
        case 'search_etfs': return await this.searchEtfs(params, t0)
        case 'us_realtime': {
          const ref = resolveInstrumentFromParams({ market: 'US', symbol: params.symbol ?? params.code })
          if (!ref) return fail('symbol 必填', t0)
          return this.instrumentQuotes({ instruments: [ref] }, t0)
        }
        case 'us_kline': {
          const ref = resolveInstrumentFromParams({ market: 'US', symbol: params.symbol ?? params.code })
          if (!ref) return fail('symbol 必填', t0)
          return this.instrumentChart({ instrument: ref, count: params.count ?? 120, period: 'daily' }, t0)
        }
        case 'us_profile': {
          const ref = resolveInstrumentFromParams({ market: 'US', symbol: params.symbol ?? params.code })
          if (!ref) return fail('symbol 必填', t0)
          return this.usProfile(ref.symbol, t0)
        }
        case 'us_financials': {
          const ref = resolveInstrumentFromParams({ market: 'US', symbol: params.symbol ?? params.code })
          if (!ref) return fail('symbol 必填', t0)
          return this.usFinancials(ref.symbol, params, t0)
        }
        case 'us_snapshot': {
          const ref = resolveInstrumentFromParams({ market: 'US', symbol: params.symbol ?? params.code })
          if (!ref) return fail('symbol 必填', t0)
          return this.instrumentSnapshot({ instrument: ref }, t0)
        }
        case 'us_stock_list': return await this.usStockList(params, t0)
        case 'local_us_list': return await this.localUsList(params, t0)
        case 'search_us_stocks': return await this.searchUsStocks(params, t0)
        case 'crypto_realtime': {
          const ref = resolveInstrumentFromParams({ market: 'CRYPTO', pair: params.pair ?? params.symbol })
          if (!ref) return fail('pair 必填', t0)
          return this.instrumentQuotes({ instruments: [ref] }, t0)
        }
        case 'crypto_kline': {
          const ref = resolveInstrumentFromParams({ market: 'CRYPTO', pair: params.pair ?? params.symbol })
          if (!ref) return fail('pair 必填', t0)
          return this.instrumentChart({ instrument: ref, count: params.count ?? 120, period: 'daily' }, t0)
        }
        case 'crypto_snapshot': {
          const ref = resolveInstrumentFromParams({ market: 'CRYPTO', pair: params.pair ?? params.symbol })
          if (!ref) return fail('pair 必填', t0)
          return this.instrumentSnapshot({ instrument: ref }, t0)
        }
        case 'crypto_list': return await this.cryptoList(params, t0)
        case 'local_crypto_list': return await this.localCryptoList(params, t0)
        case 'search_crypto_pairs': return await this.searchCryptoPairs(params, t0)
        case 'strategy_report': return this.strategyReport(String(params.code), t0)
        case 'provider_custom_methods': {
          const providerId = params.provider_id ? String(params.provider_id) : undefined
          const keyword = params.keyword != null ? String(params.keyword).trim() : undefined
          const limit = params.limit != null ? Number(params.limit) : undefined
          return ok(
            this.de.listCustomMethodsForAgent({
              providerId,
              keyword: keyword || undefined,
              limit: Number.isFinite(limit) ? limit : undefined,
            }),
            '自定义方法列表',
            t0,
          )
        }
        case 'provider_invoke_custom': {
          const pid = String(params.provider_id ?? '')
          const method = String(params.method ?? '')
          const args = Array.isArray(params.args) ? params.args : []
          return this.de.invokeCustomMethod(pid, method, args)
            .then(r => r.success
              ? ok(
                r.argTransforms?.length
                  ? { result: r.data, arg_transforms: r.argTransforms }
                  : r.data,
                `${pid}.${method}`,
                t0,
              )
              : fail(r.error ?? '调用失败', t0))
        }
        default: return fail(`Unknown feature: ${feature}`, t0)
      }
    } catch (e) {
      return fail(String(e), t0)
    }
  }

  private async stockDiagnosis(input: string | InstrumentRef, scorecardName: string, t0: number) {
    const cnRef = resolveCnInstrumentRef(input)
    const snap = await this.ee.analyze(cnRef.symbol)
    const card = createScorecard(scorecardName)
    await this.neutralizer.compute([snap as never])
    card.score([snap])
    this.store.save(snap, scorecardName)

    const categories: Record<string, string[]> = {}
    for (const m of REGISTRY.metas()) {
      if (!categories[m.category]) categories[m.category] = []
      categories[m.category].push(m.name)
    }
    const valid = Object.values(snap.factors).filter(f => f?.value != null).length
    return ok({
      code: buildInstrumentNamespace(cnRef), name: snap.name, total_score: snap.totalScore,
      scorecard_name: scorecardName,
      scorecard_dimensions: card.factors.map(({ name, weight }) => ({
        name, score: snap.scores[`${name}_score`] ?? 0, weight,
      })),
      factors: Object.values(snap.factors).filter(Boolean).map(f => ({
        name: f!.name, value: f!.value, category: f!.meta.category,
      })),
      valid_factor_count: valid, total_factor_count: REGISTRY.count(),
      factor_categories: categories, timestamp: new Date().toISOString(),
    }, `${snap.name}(${snap.code}) 综合评分 ${snap.totalScore}`, t0)
  }

  private async institutionRating(ref: InstrumentRef, groups: string[] | undefined, t0: number) {
    const cnRef = resolveCnInstrumentRef(ref)
    const data = await this.institutions.evaluate(cnRef, groups)
    return ok(serializeInstitutionData(data as unknown as Record<string, unknown>), `${data.name} 机构共识 ${data.consensus_rating_cn}`, t0)
  }

  private async institutionReport(params: Record<string, unknown>, groups: string[] | undefined, t0: number) {
    const ref = resolveInstrumentFromParams(params)
    const cnRef = ref ? resolveCnInstrumentRef(ref) : null
    const data = cnRef
      ? await this.institutions.evaluate(cnRef, groups)
      : await this.institutions.evaluate(String(params.code ?? ''), groups)
    const code = data.code
    const text = formatInstitutionReport(data)
    return ok({ code, name: data.name, report_type: 'institution_rating', text },
      `${data.name} 机构评级报告`, t0)
  }

  private async screening(params: Record<string, unknown>, t0: number) {
    const conditions = (params.conditions ?? []) as Array<{ factor: string; op: '>' | '<' | '>=' | '<=' | '='; value: number }>
    const topN = Number(params.top_n ?? 20)

    try {
      const data = this.marketData.screen(conditions, topN)
      return ok({
        total_scanned: data.items.length,
        passed: data.passed,
        scorecard: '综合评估',
        source: 'local',
        items: data.items.map(i => ({ code: i.code, name: i.name, total_score: i.total_score, industry: i.industry })),
      }, `本地扫描 ${data.items.length} 通过 ${data.passed}`, t0)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return fail(`本地因子筛选不可用：${msg}。请先配置同花顺 API Key 并等待数据导入完成。`, t0)
    }
  }

  private failLocalOffline(t0: number, hint?: string) {
    return fail(hint ?? '本地离线数据已停用，请使用 instrument_search、instrument_evaluation、instrument_chart 等在线能力', t0)
  }

  private marketDbStatus(t0: number) {
    const status = this.marketData.status()
    return ok({
      ...status,
      local_offline_screening_enabled: false,
      guidance: '本地因子筛选已停用；行业名录/截面仍可读本地 SQLite；选股请用 screen_stocks 或 search_instruments',
    }, '本地数据状态', t0)
  }

  private marketDbSyncState(t0: number) {
    const snap = this.marketData.syncState()
    return ok(snap, '同步状态', t0)
  }

  private marketDataPacks(t0: number) {
    return this.failLocalOffline(t0)
  }

  private discoverReadinessContext(): DiscoverProfileReadinessContext {
    const status = this.marketData.status()
    return {
      packs: this.marketData.marketPackConfig(),
      stock_count: status.stock_count,
      etf_count: status.etf_count,
      us_count: status.us_count,
      crypto_count: status.crypto_count,
      jp_count: status.jp_count ?? 0,
      kr_count: status.kr_count ?? 0,
      hk_count: status.hk_count ?? 0,
      cn_is_ready: status.is_ready,
    }
  }

  private discoverScorecards(params: Record<string, unknown>, t0: number) {
    const profileRaw = String(params.profile ?? '').trim()
    if (!profileRaw || !isDiscoverStrategyProfile(profileRaw)) {
      return fail('profile 须为 cn_equity 或 cn_etf', t0)
    }
    const scorecardProfile = scorecardProfileFromDiscover(profileRaw)
    if (!scorecardProfile) {
      return ok({ profile: profileRaw, scorecards: [], default: null }, '暂无评分卡', t0)
    }
    const scorecards = listScorecardsForProfile(scorecardProfile)
    return ok({
      profile: profileRaw,
      scorecards,
      default: resolveScorecardName(scorecardProfile),
    }, '挖掘评分卡列表', t0)
  }

  private discoverProfileReadiness(params: Record<string, unknown>, t0: number) {
    const ctx = this.discoverReadinessContext()
    const profileRaw = String(params.profile ?? '').trim()
    if (profileRaw && isDiscoverStrategyProfile(profileRaw)) {
      return ok(assessDiscoverProfileReadiness(profileRaw, ctx), '挖掘就绪状态', t0)
    }
    return ok({ items: assessAllDiscoverProfileReadiness(ctx) }, '挖掘就绪状态', t0)
  }

  private marketDataPacksSave(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private async marketDataPackPrepare(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private async marketDbSync(params: Record<string, unknown>, t0: number) {
    const force = params.force === true
    const modeRaw = String(params.mode ?? 'auto')
    if (modeRaw === 'auto') {
      const result = await this.marketData.syncAdaptive(force)
      return ok({
        started: result.started,
        running: result.running,
        mode: result.mode,
        plan: result.plan.label,
      }, '数据同步', t0)
    }
    const jobs = [...CN_MANUAL_SYNC_JOBS]
    const mode = modeRaw === 'full' || modeRaw === 'resume' ? modeRaw : 'incremental'
    const result = await this.marketData.sync({ mode, jobs, force, background: true })
    return ok({
      started: result.started,
      running: result.running,
      mode: result.mode,
      plan: 'A 股基础数据',
    }, '数据同步', t0)
  }

  private industrySnapshotUnavailable(t0: number) {
    const { stock_count: stockCount } = this.marketData.status()
    if (stockCount > 0) return null
    return fail('本地行业库暂无数据，请使用 search_instruments、screen_stocks 等在线能力', t0)
  }

  private marketIndustryStats(params: Record<string, unknown>, t0: number) {
    const unavailable = this.industrySnapshotUnavailable(t0)
    if (unavailable) return unavailable
    const tradeDate = params.trade_date != null ? String(params.trade_date).trim() : undefined
    const data = this.marketData.industryStats(tradeDate || undefined)
    return ok(data, `A 股 ${data.items.length} 个行业统计`, t0)
  }

  private marketIndustryStocks(params: Record<string, unknown>, t0: number) {
    const industry = String(params.industry ?? '').trim()
    if (!industry) return fail('industry 必填', t0)
    const unavailable = this.industrySnapshotUnavailable(t0)
    if (unavailable) return unavailable
    const tradeDate = params.trade_date != null ? String(params.trade_date).trim() : undefined
    const limitRaw = params.limit != null ? Number(params.limit) : 120
    const limit = Number.isFinite(limitRaw) ? limitRaw : 120
    const data = this.marketData.industryStocks(industry, tradeDate || undefined, limit)
    const items = data.items.map(item => {
      const meta = this.marketData.store.stockMeta(item.code)
      const ref = normalizeInstrumentRef({
        market: 'CN',
        assetClass: inferCnAssetClass(item.code),
        symbol: item.code,
        exchange: meta?.exchange ?? undefined,
      })
      return { ...item, code: buildInstrumentNamespace(ref) }
    })
    return ok({ ...data, items }, `${industry} 成分股 ${items.length} 只`, t0)
  }

  private localIndustryList(params: Record<string, unknown>, t0: number) {
    const unavailable = this.industrySnapshotUnavailable(t0)
    if (unavailable) return unavailable
    const keyword = params.keyword != null ? String(params.keyword).trim() : undefined
    const tradeDate = params.trade_date != null ? String(params.trade_date).trim() : undefined
    const limitRaw = params.limit != null ? Number(params.limit) : undefined
    const limit = limitRaw != null && Number.isFinite(limitRaw) ? limitRaw : undefined
    const data = this.marketData.industryList(keyword || undefined, tradeDate || undefined, limit)
    return ok(data, `行业列表 ${data.industries.length} 项`, t0)
  }

  private localIndustryScreen(params: Record<string, unknown>, t0: number) {
    void params
    return fail('本地因子行业内筛选已停用，请用 get_local_industry_stocks 列出成分股后结合 screen_stocks / evaluate_instrument 在线分析', t0)
  }

  private listScreenFactors(t0: number) {
    return this.failLocalOffline(t0)
  }

  private localUniverseScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private localUniverseScreen(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private async batchStockSnapshots(params: Record<string, unknown>, t0: number) {
    const codes = Array.isArray(params.codes) ? (params.codes as string[]).map(String) : []
    const slice = codes.slice(0, 80)
    const items: Record<string, unknown>[] = []
    for (const code of slice) {
      const snap = await this.instrumentSnapshot(
        normalizeInstrumentHubParams({ code, market: 'CN' }),
        t0,
      )
      if (snap.success && snap.data && typeof snap.data === 'object') {
        items.push(snap.data as Record<string, unknown>)
      }
    }
    return ok({ trade_date: null, items }, `批量快照 ${items.length} 只`, t0)
  }

  private instrumentBatchHandlers(t0: number): InstrumentBatchRouteHandlers {
    return {
      cnBatchSnapshots: async symbols => this.batchStockSnapshots({ codes: symbols }, t0),
      batchQuotesOrSnapshots: async refs => this.instrumentQuotes({ instruments: refs }, t0),
    }
  }

  private instrumentBatchSnapshots(params: Record<string, unknown>, t0: number) {
    return routeInstrumentBatchSnapshots(params, this.instrumentBatchHandlers(t0))
  }

  private async instrumentCyq(params: Record<string, unknown>, t0: number) {
    return routeInstrumentCyq(params, this.instrumentRouteHandlers(t0))
  }

  private async instrumentInstitutionRating(params: Record<string, unknown>, t0: number) {
    return routeInstrumentInstitutionRating(params, this.instrumentRouteHandlers(t0))
  }

  private async instrumentInstitutionReport(params: Record<string, unknown>, t0: number) {
    return routeInstrumentInstitutionReport(params, this.instrumentRouteHandlers(t0))
  }

  private resolveInstrumentRefFromParams(params: Record<string, unknown>): InstrumentRef | null {
    return resolveInstrumentFromParams(params)
  }

  /** Central instrument capability dispatch — routes to instrument_* handlers */
  private async dispatchInstrumentCapability(
    cap: InstrumentHubCapability,
    params: Record<string, unknown>,
    t0: number,
  ): Promise<ResearchResult> {
    const normalized = normalizeInstrumentHubParams(params)
    switch (cap) {
      case 'snapshot': return this.instrumentSnapshot(normalized, t0)
      case 'quotes': return this.instrumentQuotes(normalized, t0)
      case 'chart':
      case 'chart_intraday':
        return this.instrumentChart(
          cap === 'chart_intraday' ? { ...normalized, period: 'intraday' } : normalized,
          t0,
        )
      case 'capabilities': return this.instrumentCapabilities(normalized, t0)
      case 'search': return this.instrumentSearch(normalized, t0)
      case 'cyq': return this.instrumentCyq(normalized, t0)
      case 'institution_rating': return this.instrumentInstitutionRating(normalized, t0)
      case 'institution_report': return this.instrumentInstitutionReport(normalized, t0)
      case 'evaluation': return this.instrumentEvaluation(normalized, t0)
      case 'strategy_signal': return this.instrumentStrategySignal(normalized, t0)
      case 'indicators': return this.instrumentIndicators(normalized, t0)
      case 'strategy_verify': return this.instrumentStrategyVerify(normalized, t0)
      case 'batch_snapshots': return this.instrumentBatchSnapshots(normalized, t0)
      default: return fail(`未知 capability: ${cap}`, t0)
    }
  }

  private instrumentAnalyticsHandlers(t0: number): InstrumentAnalyticsRouteHandlers {
    return {
      cnFactorEvaluation: async ref => this.stockDiagnosis(ref, '综合评估', t0),
      cnEtfEvaluation: async ref => {
        const card = this.marketData.etfScorecard(ref.symbol)
        if (!card) return fail('暂时无法生成 ETF 决策雷达', t0)
        const scoreHint = card.total_score != null ? ` ${card.total_score} 分` : ''
        return ok(card, `${card.name} ETF决策雷达${scoreHint}`, t0)
      },
      technicalEvaluation: async ref => {
        const data = await gatherStrategyData(this.de, ref)
        const evaluation = buildTechnicalEvaluation(data, ref)
        return ok(evaluation, `${evaluation.name} 技术分析 ${evaluation.total_score} 分`, t0)
      },
      strategyAssess: async ref => {
        const normalized = ref.market === 'CN' ? normalizeCode(ref.symbol) : ref.symbol
        if (ref.market === 'CN' && isCnEtfCode(normalized)) {
          const technical = await quickAssess(this.de, normalized, ref)
          const card = this.marketData.etfScorecard(normalized)
          const radarHint = card?.total_score != null ? ` · 决策雷达 ${card.total_score} 分` : ''
          return ok({
            ...technical,
            asset_class: 'ETF' as const,
            scorecard_name: 'ETF决策雷达',
            etf_scorecard: card,
          }, `${normalized} ${technical.summary}${radarHint}`, t0)
        }
        const data = await quickAssess(this.de, normalized, ref)
        const scorecardName = ref.market === 'CN' ? '综合评估' : '技术分析'
        const assetClass = ref.assetClass === 'ETF'
          ? 'ETF'
          : ref.assetClass === 'CRYPTO_SPOT'
            ? 'CRYPTO'
            : 'EQUITY'
        return ok({
          ...data,
          asset_class: assetClass,
          scorecard_name: scorecardName,
        }, `${normalized} ${data.summary}`, t0)
      },
      buildIndicators: async ref => {
        const data = await gatherStrategyData(this.de, ref)
        const indicators = buildInstrumentIndicators(data)
        return ok({
          instrument: ref,
          code: ref.symbol,
          name: data.name ?? ref.symbol,
          ...indicators,
        }, `${data.name ?? ref.symbol} 技术指标`, t0)
      },
      strategyVerify: async (ref, checkpoints, forwardDays) => {
        const data = await verifyStrategyForRef(this.de, ref, checkpoints, forwardDays)
        return ok(data, '策略验证完成', t0)
      },
    }
  }

  private async instrumentEvaluation(params: Record<string, unknown>, t0: number) {
    const ref = this.resolveInstrumentRefFromParams(params)
    if (!ref) return fail('instrument 或 code 必填', t0)
    const scorecard = String(params.scorecard ?? '综合评估')
    return routeInstrumentEvaluation(
      { ...params, instrument: ref },
      {
        ...this.instrumentAnalyticsHandlers(t0),
        cnFactorEvaluation: async r => this.stockDiagnosis(r, scorecard, t0),
      },
    )
  }

  private async instrumentStrategySignal(params: Record<string, unknown>, t0: number) {
    const ref = this.resolveInstrumentRefFromParams(params)
    if (!ref) return fail('instrument 或 code 必填', t0)
    return routeInstrumentStrategySignal(
      { ...params, instrument: ref },
      this.instrumentAnalyticsHandlers(t0),
    )
  }

  private async instrumentIndicators(params: Record<string, unknown>, t0: number) {
    const ref = this.resolveInstrumentRefFromParams(params)
    if (!ref) return fail('instrument 或 code 必填', t0)
    return routeInstrumentIndicators(
      { ...params, instrument: ref },
      this.instrumentAnalyticsHandlers(t0),
    )
  }

  private async instrumentStrategyVerify(params: Record<string, unknown>, t0: number) {
    const ref = this.resolveInstrumentRefFromParams(params)
    if (ref) {
      return routeInstrumentStrategyVerify(
        { ...params, instrument: ref },
        this.instrumentAnalyticsHandlers(t0),
      )
    }
    const data = await verifyStrategy(this.de, String(params.code ?? ''), Number(params.checkpoints ?? 30))
    return ok(data, '策略验证完成', t0)
  }

  private async trendBrief(ref: InstrumentRef, params: Record<string, unknown>, t0: number) {
    const cnRef = resolveCnInstrumentRef(ref)
    const normalized = cnRef.symbol
    const exchange = cnRef.exchange
    let klines = this.marketData.localDailyKlines(normalized, 280)
    if (klines.length < 30) {
      const kl = await this.de.queryInstrumentData(cnRef, 'kline', { count: 280 })
      const klData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(kl)
      if (kl.success && klData?.length) klines = klData
    }
    if (klines.length < 20) {
      return fail('K 线数据不足，请先同步本地行情后再查看趋势研判', t0)
    }

    const indexKlines = this.marketData.localDailyKlines('000300', 280)
    const quoteR = await this.stockRealtime(cnRef)
    const quote = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(quoteR)?.[0] ?? null
    const name = this.resolveStockName(normalized, exchange ?? quote?.name, quote?.name)

    const holdingCost = Number(params.holding_cost)
    const brief = buildTrendBrief({
      code: buildInstrumentNamespace(cnRef),
      name,
      klines,
      indexKlines: indexKlines.length >= 60 ? indexKlines : undefined,
      livePrice: quote?.price ?? null,
      holdingCost: Number.isFinite(holdingCost) && holdingCost > 0 ? holdingCost : null,
    })

    return ok({
      ...brief,
      timestamp: new Date().toISOString(),
    }, `${name} 趋势研判`, t0)
  }

  private async strategyVerify(params: Record<string, unknown>, t0: number) {
    const data = await verifyStrategy(this.de, String(params.code), Number(params.checkpoints ?? 30))
    return ok(data, '策略验证完成', t0)
  }

  private async strategyVerifyReport(params: Record<string, unknown>, t0: number) {
    const data = await verifyStrategy(this.de, String(params.code), Number(params.checkpoints ?? 30))
    const text = formatVerificationReport(data)
    return ok({ code: data.code, name: data.name, report_type: 'strategy_verify', text }, '策略验证报告', t0)
  }

  private async portfolioAnalysis(params: Record<string, unknown>, t0: number) {
    const holdings = (params.holdings as [string, number][]) ?? []
    const data = await this.portfolio.analyze(holdings, String(params.scorecard ?? '综合评估'))
    return ok(data, `组合 ${holdings.length} 只`, t0)
  }

  private async industryMining(industry: string, t0: number) {
    const data = await this.industrySkill.analyze(industry)
    return ok(data, `${industry} 产业透视`, t0)
  }

  private async industryMermaid(industry: string, t0: number) {
    const mermaid = mermaidIndustryChain(industry)
    return ok({ industry, mermaid }, `${industry} 产业链 Mermaid`, t0)
  }

  private async marketReport(type: string, t0: number) {
    if (type === 'morning') {
      const data = await this.morningBrief.generate()
      return ok(data, data.title, t0)
    }
    const data = await this.closingReport.generate()
    return ok(data, data.title, t0)
  }

  private async marketDynamics(t0: number) {
    const [homeR, majorR, asiaR, europeR, americaR, gainersR, losersR, dragonR] = await Promise.all([
      this.de.invokeCustomMethod('tencent', 'tencentCnIndexSnapshot', ['mstats_home', false]),
      this.de.invokeCustomMethod('tencent', 'tencentCnIndexSnapshot', ['major', false]),
      this.de.invokeCustomMethod('tencent', 'tencentGlobalIndexList', ['AS', 1, 40, 2, 'desc']),
      this.de.invokeCustomMethod('tencent', 'tencentGlobalIndexList', ['EU', 1, 40, 2, 'desc']),
      this.de.invokeCustomMethod('tencent', 'tencentGlobalIndexList', ['AM', 1, 40, 2, 'desc']),
      this.de.invokeCustomMethod('tencent', 'tencentHsjStockList', [1, 30, 32, 'desc']),
      this.de.invokeCustomMethod('tencent', 'tencentHsjStockList', [1, 30, 32, 'asc']),
      this.de.dragonTiger(),
    ])

    const mapCnItems = (resp: { success: boolean; data?: unknown }) => {
      if (!resp.success || !Array.isArray(resp.data) || !resp.data[0]) return []
      const block = resp.data[0] as { items?: Record<string, unknown>[] }
      return (block.items ?? []).map(row => ({
        code: String(row.code ?? '').trim(),
        qt_code: String(row.qtCode ?? '').trim() || undefined,
        name: String(row.name ?? row.code ?? '').trim(),
        price: typeof row.price === 'number' ? row.price : null,
        change_pct: typeof row.changePct === 'number' ? row.changePct : null,
        change_amt: typeof row.changeAmt === 'number' ? row.changeAmt : null,
        market: String(row.market ?? '').trim() || undefined,
        quote_time: String(row.quoteTime ?? '').trim() || undefined,
      })).filter(item => item.code || item.name)
    }

    const mapGlobalItems = (resp: { success: boolean; data?: unknown }) => {
      if (!resp.success || !Array.isArray(resp.data) || !resp.data[0]) return []
      const block = resp.data[0] as { items?: Record<string, unknown>[] }
      return (block.items ?? []).map(row => ({
        code: String(row.code ?? '').trim(),
        qt_code: String(row.qtCode ?? '').trim() || undefined,
        name: String(row.name ?? row.code ?? '').trim(),
        price: typeof row.price === 'number' ? row.price : null,
        change_pct: typeof row.changePct === 'number' ? row.changePct : null,
        market: String(row.market ?? 'global').trim() || undefined,
        location: String(row.location ?? '').trim() || undefined,
        trade_state_label: String(row.tradeStateLabel ?? '').trim() || undefined,
      })).filter(item => item.code || item.name)
    }

    const mapMoverItems = (resp: { success: boolean; data?: unknown }) => {
      if (!resp.success || !Array.isArray(resp.data) || !resp.data[0]) return []
      const block = resp.data[0] as { items?: Record<string, unknown>[] }
      return (block.items ?? []).map(row => ({
        code: String(row.code ?? '').trim(),
        name: String(row.name ?? row.code ?? '').trim(),
        price: typeof row.price === 'number' ? row.price : null,
        change_pct: typeof row.changePct === 'number' ? row.changePct : null,
        change_amt: typeof row.changeAmt === 'number' ? row.changeAmt : null,
      })).filter(item => item.code)
    }

    const mapDragonTigerItems = (resp: { success: boolean; data?: unknown }) => {
      if (!resp.success || !Array.isArray(resp.data)) return []
      return resp.data.map(row => {
        const item = row as Record<string, unknown>
        return {
          code: String(item.code ?? '').trim(),
          name: String(item.name ?? item.code ?? '').trim(),
          date: String(item.date ?? '').slice(0, 10),
          reason: item.reason ? String(item.reason).trim() : undefined,
          buy_amount: typeof item.buyAmount === 'number' ? item.buyAmount : null,
          sell_amount: typeof item.sellAmount === 'number' ? item.sellAmount : null,
          net_amount: typeof item.netAmount === 'number' ? item.netAmount : null,
          change_pct: typeof item.changePct === 'number' ? item.changePct : null,
        }
      }).filter(item => item.code)
    }

    const cnDragonTiger = mapDragonTigerItems(dragonR)

    const sections = [
      {
        id: 'spotlight',
        title: '全球要闻',
        hint: '主要市场指数一览，数据约每 30 秒刷新',
        items: mapCnItems(homeR),
      },
      {
        id: 'cn_major',
        title: 'A 股主要指数',
        hint: '沪深市场核心宽基指数',
        items: mapCnItems(majorR),
      },
      {
        id: 'asia',
        title: '亚太市场',
        items: mapGlobalItems(asiaR),
      },
      {
        id: 'europe',
        title: '欧洲市场',
        items: mapGlobalItems(europeR),
      },
      {
        id: 'america',
        title: '美洲市场',
        items: mapGlobalItems(americaR),
      },
    ].filter(section => section.items.length > 0)

    return ok({
      refreshed_at: new Date().toISOString(),
      sections,
      cn_gainers: mapMoverItems(gainersR),
      cn_losers: mapMoverItems(losersR),
      cn_dragon_tiger: cnDragonTiger,
      cn_dragon_tiger_date: cnDragonTiger[0]?.date ?? null,
    }, '市场动态', t0)
  }

  private async marketRegime(params: Record<string, unknown>, t0: number) {
    const scope = String(params.profile_scope ?? 'cn').toLowerCase() as MarketRegimeScope
    if (scope === 'us') {
      return this.marketRegimeUs(t0)
    }
    return this.marketRegimeCn(t0)
  }

  private async marketRegimeCn(t0: number) {
    const klines = this.marketData.localDailyKlines('000300', 280)
    const klineBars = klines.map(k => ({ close: k.close, amount: k.amount }))

    let indexM6m: number | null = null
    let indexM1m: number | null = null
    if (klines.length >= 21) {
      const last = klines[klines.length - 1]?.close
      const m1Base = klines[Math.max(0, klines.length - 21)]?.close
      if (last != null && m1Base != null && m1Base > 0) {
        indexM1m = Math.round((last / m1Base - 1) * 1000) / 10
      }
    }
    if (klines.length >= 121) {
      const last = klines[klines.length - 1]?.close
      const m6Base = klines[klines.length - 121]?.close
      if (last != null && m6Base != null && m6Base > 0) {
        indexM6m = Math.round((last / m6Base - 1) * 1000) / 10
      }
    }

    let indexPe: number | null = null
    try {
      const idxR = await this.de.indexRealtime('000300')
      const pe = (idxR.data?.[0] as { pe?: number | null } | undefined)?.pe
      if (pe != null && pe > 0) indexPe = Math.round(pe * 100) / 100
    } catch { /* offline fallback */ }

    let advancePct: number | null = null
    let limitUp: number | null = null
    let limitDown: number | null = null
    let northboundNetYi: number | null = null
    try {
      const [breadthR, limitR, northR] = await Promise.all([
        this.de.marketBreadth(),
        this.de.limitUpdown(),
        this.de.marketMoneyFlow('north'),
      ])
      if (breadthR.success && breadthR.data?.[0]) {
        const b = breadthR.data[0] as {
          up?: number; down?: number; flat?: number; total?: number; advancePct?: number
        }
        if (b.advancePct != null) {
          advancePct = b.advancePct
        } else if (b.total != null && b.total > 0 && b.up != null) {
          advancePct = Math.round((b.up / b.total) * 1000) / 10
        }
      }
      if (limitR.success && limitR.data) {
        limitUp = limitR.data.filter(l => l.type === 'limit_up').length
        limitDown = limitR.data.filter(l => l.type === 'limit_down').length
      }
      if (northR.success && northR.data?.[0]?.netAmount != null) {
        northboundNetYi = Math.round(northR.data[0].netAmount / 1e8 * 100) / 100
      }
    } catch { /* live sentiment optional */ }

    const snapshot = computeMarketRegime({
      index_m6m: indexM6m,
      index_m1m: indexM1m,
      index_pe: indexPe,
      ma125_position_pct: computeMaPositionPct(klineBars, 125),
      advance_pct: advancePct,
      turnover_vs_20d: computeTurnoverVs20d(klineBars),
      hv20_pct: computeHv20Pct(klineBars),
      limit_up: limitUp,
      limit_down: limitDown,
      northbound_net_yi: northboundNetYi,
      price_percentile_250d: computePricePercentile(klineBars, 250),
    })

    const suggestedByProfile = {
      cn_equity: resolveRegimeStrategyIds('cn_equity', snapshot.regime, snapshot.suggested_strategy_ids),
      cn_etf: resolveRegimeStrategyIds('cn_etf', snapshot.regime, snapshot.suggested_strategy_ids),
    } satisfies Partial<Record<DiscoverStrategyProfile, string[]>>

    return ok({
      scope: 'cn' as const,
      ...snapshot,
      suggested_by_profile: suggestedByProfile,
      etf_regime_detail: ETF_REGIME_DETAIL[snapshot.regime],
      timestamp: new Date().toISOString(),
    }, snapshot.headline, t0)
  }

  /** 美股市况 stub — 基于 SPY 动量/波动，不含 A 股广度/北向 */
  private async marketRegimeUs(t0: number) {
    let klines: Array<{ close: number; amount?: number | null }> = []
    try {
      const kl = await this.de.queryInstrumentData(
        { market: 'US', assetClass: 'EQUITY', symbol: 'SPY' },
        'kline',
        { count: 280 },
      )
      const rows = instrumentQueryData<Array<{ close: number; amount?: number | null }>>(kl)
      if (rows?.length) {
        klines = rows.map(k => ({
          close: k.close,
          amount: k.amount,
        }))
      }
    } catch { /* offline */ }

    const inputs = klines.length >= 21
      ? momentumRegimeInputsFromKlines(klines)
      : { index_m6m: null, index_m1m: null }
    const snapshot = computeMarketRegime(inputs)
    const usSuggested = resolveRegimeStrategyIds('us_equity', snapshot.regime, snapshot.suggested_strategy_ids)

    return ok({
      scope: 'us' as const,
      ...snapshot,
      detail: US_REGIME_DETAIL[snapshot.regime] ?? snapshot.detail,
      suggested_by_profile: { us_equity: usSuggested },
      regime_note: '基于 SPY 动量与波动率代理；不含 A 股广度、涨跌停与北向等指标。',
      timestamp: new Date().toISOString(),
    }, snapshot.headline, t0)
  }

  private searchStocks(keyword: string, t0: number) {
    const raw = keyword.trim()
    if (!raw) return ok({ keyword: raw, results: [] as StockListItem[] }, '请输入关键词', t0)

    const results = this.marketData.searchStocks(raw)
    return ok({ keyword: raw, results }, `找到 ${results.length} 只`, t0)
  }

  private resolveStockName(
    code: string,
    exchangeOrName?: string | null,
    ...rest: Array<string | null | undefined>
  ): string {
    let exchange: string | null | undefined
    let candidates: Array<string | null | undefined>
    if (exchangeOrName === 'SH' || exchangeOrName === 'SZ' || exchangeOrName === 'BJ') {
      exchange = exchangeOrName
      candidates = rest
    } else {
      candidates = [exchangeOrName, ...rest]
    }
    const normalized = normalizeCode(code)
    const cacheKey = exchange ? `${exchange}:${normalized}` : normalized
    const cached = this.stockNameCache.get(cacheKey)
    if (cached && cached !== normalized) return cached
    for (const c of candidates) {
      if (c && c.trim() && c.trim() !== normalized) {
        this.stockNameCache.set(cacheKey, c.trim())
        return c.trim()
      }
    }
    const local = this.marketData.store.stockMeta(normalized, exchange)
    if (local?.name && local.name !== normalized) {
      this.stockNameCache.set(cacheKey, local.name)
      return local.name
    }
    const stored = this.store.getLatest(normalized)
    if (stored?.name && stored.name !== normalized) {
      this.stockNameCache.set(cacheKey, stored.name)
      return stored.name
    }
    return normalized
  }

  private async fillMissingStockNames(_codes: string[]): Promise<void> {
    // 名称由在线行情回填，不再读本地 universe
  }

  private async stockQuotes(refs: (string | InstrumentRef)[] | undefined, t0: number) {
    const normalizedRefs = [...new Map(
      (refs ?? []).map(item => {
        const ref = resolveCnInstrumentRef(item)
        return [instrumentRefKey(ref), ref] as const
      }),
    ).values()]
    if (!normalizedRefs.length) return ok({ quotes: [] }, '暂无关注', t0)
    await this.fillMissingStockNames(normalizedRefs.map(r => r.symbol))
    const batch = await this.stockBatchRealtime(normalizedRefs)
    const quotes = normalizedRefs
      .map((ref, i) => this.mergeQuoteWithLocal(ref.symbol, batch.data?.[i] ?? null))
      .filter((q): q is NonNullable<ReturnType<ResearchHub['mergeQuoteWithLocal']>> => q != null)
    if (!quotes.length) return fail('行情获取失败', t0)
    return ok({ quotes }, `更新 ${quotes.length} 只`, t0)
  }

  /** Lightweight batch insights for watchlist rows — prefers local market DB, then SnapshotStore. */
  private async watchlistRadar(codes: string[] | undefined, t0: number) {
    const sourceCodes = codes?.length ? codes : this.de.watchlist.codes()
    const refs = [...new Map(
      instrumentRefsFromList(sourceCodes, 'CN')
        .filter(r => r.market === 'CN')
        .map(ref => [instrumentRefKey(ref), ref] as const),
    ).values()]
    if (!refs.length) return ok({ items: [] as WatchlistRadarItem[] }, '暂无 A 股关注', t0)

    await this.fillMissingStockNames(refs.map(r => r.symbol))

    const quoteByKey = new Map<string, { name?: string; pe?: number | null; pb?: number | null }>()
    try {
      const batch = await this.stockBatchRealtime(refs)
      refs.forEach((ref, i) => {
        const q = batch.data?.[i]
        if (q) quoteByKey.set(instrumentRefKey(ref), q)
      })
    } catch {
      // fallback per-ref inside buildWatchlistRadarItem
    }

    const items = await Promise.all(
      refs.map(ref => this.buildWatchlistRadarItem(ref, undefined, quoteByKey.get(instrumentRefKey(ref)))),
    )
    return ok({ items }, `雷达 ${items.length} 只`, t0)
  }

  private async buildWatchlistRadarItem(
    input: string | InstrumentRef,
    local?: {
      name: string
      total_score: number | null
      scorecard: string | null
      pe: number | null
      pb: number | null
      pe_percentile: number | null
      pb_percentile: number | null
    },
    cachedQuote?: { name?: string; pe?: number | null; pb?: number | null },
  ): Promise<WatchlistRadarItem> {
    const ref = resolveCnInstrumentRef(input)
    const symbol = normalizeCode(ref.symbol)
    const ns = buildInstrumentNamespace(ref)
    const stored = this.store.getLatest(symbol)
    const factors = stored?.factorValues ?? {}
    try {
      const quoteR = cachedQuote
        ? { success: true, data: [cachedQuote] }
        : await this.stockRealtime(ref)
      const flowR = await this.de.queryInstrumentData(ref, 'money_flow')
      const flowRows = instrumentQueryData<MoneyFlow[]>(flowR)
      const flow = flowRows?.[0] ?? (await this.callDetailProviderMethod<MoneyFlow>(
        ['tencent', 'sinafinance', 'zzshare'],
        'moneyFlow',
        [symbol],
        ref,
      ))?.[0]
      const quote = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(quoteR)?.[0]
      return {
        code: ns,
        name: this.resolveStockName(symbol, ref.exchange ?? null, quote?.name, local?.name, stored?.name),
        total_score: local?.total_score ?? stored?.totalScore ?? null,
        scorecard: local?.scorecard ?? stored?.scorecardName ?? null,
        from_store: Boolean(local || stored),
        pe: quote?.pe ?? local?.pe ?? null,
        pb: quote?.pb ?? local?.pb ?? null,
        pe_percentile: local?.pe_percentile ?? factors.pe_percentile ?? null,
        pb_percentile: local?.pb_percentile ?? factors.pb_percentile ?? null,
        main_net: flow?.mainNet ?? null,
        flow_date: flow?.date ?? null,
      }
    } catch {
      return {
        code: ns,
        name: this.resolveStockName(symbol, undefined, local?.name, stored?.name),
        total_score: local?.total_score ?? stored?.totalScore ?? null,
        scorecard: local?.scorecard ?? stored?.scorecardName ?? null,
        from_store: Boolean(local || stored),
        pe: local?.pe ?? null,
        pb: local?.pb ?? null,
        pe_percentile: local?.pe_percentile ?? factors.pe_percentile ?? null,
        pb_percentile: local?.pb_percentile ?? factors.pb_percentile ?? null,
        main_net: null,
        flow_date: null,
      }
    }
  }

  private async stockKline(input: string | InstrumentRef, count: number, t0: number) {
    const cnRef = resolveCnInstrumentRef(input)
    const code = buildInstrumentNamespace(cnRef)
    const safeCount = Math.max(20, Math.min(count, 240))
    const result = await this.de.queryInstrumentData(cnRef, 'kline', { count: safeCount })
    if (!result.success) return fail(instrumentQueryError(result, 'K线获取失败'), t0)
    const klines = instrumentQueryData<import('@opptrix/shared').StockKline[]>(result) ?? []
    return ok({ code, klines }, `${code} K线 ${klines.length} 根`, t0)
  }

  private async stockCyq(ref: InstrumentRef, t0: number) {
    const cnRef = resolveCnInstrumentRef(ref)
    const normalized = cnRef.symbol
    const klineR = await this.de.queryInstrumentData(cnRef, 'kline', { count: 320 })
    const klines = instrumentQueryData<import('@opptrix/shared').StockKline[]>(klineR) ?? []
    if (!klines.length) {
      return fail('K线不足，无法计算筹码分布', t0)
    }
    const rows = computeChipDistribution(normalized, klines, 90)
    if (!rows.length) return fail('筹码分布计算失败', t0)
    const latest = rows[rows.length - 1]!
    return ok({
      code: buildInstrumentNamespace(cnRef),
      rows,
      latest,
    }, `${normalized} 筹码 ${rows.length} 日`, t0)
  }

  private mapCyqRow(row: {
    date: string
    benefitPart: number
    avgCost: number
    cost90Low: number
    cost90High: number
    cost90Con: number
    cost70Low: number
    cost70High: number
    cost70Con: number
  }) {
    return {
      date: row.date,
      benefitPart: row.benefitPart,
      avgCost: row.avgCost,
      cost90Low: row.cost90Low,
      cost90High: row.cost90High,
      cost90Con: row.cost90Con,
      cost70Low: row.cost70Low,
      cost70High: row.cost70High,
      cost70Con: row.cost70Con,
    }
  }

  /** 详情页次要字段（财务/新闻/分红等）超时后降级为空，避免慢源阻塞整页 */
  private stockDetailOptional<T>(
    promise: Promise<{ success: boolean; data?: T[] | null }>,
    timeoutMs = 20000,
  ): Promise<{ success: boolean; data?: T[] | null }> {
    return Promise.race([
      promise,
      new Promise<{ success: false }>(resolve => {
        setTimeout(() => resolve({ success: false }), timeoutMs)
      }),
    ])
  }

  /** 绕过 queryScoped 测速，按优先级直连指定 provider（详情页避免 zzshare 代理抢先） */
  private async callDetailProviderMethod<T>(
    providerIds: string[],
    method: string,
    args: unknown[],
    ref?: InstrumentRef,
  ): Promise<T[] | null> {
    for (const pid of providerIds) {
      const driver = this.de.registry.get(pid) as Record<string, unknown> | undefined
      if (!driver) continue
      const fn = driver[method] as ((...a: unknown[]) => Promise<T[] | null>) | undefined
      if (typeof fn !== 'function') continue
      try {
        const wiredArgs = ref ? wireRegistryMethodArgs(pid, method, args, ref) : args
        const data = await fn.apply(driver, wiredArgs)
        if (data?.length) return data
      } catch {
        continue
      }
    }
    return null
  }

  private async stockDetailNotices(ref: InstrumentRef): Promise<NewsItem[]> {
    const cnRef = resolveCnInstrumentRef(ref)
    const r = await this.de.queryInstrumentData(cnRef, 'notices', { page: 1, pageSize: 30 })
    const rows = instrumentQueryData<NewsItem[]>(r) ?? []
    if (rows.length) return dedupeStockNewsItems(rows).slice(0, 30)
    const fallback = await this.callDetailProviderMethod<NewsItem>(
      ['zzshare'],
      'news',
      [cnRef.symbol, 1, 30, 'notice'],
      cnRef,
    )
    return fallback ?? []
  }

  private async stockDetailShareholders(ref: InstrumentRef) {
    const cnRef = resolveCnInstrumentRef(ref)
    const engineR = await this.de.queryInstrumentData(cnRef, 'shareholders')
    const engineRows = instrumentQueryData<Record<string, unknown>[]>(engineR)
    if (engineRows?.length) {
      const normalized = normalizeShareholderPayload(cnRef.symbol, engineRows)
      if (normalized) return [normalized]
    }
    const code = cnRef.symbol
    const raw = await this.callDetailProviderMethod<Record<string, unknown>>(
      ['sinafinance', 'tushare'],
      'shareholders',
      [code],
      cnRef,
    )
    const rows = raw ?? await this.callDetailProviderMethod<Record<string, unknown>>(
      ['tickflow', 'zzshare'],
      'shareholders',
      [code],
      cnRef,
    ) ?? null
    const normalized = normalizeShareholderPayload(code, rows)
    return normalized ? [normalized] : null
  }

  private async stockDetailHolderHistory(ref: InstrumentRef) {
    const cnRef = resolveCnInstrumentRef(ref)
    const rows = await this.callDetailProviderMethod<Record<string, unknown>>(
      ['tushare'],
      'shareholderNumbers',
      [cnRef.symbol],
      cnRef,
    )
    return holderHistoryFromRows(rows)
  }

  /** 详情页行情：腾讯补全 PE/PB/量比/市值，fallback 保留准确 OHLCV/成交量 */
  private async stockDetailQuote(ref: InstrumentRef) {
    const cnRef = resolveCnInstrumentRef(ref)
    const code = cnRef.symbol
    const secSym = formatProviderMethodArgs('tencent', 'realtimeSec', cnRef)[0] as string
    const [preferred, fallbackR] = await Promise.all([
      this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'realtimeSec', [secSym]),
      this.de.queryInstrumentData(cnRef, 'realtime'),
    ])
    const merged = mergeDetailQuoteRows(
      code,
      preferred?.[0] ?? null,
      (instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(fallbackR)?.[0] ?? null) as Record<string, unknown> | null,
    )
    if (!merged) return null
    return normalizePreOpenRealtimeQuote(merged as unknown as import('@opptrix/shared').StockRealtime)
  }

  /** 详情页公司资料：绕过 queryScoped 测速，合并 sinafinance / tushare / 腾讯 + 扩展 enrichments */
  private async stockDetailProfile(ref: InstrumentRef): Promise<Record<string, unknown> | null> {
    const cnRef = resolveCnInstrumentRef(ref)
    const code = cnRef.symbol
    const engineProfileR = await this.de.queryInstrumentData(cnRef, 'profile')
    const engineRow = instrumentQueryData<Array<Record<string, unknown>>>(engineProfileR)?.[0] ?? null

    const [
      industryRankR,
      platesR,
      institutionRatingR,
      executivesR,
      indexMembershipR,
    ] = await Promise.all([
      this.callDetailProviderMethod<Record<string, unknown>>(
        ['tencent'], 'tencentIndustryRank', formatProviderMethodArgs('tencent', 'tencentIndustryRank', cnRef),
      ),
      this.callDetailProviderMethod<Record<string, unknown>>(
        ['tencent'], 'tencentStockPlates', formatProviderMethodArgs('tencent', 'tencentStockPlates', cnRef),
      ),
      this.callDetailProviderMethod<Record<string, unknown>>(
        ['tencent'], 'tencentInstitutionRating', formatProviderMethodArgs('tencent', 'tencentInstitutionRating', cnRef),
      ),
      this.callDetailProviderMethod<Record<string, unknown>>(
        ['sinafinance'], 'sinaExecutives', formatProviderMethodArgs('sinafinance', 'sinaExecutives', cnRef),
      ),
      this.callDetailProviderMethod<Record<string, unknown>>(
        ['sinafinance'], 'sinaIndexMembership', formatProviderMethodArgs('sinafinance', 'sinaIndexMembership', cnRef),
      ),
    ])

    const rows: Record<string, unknown>[] = []
    if (engineRow) rows.push(engineRow)
    if (!engineRow) {
      for (const pid of ['sinafinance', 'tushare', 'tencent']) {
        const batch = await this.callDetailProviderMethod<Record<string, unknown>>(
          [pid],
          'profile',
          formatProviderMethodArgs(pid, 'profile', cnRef),
        )
        if (batch?.[0]) rows.push(batch[0])
      }
    }

    const base = mergeStockProfileRows(code, rows)
    return enrichCnStockProfile(code, base, {
      industryRank: industryRankR?.[0] ?? null,
      plates: platesR ?? null,
      institutionRating: institutionRatingR?.[0] ?? null,
      executives: executivesR ?? null,
      indexMembership: indexMembershipR ?? null,
    })
  }

  private async stockDetail(ref: InstrumentRef, t0: number) {
    const cnRef = resolveCnInstrumentRef(ref)
    const code = cnRef.symbol
    const [quoteR, profileR, financialAllR, newsR, dividendR, moneyFlowR, shareholdersR, holderHistoryR] = await Promise.all([
      this.stockDetailQuote(cnRef),
      this.stockDetailOptional(
        this.stockDetailProfile(cnRef).then(profile => ({
          success: !!profile,
          data: profile ? [profile] : null,
        })),
        25000,
      ),
      this.stockDetailOptional(
        (async () => {
          const fast = await this.callDetailProviderMethod<FinancialSummary>(
            ['sinafinance', 'tushare'],
            'financials',
            [code, '', 'all'],
            cnRef,
          )
          if (fast?.length) return { success: true, data: fast }
          return this.de.queryInstrumentData(cnRef, 'financials', {
            reportDate: '',
            reportType: 'all',
          }) as Promise<{ success: boolean; data?: Array<{ reportType?: string }> | null }>
        })(),
        25000,
      ),
      this.stockDetailOptional(
        this.stockDetailNotices(cnRef).then(data => ({ success: data.length > 0, data })),
      ),
      this.stockDetailOptional(
        (async () => {
          const engineR = await this.de.queryInstrumentData(cnRef, 'dividend')
          const engineRows = instrumentQueryData<Dividend[]>(engineR)
          if (engineRows?.length) return { success: true, data: engineRows }
          const preferred = await this.callDetailProviderMethod<Dividend>(
            ['sinafinance', 'tushare'],
            'dividend',
            [code],
            cnRef,
          )
          if (preferred?.length) return { success: true, data: preferred }
          const fallback = await this.callDetailProviderMethod<Dividend>(
            ['baostock', 'tonghuashun'],
            'dividend',
            [code],
            cnRef,
          )
          return fallback?.length ? { success: true, data: fallback } : { success: false }
        })(),
      ),
      this.stockDetailOptional(
        (async () => {
          const engineR = await this.de.queryInstrumentData(cnRef, 'money_flow')
          const engineRows = instrumentQueryData<MoneyFlow[]>(engineR)
          if (engineRows?.length) return { success: true, data: engineRows }
          const preferred = await this.callDetailProviderMethod<MoneyFlow>(
            ['tencent', 'sinafinance'],
            'moneyFlow',
            [code],
            cnRef,
          )
          if (preferred?.length) return { success: true, data: preferred }
          const fallback = await this.callDetailProviderMethod<MoneyFlow>(
            ['zzshare'],
            'moneyFlow',
            [code],
            cnRef,
          )
          return fallback?.length ? { success: true, data: fallback } : { success: false }
        })(),
      ),
      this.stockDetailOptional(
        this.stockDetailShareholders(cnRef).then(data => ({
          success: !!data?.length,
          data,
        })),
      ),
      this.stockDetailOptional(
        this.stockDetailHolderHistory(cnRef).then(history => ({
          success: history.length > 0,
          data: history,
        })),
        25000,
      ),
    ])

    const quoteRaw = quoteR
    const quote = quoteRaw ? this.enrichQuote(quoteRaw) : null
    const profileRow = enrichDetailProfileFromQuote(
      instrumentQueryData<Array<Record<string, unknown>>>(profileR)?.[0] ?? null,
      quote as Record<string, unknown> | null,
    )
    const shareholderBase = shareholdersR.data?.[0] as import('./stock-detail-normalize.js').StockDetailShareholderView | null ?? null
    const shareholders = enrichShareholderView(shareholderBase, {
      price: quote?.price ?? null,
      circulatingMarketCap: (quote as Record<string, unknown> | null)?.circulatingMarketCap as number | null
        ?? (profileRow?.circulatingMarketCap as number | null | undefined)
        ?? null,
      holderHistory: holderHistoryR.data ?? [],
    })
    const financialHistory = financialAllR.data ?? []
    const financial = financialHistory.find(row => row.reportType === 'annual')
      ?? financialHistory[0]
      ?? null
    const name = this.resolveStockName(
      code,
      cnRef.exchange ?? null,
      quote?.name,
      profileRow?.name as string | undefined,
      profileRow?.orgName as string | undefined,
    )

    return ok({
      code: buildInstrumentNamespace(cnRef),
      name,
      quote,
      profile: profileRow,
      financial,
      financialHistory,
      news: newsR.data ?? [],
      dividends: dividendR.data ?? [],
      moneyFlow: moneyFlowR.data ?? [],
      shareholders,
    }, `${name}(${code}) 详情`, t0)
  }

  private mergeQuoteWithLocal(
    code: string,
    quoteRaw: NonNullable<Awaited<ReturnType<MarketDataEngine['realtime']>>['data']>[0] | null,
  ) {
    const normalized = quoteRaw ? normalizePreOpenRealtimeQuote(quoteRaw) : null
    if (!normalized) return null
    return this.enrichQuote(normalized)
  }

  private fetchLocalChartKlines(
    _code: string,
    _safeCount: number,
    _before: string,
  ): { klines: import('@opptrix/shared').StockKline[]; hasMore: boolean } | null {
    return null
  }

  private enrichQuote(quote: NonNullable<Awaited<ReturnType<MarketDataEngine['realtime']>>['data']>[0]) {
    const price = quote.price
    const preClose = quote.preClose
    const derivedChange = price != null && preClose != null ? price - preClose : null
    const change = derivedChange ?? quote.change
    const amplitude = quote.amplitude ?? (
      quote.high != null && quote.low != null && preClose
        ? ((quote.high - quote.low) / preClose) * 100
        : null
    )
    return { ...quote, change, amplitude }
  }

  private isCnTradingDayCandidate(): boolean {
    const cn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    const day = cn.getDay()
    return day >= 1 && day <= 5
  }

  private resolveStockMarket(
    code: string,
    explicitMarket?: string | null,
    ref?: InstrumentRef | null,
  ): StockMarket {
    const normalized = normalizeCode(code)
    const parsed = parseStockMarket(explicitMarket ?? ref?.exchange)
    if (parsed) return parsed
    if (ref?.assetClass === 'INDEX') {
      return ref.exchange === 'SZ' || normalized.startsWith('399') ? 'SZ' : 'SH'
    }
    if (inferCnAssetClass(normalized) === 'INDEX') {
      return normalized.startsWith('399') ? 'SZ' : 'SH'
    }
    return this.marketData.store.stockMarket(normalized, ref?.exchange) ?? resolveStockMarketCode(normalized)
  }

  private resolveStockMarkets(codes: string[]): Map<string, StockMarket> {
    const normalized = [...new Set(codes.map(c => normalizeCode(String(c))).filter(Boolean))]
    const fromDb = this.marketData.store.stockMarketBatch(normalized)
    const out = new Map<string, StockMarket>()
    for (const code of normalized) {
      out.set(code, fromDb.get(code) ?? resolveStockMarketCode(code))
    }
    return out
  }

  private async stockRealtime(input: string | InstrumentRef, explicitMarket?: string | null) {
    const ref = resolveCnInstrumentRef(input)
    const exchange = explicitMarket ?? ref.exchange
    const finalRef = exchange && exchange !== ref.exchange
      ? normalizeInstrumentRef({ ...ref, exchange })
      : ref
    return this.de.queryInstrumentData(finalRef, 'realtime')
  }

  private async stockBatchRealtime(refs: (string | InstrumentRef)[]) {
    const normalizedRefs = refs.map(r => resolveCnInstrumentRef(r))
    const rows = await Promise.all(
      normalizedRefs.map(async ref => {
        const result = await this.stockRealtime(ref)
        const data = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(result)
        return data?.[0] ?? null
      }),
    )
    const quotes = rows.filter((row): row is NonNullable<typeof row> => row != null)
    return { success: quotes.length > 0, data: quotes }
  }

  private async resolveIntradaySessionPreClose(
    code: string,
    session: IntradayTrendSession,
    apiPreClose: number | null,
    isLatestSession: boolean,
  ): Promise<number | null> {
    if (session.preClose != null && session.preClose > 0) return session.preClose
    if (isLatestSession && apiPreClose != null && apiPreClose > 0) return apiPreClose

    const r = await this.queryCnKline(code, {
      period: 'daily',
      count: 12,
      endDate: session.sessionDate,
    })
    const rows = (instrumentQueryData<import('@opptrix/shared').StockKline[]>(r) ?? [])
      .filter(row => row.date.slice(0, 10) <= session.sessionDate)
      .sort((a, b) => a.date.localeCompare(b.date))
    const idx = rows.findIndex(row => row.date.slice(0, 10) === session.sessionDate)
    if (idx > 0) {
      const prevClose = rows[idx - 1].close
      if (prevClose != null && prevClose > 0) return prevClose
    }
    return apiPreClose != null && apiPreClose > 0 ? apiPreClose : null
  }

  private defaultChartCount(period: string): number {
    switch (period) {
      case 'intraday': return 240
      case '1m': return 480
      case '5m': return 480
      case '15m': return 320
      case '30m': return 240
      case '60m': return 240
      case '5day': return 5
      case 'weekly': return 160
      case 'monthly': return 80
      case 'year1': return 260
      case 'year3': return 780
      case 'year5': return 1300
      default: return 320
    }
  }

  private crossMarketMaxBars(period: string): number {
    switch (period) {
      case 'year5': return 1300
      case 'year3': return 780
      case 'year1': return 260
      case '5day': return 5
      default: return 800
    }
  }

  private isCrossMarketOhlcPeriod(period: string): boolean {
    return period !== 'intraday' && period !== '5day'
  }

  private async queryCrossMarketKline(
    market: 'US' | 'HK',
    symbol: string,
    period: string,
    opts: { count?: number; startDate?: string; endDate?: string },
  ) {
    const ref = { market, assetClass: 'EQUITY' as const, symbol }
    return this.de.queryInstrumentData(ref, 'kline', {
      count: opts.count ?? 120,
      period,
      startDate: opts.startDate,
      endDate: opts.endDate,
    })
  }

  private async fetchCrossMarketChartKlines(
    market: 'US' | 'HK',
    symbol: string,
    period: string,
    safeCount: number,
    before: string,
    tail: number,
  ): Promise<{ klines: StockKline[]; hasMore: boolean } | null> {
    if (!this.isCrossMarketOhlcPeriod(period)) return null

    const step = 200
    const cap = this.crossMarketMaxBars(period)

    if (before) {
      const beforeDay = before.slice(0, 10)
      const endDay = this.dayBefore(beforeDay)
      let olderR = await this.queryCrossMarketKline(market, symbol, period, {
        count: step,
        endDate: endDay,
      })
      let older = (instrumentQueryData<StockKline[]>(olderR) ?? []).filter(b => b.date.slice(0, 10) < beforeDay)
      if (!older.length) {
        olderR = await this.queryCrossMarketKline(market, symbol, period, {
          count: step,
          endDate: beforeDay,
        })
        older = (instrumentQueryData<StockKline[]>(olderR) ?? []).filter(b => b.date.slice(0, 10) < beforeDay)
      }
      const recentCount = Math.max(tail, safeCount, 240)
      const recentR = await this.queryCrossMarketKline(market, symbol, period, { count: recentCount })
      const recentData = instrumentQueryData<StockKline[]>(recentR)
      if (recentR.success && recentData?.length) {
        const merged = this.mergeKlineByTime(older, recentData, beforeDay)
        return {
          klines: merged.slice(-Math.min(cap, 800)),
          hasMore: older.length >= step,
        }
      }
      return null
    }

    const r = await this.queryCrossMarketKline(market, symbol, period, { count: safeCount })
    const data = instrumentQueryData<StockKline[]>(r)
    if (r.success && data?.length) {
      const mergeCap = Math.min(cap, 800)
      return {
        klines: data,
        hasMore: data.length >= Math.min(step, safeCount) && safeCount < mergeCap,
      }
    }
    return null
  }

  private sortChartBars<T extends { time: string }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.time.localeCompare(b.time))
  }

  private isMinutePeriod(period: string): boolean {
    return ['1m', '5m', '15m', '30m', '60m'].includes(period)
  }

  private dayBefore(timeStr: string): string {
    const day = timeStr.slice(0, 10)
    const [y, m, d] = day.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() - 1)
    const y2 = dt.getUTCFullYear()
    const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d2 = String(dt.getUTCDate()).padStart(2, '0')
    return `${y2}-${m2}-${d2}`
  }

  private mergeKlineByTime<T extends { date: string }>(older: T[], recent: T[], before: string): T[] {
    const map = new Map<string, T>()
    for (const row of older) map.set(row.date, row)
    for (const row of recent) {
      if (!before || row.date >= before) map.set(row.date, row)
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  }

  private minuteMaxBars(period: string): number {
    switch (period) {
      case '1m': return 2400
      case '5m': return 1600
      case '15m': return 1200
      case '30m':
      case '60m': return 800
      default: return 800
    }
  }

  private async fetchMinuteChartKlines(
    code: string,
    period: string,
    safeCount: number,
    before: string,
    tail: number,
    stockMarket: StockMarket,
  ): Promise<{ klines: import('@opptrix/shared').StockKline[]; hasMore: boolean } | null> {
    const step = 200
    const cap = this.minuteMaxBars(period)

    if (tail > 0) {
      const olderR = await this.de.minuteKline(code, period, step, tail, stockMarket)
      const recentR = await this.de.minuteKline(code, period, Math.min(tail, 800), 0, stockMarket)
      if (!recentR.success || !recentR.data?.length) return null
      const older = olderR.success ? (olderR.data ?? []) : []
      const anchor = before || recentR.data[0].date
      const merged = this.mergeKlineByTime(older, recentR.data, anchor).slice(-cap)
      return {
        klines: merged,
        hasMore: older.length >= step && merged.length < cap,
      }
    }

    const r = await this.de.minuteKline(code, period, Math.min(safeCount, 800), 0, stockMarket)
    if (!r.success || !r.data?.length) return null
    const klines = r.data.slice(-cap)
    const got = klines.length
    return {
      klines,
      hasMore: got < cap && (got >= safeCount * 0.9 || got >= 120),
    }
  }

  private async fetchChartKlines(
    code: string,
    period: string,
    safeCount: number,
    before: string,
    tail: number,
    stockMarket: StockMarket,
  ): Promise<{ klines: import('@opptrix/shared').StockKline[]; hasMore: boolean } | null> {
    if (this.isMinutePeriod(period)) {
      return this.fetchMinuteChartKlines(code, period, safeCount, before, tail, stockMarket)
    }

    const klinePeriod = period === 'daily' ? 'daily' : period
    const isIndex = inferCnAssetClass(normalizeCode(code)) === 'INDEX'
    const requestCount = isIndex && klinePeriod !== 'daily'
      ? Math.max(safeCount, 80)
      : safeCount
    if (before) {
      const step = 200
      const endDay = this.dayBefore(before.slice(0, 10))
      let olderR = await this.queryCnKline(code, {
        period: klinePeriod,
        count: step,
        endDate: endDay,
      })
      let older = (instrumentQueryData<import('@opptrix/shared').StockKline[]>(olderR) ?? []).filter(b => b.date < before)
      if (!older.length) {
        olderR = await this.queryCnKline(code, {
          period: klinePeriod,
          count: step,
          endDate: before.slice(0, 10),
        })
        older = (instrumentQueryData<import('@opptrix/shared').StockKline[]>(olderR) ?? []).filter(b => b.date < before)
      }
      const recentCount = Math.max(tail, safeCount, 240)
      const recentR = await this.queryCnKline(code, {
        period: klinePeriod,
        count: Math.max(recentCount, isIndex && klinePeriod !== 'daily' ? 80 : 0),
      })
      const recentData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(recentR)
      if (recentR.success && recentData?.length) {
        const merged = this.mergeKlineByTime(older, recentData, before)
        return {
          klines: merged.slice(-800),
          hasMore: older.length >= step,
        }
      }
      if (inferCnAssetClass(normalizeCode(code)) === 'INDEX') return null
      return this.fetchLocalChartKlines(code, safeCount, before)
    }

    let klineR = await this.queryCnKline(code, {
      period: klinePeriod,
      count: requestCount,
    })
    let klineData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(klineR)
    if ((!klineR.success || !klineData?.length) && klinePeriod !== 'daily') {
      klineR = await this.queryCnKline(code, {
        period: klinePeriod,
        count: Math.max(requestCount, 80),
      })
      klineData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(klineR)
    }
    if (klineR.success && klineData?.length) {
      return {
        klines: klineData,
        hasMore: klineData.length >= safeCount && safeCount < 800,
      }
    }
    if (inferCnAssetClass(normalizeCode(code)) === 'INDEX') return null
    return this.fetchLocalChartKlines(code, safeCount, before)
  }

  private async stockChart(
    code: string,
    period: string,
    count: number,
    before: string,
    tail: number,
    explicitMarket: string | undefined,
    t0: number,
  ) {
    const normalized = code.padStart(6, '0')
    const cnRef = resolveCnInstrumentRef(
      explicitMarket
        ? { market: 'CN', assetClass: 'EQUITY', symbol: normalized, exchange: explicitMarket }
        : normalized,
    )
    const cap = this.isMinutePeriod(period) ? this.minuteMaxBars(period) : 800
    const safeCount = Math.max(20, Math.min(count || this.defaultChartCount(period), cap))
    const stockMarket = this.resolveStockMarket(normalized, explicitMarket, cnRef)
    const quoteR = await this.stockRealtime(cnRef, explicitMarket)
    let quote = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(quoteR)?.[0] ?? null
    if (quote) quote = normalizePreOpenRealtimeQuote(quote)
    const preClose = quote?.preClose ?? null
    const name = this.resolveStockName(normalized, cnRef.exchange ?? quote?.name, quote?.name)

    if (period === 'intraday') {
      const trendR = await this.de.fetchIntradaySessions(code, 5, stockMarket)
      const trendData = trendR.success
        ? trendR.data as IntradayTrendFetchResult
        : null
      const today = cnTodayString()
      const session = pickIntradaySession(
        trendData?.sessions ?? [],
        today,
        shouldPreferTodayIntraday(),
      )

      if (!session?.bars.length) {
        return ok({
          code: normalized,
          name,
          period,
          preClose,
          sessionDate: null,
          isTradingDay: false,
          bars: [],
          indicators: [],
        }, `${name} 暂无分时数据`, t0)
      }

      const isLiveSession = session.sessionDate === today && shouldPreferTodayIntraday()
      const latestSessionDate = trendData?.sessions.at(-1)?.sessionDate
      const chartPreClose = await this.resolveIntradaySessionPreClose(
        normalized,
        session,
        trendData?.apiPreClose ?? null,
        session.sessionDate === latestSessionDate,
      ) ?? preClose

      const bars = session.bars.map(bar => ({
        time: bar.time,
        price: bar.price,
        volume: bar.volume,
        amount: bar.amount,
        avgPrice: bar.avgPrice,
      }))

      return ok({
        code: normalized,
        name,
        period,
        preClose: chartPreClose,
        sessionDate: session.sessionDate,
        isTradingDay: isLiveSession,
        hasMore: false,
        chart_time_zone: 'Asia/Shanghai',
        bars: this.sortChartBars(bars),
        indicators: [],
      }, `${name} 分时 ${session.sessionDate} ${bars.length} 点`, t0)
    }

    const fetched = await this.fetchChartKlines(normalized, period, safeCount, before, tail, stockMarket)
    if (!fetched?.klines.length) {
      if (isBseCode(normalized)) {
        return ok({
          code: normalized,
          name,
          period,
          preClose,
          isTradingDay: this.isCnTradingDayCandidate(),
          hasMore: false,
          bars: [],
          indicators: [],
        }, `${name} 暂无K线数据（可先同步本地行情）`, t0)
      }
      return fail('K线获取失败', t0)
    }

    const bars = this.sortChartBars(fetched.klines.map(bar => ({
      time: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
      changePct: bar.changePct,
      turnoverRate: bar.turnoverRate,
    })))

    const indicators = this.sortChartBars(computeIndicators(code, fetched.klines).map(row => ({
      time: row.date,
      ma5: row.ma5,
      ma10: row.ma10,
      ma20: row.ma20,
      ma60: row.ma60,
      rsi6: row.rsi6,
      rsi12: row.rsi12,
      macd: row.macd,
      macdSignal: row.macdSignal,
      macdHist: row.macdHist,
    })))

    let cyqLatest: ReturnType<ResearchHub['mapCyqRow']> | null = null
    let cyqProfile: { date: string; currentPrice: number; levels: { price: number; weight: number }[] } | null = null
    if (period === 'daily' || period === 'weekly' || period === 'monthly') {
      const profileRaw = computeLatestChipProfile(normalized, fetched.klines)
      if (profileRaw) {
        cyqLatest = this.mapCyqRow(profileRaw)
        cyqProfile = {
          date: profileRaw.date,
          currentPrice: profileRaw.currentPrice,
          levels: profileRaw.levels.map(level => ({ price: level.price, weight: level.weight })),
        }
      }
    }

    return ok({
      code: normalized,
      name,
      period,
      preClose,
      isTradingDay: this.isCnTradingDayCandidate(),
      hasMore: fetched.hasMore,
      chart_time_zone: 'Asia/Shanghai',
      bars,
      indicators,
      cyqLatest,
      cyqProfile,
    }, `${name} ${period} ${bars.length} 根`, t0)
  }

  private async runBacktest(params: Record<string, unknown>, t0: number) {
    const data = await this.backtest.run({
      universe: params.codes as string[] | undefined,
      factorNames: params.factors as string[] | undefined,
      scorecardName: params.scorecard as string | undefined,
      periods: Number(params.periods ?? 5),
      forwardDays: Number(params.forward_days ?? 20),
    })
    return ok(data, '回测完成', t0)
  }

  private tushareConfigSave(params: Record<string, unknown>, t0: number) {
    const current = loadTushareConfig()
    const tokenRaw = params.token
    const saved = this.de.providerCatalog.saveTushareLegacy({
      enabled: params.enabled === true,
      token: tokenRaw === undefined || tokenRaw === null
        ? current.token
        : String(tokenRaw).trim(),
    })
    this.de.clearCache()
    return ok(saved, 'Tushare 配置已保存', t0)
  }

  private async tushareTest(params: Record<string, unknown>, t0: number) {
    const token = params.token != null ? String(params.token).trim() : loadTushareConfig().token
    const result = await this.de.providerCatalog.testConnection('tushare', { token })
    return ok(result, result.ok ? result.message : `连接失败: ${result.message}`, t0)
  }

  private providerConfig(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? '')
    const pub = this.de.getProviderConfig(id)
    if (!pub) return fail(`未知数据源: ${id}`, t0)
    return ok(pub, '数据源配置', t0)
  }

  private providerConfigSave(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? '')
    try {
      const saved = this.de.saveProviderConfig(id, {
        enabled: params.enabled === undefined ? undefined : params.enabled === true,
        extra: (params.extra as Record<string, unknown> | undefined)
          ?? (params.token !== undefined ? { token: String(params.token).trim() } : undefined),
      })
      return ok(saved, '已保存', t0)
    } catch (e) {
      return fail(String(e), t0)
    }
  }

  private async providerTest(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? '')
    try {
      const result = await this.de.testProviderConnection(id, params as Record<string, unknown>)
      return ok(result, result.ok ? result.message : `连接失败: ${result.message}`, t0)
    } catch (e) {
      return fail(String(e), t0)
    }
  }

  private providerBindingOverrides(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? '')
    if (!id) return fail('provider_id 必填', t0)
    const items = this.de.listProviderBindingOverrides(id)
    return ok({ providerId: id, items }, `绑定 override ${items.length} 条`, t0)
  }

  private providerBindingOverrideSave(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? '')
    const market = String(params.market ?? '')
    const assetClass = String(params.asset_class ?? params.assetClass ?? '')
    const capability = String(params.capability ?? '')
    if (!id || !market || !assetClass || !capability) {
      return fail('provider_id / market / asset_class / capability 必填', t0)
    }
    try {
      const items = this.de.saveProviderBindingOverride(id, market, assetClass, capability, {
        enabled: params.enabled === undefined
          ? undefined
          : params.enabled === null
            ? null
            : params.enabled === true || params.enabled === 1 || params.enabled === 'true',
        priority: params.priority !== undefined
          ? (params.priority === null || params.priority === '' ? null : Number(params.priority))
          : undefined,
      })
      return ok({ providerId: id, items }, '已保存能力级优先级', t0)
    } catch (e) {
      return fail(String(e), t0)
    }
  }

  private async providerRescan(t0: number) {
    try {
      const providers = await this.de.rescanProviders()
      return ok(
        { providers, providersDir: resolveProvidersDir() },
        providers.length ? `已发现 ${providers.length} 个扩展数据源` : '未发现扩展数据源',
        t0,
      )
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private async providerUninstall(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? params.id ?? '').trim()
    if (!id) return fail('provider_id 必填', t0)
    try {
      const removed = this.de.providerLoader.uninstall(id)
      if (!removed) return fail(`未找到扩展数据源：${id}`, t0)
      this.de.clearCacheForProvider(id)
      return ok({ providerId: id }, '已移除扩展数据源', t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private async providerReload(params: Record<string, unknown>, t0: number) {
    const id = String(params.provider_id ?? params.id ?? '').trim()
    if (!id) return fail('provider_id 必填', t0)
    try {
      const record = await this.de.reloadProvider(id)
      if (!record) return fail(`无法重新加载数据源：${id}`, t0)
      return ok(record, '已重新加载', t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private providerInstalledList(t0: number) {
    const items = this.de.listInstalledProviders().map(record => ({
      providerId: record.providerId,
      version: record.version,
      title: record.title,
      installedAt: record.installedAt,
      loaded: record.loaded,
      marketGroup: record.marketGroup,
    }))
    return ok(
      { providers: items, providersDir: resolveProvidersDir() },
      items.length ? `已发现 ${items.length} 个扩展数据源` : '可将插件放入扩展目录后重新扫描',
      t0,
    )
  }

  private cnInstrumentRef(input: string | InstrumentRef): InstrumentRef {
    return resolveCnInstrumentRef(input)
  }

  /** @deprecated Use cnInstrumentRef */
  private cnEquityRef(input: string | InstrumentRef): InstrumentRef {
    return this.cnInstrumentRef(input)
  }

  private async queryEtfInstrumentData(
    params: Record<string, unknown>,
    capability: 'etf_nav' | 'etf_holdings' | 'etf_snapshot',
    t0: number,
  ) {
    const ref = resolveInstrumentFromParams(params)
    if (!ref) return fail('instrument 或 code 必填', t0)
    const labels = {
      etf_nav: 'ETF 净值',
      etf_holdings: 'ETF 持仓',
      etf_snapshot: 'ETF 快照',
    } as const
    const r = await this.de.queryInstrumentData(ref, capability)
    if (!r.success) return fail(instrumentQueryError(r, `${labels[capability]}获取失败`), t0)
    const data = instrumentQueryData(r)
    if (capability === 'etf_snapshot') return ok(data, labels[capability], t0)
    const rows = (data as unknown[]) ?? []
    return ok(rows, `${labels[capability]} ${rows.length} 条`, t0)
  }

  private async queryCnKline(
    code: string,
    opts: { period?: string; count?: number; startDate?: string; endDate?: string },
  ) {
    return this.de.queryInstrumentData(this.cnInstrumentRef(code), 'kline', {
      count: opts.count ?? 120,
      period: opts.period ?? 'daily',
      startDate: opts.startDate,
      endDate: opts.endDate,
    })
  }

  private async etfList(params: Record<string, unknown>, t0: number) {
    const code = params.code != null ? String(params.code) : ''
    const r = await this.de.queryInstrumentData(
      resolveCnInstrumentRef(code || '510300'),
      'etf_list',
      code ? { keyword: code } : {},
    )
    if (!r.success) return fail(instrumentQueryError(r, 'ETF 列表获取失败'), t0)
    const data = instrumentQueryData<unknown[]>(r) ?? []
    return ok(data, `ETF 列表 ${data.length} 条`, t0)
  }

  private async etfSnapshot(ref: InstrumentRef, t0: number) {
    return this.queryEtfInstrumentData({ instrument: ref }, 'etf_snapshot', t0)
  }

  private async localEtfList(params: Record<string, unknown>, t0: number) {
    return this.etfList(params, t0)
  }

  private async localEtfNav(code: string, params: Record<string, unknown>, t0: number) {
    return this.queryEtfInstrumentData({ ...params, code }, 'etf_nav', t0)
  }

  private async localEtfHoldings(code: string, params: Record<string, unknown>, t0: number) {
    return this.queryEtfInstrumentData({ ...params, code }, 'etf_holdings', t0)
  }

  private localEtfScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private localEtfScreen(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private async etfScorecard(ref: InstrumentRef, t0: number) {
    const card = this.marketData.etfScorecard(ref.symbol)
    if (!card) return fail('暂时无法生成 ETF 决策雷达', t0)
    const scoreHint = card.total_score != null ? ` ${card.total_score} 分` : ''
    return ok(card, `${card.name} ETF决策雷达${scoreHint}`, t0)
  }

  private etfScorecardSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private localInsightsForRef(_ref: InstrumentRef): LocalInstrumentInsights | null {
    return null
  }

  private async searchInstrumentsUnifiedHandler(
    keyword: string,
    limit: number,
    markets?: string[],
    includeLocal = true,
    t0 = Date.now(),
  ) {
    const m = markets as import('@opptrix/shared').Market[] | undefined
    const { items: rawItems, sources } = await searchInstrumentsUnified(this.de, this.marketData, {
      keyword,
      limit,
      markets: m,
      includeLocal: false,
    })
    const sourceLabel = sources.length ? sources.join('+') : 'online'
    const items = rawItems.map(h => ({
      code: h.code,
      name: h.name,
      market: h.market,
      assetClass: h.asset_class,
      exchange: h.exchange,
      instrument: h.instrument,
      refLabel: h.ref_label,
      source: h.source,
    }))
    return ok({ items, count: items.length, source: sourceLabel }, `标的搜索 ${items.length} 条`, t0)
  }

  /** @deprecated 使用 instrument_search */
  private async searchLocalInstruments(params: Record<string, unknown>, t0: number) {
    return this.instrumentSearch(params, t0)
  }

  private localInstrumentsSummary(t0: number) {
    return this.failLocalOffline(t0)
  }

  private instrumentRouteHandlers(t0: number): InstrumentRouteHandlers {
    return {
      stockDetail: ref => this.stockDetail(ref, t0),
      etfSnapshot: ref => this.etfSnapshot(ref, t0),
      usSnapshot: symbol => this.usSnapshot(symbol, t0),
      regionalSnapshot: (market, symbol) => this.regionalSnapshot(market, symbol, t0),
      cryptoSnapshot: pair => this.cryptoSnapshot(pair, t0),
      stockQuotes: refs => this.stockQuotes(refs, t0),
      usRealtime: symbol => this.usRealtime(symbol, t0),
      regionalRealtime: (market, symbol) => this.regionalRealtime(market, symbol, t0),
      cryptoRealtime: pair => this.cryptoRealtime(pair, t0),
      stockChart: (code, period, count, before, tail, market) =>
        this.stockChart(code, period, count, before, tail, market, t0),
      usKline: (symbol, period, count, before, tail) =>
        this.usKline(symbol, { count, period, before, tail }, t0),
      regionalKline: (market, symbol, period, count, before, tail) =>
        this.regionalKline(market, symbol, { count, period, before, tail }, t0),
      cryptoKline: (pair, period, count) => this.cryptoKline(pair, { count, period }, t0),
      stockCyq: ref => this.stockCyq(ref, t0),
      institutionRating: (ref, groups) => this.institutionRating(ref, groups, t0),
      institutionReport: (params, groups) => this.institutionReport(params, groups, t0),
      searchInstruments: (keyword, limit, markets, includeLocal) =>
        this.searchInstrumentsUnifiedHandler(keyword, limit, markets, includeLocal !== false, t0),
      localInsights: ref => this.localInsightsForRef(ref),
    }
  }

  private async instrumentSnapshot(params: Record<string, unknown>, t0: number) {
    return routeInstrumentSnapshot(params, this.instrumentRouteHandlers(t0))
  }

  private async instrumentQuotes(params: Record<string, unknown>, t0: number) {
    return routeInstrumentQuotes(params, this.instrumentRouteHandlers(t0))
  }

  private async instrumentChart(params: Record<string, unknown>, t0: number) {
    return routeInstrumentChart(params, this.instrumentRouteHandlers(t0))
  }

  private async instrumentSearch(params: Record<string, unknown>, t0: number) {
    return routeInstrumentSearch(params, this.instrumentRouteHandlers(t0))
  }

  private instrumentCapabilities(params: Record<string, unknown>, t0: number) {
    return routeInstrumentCapabilities(params)
  }

  private localUsScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private async localUsScreen(params: Record<string, unknown>, t0: number) {
    return this.onlineListScreen('US', params, t0)
  }

  private localCryptoScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private async localCryptoScreen(params: Record<string, unknown>, t0: number) {
    const listResp = await this.cryptoList(params, t0)
    if (!listResp.success || !listResp.data) return listResp
    const rawItems = (listResp.data as { items?: Array<Record<string, unknown>> }).items ?? []
    const keyword = params.keyword != null ? String(params.keyword).trim().toLowerCase() : ''
    const quote = params.quote != null ? String(params.quote).trim().toUpperCase() : ''
    const baseContains = params.base_contains != null ? String(params.base_contains).trim().toLowerCase() : ''
    const topN = params.top_n != null ? Number(params.top_n) : 50

    const items = rawItems.filter(row => {
      const code = String(row.code ?? '').toLowerCase()
      const name = String(row.name ?? '').toLowerCase()
      const base = String(row.base ?? code.split('/')[0] ?? '').toLowerCase()
      const rowQuote = String(row.quote ?? code.split('/')[1] ?? '').toUpperCase()
      if (keyword && !code.includes(keyword) && !name.includes(keyword)) return false
      if (quote && rowQuote !== quote) return false
      if (baseContains && !base.includes(baseContains)) return false
      return true
    }).slice(0, Math.min(Math.max(topN, 1), 200))

    return ok({
      source: 'online',
      total_universe: rawItems.length,
      passed: items.length,
      available_quotes: [...new Set(items.map(i => String(i.quote ?? 'USDT')))],
      items,
    }, `Crypto 筛选 ${rawItems.length} 对，命中 ${items.length} 对`, t0)
  }

  private async onlineListScreen(
    market: 'US' | 'HK' | 'CN',
    params: Record<string, unknown>,
    t0: number,
  ) {
    try {
      const { listInstrumentsOnline } = await import('@opptrix/a-stock-layer')
      const data = await listInstrumentsOnline(this.de, market, {
        keyword: params.keyword as string | undefined,
        topN: params.top_n != null ? Number(params.top_n) : undefined,
      })
      return ok({
        source: 'stock_index',
        total_universe: data.total_universe,
        passed: data.passed,
        items: data.items.map(item => ({
          code: item.code,
          name: item.name,
          market: item.market,
          exchange: item.exchange,
        })),
      }, `${market} 列表筛选 ${data.total_universe} 只，命中 ${data.passed} 只`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private localRegionalScreen(
    market: 'JP' | 'KR' | 'HK',
    label: string,
    params: Record<string, unknown>,
    t0: number,
  ) {
    if (market === 'HK') {
      return this.onlineListScreen('HK', params, t0)
    }
    return fail(`${label}暂不支持在线名录筛选，请直接指定代码或使用 instrument_search`, t0)
  }

  private localJpScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private async localJpScreen(params: Record<string, unknown>, t0: number) {
    return this.localRegionalScreen('JP', '日股', params, t0)
  }

  private localKrScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private async localKrScreen(params: Record<string, unknown>, t0: number) {
    return this.localRegionalScreen('KR', '韩股', params, t0)
  }

  private localHkScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private async localHkScreen(params: Record<string, unknown>, t0: number) {
    return this.localRegionalScreen('HK', '港股', params, t0)
  }

  private async searchEtfs(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const limit = params.limit != null ? Number(params.limit) : 30
    const r = await this.de.queryInstrumentData(
      resolveCnInstrumentRef('510300'),
      'etf_list',
      { keyword },
    )
    if (!r.success) return fail(instrumentQueryError(r, 'ETF 搜索失败'), t0)
    const rows = instrumentQueryData<unknown[]>(r) ?? []
    const items = rows.map(row => {
      const it = row as Record<string, unknown>
      return { code: String(it.code ?? ''), name: String(it.name ?? '') }
    })
    return ok({ items, count: items.length, source: 'online' }, `ETF 搜索 ${items.length} 条`, t0)
  }

  private async usRealtime(symbol: string, t0: number) {
    const r = await this.de.queryInstrumentData(
      { market: 'US', assetClass: 'EQUITY', symbol },
      'realtime',
    )
    if (!r.success) return fail(instrumentQueryError(r, '美股行情获取失败'), t0)
    return ok(instrumentQueryData<unknown[]>(r)?.[0] ?? null, `${symbol} 美股行情`, t0)
  }

  private async regionalRealtime(market: 'HK', symbol: string, t0: number) {
    const r = await this.de.queryInstrumentData(
      { market, assetClass: 'EQUITY', symbol },
      'realtime',
    )
    if (!r.success) return fail(instrumentQueryError(r, `${market} 行情获取失败`), t0)
    return ok(instrumentQueryData<unknown[]>(r)?.[0] ?? null, `${symbol} ${market} 行情`, t0)
  }

  private mapCrossMarketKlineItems(
    items: Record<string, unknown>[],
    symbol: string,
  ): StockKline[] {
    return items.map(row => ({
      code: String(row.code ?? symbol),
      date: String(row.date ?? row.time ?? ''),
      open: Number(row.open ?? row.close ?? row.price ?? 0),
      close: Number(row.close ?? row.price ?? row.open ?? 0),
      high: Number(row.high ?? row.close ?? row.price ?? 0),
      low: Number(row.low ?? row.close ?? row.price ?? 0),
      volume: Number(row.volume ?? 0),
      amount: Number(row.amount ?? 0),
      changePct: row.changePct != null
        ? Number(row.changePct)
        : row.change_pct != null
          ? Number(row.change_pct)
          : null,
      turnoverRate: row.turnoverRate != null
        ? Number(row.turnoverRate)
        : row.turnover_rate != null
          ? Number(row.turnover_rate)
          : null,
    })).filter(row => row.date)
  }

  private mapCrossMarketChartIndicators(code: string, klines: StockKline[]) {
    return this.sortChartBars(computeIndicators(code, klines).map(row => ({
      time: row.date,
      ma5: row.ma5,
      ma10: row.ma10,
      ma20: row.ma20,
      ma60: row.ma60,
      rsi6: row.rsi6,
      rsi12: row.rsi12,
      macd: row.macd,
      macdSignal: row.macdSignal,
      macdHist: row.macdHist,
    })))
  }

  private async crossMarketKlineChart(
    market: 'US' | 'HK',
    symbol: string,
    period: string,
    count: number,
    before: string,
    tail: number,
    t0: number,
  ) {
    const ref = { market, assetClass: 'EQUITY' as const, symbol }
    const cap = this.crossMarketMaxBars(period)
    const safeCount = Math.max(20, Math.min(count || this.defaultChartCount(period), cap))
    let preClose: number | null = null
    let sessionDate: string | null = null
    let isTradingDay = false
    const chartTimeZone = crossMarketChartTimeZone(market)

    if (period === 'intraday') {
      const r = await this.de.queryInstrumentData(ref, 'kline', { count: safeCount, period })
      if (!r.success) {
        return fail(instrumentQueryError(r, `${market === 'US' ? '美股' : '港股'} K 线获取失败`), t0)
      }
      let items = instrumentQueryData<Record<string, unknown>[]>(r) ?? []
      const qR = await this.de.queryInstrumentData(ref, 'realtime')
      const quote = instrumentQueryData<Record<string, unknown>[]>(qR)?.[0]
      preClose = quote?.preClose != null ? Number(quote.preClose) : null
      if (preClose == null || !Number.isFinite(preClose)) {
        preClose = quote?.pre_close != null ? Number(quote.pre_close) : null
      }
      const minuteKlines = this.mapCrossMarketKlineItems(items, symbol)
      sessionDate = intradaySessionDateFromKlines(minuteKlines)
      isTradingDay = sessionDate ? isCrossMarketTradingDay(market, sessionDate) : false
      items = minuteKlines.length ? minuteKlinesToIntradayItems(market, minuteKlines) : []
      return ok(
        {
          symbol,
          period,
          items,
          indicators: [],
          count: items.length,
          preClose,
          pre_close: preClose,
          session_date: sessionDate,
          is_trading_day: isTradingDay,
          hasMore: false,
          chart_time_zone: chartTimeZone,
        },
        `分时 ${items.length} 点`,
        t0,
      )
    }

    if (period === '5day') {
      const r = await this.de.queryInstrumentData(ref, 'kline', { count: safeCount, period })
      if (!r.success) {
        return fail(instrumentQueryError(r, `${market === 'US' ? '美股' : '港股'} K 线获取失败`), t0)
      }
      let items = instrumentQueryData<Record<string, unknown>[]>(r) ?? []

      if (market === 'HK' && isHkFdaysPayload(items)) {
        const fdaysItems = hkFdaysToIntradayItems(market, items as import('@opptrix/a-stock-layer').HkFdaysDay[])
        const latestDay = [...items]
          .map(row => String(row.date ?? '').slice(0, 10))
          .filter(Boolean)
          .sort()
          .at(-1) ?? null
        return ok(
          {
            symbol,
            period,
            items: fdaysItems,
            indicators: [],
            count: fdaysItems.length,
            preClose,
            pre_close: preClose,
            session_date: latestDay,
            is_trading_day: latestDay ? isCrossMarketTradingDay(market, latestDay) : false,
            hasMore: false,
            chart_time_zone: chartTimeZone,
          },
          `五日 ${fdaysItems.length} 点`,
          t0,
        )
      }

      const klines = items.length ? this.mapCrossMarketKlineItems(items, symbol) : []
      const indicators = klines.length ? this.mapCrossMarketChartIndicators(symbol, klines) : []
      return ok(
        {
          symbol,
          period,
          items,
          indicators,
          count: items.length,
          preClose,
          pre_close: preClose,
          hasMore: false,
          chart_time_zone: chartTimeZone,
        },
        `K 线 ${items.length} 根`,
        t0,
      )
    }

    const fetched = await this.fetchCrossMarketChartKlines(
      market,
      symbol,
      period,
      safeCount,
      before,
      tail,
    )
    if (!fetched?.klines.length) {
      return fail(`${market === 'US' ? '美股' : '港股'} K 线获取失败`, t0)
    }

    const items = fetched.klines.map(row => ({
      code: row.code,
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      amount: row.amount,
      changePct: row.changePct,
      turnoverRate: row.turnoverRate,
    }))
    const indicators = this.mapCrossMarketChartIndicators(symbol, fetched.klines)
    return ok(
      {
        symbol,
        period,
        items,
        indicators,
        count: items.length,
        preClose,
        pre_close: preClose,
        hasMore: fetched.hasMore,
        chart_time_zone: chartTimeZone,
      },
      `K 线 ${items.length} 根`,
      t0,
    )
  }

  private async regionalKline(
    market: 'HK',
    symbol: string,
    params: Record<string, unknown>,
    t0: number,
  ) {
    const count = params.count != null ? Number(params.count) : 180
    const period = String(params.period ?? 'daily')
    const before = String(params.before ?? '')
    const tail = params.tail != null ? Number(params.tail) : 0
    return this.crossMarketKlineChart('HK', symbol, period, count, before, tail, t0)
  }

  private async regionalSnapshot(market: 'HK', symbol: string, t0: number) {
    return this.crossMarketStockDetail(market, symbol, t0)
  }

  private async usKline(symbol: string, params: Record<string, unknown>, t0: number) {
    const count = params.count != null ? Number(params.count) : 180
    const period = String(params.period ?? 'daily')
    const before = String(params.before ?? '')
    const tail = params.tail != null ? Number(params.tail) : 0
    return this.crossMarketKlineChart('US', symbol, period, count, before, tail, t0)
  }

  private async usProfile(symbol: string, t0: number) {
    const r = await this.de.queryInstrumentData(
      { market: 'US', assetClass: 'EQUITY', symbol },
      'profile',
    )
    if (!r.success) return fail(instrumentQueryError(r, '美股概况获取失败'), t0)
    return ok(instrumentQueryData<unknown[]>(r)?.[0] ?? null, `${symbol} 概况`, t0)
  }

  private async usFinancials(symbol: string, params: Record<string, unknown>, t0: number) {
    const reportType = params.report_type != null ? String(params.report_type) : 'annual'
    const r = await this.de.queryInstrumentData(
      { market: 'US', assetClass: 'EQUITY', symbol },
      'financials',
      { reportDate: String(params.report_date ?? ''), reportType },
    )
    if (!r.success) return fail(instrumentQueryError(r, '美股财报获取失败'), t0)
    const items = instrumentQueryData<unknown[]>(r) ?? []
    return ok({ symbol, items, count: items.length }, `财报 ${items.length} 期`, t0)
  }

  private async crossMarketStockDetail(market: 'US' | 'HK', symbol: string, t0: number) {
    const ref: InstrumentRef = { market, assetClass: 'EQUITY', symbol }
    const snapshotR = await this.de.queryInstrumentData(ref, 'snapshot')
    const snap = instrumentQueryData<Record<string, unknown>>(snapshotR)

    const profileMethod = market === 'US' ? 'tencentUsStockProfile' : 'tencentHkStockProfile'
    const financialMethod = market === 'US' ? 'tencentUsFinancialSummary' : 'tencentHkStockFinancialReport'

    const relatedMethod = market === 'US' ? 'tencentUsRelatedStocks' : 'tencentHkRelatedStocks'

    const [
      profileR,
      noticeR,
      articleR,
      financialR,
      balanceR,
      dividendR,
      shareholderR,
      reviewR,
      quoteEnrichR,
      relatedR,
      seniorTradesR,
      technicalR,
    ] = await Promise.all([
      this.stockDetailOptional(
        (async () => {
          const engineR = await this.de.queryInstrumentData(ref, 'profile')
          const engineRows = instrumentQueryData<Array<Record<string, unknown>>>(engineR)
          if (engineR.success && engineRows?.length) {
            return { success: true as const, data: engineRows }
          }
          return this.callDetailProviderMethod<Record<string, unknown>>(
            ['tencent'], profileMethod, formatProviderMethodArgs('tencent', profileMethod, ref),
          ).then(rows => ({ success: !!rows?.length, data: rows }))
        })(),
      ),
      this.stockDetailOptional(
        this.de.queryInstrumentData(ref, 'notices', { page: 1, pageSize: 30 }).then(r => {
          const data = instrumentQueryData<Record<string, unknown>[]>(r)
          return { success: r.success && !!(data?.length), data }
        }),
      ),
      this.stockDetailOptional(
        this.de.queryInstrumentData(ref, 'news', { page: 1, pageSize: 30 }).then(r => {
          const data = instrumentQueryData<Record<string, unknown>[]>(r)
          return { success: r.success && !!(data?.length), data }
        }),
      ),
      this.stockDetailOptional(
        this.callDetailProviderMethod<Record<string, unknown>>(
          ['tencent'],
          financialMethod,
          formatProviderMethodArgs(
            'tencent',
            financialMethod,
            ref,
            market === 'US' ? [1, 8] : ['income', 'all', 4],
          ),
        ).then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      market === 'HK'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(
            ['tencent'],
            'tencentHkStockFinancialReport',
            formatProviderMethodArgs('tencent', 'tencentHkStockFinancialReport', ref, ['balance', 'all', 4]),
          ).then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'HK'
        ? this.stockDetailOptional(
          this.de.queryInstrumentData(ref, 'dividend', { page: 1, pageSize: 10 }).then(r => {
            const data = instrumentQueryData<Record<string, unknown>[]>(r)
            return { success: r.success && !!(data?.length), data }
          }),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'US'
        ? this.stockDetailOptional(
          this.de.queryInstrumentData(ref, 'shareholders', { page: 1 }).then(r => {
            const data = instrumentQueryData<Record<string, unknown>[]>(r)
            return { success: r.success && !!(data?.length), data }
          }),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'HK'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(
            ['tencent'],
            'tencentHkReviewProspect',
            formatProviderMethodArgs('tencent', 'tencentHkReviewProspect', ref),
          ).then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'US'
        ? this.stockDetailOptional(
          (async () => {
            const engineR = await this.de.queryInstrumentData(ref, 'realtime')
            const row = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(engineR)?.[0]
            if (row) return { success: true as const, data: [row as unknown as Record<string, unknown>] }
            return this.callDetailProviderMethod<Record<string, unknown>>(
              ['tencent'],
              'tencentUsStockQuote',
              formatProviderMethodArgs('tencent', 'tencentUsStockQuote', ref),
            ).then(rows => ({ success: !!rows?.length, data: rows }))
          })(),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      this.stockDetailOptional(
        this.callDetailProviderMethod<Record<string, unknown>>(
          ['tencent'], relatedMethod, formatProviderMethodArgs('tencent', relatedMethod, ref),
        ).then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      market === 'US'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(
            ['tencent'],
            'tencentUsSeniorTrades',
            formatProviderMethodArgs('tencent', 'tencentUsSeniorTrades', ref, [1, 15]),
          ).then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'HK'
        ? this.stockDetailOptional(
          this.de.queryInstrumentData(ref, 'technical_analysis').then(r => {
            const data = instrumentQueryData<Record<string, unknown>[]>(r)
            return { success: r.success && !!(data?.length), data }
          }),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
    ])

    const profileRaw = profileR.data?.[0] ?? null
    const profile = profileRaw
      ? (market === 'US'
        ? normalizeUsTencentProfile(symbol, profileRaw)
        : normalizeHkTencentProfile(symbol, profileRaw))
      : (snap?.profile as Record<string, unknown> | null) ?? null

    const notices = normalizeCrossMarketNotices(symbol, noticeR.data?.[0] ?? null)
    const articles = normalizeCrossMarketArticles(symbol, articleR.data?.[0] ?? null)
    const quote = mergeCrossMarketQuote(
      (snap?.quote ?? null) as Record<string, unknown> | null,
      quoteEnrichR.data?.[0] ?? null,
    )

    const financialHistory = market === 'US'
      ? normalizeUsFinancialHistory(symbol, financialR.data?.[0] ?? null)
      : normalizeHkFinancialHistory(
        symbol,
        financialR.data?.[0] ?? null,
        balanceR.data?.[0] ?? null,
      )

    const dividends = market === 'HK'
      ? normalizeHkDividends(symbol, dividendR.data?.[0] ?? null)
      : []

    const shareholders = market === 'US'
      ? normalizeUsShareholders(symbol, shareholderR.data?.[0] ?? null)
      : null

    const reviewRow = reviewR.data?.[0] as { review?: string | null; prospect?: string | null } | undefined
    const reviewProspect = reviewRow
      ? { review: reviewRow.review ?? null, prospect: reviewRow.prospect ?? null }
      : null

    const relatedStocks = normalizeCrossMarketRelatedStocks(market, relatedR.data?.[0] ?? null)
    const seniorTrades = market === 'US'
      ? normalizeUsSeniorTrades(symbol, seniorTradesR.data?.[0] ?? null)
      : []
    const tradingDistribution = market === 'HK'
      ? normalizeHkTradingDistribution(symbol, technicalR.data?.[0] ?? null)
      : null

    const payload = buildCrossMarketDetailPayload(market, symbol, snap ?? null, {
      profile,
      quote,
      notices,
      articles,
      financialHistory,
      dividends,
      shareholders,
      reviewProspect,
      relatedStocks,
      seniorTrades,
      tradingDistribution,
    })

    if (!payload.quote && !payload.profile && !(payload.recentKlines as unknown[])?.length
      && !notices.length && !articles.length) {
      return fail(`${market === 'US' ? '美股' : '港股'}详情获取失败`, t0)
    }

    return ok(payload, `${market === 'US' ? '美股' : '港股'}详情`, t0)
  }

  private async usSnapshot(symbol: string, t0: number) {
    return this.crossMarketStockDetail('US', symbol, t0)
  }

  private async usStockList(params: Record<string, unknown>, t0: number) {
    const { listInstrumentsOnline } = await import('@opptrix/a-stock-layer')
    const limit = params.limit != null ? Number(params.limit) : 5000
    const data = await listInstrumentsOnline(this.de, 'US', {
      keyword: params.keyword != null ? String(params.keyword) : undefined,
      topN: Math.min(limit, 200),
    })
    const items = data.items.map(hit => ({
      code: hit.code,
      name: hit.name ?? hit.code,
      market: hit.market,
    }))
    return ok({ items, count: items.length, source: 'stock_index' }, `美股列表 ${items.length} 条`, t0)
  }

  private async localUsList(params: Record<string, unknown>, t0: number) {
    return this.usStockList(params, t0)
  }

  private async searchUsStocks(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const limit = params.limit != null ? Number(params.limit) : 30
    const { searchInstrumentsOnline } = await import('@opptrix/a-stock-layer')
    const hits = await searchInstrumentsOnline(this.de, keyword, limit, ['US'])
    const items = hits.map(hit => ({
      code: hit.code,
      name: hit.name ?? hit.code,
      market: hit.market,
    }))
    const source = hits[0]?.source === 'tencent' ? 'tencent' : 'stock_index'
    return ok({ items, count: items.length, source }, `美股搜索 ${items.length} 条`, t0)
  }

  private async cryptoRealtime(pair: string, t0: number) {
    const r = await this.de.queryInstrumentData(cryptoRefFromPair(pair), 'realtime')
    if (!r.success) return fail(instrumentQueryError(r, 'Crypto 行情获取失败'), t0)
    return ok(instrumentQueryData<unknown[]>(r)?.[0] ?? null, `${pair} 行情`, t0)
  }

  private async cryptoKline(pair: string, params: Record<string, unknown>, t0: number) {
    const count = params.count != null ? Number(params.count) : 180
    const period = String(params.period ?? 'daily')
    const r = await this.de.queryInstrumentData(cryptoRefFromPair(pair), 'kline', { count, period })
    if (!r.success) return fail(instrumentQueryError(r, 'Crypto K 线获取失败'), t0)
    const items = instrumentQueryData<unknown[]>(r) ?? []
    return ok({ pair, items, count: items.length }, `K 线 ${items.length} 根`, t0)
  }

  private async cryptoSnapshot(pair: string, t0: number) {
    const r = await this.de.queryInstrumentData(cryptoRefFromPair(pair), 'snapshot')
    if (!r.success) return fail('Crypto 快照获取失败', t0)
    return ok(instrumentQueryData(r), 'Crypto 快照', t0)
  }

  private async cryptoList(params: Record<string, unknown>, t0: number) {
    const keyword = params.keyword != null ? String(params.keyword) : ''
    const r = await this.de.queryInstrumentData(
      { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'BTC', quote: 'USDT' },
      'stock_list',
      { keyword },
    )
    if (!r.success) return fail(instrumentQueryError(r, 'Crypto 列表获取失败'), t0)
    const items = instrumentQueryData<unknown[]>(r) ?? []
    return ok({ items, count: items.length }, `Crypto 列表 ${items.length} 条`, t0)
  }

  private async localCryptoList(params: Record<string, unknown>, t0: number) {
    return this.cryptoList(params, t0)
  }

  private async searchCryptoPairs(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const r = await this.de.queryInstrumentData(
      { market: 'CRYPTO', assetClass: 'CRYPTO_SPOT', symbol: 'BTC', quote: 'USDT' },
      'stock_list',
      { keyword },
    )
    if (!r.success) return fail(instrumentQueryError(r, 'Crypto 搜索失败'), t0)
    const items = (instrumentQueryData<unknown[]>(r) ?? []).map(raw => {
      const row = raw as { code?: string; name?: string; market?: string }
      return {
        code: String(row.code ?? ''),
        name: String(row.name ?? row.code ?? ''),
        market: row.market ?? 'CRYPTO',
      }
    })
    return ok({ items, count: items.length, source: 'online' }, `Crypto 搜索 ${items.length} 条`, t0)
  }

  private async strategyReport(code: string, t0: number) {
    const text = await generateStrategyReport(this.de, code)
    return ok({ code, report_type: 'strategy_report', text }, 'T策略分析报告', t0)
  }

  private async portfolioTrades(code: string, market: string | undefined, t0: number) {
    const trades = this.de.portfolio.trades(code, market as import('@opptrix/shared').Market | undefined)
    return ok({ trades, count: trades.length }, `交易记录 ${trades.length} 条`, t0)
  }

  private async portfolioHoldings(t0: number) {
    const holdings = await this.de.portfolio.holdings(true)
    return ok({ holdings, count: holdings.length }, `当前持仓 ${holdings.length} 只`, t0)
  }

  private async portfolioSummary(t0: number) {
    const summary = await this.de.portfolio.summary(true)
    return ok(summary, `持仓 ${summary.holdingsCount} 只`, t0)
  }

  private watchlistList(t0: number) {
    const items = this.de.watchlist.list()
    return ok({ items, count: items.length }, `关注列表 ${items.length} 只`, t0)
  }

  private watchlistSave(params: Record<string, unknown>, t0: number) {
    const items = Array.isArray(params.items) ? params.items as import('@opptrix/a-stock-layer').WatchlistItem[] : []
    const saved = this.de.watchlist.replace(items)
    return ok({ items: saved, count: saved.length }, `已保存关注 ${saved.length} 只`, t0)
  }

  private async latestEvaluation(code: string, params: Record<string, unknown>, t0: number) {
    const ref = resolveInstrumentFromParams(params)
      ?? (isLikelyCnEquityInput(code)
        ? { market: 'CN' as const, assetClass: 'EQUITY' as const, symbol: code }
        : null)
    if (!ref) {
      return fail('无法识别标的', t0)
    }
    const gate = gateInstrumentAnalytics(ref, 'evaluation')
    if (gate.status === 'not_supported') {
      return fail(gate.reason ?? '该市场暂不支持因子评估', t0)
    }
    const evalCode = ref.symbol || code
    const scorecardName = String(params.scorecard ?? 'G=B+M')
    const force = params.force === true

    const stored = !force ? this.store.getLatest(evalCode) : null
    if (stored && stored.scorecardName === scorecardName) {
      const card = createScorecard(scorecardName)
      const gbm = computeGbmBreakdown(stored.dimensionScores, scorecardName)
      return ok({
        code: stored.code,
        name: stored.name,
        timestamp: stored.timestamp,
        scorecard: stored.scorecardName,
        total_score: stored.totalScore,
        factors: stored.factorValues,
        scorecard_dimensions: card.factors.map(({ name, weight }) => ({
          name,
          weight,
          score: stored.dimensionScores[`${name}_score`] ?? 0,
        })),
        gbm,
        from_store: true,
      }, '最新评估（缓存）', t0)
    }

    const snap = await this.ee.analyze(evalCode)
    const card = createScorecard(scorecardName)
    await this.neutralizer.compute([snap as never])
    card.score([snap])
    this.store.save(snap, scorecardName)

    const gbm = computeGbmBreakdown(snap.scores, scorecardName)
    return ok({
      code: snap.code,
      name: snap.name,
      timestamp: new Date().toISOString(),
      scorecard: scorecardName,
      total_score: snap.totalScore,
      factors: Object.fromEntries(
        Object.entries(snap.factors).map(([k, v]) => [k, v?.value ?? null]),
      ),
      scorecard_dimensions: card.factors.map(({ name, weight }) => ({
        name,
        weight,
        score: snap.scores[`${name}_score`] ?? 0,
      })),
      gbm,
      from_store: false,
    }, `${snap.name} ${scorecardName} ${snap.totalScore}`, t0)
  }
}

export { ResearchHub as default }
