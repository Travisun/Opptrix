import { AshareEngine } from '@ni-k/a-stock-layer'
import { ConsolidatedEngine, formatInstitutionReport } from '@ni-k/institutions'
import { ClosingReport, IndustryMining, MorningBrief, mermaidIndustryChain } from '@ni-k/skills'
import {
  EvaluationEngine, createScorecard, Screener, PortfolioAnalyzer,
  REGISTRY, BacktestEngine, SnapshotStore, IndustryNeutralizer,
} from '@ni-k/stock-eval'
import { ok, fail, type ResearchResult } from '@ni-k/shared'
import { quickAssess, verifyStrategy } from '@ni-k/t-strategy'
import { fetchArticleData, listArticleTypes, StockWriter, listPersonas, formatArticle, publishArticle, loadWriterConfig, saveWriterConfig, listHistory, listThemes } from '@ni-k/stock-writer'
import { serializeInstitutionData } from './serialize.js'
import { formatVerificationReport, generateStrategyReport } from '@ni-k/t-strategy'

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
    const list = await this.de.stockList()
    if (!list.success || !list.data) return fail('无法获取股票列表', t0)
    const results = list.data.filter(s => s.code.includes(keyword) || s.name.includes(keyword) || s.industry.includes(keyword)).slice(0, 30)
    return ok({ keyword, results }, `找到 ${results.length} 只`, t0)
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
    const data = await fetchArticleData(this.de, code, type as import('@ni-k/stock-writer').ArticleType)
    return ok(data, `${data.name} ${data.templateName} 数据采集`, t0)
  }

  private async writerPrompt(code: string, type: string, persona: string | undefined, t0: number) {
    const writer = new StockWriter(this.de)
    const { data, prompt } = await writer.prepare(code, type as import('@ni-k/stock-writer').ArticleType, { persona })
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
