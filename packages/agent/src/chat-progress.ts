export type ChatToolStepStatus = 'running' | 'done' | 'error'

export interface ChatToolStep {
  id: string
  tool: string
  label: string
  status: ChatToolStepStatus
  argsPreview?: string
  thinking?: string
  resultPreview?: string
  resultDetail?: string
  startedAt: string
  finishedAt?: string
}

export type ChatProgressEvent =
  | { type: 'thinking'; round: number; label: string; snippet?: string }
  | { type: 'tool_start'; step: ChatToolStep }
  | { type: 'tool_done'; step: ChatToolStep }
  | { type: 'reply'; content: string }
  | {
    type: 'done'
    reply: string
    tools_used: string[]
    session_id: string
    title?: string
    tool_steps: ChatToolStep[]
    cancelled?: boolean
  }
  | { type: 'error'; message: string }

export interface ChatProgressOptions {
  onProgress?: (event: ChatProgressEvent) => void
  signal?: AbortSignal
}

const TOOL_LABELS: Record<string, string> = {
  evaluate_stock: '评估个股因子与评分',
  screen_stocks: '按条件筛选股票',
  local_screen_stocks: '本地因子初选',
  screen_local_universe: '本地多维度筛选',
  list_local_industries: '读取本地行业列表',
  screen_local_industry_stocks: '行业内策略筛选',
  get_local_industry_stocks: '读取行业成分股',
  get_market_db_status: '查询本地数据库状态',
  get_market_db_sync_state: '查看数据同步进度',
  trigger_market_db_sync: '触发本地数据同步',
  list_local_screen_factors: '读取可用筛选因子',
  get_local_universe_screen_schema: '读取筛选维度说明',
  batch_stock_snapshots: '批量获取候选股快照',
  batch_instrument_snapshots: '批量获取候选标的快照',
  get_stock_quotes: '获取实时行情',
  get_watchlist: '读取关注列表',
  get_watchlist_radar: '生成关注股雷达摘要',
  get_stock_kline: '获取 K 线数据',
  get_stock_cyq: '分析筹码分布',
  get_stock_chart: '获取图表数据',
  get_stock_detail: '获取个股详情',
  search_stocks: '搜索股票',
  get_strategy_signal: '分析策略信号',
  institution_rating: '汇总机构评级',
  institution_report: '生成机构评级报告',
  analyze_portfolio: '分析组合因子暴露',
  get_closing_report: '生成收盘市场报告',
  get_morning_brief: '生成开盘早报',
  run_backtest: '运行因子回测',
  strategy_verify: '验证策略历史表现',
  strategy_verify_report: '生成策略验证报告',
  strategy_report: '生成策略分析报告',
  industry_mining: '梳理产业链与代表公司',
  industry_mermaid: '生成产业链图谱',
  get_industry_stats: '统计行业估值水平',
  get_portfolio_holdings: '读取实盘持仓',
  portfolio_trades: '查询交易流水',
  portfolio_summary: '汇总持仓盈亏',
  get_latest_evaluation: '读取缓存评估结果',
  get_news_center_status: '查询资讯中心状态',
  list_news_groups: '读取资讯分组',
  list_news_sources: '读取资讯订阅来源',
  list_news_articles: '浏览资讯列表',
  get_news_article: '读取资讯正文',
  get_current_time: '获取当前时间',
  get_system_info: '读取运行环境信息',
  get_app_settings: '读取应用设置',
  get_project_info: '读取项目路径信息',
  get_integration_status: '检查外部集成状态',
  get_instrument_capabilities: '查询标的能力',
  get_instrument_snapshot: '获取标的快照',
  get_instrument_quotes: '获取标的行情',
  get_instrument_chart: '获取标的 K 线',
  get_instrument_indicators: '计算技术指标',
  evaluate_instrument: '评估标的',
  get_instrument_strategy_signal: '分析策略信号',
  verify_instrument_strategy: '验证策略历史表现',
  get_instrument_latest_evaluation: '读取评估缓存',
  get_instrument_cyq: '分析筹码分布',
}

function firstCode(args: Record<string, unknown>): string | null {
  const code = args.code
  if (typeof code === 'string' && code.trim()) return code.trim()
  if (Array.isArray(args.codes) && args.codes.length) {
    const first = args.codes[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
}

function codesCount(args: Record<string, unknown>): number | null {
  if (Array.isArray(args.codes)) return args.codes.length
  return null
}

function instrumentsCount(args: Record<string, unknown>): number | null {
  if (Array.isArray(args.instruments)) return args.instruments.length
  return null
}

function stockRef(args: Record<string, unknown>, result?: unknown): string {
  const fromResult = extractStockName(result)
  const code = firstCode(args) ?? extractStockCode(result)
  if (fromResult && code) return `${fromResult}（${code}）`
  if (fromResult) return fromResult
  if (code) return code
  return ''
}

function extractStockCode(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  const data = r.data && typeof r.data === 'object' ? r.data as Record<string, unknown> : r
  const code = data.code ?? data.ts_code
  return typeof code === 'string' && code.trim() ? code.trim() : null
}

function extractStockName(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  const data = r.data && typeof r.data === 'object' ? r.data as Record<string, unknown> : r
  const name = data.name ?? data.stock_name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

export function formatToolLabel(tool: string, args: Record<string, unknown> = {}, result?: unknown): string {
  const base = TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
  const ref = stockRef(args, result)

  switch (tool) {
    case 'get_stock_kline':
      return ref ? `获取 ${ref} K 线数据` : '获取 K 线数据'
    case 'get_stock_chart':
      return ref ? `获取 ${ref} 图表数据` : '获取图表数据'
    case 'get_stock_cyq':
      return ref ? `分析 ${ref} 筹码分布` : '分析筹码分布'
    case 'get_stock_detail':
      return ref ? `获取 ${ref} 详情` : '获取个股详情'
    case 'evaluate_stock':
      return ref ? `评估 ${ref} 因子与评分` : '评估个股因子与评分'
    case 'get_strategy_signal':
      return ref ? `分析 ${ref} 策略信号` : '分析策略信号'
    case 'institution_rating':
    case 'institution_report':
      return ref ? `汇总 ${ref} 机构观点` : base
    case 'strategy_verify':
    case 'strategy_verify_report':
    case 'strategy_report':
      return ref ? `${ref} · ${base}` : base
    case 'batch_stock_snapshots': {
      const n = codesCount(args)
      return n != null ? `批量获取 ${n} 只候选股快照` : '批量获取候选股快照'
    }
    case 'batch_instrument_snapshots': {
      const n = instrumentsCount(args) ?? codesCount(args)
      return n != null ? `批量获取 ${n} 只候选标的快照` : '批量获取候选标的快照'
    }
    case 'get_stock_quotes': {
      const n = codesCount(args)
      return n != null ? `获取 ${n} 只股票实时行情` : '获取实时行情'
    }
    case 'get_watchlist_radar': {
      const n = codesCount(args)
      return n != null ? `生成 ${n} 只股票雷达摘要` : '生成关注股雷达摘要'
    }
    case 'run_backtest': {
      const n = codesCount(args)
      return n != null ? `对 ${n} 只股票运行回测` : '运行因子回测'
    }
    case 'search_stocks': {
      const kw = typeof args.keyword === 'string' ? args.keyword.trim() : ''
      return kw ? `搜索「${kw}」` : '搜索股票'
    }
    case 'industry_mining':
    case 'industry_mermaid': {
      const industry = typeof args.industry === 'string' ? args.industry.trim() : ''
      return industry ? `${industry} · ${base}` : base
    }
    case 'screen_stocks':
    case 'local_screen_stocks':
    case 'screen_local_universe':
    case 'screen_local_industry_stocks': {
      const conds = Array.isArray(args.conditions)
        ? args.conditions.length
        : Array.isArray(args.factor_conditions)
          ? args.factor_conditions.length
          : null
      const industry = typeof args.industry === 'string' ? args.industry.trim() : ''
      if (industry) return `${industry} · ${base}`
      return conds != null ? `${base}（${conds} 条条件）` : base
    }
    case 'list_local_industries': {
      const kw = typeof args.keyword === 'string' ? args.keyword.trim() : ''
      return kw ? `${base} · ${kw}` : base
    }
    default:
      return ref ? `${base} · ${ref}` : base
  }
}

export function formatArgsPreview(args: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(args, null, 0)
    return s.length <= 240 ? s : `${s.slice(0, 240)}…`
  } catch {
    return ''
  }
}

export function formatResultPreview(result: unknown): { preview: string; detail: string } {
  let text = ''
  if (typeof result === 'string') {
    text = result
  } else {
    try {
      text = JSON.stringify(result, null, 2)
    } catch {
      text = String(result)
    }
  }
  const detail = text.length <= 4000 ? text : `${text.slice(0, 4000)}…`
  const preview = text.length <= 180 ? text : `${text.slice(0, 180)}…`
  return { preview, detail }
}

export function enrichStepFromResult(step: ChatToolStep, result: unknown): ChatToolStep {
  let args: Record<string, unknown> = {}
  try {
    args = step.argsPreview ? JSON.parse(step.argsPreview) as Record<string, unknown> : {}
  } catch { /* empty */ }
  const label = formatToolLabel(step.tool, args, result)
  const { preview, detail } = formatResultPreview(result)
  const isError = Boolean(result && typeof result === 'object' && 'error' in result)
  return {
    ...step,
    label,
    status: isError ? 'error' : 'done',
    resultPreview: preview,
    resultDetail: detail,
    finishedAt: new Date().toISOString(),
  }
}
