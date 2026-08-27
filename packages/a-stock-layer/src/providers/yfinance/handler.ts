import type { Market } from '@opptrix/shared'
import type { GlobalIndex, IndexKline, StockProfile } from '../../core/schema.js'
import type { StockKline } from '@opptrix/shared'
import { Capability } from '../../core/capabilities.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import { yahooChart, yahooQuote, yahooQuoteSummary } from './client.js'
import {
  displayCodeFromYahooTicker,
  listYfinanceGlobalIndexTargets,
  resolveYahooEquityTicker,
  resolveYahooIndexTicker,
  resolveYfinanceGlobalIndex,
} from './symbols.js'
import { listYfinanceSectorBoards } from './sectors.js'
import {
  mapChartQuotesToIndexKlines,
  mapChartQuotesToKlines,
  mapQuoteSummaryToProfile,
  mapQuoteToGlobalIndex,
  mapQuoteToIndexRealtime,
  mapSectorQuoteRow,
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
  if (upper === '^KS11' || upper.endsWith('.KS')) return 'KR'
  if (upper.endsWith('.SS') || upper.endsWith('.SZ')) return 'CN'
  return 'US'
}

function resolveMarket(market: Market | null | undefined, code: string): Market {
  return market ?? marketFromTicker(code)
}

function asYahooQuote(quote: unknown): Parameters<typeof mapQuoteToGlobalIndex>[1] {
  return quote as Parameters<typeof mapQuoteToGlobalIndex>[1]
}

function asQuoteSummary(summary: unknown): Parameters<typeof mapQuoteSummaryToProfile>[1] {
  return summary as Parameters<typeof mapQuoteSummaryToProfile>[1]
}

export class YfinanceMarketHandler extends MarketHandlerShell {
  /** 走 yahoo-finance2 内置 Queue + client 层 429/5xx 重试，不叠加 hostnameLimiter */
  readonly selfThrottled = true

  async globalIndex(code = ''): Promise<GlobalIndex[] | null> {
    const targets = listYfinanceGlobalIndexTargets(code)
    if (!targets.length) return null
    try {
      const quotes = await yahooQuote(targets.map(t => t.yahoo))
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
    const mkt = resolveMarket(market, code)
    const ticker = resolveYahooIndexTicker(mkt, code)
    if (!ticker) return null
    return this.quoteRealtime(ticker, resolveYfinanceGlobalIndex(code)?.outCode ?? code, mkt)
  }

  async indexKline(
    code: string,
    period = 'daily',
    _start = '',
    _end = '',
    count?: number,
    market?: Market | null,
  ): Promise<IndexKline[] | null> {
    const mkt = resolveMarket(market, code)
    const ticker = resolveYahooIndexTicker(mkt, code)
    if (!ticker) return null
    const display = resolveYfinanceGlobalIndex(code)?.outCode ?? code
    const rows = await this.fetchChart(ticker, period, count)
    if (!rows) return null
    return mapChartQuotesToIndexKlines(display, rows, count)
  }

  async realtime(
    code: string,
    market?: Market | null,
  ): Promise<import('@opptrix/shared').StockRealtime[] | null> {
    const mkt = resolveMarket(market, code)
    const ticker = resolveYahooEquityTicker(mkt, code)
    if (!ticker) return null
    const display = displayCodeFromYahooTicker(ticker, mkt)
    return this.quoteRealtime(ticker, display, mkt)
  }

  async batchRealtime(
    codes: string[],
    markets?: Record<string, Market | undefined>,
  ): Promise<import('@opptrix/shared').StockRealtime[] | null> {
    if (!codes.length) return null
    const pairs = codes.map(code => {
      const mkt = markets?.[code] ?? markets?.[code.trim().toUpperCase()] ?? 'US'
      const ticker = resolveYahooEquityTicker(mkt, code)
      return ticker ? { code, mkt, ticker } : null
    }).filter((row): row is { code: string; mkt: Market; ticker: string } => row != null)
    if (!pairs.length) return null
    try {
      const quotes = await yahooQuote(pairs.map(p => p.ticker))
      const list = Array.isArray(quotes) ? quotes : [quotes]
      const out: import('@opptrix/shared').StockRealtime[] = []
      for (let i = 0; i < pairs.length; i++) {
        const quote = list[i]
        const pair = pairs[i]
        if (!quote || !pair) continue
        const display = displayCodeFromYahooTicker(pair.ticker, pair.mkt)
        const row = mapQuoteToIndexRealtime(display, asYahooQuote(quote))
        out.push(row)
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  async kline(
    code: string,
    period = 'daily',
    _start = '',
    _end = '',
    count?: number,
    market?: Market | null,
  ): Promise<StockKline[] | null> {
    const mkt = resolveMarket(market, code)
    const ticker = resolveYahooEquityTicker(mkt, code)
    if (!ticker) return null
    const display = displayCodeFromYahooTicker(ticker, mkt)
    const rows = await this.fetchChart(ticker, period, count)
    if (!rows) return null
    return mapChartQuotesToKlines(display, rows, count)
  }

  async profile(code: string, market?: Market | null): Promise<StockProfile[] | null> {
    const mkt = resolveMarket(market, code)
    const ticker = resolveYahooEquityTicker(mkt, code)
    if (!ticker) return null
    const display = displayCodeFromYahooTicker(ticker, mkt)
    try {
      const summary = await yahooQuoteSummary(ticker, {
        modules: ['price', 'summaryProfile', 'assetProfile', 'summaryDetail'],
      })
      const mapped = mapQuoteSummaryToProfile(display, asQuoteSummary(summary))
      return [mapped]
    } catch {
      return null
    }
  }

  async sectorList(plateType = 'boards:US'): Promise<Record<string, unknown>[] | null> {
    const boards = listYfinanceSectorBoards(plateType)
    if (!boards.length) return null
    try {
      const quotes = await yahooQuote(boards.map(b => b.yahoo))
      const list = Array.isArray(quotes) ? quotes : [quotes]
      const out: Record<string, unknown>[] = []
      for (let i = 0; i < boards.length; i++) {
        const quote = list[i]
        const board = boards[i]
        if (!quote || !board) continue
        out.push(mapSectorQuoteRow(board, asYahooQuote(quote)))
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  private async quoteRealtime(
    ticker: string,
    displayCode: string,
    _market: Market,
  ): Promise<import('@opptrix/shared').StockRealtime[] | null> {
    try {
      const quote = await yahooQuote(ticker)
      if (!quote) return null
      return [mapQuoteToIndexRealtime(displayCode, asYahooQuote(quote))]
    } catch {
      return null
    }
  }

  private async fetchChart(
    ticker: string,
    period: string,
    count?: number,
  ): Promise<Array<{
    date: Date
    open?: number | null
    high?: number | null
    low?: number | null
    close?: number | null
    volume?: number | null
  }> | null> {
    const interval = resolveChartInterval(period)
    const want = Math.max(1, Math.min(count ?? 240, 800))
    try {
      const result = await yahooChart(ticker, {
        period1: periodStartDate(interval, want),
        period2: new Date(),
        interval,
      })
      return result.quotes ?? null
    } catch {
      return null
    }
  }
}

export const YFINANCE_HANDLER_CAPS = [
  Capability.GLOBAL_INDEX,
  Capability.INDEX_REALTIME,
  Capability.INDEX_KLINE,
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.STOCK_PROFILE,
  Capability.SECTOR_LIST,
]
