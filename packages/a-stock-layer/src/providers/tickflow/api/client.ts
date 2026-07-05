import { loadTickflowConfig, TICKFLOW_DEFAULT_BASE_URL } from '../config.js'

/**
 * TickFlow 地区标识 — 指定标的所属市场地区。
 * - CN: 中国大陆（沪深北）
 * - US: 美国（NYSE/NASDAQ）
 * - HK: 香港
 */
export type TickflowRegion = 'CN' | 'US' | 'HK'

/**
 * TickFlow K 线周期 — 支持从 1 分钟到年度的多级别周期。
 * - 1m/5m/10m/15m/30m/60m: 分钟级（盘中分时）
 * - 1d: 日线
 * - 1w: 周线
 * - 1M: 月线
 * - 1Q: 季线
 * - 1Y: 年线
 */
export type TickflowPeriod = '1m' | '5m' | '10m' | '15m' | '30m' | '60m' | '1d' | '1w' | '1M' | '1Q' | '1Y'

/**
 * TickFlow 复权类型 — K 线价格是否进行除权除息调整。
 * - forward: 前复权（以最新价格为基准向历史调整）
 * - backward: 后复权（以上市首日价格为基准向未来调整）
 * - forward_additive: 前复权加法模式
 * - backward_additive: 后复权加法模式
 * - none: 不复权（原始价格）
 */
export type TickflowAdjustType = 'forward' | 'backward' | 'forward_additive' | 'backward_additive' | 'none'

/**
 * TickFlow 标的类型 — 区分不同金融产品类别。
 * - stock: 股票
 * - etf: 交易型开放式基金
 * - index: 指数
 * - bond: 债券
 * - fund: 基金（非 ETF）
 * - options: 期权
 * - other: 其他
 */
export type TickflowInstrumentType = 'stock' | 'etf' | 'index' | 'bond' | 'fund' | 'options' | 'other'

type QueryValue = string | number | boolean | null | undefined

/**
 * TickFlow 标的信息 — 单个金融标的的基础元数据。
 *
 * 用途：标的搜索结果、标的类型识别、交易所归属判断。
 * 数据源：TickFlow /v1/instruments 接口
 */
export interface TickflowInstrument {
  /** 完整交易代码（如 "600519.SH"、"AAPL"） */
  symbol: string
  /** 交易所标识（如 "SSE"、"NYSE"、"HKEX"） */
  exchange: string
  /** 纯数字/字母代码（如 "600519"、"AAPL"） */
  code: string
  /** 地区标识（"CN"/"US"/"HK"） */
  region: string
  /** 标的名称（如"贵州茅台"、"Apple Inc."） */
  name?: string | null
  /** 标的子类型（如 "SH_A" 上海A股、"SZ_A" 深圳A股） */
  symbol_type?: string | null
  /** 标的大类（"stock"/"etf"/"index" 等） */
  type?: string | null
  /** 上市日期（Unix 时间戳秒） */
  list_date?: number | null
  /** 扩展字段（不同市场特有属性） */
  ext?: Record<string, unknown> | null
}

/**
 * TickFlow 盘口深度 — 买卖五档价格与挂单量。
 *
 * 用途：盘口分析、买卖压力判断、做市商行为观察。
 * 数据源：TickFlow /v1/depth 接口
 */
export interface TickflowMarketDepth {
  /** 完整交易代码 */
  symbol: string
  /** 地区标识 */
  region: TickflowRegion
  /** 快照时间戳（Unix 毫秒） */
  timestamp: number
  /** 买一到买五价格数组（升序排列，[bid1, bid2, ..., bid5]） */
  bid_prices: number[]
  /** 买一到买五挂单量数组 */
  bid_volumes: number[]
  /** 卖一到卖五价格数组（升序排列，[ask1, ask2, ..., ask5]） */
  ask_prices: number[]
  /** 卖一到卖五挂单量数组 */
  ask_volumes: number[]
}

/**
 * TickFlow 利润表记录 — 单期合并利润表核心科目。
 *
 * 用途：盈利能力分析、EPS 计算、研发投入评估。
 * 数据源：TickFlow /v1/financials/income 接口
 */
export interface TickflowIncomeRecord {
  /** 报告期截止日（如 "2024-12-31"、"2024-09-30"） */
  period_end: string
  /** 营业收入（元） */
  revenue?: number | null
  /** 营业利润（元） */
  operating_profit?: number | null
  /** 利润总额（元） */
  total_profit?: number | null
  /** 净利润（元） */
  net_income?: number | null
  /** 归属于母公司股东的净利润（元） */
  net_income_attributable?: number | null
  /** 扣除非经常性损益后的净利润（元） */
  net_income_deducted?: number | null
  /** 基本每股收益（元/股） */
  basic_eps?: number | null
  /** 稀释每股收益（元/股） */
  diluted_eps?: number | null
  /** 研发费用（元） */
  rd_expense?: number | null
}

/**
 * TickFlow 资产负债表记录 — 单期合并资产负债表核心科目。
 *
 * 用途：偿债能力分析、资产结构评估、资本充足率计算。
 * 数据源：TickFlow /v1/financials/balance-sheet 接口
 */
export interface TickflowBalanceSheetRecord {
  /** 报告期截止日（如 "2024-12-31"） */
  period_end: string
  /** 总资产（元） */
  total_assets?: number | null
  /** 总负债（元） */
  total_liabilities?: number | null
  /** 股东权益合计（元） = total_assets - total_liabilities */
  total_equity?: number | null
  /** 货币资金（元） */
  cash_and_equivalents?: number | null
  /** 应收账款（元） */
  accounts_receivable?: number | null
  /** 存货（元） */
  inventory?: number | null
  /** 固定资产（元） */
  fixed_assets?: number | null
  /** 短期借款（元） */
  short_term_borrowing?: number | null
  /** 长期借款（元） */
  long_term_borrowing?: number | null
}

/**
 * TickFlow 现金流量表记录 — 单期合并现金流量表核心科目。
 *
 * 用途：现金流质量分析、自由现金流计算、资本开支评估。
 * 数据源：TickFlow /v1/financials/cash-flow 接口
 */
export interface TickflowCashFlowRecord {
  /** 报告期截止日（如 "2024-12-31"） */
  period_end: string
  /** 经营活动产生的现金流量净额（元） */
  net_operating_cash_flow?: number | null
  /** 投资活动产生的现金流量净额（元） */
  net_investing_cash_flow?: number | null
  /** 筹资活动产生的现金流量净额（元） */
  net_financing_cash_flow?: number | null
  /** 现金及现金等价物净增加额（元） */
  net_cash_change?: number | null
  /** 购建固定资产、无形资产等支付的现金（元） */
  capex?: number | null
}

/**
 * TickFlow 财务指标 — 基于三大报表计算的衍生财务比率。
 *
 * 用途：盈利能力、成长性、财务健康度综合评估。
 * 数据源：TickFlow /v1/financials/metrics 接口
 */
export interface TickflowMetricsRecord {
  /** 报告期截止日（如 "2024-12-31"） */
  period_end: string
  /** 基本每股收益（元/股） */
  eps_basic?: number | null
  /** 营收同比增长率（%） */
  revenue_yoy?: number | null
  /** 净利润同比增长率（%） */
  net_income_yoy?: number | null
  /** 净资产收益率 ROE（%） */
  roe?: number | null
  /** 毛利率（%） */
  gross_margin?: number | null
  /** 净利率（%） */
  net_margin?: number | null
  /** 资产负债率（%）= total_liabilities / total_assets × 100 */
  debt_to_asset_ratio?: number | null
  /** 经营现金流每股收益（元/股） */
  ocfps?: number | null
  /** 每股净资产（元/股） */
  bps?: number | null
}

/**
 * TickFlow 紧凑型 K 线数据 — 列式存储的 OHLCV 序列。
 *
 * 用途：高效传输和存储批量 K 线数据，减少序列化开销。
 * 数据源：TickFlow /v1/klines 接口
 */
export interface CompactKlineData {
  /** 时间戳数组（Unix 毫秒） */
  timestamp: number[]
  /** 开盘价数组 */
  open: number[]
  /** 最高价数组 */
  high: number[]
  /** 最低价数组 */
  low: number[]
  /** 收盘价数组 */
  close: number[]
  /** 成交量数组 */
  volume: number[]
  /** 成交额数组（可选） */
  amount?: number[]
  /** 前收盘价数组（可选，用于计算涨跌幅） */
  prev_close?: number[]
  /** 持仓量数组（仅期货/期权） */
  open_interest?: number[]
  /** 结算价数组（仅期货） */
  settlement_price?: number[]
}

/**
 * TickFlow 行情查询参数 — GET /v1/quotes 的 query string 格式。
 *
 * 用途：查询单个或多个标的的最新行情。
 */
export interface TickflowQuotesQuery {
  /** 逗号分隔的标的代码（如 "600519.SH,AAPL"） */
  symbols?: string
  /** 逗号分隔的 Universe ID（按预设标的组查询） */
  universes?: string
}

/**
 * TickFlow 行情批量请求 — POST /v1/quotes 的 body 格式。
 *
 * 用途：大批量标的行情查询（超过 URL 长度限制时使用 POST）。
 */
export interface TickflowQuotesRequest {
  /** 标的代码数组 */
  symbols?: string[] | null
  /** Universe ID 数组 */
  universes?: string[] | null
}

/**
 * TickFlow K 线查询参数 — 单标的历史 K 线。
 *
 * 用途：获取指定标的的日/周/月/分钟 K 线序列。
 */
export interface TickflowKlinesQuery {
  /** 完整交易代码（如 "600519.SH"） */
  symbol: string
  /** K 线周期，默认 "1d" */
  period?: TickflowPeriod
  /** 返回 K 线根数，默认 120 */
  count?: number
  /** 起始时间戳（Unix 毫秒），与 count 二选一 */
  start_time?: number | null
  /** 结束时间戳（Unix 毫秒） */
  end_time?: number | null
  /** 复权类型，默认 "none" */
  adjust?: TickflowAdjustType
}

/**
 * TickFlow K 线批量查询 — 多标的同周期 K 线。
 *
 * 用途：批量获取多个标的的 K 线数据，减少 API 调用次数。
 */
export interface TickflowKlinesBatchQuery {
  /** 逗号分隔的标的代码（如 "600519.SH,000858.SZ"） */
  symbols: string
  /** K 线周期 */
  period?: TickflowPeriod
  /** 返回 K 线根数 */
  count?: number
  /** 起始时间戳（Unix 毫秒） */
  start_time?: number | null
  /** 结束时间戳（Unix 毫秒） */
  end_time?: number | null
  /** 复权类型 */
  adjust?: TickflowAdjustType
}

/**
 * TickFlow 盘中分时查询 — 单标的分时数据。
 *
 * 用途：日内分时走势、盘中量价分析。
 */
export interface TickflowIntradayQuery {
  /** 完整交易代码 */
  symbol: string
  /** 分时周期（如 "1m"、"5m"） */
  period?: TickflowPeriod
  /** 返回条数 */
  count?: number
}

/**
 * TickFlow 盘中分时批量查询 — 多标的分时数据。
 */
export interface TickflowIntradayBatchQuery {
  /** 逗号分隔的标的代码 */
  symbols: string
  /** 分时周期 */
  period?: TickflowPeriod
  /** 返回条数 */
  count?: number
}

/**
 * TickFlow 复权因子查询 — 获取标的的除权除息因子。
 *
 * 用途：K 线复权计算、分红回溯分析。
 */
export interface TickflowExFactorsQuery {
  /** 逗号分隔的标的代码 */
  symbols: string
  /** 起始时间戳（Unix 毫秒） */
  start_time?: number | null
  /** 结束时间戳（Unix 毫秒） */
  end_time?: number | null
}

/**
 * TickFlow 标的信息查询 — 获取标的基础元数据。
 */
export interface TickflowInstrumentsQuery {
  /** 逗号分隔的标的代码 */
  symbols: string
}

/**
 * TickFlow 标的信息批量请求 — POST 格式。
 */
export interface TickflowInstrumentsRequest {
  /** 标的代码数组 */
  symbols: string[]
}

/**
 * TickFlow 财务数据查询 — 支持时间范围与仅最新一期。
 *
 * 用途：获取标的的利润表/资产负债表/现金流量表/财务指标数据。
 */
export interface TickflowFinancialsQuery {
  /** 逗号分隔的标的代码 */
  symbols: string
  /** 起始报告期（如 "2023-01-01"） */
  start_date?: string
  /** 结束报告期（如 "2024-12-31"） */
  end_date?: string
  /** 仅返回最新一期数据，默认 false */
  latest?: boolean
}

/**
 * TickFlow Universe 批量查询请求 — 按 Universe ID 获取标的列表。
 */
export interface TickflowUniverseBatchRequest {
  /** Universe ID 数组 */
  ids: string[]
}

export class TickflowClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = TICKFLOW_DEFAULT_BASE_URL,
  ) {}

  static fromConfig(cfg = loadTickflowConfig()): TickflowClient | null {
    if (!cfg.apiKey) return null
    return new TickflowClient(cfg.apiKey, cfg.baseUrl)
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      'x-api-key': this.apiKey,
    }
  }

  private url(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path}`
  }

  private queryParams(query: Record<string, QueryValue> = {}): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue
      out[key] = String(value)
    }
    return out
  }

  private asQuery(query: object): Record<string, QueryValue> {
    return query as Record<string, QueryValue>
  }

  private async parseErrorBody(resp: Response): Promise<string | undefined> {
    try {
      const json = await resp.json() as { message?: string; code?: string }
      if (json.message) return json.code ? `${json.message} (${json.code})` : json.message
    } catch {
      // ignore
    }
    return undefined
  }

  private async handleResponse(resp: Response): Promise<Record<string, unknown>> {
    if (resp.status === 401) {
      const detail = await this.parseErrorBody(resp)
      throw new Error(detail ? `TickFlow 认证失败：${detail}` : 'TickFlow API Key 无效或未授权')
    }
    if (resp.status === 429) {
      const detail = await this.parseErrorBody(resp)
      throw new Error(detail ? `TickFlow 请求过于频繁：${detail}` : 'TickFlow 请求过于频繁，请稍后再试')
    }
    if (!resp.ok) {
      const detail = await this.parseErrorBody(resp)
      throw new Error(detail ? `TickFlow HTTP ${resp.status}：${detail}` : `HTTP ${resp.status}`)
    }
    const ct = resp.headers.get('content-type') ?? ''
    if (ct.includes('json')) return resp.json() as Promise<Record<string, unknown>>
    const text = await resp.text()
    if (text.trimStart().startsWith('<')) throw new Error('TickFlow 返回 HTML 响应')
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('TickFlow 响应不是有效 JSON')
    }
  }

  async get(path: string, query: Record<string, QueryValue> = {}): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams(this.queryParams(query))
    const suffix = qs.toString()
    const url = suffix ? `${this.url(path)}?${suffix}` : this.url(path)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      })
      return this.handleResponse(resp)
    } finally {
      clearTimeout(timer)
    }
  }

  async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const resp = await fetch(this.url(path), {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      return this.handleResponse(resp)
    } finally {
      clearTimeout(timer)
    }
  }

  // —— Quotes ——

  getQuotes(query: TickflowQuotesQuery = {}) {
    return this.get('/v1/quotes', this.asQuery(query))
  }

  postQuotes(body: TickflowQuotesRequest) {
    return this.post('/v1/quotes', body)
  }

  /** @deprecated use getQuotes */
  quotesGet(symbol: string) {
    return this.getQuotes({ symbols: symbol })
  }

  /** @deprecated use postQuotes */
  quotesPost(symbols: string[]) {
    return this.postQuotes({ symbols })
  }

  // —— Depth ——

  getDepth(symbol: string) {
    return this.get('/v1/depth', { symbol })
  }

  getDepthBatch(symbols: string) {
    return this.get('/v1/depth/batch', { symbols })
  }

  // —— Klines ——

  getKlines(query: TickflowKlinesQuery) {
    return this.get('/v1/klines', this.asQuery(query))
  }

  getKlinesBatch(query: TickflowKlinesBatchQuery) {
    return this.get('/v1/klines/batch', this.asQuery(query))
  }

  getKlinesIntraday(query: TickflowIntradayQuery) {
    return this.get('/v1/klines/intraday', this.asQuery(query))
  }

  getKlinesIntradayBatch(query: TickflowIntradayBatchQuery) {
    return this.get('/v1/klines/intraday/batch', this.asQuery(query))
  }

  getKlinesExFactors(query: TickflowExFactorsQuery) {
    return this.get('/v1/klines/ex-factors', this.asQuery(query))
  }

  /** @deprecated use getKlines */
  klines(query: TickflowKlinesQuery) {
    return this.getKlines(query)
  }

  // —— Instruments ——

  getInstruments(query: TickflowInstrumentsQuery) {
    return this.get('/v1/instruments', this.asQuery(query))
  }

  postInstruments(body: TickflowInstrumentsRequest) {
    return this.post('/v1/instruments', body)
  }

  // —— Exchanges ——

  getExchanges() {
    return this.get('/v1/exchanges')
  }

  getExchangeInstruments(exchange: string, type?: TickflowInstrumentType) {
    return this.get(`/v1/exchanges/${encodeURIComponent(exchange)}/instruments`, type ? { type } : {})
  }

  // —— Universes ——

  getUniverses() {
    return this.get('/v1/universes')
  }

  getUniverse(id: string) {
    return this.get(`/v1/universes/${encodeURIComponent(id)}`)
  }

  postUniversesBatch(body: TickflowUniverseBatchRequest) {
    return this.post('/v1/universes/batch', body)
  }

  // —— Financials ——

  getFinancialsIncome(query: TickflowFinancialsQuery) {
    return this.get('/v1/financials/income', this.asQuery(query))
  }

  getFinancialsBalanceSheet(query: TickflowFinancialsQuery) {
    return this.get('/v1/financials/balance-sheet', this.asQuery(query))
  }

  getFinancialsCashFlow(query: TickflowFinancialsQuery) {
    return this.get('/v1/financials/cash-flow', this.asQuery(query))
  }

  getFinancialsMetrics(query: TickflowFinancialsQuery) {
    return this.get('/v1/financials/metrics', this.asQuery(query))
  }

  getFinancialsShares(query: TickflowFinancialsQuery) {
    return this.get('/v1/financials/shares', this.asQuery(query))
  }
}

export async function testTickflowConnection(
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API Key 未配置' }
  const client = new TickflowClient(key, TICKFLOW_DEFAULT_BASE_URL)
  try {
    const json = await client.getExchanges()
    const data = json.data
    if (Array.isArray(data) && data.length > 0) {
      return { ok: true, message: `TickFlow 连接成功 · ${data.length} 个交易所` }
    }
    if (Array.isArray(data)) return { ok: true, message: 'TickFlow 连接成功' }
    return { ok: false, message: '响应格式异常' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
