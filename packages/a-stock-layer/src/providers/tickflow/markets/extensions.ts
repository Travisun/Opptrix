import type { TickflowClient, TickflowPeriod } from '../api/client.js'
import type { CompactKlineData } from '../api/client.js'
import {
  expandCompactKlines,
  mapTickflowDepth,
  mapTickflowQuotes,
  type TickflowMarketDepth,
} from '../normalize/index.js'
import { tickflowRegion } from '../api/symbols.js'
import { isTickflowFeatureAllowed } from '../api/permissions.js'
import type { TickflowMarketHandler } from './handler.js'

type TickflowHandler = TickflowMarketHandler & {
  client(): TickflowClient | null
  tickflowSymbol(code: string): string
  tfDepthBatch?(codes: string[]): Promise<Record<string, unknown>[] | null>
  tfListUniverses?(): Promise<Record<string, unknown>[] | null>
  tfGetUniverse?(id: string): Promise<Record<string, unknown> | null>
  tfUniverseBatch?(ids: string[]): Promise<Record<string, unknown>[] | null>
  tfExFactors?(code: string, startMs?: number, endMs?: number): Promise<Record<string, unknown>[] | null>
  tfKlinesBatch?(
    codes: string[],
    period?: TickflowPeriod,
    count?: number,
  ): Promise<Record<string, unknown>[] | null>
  tfQuotesUniverses?(universeIds: string[]): Promise<Record<string, unknown>[] | null>
  tfKlinesIntraday?(code: string, period?: TickflowPeriod, count?: number): Promise<Record<string, unknown> | null>
  tfIntradayBatch?(codes: string[], period?: '1m' | '5m' | '15m' | '30m' | '60m'): Promise<Record<string, unknown>[] | null>
}

/**
 * 向 Tickflow 驱动混入 OpenAPI 扩展方法（未映射标准 Capability 的端点）。
 */
export function mixTickflowExtensions(Driver: { prototype: TickflowMarketHandler }) {
  const p = Driver.prototype as TickflowHandler

  /**
   * 批量五档盘口 — `GET /v1/depth/batch`。
   */
  p.tfDepthBatch = async function tfDepthBatch(
    codes: string[],
  ): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('depth')) return null
    const client = this.client()
    if (!client || !codes.length) return null
    const symbols = codes.map(c => this.tickflowSymbol(c)).join(',')
    try {
      const json = await client.getDepthBatch(symbols)
      const rows = (json.data ?? []) as TickflowMarketDepth[]
      const mapped = rows.map(mapTickflowDepth)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 标的池列表 — `GET /v1/universes`。
   */
  p.tfListUniverses = async function tfListUniverses(): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const json = await client.getUniverses()
      const rows = json.data
      if (!Array.isArray(rows) || !rows.length) return null
      return rows as Record<string, unknown>[]
    } catch {
      return null
    }
  }

  /**
   * 单个标的池详情 — `GET /v1/universes/{id}`。
   */
  p.tfGetUniverse = async function tfGetUniverse(id: string): Promise<Record<string, unknown> | null> {
    const client = this.client()
    if (!client || !id.trim()) return null
    try {
      const json = await client.getUniverse(id.trim())
      const data = json.data
      if (!data || typeof data !== 'object') return null
      return data as Record<string, unknown>
    } catch {
      return null
    }
  }

  /**
   * 批量标的池详情 — `POST /v1/universes/batch`。
   */
  p.tfUniverseBatch = async function tfUniverseBatch(
    ids: string[],
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client || !ids.length) return null
    try {
      const json = await client.postUniversesBatch({ ids })
      const rows = json.data
      if (!Array.isArray(rows) && rows && typeof rows === 'object') {
        return Object.values(rows as Record<string, Record<string, unknown>>)
      }
      if (!Array.isArray(rows) || !rows.length) return null
      return rows as Record<string, unknown>[]
    } catch {
      return null
    }
  }

  /**
   * 除权因子 — `GET /v1/klines/ex-factors`。
   */
  p.tfExFactors = async function tfExFactors(
    code: string,
    startMs?: number,
    endMs?: number,
  ): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('ex_factors')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getKlinesExFactors({
        symbols: symbol,
        start_time: startMs ?? null,
        end_time: endMs ?? null,
      })
      const data = json.data as Record<string, unknown> | undefined
      if (!data) return null
      const direct = data[symbol] ?? data[symbol.toUpperCase()]
      if (Array.isArray(direct)) return direct as Record<string, unknown>[]
      return [data]
    } catch {
      return null
    }
  }

  /**
   * 批量历史 K 线 — `GET /v1/klines/batch`。
   */
  p.tfKlinesBatch = async function tfKlinesBatch(
    codes: string[],
    period: TickflowPeriod = '1d',
    count = 120,
  ): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('kline_batch')) return null
    const client = this.client()
    if (!client || !codes.length) return null
    const symbols = codes.map(c => this.tickflowSymbol(c)).join(',')
    try {
      const json = await client.getKlinesBatch({
        symbols,
        period,
        count: Math.min(Math.max(count, 1), 10000),
      })
      const data = json.data as Record<string, CompactKlineData> | undefined
      if (!data || typeof data !== 'object') return null
      const out: Record<string, unknown>[] = []
      for (const [sym, payload] of Object.entries(data)) {
        const region = tickflowRegion(sym)
        if (!region || !payload) continue
        const bars = expandCompactKlines(sym, payload, period, region)
        out.push({ symbol: sym, period, bars })
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  /**
   * 标的池实时行情 — `GET /v1/quotes`（universes 参数）。
   */
  p.tfQuotesUniverses = async function tfQuotesUniverses(
    universeIds: string[],
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client || !universeIds.length) return null
    const universes = universeIds.map(id => id.trim()).filter(Boolean).join(',')
    if (!universes) return null
    try {
      const json = await client.getQuotes({ universes })
      const rows = mapTickflowQuotes(json.data)
      return rows.length ? rows as unknown as Record<string, unknown>[] : null
    } catch {
      return null
    }
  }

  /**
   * 单标的当日分钟 K — `GET /v1/klines/intraday`。
   */
  p.tfKlinesIntraday = async function tfKlinesIntraday(
    code: string,
    period: TickflowPeriod = '1m',
    count?: number,
  ): Promise<Record<string, unknown> | null> {
    if (!isTickflowFeatureAllowed('intraday')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    const region = tickflowRegion(symbol)
    if (!region) return null
    try {
      const json = await client.getKlinesIntraday({
        symbol,
        period,
        count: count != null && count > 0 ? count : undefined,
      })
      const data = json.data as CompactKlineData | undefined
      if (!data) return null
      const bars = expandCompactKlines(symbol, data, period, region)
      return { symbol, period, bars }
    } catch {
      return null
    }
  }

  /**
   * 批量当日分钟 K — `GET /v1/klines/intraday/batch`。
   */
  p.tfIntradayBatch = async function tfIntradayBatch(
    codes: string[],
    period: '1m' | '5m' | '15m' | '30m' | '60m' = '1m',
  ): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('intraday_batch')) return null
    const client = this.client()
    if (!client || !codes.length) return null
    const symbols = codes.map(c => this.tickflowSymbol(c)).join(',')
    try {
      const json = await client.getKlinesIntradayBatch({ symbols, period })
      const data = json.data
      if (!data || typeof data !== 'object') return null
      const out: Record<string, unknown>[] = []
      for (const [sym, payload] of Object.entries(data as Record<string, unknown>)) {
        out.push({ symbol: sym, period, data: payload })
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }
}
