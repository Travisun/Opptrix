import type { StockListItem, StockRealtime } from '@opptrix/shared'
import { mapOkxCandles, mapOkxTicker } from '../../../../crypto/normalize.js'
import { parseCryptoPair, type CryptoPairRef } from '../../../../utils/crypto-market.js'
import {
  CRYPTO_LIST_QUOTES,
  matchesCryptoKeyword,
  resolveCryptoKlineInterval,
} from '../../../../utils/crypto-kline.js'
import { okxClient } from '../../api/http-client.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'

const BASE = 'https://www.okx.com'

/** OKX SPOT public API — fallback for Binance */

export class OkxMarketHandler extends MarketHandlerShell {
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

  private async fetchSpotTickers(): Promise<Record<string, unknown>[]> {
    const json = await okxClient.get(`${BASE}/api/v5/market/tickers`, { instType: 'SPOT' }, {
      timeoutMs: 20000,
      extraHeaders: { Accept: 'application/json' },
    })
    return ((json.data as unknown[]) ?? []) as Record<string, unknown>[]
  }

  async realtime(symbol: string) {
    try {
      const pair = this.pair(symbol)
      const json = await okxClient.get(`${BASE}/api/v5/market/ticker`, { instId: pair.okxInstId }, {
        extraHeaders: { Accept: 'application/json' },
      })
      const data = ((json.data as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
      if (!data) return null
      return [mapOkxTicker(pair, data)] as StockRealtime[]
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

      const idSet = new Set(pairs.map(p => p.okxInstId))
      const rows = await this.fetchSpotTickers()
      const out: StockRealtime[] = []
      for (const row of rows) {
        const instId = String(row.instId ?? '')
        if (!idSet.has(instId)) continue
        const pair = pairs.find(p => p.okxInstId === instId)
        if (pair) out.push(mapOkxTicker(pair, row))
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
      const limit = Math.min(Math.max(count ?? 100, 1), 300)
      const json = await okxClient.get(`${BASE}/api/v5/market/candles`, {
        instId: pair.okxInstId,
        bar: interval.okx,
        limit: String(limit),
      }, { extraHeaders: { Accept: 'application/json' } })
      const rows = (json.data as unknown[]) ?? []
      const kl = mapOkxCandles(pair, rows, interval.intraday)
      return kl.length ? kl : null
    } catch {
      return null
    }
  }

  /** Popular USDT / USDC / BTC quoted SPOT pairs */
  async stockList(_market = 'CRYPTO', keyword = '') {
    try {
      const rows = await this.fetchSpotTickers()
      const seen = new Set<string>()
      const items: StockListItem[] = []
      for (const { quote, limit } of CRYPTO_LIST_QUOTES) {
        const sorted = rows
          .filter(r => {
            const instId = String(r.instId ?? '')
            return instId.endsWith(`-${quote}`)
          })
          .sort((a, b) => Number(b.volCcy24h ?? 0) - Number(a.volCcy24h ?? 0))
          .slice(0, limit)
        for (const r of sorted) {
          const instId = String(r.instId ?? '')
          const dash = instId.lastIndexOf('-')
          if (dash <= 0) continue
          const base = instId.slice(0, dash)
          const q = instId.slice(dash + 1)
          if (!base || base.length < 2 || q !== quote) continue
          const code = `${base}/${q}`
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
