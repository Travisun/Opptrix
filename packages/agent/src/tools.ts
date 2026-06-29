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

/** 发现页 Agent 挖掘阶段可调用的本地数据与分析工具 */
export const DISCOVER_MINING_TOOL_NAMES = [
  'get_market_db_status',
  'get_market_db_sync_state',
  'list_local_screen_factors',
  'local_screen_stocks',
  'get_industry_stats',
  'batch_stock_snapshots',
  'get_stock_quotes',
  'get_watchlist_radar',
  'get_stock_kline',
  'get_stock_cyq',
  'get_stock_chart',
  'get_stock_detail',
  'evaluate_stock',
  'get_strategy_signal',
  'get_latest_evaluation',
] as const

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
      '- 优先使用本地数据工具（get_market_db_status、batch_stock_snapshots、get_stock_quotes 等），由本地执行分析与拉取，减少无效上下文',
      '- 批量查询时用 codes 数组一次调用，避免逐只重复请求',
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
        description: '按因子条件筛选股票（优先本地 L0 初选库，未就绪时在线扫描）',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]，op 为 > >= < <= =' },
          scorecard: { type: 'string', description: '评分卡' },
          top_n: { type: 'number', description: '返回条数，默认20' },
        }, ['conditions']),
        handler: a => d('screening', { conditions: a.conditions, scorecard: a.scorecard, top_n: a.top_n ?? 20 }),
      },
      {
        name: 'get_market_db_status', category: '本地数据',
        description: '查询本地初选数据库就绪状态、股票数量、因子日期与 bootstrap 覆盖率',
        parameters: S({}),
        handler: () => d('market_db_status', {}),
      },
      {
        name: 'list_local_screen_factors', category: '本地数据',
        description: '列出本地初选库可用于筛选的因子字段（PE/ROE/动量/量比等）',
        parameters: S({}),
        handler: () => d('list_screen_factors', {}),
      },
      {
        name: 'local_screen_stocks', category: '本地数据',
        description: '使用本地 L0 因子库快速初选，不拉取全市场在线数据',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]' },
          top_n: { type: 'number', description: '返回条数，默认60' },
        }, ['conditions']),
        handler: a => d('screening', { conditions: a.conditions, scorecard: '综合评估', top_n: a.top_n ?? 60 }),
      },
      {
        name: 'get_industry_stats', category: '本地数据',
        description: '本地行业截面统计：股票数、均分、均 PE/PB',
        parameters: S({
          trade_date: { type: 'string', description: '可选交易日 YYYY-MM-DD' },
        }),
        handler: a => d('market_industry_stats', { trade_date: a.trade_date }),
      },
      {
        name: 'batch_stock_snapshots', category: '本地数据',
        description: '批量获取候选股的本地截面快照（行业、评分、估值、初选因子）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表，建议不超过80' },
        }, ['codes']),
        handler: a => d('batch_stock_snapshots', { codes: a.codes }),
      },
      {
        name: 'get_market_db_sync_state', category: '本地数据',
        description: '查询本地数据同步任务进度与最近更新时间',
        parameters: S({}),
        handler: () => d('market_db_sync_state', {}),
      },
      {
        name: 'get_stock_quotes', category: '本地数据',
        description: '批量获取股票实时行情（价量、涨跌幅）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表' },
        }, ['codes']),
        handler: a => d('stock_quotes', { codes: a.codes }),
      },
      {
        name: 'get_watchlist_radar', category: '本地数据',
        description: '关注列表雷达：行情 + 策略信号摘要',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表，空则返回默认关注' },
        }),
        handler: a => d('watchlist_radar', { codes: a.codes }),
      },
      {
        name: 'get_stock_kline', category: '本地数据',
        description: '获取单股日 K 线序列（本地/在线）',
        parameters: S({
          code: { type: 'string', description: '6位股票代码' },
          count: { type: 'number', description: 'K线根数，默认90，最大240' },
        }, ['code']),
        handler: a => d('stock_kline', { code: a.code, count: a.count ?? 90 }),
      },
      {
        name: 'get_stock_cyq', category: '本地数据',
        description: '获取单股筹码分布（CYQ）',
        parameters: S({ code: { type: 'string', description: '6位股票代码' } }, ['code']),
        handler: a => d('stock_cyq', { code: a.code }),
      },
      {
        name: 'get_stock_chart', category: '本地数据',
        description: '获取单股多周期图表数据（日/周/月/分钟）',
        parameters: S({
          code: { type: 'string', description: '6位股票代码' },
          period: { type: 'string', description: '周期：daily/weekly/monthly/1m/5m 等' },
          count: { type: 'number', description: '返回条数，0 为默认' },
        }, ['code']),
        handler: a => d('stock_chart', { code: a.code, period: a.period ?? 'daily', count: a.count ?? 0 }),
      },
      {
        name: 'get_stock_detail', category: '本地数据',
        description: '获取单股详情：行情、基本面、财务、新闻、资金流等聚合',
        parameters: S({ code: { type: 'string', description: '6位股票代码' } }, ['code']),
        handler: a => d('stock_detail', { code: a.code }),
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
