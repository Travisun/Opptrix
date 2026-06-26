import { Capability } from '../core/capabilities.js'
import type { IndexKline, StockKline, StockRealtime } from '../core/schema.js'
import { BaseDriver } from './base.js'
import { normalizeCode, safeFloat } from '../utils/helpers.js'

const RT_URL = 'https://qt.gtimg.cn/q='
const KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }

const PERIOD_MAP: Record<string, string> = {
  daily: 'day', weekly: 'week', monthly: 'month',
  '60m': '60', '30m': '30', '5m': '5', '1m': '1',
}

function parseLine(text: string) {
  const start = text.indexOf('"')
  const end = text.lastIndexOf('"')
  if (start < 0 || end <= start) return null
  const parts = text.slice(start + 1, end).split('~')
  if (parts.length < 48) return null
  return parts
}

function f(v: string | undefined) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export class TencentDriver extends BaseDriver {
  get name() { return 'tencent' }
  get priority() { return 50 }
  capabilities() {
    return [
      Capability.STOCK_REALTIME, Capability.STOCK_KLINE, Capability.INDEX_KLINE,
      Capability.INDEX_REALTIME, Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE,
    ]
  }

  private async fetch(codes: string[]) {
    const resp = await fetch(`${RT_URL}${codes.join(',')}`, { headers: HEADERS })
    const buf = await resp.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buf)
    return text.trim().split('\n').map(parseLine).filter(Boolean) as string[][]
  }

  private toRealtime(code: string, p: string[]): StockRealtime {
    return {
      code: normalizeCode(code),
      name: p[1] ?? '',
      price: f(p[3]),
      preClose: f(p[4]),
      open: f(p[5]),
      volume: f(p[6]),
      amount: f(p[37]),
      changePct: f(p[32]),
      pe: f(p[39]),
      pb: f(p[46]),
      turnoverRate: f(p[38]),
      marketCap: f(p[44]),
    }
  }

  async realtime(code: string) {
    const rows = await this.fetch([this.secFullCode(code)])
    if (!rows.length) return null
    return [this.toRealtime(code, rows[0])]
  }

  async batchRealtime(codes: string[]) {
    const rows = await this.fetch(codes.map(c => this.secFullCode(c)))
    return rows.map((p, i) => this.toRealtime(codes[i], p))
  }

  async indexRealtime(code: string) {
    const r = await this.realtime(code)
    return r ? r.map(x => ({ code: x.code, name: x.name, price: x.price, changePct: x.changePct })) : null
  }

  async globalIndex(code = '') {
    const map: Record<string, string> = {
      dji: 'usDJI', spx: 'usINX', ixic: 'usIXIC', hsi: 'hkHSI', n225: 'jpN225',
    }
    const keys = code ? [code] : Object.keys(map)
    const results = []
    for (const k of keys) {
      const sym = map[k]
      if (!sym) continue
      const rows = await this.fetch([sym])
      if (rows.length) {
        results.push({
          code: k, name: k, price: f(rows[0][3]), changePct: f(rows[0][32]), market: 'global',
        })
      }
    }
    return results.length ? results : null
  }

  async exchangeRate(pair = '') {
    const map: Record<string, string> = { USDCNY: 'fxUSDCNY', EURCNY: 'fxEURCNY', HKDCNY: 'fxHKDCNY' }
    const keys = pair ? [pair] : Object.keys(map)
    const results = []
    for (const k of keys) {
      const rows = await this.fetch([map[k]])
      if (rows.length) results.push({ code: k, name: k, price: f(rows[0][3]), changePct: f(rows[0][32]) })
    }
    return results.length ? results : null
  }

  async kline(code: string, period = 'daily', _start = '', _end = '', count = 320) {
    if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') return null
    try {
      const sym = this.secFullCode(code)
      const p = PERIOD_MAP[period] ?? 'day'
      const qs = new URLSearchParams({ param: `${sym},${p},,,${count},qfq` })
      const resp = await fetch(`${KLINE_URL}?${qs}`, { headers: HEADERS })
      const json = await resp.json() as Record<string, unknown>
      const data = json.data as Record<string, Record<string, string[][]>> | undefined
      const rows = data?.[sym]?.[`qfq${p}`] ?? data?.[sym]?.[p] ?? []
      if (!rows.length) return null
      return rows.map(r => ({
        code: normalizeCode(code),
        date: r[0],
        open: Number(r[1]),
        close: Number(r[2]),
        high: Number(r[3]),
        low: Number(r[4]),
        volume: Number(r[5]) || 0,
        amount: 0,
        changePct: null,
        turnoverRate: null,
      } satisfies StockKline))
    } catch { return null }
  }

  async indexKline(code: string, period = 'daily', start = '', end = '', count = 320) {
    const rows = await this.kline(code, period, start, end, count)
    return rows as IndexKline[] | null
  }
}
