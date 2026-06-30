import { createRequire } from 'node:module'
import type { IndexKline, IndexRealtime, StockKline, StockRealtime } from '../core/schema.js'
import type { IntradayTrendFetchResult } from '../utils/intraday-trends.js'
import { cnTodayString } from '../utils/market-session.js'
import { normalizeCode } from '../utils/helpers.js'
import {
  intradayProbeDates,
  mergeIntradaySessions,
  sessionDateToTdxInt,
  shouldFetchTodayTdxIntraday,
  transformTdxMinutePoints,
  type TdxMinutePoint,
} from './intraday.js'
import { patchNodetdxBjMarket } from './market-id.js'
import { isIndexCode, toTdxSymbol } from './symbol.js'
import { toTdxPeriod } from './period.js'

const require = createRequire(import.meta.url)
const nodetdx = require('nodetdx') as typeof import('nodetdx')
const { TdxMarketApi, setLogLevel } = nodetdx

setLogLevel('ERROR')
patchNodetdxBjMarket()

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** TDX quote servers — same pool as Python pytdx/mootdx drivers */
const TDX_HOSTS: readonly [string, number][] = [
  ['119.147.212.81', 7709],
  ['119.147.212.42', 7709],
  ['112.95.142.222', 7709],
  ['115.238.56.78', 7709],
  ['115.238.90.165', 7709],
  ['120.24.0.77', 7709],
  ['218.108.98.244', 7709],
  ['114.80.63.12', 7709],
]

const HOST_CONNECT_MS = 1200
const AUTO_GATEWAY_MS = 3500
const API_CALL_MS = 8000
const FAIL_COOLDOWN_MS = 15_000

function barDate(bar: import('nodetdx').TdxBar): string {
  const ext = bar as import('nodetdx').TdxBar & { hour?: number; minute?: number }
  if (bar.datetime) {
    const dt = bar.datetime.trim()
    if (dt.includes(' ')) {
      const [d, t = ''] = dt.split(/\s+/)
      const time = t.length === 5 ? `${t}:00` : t.slice(0, 8)
      return `${d.slice(0, 10)} ${time}`
    }
  }
  if (ext.hour != null && ext.minute != null && bar.year) {
    const y = bar.year
    const m = String(bar.month).padStart(2, '0')
    const d = String(bar.day).padStart(2, '0')
    const hh = String(ext.hour).padStart(2, '0')
    const mm = String(ext.minute).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}:00`
  }
  if (bar.datetime) return bar.datetime.trim().slice(0, 10)
  return `${bar.year}-${String(bar.month).padStart(2, '0')}-${String(bar.day).padStart(2, '0')}`
}

function toStockKline(code: string, bar: import('nodetdx').TdxBar): StockKline {
  return {
    code: normalizeCode(code),
    date: barDate(bar),
    open: bar.open,
    close: bar.close,
    high: bar.high,
    low: bar.low,
    volume: bar.volume ?? 0,
    amount: bar.dbvol ?? 0,
    changePct: null,
    turnoverRate: null,
  }
}

function toIndexKline(code: string, bar: import('nodetdx').TdxBar): IndexKline {
  const k = toStockKline(code, bar)
  return {
    code: k.code, date: k.date, open: k.open, close: k.close,
    high: k.high, low: k.low, volume: k.volume, amount: k.amount, changePct: k.changePct,
  }
}

function toRealtime(code: string, q: import('nodetdx').TdxQuote): StockRealtime {
  const price = q.lastPrice ?? null
  const preClose = q.preClose ?? null
  const changePct = price != null && preClose
    ? Math.round(((price - preClose) / preClose) * 10000) / 100
    : null
  return {
    code: normalizeCode(code),
    name: '',
    price,
    preClose,
    open: q.open ?? null,
    high: q.high ?? null,
    low: q.low ?? null,
    volume: q.totalVol ?? q.volume ?? null,
    amount: q.amount ?? null,
    changePct,
    pe: null,
    pb: null,
    turnoverRate: null,
  }
}

function createApi(autoSelectBestGateway: boolean): import('nodetdx').TdxMarketApi {
  return new TdxMarketApi({
    autoSelectBestGateway,
    useHeartbeat: true,
    heartbeatInterval: 10000,
    idleTimeout: 30000,
    maxReconnectTimes: 0,
    pingTimeout: 400,
  })
}

/**
 * Singleton TDX TCP client — multi-host fallback + adaptive host preference + auto gateway.
 */
export class TdxClient {
  private api: import('nodetdx').TdxMarketApi | null = null
  private connectTask: Promise<boolean> | null = null
  /** Last successful host index in TDX_HOSTS; rotates forward on failure. */
  private preferredHostIndex = 0
  private usingAutoGateway = false
  private cooldownUntil = 0

  private orderedHostIndices(): number[] {
    const n = TDX_HOSTS.length
    return Array.from({ length: n }, (_, i) => (this.preferredHostIndex + i) % n)
  }

  async ensureConnected(): Promise<boolean> {
    if (Date.now() < this.cooldownUntil) return false
    if (this.api) return true
    if (this.connectTask) return this.connectTask
    this.connectTask = this.connectWithFallback()
    try {
      const ok = await this.connectTask
      if (!ok) this.cooldownUntil = Date.now() + FAIL_COOLDOWN_MS
      return ok
    } finally {
      this.connectTask = null
    }
  }

  /** Try all known hosts (adaptive order), then nodetdx auto gateway selection. */
  private async connectWithFallback(): Promise<boolean> {
    for (const idx of this.orderedHostIndices()) {
      const [host, port] = TDX_HOSTS[idx]
      const api = await this.tryConnectHost(host, port)
      if (api) {
        this.api = api
        this.preferredHostIndex = idx
        this.usingAutoGateway = false
        return true
      }
    }

    const autoApi = await this.tryAutoGateway()
    if (autoApi) {
      this.api = autoApi
      this.usingAutoGateway = true
      return true
    }
    return false
  }

  private async tryConnectHost(host: string, port: number) {
    const api = createApi(false)
    try {
      const ok = await Promise.race([
        api.connect(host, port),
        sleep(HOST_CONNECT_MS).then(() => false),
      ])
      if (ok) return api
    } catch { /* try next host */ }
    api.destroy?.()
    return null
  }

  private async tryAutoGateway() {
    const api = createApi(true)
    try {
      const ok = await Promise.race([
        api.connect(),
        sleep(AUTO_GATEWAY_MS).then(() => false),
      ])
      if (ok) return api
    } catch { /* ignore */ }
    api.destroy?.()
    return null
  }

  private async withApi<T>(fn: (api: import('nodetdx').TdxMarketApi) => Promise<T>): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await this.ensureConnected()) || !this.api) return null
      try {
        const result = await Promise.race([
          fn(this.api),
          sleep(API_CALL_MS).then(() => null),
        ])
        if (result != null) return result
      } catch { /* reconnect below */ }
      this.bumpPreferredHost()
      this.destroyApi()
    }
    return null
  }

  private bumpPreferredHost() {
    if (!this.usingAutoGateway) {
      this.preferredHostIndex = (this.preferredHostIndex + 1) % TDX_HOSTS.length
    } else {
      this.usingAutoGateway = false
      this.preferredHostIndex = 0
    }
  }

  private destroyApi() {
    try {
      this.api?.destroy?.()
    } catch { /* ignore */ }
    this.api = null
  }

  reset() {
    this.destroyApi()
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    const sym = toTdxSymbol(code)
    const rows = await this.withApi(api => api.getSecurityQuotes(sym))
    const q = rows?.[0]
    if (!q || q.lastPrice == null) return null
    return [toRealtime(code, q)]
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    if (!codes.length) return null
    const syms = codes.map(toTdxSymbol)
    const rows = await this.withApi(api => api.getSecurityQuotes(...syms))
    if (!rows?.length) return null
    return rows.map((q, i) => toRealtime(codes[i], q))
  }

  async kline(
    code: string,
    period = 'daily',
    _startDate = '',
    _endDate = '',
    count = 800,
    startOffset = 0,
  ): Promise<StockKline[] | null> {
    const sym = toTdxSymbol(code)
    const p = toTdxPeriod(period)
    const bars = await this.withApi(api => api.getSecurityBars(p, sym, startOffset, count))
    if (!bars?.length) return null
    const rows = bars.map(b => toStockKline(code, b))
    rows.sort((a, b) => a.date.localeCompare(b.date))
    return rows
  }

  async indexRealtime(code: string): Promise<IndexRealtime[] | null> {
    const r = await this.realtime(code)
    if (!r) return null
    return r.map(x => ({
      code: x.code, name: x.name, price: x.price, changePct: x.changePct,
      open: x.open, high: x.high, low: x.low, preClose: x.preClose,
      volume: x.volume, amount: x.amount,
    }))
  }

  async indexKline(
    code: string, period = 'daily', _start = '', _end = '', count = 800,
  ): Promise<IndexKline[] | null> {
    const sym = toTdxSymbol(code)
    const p = toTdxPeriod(period)
    const fetch = isIndexCode(code)
      ? (api: import('nodetdx').TdxMarketApi) => api.getIndexBars(p, sym, 0, count)
      : (api: import('nodetdx').TdxMarketApi) => api.getSecurityBars(p, sym, 0, count)
    const bars = await this.withApi(fetch)
    if (!bars?.length) return null
    return bars.map(b => toIndexKline(code, b))
  }

  /** Today's intraday ticks via TDX getMinuteTimeData. */
  async minuteTimeData(code: string): Promise<TdxMinutePoint[] | null> {
    const sym = toTdxSymbol(code)
    const rows = await this.withApi(api => api.getMinuteTimeData(sym))
    if (!rows?.length) return null
    return rows.map(r => ({ price: r.price, volume: r.volume }))
  }

  /** Historical intraday for a YYYY-MM-DD session. */
  async historyMinuteTimeData(code: string, sessionDate: string): Promise<TdxMinutePoint[] | null> {
    const sym = toTdxSymbol(code)
    const dateInt = sessionDateToTdxInt(sessionDate)
    const rows = await this.withApi(api => api.getHistoryMinuteTimeData(sym, dateInt))
    if (!rows?.length) return null
    return rows.map(r => ({ price: r.price, volume: r.volume }))
  }

  /**
   * Multi-day intraday sessions (TDX primary).
   * Probes up to `ndays` recent weekdays; today uses live minute feed when session started.
   */
  async fetchIntradaySessions(code: string, ndays = 5): Promise<IntradayTrendFetchResult | null> {
    const today = cnTodayString()
    const probeDates = intradayProbeDates(ndays, today)
    const sessions: NonNullable<IntradayTrendFetchResult['sessions']> = []
    let apiPreClose: number | null = null

    const quote = await this.realtime(code)
    if (quote?.[0]?.preClose != null && quote[0].preClose > 0) {
      apiPreClose = quote[0].preClose
    }

    for (const sessionDate of probeDates) {
      if (sessionDate === today && !shouldFetchTodayTdxIntraday(today)) continue
      const points = sessionDate === today
        ? await this.minuteTimeData(code)
        : await this.historyMinuteTimeData(code, sessionDate)
      if (!points?.length) continue
      const preClose = sessionDate === today ? apiPreClose : null
      const session = transformTdxMinutePoints(sessionDate, points, preClose)
      if (session) sessions.push(session)
    }

    const merged = mergeIntradaySessions(sessions, apiPreClose)
    return merged.sessions.length ? merged : null
  }
}

/** Shared TDX client for mootdx / pytdx drivers */
export const tdxClient = new TdxClient()
