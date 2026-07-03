import { httpGet } from '../../../utils/http.js'
import { loadFmpConfig } from '../config.js'

const BASE = 'https://financialmodelingprep.com/api/v3'

export class FmpClient {
  constructor(private apiKey: string) {}

  static fromConfig(): FmpClient | null {
    const cfg = loadFmpConfig()
    if (!cfg.apiKey) return null
    return new FmpClient(cfg.apiKey)
  }

  private params(extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, apikey: this.apiKey }
  }

  async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`
    return httpGet(url, this.params(query), 20000, { Accept: 'application/json' })
  }

  async quote(symbol: string) {
    return this.get(`/quote/${symbol}`)
  }

  async profile(symbol: string) {
    return this.get(`/profile/${symbol}`)
  }

  async historicalDaily(symbol: string, from?: string, to?: string) {
    const q: Record<string, string> = {}
    if (from) q.from = from
    if (to) q.to = to
    return this.get(`/historical-price-full/${symbol}`, q)
  }

  async search(query: string) {
    return this.get('/search', { query, limit: '20' })
  }

  async incomeStatement(symbol: string, limit = '8', quarterly = false) {
    const path = quarterly
      ? `/income-statement/${symbol}`
      : `/income-statement/${symbol}`
    const q: Record<string, string> = { limit: String(limit) }
    if (quarterly) q.period = 'quarter'
    return this.get(path, q)
  }
}

export async function testFmpConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API Key 未配置' }
  try {
    const json = await httpGet(
      `${BASE}/profile/AAPL`,
      { apikey: key },
      15000,
      { Accept: 'application/json' },
    )
    const rows = Array.isArray(json) ? json : []
    const row = rows[0] as Record<string, unknown> | undefined
    if (row?.symbol) return { ok: true, message: 'FMP 连接成功' }
    return { ok: false, message: '响应格式异常' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
