import type { IndexKline, IndexRealtime, StockKline, StockListItem, StockRealtime } from '../../../../core/schema.js'
import { normalizeCode, resolveMarket, safeFloat } from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { getNeteaseClient } from '../../api/client.js'
import { toNeteaseCode } from '../../api/symbols.js'
import { parseNeteaseKlineCsv } from '../../normalize/kline.js'
import { mapFeedIndexQuote, mapFeedQuote } from '../../normalize/quote.js'

export class NeteaseMarketHandler extends MarketHandlerShell {

  async kline(code: string, period = 'daily', start = '', end = '') {
    if (period !== 'daily') return null
    try {
      const text = await getNeteaseClient().fetchHistoricalKlineCsv(code, start, end)
      if (!text.includes('日期')) return null
      return parseNeteaseKlineCsv(text, code)
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
      const neteaseCode = toNeteaseCode(code)
      const feed = await getNeteaseClient().fetchFeedQuotes([neteaseCode])
      const item = feed[neteaseCode]
      if (!item) return null
      return [mapFeedQuote(item, code)]
    } catch {
      return null
    }
  }

  async batchRealtime(codes: string[]) {
    if (!codes.length) return null
    try {
      const pairs = codes.map(c => ({ code: c, neteaseCode: toNeteaseCode(c) }))
      const feed = await getNeteaseClient().fetchFeedQuotes(pairs.map(p => p.neteaseCode))
      const results: StockRealtime[] = []
      for (const pair of pairs) {
        const item = feed[pair.neteaseCode]
        if (item) results.push(mapFeedQuote(item, pair.code))
      }
      return results.length ? results : null
    } catch {
      return null
    }
  }

  async indexRealtime(code: string) {
    try {
      const neteaseCode = toNeteaseCode(code)
      const feed = await getNeteaseClient().fetchFeedQuotes([neteaseCode])
      const item = feed[neteaseCode]
      if (!item) return null
      return [mapFeedIndexQuote(item, code)]
    } catch {
      return null
    }
  }

  async stockList(_market = 'all') {
    try {
      const all: StockListItem[] = []
      for (let page = 1; page <= 10; page += 1) {
        const batch = await getNeteaseClient().fetchStockListPage(page, 500)
        if (!batch.length) break
        for (const row of batch) {
          const symbol = String(row.SYMBOL ?? row.CODE ?? row.code ?? '')
          const code = normalizeCode(symbol.slice(-6) || symbol)
          if (!/^\d{6}$/.test(code)) continue
          all.push({
            code,
            name: String(row.NAME ?? row.SNAME ?? row.name ?? ''),
            market: resolveMarket(code),
            industry: String(row.INDUSTRY ?? row.industry ?? ''),
          })
        }
        if (batch.length < 500) break
      }
      return all.length ? all : null
    } catch {
      return null
    }
  }

  async marketBreadth(_date = '') {
    try {
      const feed = await getNeteaseClient().fetchMarketBreadthSnapshot()
      const rankUp = feed.RANK_AUP as Record<string, unknown> | undefined
      const rankDown = feed.RANK_ADOWN as Record<string, unknown> | undefined
      const shRank = feed.HSRANK_COUNT_SHA as Record<string, unknown> | undefined
      const szRank = feed.HSRANK_COUNT_SZA as Record<string, unknown> | undefined
      const up = safeFloat(rankUp?.price ?? rankUp?.volume)
      const down = safeFloat(rankDown?.price ?? rankDown?.volume)
      const shTotal = safeFloat(shRank?.price)
      const szTotal = safeFloat(szRank?.price)
      const total = (shTotal ?? 0) + (szTotal ?? 0)
      if (up == null && down == null && !total) return null
      const flat = total && up != null && down != null
        ? Math.max(0, total - up - down)
        : 0
      return [{
        date: _date || new Date().toISOString().slice(0, 10),
        up: up ?? 0,
        down: down ?? 0,
        flat,
        total: total || ((up ?? 0) + (down ?? 0) + flat),
      }]
    } catch {
      return null
    }
  }

}
