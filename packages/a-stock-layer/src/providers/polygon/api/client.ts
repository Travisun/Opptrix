import { httpGet } from '../../../utils/http.js'
import { loadPolygonConfig } from '../config.js'

const BASE = 'https://api.polygon.io'

export class PolygonClient {
  constructor(private apiKey: string) {}

  static fromConfig(): PolygonClient | null {
    const cfg = loadPolygonConfig()
    if (!cfg.apiKey) return null
    return new PolygonClient(cfg.apiKey)
  }

  private params(extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, apiKey: this.apiKey }
  }

  async get(path: string, query: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`
    return httpGet(url, this.params(query), 20000, { Accept: 'application/json' })
  }

  async tickerSnapshot(symbol: string) {
    return this.get(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`)
  }

  async aggregates(symbol: string, from: string, to: string, limit = '500') {
    return this.get(
      `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`,
      { adjusted: 'true', sort: 'asc', limit },
    )
  }

  async tickerDetails(symbol: string) {
    return this.get(`/v3/reference/tickers/${symbol}`)
  }

  async listTickers(cursor?: string, limit = '1000') {
    const q: Record<string, string> = {
      market: 'stocks',
      active: 'true',
      limit,
      order: 'asc',
      sort: 'ticker',
    }
    if (cursor) q.cursor = cursor
    return this.get('/v3/reference/tickers', q)
  }

  async financials(symbol: string, limit = '8', timeframe?: 'annual' | 'quarterly') {
    const q: Record<string, string> = {
      ticker: symbol,
      limit,
      sort: 'filing_date',
      order: 'desc',
    }
    if (timeframe === 'quarterly') q.timeframe = 'quarterly'
    else if (timeframe === 'annual') q.timeframe = 'annual'
    return this.get('/vX/reference/financials', q)
  }
}

export async function testPolygonConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API Key 未配置' }
  try {
    const json = await httpGet(
      `${BASE}/v3/reference/tickers/AAPL`,
      { apiKey: key },
      15000,
      { Accept: 'application/json' },
    )
    const results = json.results as Record<string, unknown> | undefined
    if (results?.ticker) return { ok: true, message: 'Polygon 连接成功' }
    return { ok: false, message: '响应格式异常' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
