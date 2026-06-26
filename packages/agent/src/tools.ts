import type { ResearchHub } from '@ni-k/research-hub'

export interface ToolDef {
  name: string
  description: string
  category: string
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

export class ToolRegistry {
  readonly tools: ToolDef[]

  constructor(private hub: ResearchHub) {
    this.tools = this.buildTools()
  }

  list() { return this.tools }

  get(name: string) { return this.tools.find(t => t.name === name) }

  async call(name: string, args: Record<string, unknown> = {}) {
    const tool = this.get(name)
    if (!tool) return null
    return tool.handler(args)
  }

  systemPrompt() {
    const lines = ['你是一个A股投研助手。你可以使用以下工具帮助用户分析股票。\n']
    for (const cat of [...new Set(this.tools.map(t => t.category))]) {
      lines.push(`\n## ${cat}`)
      for (const t of this.tools.filter(x => x.category === cat)) {
        lines.push(`\n- ${t.name}: ${t.description}`)
      }
    }
    lines.push('\n用中文回答，简洁专业，不推荐买卖，仅提供数据和分析。')
    return lines.join('')
  }

  private dispatch(feature: string, params: Record<string, unknown>) {
    return this.hub.dispatch(feature, params)
  }

  private buildTools(): ToolDef[] {
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    return [
      { name: 'evaluate_stock', category: '个股分析', description: '全面因子评估+评分',
        handler: a => d('stock_diagnosis', { code: a.code, scorecard: a.scorecard ?? '综合评估' }) },
      { name: 'screen_stocks', category: '选股', description: '多条件因子筛选',
        handler: a => d('screening', { conditions: a.conditions, scorecard: a.scorecard, top_n: a.top_n }) },
      { name: 'analyze_portfolio', category: '组合管理', description: '组合因子暴露分析',
        handler: a => d('portfolio_analysis', { holdings: a.holdings }) },
      { name: 'search_stocks', category: '通用', description: '搜索股票',
        handler: a => d('search_stocks', { keyword: a.keyword }) },
      { name: 'get_strategy_signal', category: '策略', description: '9策略综合信号',
        handler: a => d('strategy_signal', { code: a.code }) },
      { name: 'institution_rating', category: '个股分析', description: '28机构综合评级',
        handler: a => d('institution_rating', { code: a.code, groups: a.groups }) },
      { name: 'get_closing_report', category: '报告', description: '收盘报告',
        handler: () => d('market_report', { type: 'closing' }) },
      { name: 'get_morning_brief', category: '报告', description: '开盘早报',
        handler: () => d('market_report', { type: 'morning' }) },
      { name: 'run_backtest', category: '策略', description: '因子/评分卡 IC 回测',
        handler: a => d('backtest', { codes: a.codes, scorecard: a.scorecard, periods: a.periods }) },
      { name: 'strategy_verify', category: '策略', description: '策略历史信号验证',
        handler: a => d('strategy_verify', { code: a.code, checkpoints: a.checkpoints, forward_days: a.forward_days }) },
      { name: 'strategy_verify_report', category: '策略', description: '策略验证文本报告',
        handler: a => d('strategy_verify_report', { code: a.code, checkpoints: a.checkpoints }) },
      { name: 'strategy_report', category: '策略', description: 'T策略全分析报告(文本)',
        handler: a => d('strategy_report', { code: a.code }) },
      { name: 'institution_report', category: '个股分析', description: '机构评级文本报告',
        handler: a => d('institution_report', { code: a.code, groups: a.groups }) },
      { name: 'industry_mining', category: '报告', description: '产业链透视',
        handler: a => d('industry_mining', { industry: a.industry }) },
      { name: 'industry_mermaid', category: '报告', description: '产业链 Mermaid mindmap',
        handler: a => d('industry_mermaid', { industry: a.industry }) },
      { name: 'get_latest_evaluation', category: '通用', description: '最近评估记录',
        handler: a => d('latest_evaluation', { code: a.code }) },
      { name: 'portfolio_trades', category: '组合管理', description: '交易账本记录',
        handler: a => d('portfolio_trades', { code: a.code ?? '' }) },
      { name: 'portfolio_summary', category: '组合管理', description: '持仓盈亏汇总',
        handler: () => d('portfolio_summary', {}) },
      { name: 'writer_prepare', category: '写作', description: '投研文章数据采集+Prompt',
        handler: a => d('writer_prompt', { code: a.code, type: a.type ?? 'value', persona: a.persona }) },
      { name: 'writer_format', category: '写作', description: 'Markdown排版为微信HTML',
        handler: a => d('writer_format', { markdown: a.markdown, theme: a.theme }) },
      { name: 'writer_publish', category: '写作', description: '推送文章到微信草稿箱',
        handler: a => d('writer_publish', {
          markdown: a.markdown, theme: a.theme, title: a.title,
          code: a.code, name: a.name, type: a.type, persona: a.persona,
        }) },
    ]
  }
}
