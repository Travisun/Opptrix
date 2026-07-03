import { Capability } from '../../../../core/capabilities.js'
import { usEquityBindings } from '../../../../core/bindings.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { FmpClient, testFmpConnection } from '../../api/client.js'
import {
  mapFmpFinancials,
  mapFmpHistorical,
  mapFmpProfile,
  mapFmpQuote,
  mapFmpSearchResults,
} from '../../normalize/index.js'
import { isFmpEnabled } from '../../config.js'
import { normalizeUsSymbol, usDateDaysAgo, usTodayString } from '../../../../utils/us-market.js'

const DEFAULT_PRIORITY = 50

/** Financial Modeling Prep — US equities tertiary provider (API Key required) */

export class FmpMarketHandler extends MarketHandlerShell {
  private client(): FmpClient | null {
    if (!isFmpEnabled()) return null
    return FmpClient.fromConfig()
  }



  async realtime(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    const client = this.client()
    if (!client) return null
    try {
      const json = await client.quote(sym)
      const row = mapFmpQuote(sym, json)
      return row ? [row] : null
    } catch {
      return null
    }
  }

  async batchRealtime(symbols: string[]) {
    const rows = []
    for (const s of symbols) {
      const part = await this.realtime(s)
      if (part?.[0]) rows.push(part[0])
    }
    return rows.length ? rows : null
  }

  async kline(symbol: string, period = 'daily', start = '', end = '', count?: number) {
    if (period !== 'daily' && period !== '1d') return null
    const sym = normalizeUsSymbol(symbol)
    const client = this.client()
    if (!client) return null
    const to = end || usTodayString()
    const from = start || usDateDaysAgo(count ?? 180)
    try {
      const json = await client.historicalDaily(sym, from, to) as Record<string, unknown>
      const rows = mapFmpHistorical(sym, json)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async profile(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    const client = this.client()
    if (!client) return null
    try {
      const json = await client.profile(sym)
      const row = mapFmpProfile(sym, json)
      return row ? [row] : null
    } catch {
      return null
    }
  }

  async stockList(_market = 'US', keyword = '') {
    const client = this.client()
    if (!client) return null
    try {
      if (keyword.trim()) {
        const sym = normalizeUsSymbol(keyword)
        const json = await client.profile(sym)
        const row = mapFmpProfile(sym, json)
        if (row) {
          return [{
            code: row.code as string,
            name: row.name as string,
            market: 'US',
            industry: (row.industry as string) ?? '',
          }]
        }
      }
      const json = await client.search(keyword.trim() || 'A')
      const results = Array.isArray(json) ? json : []
      const rows = mapFmpSearchResults(results)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async financials(symbol: string, _reportDate = '', reportType = 'annual') {
    const sym = normalizeUsSymbol(symbol)
    const client = this.client()
    if (!client) return null
    const quarterly = reportType === 'quarter' || reportType === 'quarterly'
    try {
      const json = await client.incomeStatement(sym, '12', quarterly)
      const results = Array.isArray(json) ? json : []
      const rows = mapFmpFinancials(sym, results, quarterly ? 'quarter' : 'annual')
      return rows.length ? rows : null
    } catch {
      return null
    }
  }
}


