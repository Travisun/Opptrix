import type { StockKline, StockRealtime } from '@opptrix/shared'
import type { IndexKline } from '../../../core/schema.js'
import { isCnEtfCode } from '../../../core/instrument.js'
import { mapKlinesToEtfNavRows } from '../../common/etf.js'
import { isTickflowEnabled, isTickflowFreeTier } from '../config.js'
import {
  isIntradayTickflowPeriod,
  mapTickflowQuotes,
  resolveTickflowKlineQuery,
} from '../normalize/index.js'
import { TickflowClient } from '../api/client.js'
import { TickflowCommonHandler } from './common.js'

/** GET /v1/quotes 批量 URL 长度友好上限（超出用 POST /v1/quotes） */
const QUOTES_GET_MAX_SYMBOLS = 12

/** TickFlow — CN / US / HK equities & indices（无 Key 走公开免费日K；有 Key 走付费端） */

export class TickflowMarketHandler extends TickflowCommonHandler {
  /** 标的名称缓存（免费档日 K 合成行情用） */
  private readonly instrumentNameCache = new Map<string, string>()

  protected client(): TickflowClient | null {
    if (!isTickflowEnabled()) return null
    return TickflowClient.fromConfig()
  }

  /** 优先缓存 / profile / instruments 名称，避免日 K 合成行情用代码当名称 */
  private async resolveInstrumentName(code: string): Promise<string> {
    const symbol = this.tickflowSymbol(code)
    const cached = this.instrumentNameCache.get(symbol)
    if (cached) return cached

    try {
      const profiles = await this.profile(code)
      const name = profiles?.[0]?.name?.trim()
      if (name && name !== code && name !== symbol) {
        this.instrumentNameCache.set(symbol, name)
        return name
      }
    } catch {
      // profile 失败时继续尝试 instruments
    }

    const client = this.client()
    if (!client) return code
    try {
      const json = await client.getInstruments({ symbols: symbol })
      const rows = (json.data ?? []) as Array<{ name?: string; symbol?: string }>
      const hit = rows.find(r => String(r.symbol ?? '').toUpperCase() === symbol.toUpperCase())
        ?? rows[0]
      const name = String(hit?.name ?? '').trim()
      if (name) {
        this.instrumentNameCache.set(symbol, name)
        return name
      }
    } catch {
      // ignore
    }
    return code
  }

  /** 免费档：用最近日 K 合成「最新价」（非实时） */
  private async realtimeFromDailyKline(code: string): Promise<StockRealtime[] | null> {
    const [rows, name] = await Promise.all([
      this.fetchKlinesResolved(
        code,
        { tfPeriod: '1d', count: 2 },
        '',
        '',
        2,
      ),
      this.resolveInstrumentName(code),
    ])
    if (!rows?.length) return null
    const last = rows[rows.length - 1]
    const prev = rows.length >= 2 ? rows[rows.length - 2] : null
    const price = last.close
    const preClose = prev?.close ?? last.open
    let changePct: number | null = last.changePct
    if (changePct == null && preClose != null && preClose !== 0) {
      changePct = ((price - preClose) / preClose) * 100
    }
    const change = preClose != null ? price - preClose : null
    const synthesized: StockRealtime = {
      code: last.code || code,
      name,
      price,
      changePct,
      pe: null,
      pb: null,
      turnoverRate: last.turnoverRate,
      open: last.open,
      high: last.high,
      low: last.low,
      preClose,
      volume: last.volume,
      amount: last.amount,
      change,
      amplitude: null,
      timestamp: last.date,
      quoteSession: 'closed',
      sessionLabel: '收盘',
    }
    return [synthesized]
  }

  /** 实时行情 — 有 Key 走 quotes；免费档用日 K 近似 */
  async realtime(code: string): Promise<StockRealtime[] | null> {
    const client = this.client()
    if (!client) return null
    if (isTickflowFreeTier()) {
      return this.realtimeFromDailyKline(code)
    }
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getQuotes({ symbols: symbol })
      const rows = mapTickflowQuotes(json.data)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** 批量实时行情 — 免费档逐个日 K 近似；有 Key 走 quotes */
  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    const client = this.client()
    if (!client || !codes.length) return null
    if (isTickflowFreeTier()) {
      const out: StockRealtime[] = []
      for (const code of codes) {
        const one = await this.realtimeFromDailyKline(code)
        if (one?.length) out.push(...one)
      }
      return out.length ? out : null
    }
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
    // 公开免费档不支持分钟 K，避免打 free-api 触发 403
    if (isTickflowFreeTier() && isIntradayTickflowPeriod(resolved.tfPeriod)) {
      return null
    }
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

  /** ETF 净值 — 日 K 收盘价近似（无 IOPV 字段时的回退） */
  async etfNav(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const rows = await this.kline(etfCode, 'daily', '', '', 30)
    if (!rows?.length) return null
    const mapped = mapKlinesToEtfNavRows(etfCode, rows)
    return mapped.length ? mapped : null
  }
}
