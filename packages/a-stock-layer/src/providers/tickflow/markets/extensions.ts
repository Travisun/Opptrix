import type { TickflowClient } from '../api/client.js'
import { mapTickflowDepth, type TickflowMarketDepth } from '../normalize/index.js'
import { isTickflowFeatureAllowed } from '../api/permissions.js'
import type { TickflowMarketHandler } from './handler.js'

type TickflowHandler = TickflowMarketHandler & {
  client(): TickflowClient | null
  tickflowSymbol(code: string): string
  tfDepthBatch?(codes: string[]): Promise<Record<string, unknown>[] | null>
  tfListUniverses?(): Promise<Record<string, unknown>[] | null>
  tfUniverseBatch?(ids: string[]): Promise<Record<string, unknown>[] | null>
  tfExFactors?(code: string, startMs?: number, endMs?: number): Promise<Record<string, unknown>[] | null>
  tfIntradayBatch?(codes: string[], period?: '1m' | '5m' | '15m' | '30m' | '60m'): Promise<Record<string, unknown>[] | null>
}

/**
 * 向 Tickflow 驱动混入 OpenAPI 扩展方法（未映射标准 Capability 的端点）。
 */
export function mixTickflowExtensions(Driver: { prototype: TickflowMarketHandler }) {
  const p = Driver.prototype as TickflowHandler

  /**
   * 批量五档盘口 — `GET /v1/depth/batch`。
   *
   * @param codes 股票代码数组
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
   * 批量标的池详情 — `POST /v1/universes/batch`。
   *
   * @param ids 标的池 ID 列表
   */
  p.tfUniverseBatch = async function tfUniverseBatch(
    ids: string[],
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client || !ids.length) return null
    try {
      const json = await client.postUniversesBatch({ ids })
      const rows = json.data
      if (!Array.isArray(rows) || !rows.length) return null
      return rows as Record<string, unknown>[]
    } catch {
      return null
    }
  }

  /**
   * 除权因子 — `GET /v1/klines/ex-factors`。
   *
   * @param code 6 位股票代码
   * @param startMs 起始时间戳（毫秒），可选
   * @param endMs 结束时间戳（毫秒），可选
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
   * 批量当日分钟 K — `GET /v1/klines/intraday/batch`。
   *
   * @param codes 股票代码数组
   * @param period 分钟周期，默认 `1m`
   */
  p.tfIntradayBatch = async function tfIntradayBatch(
    codes: string[],
    period: '1m' | '5m' | '15m' | '30m' | '60m' = '1m',
  ): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('intraday')) return null
    const client = this.client()
    if (!client || !codes.length) return null
    const symbols = codes.map(c => this.tickflowSymbol(c)).join(',')
    try {
      const json = await client.getKlinesIntradayBatch({ symbols, period })
      const data = json.data
      if (!data || typeof data !== 'object') return null
      const out: Record<string, unknown>[] = []
      for (const [sym, payload] of Object.entries(data as Record<string, unknown>)) {
        out.push({ symbol: sym, data: payload })
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }
}
