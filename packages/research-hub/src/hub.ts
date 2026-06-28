import { AshareEngine, computeIndicators, normalizeCode, searchQuote } from '@inno-a-stock/a-stock-layer'
import type { StockListItem } from '@inno-a-stock/shared'
import { ConsolidatedEngine, formatInstitutionReport } from '@inno-a-stock/institutions'
import { ClosingReport, IndustryMining, MorningBrief, mermaidIndustryChain } from '@inno-a-stock/skills'
import {
  EvaluationEngine, createScorecard, Screener, PortfolioAnalyzer,
  REGISTRY, BacktestEngine, SnapshotStore, IndustryNeutralizer,
} from '@inno-a-stock/stock-eval'
import { ok, fail, type ResearchResult } from '@inno-a-stock/shared'
import { quickAssess, verifyStrategy } from '@inno-a-stock/t-strategy'
import { fetchArticleData, listArticleTypes, StockWriter, listPersonas, formatArticle, publishArticle, loadWriterConfig, saveWriterConfig, listHistory, listThemes } from '@inno-a-stock/stock-writer'
import { serializeInstitutionData } from './serialize.js'
import { formatVerificationReport, generateStrategyReport } from '@inno-a-stock/t-strategy'

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
        case 'stock_kline': return this.stockKline(String(params.code), Number(params.count ?? 90), t0)
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
        case 'writer_fetch': return this.writerFetch(String(params.code), String(params.type ?? 'value'), t0)
        case 'writer_types': return ok({ types: listArticleTypes() }, '文章类型列表', t0)
        case 'portfolio_trades': return this.portfolioTrades(String(params.code ?? ''), t0)
        case 'portfolio_summary': return this.portfolioSummary(t0)
        case 'writer_prompt': return this.writerPrompt(String(params.code), String(params.type ?? 'value'), params.persona as string | undefined, t0)
        case 'writer_personas': return ok({ personas: listPersonas() }, '写作人格列表', t0)
        case 'writer_format': return this.writerFormat(String(params.markdown ?? ''), params.theme as string | undefined, t0)
        case 'writer_publish': return this.writerPublish(params, t0)
        case 'writer_config': return ok(loadWriterConfig(), 'Writer 配置', t0)
        case 'writer_config_save': return this.writerConfigSave(params, t0)
        case 'writer_history': return ok({ history: listHistory(Number(params.limit ?? 20)) }, '写作历史', t0)
        case 'writer_themes': return ok({ themes: listThemes() }, '排版主题列表', t0)
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
    const data = await this.screener.run(params.conditions as never[], String(params.scorecard ?? '综合评估'), Number(params.top_n ?? 20))
    return ok({
      total_scanned: data.totalScanned, passed: data.passed, scorecard: data.scorecard,
      items: data.items.map(i => ({ code: i.code, name: i.name, total_score: i.total_score, key_factors: i.key_factors })),
    }, `扫描 ${data.totalScanned} 通过 ${data.passed}`, t0)
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

  private async stockQuotes(codes: string[] | undefined, t0: number) {
    const normalized = [...new Set((codes ?? []).map(c => String(c).padStart(6, '0')).filter(Boolean))]
    if (!normalized.length) return ok({ quotes: [] }, '暂无自选', t0)
    const result = await this.de.batchRealtime(normalized)
    if (!result.success) return fail(result.error ?? '行情获取失败', t0)
    return ok({ quotes: result.data ?? [] }, `更新 ${result.data?.length ?? 0} 只`, t0)
  }

  private async stockKline(code: string, count: number, t0: number) {
    const safeCount = Math.max(20, Math.min(count, 240))
    const result = await this.de.kline(code, safeCount)
    if (!result.success) return fail(result.error ?? 'K线获取失败', t0)
    return ok({ code, klines: result.data ?? [] }, `${code} K线 ${result.data?.length ?? 0} 根`, t0)
  }

  private async stockDetail(code: string, t0: number) {
    const [quoteR, profileR, financialR, financialQR, newsR, dividendR, moneyFlowR, shareholdersR] = await Promise.all([
      this.de.realtime(code),
      this.de.profile(code),
      this.de.financials(code),
      this.de.financialsQuarterly(code),
      this.de.news(code, 1, 20),
      this.de.dividend(code),
      this.de.moneyFlow(code),
      this.de.shareholders(code),
    ])

    const quoteRaw = quoteR.data?.[0] ?? null
    const quote = quoteRaw ? this.enrichQuote(quoteRaw) : null
    const profile = profileR.data?.[0] ?? null
    const financial = financialR.data?.[0] ?? null
    const name = quote?.name ?? profile?.name ?? code

    return ok({
      code,
      name,
      quote,
      profile,
      financial,
      financialHistory: financialQR.data ?? [],
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
    const name = quote?.name ?? normalized

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

    return ok({
      code: normalized,
      name,
      period,
      preClose,
      isTradingDay: this.isCnTradingDayCandidate(),
      hasMore: fetched.hasMore,
      bars,
      indicators,
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

  private async writerFetch(code: string, type: string, t0: number) {
    const data = await fetchArticleData(this.de, code, type as import('@inno-a-stock/stock-writer').ArticleType)
    return ok(data, `${data.name} ${data.templateName} 数据采集`, t0)
  }

  private async writerPrompt(code: string, type: string, persona: string | undefined, t0: number) {
    const writer = new StockWriter(this.de)
    const { data, prompt } = await writer.prepare(code, type as import('@inno-a-stock/stock-writer').ArticleType, { persona })
    return ok({ data, prompt, meta: prompt.meta }, `${data.name} 写作 Prompt`, t0)
  }

  private writerFormat(markdown: string, theme: string | undefined, t0: number) {
    if (!markdown.trim()) return fail('markdown required', t0)
    const result = formatArticle(markdown, theme)
    return ok(result, '微信排版完成', t0)
  }

  private async writerPublish(params: Record<string, unknown>, t0: number) {
    const markdown = String(params.markdown ?? '')
    if (!markdown.trim()) return fail('markdown required', t0)
    const result = await publishArticle({
      markdown,
      theme: params.theme as string | undefined,
      title: params.title as string | undefined,
      digest: params.digest as string | undefined,
      coverPath: params.cover_path as string | undefined,
      stockCode: params.code as string | undefined,
      stockName: params.name as string | undefined,
      articleType: params.type as string | undefined,
      persona: params.persona as string | undefined,
      skipPublish: params.skip_publish as boolean | undefined,
    })
    return ok(result, result.message, t0)
  }

  private writerConfigSave(params: Record<string, unknown>, t0: number) {
    const saved = saveWriterConfig({
      theme: params.theme as string | undefined,
      skip_publish: params.skip_publish as boolean | undefined,
      wechat: {
        appid: params.appid as string | undefined,
        secret: params.secret as string | undefined,
        author: params.author as string | undefined,
      },
    })
    return ok(saved, 'Writer 配置已保存', t0)
  }

  private async strategyReport(code: string, t0: number) {
    const text = await generateStrategyReport(this.de, code)
    return ok({ code, report_type: 'strategy_report', text }, 'T策略分析报告', t0)
  }

  private async portfolioTrades(code: string, t0: number) {
    const trades = this.de.portfolio.trades(code)
    return ok({ trades, count: trades.length }, `交易记录 ${trades.length} 条`, t0)
  }

  private async portfolioSummary(t0: number) {
    const summary = await this.de.portfolio.summary(true)
    return ok(summary, `持仓 ${summary.holdingsCount} 只`, t0)
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
