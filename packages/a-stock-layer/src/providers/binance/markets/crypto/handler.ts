import type { StockKline, StockListItem, StockRealtime } from '@opptrix/shared'
import { mapBinanceKlines, mapBinanceTicker } from '../../../../crypto/normalize.js'
import { parseCryptoPair, type CryptoPairRef } from '../../../../utils/crypto-market.js'
import {
  CRYPTO_LIST_QUOTES,
  matchesCryptoKeyword,
  resolveCryptoKlineInterval,
} from '../../../../utils/crypto-kline.js'
import { binanceClient } from '../../api/http-client.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'

const BASE = 'https://api.binance.com'

/** Binance SPOT public API — no API key for market data */

export class BinanceMarketHandler extends MarketHandlerShell {
  private pair(symbol: string): CryptoPairRef {
    const p = parseCryptoPair(symbol)
    if (!p) throw new Error(`Invalid crypto pair: ${symbol}`)
    return p
  }

  private tryPair(symbol: string): CryptoPairRef | null {
    try {
      return this.pair(symbol)
    } catch {
      return null
    }
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
    if (!symbols.length) return null
    try {
      const pairs = symbols
        .map(s => this.tryPair(s))
        .filter((p): p is CryptoPairRef => p != null)
      if (!pairs.length) return null

      const symSet = new Set(pairs.map(p => p.binanceSymbol))
      const rows = await binanceClient.get(`${BASE}/api/v3/ticker/24hr`, {}, {
        timeoutMs: 20000,
        extraHeaders: { Accept: 'application/json' },
      })
      const out: StockRealtime[] = []
      if (Array.isArray(rows)) {
        for (const row of rows as Record<string, unknown>[]) {
          const sym = String(row.symbol ?? '')
          if (!symSet.has(sym)) continue
          const pair = pairs.find(p => p.binanceSymbol === sym)
          if (pair) out.push(mapBinanceTicker(pair, row))
        }
      }
      for (const pair of pairs) {
        if (out.some(q => q.code === pair.pair)) continue
        const part = await this.realtime(pair.pair)
        if (part?.[0]) out.push(part[0])
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  async kline(symbol: string, period = 'daily', _start = '', _end = '', count?: number) {
    const interval = resolveCryptoKlineInterval(period)
    if (!interval) return null
    try {
      const pair = this.pair(symbol)
      const limit = Math.min(Math.max(count ?? 100, 1), 1000)
      const rows = await binanceClient.get(`${BASE}/api/v3/klines`, {
        symbol: pair.binanceSymbol,
        interval: interval.binance,
        limit: String(limit),
      }, { extraHeaders: { Accept: 'application/json' } })
      const kl = mapBinanceKlines(pair, rows as unknown as unknown[], interval.intraday)
      return kl.length ? kl : null
    } catch {
      return null
    }
  }

  /** Popular USDT / USDC / BTC quoted SPOT pairs */
  async stockList(_market = 'CRYPTO', keyword = '') {
    try {
      const rows = await binanceClient.get(`${BASE}/api/v3/ticker/24hr`, {}, {
        timeoutMs: 20000,
        extraHeaders: { Accept: 'application/json' },
      })
      if (!Array.isArray(rows)) return null
      const all = rows as Record<string, unknown>[]
      const seen = new Set<string>()
      const items: StockListItem[] = []
      for (const { quote, limit } of CRYPTO_LIST_QUOTES) {
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
          if (!matchesCryptoKeyword(code, base, keyword)) continue
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
