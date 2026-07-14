/**
 * 聊天进度事件系统 — 在 Agent 聊天过程中推送实时状态更新。
 *
 * 用途：前端实时展示 Agent 的思考过程、工具调用进度、流式回复片段。
 * 事件流：thinking → tool_start → tool_done → ... → done
 */

/**
 * 工具调用步骤状态 — 标识单次工具调用的当前阶段。
 * - running: 正在执行
 * - done:    执行成功完成
 * - error:   执行出错
 */
export type ChatToolStepStatus = 'running' | 'done' | 'error'

/**
 * 工具调用步骤 — 单次工具调用的完整生命周期信息。
 *
 * 用途：在聊天界面中展示"正在评估 600519..."、"获取 K 线数据"等进度条。
 * 生命周期：创建(status=running) → 完成(enrichStepFromResult) → 显示结果摘要
 */
export interface ChatToolStep {
  /** 步骤唯一 ID（如 UUID 或递增序号） */
  id: string
  /** 工具名称（如 "evaluate_stock"、"get_stock_kline"） */
  tool: string
  /** 显示给用户的中文标签（如"评估 600519 因子与评分"） */
  label: string
  /** 当前状态 */
  status: ChatToolStepStatus
  /** 参数预览文本（JSON 序列化，截断至 240 字符） */
  argsPreview?: string
  /** Agent 思考过程片段（如有） */
  thinking?: string
  /** 结果摘要文本（截断至 180 字符） */
  resultPreview?: string
  /** 结果完整详情（截断至 4000 字符），点击展开时显示 */
  resultDetail?: string
  /** 开始时间 ISO 8601 */
  startedAt: string
  /** 完成时间 ISO 8601 */
  finishedAt?: string
}

/**
 * 聊天进度事件 — 聊天过程中推送的各类实时状态。
 *
 * 事件类型说明：
 *   - thinking:    Agent 正在推理（round=第几轮，label=当前步骤描述）
 *   - tool_start:  工具调用开始（step 含工具名、参数、开始时间）
 *   - tool_done:   工具调用完成（step 含结果摘要、完成时间）
 *   - reply:       流式回复片段（content=本次增量文本）
 *   - done:        全部完成（reply=最终回复、tools_used=使用的工具列表、title=会话标题）
 *   - error:       出错（message=错误信息）
 */
export interface ChatUserPromptPayload {
  id: string
  title?: string
  prompt: string
  options: Array<{ id: string; label: string }>
  allowMultiple?: boolean
}

export type ChatProgressEvent =
  | { type: 'thinking'; round: number; label: string; snippet?: string }
  | { type: 'tool_start'; step: ChatToolStep }
  | { type: 'tool_done'; step: ChatToolStep }
  | { type: 'user_prompt'; prompt: ChatUserPromptPayload }
  | { type: 'reply'; content: string }
  | {
    type: 'done'
    /** Agent 最终回复文本 */
    reply: string
    /** 本轮使用的工具名称列表 */
    tools_used: string[]
    /** 会话 ID */
    session_id: string
    /** 自动生成的会话标题（可选） */
    title?: string
    /** 全部工具调用步骤（含状态、耗时、结果） */
    tool_steps: ChatToolStep[]
    /** 是否被用户取消 */
    cancelled?: boolean
  }
  | { type: 'error'; message: string }

/**
 * 聊天进度回调选项 — 配置进度推送回调和中断信号。
 *
 * 用途：聊天发起时传入，用于实时接收 Agent 执行进度。
 */
export interface ChatProgressOptions {
  /** 进度事件回调函数，Agent 每个阶段变化时调用 */
  onProgress?: (event: ChatProgressEvent) => void
  /** AbortSignal，用于用户取消聊天请求 */
  signal?: AbortSignal
}

// ── 工具中文标签映射 ──

const TOOL_LABELS: Record<string, string> = {
  get_market_regime: '分析宏观市场状态',
  get_market_dynamics: '获取市场动态全景',
  get_trend_brief: '生成趋势研判',
  screen_us_universe: '筛选美股候选',
  screen_hk_universe: '筛选港股候选',
  screen_crypto_universe: '筛选 Crypto 交易对',
  get_etf_list: '读取 ETF 列表',
  get_etf_scorecard: '评估 ETF 决策雷达',
  batch_instrument_snapshots: '批量获取候选标的快照',
  get_watchlist: '读取关注列表',
  get_watchlist_radar: '生成关注股雷达摘要',
  institution_rating: '汇总机构评级',
  institution_report: '生成机构评级报告',
  analyze_portfolio: '分析组合因子暴露',
  get_closing_report: '生成收盘市场报告',
  get_morning_brief: '生成开盘早报',
  run_backtest: '运行因子回测',
  strategy_report: '生成策略分析报告',
  industry_mining: '梳理产业链与代表公司',
  industry_mermaid: '生成产业链图谱',
  get_portfolio_holdings: '读取实盘持仓',
  portfolio_trades: '查询交易流水',
  portfolio_summary: '汇总持仓盈亏',
  get_news_center_status: '查询资讯中心状态',
  list_news_groups: '读取资讯分组',
  list_news_sources: '读取资讯订阅来源',
  list_news_articles: '浏览资讯列表',
  get_news_article: '读取资讯正文',
  get_notice_content: '读取公告正文',
  get_current_time: '获取当前时间',
  get_system_info: '读取运行环境信息',
  get_app_settings: '读取应用设置',
  get_project_info: '读取项目路径信息',
  get_integration_status: '检查外部集成状态',
  ask_user: '向你确认问题',
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
  get_instrument_institution_rating: '汇总机构评级',
  get_instrument_institution_report: '生成机构评级报告',
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

/**
 * 生成工具调用的中文显示标签 — 根据工具名和参数生成可读描述。
 *
 * @param tool   工具名称
 * @param args   工具参数
 * @param result 工具返回结果（可选，用于提取股票名称）
 * @returns 中文标签（如"评估 贵州茅台（600519）因子与评分"）
 */
export function formatToolLabel(tool: string, args: Record<string, unknown> = {}, result?: unknown): string {
  const base = TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
  const ref = stockRef(args, result)

  switch (tool) {
    case 'get_trend_brief':
      return ref ? `${ref} · ${base}` : base
    case 'get_market_regime':
    case 'get_market_dynamics':
      return base
    case 'batch_instrument_snapshots': {
      const n = instrumentsCount(args) ?? codesCount(args)
      return n != null ? `批量获取 ${n} 只候选标的快照` : '批量获取候选标的快照'
    }
    case 'institution_rating':
    case 'institution_report':
    case 'get_instrument_institution_rating':
    case 'get_instrument_institution_report':
      return ref ? `汇总 ${ref} 机构观点` : base
    case 'strategy_report':
      return ref ? `${ref} · ${base}` : base
    case 'get_instrument_snapshot':
    case 'get_instrument_chart':
    case 'get_instrument_quotes':
    case 'evaluate_instrument':
    case 'get_instrument_strategy_signal':
    case 'get_instrument_indicators':
    case 'verify_instrument_strategy':
    case 'get_instrument_cyq': {
      const iref = instrumentRefFromArgs(args) ?? ref
      return iref ? `${base} · ${iref}` : base
    }
    case 'get_watchlist_radar': {
      const n = codesCount(args)
      return n != null ? `生成 ${n} 只股票雷达摘要` : '生成关注股雷达摘要'
    }
    case 'run_backtest': {
      const n = codesCount(args)
      return n != null ? `对 ${n} 只股票运行回测` : '运行因子回测'
    }
    case 'screen_us_universe':
    case 'screen_hk_universe':
    case 'screen_crypto_universe': {
      const kw = typeof args.keyword === 'string' ? args.keyword.trim() : ''
      if (kw) return `${base} · ${kw}`
      return base
    }
    case 'industry_mining':
    case 'industry_mermaid': {
      const industry = typeof args.industry === 'string' ? args.industry.trim() : ''
      return industry ? `${industry} · ${base}` : base
    }
    case 'ask_user': {
      const q = typeof args.prompt === 'string'
        ? args.prompt.trim()
        : typeof args.question === 'string'
          ? args.question.trim()
          : ''
      if (!q) return base
      const short = q.length > 36 ? `${q.slice(0, 36)}…` : q
      return `等待你的确认：${short}`
    }
    default:
      return ref ? `${base} · ${ref}` : base
  }
}

/**
 * 格式化工具参数预览 — JSON 序列化后截断至 240 字符。
 */
export function formatArgsPreview(args: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(args, null, 0)
    return s.length <= 240 ? s : `${s.slice(0, 240)}…`
  } catch {
    return ''
  }
}

function instrumentRefFromArgs(args: Record<string, unknown>): string | null {
  const inst = args.instrument
  if (inst && typeof inst === 'object') {
    const i = inst as Record<string, unknown>
    const market = typeof i.market === 'string' ? i.market : ''
    const symbol = i.symbol ?? i.pair
    if (typeof symbol === 'string' && symbol.trim()) {
      return market ? `${market}:${symbol.trim()}` : symbol.trim()
    }
  }
  if (typeof args.symbol === 'string' && args.symbol.trim()) {
    const market = typeof args.market === 'string' ? args.market : 'US'
    return `${market}:${args.symbol.trim()}`
  }
  if (typeof args.pair === 'string' && args.pair.trim()) {
    return `CRYPTO:${args.pair.trim()}`
  }
  return null
}

function asResearchEnvelope(result: unknown): {
  success?: boolean
  message?: string
  data?: unknown
} | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  if ('success' in r || ('data' in r && 'message' in r)) {
    return {
      success: typeof r.success === 'boolean' ? r.success : undefined,
      message: typeof r.message === 'string' ? r.message : undefined,
      data: r.data,
    }
  }
  return null
}

function fmtPct(v: unknown): string | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

function summarizeBatchSnapshot(data: unknown, message?: string): string | null {
  if (!data || typeof data !== 'object') return message ?? null
  const d = data as Record<string, unknown>
  const rows = Array.isArray(d.discover_items)
    ? d.discover_items as Record<string, unknown>[]
    : Array.isArray(d.items)
      ? d.items as Record<string, unknown>[]
      : []
  const quotes = Array.isArray(d.quotes) ? d.quotes as Record<string, unknown>[] : []
  const count = typeof d.count === 'number' ? d.count : rows.length + quotes.length
  if (!count) return message ?? '无批量截面数据'

  const tradeDate = d.trade_date != null ? String(d.trade_date) : null
  let head = `批量截面 ${count} 只`
  if (tradeDate) head += `（${tradeDate}）`

  if (rows.length) {
    const sample = rows.slice(0, 3).map(row => {
      const code = row.code ?? row.symbol ?? '?'
      const name = typeof row.name === 'string' ? row.name : ''
      const score = row.total_score ?? row.score
      const keyFactors = row.key_factors && typeof row.key_factors === 'object'
        ? row.key_factors as Record<string, unknown>
        : null
      const pe = row.pe ?? keyFactors?.pe
      const label = name ? `${name}（${code}）` : String(code)
      if (typeof score === 'number') return `${label} ${score} 分`
      if (typeof pe === 'number') return `${label} PE ${pe}`
      return label
    })
    const tail = rows.length > 3 ? `等 ${rows.length} 只` : ''
    return [head, sample.join(' · '), tail].filter(Boolean).join('：')
  }

  if (quotes.length) {
    const sample = quotes.slice(0, 3).map(q => {
      const code = q.code ?? '?'
      const pct = fmtPct(q.change_pct ?? q.changePct)
      return pct ? `${code} ${pct}` : String(code)
    })
    return `${head}：${sample.join(' · ')}`
  }

  return message ?? head
}

function summarizeInstrumentSnapshot(data: unknown, message?: string): string | null {
  if (!data || typeof data !== 'object') return message ?? null
  const d = data as Record<string, unknown>
  const code = d.code ?? d.symbol ?? d.pair
  const name = typeof d.name === 'string' ? d.name : null
  const quote = d.quote && typeof d.quote === 'object' ? d.quote as Record<string, unknown> : null
  const price = quote?.price ?? d.price
  const pct = fmtPct(quote?.change_pct ?? quote?.changePct ?? d.change_pct ?? d.changePct)
  const label = name && code ? `${name}（${code}）` : (name ?? code ?? '标的')
  const priceText = typeof price === 'number' ? price.toFixed(2) : null
  const bits = [label, priceText, pct].filter(Boolean)
  return bits.length ? bits.join(' · ') : (message ?? null)
}

function summarizeInstrumentQuotes(data: unknown, message?: string): string | null {
  if (!data || typeof data !== 'object') return message ?? null
  const d = data as Record<string, unknown>
  const quotes = Array.isArray(d.quotes) ? d.quotes as Record<string, unknown>[] : []
  if (!quotes.length) return message ?? '无行情数据'
  const sample = quotes.slice(0, 4).map(q => {
    const code = q.code ?? '?'
    const pct = fmtPct(q.change_pct ?? q.changePct)
    return pct ? `${code} ${pct}` : String(code)
  })
  const head = `${quotes.length} 只行情`
  return `${head}：${sample.join(' · ')}`
}

function summarizeInstrumentChart(data: unknown, message?: string): string | null {
  if (!data || typeof data !== 'object') return message ?? null
  const d = data as Record<string, unknown>
  const bars = Array.isArray(d.bars) ? d.bars : Array.isArray(d.recent_bars) ? d.recent_bars : []
  const code = d.code ?? d.symbol
  const name = typeof d.name === 'string' ? d.name : null
  const period = typeof d.period === 'string' ? d.period : 'K线'
  const label = name && code ? `${name}（${code}）` : (name ?? code ?? '标的')
  return `${label} · ${period} · ${bars.length} 根`
}

function summarizeInstrumentSearch(data: unknown, message?: string): string | null {
  if (!data || typeof data !== 'object') return message ?? null
  const d = data as Record<string, unknown>
  const items = Array.isArray(d.items) ? d.items as Record<string, unknown>[] : []
  if (!items.length) return message ?? '未找到匹配标的'
  const sample = items.slice(0, 3).map(item => {
    const code = item.code ?? item.ref_label ?? item.symbol ?? '?'
    const name = typeof item.name === 'string' ? item.name : ''
    return name ? `${name}（${code}）` : String(code)
  })
  const head = `找到 ${typeof d.count === 'number' ? d.count : items.length} 只`
  return `${head}：${sample.join(' · ')}`
}

function summarizeInstrumentEvaluation(data: unknown, message?: string): string | null {
  if (!data || typeof data !== 'object') return message ?? null
  const d = data as Record<string, unknown>
  const codeRaw = d.code ?? d.symbol
  const code = typeof codeRaw === 'string' ? codeRaw : null
  const name = typeof d.name === 'string' ? d.name : null
  const score = d.total_score ?? d.score
  const scorecard = typeof d.scorecard === 'string' ? d.scorecard : null
  const label = name && code ? `${name}（${code}）` : (name ?? code ?? '标的')
  if (typeof score === 'number') {
    return scorecard ? `${label} · ${scorecard} ${score} 分` : `${label} · ${score} 分`
  }
  return message ?? label
}

function summarizeToolResult(tool: string, result: unknown): string | null {
  if (result && typeof result === 'object' && 'error' in result && !('success' in result)) {
    const err = (result as { error?: unknown }).error
    return typeof err === 'string' ? err : '执行失败'
  }

  const envelope = asResearchEnvelope(result)
  if (envelope?.success === false) {
    return envelope.message || '执行失败'
  }

  const data = envelope?.data ?? result
  const message = envelope?.message

  switch (tool) {
    case 'batch_instrument_snapshots':
    case 'batch_stock_snapshots':
      return summarizeBatchSnapshot(data, message)
    case 'get_instrument_snapshot':
    case 'get_stock_detail':
    case 'get_us_snapshot':
    case 'get_crypto_snapshot':
      return summarizeInstrumentSnapshot(data, message)
    case 'get_instrument_quotes':
    case 'get_stock_quotes':
      return summarizeInstrumentQuotes(data, message)
    case 'get_instrument_chart':
    case 'get_stock_chart':
    case 'get_stock_kline':
      return summarizeInstrumentChart(data, message)
    case 'search_stocks':
    case 'search_instruments':
    case 'search_us_stocks':
    case 'search_crypto_pairs':
      return summarizeInstrumentSearch(data, message)
    case 'evaluate_instrument':
    case 'evaluate_stock':
    case 'get_instrument_latest_evaluation':
    case 'get_latest_evaluation':
      return summarizeInstrumentEvaluation(data, message)
    case 'ask_user': {
      if (!result || typeof result !== 'object') return null
      const r = result as Record<string, unknown>
      if (r.kind === 'custom' && typeof r.custom_text === 'string' && r.custom_text.trim()) {
        return `已选择：${r.custom_text.trim()}`
      }
      const labels = Array.isArray(r.selected_labels)
        ? r.selected_labels.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        : []
      if (labels.length) return `已选择：${labels.join('、')}`
      return '已收到你的确认'
    }
    case 'industry_mining': {
      const payload = envelope?.data ?? result
      if (!payload || typeof payload !== 'object') return null
      const p = payload as Record<string, unknown>
      const name = typeof p.industry === 'string' ? p.industry : ''
      return name ? `${name} 产业链分析完成` : '产业链分析完成'
    }
    default:
      return null
  }
}

/**
 * 格式化工具结果预览与详情 — preview 180 字符、detail 4000 字符。
 * 对 instrument_* / batch_* 等工具生成面向投资者的可读摘要。
 */
export function formatResultPreview(
  result: unknown,
  tool?: string,
): { preview: string; detail: string } {
  const summarized = tool ? summarizeToolResult(tool, result) : null
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
  if (summarized) {
    const preview = summarized.length <= 180 ? summarized : `${summarized.slice(0, 180)}…`
    return { preview, detail }
  }
  const preview = text.length <= 180 ? text : `${text.slice(0, 180)}…`
  return { preview, detail }
}

/**
 * 用工具执行结果补全步骤信息 — 更新标签、状态、预览文本和完成时间。
 */
export function enrichStepFromResult(step: ChatToolStep, result: unknown): ChatToolStep {
  let args: Record<string, unknown> = {}
  try {
    args = step.argsPreview ? JSON.parse(step.argsPreview) as Record<string, unknown> : {}
  } catch { /* empty */ }
  const label = formatToolLabel(step.tool, args, result)
  const { preview, detail } = formatResultPreview(result, step.tool)
  const isError = Boolean(
    (result && typeof result === 'object' && 'error' in result)
    || (result && typeof result === 'object' && 'success' in result && (result as { success?: boolean }).success === false),
  )
  return {
    ...step,
    label,
    status: isError ? 'error' : 'done',
    resultPreview: preview,
    resultDetail: detail,
    finishedAt: new Date().toISOString(),
  }
}
