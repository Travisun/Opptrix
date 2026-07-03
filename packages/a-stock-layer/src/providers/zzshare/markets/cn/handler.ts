import type {
  IndexKline, IndexRealtime, StockKline, StockListItem, StockProfile, StockRealtime,
} from '../../../../core/schema.js'
import type { IntradayTrendFetchResult } from '../../../../utils/intraday-trends.js'
import { isShIndexCode, normalizeCode } from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { ZzshareClient } from '../../api/client.js'
import { invokeZzshare } from '../../api/invoke.js'
import { toTsCode } from '../../api/symbols.js'
import { hasZzshareToken, isZzshareEnabled, loadZzshareConfig } from '../../config.js'
import {
  filterTradeCalendarYear,
  groupMinuteKlinesToSessions,
  latestOpenTradeDate,
  mapLatestKlineToIndexRealtime,
  mapLatestKlineToStockRealtime,
  mapZzshareDailyRowToIndexRealtime,
  mapZzshareDailyRowToStockRealtime,
  mapZzshareDailyRows,
  mapZzshareIndexKlineRows,
  mapZzshareMinuteRows,
  mapZzsharePlateOrTopicKlineRows,
  mapZzshareProfileFromBasic,
  mapZzshareRtKRows,
  mapZzshareStockBasicRows,
  mapZzshareStockInfoRow,
  mapZzshareTopicKlineRows,
  mapZzshareTradeCalendarRows,
  opptrixPeriodToZzshareFreq,
} from '../../normalize/index.js'

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ymdToApi(v: string): string {
  return v.replace(/-/g, '').slice(0, 8)
}

function resolveQueryDate(date = ''): string {
  return date ? date.slice(0, 10) : todayYmd()
}

function isCnIndexCode(code: string): boolean {
  const c = normalizeCode(code)
  return isShIndexCode(c) || c.startsWith('399')
    || (c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000)
}

function isPlateCode(code: string): boolean {
  const c = normalizeCode(code)
  return c.startsWith('88') && c.length === 6
}

function parseTopicId(code: string): string | null {
  const trimmed = code.trim()
  if (trimmed.startsWith('topic:')) return trimmed.slice(6) || null
  return null
}

function indexToStockRealtime(idx: IndexRealtime): StockRealtime {
  return {
    code: idx.code,
    name: idx.name ?? idx.code,
    price: idx.price ?? null,
    changePct: idx.changePct ?? null,
    pe: null,
    pb: null,
    turnoverRate: null,
    open: idx.open,
    high: idx.high,
    low: idx.low,
    preClose: idx.preClose,
    volume: idx.volume,
    amount: idx.amount,
  }
}

function resampleKlines(klines: StockKline[], mode: 'weekly' | 'monthly'): StockKline[] {
  if (!klines.length) return []
  const buckets = new Map<string, StockKline[]>()

  for (const bar of klines) {
    const d = new Date(bar.date.slice(0, 10))
    if (Number.isNaN(d.getTime())) continue
    let key: string
    if (mode === 'weekly') {
      const day = d.getDay() || 7
      const monday = new Date(d)
      monday.setDate(d.getDate() - day + 1)
      key = monday.toISOString().slice(0, 10)
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const list = buckets.get(key) ?? []
    list.push(bar)
    buckets.set(key, list)
  }

  const out: StockKline[] = []
  for (const [, bars] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    bars.sort((a, b) => a.date.localeCompare(b.date))
    const first = bars[0]!
    const last = bars[bars.length - 1]!
    let high = first.high
    let low = first.low
    let volume = 0
    let amount = 0
    for (const b of bars) {
      high = Math.max(high, b.high)
      low = Math.min(low, b.low)
      volume += b.volume ?? 0
      amount += b.amount ?? 0
    }
    out.push({
      code: first.code,
      date: last.date.slice(0, 10),
      open: first.open,
      close: last.close,
      high,
      low,
      volume,
      amount,
      changePct: last.changePct,
      turnoverRate: last.turnoverRate,
    })
  }
  return out
}

/** 自在量化 Zzshare — A 股行情、涨停复盘、龙虎榜、情绪 */

export class ZzshareCnHandler extends MarketHandlerShell {
  private nameCache = new Map<string, string>()
  private clientInstance: ZzshareClient | null = null
  private dailySnapshotCache: { tradeDate: string; quotes: Map<string, StockRealtime> } | null = null
  /** 防止 realtime ↔ indexRealtime 等路径意外互相调用导致栈溢出 */
  private readonly inflightQuotes = new Set<string>()

  private quoteGuardKey(method: string, code: string): string {
    return `${method}:${normalizeCode(code)}`
  }

  private beginQuoteGuard(method: string, code: string): boolean {
    const key = this.quoteGuardKey(method, code)
    if (this.inflightQuotes.has(key)) return false
    this.inflightQuotes.add(key)
    return true
  }

  private endQuoteGuard(method: string, code: string): void {
    this.inflightQuotes.delete(this.quoteGuardKey(method, code))
  }

  private client(): ZzshareClient | null {
    if (!isZzshareEnabled()) return null
    if (!this.clientInstance) {
      try {
        this.clientInstance = ZzshareClient.fromConfig(loadZzshareConfig())
      } catch {
        return null
      }
    }
    return this.clientInstance
  }

  protected async withClient<T>(fn: (client: ZzshareClient) => Promise<T>): Promise<T | null> {
    const client = this.client()
    if (!client) return null
    try {
      return await fn(client)
    } catch {
      return null
    }
  }

  private async latestTradeDate(client: ZzshareClient): Promise<string | null> {
    const data = await invokeZzshare(client, 'trade_days', { days: 14 })
    const rows = mapZzshareTradeCalendarRows(data)
    return latestOpenTradeDate(rows, todayYmd())
  }

  private async loadDailySnapshot(client: ZzshareClient): Promise<Map<string, StockRealtime>> {
    const tradeDate = await this.latestTradeDate(client)
    if (!tradeDate) return new Map()
    if (this.dailySnapshotCache?.tradeDate === tradeDate) return this.dailySnapshotCache.quotes

    const rows = await client.daily({ trade_date: tradeDate, limit: 6000 })
    const quotes = rows
      .map(row => mapZzshareDailyRowToStockRealtime(
        normalizeCode(row.ts_code ?? ''),
        row as unknown as Record<string, unknown>,
        this.nameCache.get(normalizeCode(row.ts_code ?? '')) ?? '',
      ))
      .filter((q): q is StockRealtime => q != null)

    const map = new Map(quotes.map(q => [q.code, q]))
    this.dailySnapshotCache = { tradeDate, quotes: map }
    return map
  }

  private async fetchDailyKlines(
    client: ZzshareClient,
    code: string,
    start: string,
    end: string,
    count?: number,
    resample?: 'weekly' | 'monthly',
  ): Promise<StockKline[] | null> {
    const params: {
      ts_code?: string
      start_date?: string
      end_date?: string
      limit?: number
    } = { ts_code: toTsCode(code) }
    if (start) params.start_date = ymdToApi(start)
    if (end) params.end_date = ymdToApi(end)
    if (!start && !end && count) {
      params.start_date = ymdToApi(ymdDaysAgo(Math.min(count * (resample === 'weekly' ? 7 : resample === 'monthly' ? 31 : 2), 3650)))
      params.end_date = ymdToApi(todayYmd())
    }
    if (count && !resample) params.limit = count

    const rows = await client.daily(params)
    let mapped = mapZzshareDailyRows(code, rows, 'daily')
    if (resample) mapped = resampleKlines(mapped, resample)
    if (count && mapped.length > count) mapped = mapped.slice(-count)
    return mapped.length ? mapped : null
  }

  async stockList(_market = 'all'): Promise<StockListItem[] | null> {
    return this.withClient(async client => {
      const rows = await client.stock_basic({ list_status: 'L' })
      const items = mapZzshareStockBasicRows(rows)
      for (const item of items) this.nameCache.set(item.code, item.name)
      return items.length ? items : null
    })
  }

  private async fetchStockRealtime(client: ZzshareClient, code: string): Promise<StockRealtime | null> {
    const bare = normalizeCode(code)
    if (hasZzshareToken()) {
      const rows = await client.rt_k({ ts_code: toTsCode(bare) })
      const quotes = mapZzshareRtKRows(rows)
      if (quotes.length) {
        const q = quotes[0]!
        if (!q.name) q.name = this.nameCache.get(q.code) ?? q.code
        return q
      }
    }

    const snapshot = await this.loadDailySnapshot(client)
    const cached = snapshot.get(bare)
    if (cached) return cached

    const daily = await client.daily({ ts_code: toTsCode(bare), limit: 1 })
    const row = daily[0]
    if (!row) return null
    return mapZzshareDailyRowToStockRealtime(
      bare,
      row as unknown as Record<string, unknown>,
      this.nameCache.get(bare) ?? '',
    )
  }

  private async fetchIndexRealtime(client: ZzshareClient, code: string): Promise<IndexRealtime | null> {
    const bare = normalizeCode(code)
    if (hasZzshareToken()) {
      const rows = await client.rt_k({ ts_code: toTsCode(bare) })
      const quotes = mapZzshareRtKRows(rows)
      if (quotes.length) {
        const q = quotes[0]!
        return {
          code: q.code,
          name: q.name ?? this.nameCache.get(q.code) ?? q.code,
          price: q.price,
          open: q.open,
          high: q.high,
          low: q.low,
          preClose: q.preClose,
          volume: q.volume,
          amount: q.amount,
          changePct: q.changePct,
        }
      }
    }

    const daily = await client.daily({ ts_code: toTsCode(bare), limit: 1 })
    const row = daily[0]
    if (!row) return null
    return mapZzshareDailyRowToIndexRealtime(bare, row as unknown as Record<string, unknown>)
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    if (!this.beginQuoteGuard('realtime', code)) return null
    try {
      if (isCnIndexCode(code)) {
        return this.withClient(async client => {
          const idx = await this.fetchIndexRealtime(client, code)
          return idx ? [indexToStockRealtime(idx)] : null
        })
      }

      return this.withClient(async client => {
        const q = await this.fetchStockRealtime(client, code)
        return q ? [q] : null
      })
    } finally {
      this.endQuoteGuard('realtime', code)
    }
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    return this.withClient(async client => {
      const normalized = codes.map(c => normalizeCode(c))
      const out: StockRealtime[] = []

      if (hasZzshareToken() && normalized.length) {
        const tsCodes = normalized.map(c => toTsCode(c)).join(',')
        const rows = await client.rt_k({ ts_code: tsCodes })
        const quotes = mapZzshareRtKRows(rows)
        for (const q of quotes) {
          if (!q.name) q.name = this.nameCache.get(q.code) ?? q.code
          out.push(q)
        }
        if (out.length) return out
      }

      const snapshot = await this.loadDailySnapshot(client)
      for (const code of normalized) {
        const cached = snapshot.get(code)
        if (cached) out.push(cached)
      }
      if (out.length) return out

      for (const code of normalized) {
        const q = isCnIndexCode(code)
          ? await this.fetchIndexRealtime(client, code)
          : await this.fetchStockRealtime(client, code)
        if (q) out.push(isCnIndexCode(code) ? indexToStockRealtime(q as IndexRealtime) : q as StockRealtime)
      }
      return out.length ? out : null
    })
  }

  async indexRealtime(code: string): Promise<IndexRealtime[] | null> {
    if (!this.beginQuoteGuard('indexRealtime', code)) return null
    try {
      return this.withClient(async client => {
        const q = await this.fetchIndexRealtime(client, code)
        return q ? [q] : null
      })
    } finally {
      this.endQuoteGuard('indexRealtime', code)
    }
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<StockKline[] | null> {
    const spec = opptrixPeriodToZzshareFreq(period)
    if (!spec) return null

    return this.withClient(async client => {
      if (spec.kind === 'minute') {
        const rows = await client.stk_mins({
          ts_code: toTsCode(code),
          freq: spec.freq,
          count: count ?? undefined,
          start_time: start ? ymdToApi(start) : undefined,
          end_time: end ? ymdToApi(end) : undefined,
        })
        let mapped = mapZzshareMinuteRows(code, rows, period)
        if (count && mapped.length > count) mapped = mapped.slice(-count)
        return mapped.length ? mapped : null
      }

      return this.fetchDailyKlines(client, code, start, end, count, spec.resample)
    })
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<IndexKline[] | null> {
    const topicId = parseTopicId(code)
    if (topicId) {
      return this.withClient(async client => {
        const data = await invokeZzshare(client, 'topic_kline', {
          tid: topicId,
          start_date: start ? ymdToApi(start) : ymdDaysAgo(count ? count * 2 : 365),
        })
        let mapped = mapZzshareTopicKlineRows(code, data)
        if (count && mapped.length > count) mapped = mapped.slice(-count)
        return mapped.length ? mapped : null
      })
    }

    if (isPlateCode(code)) {
      return this.withClient(async client => {
        const data = await invokeZzshare(client, 'plate_kline', {
          b_code: normalizeCode(code),
          date1: start ? ymdToApi(start) : ymdDaysAgo(count ? count * 2 : 365),
          date2: end ? ymdToApi(end) : ymdToApi(todayYmd()),
        })
        let mapped = mapZzsharePlateOrTopicKlineRows(code, data)
        if (count && mapped.length > count) mapped = mapped.slice(-count)
        return mapped.length ? mapped : null
      })
    }

    const spec = opptrixPeriodToZzshareFreq(period)
    if (!spec || spec.kind === 'minute') {
      // 指数分钟线走 kline/stk_mins，禁止调用 realtime（旧版曾在此递归）
      const stock = await this.kline(code, period, start, end, count)
      if (!stock) return null
      return mapZzshareIndexKlineRows(code, stock, period)
    }

    return this.withClient(async client => {
      const rows = await this.fetchDailyKlines(client, code, start, end, count, spec.resample)
      if (!rows) return null
      return mapZzshareIndexKlineRows(code, rows, period)
    })
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    return this.withClient(async client => {
      const bare = normalizeCode(code)
      const [infoData, basicRows] = await Promise.all([
        invokeZzshare(client, 'stock_info', { stock_id: bare, info_type: 'all' }).catch(() => null),
        client.stock_basic({ ts_code: bare, list_status: 'L' }),
      ])

      const basic = basicRows[0] as unknown as Record<string, unknown> | undefined
      if (infoData && typeof infoData === 'object') {
        const info = (infoData as { list?: unknown[] }).list?.[0]
          ?? (Array.isArray(infoData) ? infoData[0] : infoData)
        if (info && typeof info === 'object') {
          const profile = mapZzshareStockInfoRow(bare, info as Record<string, unknown>, basic)
          return [profile]
        }
      }

      if (basic) {
        return [mapZzshareProfileFromBasic(bare, basic)]
      }
      return null
    })
  }

  async tradeCalendar(year = 0): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const y = year || new Date().getFullYear()
      const data = await invokeZzshare(client, 'trade_days', {
        day_start: `${y}0101`,
        day_end: `${y}1231`,
      })
      const rows = mapZzshareTradeCalendarRows(data)
      const filtered = filterTradeCalendarYear(rows, y)
      return filtered.length ? filtered : null
    })
  }

  async fetchIntradaySessions(
    code: string,
    ndays = 5,
  ): Promise<IntradayTrendFetchResult | null> {
    if (isCnIndexCode(code) || isPlateCode(code) || parseTopicId(code)) return null

    return this.withClient(async client => {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const rows = await client.stk_mins({
        ts_code: toTsCode(code),
        freq: '1min',
        count: safeDays * 250,
      })
      const klines = mapZzshareMinuteRows(code, rows, '1m')
      if (!klines.length) return null

      const sessionDates = [...new Set(klines.map(k => k.date.slice(0, 10)))].sort()
      const keep = new Set(sessionDates.slice(-safeDays))
      const filtered = klines.filter(k => keep.has(k.date.slice(0, 10)))

      const daily = await this.fetchDailyKlines(client, code, ymdDaysAgo(10), todayYmd(), 3)
      const apiPreClose = daily && daily.length >= 2 ? daily[daily.length - 2]!.close : null

      return groupMinuteKlinesToSessions(filtered, apiPreClose)
    })
  }

  async minuteTrendKline(
    code: string,
    ndays = 1,
    count = 0,
  ): Promise<StockKline[] | null> {
    if (isCnIndexCode(code) || isPlateCode(code) || parseTopicId(code)) return null

    return this.withClient(async client => {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const rows = await client.stk_mins({
        ts_code: toTsCode(code),
        freq: '1min',
        count: safeDays * 250,
      })
      let mapped = mapZzshareMinuteRows(code, rows, '1m')
      if (!mapped.length) return null

      const sessionDates = [...new Set(mapped.map(k => k.date.slice(0, 10)))].sort()
      const keep = new Set(sessionDates.slice(-safeDays))
      mapped = mapped.filter(k => keep.has(k.date.slice(0, 10)))

      if (count > 0 && mapped.length > count) mapped = mapped.slice(-count)
      return mapped.length ? mapped : null
    })
  }

  /** Fallback: latest daily bar as index snapshot when rt_k unavailable. */
  protected async latestIndexFromDaily(code: string): Promise<IndexRealtime | null> {
    return this.withClient(async client => {
      const daily = await client.daily({ ts_code: toTsCode(code), limit: 1 })
      const row = daily[0]
      if (!row) return null
      const klines = mapZzshareDailyRows(code, [row], 'daily')
      const bar = klines[0]
      return bar ? mapLatestKlineToIndexRealtime(bar) : null
    })
  }

  /** Fallback: latest daily bar as stock snapshot when rt_k unavailable. */
  protected async latestStockFromDaily(code: string): Promise<StockRealtime | null> {
    return this.withClient(async client => {
      const daily = await client.daily({ ts_code: toTsCode(code), limit: 1 })
      const row = daily[0]
      if (!row) return null
      const klines = mapZzshareDailyRows(code, [row], 'daily')
      const bar = klines[0]
      return bar ? mapLatestKlineToStockRealtime(bar, this.nameCache.get(normalizeCode(code)) ?? '') : null
    })
  }
}
