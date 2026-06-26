import { createRequire } from 'node:module'
import type { IndexKline, IndexRealtime, StockKline, StockRealtime } from '../core/schema.js'
import { normalizeCode } from '../utils/helpers.js'
import { isIndexCode, toTdxSymbol } from './symbol.js'
import { toTdxPeriod } from './period.js'

const require = createRequire(import.meta.url)
const nodetdx = require('nodetdx') as typeof import('nodetdx')
const { TdxMarketApi, setLogLevel } = nodetdx

setLogLevel('ERROR')

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** TDX quote servers — same pool as Python pytdx/mootdx drivers */
const TDX_HOSTS: [string, number][] = [
  ['119.147.212.81', 7709],
  ['119.147.212.42', 7709],
  ['112.95.142.222', 7709],
  ['115.238.56.78', 7709],
  ['115.238.90.165', 7709],
  ['120.24.0.77', 7709],
  ['218.108.98.244', 7709],
  ['114.80.63.12', 7709],
]

function barDate(bar: import('nodetdx').TdxBar): string {
  if (bar.datetime) return bar.datetime.slice(0, 10)
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

/**
 * Singleton TDX TCP client — pure Node replacement for Python mootdx/pytdx.
 * Uses nodetdx (通达信 binary protocol) with persistent connection + host fallback.
 */
export class TdxClient {
  private api: import('nodetdx').TdxMarketApi | null = null
  private connectTask: Promise<boolean> | null = null
  private hostIndex = 0

  async ensureConnected(): Promise<boolean> {
    if (this.api) return true
    if (this.connectTask) return this.connectTask
    this.connectTask = this.connectNext()
    try {
      return await this.connectTask
    } finally {
      this.connectTask = null
    }
  }

  private async connectNext(): Promise<boolean> {
    for (let i = 0; i < TDX_HOSTS.length; i++) {
      const idx = (this.hostIndex + i) % TDX_HOSTS.length
      const [host, port] = TDX_HOSTS[idx]
      const api = await this.tryConnectHost(host, port, 3500)
      if (api) {
        this.api = api
        this.hostIndex = idx
        return true
      }
    }
    // Fallback: nodetdx auto-ping best gateway (slower but finds live servers)
    const api = new TdxMarketApi({
      autoSelectBestGateway: true,
      useHeartbeat: true,
      heartbeatInterval: 15000,
      idleTimeout: 120000,
      pingTimeout: 500,
    })
    try {
      const ok = await Promise.race([
        api.connect(),
        sleep(25000).then(() => false),
      ])
      if (ok) {
        this.api = api
        return true
      }
    } catch { /* ignore */ }
    api.destroy?.()
    return false
  }

  private async tryConnectHost(host: string, port: number, timeoutMs: number) {
    const api = new TdxMarketApi({
      autoSelectBestGateway: false,
      useHeartbeat: true,
      heartbeatInterval: 15000,
      idleTimeout: 120000,
      maxReconnectTimes: 0,
    })
    try {
      const ok = await Promise.race([
        api.connect(host, port),
        sleep(timeoutMs).then(() => false),
      ])
      if (ok) return api
    } catch { /* ignore */ }
    api.destroy?.()
    return null
  }

  private async withApi<T>(fn: (api: import('nodetdx').TdxMarketApi) => Promise<T>): Promise<T | null> {
    if (!(await this.ensureConnected()) || !this.api) return null
    try {
      return await fn(this.api)
    } catch {
      this.reset()
      if (await this.ensureConnected() && this.api) {
        try {
          return await fn(this.api)
        } catch {
          return null
        }
      }
      return null
    }
  }

  reset() {
    try {
      this.api?.destroy?.()
    } catch { /* ignore */ }
    this.api = null
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
    code: string, period = 'daily', _start = '', _end = '', count = 800,
  ): Promise<StockKline[] | null> {
    const sym = toTdxSymbol(code)
    const p = toTdxPeriod(period)
    const bars = await this.withApi(api => api.getSecurityBars(p, sym, 0, count))
    if (!bars?.length) return null
    return bars.map(b => toStockKline(code, b))
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
}

/** Shared TDX client for mootdx / pytdx drivers */
export const tdxClient = new TdxClient()
