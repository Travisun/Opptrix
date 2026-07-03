import type { ResearchHub } from '@opptrix/research-hub'
import type { AgentAppContext } from './app-context.js'
import {
  createDefaultAppContext,
  getCurrentTime,
  getDataLayerPaths,
  getSystemInfo,
  resolveProjectRoot,
} from './app-context.js'
import {
  DATA_LAYER_MINING_TOOL_NAMES,
  TOOL_META,
  formatToolDescription,
  type ToolMeta,
} from './tool-meta.js'
import {
  buildUnifiedInstrumentTools,
  CHAT_MCP_TOOL_NAMES,
} from './unified-mcp-tools.js'
import { buildAgentSystemRules, instrumentRefsFromList, normalizeInstrumentHubParams, resolveInstrumentFromParams } from '@opptrix/shared'

/** @deprecated 使用 DATA_LAYER_MINING_TOOL_NAMES */
export const DISCOVER_MINING_TOOL_NAMES = DATA_LAYER_MINING_TOOL_NAMES

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
  meta?: ToolMeta
}

export interface McpToolDef {
  name: string
  description: string
  inputSchema: JsonSchema
}

export interface OpenAiTool {
  type: 'function'
  function: { name: string; description: string; parameters: JsonSchema }
}

export class ToolRegistry {
  readonly tools: ToolDef[]
  private appContext: AgentAppContext

  constructor(private hub: ResearchHub, appContext?: AgentAppContext) {
    this.appContext = appContext ?? createDefaultAppContext()
    this.tools = [...this.buildDataTools(), ...this.buildBasicTools()]
  }

  list() { return this.tools }

  get(name: string) { return this.tools.find(t => t.name === name) }

  openAiTools(names?: readonly string[]): OpenAiTool[] {
    /** @deprecated 运行时请经 McpToolBroker（MCP 协议）；此方法仅供目录/文档生成 */
    const allow = names ? new Set(names) : null
    return this.tools
      .filter(t => !allow || allow.has(t.name))
      .map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: formatToolDescription(t.description, t.meta),
          parameters: t.parameters,
        },
      }))
  }

  /** MCP list_tools 格式 */
  mcpTools(names?: readonly string[]): McpToolDef[] {
    const allow = names ? new Set(names) : null
    return this.tools
      .filter(t => !allow || allow.has(t.name))
      .map(t => ({
        name: t.name,
        description: formatToolDescription(t.description, t.meta),
        inputSchema: t.parameters,
      }))
  }

  miningTools(): OpenAiTool[] {
    return this.openAiTools(DATA_LAYER_MINING_TOOL_NAMES)
  }

  chatToolNames(): readonly string[] {
    return CHAT_MCP_TOOL_NAMES(this)
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
      '你是 Opptrix 专业多市场投研助手。仅通过已注册的 MCP 投研工具获取真实数据，再基于结果用中文给出简洁、专业的分析。',
      buildAgentSystemRules(),
    ].join('\n')
  }

  private dispatch(feature: string, params: Record<string, unknown>) {
    return this.hub.dispatch(feature, params)
  }

  private buildDataTools(): ToolDef[] {
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    const tools: Omit<ToolDef, 'meta'>[] = [
      {
        name: 'evaluate_stock', category: '个股分析',
        description: '对单只股票做全面因子评估与评分卡打分',
        parameters: S({
          code: { type: 'string', description: '6位股票代码，如 600519' },
          scorecard: { type: 'string', description: '评分卡名称，默认综合评估' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_evaluation', {
          ...normalizeInstrumentHubParams({ code: a.code, market: 'CN' }),
          scorecard: a.scorecard ?? '综合评估',
        }),
      },
      {
        name: 'screen_stocks', category: '选股',
        description: '按因子条件筛选股票（优先本地 L0 初选库，未就绪时在线扫描）',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]，op 为 > >= < <= =' },
          scorecard: { type: 'string', description: '评分卡' },
          top_n: { type: 'number', description: '返回条数，默认20' },
        }, ['conditions']),
        handler: (a: Record<string, unknown>) => d('screening', { conditions: a.conditions, scorecard: a.scorecard, top_n: a.top_n ?? 20 }),
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
        name: 'get_local_universe_screen_schema', category: '本地数据',
        description: '获取本地初选多维度筛选说明：因子单位/区间、行业/板块/评分/市值过滤格式与示例',
        parameters: S({}),
        handler: () => d('local_universe_screen_schema', {}),
      },
      {
        name: 'screen_local_universe', category: '本地数据',
        description: '本地初选库多维度组合筛选（因子条件 + 行业/板块/评分/估值/市值 + 排序）',
        parameters: S({
          factor_conditions: {
            type: 'array',
            description: '因子条件 [{factor, op, value}]，op 为 > >= < <= =，AND 组合，最多 8 条',
          },
          industry_contains: { type: 'string', description: '行业关键词模糊匹配' },
          industries: { type: 'array', description: '行业名称精确匹配列表' },
          markets: { type: 'array', description: '交易所板块：SH / SZ / BJ' },
          min_total_score: { type: 'number', description: '综合评分下限 0-100' },
          max_total_score: { type: 'number', description: '综合评分上限 0-100' },
          min_market_cap_yi: { type: 'number', description: '总市值下限（亿元）' },
          max_market_cap_yi: { type: 'number', description: '总市值上限（亿元）' },
          min_pe: { type: 'number', description: 'PE 下限（倍）' },
          max_pe: { type: 'number', description: 'PE 上限（倍）' },
          min_pb: { type: 'number', description: 'PB 下限（倍）' },
          max_pb: { type: 'number', description: 'PB 上限（倍）' },
          exclude_st: { type: 'boolean', description: '是否排除 ST，默认 true' },
          scorecard: { type: 'string', description: '评分卡，默认综合评估' },
          sort_by: { type: 'string', description: '排序字段：total_score / pe / pb / market_cap / 因子名' },
          sort_order: { type: 'string', description: 'asc 或 desc，默认 desc' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD，默认最新' },
          top_n: { type: 'number', description: '返回条数 1-200，默认 40' },
        }),
        handler: (a: Record<string, unknown>) => d('local_universe_screen', a),
      },
      {
        name: 'list_local_industries', category: '本地数据',
        description: '列出本地初选库中的行业名称（含股票数、均分/估值），支持关键词过滤',
        parameters: S({
          keyword: { type: 'string', description: '行业名称关键词，如「半导体」「银行」' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD，默认最新' },
          limit: { type: 'number', description: '返回行业数上限 1-500，默认 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_industry_list', a),
      },
      {
        name: 'screen_local_industry_stocks', category: '本地数据',
        description: '在指定行业内筛选本地股票（因子条件 + 评分/估值 + 排序），行业名须与 list_local_industries 一致',
        parameters: S({
          industry: { type: 'string', description: '行业精确名称（推荐，来自 list_local_industries）' },
          industries: { type: 'array', description: '多个行业精确匹配（与 industry 可叠加）' },
          industry_contains: { type: 'string', description: '行业关键词模糊匹配（不知精确名时用）' },
          factor_conditions: {
            type: 'array',
            description: '因子条件 [{factor, op, value}]，AND 组合，最多 8 条',
          },
          min_total_score: { type: 'number', description: '综合评分下限 0-100' },
          max_total_score: { type: 'number', description: '综合评分上限 0-100' },
          min_pe: { type: 'number', description: 'PE 下限（倍）' },
          max_pe: { type: 'number', description: 'PE 上限（倍）' },
          min_pb: { type: 'number', description: 'PB 下限（倍）' },
          max_pb: { type: 'number', description: 'PB 上限（倍）' },
          exclude_st: { type: 'boolean', description: '是否排除 ST，默认 true' },
          scorecard: { type: 'string', description: '评分卡，默认综合评估' },
          sort_by: { type: 'string', description: '排序：total_score / pe / pb / market_cap / 因子名' },
          sort_order: { type: 'string', description: 'asc 或 desc，默认 desc' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD' },
          top_n: { type: 'number', description: '返回条数 1-200，默认 40' },
        }),
        handler: (a: Record<string, unknown>) => d('local_industry_screen', a),
      },
      {
        name: 'local_screen_stocks', category: '本地数据',
        description: '使用本地 L0 因子库快速初选，不拉取全市场在线数据',
        parameters: S({
          conditions: { type: 'array', description: '条件数组 [{factor, op, value}]' },
          top_n: { type: 'number', description: '返回条数，默认60' },
        }, ['conditions']),
        handler: (a: Record<string, unknown>) => d('screening', { conditions: a.conditions, scorecard: '综合评估', top_n: a.top_n ?? 60 }),
      },
      {
        name: 'get_local_industry_stocks', category: '本地数据',
        description: '按行业名称获取本地成分股列表（价量、评分），不做因子筛选',
        parameters: S({
          industry: { type: 'string', description: '行业精确名称，来自 list_local_industries' },
          trade_date: { type: 'string', description: '交易日 YYYY-MM-DD' },
          limit: { type: 'number', description: '返回条数 1-200，默认 120' },
        }, ['industry']),
        handler: (a: Record<string, unknown>) => d('market_industry_stocks', a),
      },
      {
        name: 'get_industry_stats', category: '本地数据',
        description: '本地行业截面统计：股票数、均分、均 PE/PB',
        parameters: S({
          trade_date: { type: 'string', description: '可选交易日 YYYY-MM-DD' },
        }),
        handler: (a: Record<string, unknown>) => d('market_industry_stats', { trade_date: a.trade_date }),
      },
      {
        name: 'batch_stock_snapshots', category: '本地数据',
        description: '批量获取候选股的本地截面快照（行业、评分、估值、初选因子）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表，建议不超过80' },
        }, ['codes']),
        handler: (a: Record<string, unknown>) => d('instrument_batch_snapshots', {
          instruments: instrumentRefsFromList(a.codes, 'CN'),
        }),
      },
      {
        name: 'get_market_db_sync_state', category: '本地数据',
        description: '查询本地数据同步任务进度与最近更新时间',
        parameters: S({}),
        handler: () => d('market_db_sync_state', {}),
      },
      {
        name: 'trigger_market_db_sync', category: '本地数据',
        description: '后台触发本地市场数据同步（resume/bootstrap），用于本地因子库未就绪时',
        parameters: S({
          mode: { type: 'string', description: 'resume 或 bootstrap，默认 resume' },
          background: { type: 'boolean', description: '是否后台执行，默认 true' },
        }),
        handler: (a: Record<string, unknown>) => d('market_db_sync', {
          mode: a.mode ?? 'resume',
          background: a.background ?? true,
        }),
      },
      {
        name: 'get_stock_quotes', category: '本地数据',
        description: '批量获取股票实时行情（价量、涨跌幅）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表' },
        }, ['codes']),
        handler: (a: Record<string, unknown>) => d('instrument_quotes', {
          instruments: instrumentRefsFromList(a.codes, 'CN'),
        }),
      },
      {
        name: 'get_watchlist', category: '组合管理',
        description: '读取用户关注列表（代码、名称、行业、备注、加入价）',
        parameters: S({}),
        handler: () => d('watchlist_list', {}),
      },
      {
        name: 'get_watchlist_radar', category: '本地数据',
        description: '关注列表雷达：行情 + 策略信号摘要（codes 为空则使用用户关注列表）',
        parameters: S({
          codes: { type: 'array', description: '股票代码列表，省略则读取用户关注列表' },
        }),
        handler: (a: Record<string, unknown>) => d('watchlist_radar', { codes: a.codes }),
      },
      {
        name: 'get_stock_kline', category: '本地数据',
        description: '获取单股日 K 线序列（本地/在线）',
        parameters: S({
          code: { type: 'string', description: '6位股票代码' },
          count: { type: 'number', description: 'K线根数，默认90，最大240' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_chart', {
          ...normalizeInstrumentHubParams({ code: a.code, market: 'CN' }),
          period: 'daily',
          count: a.count ?? 90,
        }),
      },
      {
        name: 'get_stock_cyq', category: '本地数据',
        description: '获取单股筹码分布（CYQ）',
        parameters: S({ code: { type: 'string', description: '6位股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_cyq', normalizeInstrumentHubParams({ code: a.code, market: 'CN' })),
      },
      {
        name: 'get_stock_chart', category: '本地数据',
        description: '获取单股多周期图表数据（日/周/月/分钟）',
        parameters: S({
          code: { type: 'string', description: '6位股票代码' },
          period: { type: 'string', description: '周期：daily/weekly/monthly/1m/5m 等' },
          count: { type: 'number', description: '返回条数，0 为默认' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_chart', {
          ...normalizeInstrumentHubParams({ code: a.code, market: 'CN' }),
          period: a.period ?? 'daily',
          count: a.count ?? 0,
        }),
      },
      {
        name: 'get_stock_detail', category: '本地数据',
        description: '获取单股详情：行情、基本面、财务、新闻、资金流等聚合',
        parameters: S({ code: { type: 'string', description: '6位股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_snapshot', normalizeInstrumentHubParams({ code: a.code, market: 'CN' })),
      },
      {
        name: 'get_etf_list', category: '本地数据',
        description: '获取 A 股 ETF 列表（本地优先，含代码、名称、净值摘要）',
        parameters: S({
          code: { type: 'string', description: '可选，6 位 ETF 代码过滤单只' },
        }),
        handler: (a: Record<string, unknown>) => d('local_etf_list', {
          ...(a.code ? { code: a.code } : {}),
        }),
      },
      {
        name: 'search_etfs', category: '通用',
        description: '按代码或名称搜索 A 股 ETF',
        parameters: S({
          keyword: { type: 'string', description: '搜索关键词' },
        }, ['keyword']),
        handler: (a: Record<string, unknown>) => d('search_etfs', { keyword: a.keyword }),
      },
      {
        name: 'get_etf_snapshot', category: '本地数据',
        description: '单只 ETF 快照：概况、净值、实时行情',
        parameters: S({ code: { type: 'string', description: '6 位 ETF 代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('etf_snapshot', { code: a.code }),
      },
      {
        name: 'get_etf_nav', category: '本地数据',
        description: 'ETF 历史净值与溢价率',
        parameters: S({ code: { type: 'string', description: '6 位 ETF 代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('local_etf_nav', { code: a.code }),
      },
      {
        name: 'get_etf_holdings', category: '本地数据',
        description: 'ETF 最新披露持仓与权重',
        parameters: S({ code: { type: 'string', description: '6 位 ETF 代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('local_etf_holdings', { code: a.code }),
      },
      {
        name: 'get_local_etf_screen_schema', category: '本地数据',
        description: '本地 ETF 筛选维度说明（溢价率、规模、跟踪指数等）',
        parameters: S({}),
        handler: () => d('local_etf_screen_schema', {}),
      },
      {
        name: 'screen_local_etfs', category: '本地数据',
        description: '本地 ETF 筛选：按折溢价率、规模（亿元）、跟踪指数等条件过滤',
        parameters: S({
          min_premium_rate: { type: 'number', description: '折溢价率下限（%）' },
          max_premium_rate: { type: 'number', description: '折溢价率上限（%）' },
          min_scale_yi: { type: 'number', description: '规模下限（亿元）' },
          max_scale_yi: { type: 'number', description: '规模上限（亿元）' },
          keyword: { type: 'string', description: '代码或名称关键词' },
          tracking_index_contains: { type: 'string', description: '跟踪指数关键词' },
          sort_by: { type: 'string', description: 'premium_rate | scale_yi | nav | code | name' },
          top_n: { type: 'number', description: '返回条数，默认 50，最大 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_etf_screen', a),
      },
      {
        name: 'get_etf_scorecard', category: '本地数据',
        description: '单只 A 股 ETF 决策雷达：折溢价、规模流动性、费率、净值稳健与同类对比（0–100 分）',
        parameters: S({ code: { type: 'string', description: '6 位 ETF 代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('etf_scorecard', { code: a.code }),
      },
      {
        name: 'get_etf_scorecard_schema', category: '本地数据',
        description: 'ETF 决策雷达评分维度与权重说明',
        parameters: S({}),
        handler: () => d('etf_scorecard_schema', {}),
      },
      {
        name: 'get_local_us_screen_schema', category: '本地数据',
        description: '本地美股列表筛选维度说明（keyword、行业等）',
        parameters: S({}),
        handler: () => d('local_us_screen_schema', {}),
      },
      {
        name: 'screen_local_us_stocks', category: '本地数据',
        description: '本地美股列表筛选：按 ticker/公司名、行业关键词过滤',
        parameters: S({
          keyword: { type: 'string', description: 'ticker 或公司名关键词' },
          industry_contains: { type: 'string', description: '行业关键词' },
          sort_by: { type: 'string', description: 'code | name' },
          top_n: { type: 'number', description: '返回条数，默认 50，最大 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_us_screen', a),
      },
      {
        name: 'get_local_crypto_screen_schema', category: '本地数据',
        description: '本地 Crypto 交易对筛选维度说明（quote、base 等）',
        parameters: S({}),
        handler: () => d('local_crypto_screen_schema', {}),
      },
      {
        name: 'screen_local_crypto_pairs', category: '本地数据',
        description: '本地 Crypto 交易对筛选：按 keyword、quote、base_contains 过滤',
        parameters: S({
          keyword: { type: 'string', description: '交易对或名称关键词' },
          quote: { type: 'string', description: '计价币，如 USDT、BTC' },
          base_contains: { type: 'string', description: '基础币前缀，如 BTC、ETH' },
          sort_by: { type: 'string', description: 'code | name | quote' },
          top_n: { type: 'number', description: '返回条数，默认 50，最大 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_crypto_screen', a),
      },
      {
        name: 'get_local_jp_screen_schema', category: '本地数据',
        description: '本地日股列表筛选维度说明（keyword、行业等）',
        parameters: S({}),
        handler: () => d('local_jp_screen_schema', {}),
      },
      {
        name: 'screen_local_jp_stocks', category: '本地数据',
        description: '本地日股列表筛选：按代码/公司名、行业关键词过滤',
        parameters: S({
          keyword: { type: 'string', description: '代码或公司名关键词' },
          industry_contains: { type: 'string', description: '行业关键词' },
          sort_by: { type: 'string', description: 'code | name' },
          top_n: { type: 'number', description: '返回条数，默认 50，最大 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_jp_screen', a),
      },
      {
        name: 'get_local_kr_screen_schema', category: '本地数据',
        description: '本地韩股列表筛选维度说明（keyword、行业等）',
        parameters: S({}),
        handler: () => d('local_kr_screen_schema', {}),
      },
      {
        name: 'screen_local_kr_stocks', category: '本地数据',
        description: '本地韩股列表筛选：按代码/公司名、行业关键词过滤',
        parameters: S({
          keyword: { type: 'string', description: '代码或公司名关键词' },
          industry_contains: { type: 'string', description: '行业关键词' },
          sort_by: { type: 'string', description: 'code | name' },
          top_n: { type: 'number', description: '返回条数，默认 50，最大 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_kr_screen', a),
      },
      {
        name: 'get_local_hk_screen_schema', category: '本地数据',
        description: '本地港股列表筛选维度说明（keyword、行业等）',
        parameters: S({}),
        handler: () => d('local_hk_screen_schema', {}),
      },
      {
        name: 'screen_local_hk_stocks', category: '本地数据',
        description: '本地港股列表筛选：按代码/公司名、行业关键词过滤',
        parameters: S({
          keyword: { type: 'string', description: '代码或公司名关键词' },
          industry_contains: { type: 'string', description: '行业关键词' },
          sort_by: { type: 'string', description: 'code | name' },
          top_n: { type: 'number', description: '返回条数，默认 50，最大 200' },
        }),
        handler: (a: Record<string, unknown>) => d('local_hk_screen', a),
      },
      {
        name: 'search_local_instruments', category: '本地数据',
        description: '跨市场本地标的搜索（CN/US/HK/JP/KR/Crypto instruments 表）',
        parameters: S({
          keyword: { type: 'string', description: '代码或名称关键词' },
          limit: { type: 'number', description: '返回条数，默认 30' },
          markets: { type: 'array', description: '可选市场过滤，如 US、JP' },
        }, ['keyword']),
        handler: (a: Record<string, unknown>) => d('instrument_search', a),
      },
      {
        name: 'get_us_stock_quote', category: '本地数据',
        description: '获取单只美股实时行情',
        parameters: S({
          symbol: { type: 'string', description: '美股 ticker，如 AAPL' },
        }, ['symbol']),
        handler: (a: Record<string, unknown>) => {
          const ref = resolveInstrumentFromParams({ market: 'US', symbol: a.symbol ?? a.code })
          return d('instrument_quotes', { instruments: ref ? [ref] : [] })
        },
      },
      {
        name: 'get_us_stock_kline', category: '本地数据',
        description: '获取美股日 K 线',
        parameters: S({
          symbol: { type: 'string', description: '美股 ticker' },
          count: { type: 'number', description: 'K 线根数，默认 180' },
        }, ['symbol']),
        handler: (a: Record<string, unknown>) => d('instrument_chart', {
          ...normalizeInstrumentHubParams({ market: 'US', symbol: a.symbol ?? a.code }),
          period: 'daily',
          count: a.count ?? 180,
        }),
      },
      {
        name: 'get_us_stock_profile', category: '本地数据',
        description: '获取美股公司概况',
        parameters: S({ symbol: { type: 'string', description: '美股 ticker' } }, ['symbol']),
        handler: (a: Record<string, unknown>) => d('us_profile', { symbol: a.symbol ?? a.code }),
      },
      {
        name: 'get_us_stock_financials', category: '本地数据',
        description: '美股财报摘要（营收、净利、EPS、ROE 等；需 TickFlow 已配置）',
        parameters: S({
          symbol: { type: 'string', description: '美股 ticker' },
          report_type: { type: 'string', description: 'annual 或 quarter，默认 annual' },
        }, ['symbol']),
        handler: (a: Record<string, unknown>) => d('us_financials', {
          symbol: a.symbol ?? a.code,
          report_type: a.report_type,
        }),
      },
      {
        name: 'get_us_stock_snapshot', category: '本地数据',
        description: '单只美股快照：概况、行情、近期 K 线',
        parameters: S({ symbol: { type: 'string', description: '美股 ticker' } }, ['symbol']),
        handler: (a: Record<string, unknown>) => d('instrument_snapshot', normalizeInstrumentHubParams({
          market: 'US',
          symbol: a.symbol ?? a.code,
        })),
      },
      {
        name: 'search_us_stocks', category: '通用',
        description: '搜索美股（ticker 或公司名）',
        parameters: S({ keyword: { type: 'string', description: '搜索关键词' } }, ['keyword']),
        handler: (a: Record<string, unknown>) => d('search_us_stocks', { keyword: a.keyword }),
      },
      {
        name: 'get_crypto_quote', category: '本地数据',
        description: 'Crypto 交易对实时行情（如 BTC/USDT）',
        parameters: S({ pair: { type: 'string', description: '交易对，如 BTC/USDT' } }, ['pair']),
        handler: (a: Record<string, unknown>) => {
          const ref = resolveInstrumentFromParams({ code: a.pair ?? a.symbol })
          return d('instrument_quotes', { instruments: ref ? [ref] : [] })
        },
      },
      {
        name: 'get_crypto_kline', category: '本地数据',
        description: 'Crypto 交易对日 K 线',
        parameters: S({
          pair: { type: 'string', description: '交易对，如 BTC/USDT' },
          count: { type: 'number', description: 'K 线根数，默认 180' },
        }, ['pair']),
        handler: (a: Record<string, unknown>) => d('instrument_chart', {
          ...normalizeInstrumentHubParams({ code: a.pair ?? a.symbol }),
          period: 'daily',
          count: a.count ?? 180,
        }),
      },
      {
        name: 'get_crypto_snapshot', category: '本地数据',
        description: 'Crypto 交易对快照：行情 + 近期 K 线',
        parameters: S({ pair: { type: 'string', description: '交易对，如 BTC/USDT' } }, ['pair']),
        handler: (a: Record<string, unknown>) => d('instrument_snapshot', normalizeInstrumentHubParams({ code: a.pair ?? a.symbol })),
      },
      {
        name: 'search_crypto_pairs', category: '通用',
        description: '搜索 Crypto 交易对（base 或 pair 名）',
        parameters: S({ keyword: { type: 'string', description: '搜索关键词' } }, ['keyword']),
        handler: (a: Record<string, unknown>) => d('search_crypto_pairs', { keyword: a.keyword }),
      },
      {
        name: 'analyze_portfolio', category: '组合管理',
        description: '分析持仓组合的因子暴露与综合评分',
        parameters: S({
          holdings: { type: 'array', description: '持仓 [[code, weight], ...] weight 为 0-1 小数' },
          scorecard: { type: 'string', description: '评分卡' },
        }, ['holdings']),
        handler: (a: Record<string, unknown>) => d('portfolio_analysis', { holdings: a.holdings, scorecard: a.scorecard }),
      },
      {
        name: 'search_stocks', category: '通用',
        description: '按代码或名称关键词搜索本地股票池（market.db universe）',
        parameters: S({ keyword: { type: 'string', description: '搜索关键词' } }, ['keyword']),
        handler: (a: Record<string, unknown>) => d('search_stocks', { keyword: a.keyword }),
      },
      {
        name: 'get_strategy_signal', category: '策略',
        description: '获取单股 9 策略融合信号（看多/看空/中性）',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_strategy_signal', normalizeInstrumentHubParams({ code: a.code, market: 'CN' })),
      },
      {
        name: 'institution_rating', category: '个股分析',
        description: '28 家机构风格综合评级与共识',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          groups: { type: 'array', description: '可选机构分组过滤' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_institution_rating', {
          ...normalizeInstrumentHubParams({ code: a.code, market: 'CN' }),
          groups: a.groups,
        }),
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
        handler: (a: Record<string, unknown>) => d('backtest', { codes: a.codes, scorecard: a.scorecard, periods: a.periods ?? 5 }),
      },
      {
        name: 'strategy_verify', category: '策略',
        description: '验证策略历史信号胜率与 forward 收益',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          checkpoints: { type: 'number', description: '验证点数' },
          forward_days: { type: 'number', description: '持有天数' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_strategy_verify', {
          ...normalizeInstrumentHubParams({ code: a.code, market: 'CN' }),
          checkpoints: a.checkpoints ?? 30,
          forward_days: a.forward_days ?? 5,
        }),
      },
      {
        name: 'strategy_verify_report', category: '策略',
        description: '策略验证的格式化文本报告',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          checkpoints: { type: 'number', description: '验证点数' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_verify_report', { code: a.code, checkpoints: a.checkpoints ?? 30 }),
      },
      {
        name: 'strategy_report', category: '策略',
        description: '单股 T 策略综合分析文本报告',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('strategy_report', { code: a.code }),
      },
      {
        name: 'institution_report', category: '个股分析',
        description: '机构评级完整文本报告',
        parameters: S({
          code: { type: 'string', description: '股票代码' },
          groups: { type: 'array', description: '机构分组' },
        }, ['code']),
        handler: (a: Record<string, unknown>) => d('instrument_institution_report', {
          ...normalizeInstrumentHubParams({ code: a.code, market: 'CN' }),
          groups: a.groups,
        }),
      },
      {
        name: 'industry_mining', category: '报告',
        description: '产业链透视与代表公司',
        parameters: S({ industry: { type: 'string', description: '行业名称，如 半导体' } }, ['industry']),
        handler: (a: Record<string, unknown>) => d('industry_mining', { industry: a.industry }),
      },
      {
        name: 'industry_mermaid', category: '报告',
        description: '产业链 Mermaid mindmap 源码',
        parameters: S({ industry: { type: 'string', description: '行业名称' } }, ['industry']),
        handler: (a: Record<string, unknown>) => d('industry_mermaid', { industry: a.industry }),
      },
      {
        name: 'get_news_center_status', category: '资讯中心',
        description: '查询新闻中心同步状态、订阅/分组数量与文章索引规模',
        parameters: S({}),
        handler: () => d('news_center_status', {}),
      },
      {
        name: 'list_news_groups', category: '资讯中心',
        description: '列出资讯自定义分组（id、名称、所含订阅数）',
        parameters: S({}),
        handler: () => d('news_groups_list', {}),
      },
      {
        name: 'list_news_sources', category: '资讯中心',
        description: '列出 RSS/Atom 订阅来源（id、名称、分组、启用状态）',
        parameters: S({}),
        handler: () => d('news_sources_list', {}),
      },
      {
        name: 'list_news_articles', category: '资讯中心',
        description: '按时间线/分组/来源分页浏览本地资讯列表（仅标题与短摘要，不含正文）',
        parameters: S({
          view: {
            type: 'string',
            description: 'timeline（默认，全站时间线）| group（按分组）| source（按订阅来源）',
          },
          group_id: {
            type: 'string',
            description: 'view=group 时必填；未分组订阅用 __ungrouped__',
          },
          subscription_id: {
            type: 'string',
            description: 'view=source 时必填；来自 list_news_sources',
          },
          date: {
            type: 'string',
            description: 'view=timeline 时可选，本地日历日 YYYY-MM-DD',
          },
          limit: { type: 'number', description: '每页条数 1-50，默认 20' },
          cursor: { type: 'string', description: '上一页返回的 next_cursor，首页省略' },
        }),
        handler: (a: Record<string, unknown>) => d('news_articles_list', a),
      },
      {
        name: 'get_news_article', category: '资讯中心',
        description: '按本地文章 id 获取资讯正文（HTML 已剥离并压缩空白以节约 token）',
        parameters: S({
          article_id: { type: 'string', description: '文章 id，来自 list_news_articles' },
        }, ['article_id']),
        handler: (a: Record<string, unknown>) => d('news_article_detail', { article_id: a.article_id }),
      },
      {
        name: 'get_latest_evaluation', category: '通用',
        description: '读取本地最近一次的因子评估快照',
        parameters: S({ code: { type: 'string', description: '股票代码' } }, ['code']),
        handler: (a: Record<string, unknown>) => d('latest_evaluation', normalizeInstrumentHubParams({ code: a.code, market: 'CN' })),
      },
      {
        name: 'get_portfolio_holdings', category: '组合管理',
        description: '读取当前持仓明细（股数、成本、市值、浮盈）',
        parameters: S({}),
        handler: () => d('portfolio_holdings', {}),
      },
      {
        name: 'portfolio_trades', category: '组合管理',
        description: '查询交易账本记录（买卖流水）',
        parameters: S({ code: { type: 'string', description: '可选，按代码过滤' } }),
        handler: (a: Record<string, unknown>) => d('portfolio_trades', { code: a.code ?? '' }),
      },
      {
        name: 'portfolio_summary', category: '组合管理',
        description: '持仓盈亏与账本汇总（含持仓明细与交易统计）',
        parameters: S({}),
        handler: () => d('portfolio_summary', {}),
      },
    ]
    const unifiedTools = buildUnifiedInstrumentTools(d, S)
    const searchIdx = tools.findIndex(t => t.name === 'search_local_instruments')
    const merged = searchIdx >= 0
      ? [...tools.slice(0, searchIdx + 1), ...unifiedTools, ...tools.slice(searchIdx + 1)]
      : [...tools, ...unifiedTools]
    return merged.map(t => ({ ...t, meta: TOOL_META[t.name] }))
  }

  private buildBasicTools(): ToolDef[] {
    const ctx = this.appContext
    const d = (feature: string, params: Record<string, unknown> = {}) =>
      this.dispatch(feature, params)
    const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
      ({ type: 'object', properties, required })

    return [
      {
        name: 'get_current_time', category: '基础',
        description: '获取当前时间（ISO、本地时区、Unix 毫秒、星期）',
        parameters: S({}),
        handler: async () => getCurrentTime(),
      },
      {
        name: 'get_system_info', category: '基础',
        description: '获取运行环境信息（平台、Node 版本、桌面/服务端模式、时区、内存）',
        parameters: S({}),
        handler: async () => getSystemInfo(),
      },
      {
        name: 'get_app_settings', category: '基础',
        description: '读取应用设置（LLM 提供商列表、默认模型/评分卡/TopN；不含 API Key）',
        parameters: S({}),
        handler: async () => ctx.getAppSettings(),
      },
      {
        name: 'get_project_info', category: '基础',
        description: '读取项目与数据层路径（版本、运行时、数据根目录、会话/关注列表/组合路径）',
        parameters: S({}),
        handler: async () => {
          if (ctx.getProjectInfo) return ctx.getProjectInfo()
          return {
            app: 'Opptrix',
            version: '0.6.0',
            runtime: process.env.OPPTRIX_DESKTOP === '1' ? 'desktop' : 'node',
            project_root: resolveProjectRoot(),
            paths: getDataLayerPaths(),
          }
        },
      },
      {
        name: 'get_integration_status', category: '基础',
        description: '读取外部集成配置状态（Tushare Token 等，不含密钥）',
        parameters: S({}),
        handler: async () => {
          const tushare = await d('tushare_config', {})
          return { tushare: tushare.data ?? tushare }
        },
      },
    ].map(t => ({ ...t, meta: TOOL_META[t.name] }))
  }
}
