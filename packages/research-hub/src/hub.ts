import { MarketDataEngine, computeIndicators, isMissingLivePrice, normalizeCode, normalizePreOpenRealtimeQuote,
  pickIntradaySession, parseStockMarket, resolveMarket, resolveStockMarketCode, searchQuote,
  loadTushareConfig, saveTushareConfig, isBseCode, isCnEtfCode,
  cnTodayString, shouldPreferTodayIntraday, type StockMarket,
} from '@opptrix/a-stock-layer'
import type { IntradayTrendFetchResult, IntradayTrendSession } from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
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
  computeTurnoverVs20d, computeHv20Pct, type ResearchResult,
  assessAllDiscoverProfileReadiness,
  assessDiscoverProfileReadiness,
  isDiscoverStrategyProfile,
  resolveRegimeStrategyIds,
  ETF_REGIME_DETAIL,
  listScorecardsForProfile,
  resolveScorecardName,
  scorecardProfileFromDiscover,
  type DiscoverProfileReadinessContext,
  type DiscoverStrategyProfile,
} from '@opptrix/shared'
import { quickAssess, verifyStrategy, buildTrendBrief } from '@opptrix/t-strategy'
import { serializeInstitutionData } from './serialize.js'
import { formatVerificationReport, generateStrategyReport } from '@opptrix/t-strategy'
import {
  newsArticleDetail,
  newsArticlesList,
  newsCenterStatus,
  newsGroupsList,
  newsSourcesList,
} from './news-hub.js'
import {
  routeInstrumentCapabilities,
  routeInstrumentChart,
  routeInstrumentQuotes,
  routeInstrumentSearch,
  routeInstrumentSnapshot,
  type InstrumentRouteHandlers,
} from './instrument-router.js'

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
    this.marketData.autoSyncOnBoot()
  }

  /** @deprecated Use initMarketDataAutoSync */
  initMarketDataAutoResume(): void {
    this.initMarketDataAutoSync()
  }

  async dispatch(feature: string, params: Record<string, unknown>): Promise<ResearchResult> {
    const t0 = Date.now()
    try {
      switch (feature) {
        case 'stock_diagnosis': return this.stockDiagnosis(String(params.code), String(params.scorecard ?? '综合评估'), t0)
        case 'institution_rating': return this.institutionRating(String(params.code), params.groups as string[] | undefined, t0)
        case 'institution_report': return this.institutionReport(String(params.code), params.groups as string[] | undefined, t0)
        case 'screening': return this.screening(params, t0)
        case 'strategy_signal': return this.strategySignal(String(params.code), t0)
        case 'trend_brief': return this.trendBrief(String(params.code), params, t0)
        case 'strategy_verify': return this.strategyVerify(params, t0)
        case 'strategy_verify_report': return this.strategyVerifyReport(params, t0)
        case 'portfolio_analysis': return this.portfolioAnalysis(params, t0)
        case 'industry_mining': return this.industryMining(String(params.industry), t0)
        case 'industry_mermaid': return this.industryMermaid(String(params.industry), t0)
        case 'market_report': return this.marketReport(String(params.type ?? 'closing'), t0)
        case 'search_stocks': return this.searchStocks(String(params.keyword), t0)
        case 'stock_quotes': return this.stockQuotes(params.codes as string[] | undefined, t0)
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
        case 'market_regime': return this.marketRegime(t0)
        case 'local_industry_list': return this.localIndustryList(params, t0)
        case 'local_industry_screen': return this.localIndustryScreen(params, t0)
        case 'list_screen_factors': return this.listScreenFactors(t0)
        case 'local_universe_screen_schema': return this.localUniverseScreenSchema(t0)
        case 'local_universe_screen': return this.localUniverseScreen(params, t0)
        case 'batch_stock_snapshots': return this.batchStockSnapshots(params, t0)
        case 'stock_kline': return this.stockKline(String(params.code), Number(params.count ?? 90), t0)
        case 'stock_cyq': return this.stockCyq(String(params.code), t0)
        case 'stock_chart': return this.stockChart(
          String(params.code),
          String(params.period ?? 'daily'),
          Number(params.count ?? 0),
          String(params.before ?? ''),
          Number(params.tail ?? 0),
          typeof params.market === 'string' ? params.market : undefined,
          t0,
        )
        case 'stock_detail': return this.stockDetail(String(params.code), t0)
        case 'backtest': return this.runBacktest(params, t0)
        case 'latest_evaluation': return this.latestEvaluation(String(params.code), params, t0)
        case 'portfolio_trades': return this.portfolioTrades(String(params.code ?? ''), t0)
        case 'portfolio_holdings': return this.portfolioHoldings(t0)
        case 'portfolio_summary': return this.portfolioSummary(t0)
        case 'news_center_status': return newsCenterStatus(t0)
        case 'news_groups_list': return newsGroupsList(t0)
        case 'news_sources_list': return newsSourcesList(t0)
        case 'news_articles_list': return newsArticlesList(params, t0)
        case 'news_article_detail': return await newsArticleDetail(params, t0)
        case 'tushare_config': return ok(this.de.providerCatalog.tusharePublicLegacy(), 'Tushare 配置', t0)
        case 'tushare_config_save': return this.tushareConfigSave(params, t0)
        case 'tushare_test': return this.tushareTest(params, t0)
        case 'provider_list': return ok(this.de.listProviders(), '数据源列表', t0)
        case 'provider_config': return this.providerConfig(params, t0)
        case 'provider_config_save': return this.providerConfigSave(params, t0)
        case 'provider_test': return this.providerTest(params, t0)
        case 'provider_binding_overrides': return this.providerBindingOverrides(params, t0)
        case 'provider_binding_override_save': return this.providerBindingOverrideSave(params, t0)
        case 'etf_list': return this.etfList(params, t0)
        case 'etf_snapshot': return this.etfSnapshot(String(params.code ?? ''), t0)
        case 'etf_nav': return this.etfNav(String(params.code ?? ''), t0)
        case 'etf_holdings': return this.etfHoldings(String(params.code ?? ''), t0)
        case 'local_etf_list': return await this.localEtfList(params, t0)
        case 'local_etf_nav': return await this.localEtfNav(String(params.code ?? ''), params, t0)
        case 'local_etf_holdings': return await this.localEtfHoldings(String(params.code ?? ''), params, t0)
        case 'local_etf_screen_schema': return this.localEtfScreenSchema(t0)
        case 'local_etf_screen': return this.localEtfScreen(params, t0)
        case 'etf_scorecard': return this.etfScorecard(String(params.code ?? ''), t0)
        case 'etf_scorecard_schema': return this.etfScorecardSchema(t0)
        case 'search_local_instruments': return this.searchLocalInstruments(params, t0)
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
        case 'us_realtime': return await this.usRealtime(String(params.symbol ?? params.code ?? ''), t0)
        case 'us_kline': return await this.usKline(String(params.symbol ?? params.code ?? ''), params, t0)
        case 'us_profile': return await this.usProfile(String(params.symbol ?? params.code ?? ''), t0)
        case 'us_financials': return await this.usFinancials(String(params.symbol ?? params.code ?? ''), params, t0)
        case 'us_snapshot': return await this.usSnapshot(String(params.symbol ?? params.code ?? ''), t0)
        case 'us_stock_list': return await this.usStockList(params, t0)
        case 'local_us_list': return await this.localUsList(params, t0)
        case 'search_us_stocks': return await this.searchUsStocks(params, t0)
        case 'crypto_realtime': return await this.cryptoRealtime(String(params.pair ?? params.symbol ?? ''), t0)
        case 'crypto_kline': return await this.cryptoKline(String(params.pair ?? params.symbol ?? ''), params, t0)
        case 'crypto_snapshot': return await this.cryptoSnapshot(String(params.pair ?? params.symbol ?? ''), t0)
        case 'crypto_list': return await this.cryptoList(params, t0)
        case 'local_crypto_list': return await this.localCryptoList(params, t0)
        case 'search_crypto_pairs': return await this.searchCryptoPairs(params, t0)
        case 'strategy_report': return this.strategyReport(String(params.code), t0)
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
    const localStatus = this.marketData.status()

    if (localStatus.is_ready && conditions.length) {
      const data = this.marketData.screen(
        conditions as never[],
        topN,
      )
      const topCodes = data.items.map(i => i.code).slice(0, Math.min(topN, 30))
      if (topCodes.length) {
        void this.marketData.hydrateStocks(topCodes, 'watchlist').catch(() => {})
      }
      return ok({
        total_scanned: localStatus.stock_count,
        passed: data.passed,
        scorecard,
        source: 'local',
        trade_date: data.trade_date,
        items: data.items.map(i => ({
          code: i.code,
          name: i.name,
          total_score: i.total_score ?? 0,
          key_factors: i.key_factors as Record<string, number>,
        })),
      }, `本地扫描 ${localStatus.stock_count} 只，通过 ${data.passed}`, t0)
    }

    const data = await this.screener.run(conditions as never[], scorecard, topN)
    return ok({
      total_scanned: data.totalScanned, passed: data.passed, scorecard: data.scorecard,
      source: 'live',
      items: data.items.map(i => ({ code: i.code, name: i.name, total_score: i.total_score, key_factors: i.key_factors })),
    }, `在线扫描 ${data.totalScanned} 通过 ${data.passed}`, t0)
  }

  private marketDbStatus(t0: number) {
    return ok(this.marketData.status(), '本地指标库状态', t0)
  }

  private marketDbSyncState(t0: number) {
    return ok(this.marketData.syncState(), '同步状态', t0)
  }

  private marketDataPacks(t0: number) {
    const config = this.marketData.marketPackConfig()
    const status = this.marketData.status()
    return ok({
      config,
      counts: {
        cn_stocks: status.stock_count,
        cn_etfs: status.etf_count,
        us: status.us_count,
        crypto: status.crypto_count,
        jp: status.jp_count ?? 0,
        kr: status.kr_count ?? 0,
        hk: status.hk_count ?? 0,
      },
    }, '市场数据包', t0)
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
    const patch = params.patch as Record<string, { enabled?: boolean }> | undefined
    if (!patch || typeof patch !== 'object') return fail('缺少 patch', t0)
    const config = this.marketData.updateMarketPackConfig(patch)
    return ok({ config }, '已保存', t0)
  }

  private async marketDataPackPrepare(params: Record<string, unknown>, t0: number) {
    const pack = String(params.pack ?? '').trim().toLowerCase()
    const allowed = new Set(['cn', 'us', 'crypto', 'hk', 'jp', 'kr'])
    if (!allowed.has(pack)) {
      return fail('pack 须为 cn、us、crypto、hk、jp 或 kr', t0)
    }
    const force = params.force === true
    const result = await this.marketData.prepareMarketPack(pack as import('@opptrix/shared').MarketDataPackId, force)
    const msg = result.started ? '数据包准备已在后台启动' : '同步任务进行中'
    return ok({ ...result, state: this.marketData.syncState() }, msg, t0)
  }

  private async marketDbSync(params: Record<string, unknown>, t0: number) {
    const force = params.force === true
    const modeRaw = params.mode != null ? String(params.mode) : 'auto'
    const maxStocks = params.max_stocks != null ? Number(params.max_stocks) : undefined
    const jobs = Array.isArray(params.jobs) ? (params.jobs as string[]) : undefined
    const profile = params.profile != null ? String(params.profile) : undefined

    let result: Awaited<ReturnType<typeof this.marketData.syncAdaptive>>
    let planLabel: string

    if (force || modeRaw === 'full') {
      const enabledJobs = this.marketData.planSync(true).jobs
      const r = await this.marketData.sync({
        mode: 'full',
        maxStocks,
        jobs: jobs ?? [...enabledJobs],
        force: true,
        profile,
        background: true,
      })
      result = { ...r, plan: { mode: 'full' as const, jobs: jobs ?? [], label: '全量重拉' } }
      planLabel = '全量重拉'
    } else if (modeRaw === 'resume' || modeRaw === 'incremental') {
      const r = await this.marketData.sync({
        mode: modeRaw,
        maxStocks,
        jobs,
        force,
        profile,
        background: true,
      })
      planLabel = modeRaw === 'resume' ? '接续同步' : '增量同步'
      result = { ...r, plan: { mode: modeRaw, jobs: jobs ?? [], label: planLabel } }
    } else {
      result = await this.marketData.syncAdaptive(force)
      planLabel = result.plan.label
    }

    const msg = result.started
      ? `${planLabel}已在后台启动`
      : '同步任务进行中'
    return ok({ ...result, state: this.marketData.syncState() }, msg, t0)
  }

  private marketIndustryStats(params: Record<string, unknown>, t0: number) {
    const tradeDate = params.trade_date ? String(params.trade_date) : undefined
    const data = this.marketData.industryStats(tradeDate)
    return ok(
      { items: data.items, trade_date: data.trade_date, quote_date: data.quote_date },
      '行业统计',
      t0,
    )
  }

  private marketIndustryStocks(params: Record<string, unknown>, t0: number) {
    const industry = String(params.industry ?? '').trim()
    if (!industry) return fail('请指定行业', t0)
    const limit = params.limit != null ? Number(params.limit) : 120
    const tradeDate = params.trade_date ? String(params.trade_date) : undefined
    const data = this.marketData.industryStocks(industry, tradeDate, limit)
    const topCodes = data.items.map(i => i.code).slice(0, 30)
    if (topCodes.length) {
      void this.marketData.hydrateStocks(topCodes, 'watchlist').catch(() => {})
    }
    return ok(data, `${industry} ${data.items.length} 只`, t0)
  }

  private localIndustryList(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    if (!status.is_ready) {
      return fail('本地初选库未就绪，请先完成基础数据构建或调用 trigger_market_db_sync', t0)
    }
    const keyword = params.keyword != null ? String(params.keyword) : undefined
    const tradeDate = params.trade_date ? String(params.trade_date) : undefined
    const limit = params.limit != null ? Number(params.limit) : undefined
    const data = this.marketData.industryList(keyword, tradeDate, limit)
    return ok(data, `本地行业 ${data.total} 个${keyword ? `（含「${keyword}」）` : ''}`, t0)
  }

  private localIndustryScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    if (!status.is_ready) {
      return fail('本地初选库未就绪，请先完成基础数据构建或调用 trigger_market_db_sync', t0)
    }
    try {
      const data = this.marketData.industryScreen({
        industry: params.industry as string | undefined,
        industries: params.industries as string[] | undefined,
        industry_contains: params.industry_contains as string | undefined,
        factor_conditions: params.factor_conditions as never,
        min_total_score: params.min_total_score != null ? Number(params.min_total_score) : undefined,
        max_total_score: params.max_total_score != null ? Number(params.max_total_score) : undefined,
        min_pe: params.min_pe != null ? Number(params.min_pe) : undefined,
        max_pe: params.max_pe != null ? Number(params.max_pe) : undefined,
        min_pb: params.min_pb != null ? Number(params.min_pb) : undefined,
        max_pb: params.max_pb != null ? Number(params.max_pb) : undefined,
        exclude_st: params.exclude_st as boolean | undefined,
        scorecard: params.scorecard as string | undefined,
        sort_by: params.sort_by as string | undefined,
        sort_order: params.sort_order as 'asc' | 'desc' | undefined,
        trade_date: params.trade_date as string | undefined,
        top_n: params.top_n != null ? Number(params.top_n) : undefined,
      })
      const topCodes = data.items.map(i => i.code).slice(0, Math.min(data.items.length, 30))
      if (topCodes.length) {
        void this.marketData.hydrateStocks(topCodes, 'watchlist').catch(() => {})
      }
      return ok({
        source: 'local',
        trade_date: data.trade_date,
        scorecard: data.scorecard,
        total_universe: data.total_universe,
        passed: data.passed,
        items: data.items,
      }, `行业筛选 ${data.total_universe} 只，命中 ${data.passed} 只，返回 ${data.items.length} 只`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private listScreenFactors(t0: number) {
    return ok({ factors: this.marketData.listScreenFactors() }, '本地初选因子列表', t0)
  }

  private localUniverseScreenSchema(t0: number) {
    return ok(this.marketData.universeScreenSchema(), '本地初选筛选维度说明', t0)
  }

  private localUniverseScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    if (!status.is_ready) {
      return fail('本地初选库未就绪，请先完成基础数据构建或调用 trigger_market_db_sync', t0)
    }
    try {
      const data = this.marketData.universeScreen({
        factor_conditions: params.factor_conditions as never,
        industry_contains: params.industry_contains as string | undefined,
        industries: params.industries as string[] | undefined,
        markets: params.markets as Array<'SH' | 'SZ' | 'BJ'> | undefined,
        min_total_score: params.min_total_score != null ? Number(params.min_total_score) : undefined,
        max_total_score: params.max_total_score != null ? Number(params.max_total_score) : undefined,
        min_market_cap_yi: params.min_market_cap_yi != null ? Number(params.min_market_cap_yi) : undefined,
        max_market_cap_yi: params.max_market_cap_yi != null ? Number(params.max_market_cap_yi) : undefined,
        min_pe: params.min_pe != null ? Number(params.min_pe) : undefined,
        max_pe: params.max_pe != null ? Number(params.max_pe) : undefined,
        min_pb: params.min_pb != null ? Number(params.min_pb) : undefined,
        max_pb: params.max_pb != null ? Number(params.max_pb) : undefined,
        exclude_st: params.exclude_st as boolean | undefined,
        scorecard: params.scorecard as string | undefined,
        sort_by: params.sort_by as string | undefined,
        sort_order: params.sort_order as 'asc' | 'desc' | undefined,
        trade_date: params.trade_date as string | undefined,
        top_n: params.top_n != null ? Number(params.top_n) : undefined,
      })
      const topCodes = data.items.map(i => i.code).slice(0, Math.min(data.items.length, 30))
      if (topCodes.length) {
        void this.marketData.hydrateStocks(topCodes, 'watchlist').catch(() => {})
      }
      return ok({
        source: 'local',
        trade_date: data.trade_date,
        scorecard: data.scorecard,
        total_universe: data.total_universe,
        passed: data.passed,
        items: data.items,
      }, `本地筛选 ${data.total_universe} 只，命中 ${data.passed} 只，返回 ${data.items.length} 只`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private batchStockSnapshots(params: Record<string, unknown>, t0: number) {
    const codes = Array.isArray(params.codes) ? (params.codes as string[]).map(String) : []
    const limit = Math.min(codes.length, 80)
    const slice = codes.slice(0, limit)
    const tradeDate = this.marketData.status().latest_factor_date ?? undefined
    const items = this.marketData.discoverCandidates(slice, undefined, tradeDate ?? undefined)
    return ok({ trade_date: tradeDate ?? null, items }, `批量快照 ${items.length} 只`, t0)
  }

  private async strategySignal(code: string, t0: number) {
    const normalized = normalizeCode(code)
    if (isCnEtfCode(normalized)) {
      const technical = await quickAssess(this.de, normalized)
      const card = this.marketData.etfScorecard(normalized)
      const radarHint = card?.total_score != null ? ` · 决策雷达 ${card.total_score} 分` : ''
      return ok({
        ...technical,
        asset_class: 'ETF' as const,
        scorecard_name: 'ETF决策雷达',
        etf_scorecard: card,
      }, `${normalized} ${technical.summary}${radarHint}`, t0)
    }
    const data = await quickAssess(this.de, normalized)
    return ok({ ...data, asset_class: 'EQUITY' as const, scorecard_name: '综合评估' }, `${normalized} ${data.summary}`, t0)
  }

  private async trendBrief(code: string, params: Record<string, unknown>, t0: number) {
    const normalized = normalizeCode(code)
    let klines = this.marketData.localDailyKlines(normalized, 280)
    if (klines.length < 30) {
      const kl = await this.de.kline(normalized, 280)
      if (kl.success && kl.data?.length) klines = kl.data
    }
    if (klines.length < 20) {
      return fail('K 线数据不足，请先同步本地行情后再查看趋势研判', t0)
    }

    const indexKlines = this.marketData.localDailyKlines('000300', 280)
    const quoteR = await this.stockRealtime(normalized)
    const quote = quoteR.data?.[0] ?? null
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

  private async marketRegime(t0: number) {
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
      ...snapshot,
      suggested_by_profile: suggestedByProfile,
      etf_regime_detail: ETF_REGIME_DETAIL[snapshot.regime],
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

  private async fillMissingStockNames(codes: string[]): Promise<void> {
    const missing = [...new Set(codes.map(c => normalizeCode(c)).filter(c => this.resolveStockName(c) === c))]
    if (!missing.length) return

    const metaBatch = this.marketData.store.stockMetaBatch(missing)
    for (const [code, meta] of metaBatch) {
      if (meta.name && meta.name !== code) this.stockNameCache.set(code, meta.name)
    }

    const stillMissing = missing.filter(c => this.resolveStockName(c) === c)
    await Promise.all(stillMissing.map(async code => {
      if (this.resolveStockName(code) !== code) return
      try {
        const found = await searchQuote(code, 5)
        const items = found == null ? [] : (Array.isArray(found) ? found : [found])
        const hit = items.find(q => normalizeCode(q.code) === code)
        if (hit?.name && hit.name !== code) {
          this.stockNameCache.set(code, hit.name)
        }
      } catch {
        /* ignore lookup errors */
      }
    }))
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
    const normalized = [...new Set(sourceCodes.map(c => normalizeCode(String(c))).filter(Boolean))]
    if (!normalized.length) return ok({ items: [] as WatchlistRadarItem[] }, '暂无关注', t0)

    await this.fillMissingStockNames(normalized)
    void this.marketData.hydrateStocks(normalized, 'watchlist').catch(() => {})

    const localRows = this.marketData.status().is_ready
      ? this.marketData.radarBatch(normalized) as {
          code: string
          name: string
          total_score: number | null
          scorecard: string | null
          pe: number | null
          pb: number | null
          pe_percentile: number | null
          pb_percentile: number | null
        }[]
      : []
    const localByCode = new Map(localRows.map(row => [row.code, row]))

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
      normalized.map(code => this.buildWatchlistRadarItem(code, localByCode.get(code), quoteByCode.get(code))),
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
        ? { data: [cachedQuote] }
        : await this.stockRealtime(code)
      const flowR = await this.de.moneyFlow(code)
      const quote = quoteR.data?.[0]
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
    const result = await this.de.kline(code, safeCount)
    if (!result.success) return fail(result.error ?? 'K线获取失败', t0)
    return ok({ code, klines: result.data ?? [] }, `${code} K线 ${result.data?.length ?? 0} 根`, t0)
  }

  private async stockCyq(code: string, t0: number) {
    const normalized = code.padStart(6, '0')
    const result = await this.de.chipDistribution(normalized)
    if (!result.success || !result.data?.length) {
      return fail(result.error ?? '筹码分布获取失败', t0)
    }
    const latest = result.data[result.data.length - 1]
    return ok({
      code: normalized,
      rows: result.data,
      latest,
    }, `${normalized} 筹码 ${result.data.length} 日`, t0)
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

  private async stockDetail(code: string, t0: number) {
    void this.marketData.hydrateStocks([normalizeCode(code)], 'detail').catch(() => {})

    const [quoteR, profileR, financialR, financialAllR, newsR, dividendR, moneyFlowR, shareholdersR] = await Promise.all([
      this.stockRealtime(code),
      this.de.profile(code),
      this.de.financials(code),
      this.de.financials(code, '', 'all'),
      this.de.news(code, 1, 20),
      this.de.dividend(code),
      this.de.moneyFlow(code),
      this.de.shareholders(code),
    ])

    const quoteRaw = quoteR.data?.[0] ?? null
    const quote = this.mergeQuoteWithLocal(code, quoteRaw)
    const profile = profileR.data?.[0] ?? null
    const financial = financialR.data?.[0] ?? null
    const name = this.resolveStockName(
      code,
      quote?.name,
      profile?.name,
      profile?.orgName,
    )

    return ok({
      code,
      name,
      quote,
      profile,
      financial,
      financialHistory: financialAllR.data ?? [],
      news: newsR.data ?? [],
      dividends: dividendR.data ?? [],
      moneyFlow: moneyFlowR.data ?? [],
      shareholders: shareholdersR.data?.[0] ?? null,
    }, `${name}(${code}) 详情`, t0)
  }

  private mergeQuoteWithLocal(
    code: string,
    quoteRaw: NonNullable<Awaited<ReturnType<MarketDataEngine['realtime']>>['data']>[0] | null,
  ) {
    const normalizedCode = normalizeCode(code)
    const normalized = quoteRaw ? normalizePreOpenRealtimeQuote(quoteRaw) : null
    const local = this.marketData.localLatestQuote(normalizedCode)
    const needsLocal = isMissingLivePrice(normalized?.price) && local?.close != null && local.close > 0

    if (!normalized && !needsLocal) return null
    if (!needsLocal) return normalized ? this.enrichQuote(normalized) : null

    const merged = {
      code: normalizedCode,
      name: normalized?.name ?? local?.name ?? code,
      price: local!.close!,
      changePct: normalized?.changePct ?? local?.change_pct ?? 0,
      pe: normalized?.pe ?? local?.pe ?? null,
      pb: normalized?.pb ?? local?.pb ?? null,
      turnoverRate: normalized?.turnoverRate ?? null,
      preClose: normalized?.preClose ?? local?.close ?? null,
      open: normalized?.open ?? null,
      high: normalized?.high ?? null,
      low: normalized?.low ?? null,
      volume: normalized?.volume ?? null,
      amount: normalized?.amount ?? null,
      marketCap: normalized?.marketCap ?? local?.market_cap ?? null,
      change: normalized?.change ?? 0,
      amplitude: normalized?.amplitude ?? null,
    }
    return this.enrichQuote(merged)
  }

  private fetchLocalChartKlines(
    code: string,
    safeCount: number,
    before: string,
  ): { klines: import('@opptrix/shared').StockKline[]; hasMore: boolean } | null {
    if (!isBseCode(code)) return null
    const limit = before ? 200 : safeCount
    const klines = this.marketData.localDailyKlines(code, limit, before || undefined)
    if (!klines.length) return null
    return {
      klines,
      hasMore: klines.length >= limit && klines.length < 800,
    }
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
    const market = this.resolveStockMarket(code, explicitMarket)
    return this.de.realtime(code, market)
  }

  private async stockBatchRealtime(codes: string[]) {
    const markets = this.resolveStockMarkets(codes)
    const normalized = [...new Set(codes.map(c => normalizeCode(String(c))).filter(Boolean))]
    const rows = await Promise.all(
      normalized.map(async code => {
        const result = await this.de.realtime(code, markets.get(code))
        return result.data?.[0] ?? null
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

    const r = await this.de.kline(code, 'daily', '', session.sessionDate, 12)
    const rows = (r.data ?? [])
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
      let olderR = await this.de.kline(code, klinePeriod, '', endDay, step, stockMarket)
      let older = (olderR.data ?? []).filter(b => b.date < before)
      if (!older.length) {
        olderR = await this.de.kline(code, klinePeriod, '', before.slice(0, 10), step, stockMarket)
        older = (olderR.data ?? []).filter(b => b.date < before)
      }
      const recentCount = Math.max(tail, safeCount, 240)
      const recentR = await this.de.kline(code, klinePeriod, '', '', recentCount, stockMarket)
      if (recentR.success && recentR.data?.length) {
        const merged = this.mergeKlineByTime(older, recentR.data, before)
        return {
          klines: merged.slice(-800),
          hasMore: older.length >= step,
        }
      }
      return this.fetchLocalChartKlines(code, safeCount, before)
    }

    const klineR = await this.de.kline(code, klinePeriod, '', '', safeCount, stockMarket)
    if (klineR.success && klineR.data?.length) {
      return {
        klines: klineR.data,
        hasMore: klineR.data.length >= safeCount && safeCount < 800,
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
    let quote = quoteR.data?.[0] ?? null
    if (quote) quote = normalizePreOpenRealtimeQuote(quote)
    if (isMissingLivePrice(quote?.price)) {
      const local = this.marketData.localLatestQuote(normalized)
      if (local?.close != null && local.close > 0) {
        quote = {
          code: normalized,
          name: quote?.name ?? local.name ?? normalized,
          price: local.close,
          changePct: quote?.changePct ?? local.change_pct ?? 0,
          pe: quote?.pe ?? local.pe ?? null,
          pb: quote?.pb ?? local.pb ?? null,
          turnoverRate: quote?.turnoverRate ?? null,
          preClose: quote?.preClose ?? local.close ?? null,
        }
      }
    }
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
      const profileR = await this.de.chipProfile(normalized)
      const raw = profileR.data?.[0]
      if (profileR.success && raw) {
        cyqLatest = this.mapCyqRow(raw)
        cyqProfile = {
          date: raw.date,
          currentPrice: raw.currentPrice,
          levels: raw.levels.map(level => ({ price: level.price, weight: level.weight })),
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
        priorityMode: params.priority_mode === 'custom'
          ? 'custom'
          : params.priority_mode === 'manifest'
            ? 'manifest'
            : undefined,
        priority: params.priority !== undefined
          ? (params.priority === null ? null : Number(params.priority))
          : undefined,
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

  private async etfList(params: Record<string, unknown>, t0: number) {
    const code = params.code != null ? String(params.code) : ''
    const r = await this.de.etfList(code)
    if (!r.success) return fail(r.error ?? 'ETF 列表获取失败', t0)
    return ok(r.data, `ETF 列表 ${r.data?.length ?? 0} 条`, t0)
  }

  private async etfSnapshot(code: string, t0: number) {
    const r = await this.de.etfSnapshot(code)
    if (!r.success) return fail('ETF 快照获取失败', t0)
    return ok(r.data, 'ETF 快照', t0)
  }

  private async etfNav(code: string, t0: number) {
    const r = await this.de.etfNav(code)
    if (!r.success) return fail(r.error ?? 'ETF 净值获取失败', t0)
    return ok(r.data, `ETF 净值 ${r.data?.length ?? 0} 条`, t0)
  }

  private async etfHoldings(code: string, t0: number) {
    const r = await this.de.etfHoldings(code)
    if (!r.success) return fail(r.error ?? 'ETF 持仓获取失败', t0)
    return ok(r.data, `ETF 持仓 ${r.data?.length ?? 0} 条`, t0)
  }

  private async localEtfList(params: Record<string, unknown>, t0: number) {
    const limit = params.limit != null ? Number(params.limit) : 5000
    const items = this.marketData.listLocalEtfs(limit)
    if (items.length) {
      return ok({ items, count: items.length, source: 'local' }, `本地 ETF ${items.length} 只`, t0)
    }
    return this.etfList(params, t0)
  }

  private async localEtfNav(code: string, params: Record<string, unknown>, t0: number) {
    const limit = params.limit != null ? Number(params.limit) : 120
    const local = this.marketData.localEtfNav(code, limit)
    if (local.length) {
      return ok({ code, items: local, source: 'local' }, `本地 ETF 净值 ${local.length} 条`, t0)
    }
    return this.etfNav(code, t0)
  }

  private async localEtfHoldings(code: string, params: Record<string, unknown>, t0: number) {
    const limit = params.limit != null ? Number(params.limit) : 100
    const local = this.marketData.localEtfHoldings(code, limit)
    if (local.length) {
      return ok({ code, items: local, source: 'local' }, `本地 ETF 持仓 ${local.length} 条`, t0)
    }
    return this.etfHoldings(code, t0)
  }

  private localEtfScreenSchema(t0: number) {
    return ok(this.marketData.etfScreenSchema(), '本地 ETF 筛选维度说明', t0)
  }

  private localEtfScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    if (status.etf_count < 1) {
      return fail('本地 ETF 库为空，请先完成 etf_list / etf_nav 同步', t0)
    }
    try {
      const data = this.marketData.etfScreen({
        min_premium_rate: params.min_premium_rate != null ? Number(params.min_premium_rate) : undefined,
        max_premium_rate: params.max_premium_rate != null ? Number(params.max_premium_rate) : undefined,
        min_scale_yi: params.min_scale_yi != null ? Number(params.min_scale_yi) : undefined,
        max_scale_yi: params.max_scale_yi != null ? Number(params.max_scale_yi) : undefined,
        keyword: params.keyword as string | undefined,
        tracking_index_contains: params.tracking_index_contains as string | undefined,
        fund_type_contains: params.fund_type_contains as string | undefined,
        sort_by: params.sort_by as 'premium_rate' | 'scale_yi' | 'nav' | 'code' | 'name' | undefined,
        sort_order: params.sort_order as 'asc' | 'desc' | undefined,
        top_n: params.top_n != null ? Number(params.top_n) : undefined,
      })
      return ok({
        source: 'local',
        total_universe: data.total_universe,
        passed: data.passed,
        items: data.items,
      }, `ETF 筛选 ${data.total_universe} 只，命中 ${data.passed} 只，返回 ${data.items.length} 只`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private etfScorecard(code: string, t0: number) {
    const trimmed = code.trim()
    if (!trimmed) return fail('code 必填', t0)
    const status = this.marketData.status()
    if (status.etf_count < 1) {
      return fail('本地 ETF 库为空，请先完成 etf_list / etf_nav 同步', t0)
    }
    const data = this.marketData.etfScorecard(trimmed)
    if (!data) return fail(`未找到 ETF ${trimmed}，请确认代码或先同步 etf_list`, t0)
    const scoreLabel = data.total_score != null ? `${data.total_score} 分` : '待评估'
    return ok(data, `${data.name} ETF 决策雷达 ${scoreLabel}`, t0)
  }

  private etfScorecardSchema(t0: number) {
    return ok(this.marketData.etfScorecardSchema(), 'ETF 决策雷达维度说明', t0)
  }

  private searchLocalInstruments(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const limit = params.limit != null ? Number(params.limit) : 30
    const markets = Array.isArray(params.markets)
      ? params.markets.map(String) as import('@opptrix/shared').Market[]
      : undefined
    const items = this.marketData.searchLocalInstruments(keyword, limit, markets)
    return ok({ items, count: items.length, source: 'local' }, `本地标的搜索 ${items.length} 条`, t0)
  }

  private localInstrumentsSummary(t0: number) {
    const summary = this.marketData.localInstrumentsSummary()
    const status = this.marketData.status()
    return ok({
      summary,
      counts: {
        cn_stocks: status.stock_count,
        cn_etfs: status.etf_count,
        us: status.us_count,
        crypto: status.crypto_count ?? 0,
        jp: status.jp_count ?? 0,
        kr: status.kr_count ?? 0,
        hk: status.hk_count ?? 0,
      },
    }, '本地 instruments 汇总', t0)
  }

  private instrumentRouteHandlers(t0: number): InstrumentRouteHandlers {
    return {
      stockDetail: code => this.stockDetail(code, t0),
      etfSnapshot: code => this.etfSnapshot(code, t0),
      usSnapshot: symbol => this.usSnapshot(symbol, t0),
      cryptoSnapshot: pair => this.cryptoSnapshot(pair, t0),
      stockQuotes: codes => this.stockQuotes(codes, t0),
      usRealtime: symbol => this.usRealtime(symbol, t0),
      cryptoRealtime: pair => this.cryptoRealtime(pair, t0),
      stockChart: (code, period, count, before, tail, market) =>
        this.stockChart(code, period, count, before, tail, market, t0),
      usKline: (symbol, count) => this.usKline(symbol, { count }, t0),
      cryptoKline: (pair, count) => this.cryptoKline(pair, { count }, t0),
      searchLocalInstruments: (keyword, limit, markets) => {
        const m = markets as import('@opptrix/shared').Market[] | undefined
        return Promise.resolve(this.searchLocalInstruments({ keyword, limit, markets: m }, t0))
      },
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
    return ok(this.marketData.usScreenSchema(), '本地美股筛选维度说明', t0)
  }

  private localUsScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    if ((status.us_count ?? 0) < 1) {
      return fail('本地美股库为空，请先完成 us_list 同步', t0)
    }
    try {
      const data = this.marketData.usScreen({
        keyword: params.keyword as string | undefined,
        industry_contains: params.industry_contains as string | undefined,
        sort_by: params.sort_by as 'code' | 'name' | undefined,
        sort_order: params.sort_order as 'asc' | 'desc' | undefined,
        top_n: params.top_n != null ? Number(params.top_n) : undefined,
      })
      return ok({
        source: 'local',
        total_universe: data.total_universe,
        passed: data.passed,
        items: data.items,
      }, `美股筛选 ${data.total_universe} 只，命中 ${data.passed} 只`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private localCryptoScreenSchema(t0: number) {
    return ok(this.marketData.cryptoScreenSchema(), 'Crypto 本地筛选维度说明', t0)
  }

  private localCryptoScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    if ((status.crypto_count ?? 0) < 1) {
      return fail('本地 Crypto 库为空，请先完成 crypto_list 同步', t0)
    }
    try {
      const data = this.marketData.cryptoScreen({
        keyword: params.keyword as string | undefined,
        quote: params.quote as string | undefined,
        base_contains: params.base_contains as string | undefined,
        sort_by: params.sort_by as 'code' | 'name' | 'quote' | undefined,
        sort_order: params.sort_order as 'asc' | 'desc' | undefined,
        top_n: params.top_n != null ? Number(params.top_n) : undefined,
      })
      return ok({
        source: 'local',
        total_universe: data.total_universe,
        passed: data.passed,
        available_quotes: data.available_quotes,
        items: data.items,
      }, `Crypto 筛选 ${data.total_universe} 对，命中 ${data.passed} 对`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private localRegionalScreen(
    market: 'JP' | 'KR' | 'HK',
    label: string,
    count: number,
    params: Record<string, unknown>,
    t0: number,
  ) {
    if (count < 1) {
      return fail(`本地${label}库为空，请先完成 ${market.toLowerCase()}_list 同步`, t0)
    }
    try {
      const query = {
        keyword: params.keyword as string | undefined,
        industry_contains: params.industry_contains as string | undefined,
        sort_by: params.sort_by as 'code' | 'name' | undefined,
        sort_order: params.sort_order as 'asc' | 'desc' | undefined,
        top_n: params.top_n != null ? Number(params.top_n) : undefined,
      }
      const data = market === 'JP'
        ? this.marketData.jpScreen(query)
        : market === 'KR'
          ? this.marketData.krScreen(query)
          : this.marketData.hkScreen(query)
      return ok({
        source: 'local',
        total_universe: data.total_universe,
        passed: data.passed,
        items: data.items,
      }, `${label}筛选 ${data.total_universe} 只，命中 ${data.passed} 只`, t0)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), t0)
    }
  }

  private localJpScreenSchema(t0: number) {
    return ok(this.marketData.jpScreenSchema(), '本地日股筛选维度说明', t0)
  }

  private localJpScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    return this.localRegionalScreen('JP', '日股', status.jp_count ?? 0, params, t0)
  }

  private localKrScreenSchema(t0: number) {
    return ok(this.marketData.krScreenSchema(), '本地韩股筛选维度说明', t0)
  }

  private localKrScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    return this.localRegionalScreen('KR', '韩股', status.kr_count ?? 0, params, t0)
  }

  private localHkScreenSchema(t0: number) {
    return ok(this.marketData.hkScreenSchema(), '本地港股筛选维度说明', t0)
  }

  private localHkScreen(params: Record<string, unknown>, t0: number) {
    const status = this.marketData.status()
    return this.localRegionalScreen('HK', '港股', status.hk_count ?? 0, params, t0)
  }

  private async searchEtfs(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const limit = params.limit != null ? Number(params.limit) : 30
    const local = this.marketData.searchLocalEtfs(keyword, limit)
    if (local.length) {
      return ok({ items: local, count: local.length, source: 'local' }, `ETF 搜索 ${local.length} 条`, t0)
    }
    const r = await this.de.etfList(keyword)
    if (!r.success) return fail(r.error ?? 'ETF 搜索失败', t0)
    const items = (r.data ?? []).map(row => {
      const it = row as Record<string, unknown>
      return { code: String(it.code ?? ''), name: String(it.name ?? '') }
    })
    return ok({ items, count: items.length, source: 'online' }, `ETF 搜索 ${items.length} 条`, t0)
  }

  private async usRealtime(symbol: string, t0: number) {
    const r = await this.de.usRealtime(symbol)
    if (!r.success) return fail(r.error ?? '美股行情获取失败', t0)
    return ok(r.data?.[0] ?? null, `${symbol} 美股行情`, t0)
  }

  private async usKline(symbol: string, params: Record<string, unknown>, t0: number) {
    const count = params.count != null ? Number(params.count) : 180
    const r = await this.de.usKline(symbol, count)
    if (!r.success) return fail(r.error ?? '美股 K 线获取失败', t0)
    return ok({ symbol, items: r.data ?? [], count: r.data?.length ?? 0 }, `K 线 ${r.data?.length ?? 0} 根`, t0)
  }

  private async usProfile(symbol: string, t0: number) {
    const r = await this.de.usProfile(symbol)
    if (!r.success) return fail(r.error ?? '美股概况获取失败', t0)
    return ok(r.data?.[0] ?? null, `${symbol} 概况`, t0)
  }

  private async usFinancials(symbol: string, params: Record<string, unknown>, t0: number) {
    const reportType = params.report_type != null ? String(params.report_type) : 'annual'
    const r = await this.de.usFinancials(symbol, String(params.report_date ?? ''), reportType)
    if (!r.success) return fail(r.error ?? '美股财报获取失败', t0)
    return ok({ symbol, items: r.data ?? [], count: r.data?.length ?? 0 }, `财报 ${r.data?.length ?? 0} 期`, t0)
  }

  private async usSnapshot(symbol: string, t0: number) {
    const r = await this.de.usSnapshot(symbol)
    if (!r.success) return fail('美股快照获取失败', t0)
    return ok(r.data, '美股快照', t0)
  }

  private async usStockList(params: Record<string, unknown>, t0: number) {
    const keyword = params.keyword != null ? String(params.keyword) : ''
    const r = await this.de.usStockList(keyword)
    if (!r.success) return fail(r.error ?? '美股列表获取失败', t0)
    return ok({ items: r.data ?? [], count: r.data?.length ?? 0 }, `美股列表 ${r.data?.length ?? 0} 条`, t0)
  }

  private async localUsList(params: Record<string, unknown>, t0: number) {
    const limit = params.limit != null ? Number(params.limit) : 5000
    const items = this.marketData.listLocalUsEquities(limit)
    if (items.length) {
      return ok({ items, count: items.length, source: 'local' }, `本地美股 ${items.length} 只`, t0)
    }
    return this.usStockList(params, t0)
  }

  private async searchUsStocks(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const limit = params.limit != null ? Number(params.limit) : 30
    const local = this.marketData.searchLocalUsEquities(keyword, limit)
    if (local.length) {
      return ok({ items: local, count: local.length, source: 'local' }, `美股搜索 ${local.length} 条`, t0)
    }
    const r = await this.de.usStockList(keyword)
    if (!r.success) return fail(r.error ?? '美股搜索失败', t0)
    const items = (r.data ?? []).map(raw => {
      const row = raw as { code?: string; name?: string; market?: string }
      return {
        code: String(row.code ?? ''),
        name: String(row.name ?? row.code ?? ''),
        market: row.market ?? 'US',
      }
    })
    return ok({ items, count: items.length, source: 'online' }, `美股搜索 ${items.length} 条`, t0)
  }

  private async cryptoRealtime(pair: string, t0: number) {
    const r = await this.de.cryptoRealtime(pair)
    if (!r.success) return fail(r.error ?? 'Crypto 行情获取失败', t0)
    return ok(r.data?.[0] ?? null, `${pair} 行情`, t0)
  }

  private async cryptoKline(pair: string, params: Record<string, unknown>, t0: number) {
    const count = params.count != null ? Number(params.count) : 180
    const r = await this.de.cryptoKline(pair, count)
    if (!r.success) return fail(r.error ?? 'Crypto K 线获取失败', t0)
    return ok({ pair, items: r.data ?? [], count: r.data?.length ?? 0 }, `K 线 ${r.data?.length ?? 0} 根`, t0)
  }

  private async cryptoSnapshot(pair: string, t0: number) {
    const r = await this.de.cryptoSnapshot(pair)
    if (!r.success) return fail('Crypto 快照获取失败', t0)
    return ok(r.data, 'Crypto 快照', t0)
  }

  private async cryptoList(params: Record<string, unknown>, t0: number) {
    const keyword = params.keyword != null ? String(params.keyword) : ''
    const r = await this.de.cryptoList(keyword)
    if (!r.success) return fail(r.error ?? 'Crypto 列表获取失败', t0)
    return ok({ items: r.data ?? [], count: r.data?.length ?? 0 }, `Crypto 列表 ${r.data?.length ?? 0} 条`, t0)
  }

  private async localCryptoList(params: Record<string, unknown>, t0: number) {
    const limit = params.limit != null ? Number(params.limit) : 5000
    const items = this.marketData.listLocalCryptoPairs(limit)
    if (items.length) {
      return ok({ items, count: items.length, source: 'local' }, `本地 Crypto ${items.length} 对`, t0)
    }
    return this.cryptoList(params, t0)
  }

  private async searchCryptoPairs(params: Record<string, unknown>, t0: number) {
    const keyword = String(params.keyword ?? params.q ?? '').trim()
    if (keyword.length < 1) return fail('keyword 必填', t0)
    const limit = params.limit != null ? Number(params.limit) : 30
    const local = this.marketData.searchLocalCryptoPairs(keyword, limit)
    if (local.length) {
      return ok({ items: local, count: local.length, source: 'local' }, `Crypto 搜索 ${local.length} 条`, t0)
    }
    const r = await this.de.cryptoList(keyword)
    if (!r.success) return fail(r.error ?? 'Crypto 搜索失败', t0)
    const items = (r.data ?? []).map(raw => {
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
    const scorecardName = String(params.scorecard ?? 'G=B+M')
    const force = params.force === true

    const stored = !force ? this.store.getLatest(code) : null
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

    const snap = await this.ee.analyze(code)
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
