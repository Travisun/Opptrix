import type {
  FinancialSummary,
  GlobalIndex,
  StockKline,
  StockListItem,
  StockProfile,
} from '../../../core/schema.js'
import type { IntradayTrendFetchResult } from '../../../utils/intraday-trends.js'
import type { StockMarket } from '../../../utils/helpers.js'
import { isCnEtfCode } from '../../../core/instrument.js'
import type { TickflowInstrument, TickflowPeriod, CompactKlineData } from '../api/client.js'
import { TickflowClient } from '../api/client.js'
import { tickflowRegion, toTickflowSymbol } from '../api/symbols.js'
import { isTickflowFeatureAllowed } from '../api/permissions.js'
import { MarketHandlerShell } from '../../common/driver-factory.js'
import {
  expandCompactKlines,
  mapTickflowInstrumentListItems,
  mapTickflowInstrumentProfiles,
  mergeFinancialSummary,
  mapBalanceSheetRecords,
  mapIncomeStatementRecords,
  mapCashFlowRecords,
  mapShareholderRecords,
  rowsForSymbol,
  mapTickflowDepth,
  mapTickflowQuotes,
  type TickflowMarketDepth,
} from '../normalize/index.js'
import {
  filterCnEtfListItems,
  mapKlinesToEtfNavRows,
  mapProfilesToEtfProfileRows,
} from '../../common/etf.js'
import {
  GLOBAL_INDEX_TICKFLOW,
  mapQuoteToGlobalIndex,
  resolveGlobalIndexAlias,
} from '../../common/free-proxies.js'
import type {
  TickflowMetricsRecord,
  TickflowIncomeRecord,
  TickflowBalanceSheetRecord,
  TickflowCashFlowRecord,
  TickflowSharesRecord,
} from '../normalize/financials.js'

const EXCHANGE_MARKETS = new Set(['SH', 'SZ', 'BJ', 'US', 'HK'])
const CN_EXCHANGES = ['SH', 'SZ', 'BJ'] as const

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function isUniverseId(market: string): boolean {
  const m = market.trim()
  if (!m || EXCHANGE_MARKETS.has(m.toUpperCase())) return false
  return m.includes('_') || m.includes('-')
}

function resolveExchangeTargets(market: string): string[] {
  const upper = market.trim().toUpperCase()
  if (EXCHANGE_MARKETS.has(upper)) return [upper]
  if (upper === 'ALL' || upper === 'CN') return [...CN_EXCHANGES]
  if (upper === 'US') return ['US']
  if (upper === 'HK') return ['HK']
  return []
}

async function fetchInstrumentsBySymbols(
  client: TickflowClient,
  symbols: string[],
): Promise<TickflowInstrument[]> {
  const out: TickflowInstrument[] = []
  for (const part of chunk(symbols, 500)) {
    const json = await client.postInstruments({ symbols: part })
    const rows = (json.data ?? []) as TickflowInstrument[]
    out.push(...rows)
  }
  return out
}

function compactKlineToIntradaySessions(
  tickflowSymbol: string,
  data: CompactKlineData,
  period: TickflowPeriod = '1m',
): IntradayTrendFetchResult | null {
  const region = tickflowRegion(tickflowSymbol)
  if (!region) return null
  const bars = expandCompactKlines(tickflowSymbol, data, period, region)
  if (!bars.length) return null

  const sessionMap = new Map<string, StockKline[]>()
  for (const bar of bars) {
    const sessionDate = bar.date.slice(0, 10)
    const list = sessionMap.get(sessionDate) ?? []
    list.push(bar)
    sessionMap.set(sessionDate, list)
  }

  const sessions = [...sessionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionDate, sessionBars]) => ({
      sessionDate,
      preClose: null as number | null,
      bars: sessionBars
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(bar => ({
          time: bar.date.length > 10 ? bar.date : `${sessionDate} 09:30:00`,
          price: bar.close,
          volume: bar.volume ?? 0,
          amount: bar.amount ?? 0,
          avgPrice: bar.close,
        })),
    }))

  const apiPreClose = data.prev_close?.[0] ?? null
  if (sessions.length && apiPreClose != null) {
    sessions[sessions.length - 1].preClose = apiPreClose
  }

  return sessions.length ? { sessions, apiPreClose } : null
}

function buildFinancialsQuery(symbol: string, reportDate = '') {
  const hint = reportDate ? reportDate.slice(0, 10) : ''
  return {
    symbols: symbol,
    start_date: hint || undefined,
    end_date: hint || undefined,
    latest: hint ? undefined : true,
  }
}

/** Metadata, financials, depth, and intraday helpers shared by TickflowMarketHandler. */
export abstract class TickflowCommonHandler extends MarketHandlerShell {
  protected abstract client(): TickflowClient | null

  protected tickflowSymbol(code: string): string {
    return toTickflowSymbol(code)
  }

  async stockList(market = 'CN', keyword = ''): Promise<StockListItem[] | null> {
    const client = this.client()
    if (!client) return null

    try {
      const exchanges = resolveExchangeTargets(market)
      let instruments: TickflowInstrument[] = []

      if (exchanges.length) {
        const batches = await Promise.all(
          exchanges.map(ex => client.getExchangeInstruments(ex, 'stock')),
        )
        for (const json of batches) {
          instruments.push(...((json.data ?? []) as TickflowInstrument[]))
        }
      } else if (isUniverseId(market)) {
        const json = await client.getUniverse(market.trim())
        const detail = json.data as { symbols?: string[] } | undefined
        const symbols = detail?.symbols ?? []
        if (!symbols.length) return null
        instruments = await fetchInstrumentsBySymbols(client, symbols)
      } else {
        const json = await client.getUniverse(market.trim())
        const detail = json.data as { symbols?: string[] } | undefined
        const symbols = detail?.symbols ?? []
        if (!symbols.length) return null
        instruments = await fetchInstrumentsBySymbols(client, symbols)
      }

      const rows = mapTickflowInstrumentListItems(instruments, keyword)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /**
   * 单股或筛选列表 — Capability `STOCK_BASIC`。
   *
   * @param code 6 位代码；空则等同 `stockList('CN')`
   * @param listStatus 保留参数，与引擎接口一致（TickFlow 无退市状态过滤）
   */
  async stockBasic(code = '', listStatus = 'L'): Promise<StockListItem[] | null> {
    const bare = code.trim()
    if (!bare) return this.stockList('CN')

    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(bare)
    try {
      const json = await client.getInstruments({ symbols: symbol })
      const rows = (json.data ?? []) as TickflowInstrument[]
      const items = mapTickflowInstrumentListItems(rows, '')
      if (!items.length) return null
      if (listStatus === 'D') return null
      return items
    } catch {
      return null
    }
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getInstruments({ symbols: symbol })
      const rows = (json.data ?? []) as TickflowInstrument[]
      if (!rows.length) return null
      return mapTickflowInstrumentProfiles(rows)
    } catch {
      return null
    }
  }

  async financials(
    code: string,
    reportDate = '',
    reportType = 'annual',
  ): Promise<FinancialSummary[] | null> {
    if (!isTickflowFeatureAllowed('financial')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    const quarterly = reportType === 'quarter' || reportType === 'quarterly'
    const query = buildFinancialsQuery(symbol, reportDate)

    try {
      const [metricsJson, incomeJson] = await Promise.all([
        client.getFinancialsMetrics(query),
        client.getFinancialsIncome(query),
      ])
      const metrics = rowsForSymbol(
        metricsJson.data as Record<string, TickflowMetricsRecord[]> | undefined,
        symbol,
      )
      const income = rowsForSymbol(
        incomeJson.data as Record<string, TickflowIncomeRecord[]> | undefined,
        symbol,
      )
      const rows = mergeFinancialSummary(
        symbol,
        metrics,
        income,
        quarterly ? 'quarterly' : 'annual',
      )
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async balanceSheet(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('financial')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsBalanceSheet(buildFinancialsQuery(symbol, reportDate))
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowBalanceSheetRecord[]> | undefined,
        symbol,
      )
      const mapped = mapBalanceSheetRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async incomeStatement(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('financial')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsIncome(buildFinancialsQuery(symbol, reportDate))
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowIncomeRecord[]> | undefined,
        symbol,
      )
      const mapped = mapIncomeStatementRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async cashFlow(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('financial')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsCashFlow(buildFinancialsQuery(symbol, reportDate))
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowCashFlowRecord[]> | undefined,
        symbol,
      )
      const mapped = mapCashFlowRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 股本结构 — Capability `SHAREHOLDER`（`/v1/financials/shares`）。
   *
   * @param code 6 位股票代码
   * @param reportDate 报告期 YYYY-MM-DD，空则返回最近若干期
   */
  async shareholders(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('financial')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getFinancialsShares(buildFinancialsQuery(symbol, reportDate))
      const rows = rowsForSymbol(
        json.data as Record<string, TickflowSharesRecord[]> | undefined,
        symbol,
      )
      const mapped = mapShareholderRecords(symbol, rows, reportDate)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /** Optional research helper — TickFlow five-level depth. */
  async fetchDepth(code: string): Promise<Record<string, unknown> | null> {
    if (!isTickflowFeatureAllowed('depth')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getDepth(symbol)
      const depth = json.data as TickflowMarketDepth | undefined
      if (!depth) return null
      return mapTickflowDepth(depth)
    } catch {
      return null
    }
  }

  /** Intraday sessions via TickFlow /v1/klines/intraday (API: 当日分钟 K，不含历史多日). */
  async fetchIntradaySessions(
    code: string,
    _ndays = 5,
    _market?: StockMarket,
  ): Promise<IntradayTrendFetchResult | null> {
    if (!isTickflowFeatureAllowed('intraday')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    try {
      const json = await client.getKlinesIntraday({ symbol, period: '1m' })
      const data = json.data as CompactKlineData | undefined
      if (!data) return null
      return compactKlineToIntradaySessions(symbol, data, '1m')
    } catch {
      return null
    }
  }

  async minuteTrendKline(
    code: string,
    _ndays = 1,
    count = 0,
    _market?: StockMarket,
  ): Promise<StockKline[] | null> {
    if (!isTickflowFeatureAllowed('intraday')) return null
    const client = this.client()
    if (!client) return null
    const symbol = this.tickflowSymbol(code)
    const region = tickflowRegion(symbol)
    if (!region) return null
    try {
      const json = await client.getKlinesIntraday({
        symbol,
        period: '1m',
        count: count > 0 ? count : undefined,
      })
      const data = json.data as CompactKlineData | undefined
      if (!data) return null
      let rows = expandCompactKlines(symbol, data, '1m', region)
      if (count > 0 && rows.length > count) rows = rows.slice(-count)
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /**
   * 当日分时逐条记录 — Capability `INTRADAY_TICK` 标准方法。
   *
   * TickFlow 仅提供当日分钟 K；`date` 参数保留与引擎接口一致。
   *
   * @param code 6 位股票代码
   * @param _date 保留参数（TickFlow 仅当日）
   */
  async intradayTick(code: string, _date = ''): Promise<Record<string, unknown>[] | null> {
    if (!isTickflowFeatureAllowed('intraday')) return null
    const rows = await this.minuteTrendKline(code, 1, 0)
    if (!rows) return null
    return rows.map(bar => ({
      code: bar.code,
      time: bar.date,
      price: bar.close,
      volume: bar.volume ?? null,
      amount: bar.amount ?? null,
      source: 'tickflow',
    }))
  }

  /** ETF 列表 — 免费 `GET /v1/exchanges/{ex}/instruments?type=etf` */
  async etfList(_market = 'CN', etfCode = ''): Promise<StockListItem[] | null> {
    const bare = etfCode.trim()
    if (bare) {
      if (!isCnEtfCode(bare)) return null
      return this.stockBasic(bare)
    }
    const client = this.client()
    if (!client) return null
    try {
      const batches = await Promise.all(
        CN_EXCHANGES.map(ex => client.getExchangeInstruments(ex, 'etf')),
      )
      const instruments: TickflowInstrument[] = []
      for (const json of batches) {
        instruments.push(...((json.data ?? []) as TickflowInstrument[]))
      }
      const rows = mapTickflowInstrumentListItems(instruments, '')
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** ETF 概况 — 免费 `/v1/instruments` */
  async etfProfile(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const profiles = await this.profile(etfCode)
    if (!profiles) return null
    const mapped = mapProfilesToEtfProfileRows(profiles)
    return mapped.length ? mapped : null
  }

  /**
   * 全球指数 — Capability `GLOBAL_INDEX`。
   * 免费 quotes：美股/港股 ETF 跟踪全球主要指数；A 股指数走 indexRealtime。
   */
  async globalIndex(code = ''): Promise<GlobalIndex[] | null> {
    const alias = resolveGlobalIndexAlias(code)
    const client = this.client()
    if (!client) return null

    if (alias.kind === 'cn' && alias.cn) {
      try {
        const symbol = toTickflowSymbol('CN', alias.cn.indexCode)
        const json = await client.getQuotes({ symbols: symbol })
        const quotes = mapTickflowQuotes(json.data)
        const q = quotes[0]
        if (!q) return null
        return [mapQuoteToGlobalIndex(alias.cn.outCode, alias.cn.name, 'CN', {
          price: q.price,
          changePct: q.changePct,
          name: q.name,
        })]
      } catch {
        return null
      }
    }

    const targets = alias.kind === 'tickflow' && alias.tickflow
      ? [alias.tickflow]
      : Object.values(GLOBAL_INDEX_TICKFLOW).filter((v, i, arr) => arr.findIndex(x => x.outCode === v.outCode) === i)

    const symbols = targets.map(t => t.symbol).join(',')
    try {
      const json = await client.getQuotes({ symbols })
      const quotes = mapTickflowQuotes(json.data)
      const bySymbol = new Map(quotes.map(q => [String(q.code ?? '').toUpperCase(), q]))
      const out: GlobalIndex[] = []
      for (const t of targets) {
        const bare = t.symbol.split('.')[0]!.toUpperCase()
        const q = [...bySymbol.entries()].find(([k]) => k.includes(bare))?.[1]
          ?? quotes.find(row => String(row.code).toUpperCase().includes(bare))
        if (!q) continue
        out.push(mapQuoteToGlobalIndex(t.outCode, t.name, t.market, {
          price: q.price,
          changePct: q.changePct,
          name: q.name,
        }))
      }
      if (alias.kind === 'tickflow') return out.length ? out : null
      return out.length ? out : null
    } catch {
      return null
    }
  }
}

