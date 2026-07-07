import type {
  IndexKline, IndexRealtime, StockKline, StockListItem, StockRealtime,
} from '../../../../core/schema.js'
import { normalizeCode } from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { isWebfeedHttpError, type WebfeedHttpError } from '../../api/errors.js'
import { tryWebfeedSources } from '../../api/fallback.js'
import {
  fetchSinaHqList,
  fetchSinaIndexQuote,
  fetchSinaKlineRows,
  fetchSinaMarketBreadth,
  fetchSinaQuotesBySymbols,
  fetchSinaStockList,
  fetchSinaStockQuote,
  SINA_GLOBAL_INDEX,
} from '../../api/sina.js'
import { toSinaListSymbol } from '../../api/symbols.js'
import {
  mapGlobalIndexHqQuote,
  mapIndexHqQuote,
  mapStockHqQuote,
  parseHqLine,
} from '../../normalize/quote.js'
import { filterKlineByRange, mapSinaKlineRows } from '../../normalize/kline.js'

/**
 * 网络补充 — 新浪财经等公开免费接口，作主源失败时的回退层。
 */
export class WebfeedCnHandler extends MarketHandlerShell {

  private async sinaRealtime(code: string): Promise<StockRealtime | null> {
    const text = await fetchSinaStockQuote(code)
    const row = text.trim().split('\n').map(parseHqLine).filter(Boolean)[0]
    if (!row) return null
    return mapStockHqQuote(row, code)
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    const q = await this.sinaRealtime(code)
    return q ? [q] : null
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    if (!codes.length) return null
    const normalized = codes.map(c => normalizeCode(c))
    const out = new Map<string, StockRealtime>()
    let lastError: WebfeedHttpError | undefined

    try {
      const pairs = normalized.map(code => ({ code, symbol: toSinaListSymbol(code) }))
      const sinaRows = await fetchSinaQuotesBySymbols(pairs.map(p => p.symbol))
      const byKey = new Map(sinaRows.map(r => [r!.key, r!]))
      for (const pair of pairs) {
        const row = byKey.get(pair.symbol)
        if (!row) continue
        const quote = mapStockHqQuote(row, pair.code)
        if (quote) out.set(quote.code, quote)
      }
    } catch (e) {
      if (isWebfeedHttpError(e)) lastError = e
      else throw e
    }

    const results = normalized.map(c => out.get(c)).filter(Boolean) as StockRealtime[]
    if (!results.length && lastError) throw lastError
    return results.length ? results : null
  }

  async indexRealtime(code: string): Promise<IndexRealtime[] | null> {
    const quote = await tryWebfeedSources([
      async () => {
        const text = await fetchSinaIndexQuote(code)
        const row = text.trim().split('\n').map(parseHqLine).filter(Boolean)[0]
        return row ? mapIndexHqQuote(row, code) : null
      },
    ])
    return quote ? [quote] : null
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 320,
  ): Promise<StockKline[] | null> {
    if (period !== 'daily') return null
    const raw = await fetchSinaKlineRows(code, Math.min(count || 1023, 1023))
    const mapped = mapSinaKlineRows(raw, code)
    if (!mapped?.length) return null
    const filtered = filterKlineByRange(mapped, start, end)
    return filtered.length ? filtered : mapped
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 320,
  ): Promise<IndexKline[] | null> {
    const rows = await this.kline(code, period, start, end, count)
    return rows as IndexKline[] | null
  }

  async stockList(_market = 'all'): Promise<StockListItem[] | null> {
    return fetchSinaStockList()
  }

  async marketBreadth(date = ''): Promise<Record<string, unknown>[] | null> {
    return fetchSinaMarketBreadth(date)
  }

  async globalIndex(code = ''): Promise<Record<string, unknown>[] | null> {
    const keys = code ? [code.trim().toLowerCase()] : Object.keys(SINA_GLOBAL_INDEX)
    const results: Record<string, unknown>[] = []
    let lastError: WebfeedHttpError | undefined

    try {
      const symbols = keys.map(k => SINA_GLOBAL_INDEX[k]).filter(Boolean)
      if (symbols.length) {
        const text = await fetchSinaHqList(symbols)
        const parsed = text.trim().split('\n').map(parseHqLine).filter(Boolean)
        for (const key of keys) {
          const sym = SINA_GLOBAL_INDEX[key]
          if (!sym) continue
          const row = parsed.find(r => r?.key === sym)
          if (!row) continue
          const mapped = mapGlobalIndexHqQuote(row, key)
          if (mapped) results.push({ ...mapped, source: 'sina' })
        }
      }
    } catch (e) {
      if (isWebfeedHttpError(e)) lastError = e
      else throw e
    }

    if (!results.length && lastError) throw lastError
    return results.length ? results : null
  }

  async exchangeRate(_pair = ''): Promise<Record<string, unknown>[] | null> {
    return null
  }
}
