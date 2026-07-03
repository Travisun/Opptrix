import { Capability } from '../../../../core/capabilities.js'
import { usEquityBindings } from '../../../../core/bindings.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { TiingoClient, testTiingoConnection } from '../../api/client.js'
import {
  mapTiingoDailyPrices,
  mapTiingoIex,
  mapTiingoProfile,
  mapTiingoSearchResults,
} from '../../normalize/index.js'
import { isTiingoEnabled } from '../../config.js'
import { normalizeUsSymbol, usDateDaysAgo, usTodayString } from '../../../../utils/us-market.js'

const DEFAULT_PRIORITY = 55

/** Tiingo — US equities secondary provider (API Token required) */

export class TiingoMarketHandler extends MarketHandlerShell {
  private client(): TiingoClient | null {
    if (!isTiingoEnabled()) return null
    return TiingoClient.fromConfig()
  }



  async realtime(symbol: string) {
    const sym = normalizeUsSymbol(symbol)
    const client = this.client()
    if (!client) return null
    try {
      const json = await client.iexRealtime(sym)
      let nameHint = sym
      try {
        const meta = await client.dailyMeta(sym) as Record<string, unknown>
        nameHint = String(meta.name ?? sym)
      } catch { /* optional */ }
      const row = mapTiingoIex(sym, json, nameHint)
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
      const json = await client.dailyPrices(sym, from, to)
      const results = Array.isArray(json) ? json : []
      const rows = mapTiingoDailyPrices(sym, results)
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
      const json = await client.dailyMeta(sym) as Record<string, unknown>
      const row = mapTiingoProfile(sym, json)
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
        const json = await client.dailyMeta(sym) as Record<string, unknown>
        const row = mapTiingoProfile(sym, json)
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
      const rows = mapTiingoSearchResults(results)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }
}


