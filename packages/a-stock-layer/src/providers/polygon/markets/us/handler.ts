import { Capability } from '../../../../core/capabilities.js'
import { usEquityBindings } from '../../../../core/bindings.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { PolygonClient, testPolygonConnection } from '../../api/client.js'
import {
  mapPolygonAggregates,
  mapPolygonFinancials,
  mapPolygonProfile,
  mapPolygonSnapshot,
  mapPolygonTickerList,
} from '../../normalize/index.js'
import { isPolygonEnabled } from '../../config.js'
import { normalizeUsSymbol, usDateDaysAgo, usTodayString } from '../../../../utils/us-market.js'

const DEFAULT_PRIORITY = 100

/** Polygon.io — US equities primary provider (API Key required) */

export class PolygonMarketHandler extends MarketHandlerShell {
  private client(): PolygonClient | null {
    if (!isPolygonEnabled()) return null
    return PolygonClient.fromConfig()
  }



  async realtime(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    const client = this.client()
    if (!client) return null
    try {
      const json = await client.tickerSnapshot(sym)
      const row = mapPolygonSnapshot(sym, json)
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
      const json = await client.aggregates(sym, from, to, String(Math.min(count ?? 500, 5000)))
      const results = (json.results ?? []) as unknown[]
      const rows = mapPolygonAggregates(sym, results)
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
      const json = await client.tickerDetails(sym)
      const row = mapPolygonProfile(sym, json)
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
        const json = await client.tickerDetails(sym)
        const row = mapPolygonProfile(sym, json)
        if (row) {
          return [{
            code: row.code,
            name: row.name,
            market: 'US',
            industry: row.sector ?? row.industry ?? '',
          }]
        }
      }
      const json = await client.listTickers(undefined, '1000')
      const results = (json.results ?? []) as unknown[]
      const rows = mapPolygonTickerList(results)
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
      const json = await client.financials(sym, '12', quarterly ? 'quarterly' : 'annual')
      const results = (json.results ?? []) as unknown[]
      const rows = mapPolygonFinancials(sym, results, quarterly ? 'quarter' : 'annual')
      return rows.length ? rows : null
    } catch {
      return null
    }
  }
}


