import type {
  FinancialSummary,
  StockKline,
  StockListItem,
  StockProfile,
} from '../../../core/schema.js'
import type { IntradayTrendFetchResult } from '../../../utils/intraday-trends.js'
import type { StockMarket } from '../../../utils/helpers.js'
import type { TickflowInstrument, TickflowPeriod, CompactKlineData } from '../api/client.js'
import { TickflowClient } from '../api/client.js'
import { tickflowRegion, toTickflowSymbol } from '../api/symbols.js'
import { MarketHandlerShell } from '../../common/driver-factory.js'
import {
  expandCompactKlines,
  mapTickflowInstrumentListItems,
  mapTickflowInstrumentProfiles,
  mergeFinancialSummary,
  mapBalanceSheetRecords,
  mapIncomeStatementRecords,
  mapCashFlowRecords,
  rowsForSymbol,
  mapTickflowDepth,
  type TickflowMarketDepth,
} from '../normalize/index.js'
import type {
  TickflowMetricsRecord,
  TickflowIncomeRecord,
  TickflowBalanceSheetRecord,
  TickflowCashFlowRecord,
} from '../normalize/financials.js'

const EXCHANGE_MARKETS = new Set(['SH', 'SZ', 'BJ', 'US', 'HK'])
const CN_EXCHANGES = ['SH', 'SZ', 'BJ'] as const

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function isUniverseId(market: string): boolean {
  const m = market.trim()
  if (!m || EXCHANGE_MARKETS.has(m.toUpperCase())) return false
  return m.includes('_') || m.includes('-')
}

function resolveExchangeTargets(market: string): string[] {
  const upper = market.trim().toUpperCase()
  if (EXCHANGE_MARKETS.has(upper)) return [upper]
  if (upper === 'ALL' || upper === 'CN') return [...CN_EXCHANGES]
  if (upper === 'US') return ['US']
  if (upper === 'HK') return ['HK']
  return []
}

async function fetchInstrumentsBySymbols(
  client: TickflowClient,
  symbols: string[],
): Promise<TickflowInstrument[]> {
  const out: TickflowInstrument[] = []
  for (const part of chunk(symbols, 500)) {
    const json = await client.postInstruments({ symbols: part })
    const rows = (json.data ?? []) as TickflowInstrument[]
    out.push(...rows)
  }
  return out
}

function compactKlineToIntradaySessions(
  tickflowSymbol: string,
  data: CompactKlineData,
  period: TickflowPeriod = '1m',
): IntradayTrendFetchResult | null {
  const region = tickflowRegion(tickflowSymbol)
  if (!region) return null
  const bars = expandCompactKlines(tickflowSymbol, data, period, region)
  if (!bars.length) return null

  const sessionMap = new Map<string, StockKline[]>()
  for (const bar of bars) {
    const sessionDate = bar.date.slice(0, 10)
    const list = sessionMap.get(sessionDate) ?? []
    list.push(bar)
    sessionMap.set(sessionDate, list)
  }

  const sessions = [...sessionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionDate, sessionBars]) => ({
      sessionDate,
      preClose: null as number | null,
      bars: sessionBars
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(bar => ({
          time: bar.date.length > 10 ? bar.date : `${sessionDate} 09:30:00`,
          price: bar.close,
          volume: bar.volume ?? 0,
          amount: bar.amount ?? 0,
          avgPrice: bar.close,
        })),
    }))

  const apiPreClose = data.prev_close?.[0] ?? null
  if (sessions.length && apiPreClose != null) {
    sessions[sessions.length - 1].preClose = apiPreClose
  }

  return sessions.length ? { sessions, apiPreClose } : null
}

/** Metadata, financials, depth, and intraday helpers shared by TickflowMarketHandler. */
export abstract class TickflowCommonHandler extends MarketHandlerShell {
  protected abstract client(): TickflowClient | null

  protected tickflowSymbol(code: string): string {
    return toTickflowSymbol(code)
  }

  async stockList(market = 'CN', keyword = ''): Promise<StockListItem[] | null> {
    const client = this.client()
    if (!client) return null

    try {
      const exchanges = resolveExchangeTargets(market)
      let instruments: TickflowInstrument[] = []

      if (exchanges.length) {
        const batches = await Promise.all(
          exchanges.map(ex => client.getExchangeInstruments(ex, 'stock')),
        )
        for (const json of batches) {
          instruments.push(...((json.data ?? []) as TickflowInstrument[]))
        }
      } else if (isUniverseId(market)) {
        const json = await client.getUniverse(market.trim())
        const detail = json.data as { symbols?: string[] } | undefined
        const symbols = detail?.symbols ?? []
        if (!symbols.length) return null
        instruments = await fetchInstrumentsBySymbols(client, symbols)
      } else {
        const json = await client.getUniverse(market.trim())
        const detail = json.data as { symbols?: string[] } | undefined
        const symbols = detail?.symbols ?? []
        if (!symbols.length) return null
        instruments = await fetchInstrumentsBySymbols(client, symbols)
      }

      const rows = mapTickflowInstrumentListItems(instruments, keyword)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getInstruments({ symbols: symbol })
      const rows = (json.data ?? []) as TickflowInstrument[]
      if (!rows.length) return null
      return mapTickflowInstrumentProfiles(rows)
    } catch {
      return null
    }
  }

  async financials(
    code: string,
    reportDate = '',
    reportType = 'annual',
  ): Promise<FinancialSummary[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    const quarterly = reportType === 'quarter' || reportType === 'quarterly'
    const query = {
      symbols: symbol,
      start_date: reportDate || undefined,
    }

    try {
      const [metricsJson, incomeJson] = await Promise.all([
        client.getFinancialsMetrics(query),
        client.getFinancialsIncome(query),
      ])
      const metrics = rowsForSymbol(
        metricsJson.data as Record<string, TickflowMetricsRecord[]> | undefined,
        symbol,
      )
      const income = rowsForSymbol(
        incomeJson.data as Record<string, TickflowIncomeRecord[]> | undefined,
        symbol,
      )
      const rows = mergeFinancialSummary(
        symbol,
        metrics,
        income,
        quarterly ? 'quarterly' : 'annual',
      )
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async balanceSheet(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsBalanceSheet({
        symbols: symbol,
        start_date: reportDate || undefined,
      })
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowBalanceSheetRecord[]> | undefined,
        symbol,
      )
      const mapped = mapBalanceSheetRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async incomeStatement(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsIncome({
        symbols: symbol,
        start_date: reportDate || undefined,
      })
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowIncomeRecord[]> | undefined,
        symbol,
      )
      const mapped = mapIncomeStatementRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async cashFlow(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsCashFlow({
        symbols: symbol,
        start_date: reportDate || undefined,
      })
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowCashFlowRecord[]> | undefined,
        symbol,
      )
      const mapped = mapCashFlowRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /** Optional research helper — TickFlow five-level depth. */
  async fetchDepth(code: string): Promise<Record<string, unknown> | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getDepth(symbol)
      const depth = json.data as TickflowMarketDepth | undefined
      if (!depth) return null
      return mapTickflowDepth(depth)
    } catch {
      return null
    }
  }

  /** Intraday sessions via TickFlow /v1/klines/intraday (API: 当日分钟 K，不含历史多日). */
  async fetchIntradaySessions(
    code: string,
    _ndays = 5,
    _market?: StockMarket,
  ): Promise<IntradayTrendFetchResult | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getKlinesIntraday({ symbol, period: '1m' })
      const data = json.data as CompactKlineData | undefined
      if (!data) return null
      return compactKlineToIntradaySessions(symbol, data, '1m')
    } catch {
      return null
    }
  }

  async minuteTrendKline(
    code: string,
    _ndays = 1,
    count = 0,
    _market?: StockMarket,
  ): Promise<StockKline[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    const region = tickflowRegion(symbol)
    if (!region) return null
    try {
      const json = await client.getKlinesIntraday({
        symbol,
        period: '1m',
        count: count > 0 ? count : undefined,
      })
      const data = json.data as CompactKlineData | undefined
      if (!data) return null
      let rows = expandCompactKlines(symbol, data, '1m', region)
      if (count > 0 && rows.length > count) rows = rows.slice(-count)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }
}

