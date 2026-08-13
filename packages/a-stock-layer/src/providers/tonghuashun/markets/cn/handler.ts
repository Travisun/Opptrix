import type {
  Dividend, DragonTiger, FinancialSummary, IndexKline, IndexRealtime,
  LimitUpDown, SentimentData, StockKline, StockListItem, StockProfile, StockRealtime,
} from '../../../../core/schema.js'
import { isCnEtfCode } from '../../../../core/instrument.js'
import { isShIndexCode, normalizeCode } from '../../../../utils/helpers.js'
import { createNameCache } from '../../../../utils/lru-map.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { FuyaoClient } from '../../api/client.js'
import { isTonghuashunEnabled } from '../../config.js'
import { fromThsCode, toIndexThsCode, toThsCode } from '../../api/symbols.js'
import {
  mapAdjustmentToDividend,
  mapDragonTigerStock,
  mapHistoricalBarToIndexKline,
  mapHistoricalBarToKline,
  mapHotStockSentiment,
  mapIncomeRow,
  mapIncomeStatementRows,
  mapBalanceSheetRows,
  mapCashFlowRows,
  mapLimitUpRow,
  mapSnapshotToIndexRealtime,
  mapSnapshotToStockRealtime,
  mapTickerItem,
  mapTickerToProfile,
  resampleKlines,
  applyValuationToStockRealtime,
  buildValuationProfileMetrics,
  indexValuationItems,
  mapValuationSnapshotItem,
} from '../../normalize/index.js'
import {
  mapFundHistoricalBarsToKlines,
  mapFundMarketSnapshotToStockRealtime,
} from '../../normalize/fund.js'

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ymdToMs(v: string, endOfDay = false): number {
  const base = v.slice(0, 10)
  const d = new Date(`${base}T${endOfDay ? '23:59:59' : '00:00:00'}+08:00`)
  return d.getTime()
}

function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isIndexCode(code: string): boolean {
  const c = normalizeCode(code)
  return isShIndexCode(c) || c.startsWith('399') || c.startsWith('88')
}

/** 同花顺金融数据 API（fuyao.aicubes.cn） */
export class TonghuashunMarketHandler extends MarketHandlerShell {
  private nameCache = createNameCache()

  private client(): FuyaoClient | null {
    if (!isTonghuashunEnabled()) return null
    return FuyaoClient.fromConfig()
  }

  protected async withClient<T>(fn: (client: FuyaoClient) => Promise<T>): Promise<T | null> {
    const client = this.client()
    if (!client) return null
    try {
      return await fn(client)
    } catch {
      return null
    }
  }

  private async resolveName(client: FuyaoClient, code: string): Promise<string> {
    const c = normalizeCode(code)
    const cached = this.nameCache.get(c)
    if (cached) return cached
    const assetType = isCnEtfCode(c) ? 'fund-etf' : 'a-share'
    const data = await client.tickersSearch(c, 3, assetType)
    const hit = (data.item ?? []).find(it => fromThsCode(String(it.thscode ?? '')) === c)
      ?? data.item?.[0]
    const name = String(hit?.name ?? c)
    this.nameCache.set(c, name)
    return name
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    if (isCnEtfCode(code)) {
      return this.withClient(async client => {
        const thscode = toThsCode(code)
        const [snap, name] = await Promise.all([
          client.fundMarketSnapshot(thscode),
          this.resolveName(client, code),
        ])
        const item = snap.item?.[0]
        if (!item) return null
        return [mapFundMarketSnapshotToStockRealtime(item, name)]
      })
    }
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const [snap, name, valSnap] = await Promise.all([
        client.pricesSnapshot(thscode),
        this.resolveName(client, code),
        client.valuationsSnapshot(thscode).catch(() => ({ item: [] })),
      ])
      const item = snap.item?.[0]
      if (!item) return null
      const valItem = (valSnap.item ?? []).find(
        it => fromThsCode(String(it.thscode ?? '')) === normalizeCode(code),
      ) ?? valSnap.item?.[0]
      const row = mapSnapshotToStockRealtime(item, name)
      return [applyValuationToStockRealtime(row, mapValuationSnapshotItem(valItem))]
    })
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    if (!codes.length) return null
    const etfCodes = codes.filter(c => isCnEtfCode(c))
    const stockCodes = codes.filter(c => !isCnEtfCode(c))
    return this.withClient(async client => {
      const out: StockRealtime[] = []

      if (stockCodes.length) {
        const thscodes = stockCodes.map(toThsCode)
        const [snap, valSnap] = await Promise.all([
          client.pricesSnapshot(thscodes),
          client.valuationsSnapshot(thscodes).catch(() => ({ item: [] })),
        ])
        const valByThscode = indexValuationItems(valSnap.item ?? [])
        for (const item of snap.item ?? []) {
          const c = fromThsCode(String(item.thscode ?? ''))
          const name = await this.resolveName(client, c)
          const thscode = String(item.thscode ?? toThsCode(c))
          const row = mapSnapshotToStockRealtime(item, name)
          out.push(applyValuationToStockRealtime(row, valByThscode.get(thscode)))
        }
      }

      if (etfCodes.length) {
        const etfRows = await Promise.all(
          etfCodes.map(async c => {
            const thscode = toThsCode(c)
            const [snap, name] = await Promise.all([
              client.fundMarketSnapshot(thscode),
              this.resolveName(client, c),
            ])
            const item = snap.item?.[0]
            if (!item) return null
            return mapFundMarketSnapshotToStockRealtime(item, name)
          }),
        )
        for (const row of etfRows) {
          if (row) out.push(row)
        }
      }

      return out.length ? out : null
    })
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<StockKline[] | null> {
    const p = period.toLowerCase()
    if (p !== 'daily' && p !== 'weekly' && p !== 'monthly' && p !== 'day' && p !== 'week' && p !== 'month') {
      return null
    }
    if (isCnEtfCode(code)) {
      return this.withClient(async client => {
        const thscode = toThsCode(code)
        const endMs = end ? ymdToMs(end, true) : Date.now()
        const startMs = start
          ? ymdToMs(start)
          : ymdToMs(ymdDaysAgo(count ? Math.min(count * 2, 3650) : 800))
        const bars = await client.fundMarketHistorical(thscode, startMs, endMs, '1d')
        let mapped = mapFundHistoricalBarsToKlines(code, bars)
        if (p.startsWith('week')) mapped = resampleKlines(mapped, 'weekly')
        if (p.startsWith('month')) mapped = resampleKlines(mapped, 'monthly')
        if (start) mapped = mapped.filter(b => b.date >= start.slice(0, 10))
        if (end) mapped = mapped.filter(b => b.date <= end.slice(0, 10))
        if (count && mapped.length > count) mapped = mapped.slice(-count)
        return mapped.length ? mapped : null
      })
    }
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const endMs = end ? ymdToMs(end, true) : Date.now()
      const startMs = start
        ? ymdToMs(start)
        : ymdToMs(ymdDaysAgo(count ? Math.min(count * 2, 3650) : 800))
      const bars = await client.pricesHistorical(thscode, startMs, endMs, 'forward')
      let mapped = bars.map(bar => mapHistoricalBarToKline(code, bar))
      if (p.startsWith('week')) mapped = resampleKlines(mapped, 'weekly')
      if (p.startsWith('month')) mapped = resampleKlines(mapped, 'monthly')
      if (start) mapped = mapped.filter(b => b.date >= start.slice(0, 10))
      if (end) mapped = mapped.filter(b => b.date <= end.slice(0, 10))
      if (count && mapped.length > count) mapped = mapped.slice(-count)
      return mapped.length ? mapped : null
    })
  }

  async indexRealtime(code: string): Promise<IndexRealtime[] | null> {
    return this.withClient(async client => {
      const thscode = toIndexThsCode(code)
      const snap = await client.indexPricesSnapshot(thscode)
      const item = snap.item?.[0]
      if (!item) return null
      const name = await this.resolveName(client, fromThsCode(String(item.thscode ?? code)))
      return [mapSnapshotToIndexRealtime(item, name)]
    })
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<IndexKline[] | null> {
    const interval = period.toLowerCase().startsWith('week') ? '1w'
      : period.toLowerCase().startsWith('month') ? '1mo' : '1d'
    return this.withClient(async client => {
      const thscode = toIndexThsCode(code)
      const endMs = end ? ymdToMs(end, true) : Date.now()
      const startMs = start ? ymdToMs(start) : ymdToMs(ymdDaysAgo(count ? Math.min(count * 2, 3650) : 800))
      const data = await client.indexPricesHistorical(thscode, startMs, endMs, interval)
      let mapped = (data.item ?? []).map(bar => mapHistoricalBarToIndexKline(code, bar))
      if (count && mapped.length > count) mapped = mapped.slice(-count)
      return mapped.length ? mapped : null
    })
  }

  async stockList(_market = 'all'): Promise<StockListItem[] | null> {
    return this.withClient(async client => {
      const rows = await client.tickersListAll('a-share')
      const mapped = rows.map(mapTickerItem).filter(r => r.code)
      for (const row of mapped) {
        if (row.name) this.nameCache.set(row.code, row.name)
      }
      return mapped.length ? mapped : null
    })
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    if (isCnEtfCode(code)) {
      return this.withClient(async client => {
        const data = await client.tickersSearch(normalizeCode(code), 5, 'fund-etf')
        const hit = (data.item ?? []).find(it => fromThsCode(String(it.thscode ?? '')) === normalizeCode(code))
          ?? data.item?.[0]
        if (!hit) return null
        const profile = mapTickerToProfile(hit)
        if (profile.name) this.nameCache.set(profile.code, profile.name)
        return [profile]
      })
    }
    return this.withClient(async client => {
      const bare = normalizeCode(code)
      const thscode = toThsCode(bare)
      const [searchData, valSnap] = await Promise.all([
        client.tickersSearch(bare, 5),
        client.valuationsSnapshot(thscode).catch(() => ({ item: [] })),
      ])
      const hit = (searchData.item ?? []).find(it => fromThsCode(String(it.thscode ?? '')) === bare)
        ?? searchData.item?.[0]
      if (!hit) return null
      const profile = mapTickerToProfile(hit)
      const valItem = (valSnap.item ?? []).find(
        it => fromThsCode(String(it.thscode ?? '')) === bare,
      ) ?? valSnap.item?.[0]
      const metrics = buildValuationProfileMetrics(valItem)
      if (metrics.length) profile.profileMetrics = metrics
      if (profile.name) this.nameCache.set(profile.code, profile.name)
      return [profile]
    })
  }

  async financials(
    code: string,
    _reportDate = '',
    reportType: 'annual' | 'quarter' | 'all' = 'annual',
  ): Promise<FinancialSummary[] | null> {
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const quarterly = reportType === 'quarter' || reportType === 'all'
      const annual = reportType === 'annual' || reportType === 'all'
      const rows: FinancialSummary[] = []
      if (quarterly) {
        const q = await client.financialsIncome(thscode, 'quarterly', 20)
        rows.push(...(q.item ?? []).map(r => mapIncomeRow(code, r)))
      }
      if (annual) {
        const a = await client.financialsIncome(thscode, 'annual', 20)
        rows.push(...(a.item ?? []).map(r => mapIncomeRow(code, r)))
      }
      const dedup = new Map<string, FinancialSummary>()
      for (const row of rows) {
        dedup.set(`${row.reportDate}:${row.reportType}`, row)
      }
      const out = [...dedup.values()].sort((a, b) => (b.reportDate ?? '').localeCompare(a.reportDate ?? ''))
      return out.length ? out : null
    })
  }

  async balanceSheet(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const data = await client.financialsBalanceSheets(thscode, 'quarterly', 20)
      const mapped = mapBalanceSheetRows(code, data.item ?? [], reportDate)
      return mapped.length ? mapped : null
    })
  }

  async incomeStatement(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const data = await client.financialsIncome(thscode, 'quarterly', 20)
      const mapped = mapIncomeStatementRows(code, data.item ?? [], reportDate)
      return mapped.length ? mapped : null
    })
  }

  async cashFlow(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const data = await client.financialsCashFlowStatements(thscode, 'quarterly', 20)
      const mapped = mapCashFlowRows(code, data.item ?? [], reportDate)
      return mapped.length ? mapped : null
    })
  }

  /** 同花顺指数/板块成分 — Capability INDEX_CONST */
  async indexConstituents(indexCode: string): Promise<Record<string, unknown>[] | null> {
    const thscode = toIndexThsCode(indexCode)
    if (!thscode) return null
    return this.withClient(async client => {
      const data = await client.thsIndexConstituents(thscode)
      const rows = (data.item ?? []).map(row => ({
        ...row,
        indexCode: normalizeCode(indexCode),
        source: 'tonghuashun',
      }))
      return rows.length ? rows : null
    })
  }

  async dividend(code: string): Promise<Dividend[] | null> {
    return this.withClient(async client => {
      const thscode = toThsCode(code)
      const data = await client.adjustmentFactors(thscode)
      const mapped = (data.item ?? [])
        .map(r => mapAdjustmentToDividend(code, r))
        .filter((r): r is Dividend => r != null)
      return mapped.length ? mapped : null
    })
  }

  async tradeCalendar(year?: number): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const data = await client.tradingDays()
      const y = year ?? new Date().getFullYear()
      const prefix = String(y)
      const rows = (data.item ?? [])
        .map(it => ({
          date: String(it.date ?? msToYmdCompat(it.date_ms)),
          isTradeDay: true,
        }))
        .filter(r => r.date.startsWith(prefix) || String(r.date).startsWith(prefix.replace(/-/g, '')))
      return rows.length ? rows : null
    })
  }

  async dragonTiger(date = ''): Promise<DragonTiger[] | null> {
    return this.withClient(async client => {
      const data = await client.dragonTigerList(date || undefined)
      const tradeDate = String(data.trade_date ?? date ?? todayYmd()).slice(0, 10)
      const stocks = [
        ...((data.stock_items as Record<string, unknown>[] | undefined) ?? []),
      ]
      const mapped = stocks.map(r => mapDragonTigerStock(r, tradeDate))
      return mapped.length ? mapped : null
    })
  }

  async limitUpdown(date = ''): Promise<LimitUpDown[] | null> {
    return this.withClient(async client => {
      const dateMs = date ? ymdToMs(date) : undefined
      const data = await client.limitUpPool(dateMs, 1, 200)
      const mapped = (data.item ?? []).map(mapLimitUpRow)
      return mapped.length ? mapped : null
    })
  }

  async sentiment(code: string): Promise<SentimentData[] | null> {
    return this.withClient(async client => {
      const data = await client.hotStockList('day')
      const c = normalizeCode(code)
      const hit = (data.item ?? []).find(it => fromThsCode(String(it.thscode ?? '')) === c)
      if (!hit) return null
      return [mapHotStockSentiment(code, hit)]
    })
  }
}

function msToYmdCompat(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n)) return ''
  const d = new Date(n)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
