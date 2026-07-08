import type {
  IndexKline, IndexRealtime, MoneyFlow, NewsItem, StockKline, StockListItem,
  StockProfile, StockRealtime,
} from '../../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { isTencentHttpError, type TencentHttpError } from '../../api/errors.js'
import {
  fetchTencentBoardRankList,
  fetchTencentBigOrders,
  fetchTencentFundFlow,
  fetchTencentHyNews,
  fetchTencentJiankuang,
  fetchTencentKlineApp,
  fetchTencentMinuteRaw,
  fetchTencentNoticeList,
  fetchTencentPlateTags,
  fetchTencentRelatedPlates,
  fetchTencentResearchReports,
  fetchTencentSmartboxSearch,
  fetchTencentSqtQuotes,
  resolveTencentBoardCode,
} from '../../api/proxy.js'
import { fetchTencentGlobalIndexList } from '../../api/global-index-service.js'
import {
  fetchTencentKline,
  fetchTencentQuotes,
  TENCENT_FX,
  TENCENT_GLOBAL_INDEX,
} from '../../api/quotes.js'
import {
  mapTencentBoardRankRows,
  mapTencentHyNewsRows,
  mapTencentJiankuangProfile,
  mapTencentNoticeRows,
  mapTencentResearchReportRows,
  resolveTencentNewsChannel,
} from '../../normalize/content.js'
import { filterKlineByRange } from '../../normalize/kline.js'
import {
  mapTencentBigOrderRows,
  mapTencentFundFlowSeries,
  mapTencentKlineAppNodes,
  mapTencentMinuteKlines,
  mapTencentMinuteTicks,
  mapTencentPlateTagRows,
  mapTencentRelatedPlateRows,
  mapTencentSmartboxStocks,
  mapTencentSqtRealtime,
  parseTencentScopedMarket,
  resolveTencentKlineAppType,
} from '../../normalize/market.js'
import {
  mapTencentRealtime,
  tencentChangePct,
} from '../../normalize/quote.js'

async function tryTencentSources<T>(attempts: Array<() => Promise<T | null>>): Promise<T | null> {
  let lastError: TencentHttpError | undefined
  for (const attempt of attempts) {
    try {
      const result = await attempt()
      if (result != null) return result
    } catch (e) {
      if (isTencentHttpError(e)) lastError = e
      else throw e
    }
  }
  if (lastError) throw lastError
  return null
}

async function runTencentPartial<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (e) {
    if (isTencentHttpError(e)) return null
    throw e
  }
}

/**
 * 腾讯行情中心公开接口 — `stockapp.finance.qq.com` / `proxy.finance.qq.com`。
 */
export class TencentCnHandler extends MarketHandlerShell {

  private async loadRealtime(code: string): Promise<StockRealtime | null> {
    const sqtRows = await runTencentPartial(() => fetchTencentSqtQuotes([code]))
    const sqtHit = sqtRows?.[0]
    if (sqtHit) {
      const mapped = mapTencentSqtRealtime(code, sqtHit.fields)
      if (mapped) return mapped
    }
    const rows = await fetchTencentQuotes([code])
    const hit = rows[0]
    if (!hit) return null
    return mapTencentRealtime(code, hit.parts)
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    const q = await this.loadRealtime(code)
    return q ? [q] : null
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    if (!codes.length) return null
    const normalized = codes.map(c => normalizeCode(c))
    const out = new Map<string, StockRealtime>()

    const sqtRows = await runTencentPartial(() => fetchTencentSqtQuotes(normalized))
    if (sqtRows) {
      for (let i = 0; i < sqtRows.length; i += 1) {
        const row = sqtRows[i]!
        const mapped = mapTencentSqtRealtime(normalized[i] ?? row.symbol, row.fields)
        if (mapped) out.set(mapped.code, mapped)
      }
    }

    const missing = normalized.filter(c => !out.has(c))
    if (missing.length) {
      const rows = await fetchTencentQuotes(missing)
      for (const row of rows) {
        const q = mapTencentRealtime(row.code, row.parts)
        out.set(q.code, q)
      }
    }

    const results = normalized.map(c => out.get(c)).filter(Boolean) as StockRealtime[]
    return results.length ? results : null
  }

  async indexRealtime(code: string): Promise<IndexRealtime[] | null> {
    const batch = await this.realtime(code)
    if (batch) {
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
      }))
    }
    return null
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 320,
  ): Promise<StockKline[] | null> {
    const attempts: Array<() => Promise<StockKline[] | null>> = []
    if (period === 'daily' || period === 'weekly' || period === 'monthly') {
      const appType = resolveTencentKlineAppType(period)
      if (appType) {
        attempts.push(async () => {
          const data = await fetchTencentKlineApp(code, appType, count)
          const mapped = mapTencentKlineAppNodes(code, data.nodes ?? [])
          if (!mapped.length) return null
          const filtered = filterKlineByRange(mapped, start, end)
          return filtered.length ? filtered : mapped
        })
      }
      attempts.push(async () => {
        const rows = await fetchTencentKline(code, period, count)
        if (!rows?.length) return null
        const filtered = filterKlineByRange(rows, start, end)
        return filtered.length ? filtered : rows
      })
    }
    if (!attempts.length) return null
    return tryTencentSources(attempts)
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

  async stockList(market = 'all'): Promise<StockListItem[] | null> {
    const scoped = parseTencentScopedMarket(market)
    if (scoped.kind === 'search' && scoped.value) {
      const hits = await fetchTencentSmartboxSearch(scoped.value)
      const items = mapTencentSmartboxStocks(hits)
      if (items.length) return items
    }
    const boardCode = scoped.kind === 'board' ? resolveTencentBoardCode(scoped.value) : null
    if (boardCode) {
      const data = await fetchTencentBoardRankList({ boardCode, offset: 0, count: 100 })
      const items = mapTencentBoardRankRows(data.rank_list ?? [])
      if (items.length) return items
    }
    return null
  }

  async sectorList(plateType = '14'): Promise<Record<string, unknown>[] | null> {
    const stockCode = plateType.trim().match(/^stock:(.+)$/i)?.[1]
    if (!stockCode) return null
    const bare = normalizeCode(stockCode)
    const data = await fetchTencentPlateTags(bare)
    const rows = mapTencentPlateTagRows(bare, data)
    return rows.length ? rows : null
  }

  async peerCompanies(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentRelatedPlates(bare)
    const rows = mapTencentRelatedPlateRows(bare, data)
    return rows.length ? rows : null
  }

  async intradayTick(code: string, _date = ''): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const raw = await fetchTencentMinuteRaw(bare)
    const rows = mapTencentMinuteTicks(bare, raw)
    return rows.length ? rows : null
  }

  async minuteTrendKline(
    code: string,
    _ndays = 1,
    count = 0,
  ): Promise<StockKline[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    let rows = mapTencentMinuteKlines(bare, await fetchTencentMinuteRaw(bare))
    if (count > 0 && rows.length > count) rows = rows.slice(-count)
    return rows.length ? rows : null
  }

  async blockTrade(code: string): Promise<Record<string, unknown>[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentBigOrders(bare)
    const rows = mapTencentBigOrderRows(bare, data)
    return rows.length ? rows : null
  }

  async news(
    code: string,
    page = 1,
    pageSize = 20,
    newsType = 'all',
  ): Promise<NewsItem[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const channel = resolveTencentNewsChannel(newsType)
    const pg = Math.max(1, page)
    const n = Math.max(1, Math.min(pageSize, 50))

    if (channel === 'research') {
      const data = await fetchTencentResearchReports({ code: bare, page: pg, pageSize: n })
      const items = mapTencentResearchReportRows(bare, data.data ?? [])
      return items.length ? items : null
    }
    if (channel === 'notice') {
      const data = await fetchTencentNoticeList({ code: bare, page: pg, pageSize: n })
      const items = mapTencentNoticeRows(bare, data.data ?? [])
      return items.length ? items : null
    }
    const data = await fetchTencentHyNews({ code: bare, page: pg, pageSize: n })
    const items = mapTencentHyNewsRows(bare, data.news ?? [])
    return items.length ? items : null
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentJiankuang(bare)
    const profile = mapTencentJiankuangProfile(bare, data)
    return profile ? [profile] : null
  }

  async moneyFlow(code: string): Promise<MoneyFlow[] | null> {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentFundFlow(
      bare,
      'todayFundFlow,fiveDayFundFlow,historyFundFlow,todayFundTrend',
      20,
    )
    const rows = mapTencentFundFlowSeries(bare, data)
    return rows.length ? rows : null
  }

  async globalIndex(code = ''): Promise<Record<string, unknown>[] | null> {
    const query = code.trim()
    if (!query) {
      const result = await runTencentPartial(() => fetchTencentGlobalIndexList({
        region: 'ALL',
        page: 1,
        pageSize: 200,
        sortType: 1,
        order: 'desc',
      }))
      return result?.items.length ? result.items : null
    }

    const key = query.toLowerCase()
    const sym = TENCENT_GLOBAL_INDEX[key]
    if (!sym) {
      const all = await runTencentPartial(() => fetchTencentGlobalIndexList({
        region: 'ALL',
        page: 1,
        pageSize: 200,
      }))
      const hit = all?.items.find(item => {
        const c = String(item.code ?? '').toLowerCase()
        const q = String(item.qtCode ?? '').toLowerCase()
        return c === key || q.includes(key) || q.endsWith(key)
      })
      return hit ? [hit] : null
    }

    const rows = await runTencentPartial(() => fetchTencentQuotes([sym], { rawSymbols: true }))
    const parts = rows?.[0]?.parts
    if (!parts) return null
    return [{
      code: key,
      name: parts[1] || parts[0] || key,
      price: safeFloat(parts[3]),
      changePct: tencentChangePct(parts),
      market: 'global',
      source: 'tencent',
    }]
  }

  async exchangeRate(pair = ''): Promise<Record<string, unknown>[] | null> {
    const map = TENCENT_FX
    const keys = pair ? [pair.toUpperCase()] : Object.keys(map)
    const results: Record<string, unknown>[] = []
    for (const k of keys) {
      const sym = map[k]
      if (!sym) continue
      const rows = await fetchTencentQuotes([sym], { rawSymbols: true })
      const parts = rows[0]?.parts
      if (!parts) continue
      results.push({
        code: k,
        name: parts[1] || k,
        price: safeFloat(parts[3]),
        changePct: tencentChangePct(parts),
        source: 'tencent',
      })
    }
    return results.length ? results : null
  }
}
