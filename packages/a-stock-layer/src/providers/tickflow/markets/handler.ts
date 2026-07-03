import type { StockKline, StockRealtime } from '@opptrix/shared'
import type { IndexKline } from '../../../core/schema.js'
import type { CompactKlineData } from '../api/client.js'
import { TickflowClient, type TickflowAdjustType, type TickflowPeriod } from '../api/client.js'
import { tickflowRegion } from '../api/symbols.js'
import { isTickflowEnabled } from '../config.js'
import {
  expandCompactKlines,
  mapTickflowQuotes,
  opptrixPeriodToTickflow,
  ymdToMs,
} from '../normalize/index.js'
import { TickflowCommonHandler } from './common.js'

function normalizeYmd(input: string): string {
  const raw = input.trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  return raw.slice(0, 10)
}

/** TickFlow — CN / US / HK equities & indices (API Key required) */

export class TickflowMarketHandler extends TickflowCommonHandler {
  protected client(): TickflowClient | null {
    if (!isTickflowEnabled()) return null
    return TickflowClient.fromConfig()
  }

  private cnAdjust(symbol: string): TickflowAdjustType | undefined {
    return tickflowRegion(symbol) === 'CN' ? 'forward_additive' : undefined
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getQuotes({ symbols: symbol })
      const rows = mapTickflowQuotes(json.data)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    const client = this.client()
    if (!client || !codes.length) return null
    const symbols = codes.map(c => this.tickflowSymbol(c))
    try {
      const json = await client.postQuotes({ symbols })
      const rows = mapTickflowQuotes(json.data)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<StockKline[] | null> {
    const tfPeriod = opptrixPeriodToTickflow(period) as TickflowPeriod | null
    if (!tfPeriod) return null

    const client = this.client()
    if (!client) return null

    const symbol = this.tickflowSymbol(code)
    const region = tickflowRegion(symbol)
    if (!region) return null

    const query = {
      symbol,
      period: tfPeriod,
      adjust: this.cnAdjust(symbol),
      count: undefined as number | undefined,
      start_time: undefined as number | undefined,
      end_time: undefined as number | undefined,
    }
    if (count != null && count > 0) query.count = Math.min(count, 10000)
    const startYmd = normalizeYmd(start)
    const endYmd = normalizeYmd(end)
    if (startYmd) query.start_time = ymdToMs(startYmd)
    if (endYmd) query.end_time = ymdToMs(endYmd, true)
    if (!startYmd && !endYmd && count) query.count = Math.min(count, 10000)

    try {
      const json = await client.getKlines(query)
      const data = json.data as CompactKlineData | undefined
      if (!data) return null
      let rows = expandCompactKlines(symbol, data, tfPeriod, region)
      if (count && rows.length > count) rows = rows.slice(-count)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async indexRealtime(code: string) {
    const batch = await this.realtime(code)
    if (!batch) return null
    return batch.map(x => ({
      code: x.code,
      name: x.name,
      price: x.price,
      changePct: x.changePct,
      open: x.open,
      high: x.high,
      low: x.low,
      preClose: x.preClose,
      volume: x.volume,
      amount: x.amount,
      timestamp: x.timestamp,
    }))
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<IndexKline[] | null> {
    const rows = await this.kline(code, period, start, end, count)
    if (!rows) return null
    return rows.map(r => ({
      code: r.code,
      date: r.date,
      open: r.open,
      close: r.close,
      high: r.high,
      low: r.low,
      volume: r.volume,
      amount: r.amount,
      changePct: r.changePct,
    }))
  }
}
