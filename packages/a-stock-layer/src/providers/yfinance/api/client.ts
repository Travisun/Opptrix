import { HTTP_DEFAULT_HEADERS } from '../../../utils/http.js'
import { yfinanceThrottle } from './rate-limit.js'

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YAHOO_SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search'
const YAHOO_QUOTE_SUMMARY = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary'
const YAHOO_SCREENER = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved'

/** Referer only — User-Agent stays the shared default from http.ts. */
const BROWSE_HEADERS = {
  Referer: 'https://finance.yahoo.com/',
  Accept: 'application/json',
}

export class YfinanceBrowseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YfinanceBrowseError'
  }
}

function mergeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...HTTP_DEFAULT_HEADERS, ...BROWSE_HEADERS, ...extra }
}

async function fetchJson(url: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params)
  const fullUrl = qs.toString() ? `${url}?${qs}` : url
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const resp = await fetch(fullUrl, {
      headers: mergeHeaders(),
      signal: controller.signal,
    })
    if (!resp.ok) {
      throw new YfinanceBrowseError(`暂时无法访问 Yahoo 财经（HTTP ${resp.status}）`)
    }
    return await resp.json() as Record<string, unknown>
  } catch (e) {
    if (e instanceof YfinanceBrowseError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new YfinanceBrowseError(`暂时无法访问 Yahoo 财经（${msg}）`)
  } finally {
    clearTimeout(timer)
  }
}

export class YfinanceClient {
  fetchChart(yahooSymbol: string, range: string, interval: string) {
    return yfinanceThrottle(() => fetchJson(
      `${YAHOO_CHART}/${encodeURIComponent(yahooSymbol)}`,
      { interval, range },
    ))
  }

  search(q: string, count = 25) {
    return yfinanceThrottle(() => fetchJson(YAHOO_SEARCH, {
      q,
      quotesCount: String(count),
      newsCount: '0',
      enableFuzzyQuery: 'false',
    }))
  }

  fetchScreener(scrId: string, count = 100) {
    return yfinanceThrottle(() => fetchJson(YAHOO_SCREENER, {
      formatted: 'true',
      lang: 'en-US',
      region: 'US',
      scrIds: scrId,
      count: String(count),
    }))
  }

  fetchQuoteSummary(yahooSymbol: string, modules: string[]) {
    return yfinanceThrottle(() => fetchJson(
      `${YAHOO_QUOTE_SUMMARY}/${encodeURIComponent(yahooSymbol)}`,
      { modules: modules.join(',') },
    ))
  }
}

let sharedClient: YfinanceClient | null = null

export function getYfinanceClient(): YfinanceClient {
  if (!sharedClient) sharedClient = new YfinanceClient()
  return sharedClient
}

export async function testYfinanceConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const json = await getYfinanceClient().fetchChart('AAPL', '1d', '1d')
    const result = ((json.chart as Record<string, unknown>)?.result as unknown[])?.[0] as Record<string, unknown> | undefined
    const meta = result?.meta as Record<string, unknown> | undefined
    const name = String(meta?.shortName ?? meta?.longName ?? 'Apple')
    if (meta?.regularMarketPrice != null || meta?.chartPreviousClose != null) {
      return { ok: true, message: `Yahoo 财经可访问 · ${name}` }
    }
    return { ok: false, message: 'Yahoo 返回空数据，请稍后再试' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
