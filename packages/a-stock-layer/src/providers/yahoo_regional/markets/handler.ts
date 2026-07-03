import type { StockKline, StockRealtime } from '@opptrix/shared'
import { MarketHandlerShell } from '../../common/driver-factory.js'
import type { RegionalEquityMarket } from '../../../utils/regional-symbol.js'
import { normalizeRegionalSymbol, toYahooFinanceSymbol } from '../../../utils/regional-symbol.js'
import { fetchRegionalStockListFromYahoo, regionalSeedStockList } from '../../../utils/regional-stock-list.js'
import { fetchYahooChart, parseYahooKlines, parseYahooRealtime } from '../../../utils/yahoo-chart.js'

export class YahooRegionalMarketHandler extends MarketHandlerShell {
  constructor(readonly regionalMarket: RegionalEquityMarket) {
    super()
  }

  private displayCode(symbol: string): string {
    return normalizeRegionalSymbol(this.regionalMarket, symbol)
  }

  private yahooSymbol(symbol: string): string {
    return toYahooFinanceSymbol(this.regionalMarket, symbol)
  }

  async realtime(symbol: string) {
    try {
      const json = await fetchYahooChart(this.yahooSymbol(symbol), '1d', '1d')
      return parseYahooRealtime(json as Record<string, unknown>, this.displayCode(symbol))
    } catch {
      return null
    }
  }

  async batchRealtime(symbols: string[]) {
    const rows: StockRealtime[] = []
    for (const s of symbols) {
      const part = await this.realtime(s)
      if (part?.[0]) rows.push(part[0])
    }
    return rows.length ? rows : null
  }

  async kline(symbol: string, period = 'daily', _start = '', _end = '', count?: number) {
    if (period !== 'daily' && period !== '1d') return null
    const range = (count ?? 180) <= 90 ? '3mo' : (count ?? 180) <= 180 ? '6mo' : '1y'
    try {
      const json = await fetchYahooChart(this.yahooSymbol(symbol), range, '1d')
      return parseYahooKlines(json as Record<string, unknown>, this.displayCode(symbol), count)
    } catch {
      return null
    }
  }

  async stockList(_market?: string, keyword = '') {
    try {
      const rows = await fetchRegionalStockListFromYahoo(this.regionalMarket, { keyword })
      return rows.length ? rows : null
    } catch {
      const fallback = regionalSeedStockList(this.regionalMarket)
      if (!keyword.trim()) return fallback.length ? fallback : null
      const kw = keyword.trim().toUpperCase()
      const filtered = fallback.filter(row =>
        row.code.toUpperCase().includes(kw)
        || row.name.toUpperCase().includes(kw)
        || row.industry.toUpperCase().includes(kw),
      )
      return filtered.length ? filtered : null
    }
  }
}
