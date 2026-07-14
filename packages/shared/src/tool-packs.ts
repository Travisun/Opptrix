/**
 * Agent MCP 工具包（Tool Pack）注册表 — 聊天路由加载的单一事实源。
 *
 * 约定：每个工具恰好属于一个主 pack；core / meta 每轮始终加载。
 * Discover 挖掘组可引用同一 pack 定义，避免双源漂移。
 */

export const TOOL_PACK_IDS = [
  'core',
  'meta',
  'instrument_analytics',
  'fundamentals',
  'market',
  'etf',
  'portfolio',
  'industry',
  'news',
  'strategy_extra',
  'provider_ext',
] as const

export type ToolPackId = (typeof TOOL_PACK_IDS)[number]

export interface ToolPackDef {
  id: ToolPackId
  title: string
  /** 一句话说明（system pack 目录） */
  description: string
  /** 何时 activate / 何时播种 */
  whenToUse: string
  /** 每轮始终加载 */
  alwaysOn?: boolean
}

export const TOOL_PACK_DEFS: readonly ToolPackDef[] = [
  {
    id: 'core',
    title: '核心查询',
    description: '搜索、快照、行情、能力探测、时间与交互确认',
    whenToUse: '几乎所有投研问题的入口',
    alwaysOn: true,
  },
  {
    id: 'meta',
    title: '工具包管理',
    description: '列出与按需激活其它工具包',
    whenToUse: '当前工具不足、需深挖专题时',
    alwaysOn: true,
  },
  {
    id: 'instrument_analytics',
    title: '标的深度分析',
    description: '评估、策略信号、指标、筹码、机构评级等',
    whenToUse: '分析某只股票/标的优劣、信号、技术面',
  },
  {
    id: 'fundamentals',
    title: '基本面事实',
    description: '公司概况、财务摘要、股东结构、分红历史',
    whenToUse: '营收利润、ROE、主业概念、十大股东、分红派息；做深度研究时的事实表',
  },
  {
    id: 'market',
    title: '宏观与市场',
    description: '牛熊状态、市场动态、开盘/收盘报告、趋势快评',
    whenToUse: '大盘、板块、早报复盘、宏观环境',
  },
  {
    id: 'etf',
    title: 'ETF 专题',
    description: 'ETF 列表、净值、持仓权重',
    whenToUse: 'ETF/基金净值、成分、溢价',
  },
  {
    id: 'portfolio',
    title: '组合与关注',
    description: '关注列表、持仓、交易流水、组合暴露',
    whenToUse: '我的持仓、关注、组合分析',
  },
  {
    id: 'industry',
    title: '产业链',
    description: '行业透视与 Mermaid 图谱',
    whenToUse: '产业链、上下游、行业主题',
  },
  {
    id: 'news',
    title: '资讯公告',
    description: '新闻中心列表/正文与公告内容',
    whenToUse: '资讯、新闻、公告、研报订阅',
  },
  {
    id: 'strategy_extra',
    title: '策略重计算',
    description: '回测与单股策略报告',
    whenToUse: '回测、IC、策略报告',
  },
  {
    id: 'provider_ext',
    title: '数据源扩展',
    description: '自定义 Provider 方法',
    whenToUse: '标准 API 不够、需调自定义数据源',
  },
] as const

/** 工具名 → 主 pack（恰好一个） */
export const TOOL_PACK_MEMBERSHIP: Readonly<Record<string, ToolPackId>> = {
  // core
  search_instruments: 'core',
  get_instrument_capabilities: 'core',
  get_instrument_snapshot: 'core',
  get_instrument_quotes: 'core',
  batch_instrument_snapshots: 'core',
  ask_user: 'core',
  get_current_time: 'core',
  get_system_info: 'core',
  get_app_settings: 'core',
  get_project_info: 'core',
  get_integration_status: 'core',

  // meta
  list_tool_packs: 'meta',
  activate_tool_pack: 'meta',

  // instrument_analytics
  get_instrument_chart: 'instrument_analytics',
  evaluate_instrument: 'instrument_analytics',
  get_instrument_strategy_signal: 'instrument_analytics',
  get_instrument_indicators: 'instrument_analytics',
  verify_instrument_strategy: 'instrument_analytics',
  get_instrument_latest_evaluation: 'instrument_analytics',
  get_instrument_cyq: 'instrument_analytics',
  get_instrument_institution_rating: 'instrument_analytics',
  get_instrument_institution_report: 'instrument_analytics',

  // fundamentals
  get_instrument_profile: 'fundamentals',
  get_instrument_financials: 'fundamentals',
  get_instrument_shareholders: 'fundamentals',
  get_instrument_dividend: 'fundamentals',

  // market
  get_market_regime: 'market',
  get_market_dynamics: 'market',
  get_trend_brief: 'market',
  get_closing_report: 'market',
  get_morning_brief: 'market',

  // etf
  get_etf_list: 'etf',
  get_etf_nav: 'etf',
  get_etf_holdings: 'etf',

  // portfolio
  get_watchlist: 'portfolio',
  get_portfolio_holdings: 'portfolio',
  portfolio_trades: 'portfolio',
  portfolio_summary: 'portfolio',
  analyze_portfolio: 'portfolio',

  // industry
  industry_mining: 'industry',
  industry_mermaid: 'industry',

  // news
  get_news_center_status: 'news',
  list_news_groups: 'news',
  list_news_sources: 'news',
  list_news_articles: 'news',
  get_news_article: 'news',
  get_notice_content: 'news',

  // strategy_extra
  run_backtest: 'strategy_extra',
  strategy_report: 'strategy_extra',

  // provider_ext
  list_enabled_providers: 'provider_ext',
  list_provider_custom_methods: 'provider_ext',
  invoke_provider_custom_method: 'provider_ext',
}

export function isToolPackId(value: string): value is ToolPackId {
  return (TOOL_PACK_IDS as readonly string[]).includes(value)
}

export function packIdForTool(toolName: string): ToolPackId | null {
  return TOOL_PACK_MEMBERSHIP[toolName] ?? null
}

export function toolsInPack(packId: ToolPackId): string[] {
  return Object.entries(TOOL_PACK_MEMBERSHIP)
    .filter(([, id]) => id === packId)
    .map(([name]) => name)
}

export function alwaysOnPackIds(): ToolPackId[] {
  return TOOL_PACK_DEFS.filter(p => p.alwaysOn).map(p => p.id)
}

/** system 提示用的简短 pack 目录（替代长 TOOL_ROUTING 表） */
export function buildToolPackCatalogPrompt(): string {
  const lines = [
    '## 工具包目录（按需加载）',
    '每轮默认仅加载 core + meta；其它包由意图播种或 activate_tool_pack 激活。',
    '需要未加载能力时：先 list_tool_packs，再 activate_tool_pack({ pack_ids: [...] })。',
    '',
    '| pack_id | 标题 | 何时激活 |',
    '|---------|------|----------|',
  ]
  for (const p of TOOL_PACK_DEFS) {
    const flag = p.alwaysOn ? '（始终加载）' : ''
    lines.push(`| ${p.id} | ${p.title}${flag} | ${p.whenToUse} |`)
  }
  lines.push('')
  lines.push('### 调用纪律')
  lines.push('- 仅调用本轮 tools 列表中存在的工具名；勿虚构未加载工具')
  lines.push('- 同一任务对同一工具最多调用 2 次')
  lines.push('- 用户已明确代码时跳过搜索直接分析；跨市场先 search_instruments')
  lines.push('- A 股专用工具（机构评级、筹码等）勿用于非 A 股')
  lines.push('- 标准 API 可用时禁止用自定义 Provider 方法替代')
  return lines.join('\n')
}
