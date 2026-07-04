import type {
  IndexKline, IndexRealtime, StockKline, StockListItem, StockRealtime,
} from '../../../../core/schema.js'
import { normalizeCode, resolveMarket, safeFloat } from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { getSinaClient } from '../../api/client.js'
import { toSinaIndexListSymbol, toSinaListSymbol } from '../../api/symbols.js'
import { filterKlineByRange, mapSinaKlineRows } from '../../normalize/kline.js'
import {
  mapGlobalIndexHqQuote,
  mapIndexHqQuote,
  mapStockHqQuote,
  parseHqLine,
} from '../../normalize/quote.js'

const GLOBAL_INDEX_MAP: Record<string, string> = {
  dji: 'gb_$dji',
  spx: 'gb_$inx',
  ixic: 'gb_$ixic',
  hsi: 'rt_hkHSI',
  n225: 'gb_$n225',
}

const BATCH_CHUNK = 50

function parseHqList(text: string) {
  return text.trim().split('\n').map(parseHqLine).filter(Boolean)
}

export class SinaMarketHandler extends MarketHandlerShell {

  private async fetchQuotesBySymbols(symbols: string[]) {
    if (!symbols.length) return []
    const chunks: string[][] = []
    for (let i = 0; i < symbols.length; i += BATCH_CHUNK) {
      chunks.push(symbols.slice(i, i + BATCH_CHUNK))
    }
    const rows = []
    for (const chunk of chunks) {
      const text = await getSinaClient().fetchHqList(chunk)
      rows.push(...parseHqList(text))
    }
    return rows
  }

  async kline(code: string, period = 'daily', start = '', end = '') {
    if (period !== 'daily') return null
    try {
      const rows = await getSinaClient().fetchKlineRows(code, period, 1023)
      const mapped = mapSinaKlineRows(rows, code)
      if (!mapped?.length) return null
      const filtered = filterKlineByRange(mapped, start, end)
      return filtered.length ? filtered : mapped
    } catch {
      return null
    }
  }

  async indexKline(code: string, period = 'daily', start = '', end = '') {
    const rows = await this.kline(code, period, start, end)
    return rows as IndexKline[] | null
  }

  async realtime(code: string) {
    try {
      const text = await getSinaClient().fetchStockQuote(code)
      const row = parseHqList(text)[0]
      if (!row) return null
      const quote = mapStockHqQuote(row, code)
      return quote ? [quote] : null
    } catch {
      return null
    }
  }

  async batchRealtime(codes: string[]) {
    if (!codes.length) return null
    try {
      const pairs = codes.map(code => ({ code, symbol: toSinaListSymbol(code) }))
      const rows = await this.fetchQuotesBySymbols(pairs.map(p => p.symbol))
      const byKey = new Map(rows.map(r => [r!.key, r!]))
      const results: StockRealtime[] = []
      for (const pair of pairs) {
        const row = byKey.get(pair.symbol)
        if (!row) continue
        const quote = mapStockHqQuote(row, pair.code)
        if (quote) results.push(quote)
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }

  async indexRealtime(code: string) {
    try {
      const text = await getSinaClient().fetchIndexQuote(code)
      const row = parseHqList(text)[0]
      if (!row) return null
      const quote = mapIndexHqQuote(row, code)
      return quote ? [quote] : null
    } catch {
      return null
    }
  }

  async stockList(_market = 'all') {
    try {
      const all: StockListItem[] = []
      const totalRaw = await getSinaClient().fetchMarketStockCount('hs_a')
      const total = Number(totalRaw) || Number.POSITIVE_INFINITY
      const pageSize = 100
      const maxPages = Math.min(80, Math.ceil(total / pageSize) + 1)

      for (let page = 1; page <= maxPages; page += 1) {
        const batch = await getSinaClient().fetchStockListPage(page, pageSize)
        if (!Array.isArray(batch) || !batch.length) break
        for (const row of batch) {
          const code = normalizeCode(String(row.code ?? ''))
          if (!/^\d{6}$/.test(code)) continue
          all.push({
            code,
            name: String(row.name ?? ''),
            market: resolveMarket(code),
            industry: '',
          })
        }
        if (batch.length < pageSize) break
      }
      return all.length ? all : null
    } catch {
      return null
    }
  }

  async marketBreadth(_date = '') {
    try {
      let up = 0
      let down = 0
      let flat = 0
      const totalRaw = await getSinaClient().fetchMarketStockCount('hs_a')
      const total = Number(totalRaw) || Number.POSITIVE_INFINITY
      const pageSize = 100
      const maxPages = Math.min(80, Math.ceil(total / pageSize) + 1)

      for (let page = 1; page <= maxPages; page += 1) {
        const batch = await getSinaClient().fetchMarketBreadthPage(page, pageSize)
        if (!Array.isArray(batch) || !batch.length) break
        for (const row of batch) {
          const pct = safeFloat(row.changepercent)
          if (pct == null) continue
          if (pct > 0) up += 1
          else if (pct < 0) down += 1
          else flat += 1
        }
        if (batch.length < pageSize) break
      }

      const counted = up + down + flat
      if (!counted) return null
      return [{
        date: _date || new Date().toISOString().slice(0, 10),
        up,
        down,
        flat,
        total: counted,
      }]
    } catch {
      return null
    }
  }

  async globalIndex(code = '') {
    try {
      const keys = code ? [code] : Object.keys(GLOBAL_INDEX_MAP)
      const symbols = keys.map(k => GLOBAL_INDEX_MAP[k]).filter(Boolean)
      if (!symbols.length) return null
      const rows = await this.fetchQuotesBySymbols(symbols)
      const results = []
      for (const key of keys) {
        const sym = GLOBAL_INDEX_MAP[key]
        if (!sym) continue
        const row = rows.find(r => r?.key === sym)
        if (!row) continue
        const mapped = mapGlobalIndexHqQuote(row, key)
        if (mapped) results.push(mapped)
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }

}
