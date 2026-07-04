import { HTTP_DEFAULT_HEADERS } from '../../../utils/http.js'
import { neteaseThrottle } from './rate-limit.js'
import { toNeteaseCode } from './symbols.js'

const QUOTES_ORIGIN = 'https://quotes.money.163.com'
const FEED_BASE = 'https://api.money.126.net/data/feed'

/** Referer only — User-Agent stays the shared default from http.ts. */
const BROWSE_HEADERS = {
  Referer: 'https://money.163.com/',
  Accept: '*/*',
}

export class NeteaseBrowseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NeteaseBrowseError'
  }
}

function mergeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...HTTP_DEFAULT_HEADERS, ...BROWSE_HEADERS, ...extra }
}

async function decodeResponseText(resp: Response, encoding: 'utf-8' | 'gbk' = 'utf-8'): Promise<string> {
  const buf = await resp.arrayBuffer()
  return new TextDecoder(encoding).decode(buf)
}

function parseJsonpPayload(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  const match = trimmed.match(/_ntes_quote_callback\s*\(([\s\S]*)\)\s*;?\s*$/)
    ?? trimmed.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/)
  if (!match?.[1]) {
    throw new NeteaseBrowseError('网易返回格式异常，请稍后在浏览器打开查看')
  }
  try {
    return JSON.parse(match[1]) as Record<string, unknown>
  } catch {
    throw new NeteaseBrowseError('网易返回内容无法解析，请稍后再试')
  }
}

export class NeteaseClient {
  async getText(
    url: string,
    encoding: 'utf-8' | 'gbk' = 'utf-8',
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    return neteaseThrottle(async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      try {
        const resp = await fetch(url, {
          headers: mergeHeaders(extraHeaders),
          signal: controller.signal,
        })
        if (!resp.ok) throw new NeteaseBrowseError(`暂时无法访问网易财经（HTTP ${resp.status}）`)
        return decodeResponseText(resp, encoding)
      } catch (e) {
        if (e instanceof NeteaseBrowseError) throw e
        const msg = e instanceof Error ? e.message : String(e)
        throw new NeteaseBrowseError(`暂时无法访问网易财经（${msg}）`)
      } finally {
        clearTimeout(timer)
      }
    })
  }

  fetchHistoricalKlineCsv(code: string, start = '', end = '') {
    const params = new URLSearchParams({ code: toNeteaseCode(code) })
    if (start) params.set('start', start.replace(/-/g, ''))
    if (end) params.set('end', end.replace(/-/g, ''))
    const url = `${QUOTES_ORIGIN}/service/chddata.html?${params}`
    return this.getText(url, 'gbk')
  }

  async fetchFeedQuotes(neteaseCodes: string[]): Promise<Record<string, Record<string, unknown>>> {
    if (!neteaseCodes.length) return {}
    const joined = [...new Set(neteaseCodes.map(c => c.trim()).filter(Boolean))].join(',')
    const urls = [
      `${FEED_BASE}/${joined},money.api`,
      `http://api.money.126.net/data/feed/${joined},money.api`,
    ]
    let lastErr: unknown
    for (const url of urls) {
      try {
        const text = await this.getText(url, 'utf-8')
        return parseJsonpPayload(text) as Record<string, Record<string, unknown>>
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr instanceof Error ? lastErr : new NeteaseBrowseError(String(lastErr))
  }

  async fetchStockListPage(page = 1, pageSize = 500): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({
      page: String(page),
      query: 'STYPE:EQA',
      fields: 'NO,SYMBOL,NAME,PRICE,PERCENT,UPDOWN,OPEN,YESTCLOSE,HIGH,LOW,VOLUME,TURNOVER,HS,PE,MCAP,TCAP,CODE,SNAME',
      sort: 'SYMBOL',
      order: 'asc',
      count: String(Math.min(Math.max(pageSize, 1), 500)),
      type: 'query',
    })
    const url = `${QUOTES_ORIGIN}/hs/service/diyrank.php?${params}`
    const text = await this.getText(url, 'utf-8')
    try {
      const json = JSON.parse(text) as { list?: Record<string, unknown>[]; data?: { list?: Record<string, unknown>[] } }
      return json.list ?? json.data?.list ?? []
    } catch {
      throw new NeteaseBrowseError('网易股票列表返回异常')
    }
  }

  async fetchMarketBreadthSnapshot(): Promise<Record<string, unknown>> {
    const keys = [
      'HSRANK_COUNT_SHA',
      'HSRANK_COUNT_SZA',
      'HSRANK_COUNT_SH3',
      'RANK_AUP',
      'RANK_ADOWN',
      '0000001',
      '1399001',
    ]
    return this.fetchFeedQuotes(keys)
  }
}

let sharedClient: NeteaseClient | null = null

export function getNeteaseClient(): NeteaseClient {
  if (!sharedClient) sharedClient = new NeteaseClient()
  return sharedClient
}

export async function testNeteaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const feed = await getNeteaseClient().fetchFeedQuotes([toNeteaseCode('600519')])
    const hit = feed[toNeteaseCode('600519')]
    if (hit?.name) {
      return { ok: true, message: `网易财经可访问 · ${String(hit.name)}` }
    }
    const text = await getNeteaseClient().fetchHistoricalKlineCsv('600519', '20250101', '20250301')
    if (text.includes('日期')) {
      return { ok: true, message: '网易财经可访问 · 历史 K 线接口正常' }
    }
    return { ok: false, message: '网易返回空数据，请稍后再试' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
