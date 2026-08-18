/**
 * 外部/本地 MCP 工具 → 稳定能力枚举；跨名互备与参数适配。
 */

import {
  MCP_TOOL_NAMESPACE_SEP,
  namespacedMcpTool,
  parseNamespacedMcpTool,
} from '@opptrix/shared'

export type McpCapability =
  | 'search_nl'
  | 'search_symbol'
  | 'quotes'
  | 'snapshot'
  | 'kline'
  | 'news'
  | 'announcement'
  | 'report'
  | 'constituents'
  | 'indicators'
  | 'macro'
  | 'profile'
  | 'financials'
  | 'market_lists'
  | 'cyq'

/** 外部 MCP 通用能力清单（SSOT；不按券商/问财分家描写） */
export const EXTERNAL_MCP_CAPABILITY_GUIDE: readonly {
  id: McpCapability
  title: string
  summary: string
  localFirst: false
}[] = [
  { id: 'search_nl', title: '问数/选股', summary: '自然语言问数与条件选股', localFirst: false },
  { id: 'search_symbol', title: '搜码', summary: '按代码或简称检索标的', localFirst: false },
  { id: 'quotes', title: '行情/资金流向', summary: '最新价、涨跌与资金流向', localFirst: false },
  { id: 'snapshot', title: '快照/ETF净值持仓', summary: '聚合快照、ETF 净值与持仓', localFirst: false },
  { id: 'kline', title: 'K线', summary: 'K 线与走势序列', localFirst: false },
  { id: 'profile', title: '概况', summary: '公司/ETF 档案与主业概念', localFirst: false },
  { id: 'financials', title: '财务/股东/分红', summary: '财报、股东结构与分红', localFirst: false },
  { id: 'news', title: '新闻', summary: '资讯与舆情检索', localFirst: false },
  { id: 'announcement', title: '公告', summary: '官方披露与公告列表', localFirst: false },
  { id: 'report', title: '研报', summary: '卖方研报检索', localFirst: false },
  { id: 'macro', title: '宏观', summary: '宏观与经济序列', localFirst: false },
  {
    id: 'constituents',
    title: '成分/板块目录',
    summary: '指数/板块成分股与板块行业目录',
    localFirst: false,
  },
  { id: 'indicators', title: '指标', summary: '技术指标序列', localFirst: false },
  {
    id: 'market_lists',
    title: '龙虎榜/涨跌停/连板热榜/市场全景/日历开盘/情绪市况',
    summary: '龙虎榜、涨跌停、连板热榜、市场全景、交易日历、是否开盘、市场情绪与牛熊市况',
    localFirst: false,
  },
  { id: 'cyq', title: '筹码', summary: '获利盘与成本区', localFirst: false },
]

/**
 * 本地独有产品计算（不映射外部 MCP）。
 * 筹码已改为外部优先，见 EXTERNAL_MCP_CAPABILITY_GUIDE / get_instrument_cyq。
 */
export const LOCAL_ONLY_TOOL_NAMES = [
  'evaluate_instrument',
  'get_instrument_strategy_signal',
  'run_backtest',
  'get_instrument_institution_rating',
  'verify_instrument_strategy',
  'strategy_report',
  'get_instrument_latest_evaluation',
  'get_instrument_institution_report',
] as const

/**
 * 离线资产 / 运行时（不映射外部 MCP；工作区/浏览器/任务不拦截，不必枚举完）。
 */
export const LOCAL_OFFLINE_ASSET_TOOLS = [
  'get_watchlist',
  'get_portfolio_holdings',
  'portfolio_trades',
  'portfolio_summary',
  'analyze_portfolio',
  'get_instrument_capabilities',
  'get_notice_content',
  'get_current_time',
] as const

/** 本地工具名 → 能力 */
const LOCAL_TOOL_CAP: Record<string, McpCapability> = {
  search_instruments: 'search_symbol',
  get_instrument_quotes: 'quotes',
  get_instrument_money_flow: 'quotes',
  get_trend_brief: 'quotes',
  get_instrument_snapshot: 'snapshot',
  batch_instrument_snapshots: 'snapshot',
  get_etf_nav: 'snapshot',
  get_etf_holdings: 'snapshot',
  get_instrument_chart: 'kline',
  get_instrument_notices: 'announcement',
  list_news_articles: 'news',
  get_news_article: 'news',
  get_instrument_indicators: 'indicators',
  get_macro_series: 'macro',
  get_sector_list: 'constituents',
  get_sector_constituents: 'constituents',
  get_index_constituents: 'constituents',
  get_instrument_profile: 'profile',
  get_etf_profile: 'profile',
  get_etf_list: 'profile',
  get_instrument_financials: 'financials',
  get_instrument_income_statement: 'financials',
  get_instrument_balance_sheet: 'financials',
  get_instrument_cash_flow: 'financials',
  get_instrument_financial_indicators: 'financials',
  get_instrument_shareholders: 'financials',
  get_instrument_institution_holdings: 'financials',
  get_instrument_dividend: 'financials',
  search_library: 'report',
  get_dragon_tiger: 'market_lists',
  get_limit_updown: 'market_lists',
  get_cn_market_special: 'market_lists',
  get_market_dynamics: 'market_lists',
  get_trade_calendar: 'market_lists',
  get_market_session: 'market_lists',
  get_market_sentiment: 'market_lists',
  get_market_regime: 'market_lists',
  get_instrument_cyq: 'cyq',
}

/** 问财等已知外部裸名 → 能力 */
const KNOWN_REMOTE_CAP: Record<string, McpCapability> = {
  query2data: 'search_nl',
  news_search: 'news',
  announcement_search: 'announcement',
  report_search: 'report',
}

const CAP_TO_LOCAL: Partial<Record<McpCapability, string[]>> = {
  search_symbol: ['search_instruments'],
  quotes: ['get_instrument_quotes', 'get_instrument_money_flow', 'get_trend_brief'],
  snapshot: [
    'get_instrument_snapshot',
    'batch_instrument_snapshots',
    'get_etf_nav',
    'get_etf_holdings',
  ],
  kline: ['get_instrument_chart'],
  announcement: ['get_instrument_notices'],
  news: ['list_news_articles', 'get_news_article'],
  indicators: ['get_instrument_indicators'],
  macro: ['get_macro_series'],
  constituents: ['get_sector_list', 'get_sector_constituents', 'get_index_constituents'],
  profile: ['get_instrument_profile', 'get_etf_profile', 'get_etf_list'],
  financials: [
    'get_instrument_financials',
    'get_instrument_income_statement',
    'get_instrument_balance_sheet',
    'get_instrument_cash_flow',
    'get_instrument_financial_indicators',
    'get_instrument_shareholders',
    'get_instrument_institution_holdings',
    'get_instrument_dividend',
  ],
  report: ['search_library'],
  market_lists: [
    'get_dragon_tiger',
    'get_limit_updown',
    'get_cn_market_special',
    'get_market_dynamics',
    'get_trade_calendar',
    'get_market_session',
    'get_market_sentiment',
    'get_market_regime',
  ],
  cyq: ['get_instrument_cyq'],
}

/**
 * L1/L2 跨名互备：除 search_nl 自身外，所有取数 cap 均可走到问数（query2data）；
 * quotes↔snapshot 互备；search_nl↔search_symbol 互备。
 */
export function relatedCapabilities(cap: McpCapability): McpCapability[] {
  if (cap === 'search_nl') return ['search_symbol']
  if (cap === 'search_symbol') return ['search_nl']
  if (cap === 'quotes') return ['snapshot', 'search_nl']
  if (cap === 'snapshot') return ['quotes', 'search_nl']
  if (cap === 'market_lists') return ['search_nl']
  if (cap === 'cyq') return ['search_nl']
  // kline / indicators / constituents / news / announcement / report / profile / financials / macro
  return ['search_nl']
}

export function localToolsForCapability(cap: McpCapability): string[] {
  return CAP_TO_LOCAL[cap] ?? []
}

function bareToolName(toolName: string): string {
  const parsed = parseNamespacedMcpTool(toolName)
  return parsed ? parsed.toolName : toolName
}

function heuristicCapability(bare: string, description?: string): McpCapability | null {
  const text = `${bare} ${description ?? ''}`.toLowerCase()
  if (/snapshot|快照/.test(text)) return 'snapshot'
  if (/quote|行情|realtime|实时/.test(text)) return 'quotes'
  if (/kline|candle|ohlc|chart|k线/.test(text)) return 'kline'
  if (/cyq|chip|筹码|获利盘/.test(text)) return 'cyq'
  if (/announce|notice|disclosure|公告/.test(text)) return 'announcement'
  if (/report|研报/.test(text)) return 'report'
  if (/news|资讯|新闻/.test(text)) return 'news'
  // 板块目录须先于成分规则，避免 sector_list 被误伤；sector_constituents 仍走 constituent
  if (/sector.?list|板块目录|行业目录/.test(text)) return 'constituents'
  if (/constituent|成分/.test(text)) return 'constituents'
  if (/macro|gdp|cpi|宏观/.test(text)) return 'macro'
  if (/indicator|指标/.test(text)) return 'indicators'
  if (/profile|概况|简介/.test(text)) return 'profile'
  if (/financial|财务/.test(text)) return 'financials'
  if (/dragon.?tiger|龙虎榜|\blhb\b/.test(text)) return 'market_lists'
  if (/limit.?up|涨停|跌停|连板/.test(text)) return 'market_lists'
  if (/trade.?calendar|交易日历|\bcalendar\b/.test(text)) return 'market_lists'
  if (/market.?session|是否开盘|\b开盘\b|\bsession\b/.test(text)) return 'market_lists'
  if (/sentiment|情绪/.test(text)) return 'market_lists'
  if (/regime|牛熊/.test(text)) return 'market_lists'
  if (/query2data|search_nl|问数|选股/.test(text)) return 'search_nl'
  if (/search_instrument|搜码|symbol.?search|search.?symbol/.test(text)) return 'search_symbol'
  return null
}

const LOCAL_UNMAPPED = new Set<string>([
  ...LOCAL_ONLY_TOOL_NAMES,
  ...LOCAL_OFFLINE_ASSET_TOOLS,
])

/** 先剥 server__，再查表/启发式；本地独有/离线资产与未知返回 null */
export function resolveToolCapability(
  toolName: string,
  description?: string,
): McpCapability | null {
  const bare = bareToolName(toolName)
  if (LOCAL_UNMAPPED.has(bare)) return null
  if (LOCAL_TOOL_CAP[bare]) return LOCAL_TOOL_CAP[bare]
  if (KNOWN_REMOTE_CAP[bare]) return KNOWN_REMOTE_CAP[bare]
  return heuristicCapability(bare, description)
}

/**
 * 在 query / keyword / q / code / symbol / instrument.{symbol,code} 之间互拷；
 * search_nl 用 query；search_instruments 用 keyword。其它字段原样展开（本地 snapshot/quotes 保留 instrument/code）。
 * 榜单/日历/情绪转到问数时按能力合成中文问句，即使已有 code 也不只用裸代码。
 */
export function adaptCapabilityArgs(
  fromTool: string,
  toTool: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args }
  const toBare = bareToolName(toTool)
  const fromBare = bareToolName(fromTool)

  const nlQuery =
    pickString(args, 'query')
    ?? pickString(args, 'keyword')
    ?? pickString(args, 'q')
  const codeVal =
    pickString(args, 'code')
    ?? pickString(args, 'symbol')
    ?? pickInstrumentCode(args.instrument)
  const queryVal = nlQuery ?? codeVal

  const toSearchNl =
    toBare === 'query2data'
    || KNOWN_REMOTE_CAP[toBare] === 'search_nl'
    || resolveToolCapability(toTool) === 'search_nl'

  if (queryVal !== undefined) {
    if (toBare === 'search_instruments' || LOCAL_TOOL_CAP[toBare] === 'search_symbol') {
      out.keyword = queryVal
    }
  }

  if (toSearchNl) {
    const searchQuery = resolveSearchNlQuery(
      fromTool,
      fromBare,
      args,
      nlQuery,
      codeVal,
      queryVal,
    )
    if (searchQuery !== undefined) out.query = searchQuery
  }

  return out
}

function resolveSearchNlQuery(
  fromTool: string,
  fromBare: string,
  args: Record<string, unknown>,
  nlQuery: string | undefined,
  codeVal: string | undefined,
  queryVal: string | undefined,
): string | undefined {
  if (fromIsCyq(fromTool)) {
    return enrichCyqSearchNlQuery(args, queryVal)
  }
  const synthesized = synthesizeMarketListQuery(fromBare, args)
  // 已有自然语言问句则保留；否则榜单能力即使带 code 也要合成语义，避免只传 600519
  if (synthesized && !nlQuery) {
    return prefixCodeIfUseful(codeVal, synthesized)
  }
  return queryVal
}

/** 对齐筹码问句：代码贴在能力问句前，不覆盖已有语义。 */
function prefixCodeIfUseful(code: string | undefined, query: string): string {
  if (!code || query.includes(code)) return query
  return `${code}${query}`
}

function fromIsCyq(fromTool: string): boolean {
  return resolveToolCapability(fromTool) === 'cyq'
}

/** 问数互备时裸代码不够；已含筹码/获利语义则不覆盖。 */
function enrichCyqSearchNlQuery(
  args: Record<string, unknown>,
  queryVal: string | undefined,
): string {
  const existing = pickString(args, 'query') ?? pickString(args, 'keyword') ?? pickString(args, 'q')
  if (existing && /筹码|获利/.test(existing)) return existing
  if (queryVal && /筹码|获利/.test(queryVal)) return queryVal

  const code = pickString(args, 'code')
    ?? pickString(args, 'symbol')
    ?? pickInstrumentCode(args.instrument)
  if (code) return `${code}筹码 获利盘 平均成本`
  if (queryVal) return `${queryVal}筹码 获利盘 平均成本`
  return '筹码 获利盘 平均成本'
}

/** 榜单/日历等工具转到问数时必须合成自然语言，避免查询为空或只剩裸代码。 */
export function synthesizeMarketListQuery(
  fromBare: string,
  args: Record<string, unknown>,
): string | undefined {
  const date = pickString(args, 'date') ?? pickDateLike(args.date)
  if (fromBare === 'get_limit_updown') {
    return date ? `${date}涨停跌停` : '今日涨停跌停'
  }
  if (fromBare === 'get_dragon_tiger') {
    return date ? `${date}龙虎榜` : '今日龙虎榜'
  }
  if (fromBare === 'get_market_dynamics') {
    return '今日市场概况 主要指数 涨跌家数'
  }
  if (fromBare === 'get_cn_market_special') {
    return cnMarketSpecialQuery(pickString(args, 'kind'))
  }
  if (fromBare === 'get_trade_calendar') {
    const year = pickString(args, 'year') ?? pickDateLike(args.year)
    return year ? `${year}年交易日历` : '当年交易日历'
  }
  if (fromBare === 'get_market_session') {
    return '是否开盘'
  }
  if (fromBare === 'get_market_sentiment') {
    return '市场情绪'
  }
  if (fromBare === 'get_market_regime') {
    return '市场牛熊风险偏好'
  }
  if (fromBare === 'get_sector_list') {
    return 'A股板块行业目录'
  }
  // 未知工具名仍按名称启发式合成，新 MCP 不必改此表
  return synthesizeByNameHint(fromBare, args)
}

function synthesizeByNameHint(
  fromBare: string,
  args: Record<string, unknown>,
): string | undefined {
  const text = fromBare.toLowerCase()
  const date = pickString(args, 'date') ?? pickDateLike(args.date)
  if (/limit.?up|涨停|跌停|连板/.test(text)) {
    return date ? `${date}涨停跌停` : '今日涨停跌停'
  }
  if (/dragon.?tiger|龙虎|\blhb\b/.test(text)) {
    return date ? `${date}龙虎榜` : '今日龙虎榜'
  }
  if (/trade.?calendar|交易日历|\bcalendar\b/.test(text)) {
    const year = pickString(args, 'year') ?? pickDateLike(args.year)
    return year ? `${year}年交易日历` : '当年交易日历'
  }
  if (/market.?session|是否开盘|\bsession\b/.test(text)) return '是否开盘'
  if (/sentiment|情绪/.test(text)) return '市场情绪'
  if (/regime|牛熊/.test(text)) return '市场牛熊风险偏好'
  return undefined
}

function cnMarketSpecialQuery(kind: string | undefined): string {
  if (kind === 'limit_up_ladder') return '连板天梯'
  if (kind === 'skyrocket') return '飙升榜'
  if (kind === 'hot_history' || kind === 'hot_rank_trend') return '热股榜'
  if (kind?.startsWith('anomaly_')) return '异动'
  if (kind === 'ths_index_list') return '同花顺概念指数目录'
  return 'A股热榜'
}

function pickString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v : undefined
}

function pickInstrumentCode(instrument: unknown): string | undefined {
  if (!instrument || typeof instrument !== 'object' || Array.isArray(instrument)) return undefined
  const rec = instrument as Record<string, unknown>
  return pickString(rec, 'symbol') ?? pickString(rec, 'code')
}

function pickDateLike(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

export function namespacedRemote(serverId: string, remoteTool: string): string {
  return namespacedMcpTool(serverId, remoteTool)
}

export { MCP_TOOL_NAMESPACE_SEP }
