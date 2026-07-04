import { HTTP_DEFAULT_HEADERS } from '../../../utils/http.js'
import { sinaThrottle } from './rate-limit.js'
import { toSinaIndexListSymbol, toSinaKlineSymbol, toSinaListSymbol } from './symbols.js'

const HQ_LIST_URL = 'https://hq.sinajs.cn/list='
const KLINE_URL = 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData'
const MARKET_CENTER_URL = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData'
const MARKET_COUNT_URL = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount'

/** Referer only — User-Agent stays the shared default from http.ts. */
const BROWSE_HEADERS = {
  Referer: 'https://finance.sina.com.cn/',
  Accept: '*/*',
}

export class SinaBrowseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SinaBrowseError'
  }
}

function mergeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...HTTP_DEFAULT_HEADERS, ...BROWSE_HEADERS, ...extra }
}

async function decodeResponseText(resp: Response, encoding: 'utf-8' | 'gbk' = 'utf-8'): Promise<string> {
  const buf = await resp.arrayBuffer()
  return new TextDecoder(encoding).decode(buf)
}

export class SinaClient {
  async getText(
    url: string,
    encoding: 'utf-8' | 'gbk' = 'utf-8',
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    return sinaThrottle(async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      try {
        const resp = await fetch(url, {
          headers: mergeHeaders(extraHeaders),
          signal: controller.signal,
        })
        if (!resp.ok) throw new SinaBrowseError(`暂时无法访问新浪财经（HTTP ${resp.status}）`)
        return decodeResponseText(resp, encoding)
      } catch (e) {
        if (e instanceof SinaBrowseError) throw e
        const msg = e instanceof Error ? e.message : String(e)
        throw new SinaBrowseError(`暂时无法访问新浪财经（${msg}）`)
      } finally {
        clearTimeout(timer)
      }
    })
  }

  async getJson<T>(url: string): Promise<T> {
    const text = await this.getText(url, 'utf-8')
    try {
      return JSON.parse(text) as T
    } catch {
      throw new SinaBrowseError('新浪财经返回内容无法解析，请稍后再试')
    }
  }

  fetchHqList(symbols: string[]) {
    const joined = [...new Set(symbols.map(s => s.trim()).filter(Boolean))].join(',')
    if (!joined) return Promise.resolve('')
    return this.getText(`${HQ_LIST_URL}${joined}`, 'gbk')
  }

  fetchStockQuote(code: string) {
    return this.fetchHqList([toSinaListSymbol(code)])
  }

  fetchIndexQuote(code: string) {
    return this.fetchHqList([toSinaIndexListSymbol(code)])
  }

  async fetchKlineRows(code: string, period = 'daily', datalen = 1023) {
    if (period !== 'daily') return []
    const params = new URLSearchParams({
      symbol: toSinaKlineSymbol(code),
      scale: '240',
      ma: 'no',
      datalen: String(Math.min(Math.max(datalen, 1), 1023)),
    })
    const rows = await this.getJson<Array<Record<string, string>>>(`${KLINE_URL}?${params}`)
    return Array.isArray(rows) ? rows : []
  }

  fetchStockListPage(page = 1, pageSize = 100, node = 'hs_a') {
    const params = new URLSearchParams({
      page: String(page),
      num: String(Math.min(Math.max(pageSize, 1), 100)),
      sort: 'symbol',
      asc: '1',
      node,
      symbol: '',
    })
    return this.getJson<Array<Record<string, unknown>>>(`${MARKET_CENTER_URL}?${params}`)
  }

  fetchMarketStockCount(node = 'hs_a') {
    return this.getJson<string | number>(`${MARKET_COUNT_URL}?node=${encodeURIComponent(node)}`)
  }

  fetchMarketBreadthPage(page = 1, pageSize = 100) {
    const params = new URLSearchParams({
      page: String(page),
      num: String(Math.min(Math.max(pageSize, 1), 100)),
      sort: 'symbol',
      asc: '1',
      node: 'hs_a',
      symbol: '',
    })
    return this.getJson<Array<Record<string, unknown>>>(`${MARKET_CENTER_URL}?${params}`)
  }
}

let sharedClient: SinaClient | null = null

export function getSinaClient(): SinaClient {
  if (!sharedClient) sharedClient = new SinaClient()
  return sharedClient
}

export async function testSinaConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await getSinaClient().fetchStockQuote('600519')
    if (text.includes('hq_str_') && text.includes(',')) {
      const name = text.match(/="([^,]+),/)?.[1]
      return { ok: true, message: name ? `新浪财经可访问 · ${name}` : '新浪财经可访问 · 实时行情正常' }
    }
    const rows = await getSinaClient().fetchKlineRows('600519', 'daily', 5)
    if (rows.length) {
      return { ok: true, message: '新浪财经可访问 · 历史 K 线接口正常' }
    }
    return { ok: false, message: '新浪返回空数据，请稍后再试' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
