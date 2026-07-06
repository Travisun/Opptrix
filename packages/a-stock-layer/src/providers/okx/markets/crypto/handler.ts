import type { StockKline, StockRealtime } from '@opptrix/shared'
import { Capability } from '../../../../core/capabilities.js'
import { cryptoSpotBindings } from '../../../../core/bindings.js'
import { mapOkxCandles, mapOkxTicker } from '../../normalize/index.js'
import { parseCryptoPair } from '../../../../utils/crypto-market.js'
import { okxClient } from '../../api/http-client.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'

const BASE = 'https://www.okx.com'

/** OKX SPOT public API — fallback for Binance */

export class OkxMarketHandler extends MarketHandlerShell {
  private pair(symbol: string) {
    const p = parseCryptoPair(symbol)
    if (!p) throw new Error(`Invalid crypto pair: ${symbol}`)
    return p
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

  async kline(symbol: string, period = 'daily', _start = '', _end = '', count?: number) {
    if (period !== 'daily' && period !== '1d') return null
    try {
      const pair = this.pair(symbol)
      const limit = Math.min(Math.max(count ?? 100, 1), 300)
      const json = await okxClient.get(`${BASE}/api/v5/market/candles`, {
        instId: pair.okxInstId,
        bar: '1D',
        limit: String(limit),
      }, { extraHeaders: { Accept: 'application/json' } })
      const rows = (json.data as unknown[]) ?? []
      const kl = mapOkxCandles(pair, rows)
      return kl.length ? kl : null
    } catch {
      return null
    }
  }

}
