import type { StockKline, StockRealtime } from '@opptrix/shared'
import { Capability } from '../../../../core/capabilities.js'
import { cryptoSpotBindings } from '../../../../core/bindings.js'
import { mapBinanceKlines, mapBinanceTicker } from '../../normalize/index.js'
import { parseCryptoPair } from '../../../../utils/crypto-market.js'
import { binanceClient } from '../../api/http-client.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'

const BASE = 'https://api.binance.com'

/** Binance SPOT public API — no API key for market data */

export class BinanceMarketHandler extends MarketHandlerShell {
  private pair(symbol: string) {
    const p = parseCryptoPair(symbol)
    if (!p) throw new Error(`Invalid crypto pair: ${symbol}`)
    return p
  }

  async realtime(symbol: string) {
    try {
      const pair = this.pair(symbol)
      const row = await binanceClient.get(`${BASE}/api/v3/ticker/24hr`, { symbol: pair.binanceSymbol }, {
        extraHeaders: { Accept: 'application/json' },
      })
      return [mapBinanceTicker(pair, row as Record<string, unknown>)] as StockRealtime[]
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
    try {
      const pair = this.pair(symbol)
      const limit = Math.min(Math.max(count ?? 100, 1), 1000)
      const rows = await binanceClient.get(`${BASE}/api/v3/klines`, {
        symbol: pair.binanceSymbol,
        interval: '1d',
        limit: String(limit),
      }, { extraHeaders: { Accept: 'application/json' } })
      const kl = mapBinanceKlines(pair, rows as unknown as unknown[])
      return kl.length ? kl : null
    } catch {
      return null
    }
  }

  /** Popular USDT / USDC / BTC quoted SPOT pairs */
  async stockList(_market = 'CRYPTO', _keyword = '') {
    try {
      const rows = await binanceClient.get(`${BASE}/api/v3/ticker/24hr`, {}, {
        timeoutMs: 20000,
        extraHeaders: { Accept: 'application/json' },
      })
      if (!Array.isArray(rows)) return null
      const all = rows as Record<string, unknown>[]
      const specs: { quote: string; limit: number }[] = [
        { quote: 'USDT', limit: 400 },
        { quote: 'USDC', limit: 150 },
        { quote: 'BTC', limit: 80 },
      ]
      const seen = new Set<string>()
      const items: { code: string; name: string; market: string; industry: string }[] = []
      for (const { quote, limit } of specs) {
        const sorted = all
          .filter(r => String(r.symbol ?? '').endsWith(quote))
          .sort((a, b) => Number(b.quoteVolume ?? 0) - Number(a.quoteVolume ?? 0))
          .slice(0, limit)
        for (const r of sorted) {
          const sym = String(r.symbol ?? '')
          const base = sym.slice(0, -quote.length)
          if (!base || base.length < 2) continue
          const code = `${base}/${quote}`
          if (seen.has(code)) continue
          seen.add(code)
          items.push({
            code,
            name: code,
            market: 'CRYPTO',
            industry: 'SPOT',
          })
        }
      }
      return items.length ? items : null
    } catch {
      return null
    }
  }

}
