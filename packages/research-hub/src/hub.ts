import { MarketDataEngine, computeIndicators, computeLatestChipProfile, computeChipDistribution, isMissingLivePrice, normalizeCode, normalizePreOpenRealtimeQuote,
  parseCryptoPair,
  pickIntradaySession, parseStockMarket, resolveMarket, resolveStockMarketCode,
  loadTushareConfig, saveTushareConfig, isBseCode, isCnEtfCode,
  cnTodayString, shouldPreferTodayIntraday, type StockMarket,
  type NewsItem, type MoneyFlow, type Dividend,
} from '@opptrix/a-stock-layer'
import { resolveProvidersDir } from '@opptrix/shared'
import type { IntradayTrendFetchResult, IntradayTrendSession } from '@opptrix/a-stock-layer'
import type { StockListItem, FinancialSummary } from '@opptrix/shared'
import { ConsolidatedEngine, formatInstitutionReport } from '@opptrix/institutions'
import { ClosingReport, IndustryMining, MorningBrief, mermaidIndustryChain } from '@opptrix/skills'
import {
  EvaluationEngine, createScorecard, Screener, PortfolioAnalyzer,
  REGISTRY, BacktestEngine, SnapshotStore, IndustryNeutralizer,
  computeGbmBreakdown,
} from '@opptrix/stock-eval'
import { getMarketDataService } from '@opptrix/market-data-store'
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
  normalizeInstrumentHubParams,
  instrumentRefsFromList,
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
    // 本地离线市场库已停用，不再自动同步
  }

  /** @deprecated Use initMarketDataAutoSync */
  initMarketDataAutoResume(): void {
    this.initMarketDataAutoSync()
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
          const code = ref?.symbol ?? String(params.code ?? '')
          return this.trendBrief(code, params, t0)
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
        case 'portfolio_trades': return this.portfolioTrades(String(params.code ?? ''), t0)
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
          const code = String(params.code ?? '').trim()
          const ref = resolveInstrumentFromParams({ ...params, code, market: 'CN' })
            ?? (code ? { market: 'CN' as const, assetClass: 'ETF' as const, symbol: code } : null)
          if (!ref) return fail('code 必填', t0)
          return this.dispatchInstrumentCapability('snapshot', { ...params, instrument: ref }, t0)
        }
        case 'etf_nav': return this.etfNav(String(params.code ?? ''), t0)
        case 'etf_holdings': return this.etfHoldings(String(params.code ?? ''), t0)
        case 'local_etf_list': return await this.localEtfList(params, t0)
        case 'local_etf_nav': return await this.localEtfNav(String(params.code ?? ''), params, t0)
        case 'local_etf_holdings': return await this.localEtfHoldings(String(params.code ?? ''), params, t0)
        case 'local_etf_screen_schema': return this.localEtfScreenSchema(t0)
        case 'local_etf_screen': return this.localEtfScreen(params, t0)
        case 'etf_scorecard': return this.etfScorecard(String(params.code ?? ''), t0)
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

  private async stockDiagnosis(code: string, scorecardName: string, t0: number) {
    const snap = await this.ee.analyze(code)
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
      code: snap.code, name: snap.name, total_score: snap.totalScore,
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

  private async institutionRating(code: string, groups: string[] | undefined, t0: number) {
    const data = await this.institutions.evaluate(code, groups)
    return ok(serializeInstitutionData(data as unknown as Record<string, unknown>), `${data.name} 机构共识 ${data.consensus_rating_cn}`, t0)
  }

  private async institutionReport(code: string, groups: string[] | undefined, t0: number) {
    const data = await this.institutions.evaluate(code, groups)
    const text = formatInstitutionReport(data)
    return ok({ code, name: data.name, report_type: 'institution_rating', text },
      `${data.name} 机构评级报告`, t0)
  }

  private async screening(params: Record<string, unknown>, t0: number) {
    const conditions = (params.conditions ?? []) as { factor: string; op: string; value: number }[]
    const scorecard = String(params.scorecard ?? '综合评估')
    const topN = Number(params.top_n ?? 20)

    const data = await this.screener.run(conditions as never[], scorecard, topN)
    return ok({
      total_scanned: data.totalScanned, passed: data.passed, scorecard: data.scorecard,
      source: 'live',
      items: data.items.map(i => ({ code: i.code, name: i.name, total_score: i.total_score, key_factors: i.key_factors })),
    }, `在线扫描 ${data.totalScanned} 通过 ${data.passed}`, t0)
  }

  private failLocalOffline(t0: number, hint?: string) {
    return fail(hint ?? '本地离线数据已停用，请使用 instrument_search、instrument_evaluation、instrument_chart 等在线能力', t0)
  }

  private marketDbStatus(t0: number) {
    return this.failLocalOffline(t0)
  }

  private marketDbSyncState(t0: number) {
    return this.failLocalOffline(t0)
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
    void params
    return this.failLocalOffline(t0)
  }

  private marketIndustryStats(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private marketIndustryStocks(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private localIndustryList(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private localIndustryScreen(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
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
      cnFactorEvaluation: async ref => this.stockDiagnosis(ref.symbol, '综合评估', t0),
      cnEtfEvaluation: async ref => this.etfScorecard(ref.symbol, t0),
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
        cnFactorEvaluation: async r => this.stockDiagnosis(r.symbol, scorecard, t0),
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

  private async trendBrief(code: string, params: Record<string, unknown>, t0: number) {
    const normalized = normalizeCode(code)
    let klines = this.marketData.localDailyKlines(normalized, 280)
    if (klines.length < 30) {
      const kl = await this.de.queryInstrumentData(
        this.cnEquityRef(normalized),
        'kline',
        { count: 280 },
      )
      const klData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(kl)
      if (kl.success && klData?.length) klines = klData
    }
    if (klines.length < 20) {
      return fail('K 线数据不足，请先同步本地行情后再查看趋势研判', t0)
    }

    const indexKlines = this.marketData.localDailyKlines('000300', 280)
    const quoteR = await this.stockRealtime(normalized)
    const quote = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(quoteR)?.[0] ?? null
    const name = this.resolveStockName(normalized, quote?.name)

    const holdingCost = Number(params.holding_cost)
    const brief = buildTrendBrief({
      code: normalized,
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
    ...candidates: Array<string | null | undefined>
  ): string {
    const normalized = normalizeCode(code)
    const cached = this.stockNameCache.get(normalized)
    if (cached && cached !== normalized) return cached
    for (const c of candidates) {
      if (c && c.trim() && c.trim() !== normalized) {
        this.stockNameCache.set(normalized, c.trim())
        return c.trim()
      }
    }
    const local = this.marketData.store.stockMeta(normalized)
    if (local?.name && local.name !== normalized) {
      this.stockNameCache.set(normalized, local.name)
      return local.name
    }
    const stored = this.store.getLatest(normalized)
    if (stored?.name && stored.name !== normalized) {
      this.stockNameCache.set(normalized, stored.name)
      return stored.name
    }
    return normalized
  }

  private async fillMissingStockNames(_codes: string[]): Promise<void> {
    // 名称由在线行情回填，不再读本地 universe
  }

  private async stockQuotes(codes: string[] | undefined, t0: number) {
    const normalized = [...new Set((codes ?? []).map(c => String(c).padStart(6, '0')).filter(Boolean))]
    if (!normalized.length) return ok({ quotes: [] }, '暂无关注', t0)
    await this.fillMissingStockNames(normalized)
    const batch = await this.stockBatchRealtime(normalized)
    const byCode = new Map(
      (batch.data ?? []).map(q => [normalizeCode(q.code), q]),
    )
    const quotes = normalized
      .map(code => this.mergeQuoteWithLocal(code, byCode.get(code) ?? null))
      .filter((q): q is NonNullable<ReturnType<ResearchHub['mergeQuoteWithLocal']>> => q != null)
    if (!quotes.length) return fail('行情获取失败', t0)
    return ok({ quotes }, `更新 ${quotes.length} 只`, t0)
  }

  /** Lightweight batch insights for watchlist rows — prefers local market DB, then SnapshotStore. */
  private async watchlistRadar(codes: string[] | undefined, t0: number) {
    const sourceCodes = codes?.length ? codes : this.de.watchlist.codes()
    const normalized = [...new Set(
      sourceCodes
        .map(c => String(c).trim())
        .filter(c => c && isLikelyCnEquityInput(c))
        .map(c => normalizeCode(c)),
    )]
    if (!normalized.length) return ok({ items: [] as WatchlistRadarItem[] }, '暂无 A 股关注', t0)

    await this.fillMissingStockNames(normalized)

    const quoteByCode = new Map<string, { name?: string; pe?: number | null; pb?: number | null }>()
    try {
      const batch = await this.stockBatchRealtime(normalized)
      for (const q of batch.data ?? []) {
        quoteByCode.set(normalizeCode(q.code), q)
      }
    } catch {
      // fallback per-code inside buildWatchlistRadarItem
    }

    const items = await Promise.all(
      normalized.map(code => this.buildWatchlistRadarItem(code, undefined, quoteByCode.get(code))),
    )
    return ok({ items }, `雷达 ${items.length} 只`, t0)
  }

  private async buildWatchlistRadarItem(
    code: string,
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
    const stored = this.store.getLatest(code)
    const factors = stored?.factorValues ?? {}
    try {
      const quoteR = cachedQuote
        ? { success: true, data: [cachedQuote] }
        : await this.stockRealtime(code)
      const flowR = await this.de.moneyFlow(code)
      const quote = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(quoteR)?.[0]
      const flow = flowR.data?.[0]
      return {
        code,
        name: this.resolveStockName(code, quote?.name, local?.name, stored?.name),
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
        code,
        name: this.resolveStockName(code, local?.name, stored?.name),
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

  private async stockKline(code: string, count: number, t0: number) {
    const safeCount = Math.max(20, Math.min(count, 240))
    const result = await this.de.queryInstrumentData(this.cnEquityRef(code), 'kline', { count: safeCount })
    if (!result.success) return fail(instrumentQueryError(result, 'K线获取失败'), t0)
    const klines = instrumentQueryData<import('@opptrix/shared').StockKline[]>(result) ?? []
    return ok({ code, klines }, `${code} K线 ${klines.length} 根`, t0)
  }

  private async stockCyq(code: string, t0: number) {
    const normalized = code.padStart(6, '0')
    const klineR = await this.de.queryInstrumentData(this.cnEquityRef(normalized), 'kline', { count: 320 })
    const klines = instrumentQueryData<import('@opptrix/shared').StockKline[]>(klineR) ?? []
    if (!klines.length) {
      return fail('K线不足，无法计算筹码分布', t0)
    }
    const rows = computeChipDistribution(normalized, klines, 90)
    if (!rows.length) return fail('筹码分布计算失败', t0)
    const latest = rows[rows.length - 1]!
    return ok({
      code: normalized,
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
  ): Promise<T[] | null> {
    for (const pid of providerIds) {
      const driver = this.de.registry.get(pid) as Record<string, unknown> | undefined
      if (!driver) continue
      const fn = driver[method] as ((...a: unknown[]) => Promise<T[] | null>) | undefined
      if (typeof fn !== 'function') continue
      try {
        const data = await fn.apply(driver, args)
        if (data?.length) return data
      } catch {
        continue
      }
    }
    return null
  }

  private async stockDetailNotices(code: string): Promise<NewsItem[]> {
    const limit = 30
    const merged: NewsItem[] = []
    for (const pid of ['tencent', 'sinafinance']) {
      const rows = await this.callDetailProviderMethod<NewsItem>(
        [pid],
        'news',
        [code, 1, limit, 'notice'],
      )
      if (rows) merged.push(...rows)
    }
    if (merged.length) return dedupeStockNewsItems(merged).slice(0, limit)
    const fallback = await this.de.news(code, 1, limit, 'notice')
    return fallback.data ?? []
  }

  private async stockDetailShareholders(code: string) {
    const raw = await this.callDetailProviderMethod<Record<string, unknown>>(
      ['sinafinance', 'tushare'],
      'shareholders',
      [code],
    )
    const rows = raw ?? (await this.de.shareholders(code)).data ?? null
    const normalized = normalizeShareholderPayload(code, rows)
    return normalized ? [normalized] : null
  }

  private async stockDetailHolderHistory(code: string) {
    const rows = await this.callDetailProviderMethod<Record<string, unknown>>(
      ['tushare'],
      'shareholderNumbers',
      [code],
    )
    return holderHistoryFromRows(rows)
  }

  /** 详情页行情：腾讯补全 PE/PB/量比/市值，fallback 保留准确 OHLCV/成交量 */
  private async stockDetailQuote(code: string) {
    const [preferred, fallbackR] = await Promise.all([
      this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'realtime', [code]),
      this.de.queryInstrumentData(this.cnEquityRef(code), 'realtime'),
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
  private async stockDetailProfile(code: string): Promise<Record<string, unknown> | null> {
    const [
      industryRankR,
      platesR,
      institutionRatingR,
      executivesR,
      indexMembershipR,
    ] = await Promise.all([
      this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentIndustryRank', [code]),
      this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentStockPlates', [code]),
      this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentInstitutionRating', [code]),
      this.callDetailProviderMethod<Record<string, unknown>>(['sinafinance'], 'sinaExecutives', [code]),
      this.callDetailProviderMethod<Record<string, unknown>>(['sinafinance'], 'sinaIndexMembership', [code]),
    ])

    const rows: Record<string, unknown>[] = []
    for (const pid of ['sinafinance', 'tushare', 'tencent']) {
      const batch = await this.callDetailProviderMethod<Record<string, unknown>>(
        [pid],
        'profile',
        [code],
      )
      if (batch?.[0]) rows.push(batch[0])
    }
    if (!rows.length) {
      const fallback = await this.de.queryInstrumentData(this.cnEquityRef(code), 'profile')
      const row = instrumentQueryData<Array<Record<string, unknown>>>(fallback)?.[0]
      if (row) rows.push(row)
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

  private async stockDetail(code: string, t0: number) {
    const [quoteR, profileR, financialAllR, newsR, dividendR, moneyFlowR, shareholdersR, holderHistoryR] = await Promise.all([
      this.stockDetailQuote(code),
      this.stockDetailOptional(
        this.stockDetailProfile(code).then(profile => ({
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
          )
          if (fast?.length) return { success: true, data: fast }
          return this.de.queryInstrumentData(this.cnEquityRef(code), 'financials', {
            reportDate: '',
            reportType: 'all',
          }) as Promise<{ success: boolean; data?: Array<{ reportType?: string }> | null }>
        })(),
        25000,
      ),
      this.stockDetailOptional(
        this.stockDetailNotices(code).then(data => ({ success: data.length > 0, data })),
      ),
      this.stockDetailOptional(
        (async () => {
          const preferred = await this.callDetailProviderMethod<Dividend>(
            ['sinafinance', 'tushare'],
            'dividend',
            [code],
          )
          if (preferred?.length) return { success: true, data: preferred }
          return this.de.dividend(code)
        })(),
      ),
      this.stockDetailOptional(
        (async () => {
          const preferred = await this.callDetailProviderMethod<MoneyFlow>(
            ['tencent', 'sinafinance'],
            'moneyFlow',
            [code],
          )
          if (preferred?.length) return { success: true, data: preferred }
          return this.de.moneyFlow(code)
        })(),
      ),
      this.stockDetailOptional(
        this.stockDetailShareholders(code).then(data => ({
          success: !!data?.length,
          data,
        })),
      ),
      this.stockDetailOptional(
        this.stockDetailHolderHistory(code).then(history => ({
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
      quote?.name,
      profileRow?.name as string | undefined,
      profileRow?.orgName as string | undefined,
    )

    return ok({
      code,
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

  private resolveStockMarket(code: string, explicitMarket?: string | null): StockMarket {
    const normalized = normalizeCode(code)
    const parsed = parseStockMarket(explicitMarket)
    if (parsed) return parsed
    return this.marketData.store.stockMarket(normalized) ?? resolveStockMarketCode(normalized)
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

  private async stockRealtime(code: string, explicitMarket?: string | null) {
    void explicitMarket
    return this.de.queryInstrumentData(this.cnEquityRef(code), 'realtime')
  }

  private async stockBatchRealtime(codes: string[]) {
    const markets = this.resolveStockMarkets(codes)
    const normalized = [...new Set(codes.map(c => normalizeCode(String(c))).filter(Boolean))]
    const rows = await Promise.all(
      normalized.map(async code => {
        const result = await this.stockRealtime(code, markets.get(code))
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
      case 'weekly': return 160
      case 'monthly': return 80
      default: return 320
    }
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
        count: recentCount,
      })
      const recentData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(recentR)
      if (recentR.success && recentData?.length) {
        const merged = this.mergeKlineByTime(older, recentData, before)
        return {
          klines: merged.slice(-800),
          hasMore: older.length >= step,
        }
      }
      return this.fetchLocalChartKlines(code, safeCount, before)
    }

    const klineR = await this.queryCnKline(code, {
      period: klinePeriod,
      count: safeCount,
    })
    const klineData = instrumentQueryData<import('@opptrix/shared').StockKline[]>(klineR)
    if (klineR.success && klineData?.length) {
      return {
        klines: klineData,
        hasMore: klineData.length >= safeCount && safeCount < 800,
      }
    }
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
    const cap = this.isMinutePeriod(period) ? this.minuteMaxBars(period) : 800
    const safeCount = Math.max(20, Math.min(count || this.defaultChartCount(period), cap))
    const stockMarket = this.resolveStockMarket(normalized, explicitMarket)
    const quoteR = await this.stockRealtime(code, explicitMarket)
    let quote = instrumentQueryData<import('@opptrix/shared').StockRealtime[]>(quoteR)?.[0] ?? null
    if (quote) quote = normalizePreOpenRealtimeQuote(quote)
    const preClose = quote?.preClose ?? null
    const name = this.resolveStockName(code, quote?.name)

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

  private cnEtfRef(code: string): InstrumentRef {
    const sym = code.trim() || '510300'
    return { market: 'CN', assetClass: 'ETF', symbol: sym }
  }

  private cnEquityRef(code: string): InstrumentRef {
    const sym = normalizeCode(code)
    return {
      market: 'CN',
      assetClass: isCnEtfCode(sym) ? 'ETF' : 'EQUITY',
      symbol: sym,
    }
  }

  private async queryCnKline(
    code: string,
    opts: { period?: string; count?: number; startDate?: string; endDate?: string },
  ) {
    return this.de.queryInstrumentData(this.cnEquityRef(code), 'kline', {
      count: opts.count ?? 120,
      period: opts.period ?? 'daily',
      startDate: opts.startDate,
      endDate: opts.endDate,
    })
  }

  private async etfList(params: Record<string, unknown>, t0: number) {
    const code = params.code != null ? String(params.code) : ''
    const r = await this.de.queryInstrumentData(
      this.cnEtfRef(code || '510300'),
      'etf_list',
      code ? { keyword: code } : {},
    )
    if (!r.success) return fail(instrumentQueryError(r, 'ETF 列表获取失败'), t0)
    const data = instrumentQueryData<unknown[]>(r) ?? []
    return ok(data, `ETF 列表 ${data.length} 条`, t0)
  }

  private async etfSnapshot(code: string, t0: number) {
    const r = await this.de.queryInstrumentData(this.cnEtfRef(code), 'etf_snapshot')
    if (!r.success) return fail(instrumentQueryError(r, 'ETF 快照获取失败'), t0)
    return ok(instrumentQueryData(r), 'ETF 快照', t0)
  }

  private async etfNav(code: string, t0: number) {
    const r = await this.de.queryInstrumentData(this.cnEtfRef(code), 'etf_nav')
    if (!r.success) return fail(instrumentQueryError(r, 'ETF 净值获取失败'), t0)
    const data = instrumentQueryData<unknown[]>(r) ?? []
    return ok(data, `ETF 净值 ${data.length} 条`, t0)
  }

  private async etfHoldings(code: string, t0: number) {
    const r = await this.de.queryInstrumentData(this.cnEtfRef(code), 'etf_holdings')
    if (!r.success) return fail(instrumentQueryError(r, 'ETF 持仓获取失败'), t0)
    const data = instrumentQueryData<unknown[]>(r) ?? []
    return ok(data, `ETF 持仓 ${data.length} 条`, t0)
  }

  private async localEtfList(params: Record<string, unknown>, t0: number) {
    return this.etfList(params, t0)
  }

  private async localEtfNav(code: string, params: Record<string, unknown>, t0: number) {
    void params
    return this.etfNav(code, t0)
  }

  private async localEtfHoldings(code: string, params: Record<string, unknown>, t0: number) {
    void params
    return this.etfHoldings(code, t0)
  }

  private localEtfScreenSchema(t0: number) {
    return this.failLocalOffline(t0)
  }

  private localEtfScreen(params: Record<string, unknown>, t0: number) {
    void params
    return this.failLocalOffline(t0)
  }

  private async etfScorecard(code: string, t0: number) {
    const trimmed = code.trim()
    if (!trimmed) return fail('code 必填', t0)
    return this.instrumentEvaluation(
      normalizeInstrumentHubParams({ code: trimmed, market: 'CN', assetClass: 'ETF' }),
      t0,
    )
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
      stockDetail: code => this.stockDetail(code, t0),
      etfSnapshot: code => this.etfSnapshot(code, t0),
      usSnapshot: symbol => this.usSnapshot(symbol, t0),
      regionalSnapshot: (market, symbol) => this.regionalSnapshot(market, symbol, t0),
      cryptoSnapshot: pair => this.cryptoSnapshot(pair, t0),
      stockQuotes: codes => this.stockQuotes(codes, t0),
      usRealtime: symbol => this.usRealtime(symbol, t0),
      regionalRealtime: (market, symbol) => this.regionalRealtime(market, symbol, t0),
      cryptoRealtime: pair => this.cryptoRealtime(pair, t0),
      stockChart: (code, period, count, before, tail, market) =>
        this.stockChart(code, period, count, before, tail, market, t0),
      usKline: (symbol, period, count) => this.usKline(symbol, { count, period }, t0),
      regionalKline: (market, symbol, period, count) => this.regionalKline(market, symbol, { count, period }, t0),
      cryptoKline: (pair, period, count) => this.cryptoKline(pair, { count, period }, t0),
      stockCyq: code => this.stockCyq(code, t0),
      institutionRating: (code, groups) => this.institutionRating(code, groups, t0),
      institutionReport: (code, groups) => this.institutionReport(code, groups, t0),
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
      this.cnEtfRef('510300'),
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

  private async crossMarketKlineChart(
    market: 'US' | 'HK',
    symbol: string,
    period: string,
    count: number,
    t0: number,
  ) {
    const ref = { market, assetClass: 'EQUITY' as const, symbol }
    const r = await this.de.queryInstrumentData(ref, 'kline', { count, period })
    if (!r.success) {
      return fail(instrumentQueryError(r, `${market === 'US' ? '美股' : '港股'} K 线获取失败`), t0)
    }
    const items = instrumentQueryData<Record<string, unknown>[]>(r) ?? []
    let preClose: number | null = null
    if (period === 'intraday' && items.length) {
      const qR = await this.de.queryInstrumentData(ref, 'realtime')
      const quote = instrumentQueryData<Record<string, unknown>[]>(qR)?.[0]
      preClose = quote?.preClose != null ? Number(quote.preClose) : null
      if (preClose == null || !Number.isFinite(preClose)) {
        preClose = quote?.pre_close != null ? Number(quote.pre_close) : null
      }
    }
    return ok(
      { symbol, period, items, count: items.length, preClose, pre_close: preClose },
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
    return this.crossMarketKlineChart('HK', symbol, period, count, t0)
  }

  private async regionalSnapshot(market: 'HK', symbol: string, t0: number) {
    return this.crossMarketStockDetail(market, symbol, t0)
  }

  private async usKline(symbol: string, params: Record<string, unknown>, t0: number) {
    const count = params.count != null ? Number(params.count) : 180
    const period = String(params.period ?? 'daily')
    return this.crossMarketKlineChart('US', symbol, period, count, t0)
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
    const noticeMethod = market === 'US' ? 'tencentUsStockNotices' : 'tencentHkStockNotices'
    const newsMethod = market === 'US' ? 'tencentUsStockNews' : 'tencentHkStockNews'
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
        this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], profileMethod, [symbol])
          .then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      this.stockDetailOptional(
        this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], noticeMethod, [symbol, 1, 30])
          .then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      this.stockDetailOptional(
        this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], newsMethod, [symbol, 1, 30])
          .then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      this.stockDetailOptional(
        this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], financialMethod, [
          symbol,
          ...(market === 'US' ? [1, 8] : ['income', 'all', 4]),
        ]).then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      market === 'HK'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentHkStockFinancialReport', [
            symbol, 'balance', 'all', 4,
          ]).then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'HK'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentHkDividends', [symbol, 1, 10, true])
            .then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'US'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentUsShareholderStats', [symbol, 1])
            .then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'HK'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentHkReviewProspect', [symbol])
            .then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'US'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentUsStockQuote', [symbol])
            .then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      this.stockDetailOptional(
        this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], relatedMethod, [symbol])
          .then(rows => ({ success: !!rows?.length, data: rows })),
      ),
      market === 'US'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentUsSeniorTrades', [symbol, 1, 15])
            .then(rows => ({ success: !!rows?.length, data: rows })),
        )
        : Promise.resolve({ success: false as const, data: null as Record<string, unknown>[] | null }),
      market === 'HK'
        ? this.stockDetailOptional(
          this.callDetailProviderMethod<Record<string, unknown>>(['tencent'], 'tencentHkTechnicalAnalysis', [symbol])
            .then(rows => ({ success: !!rows?.length, data: rows })),
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

  private async portfolioTrades(code: string, t0: number) {
    const trades = this.de.portfolio.trades(code)
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
