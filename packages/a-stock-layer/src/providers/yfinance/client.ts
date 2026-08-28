/**
 * Yahoo Finance 统一请求客户端
 *
 * 基于 `yahoo-finance2` SDK，所有 HTTP 经其内置 Queue 串行化：
 * - concurrency: 1（同实例仅一个在途请求）
 * - interval: 默认 1000ms（与全仓 hostnameLimiter 对齐，避免触发 Yahoo 限流）
 *
 * SDK 还提供 quoteCombine 防抖合并；本模块在其上增加 429/5xx 指数退避重试。
 * Handler 标记 selfThrottled=true，不再叠加 hostnameLimiter（避免双重限流）。
 */
import YahooFinance from 'yahoo-finance2'
import type { ChartResultArray } from 'yahoo-finance2/modules/chart'
import type { Quote, QuoteOptions } from 'yahoo-finance2/modules/quote'
import { sleep } from '../../utils/http-shared.js'
import {
  YFINANCE_QUERY_HOST,
  yfinanceMaxRetries,
  yfinanceQueueIntervalMs,
  yfinanceQuoteCombineDebounceMs,
  yfinanceQuoteCombineMaxSymbols,
} from './settings.js'

export type YahooFinanceClient = InstanceType<typeof YahooFinance>

type YahooHttpError = Error & { code?: number }

const RETRY_STATUS = new Set([429, 500, 502, 503, 504])

let singleton: YahooFinanceClient | null = null

function isRetriableYahooError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as YahooHttpError).code
  return typeof code === 'number' && RETRY_STATUS.has(code)
}

function createYahooFinanceClient(): YahooFinanceClient {
  return new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    YF_QUERY_HOST: YFINANCE_QUERY_HOST,
    queue: {
      concurrency: 1,
      interval: yfinanceQueueIntervalMs(),
    },
    quoteCombine: {
      maxSymbolsPerRequest: yfinanceQuoteCombineMaxSymbols(),
      debounceTime: yfinanceQuoteCombineDebounceMs(),
    },
  })
}

export function getYahooFinanceClient(): YahooFinanceClient {
  if (!singleton) singleton = createYahooFinanceClient()
  return singleton
}

/** 测试用：重置单例 */
export function resetYahooFinanceClientForTests(): void {
  singleton = null
}

/** 调试用：当前队列配置（与 SDK 实例选项一致） */
export function yahooFinanceClientQueueConfig(): { concurrency: number; interval: number } {
  return {
    concurrency: 1,
    interval: yfinanceQueueIntervalMs(),
  }
}

async function withYahooFinanceRequest<T>(
  fn: (client: YahooFinanceClient) => Promise<T>,
): Promise<T> {
  const client = getYahooFinanceClient()
  const maxRetries = yfinanceMaxRetries()
  let attempt = 0
  let backoffMs = 2000

  while (true) {
    try {
      return await fn(client)
    } catch (err) {
      if (!isRetriableYahooError(err) || attempt >= maxRetries) throw err
      attempt += 1
      const code = (err as YahooHttpError).code
      const waitMs = code === 429 ? Math.max(backoffMs, 5000) : backoffMs
      await sleep(waitMs)
      backoffMs = Math.min(backoffMs * 2, 30_000)
    }
  }
}

export async function yahooQuote(
  query: string | string[],
  queryOptions?: QuoteOptions,
): Promise<Quote | Quote[]> {
  return withYahooFinanceRequest(client => client.quote(query, queryOptions))
}

export async function yahooQuoteSummary(
  symbol: string,
  queryOptions: Parameters<YahooFinanceClient['quoteSummary']>[1],
): Promise<Awaited<ReturnType<YahooFinanceClient['quoteSummary']>>> {
  return withYahooFinanceRequest(client => client.quoteSummary(symbol, queryOptions))
}

export async function yahooChart(
  symbol: string,
  queryOptions: Parameters<YahooFinanceClient['chart']>[1],
): Promise<ChartResultArray> {
  return withYahooFinanceRequest(async client => {
    const result = await client.chart(symbol, queryOptions)
    return result as ChartResultArray
  })
}

type PredefinedScreenerId =
  | 'day_gainers'
  | 'day_losers'
  | 'most_actives'
  | 'growth_technology_stocks'

export async function yahooScreener(
  scrId: PredefinedScreenerId,
  options: { count?: number; region?: string } = {},
): Promise<{ quotes?: Array<Record<string, unknown>> }> {
  const count = Math.max(1, Math.min(options.count ?? 10, 25))
  const region = options.region ?? 'US'
  return withYahooFinanceRequest(async client => {
    const result = await client.screener({ scrIds: scrId, count, region })
    return result as unknown as { quotes?: Array<Record<string, unknown>> }
  })
}

export async function yahooTrendingSymbols(
  region: string,
  options: { count?: number } = {},
): Promise<{ quotes?: Array<{ symbol?: string }> }> {
  const count = Math.max(1, Math.min(options.count ?? 10, 25))
  return withYahooFinanceRequest(client =>
    client.trendingSymbols(region, { count, region }),
  ) as Promise<{ quotes?: Array<{ symbol?: string }> }>
}
