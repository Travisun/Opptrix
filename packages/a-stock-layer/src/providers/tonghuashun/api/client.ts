import { tonghuashunClient } from './http-client.js'
import { FUYAO_BASE_URL, loadTonghuashunConfig } from '../config.js'

export class FuyaoApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly requestId?: string | null,
  ) {
    super(`同花顺 API code=${code}: ${message}${requestId ? ` (${requestId})` : ''}`)
    this.name = 'FuyaoApiError'
  }
}

type QueryValue = string | number | boolean | null | undefined

const RETRY_CODES = new Set([4001, 5001, 5002, 5003])
const TEN_YEARS_MS = Math.floor(10 * 365.25 * 86400 * 1000)

function cleanParams(params: Record<string, QueryValue>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    out[k] = String(v)
  }
  return out
}

export class FuyaoClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = FUYAO_BASE_URL,
  ) {}

  static fromConfig(): FuyaoClient | null {
    const cfg = loadTonghuashunConfig()
    if (!cfg.apiKey.trim()) return null
    return new FuyaoClient(cfg.apiKey.trim(), cfg.baseUrl)
  }

  private headers(): Record<string, string> {
    return { 'X-api-key': this.apiKey, Referer: 'https://fuyao.aicubes.cn/' }
  }

  async get<T = Record<string, unknown>>(
    path: string,
    params: Record<string, QueryValue> = {},
  ): Promise<T> {
    const qs = new URLSearchParams(cleanParams(params))
    const suffix = qs.toString()
    const base = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const url = suffix ? `${base}?${suffix}` : base
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await tonghuashunClient.fetch(url, {
          method: 'GET',
          headers: this.headers(),
          timeoutMs: 30000,
        })
        const payload = await resp.json() as {
          code?: number
          message?: string
          request_id?: string
          data?: T
        }
        const code = payload.code ?? -1
        if (code === 0) return (payload.data ?? {}) as T
        if (RETRY_CODES.has(code) && attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (2 ** attempt)))
          continue
        }
        throw new FuyaoApiError(code, String(payload.message ?? 'unknown'), payload.request_id)
      } catch (e) {
        lastErr = e
        if (e instanceof FuyaoApiError) throw e
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (2 ** attempt)))
          continue
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  tickersSearch(q: string, limit = 5) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/meta/tickers/search',
      { q, limit, asset_type: 'a-share' },
    )
  }

  tickersList(limit = 1000, offset = 0, assetType: 'a-share' | 'a-share-index' = 'a-share') {
    return this.get<{ item?: Record<string, unknown>[]; total?: number }>(
      '/api/meta/tickers/list',
      { exchange: 'SH,SZ,BJ', asset_type: assetType, limit, offset },
    )
  }

  async tickersListAll(assetType: 'a-share' | 'a-share-index' = 'a-share'): Promise<Record<string, unknown>[]> {
    const pageSize = 1000
    const all: Record<string, unknown>[] = []
    let offset = 0
    while (true) {
      const data = await this.tickersList(pageSize, offset, assetType)
      const items = data.item ?? []
      all.push(...items)
      if (items.length < pageSize) break
      offset += pageSize
    }
    return all
  }

  pricesSnapshot(thscodes: string | string[]) {
    const joined = Array.isArray(thscodes) ? thscodes.join(',') : thscodes
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/prices/snapshot',
      { thscodes: joined },
    )
  }

  async pricesHistorical(
    thscode: string,
    startMs: number,
    endMs: number,
    adjust: 'none' | 'forward' | 'backward' = 'forward',
  ): Promise<Record<string, unknown>[]> {
    const slices: Array<[number, number]> = []
    let cur = startMs
    while (cur < endMs) {
      const end = Math.min(cur + TEN_YEARS_MS, endMs)
      slices.push([cur, end])
      cur = end + 1
    }
    const seen = new Set<number>()
    const bars: Record<string, unknown>[] = []
    for (const [start, end] of slices) {
      const data = await this.get<{ item?: Record<string, unknown>[] }>(
        '/api/a-share/prices/historical',
        { thscode, interval: '1d', start, end, adjust },
      )
      for (const bar of data.item ?? []) {
        const d = Number(bar.date_ms)
        if (seen.has(d)) continue
        seen.add(d)
        bars.push(bar)
      }
    }
    bars.sort((a, b) => Number(a.date_ms) - Number(b.date_ms))
    return bars
  }

  indexPricesSnapshot(thscodes: string | string[]) {
    const joined = Array.isArray(thscodes) ? thscodes.join(',') : thscodes
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share-index/prices/snapshot',
      { thscodes: joined },
    )
  }

  indexPricesHistorical(thscode: string, startMs: number, endMs: number, interval = '1d') {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share-index/prices/historical',
      { thscode, interval, start: startMs, end: endMs },
    )
  }

  financialsIncome(
    thscode: string,
    period: 'annual' | 'quarterly',
    limit = 20,
  ) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/financials/income-statements',
      { thscode, period, limit },
    )
  }

  /**
   * 资产负债表多期序列
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/balance-sheets
   */
  financialsBalanceSheets(
    thscode: string,
    period: 'annual' | 'quarterly' = 'quarterly',
    limit = 20,
  ) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/financials/balance-sheets',
      { thscode, period, limit },
    )
  }

  /**
   * 现金流量表多期序列
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/cash-flow-statements
   */
  financialsCashFlowStatements(
    thscode: string,
    period: 'annual' | 'quarterly' = 'quarterly',
    limit = 20,
  ) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/financials/cash-flow-statements',
      { thscode, period, limit },
    )
  }

  /**
   * 财务指标（成长/盈利/偿债/营运/现金流）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/indicators
   * @param report 报告期，如 2024Q3 / 2024
   */
  financialsIndicators(thscode: string, report: string) {
    return this.get<{ abilities?: Record<string, unknown> } & Record<string, unknown>>(
      '/api/a-share/financials/indicators',
      { thscode, report },
    )
  }

  /**
   * 同花顺指数目录（按 tag）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share-index/catalog/ths-index-list
   * @param tag cn_concept | region | tszs | industry
   */
  thsIndexList(tag: 'cn_concept' | 'region' | 'tszs' | 'industry' | string = 'cn_concept') {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share-index/catalog/ths-index-list',
      { tag },
    )
  }

  /**
   * 指数/板块成分股
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share-index/constituents/ths-stock-list
   */
  thsIndexConstituents(thscode: string) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share-index/constituents/ths-stock-list',
      { thscode },
    )
  }

  adjustmentFactors(thscode: string, from?: string, to?: string) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/corporate-actions/adjustment-factors',
      { thscode, from, to },
    )
  }

  tradingDays() {
    return this.get<{ item?: Array<{ date_ms?: number; date?: string }> }>(
      '/api/a-share/calendar/trading-days',
      {},
    )
  }

  dragonTigerList(date?: string, boardType: 'all' | 'org' | 'hot_money' = 'all') {
    return this.get<Record<string, unknown>>(
      '/api/a-share/special-data/dragon-tiger-list',
      { board_type: boardType, date },
    )
  }

  limitUpPool(dateMs?: number, page = 1, size = 100) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/limit-up-pool',
      { date_ms: dateMs, page, size },
    )
  }

  /**
   * 连板天梯（近 30 交易日）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/limit-up-ladder
   */
  limitUpLadder() {
    return this.get<{ item?: Record<string, unknown>[] } & Record<string, unknown>>(
      '/api/a-share/special-data/limit-up-ladder',
      {},
    )
  }

  hotStockList(period: 'day' | 'hour' = 'day') {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/hot-stock-list',
      { period },
    )
  }

  /**
   * 热度飙升榜 Top30
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/skyrocket-list
   */
  skyrocketList(period: 'day' | 'hour' = 'day') {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/skyrocket-list',
      { period },
    )
  }

  /**
   * 历史热股排行（按自然日）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/hot-stock-list-history
   */
  hotStockListHistory(date: string) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/hot-stock-list-history',
      { date },
    )
  }

  /**
   * 个股热榜排名走势
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/hot-stock-rank-trend
   */
  hotStockRankTrend(thscode: string, start?: string, end?: string) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/hot-stock-rank-trend',
      { thscode, start, end },
    )
  }

  /**
   * 当日个股异动原因列表
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/anomaly-analysis-list
   */
  anomalyAnalysisList(tag?: string) {
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/anomaly-analysis-list',
      { tag },
    )
  }

  /**
   * 按股票批量查当日异动原因
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/anomaly-analysis-stock
   */
  anomalyAnalysisStock(thscodes: string | string[]) {
    const joined = Array.isArray(thscodes) ? thscodes.join(',') : thscodes
    return this.get<{ item?: Record<string, unknown>[] }>(
      '/api/a-share/special-data/anomaly-analysis-stock',
      { thscodes: joined },
    )
  }
}

export async function testTonghuashunConnection(
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API Key 未配置' }
  try {
    const client = new FuyaoClient(key)
    const data = await client.tickersSearch('600519', 1)
    const hit = data.item?.[0]
    if (hit?.thscode) {
      return { ok: true, message: `同花顺连接成功 · ${String(hit.name ?? hit.thscode)}` }
    }
    return { ok: false, message: '响应格式异常' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
