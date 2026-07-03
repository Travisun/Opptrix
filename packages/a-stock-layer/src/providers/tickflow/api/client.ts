import { httpGet } from '../../../utils/http.js'
import { loadTickflowConfig, TICKFLOW_DEFAULT_BASE_URL } from '../config.js'

export type TickflowRegion = 'CN' | 'US' | 'HK'
export type TickflowPeriod = '1m' | '5m' | '10m' | '15m' | '30m' | '60m' | '1d' | '1w' | '1M' | '1Q' | '1Y'
export type TickflowAdjustType = 'forward' | 'backward' | 'forward_additive' | 'backward_additive' | 'none'
export type TickflowInstrumentType = 'stock' | 'etf' | 'index' | 'bond' | 'fund' | 'options' | 'other'

type QueryValue = string | number | boolean | null | undefined

export interface TickflowInstrument {
  symbol: string
  exchange: string
  code: string
  region: string
  name?: string | null
  symbol_type?: string | null
  type?: string | null
  list_date?: number | null
  ext?: Record<string, unknown> | null
}

export interface TickflowMarketDepth {
  symbol: string
  region: TickflowRegion
  timestamp: number
  bid_prices: number[]
  bid_volumes: number[]
  ask_prices: number[]
  ask_volumes: number[]
}

export interface TickflowIncomeRecord {
  period_end: string
  revenue?: number | null
  operating_profit?: number | null
  total_profit?: number | null
  net_income?: number | null
  net_income_attributable?: number | null
  net_income_deducted?: number | null
  basic_eps?: number | null
  diluted_eps?: number | null
  rd_expense?: number | null
}

export interface TickflowBalanceSheetRecord {
  period_end: string
  total_assets?: number | null
  total_liabilities?: number | null
  total_equity?: number | null
  cash_and_equivalents?: number | null
  accounts_receivable?: number | null
  inventory?: number | null
  fixed_assets?: number | null
  short_term_borrowing?: number | null
  long_term_borrowing?: number | null
}

export interface TickflowCashFlowRecord {
  period_end: string
  net_operating_cash_flow?: number | null
  net_investing_cash_flow?: number | null
  net_financing_cash_flow?: number | null
  net_cash_change?: number | null
  capex?: number | null
}

export interface TickflowMetricsRecord {
  period_end: string
  eps_basic?: number | null
  revenue_yoy?: number | null
  net_income_yoy?: number | null
  roe?: number | null
  gross_margin?: number | null
  net_margin?: number | null
  debt_to_asset_ratio?: number | null
  ocfps?: number | null
  bps?: number | null
}

export interface CompactKlineData {
  timestamp: number[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
  amount?: number[]
  prev_close?: number[]
  open_interest?: number[]
  settlement_price?: number[]
}

export interface TickflowQuotesQuery {
  symbols?: string
  universes?: string
}

export interface TickflowQuotesRequest {
  symbols?: string[] | null
  universes?: string[] | null
}

export interface TickflowKlinesQuery {
  symbol: string
  period?: TickflowPeriod
  count?: number
  start_time?: number | null
  end_time?: number | null
  adjust?: TickflowAdjustType
}

export interface TickflowKlinesBatchQuery {
  symbols: string
  period?: TickflowPeriod
  count?: number
  start_time?: number | null
  end_time?: number | null
  adjust?: TickflowAdjustType
}

export interface TickflowIntradayQuery {
  symbol: string
  period?: TickflowPeriod
  count?: number
}

export interface TickflowIntradayBatchQuery {
  symbols: string
  period?: TickflowPeriod
  count?: number
}

export interface TickflowExFactorsQuery {
  symbols: string
  start_time?: number | null
  end_time?: number | null
}

export interface TickflowInstrumentsQuery {
  symbols: string
}

export interface TickflowInstrumentsRequest {
  symbols: string[]
}

export interface TickflowFinancialsQuery {
  symbols: string
  start_date?: string
  end_date?: string
  latest?: boolean
}

export interface TickflowUniverseBatchRequest {
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
    const url = this.url(path)
    try {
      return await httpGet(url, this.queryParams(query), 20000, this.headers())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('HTTP 401')) throw new Error('TickFlow API Key 无效或未授权')
      if (msg.includes('HTTP 429')) throw new Error('TickFlow 请求过于频繁，请稍后再试')
      throw e
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
  baseUrl?: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API Key 未配置' }
  const client = new TickflowClient(key, (baseUrl?.trim() || TICKFLOW_DEFAULT_BASE_URL).replace(/\/$/, ''))
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
