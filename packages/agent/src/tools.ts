import type { ResearchHub } from '@inno-a-stock/research-hub'

export interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string; items?: unknown; default?: unknown }>
  required?: string[]
}

export interface ToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

export interface OpenAiTool {
  type: 'function'
  function: { name: string; description: string; parameters: JsonSchema }
}

export class ToolRegistry {
  readonly tools: ToolDef[]

  constructor(private hub: ResearchHub) {
    this.tools = this.buildTools()
  }

  list() { return this.tools }

  get(name: string) { return this.tools.find(t => t.name === name) }

  openAiTools(): OpenAiTool[] {
    return this.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
  }

  async call(name: string, args: Record<string, unknown> = {}) {
    const tool = this.get(name)
    if (!tool) return { error: `Unknown tool: ${name}` }
    try {
      const result = await tool.handler(args)
      return result
    } catch (e) {
      return { error: String(e) }
    }
  }

  systemPrompt() {
    return [
      '你是 innoAStock A股投研助手。根据用户问题主动调用工具获取数据，再基于结果用中文给出简洁、专业的分析。',
      '规则：',
      '- 需要数据时必须先调用工具，不要编造数字',
      '- 不推荐具体买卖，仅提供研究与数据解读',
      '- 可组合多个工具完成复杂问题',
      '- 工具返回 JSON 时提取关键字段组织回答',
    ].join('\n')
  }

  private dispatch(feature: string, params: Record<string, unknown>) {
    return this.hub.dispatch(feature, params)
  }

  private buildTools(): ToolDef[] {
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    return [
      {
        name: 'evaluate_stock', category: '个股分析',
        description: '对单只股票做全面因子评估与评分卡打分',
        parameters: S({
          code: { type: 'string', description: '6位股票代码，如 600519' },
          scorecard: { type: 'string', description: '评分卡名称，默认综合评估' },
        }, ['code']),
        handler: a => d('stock_diagnosis', { code: a.code, scorecard: a.scorecard ?? '综合评估' }),
      },
      {
        name: 'screen_stocks', category: '选股',
        description: '按因子条件筛选股票并返回评分排序结果',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]，op 为 > >= < <= =' },
          scorecard: { type: 'string', description: '评分卡' },
          top_n: { type: 'number', description: '返回条数，默认20' },
        }, ['conditions']),
        handler: a => d('screening', { conditions: a.conditions, scorecard: a.scorecard, top_n: a.top_n ?? 20 }),
      },
      {
        name: 'analyze_portfolio', category: '组合管理',
        description: '分析持仓组合的因子暴露与综合评分',
        parameters: S({
          holdings: { type: 'array', description: '持仓 [[code, weight], ...] weight 为 0-1 小数' },
          scorecard: { type: 'string', description: '评分卡' },
        }, ['holdings']),
        handler: a => d('portfolio_analysis', { holdings: a.holdings, scorecard: a.scorecard }),
      },
      {
        name: 'search_stocks', category: '通用',
        description: '按代码或名称关键词搜索 A 股',
        parameters: S({ keyword: { type: 'string', description: '搜索关键词' } }, ['keyword']),
        handler: a => d('search_stocks', { keyword: a.keyword }),
      },
      {
        name: 'get_strategy_signal', category: '策略',
        description: '获取单股 9 策略融合信号（看多/看空/中性）',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: a => d('strategy_signal', { code: a.code }),
      },
      {
        name: 'institution_rating', category: '个股分析',
        description: '28 家机构风格综合评级与共识',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          groups: { type: 'array', description: '可选机构分组过滤' },
        }, ['code']),
        handler: a => d('institution_rating', { code: a.code, groups: a.groups }),
      },
      {
        name: 'get_closing_report', category: '报告',
        description: '生成 A 股收盘市场报告',
        parameters: S({}),
        handler: () => d('market_report', { type: 'closing' }),
      },
      {
        name: 'get_morning_brief', category: '报告',
        description: '生成 A 股开盘早报',
        parameters: S({}),
        handler: () => d('market_report', { type: 'morning' }),
      },
      {
        name: 'run_backtest', category: '策略',
        description: '对指定股票列表做因子/评分卡 IC 回测',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表' },
          scorecard: { type: 'string', description: '评分卡' },
          periods: { type: 'number', description: '回测期数' },
        }, ['codes']),
        handler: a => d('backtest', { codes: a.codes, scorecard: a.scorecard, periods: a.periods ?? 5 }),
      },
      {
        name: 'strategy_verify', category: '策略',
        description: '验证策略历史信号胜率与 forward 收益',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          checkpoints: { type: 'number', description: '验证点数' },
          forward_days: { type: 'number', description: '持有天数' },
        }, ['code']),
        handler: a => d('strategy_verify', {
          code: a.code, checkpoints: a.checkpoints ?? 30, forward_days: a.forward_days ?? 5,
        }),
      },
      {
        name: 'strategy_verify_report', category: '策略',
        description: '策略验证的格式化文本报告',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          checkpoints: { type: 'number', description: '验证点数' },
        }, ['code']),
        handler: a => d('strategy_verify_report', { code: a.code, checkpoints: a.checkpoints ?? 30 }),
      },
      {
        name: 'strategy_report', category: '策略',
        description: '单股 T 策略综合分析文本报告',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: a => d('strategy_report', { code: a.code }),
      },
      {
        name: 'institution_report', category: '个股分析',
        description: '机构评级完整文本报告',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          groups: { type: 'array', description: '机构分组' },
        }, ['code']),
        handler: a => d('institution_report', { code: a.code, groups: a.groups }),
      },
      {
        name: 'industry_mining', category: '报告',
        description: '产业链透视与代表公司',
        parameters: S({ industry: { type: 'string', description: '行业名称，如 半导体' } }, ['industry']),
        handler: a => d('industry_mining', { industry: a.industry }),
      },
      {
        name: 'industry_mermaid', category: '报告',
        description: '产业链 Mermaid mindmap 源码',
        parameters: S({ industry: { type: 'string', description: '行业名称' } }, ['industry']),
        handler: a => d('industry_mermaid', { industry: a.industry }),
      },
      {
        name: 'get_latest_evaluation', category: '通用',
        description: '读取本地最近一次的因子评估快照',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: a => d('latest_evaluation', { code: a.code }),
      },
      {
        name: 'portfolio_trades', category: '组合管理',
        description: '查询交易账本记录',
        parameters: S({ code: { type: 'string', description: '可选，按代码过滤' } }),
        handler: a => d('portfolio_trades', { code: a.code ?? '' }),
      },
      {
        name: 'portfolio_summary', category: '组合管理',
        description: '持仓盈亏与账本汇总',
        parameters: S({}),
        handler: () => d('portfolio_summary', {}),
      },
      {
        name: 'writer_prepare', category: '写作',
        description: '采集写作数据并生成 LLM Prompt',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          type: { type: 'string', description: '文章类型 value/growth/event 等' },
          persona: { type: 'string', description: '写作人格' },
        }, ['code']),
        handler: a => d('writer_prompt', { code: a.code, type: a.type ?? 'value', persona: a.persona }),
      },
      {
        name: 'writer_format', category: '写作',
        description: 'Markdown 排版为微信公众号 HTML',
        parameters: S({
          markdown: { type: 'string', description: 'Markdown 正文' },
          theme: { type: 'string', description: '排版主题' },
        }, ['markdown']),
        handler: a => d('writer_format', { markdown: a.markdown, theme: a.theme }),
      },
      {
        name: 'writer_publish', category: '写作',
        description: '推送文章到微信公众号草稿箱',
        parameters: S({
          markdown: { type: 'string', description: 'Markdown 正文' },
          theme: { type: 'string', description: '排版主题' },
          title: { type: 'string', description: '标题' },
          code: { type: 'string', description: '关联股票代码' },
        }, ['markdown']),
        handler: a => d('writer_publish', {
          markdown: a.markdown, theme: a.theme, title: a.title,
          code: a.code, name: a.name, type: a.type, persona: a.persona,
        }),
      },
    ]
  }
}
