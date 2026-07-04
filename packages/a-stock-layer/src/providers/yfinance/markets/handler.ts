import type {
  FinancialSummary, GlobalIndex, StockKline, StockListItem, StockProfile, StockRealtime,
} from '../../../core/schema.js'
import type { RegionalEquityMarket } from '../../../utils/regional-symbol.js'
import { regionalSeedStockList } from '../../../utils/regional-stock-list.js'
import { MarketHandlerShell } from '../../common/driver-factory.js'
import { getYfinanceClient } from '../api/client.js'
import {
  displayCode,
  parseStockListMarket,
  toYahooTicker,
  YFINANCE_GLOBAL_INDEX_MAP,
} from '../api/symbols.js'
import { mapYfinanceFinancials } from '../normalize/financials.js'
import { globalIndexKeys, mapYfinanceGlobalIndex } from '../normalize/global-index.js'
import { mapYfinanceProfile } from '../normalize/profile.js'
import { parseYahooKlines, parseYahooRealtime } from '../normalize/quote.js'
import {
  defaultUsListQueries,
  defaultUsScreenerIds,
  mapRegionalSearchQuotes,
  mapUsScreenerQuotes,
  mapUsSearchQuotes,
  mergeStockListRows,
} from '../normalize/stock-list.js'

function klineRange(count?: number): string {
  const n = count ?? 180
  if (n <= 90) return '3mo'
  if (n <= 180) return '6mo'
  return '1y'
}

export class YfinanceMarketHandler extends MarketHandlerShell {
  private client = getYfinanceClient()

  async realtime(symbol: string): Promise<StockRealtime[] | null> {
    try {
      const code = displayCode(symbol)
      const yahoo = toYahooTicker(symbol)
      const json = await this.client.fetchChart(yahoo, '1d', '1d')
      return parseYahooRealtime(json, code)
    } catch {
      return null
    }
  }

  async batchRealtime(symbols: string[]): Promise<StockRealtime[] | null> {
    const rows: StockRealtime[] = []
    for (const sym of symbols) {
      const part = await this.realtime(sym)
      if (part?.[0]) rows.push(part[0])
    }
    return rows.length ? rows : null
  }

  async kline(
    symbol: string,
    period = 'daily',
    _start = '',
    _end = '',
    count?: number,
  ): Promise<StockKline[] | null> {
    if (period !== 'daily' && period !== '1d') return null
    try {
      const code = displayCode(symbol)
      const yahoo = toYahooTicker(symbol)
      const json = await this.client.fetchChart(yahoo, klineRange(count), '1d')
      return parseYahooKlines(json, code, count)
    } catch {
      return null
    }
  }

  async profile(symbol: string): Promise<StockProfile[] | null> {
    try {
      const code = displayCode(symbol, 'US')
      const yahoo = toYahooTicker(symbol, 'US')
      const json = await this.client.fetchQuoteSummary(yahoo, [
        'assetProfile',
        'summaryProfile',
        'price',
        'defaultKeyStatistics',
      ])
      const row = mapYfinanceProfile(json, code)
      return row ? [row] : null
    } catch {
      return null
    }
  }

  async financials(
    symbol: string,
    reportDate = '',
    reportType = 'annual',
  ): Promise<FinancialSummary[] | null> {
    void reportDate
    try {
      const code = displayCode(symbol, 'US')
      const yahoo = toYahooTicker(symbol, 'US')
      const json = await this.client.fetchQuoteSummary(yahoo, [
        'incomeStatementHistory',
        'balanceSheetHistory',
        'cashflowStatementHistory',
        'financialData',
      ])
      return mapYfinanceFinancials(json, code, reportType)
    } catch {
      return null
    }
  }

  async stockList(market = 'US', keyword = ''): Promise<StockListItem[] | null> {
    const m = parseStockListMarket(market)
    if (m === 'US') return this.usStockList(keyword)
    if (m === 'HK' || m === 'JP' || m === 'KR') return this.regionalStockList(m, keyword)
    return null
  }

  private async usStockList(keyword = ''): Promise<StockListItem[] | null> {
    try {
      if (keyword.trim()) {
        const json = await this.client.search(keyword.trim(), 40)
        const rows = mapUsSearchQuotes(json)
        return rows.length ? rows : null
      }

      const merged: StockListItem[] = []
      for (const scrId of defaultUsScreenerIds()) {
        try {
          const json = await this.client.fetchScreener(scrId, 80)
          merged.push(...mapUsScreenerQuotes(json))
        } catch {
          /* try next screener */
        }
      }
      for (const q of defaultUsListQueries()) {
        try {
          const json = await this.client.search(q, 10)
          merged.push(...mapUsSearchQuotes(json))
        } catch {
          /* skip */
        }
      }
      const rows = mergeStockListRows(merged)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  private async regionalStockList(
    market: RegionalEquityMarket,
    keyword = '',
  ): Promise<StockListItem[] | null> {
    try {
      const queries = keyword.trim()
        ? [keyword.trim()]
        : regionalSeedStockList(market).slice(0, 8).map((r: StockListItem) => r.name)
      const merged: StockListItem[] = []
      for (const seed of regionalSeedStockList(market)) {
        merged.push(seed)
      }
      for (const q of queries) {
        try {
          const json = await this.client.search(q, 25)
          merged.push(...mapRegionalSearchQuotes(market, json))
        } catch {
          /* skip failed query */
        }
      }
      const rows = mergeStockListRows(merged)
      if (keyword.trim()) {
        const kw = keyword.trim().toUpperCase()
        const filtered = rows.filter((row: StockListItem) =>
          row.code.toUpperCase().includes(kw)
          || row.name.toUpperCase().includes(kw),
        )
        return filtered.length ? filtered : null
      }
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async globalIndex(code = ''): Promise<GlobalIndex[] | null> {
    try {
      const keys = globalIndexKeys(code)
      const results: GlobalIndex[] = []
      for (const key of keys) {
        const meta = YFINANCE_GLOBAL_INDEX_MAP[key]
        if (!meta) continue
        const json = await this.client.fetchChart(meta.yahoo, '1d', '1d')
        const row = mapYfinanceGlobalIndex(json, key, meta)
        if (row) results.push(row)
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }
}
