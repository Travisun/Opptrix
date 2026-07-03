import { httpGet } from '../../../utils/http.js'
import { loadTiingoConfig } from '../config.js'

const BASE = 'https://api.tiingo.com'

export class TiingoClient {
  constructor(private apiToken: string) {}

  static fromConfig(): TiingoClient | null {
    const cfg = loadTiingoConfig()
    if (!cfg.apiToken) return null
    return new TiingoClient(cfg.apiToken)
  }

  private params(extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, token: this.apiToken }
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      Authorization: `Token ${this.apiToken}`,
    }
  }

  async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`
    return httpGet(url, this.params(query), 20000, this.headers())
  }

  async iexRealtime(symbol: string) {
    return this.get(`/iex/${symbol}`)
  }

  async dailyMeta(symbol: string) {
    return this.get(`/tiingo/daily/${symbol}`)
  }

  async dailyPrices(symbol: string, startDate: string, endDate?: string) {
    const q: Record<string, string> = { startDate }
    if (endDate) q.endDate = endDate
    return this.get(`/tiingo/daily/${symbol}/prices`, q)
  }

  async search(query: string) {
    return this.get('/tiingo/utilities/search', { query })
  }
}

export async function testTiingoConnection(apiToken: string): Promise<{ ok: boolean; message: string }> {
  const token = apiToken.trim()
  if (!token) return { ok: false, message: 'API Token 未配置' }
  try {
    const json = await httpGet(
      `${BASE}/api/test`,
      { token },
      15000,
      { Accept: 'application/json', Authorization: `Token ${token}` },
    )
    if (json.message === 'Success') return { ok: true, message: 'Tiingo 连接成功' }
    const meta = await httpGet(
      `${BASE}/tiingo/daily/AAPL`,
      { token },
      15000,
      { Accept: 'application/json', Authorization: `Token ${token}` },
    ) as Record<string, unknown>
    if (meta.ticker) return { ok: true, message: 'Tiingo 连接成功' }
    return { ok: false, message: '响应格式异常' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
