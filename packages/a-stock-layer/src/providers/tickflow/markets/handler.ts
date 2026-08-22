import type { StockKline, StockRealtime } from '@opptrix/shared'
import type { IndexKline } from '../../../core/schema.js'
import { isCnEtfCode } from '../../../core/instrument.js'
import { mapKlinesToEtfNavRows } from '../../common/etf.js'
import { isTickflowEnabled } from '../config.js'
import { mapTickflowQuotes, resolveTickflowKlineQuery } from '../normalize/index.js'
import { TickflowClient } from '../api/client.js'
import { TickflowCommonHandler } from './common.js'

/** GET /v1/quotes 批量 URL 长度友好上限（超出用 POST /v1/quotes） */
const QUOTES_GET_MAX_SYMBOLS = 12

/** TickFlow — CN / US / HK equities & indices (API Key required) */

export class TickflowMarketHandler extends TickflowCommonHandler {
  protected client(): TickflowClient | null {
    if (!isTickflowEnabled()) return null
    return TickflowClient.fromConfig()
  }

  /** 实时行情 — `GET /v1/quotes`（单标的或少量逗号分隔 symbols） */
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

  /** 批量实时行情 — `GET /v1/quotes` 或 `POST /v1/quotes`（大批量） */
  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    const client = this.client()
    if (!client || !codes.length) return null
    const symbols = codes.map(c => this.tickflowSymbol(c))
    try {
      const json = symbols.length <= QUOTES_GET_MAX_SYMBOLS
        ? await client.getQuotes({ symbols: symbols.join(',') })
        : await client.postQuotes({ symbols })
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
    const resolved = resolveTickflowKlineQuery(period, count)
    if (!resolved) return null
    return this.fetchKlinesResolved(code, resolved, start, end, count)
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

  /** ETF 净值 — 免费日 K 收盘价近似（无 IOPV 字段时的回退） */
  async etfNav(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const rows = await this.kline(etfCode, 'daily', '', '', 30)
    if (!rows?.length) return null
    const mapped = mapKlinesToEtfNavRows(etfCode, rows)
    return mapped.length ? mapped : null
  }
}
