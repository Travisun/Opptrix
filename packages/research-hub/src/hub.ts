import { AshareEngine, computeIndicators, normalizeCode, searchQuote, loadTushareConfig, saveTushareConfig, publicTushareConfig, testTushareConnection } from '@inno-a-stock/a-stock-layer'
import type { StockListItem } from '@inno-a-stock/shared'
import { ConsolidatedEngine, formatInstitutionReport } from '@inno-a-stock/institutions'
import { ClosingReport, IndustryMining, MorningBrief, mermaidIndustryChain } from '@inno-a-stock/skills'
import {
  EvaluationEngine, createScorecard, Screener, PortfolioAnalyzer,
  REGISTRY, BacktestEngine, SnapshotStore, IndustryNeutralizer,
} from '@inno-a-stock/stock-eval'
import { getMarketDataService } from '@inno-a-stock/market-data'
import { ok, fail, type ResearchResult } from '@inno-a-stock/shared'
import { quickAssess, verifyStrategy } from '@inno-a-stock/t-strategy'
import { serializeInstitutionData } from './serialize.js'
import { formatVerificationReport, generateStrategyReport } from '@inno-a-stock/t-strategy'

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
  readonly de = new AshareEngine()
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
  readonly marketData = getMarketDataService()
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
        case 'market_industry_stats': return this.marketIndustryStats(params, t0)
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
          t0,
        )
        case 'stock_detail': return this.stockDetail(String(params.code), t0)
        case 'backtest': return this.runBacktest(params, t0)
        case 'latest_evaluation': return this.latestEvaluation(String(params.code), t0)
        case 'portfolio_trades': return this.portfolioTrades(String(params.code ?? ''), t0)
        case 'portfolio_holdings': return this.portfolioHoldings(t0)
        case 'portfolio_summary': return this.portfolioSummary(t0)
        case 'tushare_config': return ok(publicTushareConfig(), 'Tushare 配置', t0)
        case 'tushare_config_save': return this.tushareConfigSave(params, t0)
        case 'tushare_test': return this.tushareTest(params, t0)
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

  private async marketDbSync(params: Record<string, unknown>, t0: number) {
    const force = params.force === true
    const modeRaw = params.mode != null ? String(params.mode) : 'auto'
    const maxStocks = params.max_stocks != null ? Number(params.max_stocks) : undefined
    const jobs = Array.isArray(params.jobs) ? (params.jobs as string[]) : undefined
    const profile = params.profile != null ? String(params.profile) : undefined

    let result: Awaited<ReturnType<typeof this.marketData.syncAdaptive>>
    let planLabel: string

    if (force || modeRaw === 'full') {
      const r = await this.marketData.sync({
        mode: 'full',
        maxStocks,
        jobs,
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
    const items = this.marketData.industryStats(tradeDate)
    return ok({ items, trade_date: tradeDate ?? this.marketData.status().latest_factor_date }, '行业统计', t0)
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
    const data = await quickAssess(this.de, code)
    return ok(data, `${code} ${data.summary}`, t0)
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

  private async searchStocks(keyword: string, t0: number) {
    const raw = keyword.trim()
    if (!raw) return ok({ keyword: raw, results: [] as StockListItem[] }, '请输入关键词', t0)

    const query = /^\d+$/.test(raw)
      ? (raw.length >= 6 ? normalizeCode(raw) : raw)
      : raw
    const found = await searchQuote(query, 30)
    const items = found == null ? [] : (Array.isArray(found) ? found : [found])
    const results: StockListItem[] = items
      .filter(q => q.marketType === 'AStock')
      .map(q => {
        const code = normalizeCode(q.code)
        return {
          code,
          name: q.name,
          industry: '',
          market: code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ',
        }
      })
      .slice(0, 30)

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
    const result = await this.de.batchRealtime(normalized)
    if (!result.success) return fail(result.error ?? '行情获取失败', t0)
    const quotes = (result.data ?? []).map(q => ({
      ...q,
      name: this.resolveStockName(q.code, q.name),
    }))
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
      const batch = await this.de.batchRealtime(normalized)
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
        : await this.de.realtime(code)
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
      this.de.realtime(code),
      this.de.profile(code),
      this.de.financials(code),
      this.de.financials(code, '', 'all'),
      this.de.news(code, 1, 20),
      this.de.dividend(code),
      this.de.moneyFlow(code),
      this.de.shareholders(code),
    ])

    const quoteRaw = quoteR.data?.[0] ?? null
    const quote = quoteRaw ? this.enrichQuote(quoteRaw) : null
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

  private enrichQuote(quote: NonNullable<Awaited<ReturnType<AshareEngine['realtime']>>['data']>[0]) {
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

  private cnTodayString(): string {
    const cn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    const y = cn.getFullYear()
    const m = String(cn.getMonth() + 1).padStart(2, '0')
    const d = String(cn.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
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
  ): Promise<{ klines: import('@inno-a-stock/shared').StockKline[]; hasMore: boolean } | null> {
    const step = 200
    const cap = this.minuteMaxBars(period)

    if (tail > 0) {
      const olderR = await this.de.minuteKline(code, period, step, tail)
      const recentR = await this.de.minuteKline(code, period, Math.min(tail, 800), 0)
      if (!recentR.success || !recentR.data?.length) return null
      const older = olderR.success ? (olderR.data ?? []) : []
      const anchor = before || recentR.data[0].date
      const merged = this.mergeKlineByTime(older, recentR.data, anchor).slice(-cap)
      return {
        klines: merged,
        hasMore: older.length >= step && merged.length < cap,
      }
    }

    const r = await this.de.minuteKline(code, period, Math.min(safeCount, 800), 0)
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
  ): Promise<{ klines: import('@inno-a-stock/shared').StockKline[]; hasMore: boolean } | null> {
    if (this.isMinutePeriod(period)) {
      return this.fetchMinuteChartKlines(code, period, safeCount, before, tail)
    }

    const klinePeriod = period === 'daily' ? 'daily' : period
    if (before) {
      const step = 200
      const endDay = this.dayBefore(before.slice(0, 10))
      let olderR = await this.de.kline(code, klinePeriod, '', endDay, step)
      let older = (olderR.data ?? []).filter(b => b.date < before)
      if (!older.length) {
        olderR = await this.de.kline(code, klinePeriod, '', before.slice(0, 10), step)
        older = (olderR.data ?? []).filter(b => b.date < before)
      }
      const recentCount = Math.max(tail, safeCount, 240)
      const recentR = await this.de.kline(code, klinePeriod, '', '', recentCount)
      if (!recentR.success || !recentR.data?.length) return null
      const merged = this.mergeKlineByTime(older, recentR.data, before)
      return {
        klines: merged.slice(-800),
        hasMore: older.length >= step,
      }
    }

    const klineR = await this.de.kline(code, klinePeriod, '', '', safeCount)
    if (!klineR.success || !klineR.data?.length) return null
    return {
      klines: klineR.data,
      hasMore: klineR.data.length >= safeCount && safeCount < 800,
    }
  }

  private async stockChart(
    code: string,
    period: string,
    count: number,
    before: string,
    tail: number,
    t0: number,
  ) {
    const normalized = code.padStart(6, '0')
    const cap = this.isMinutePeriod(period) ? this.minuteMaxBars(period) : 800
    const safeCount = Math.max(20, Math.min(count || this.defaultChartCount(period), cap))
    const quoteR = await this.de.realtime(code)
    const quote = quoteR.data?.[0] ?? null
    const preClose = quote?.preClose ?? null
    const name = this.resolveStockName(code, quote?.name)

    if (period === 'intraday') {
      if (!this.isCnTradingDayCandidate()) {
        return ok({
          code: normalized,
          name,
          period,
          preClose,
          isTradingDay: false,
          bars: [],
          indicators: [],
        }, `${name} 非交易日`, t0)
      }

      const intradayR = await this.de.intradayTick(code)
      const raw = intradayR.data ?? []
      const today = this.cnTodayString()
      let cumAmount = 0
      let cumVolume = 0
      const bars = raw.map(row => {
        const timeText = String(row.time ?? '')
        const price = Number(row.price ?? 0)
        const volume = Number(row.volume ?? 0)
        const amount = Number(row.amount ?? 0)
        cumAmount += amount
        cumVolume += volume
        const avgPrice = cumVolume > 0 ? cumAmount / cumVolume : price
        const stamp = timeText.includes('-')
          ? timeText
          : `${today} ${timeText.length <= 5 ? `${timeText}:00` : timeText}`
        return {
          time: stamp,
          price,
          volume,
          amount,
          avgPrice,
        }
      })

      return ok({
        code: normalized,
        name,
        period,
        preClose,
        isTradingDay: bars.length > 0,
        hasMore: false,
        bars: this.sortChartBars(bars),
        indicators: [],
      }, `${name} 分时 ${bars.length} 点`, t0)
    }

    const fetched = await this.fetchChartKlines(normalized, period, safeCount, before, tail)
    if (!fetched?.klines.length) {
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
    const saved = saveTushareConfig({
      enabled: params.enabled === true,
      token: tokenRaw === undefined || tokenRaw === null
        ? current.token
        : String(tokenRaw).trim(),
    })
    this.de.clearCache()
    return ok(publicTushareConfig(saved), 'Tushare 配置已保存', t0)
  }

  private async tushareTest(params: Record<string, unknown>, t0: number) {
    const token = params.token != null ? String(params.token).trim() : loadTushareConfig().token
    const result = await testTushareConnection(token)
    return ok(result, result.ok ? result.message : `连接失败: ${result.message}`, t0)
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
    const items = Array.isArray(params.items) ? params.items as import('@inno-a-stock/a-stock-layer').WatchlistItem[] : []
    const saved = this.de.watchlist.replace(items)
    return ok({ items: saved, count: saved.length }, `已保存关注 ${saved.length} 只`, t0)
  }

  private async latestEvaluation(code: string, t0: number) {
    const stored = this.store.getLatest(code)
    if (stored) {
      return ok({
        code: stored.code, name: stored.name, timestamp: stored.timestamp,
        scorecard: stored.scorecardName, total_score: stored.totalScore,
        factors: stored.factorValues, from_store: true,
      }, '最新评估（缓存）', t0)
    }
    const snap = await this.ee.analyze(code)
    createScorecard('综合评估').score([snap])
    this.store.save(snap, '综合评估')
    return ok({
      code: snap.code, name: snap.name, timestamp: new Date().toISOString(),
      scorecard: '综合评估', total_score: snap.totalScore,
      factors: Object.fromEntries(Object.entries(snap.factors).map(([k, v]) => [k, v?.value ?? null])),
    }, '最新评估', t0)
  }
}

export { ResearchHub as default }
