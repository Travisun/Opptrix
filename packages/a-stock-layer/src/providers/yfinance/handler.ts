import type { Market } from '@opptrix/shared'
import type { GlobalIndex, IndexKline } from '../../core/schema.js'
import { Capability } from '../../core/capabilities.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import { getYahooFinanceClient } from './client.js'
import {
  listYfinanceGlobalIndexTargets,
  resolveYahooIndexTicker,
  resolveYfinanceGlobalIndex,
} from './symbols.js'
import {
  mapChartQuotesToIndexKlines,
  mapQuoteToGlobalIndex,
  mapQuoteToIndexRealtime,
} from './normalize.js'

type ChartInterval = '1d' | '1wk' | '1mo'

function resolveChartInterval(period = 'daily'): ChartInterval {
  if (period === 'weekly') return '1wk'
  if (period === 'monthly') return '1mo'
  return '1d'
}

function periodStartDate(period: ChartInterval, count: number): Date {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  if (period === '1wk') return new Date(now - count * 7 * dayMs * 1.4)
  if (period === '1mo') return new Date(now - count * 31 * dayMs * 1.4)
  return new Date(now - count * dayMs * 1.6)
}

function marketFromTicker(ticker: string): Market {
  const upper = ticker.toUpperCase()
  if (upper === '^HSI' || upper.endsWith('.HK')) return 'HK'
  if (upper === '^N225' || upper.endsWith('.T')) return 'JP'
  if (upper.endsWith('.SS') || upper.endsWith('.SZ')) return 'CN'
  return 'US'
}

function asYahooQuote(quote: unknown): Parameters<typeof mapQuoteToGlobalIndex>[1] {
  return quote as Parameters<typeof mapQuoteToGlobalIndex>[1]
}

export class YfinanceMarketHandler extends MarketHandlerShell {
  readonly selfThrottled = true

  private yf() {
    return getYahooFinanceClient()
  }

  async globalIndex(code = ''): Promise<GlobalIndex[] | null> {
    const targets = listYfinanceGlobalIndexTargets(code)
    if (!targets.length) return null
    try {
      const quotes = await this.yf().quote(targets.map(t => t.yahoo))
      const list = Array.isArray(quotes) ? quotes : [quotes]
      const out: GlobalIndex[] = []
      for (let i = 0; i < targets.length; i++) {
        const quote = list[i]
        if (!quote) continue
        out.push(mapQuoteToGlobalIndex(targets[i]!, asYahooQuote(quote)))
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  async indexRealtime(
    code: string,
    market?: Market | null,
  ): Promise<import('@opptrix/shared').StockRealtime[] | null> {
    const mkt = market ?? marketFromTicker(code)
    const ticker = resolveYahooIndexTicker(mkt, code)
    if (!ticker) return null
    try {
      const quote = await this.yf().quote(ticker)
      if (!quote) return null
      const display = resolveYfinanceGlobalIndex(code)?.outCode ?? code
      return [mapQuoteToIndexRealtime(display, asYahooQuote(quote))]
    } catch {
      return null
    }
  }

  async indexKline(
    code: string,
    period = 'daily',
    _start = '',
    _end = '',
    count?: number,
    market?: Market | null,
  ): Promise<IndexKline[] | null> {
    const rows = await this.fetchIndexChart(code, period, count, market)
    return rows?.length ? rows : null
  }

  private async fetchIndexChart(
    code: string,
    period: string,
    count?: number,
    market?: Market | null,
  ): Promise<IndexKline[] | null> {
    const mkt = market ?? marketFromTicker(code)
    const ticker = resolveYahooIndexTicker(mkt, code)
    if (!ticker) return null
    const interval = resolveChartInterval(period)
    const want = Math.max(1, Math.min(count ?? 240, 800))
    try {
      const result = await this.yf().chart(ticker, {
        period1: periodStartDate(interval, want),
        period2: new Date(),
        interval,
      })
      const quotes = result.quotes ?? []
      const display = resolveYfinanceGlobalIndex(code)?.outCode ?? code
      return mapChartQuotesToIndexKlines(display, quotes, want)
    } catch {
      return null
    }
  }
}

export const YFINANCE_HANDLER_CAPS = [
  Capability.GLOBAL_INDEX,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
]
