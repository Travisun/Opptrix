import type {
  Dividend, FinancialSummary, IndexKline, StockKline, StockListItem, StockProfile, StockRealtime,
} from '../../../../core/schema.js'
import type { IntradayTrendFetchResult } from '../../../../utils/intraday-trends.js'
import {
  isBse920Code, isShIndexCode, normalizeCode, type StockMarket,
} from '../../../../utils/helpers.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { BaostockClient, zipBaostockRows, type BaostockResult } from '../../api/client.js'
import { toBaostockCode } from '../../api/symbols.js'
import { isBaostockEnabled } from '../../config.js'
import {
  BAOSTOCK_ADJUST_FORWARD,
  KLINE_QUERY_FIELDS,
  filterTradeCalendarYear,
  groupMinuteKlinesToSessions,
  latestOpenTradeDate,
  mapBaostockKlineRows,
  mapBalanceSheetRecords,
  mapCashFlowRecords,
  mapDailyRowToIndexRealtime,
  mapDailyRowToStockRealtime,
  mapIncomeStatementRecords,
  mapIndexConstituentRows,
  mapProfileRow,
  mapStockBasicRows,
  mapStockListRows,
  mergeDividendResults,
  mergeFinancialSummary,
  opptrixPeriodToBaostock,
  resolveIndexConstQuery,
  mapTradeCalendarRows,
  todayYmd,
  ymdDaysAgo,
  isIntradayBaostockPeriod,
} from '../../normalize/index.js'

const INDEX_CODES = new Set(['000001', '000016', '000300', '000688', '000905', '000906', '000852', '399001', '399006', '399005', '399330'])

function isIndexCode(code: string): boolean {
  const c = normalizeCode(code)
  return INDEX_CODES.has(c) || isShIndexCode(c) || c.startsWith('399')
}

/** 证券宝 BaoStock — 免费开源 A 股历史数据 */

export class BaostockCnHandler extends MarketHandlerShell {
  private nameCache = new Map<string, string>()
  private clientInstance: BaostockClient | null = null

  private client(): BaostockClient | null {
    if (!isBaostockEnabled()) return null
    if (!this.clientInstance) this.clientInstance = new BaostockClient()
    return this.clientInstance
  }

  protected async withClient<T>(fn: (client: BaostockClient) => Promise<T>): Promise<T | null> {
    const client = this.client()
    if (!client) return null
    try {
      await client.ensureSession()
      return await fn(client)
    } catch {
      return null
    }
  }

  private async latestTradeDate(client: BaostockClient): Promise<string | null> {
    const res = await client.queryTradeDates(ymdDaysAgo(14), todayYmd())
    if (res.error_code !== '0') return null
    return latestOpenTradeDate(zipBaostockRows(res), todayYmd())
  }

  private async fetchKlines(
    client: BaostockClient,
    code: string,
    period: string,
    start: string,
    end: string,
    count?: number,
  ): Promise<StockKline[] | null> {
    const frequency = opptrixPeriodToBaostock(period)
    if (!frequency) return null

    const bsCode = toBaostockCode(code)
    let startDate = start ? start.slice(0, 10) : ymdDaysAgo(count ? Math.min(count * 3, 3650) : 3650)
    let endDate = end ? end.slice(0, 10) : todayYmd()

    const res = await client.queryHistoryKDataPlus(
      bsCode,
      KLINE_QUERY_FIELDS,
      startDate,
      endDate,
      frequency,
      BAOSTOCK_ADJUST_FORWARD,
    )
    if (res.error_code !== '0') return null

    let mapped = mapBaostockKlineRows(code, res, period)
    if (count && mapped.length > count) mapped = mapped.slice(-count)
    return mapped.length ? mapped : null
  }

  private async collectSeasonRows(
    client: BaostockClient,
    bsCode: string,
    queryFn: (year: string, quarter: string) => Promise<BaostockResult>,
    yearsBack = 8,
  ): Promise<Record<string, string>[]> {
    const rows: Record<string, string>[] = []
    const yearNow = new Date().getFullYear()
    for (let y = yearNow; y >= yearNow - yearsBack; y -= 1) {
      for (let q = 4; q >= 1; q -= 1) {
        try {
          const res = await queryFn(String(y), String(q))
          if (res.error_code === '0') rows.push(...zipBaostockRows(res))
        } catch {
          /* 该季可能无数据 */
        }
      }
    }
    return rows
  }

  private resolveName(code: string): string {
    return this.nameCache.get(normalizeCode(code)) ?? code
  }

  async stockList(_market = 'all'): Promise<StockListItem[] | null> {
    return this.withClient(async client => {
      const tradeDate = await this.latestTradeDate(client)
      const day = tradeDate ?? todayYmd()
      const res = await client.queryAllStock(day)
      if (res.error_code !== '0') return null
      const items = mapStockListRows(res)
      for (const item of items) this.nameCache.set(item.code, item.name)
      return items.length ? items : null
    })
  }

  async stockBasic(code = '', _listStatus = 'L'): Promise<StockListItem[] | null> {
    return this.withClient(async client => {
      const bsCode = code ? toBaostockCode(code) : ''
      const res = await client.queryStockBasic(bsCode)
      if (res.error_code !== '0') return null
      const items = mapStockBasicRows(res)
      for (const item of items) this.nameCache.set(item.code, item.name)
      return items.length ? items : null
    })
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    const eligible = codes.filter(c => !isBse920Code(normalizeCode(c)) && !isIndexCode(c))
    if (!eligible.length) return null

    return this.withClient(async client => {
      const out: StockRealtime[] = []
      for (const code of eligible) {
        const rows = await this.fetchKlines(client, code, 'daily', '', '', 2)
        if (!rows?.length) continue
        const bar = rows[rows.length - 1]!
        const q = mapDailyRowToStockRealtime(code, {
          close: String(bar.close),
          open: String(bar.open),
          high: String(bar.high),
          low: String(bar.low),
          preclose: rows.length > 1 ? String(rows[rows.length - 2]!.close) : '',
          volume: String(bar.volume ?? 0),
          amount: String(bar.amount ?? 0),
          pctChg: bar.changePct != null ? String(bar.changePct) : '',
          turn: bar.turnoverRate != null ? String(bar.turnoverRate) : '',
        }, this.resolveName(code))
        if (q) out.push(q)
      }
      return out.length ? out : null
    })
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    if (isBse920Code(normalizeCode(code)) || isIndexCode(code)) return null
    const batch = await this.batchRealtime([code])
    return batch
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<StockKline[] | null> {
    if (isBse920Code(normalizeCode(code))) return null
    if (isIndexCode(code)) return null
    return this.withClient(client => this.fetchKlines(client, code, period, start, end, count))
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<IndexKline[] | null> {
    if (isIntradayBaostockPeriod(period)) return null
    return this.withClient(async client => {
      const rows = await this.fetchKlines(client, code, period, start, end, count)
      if (!rows) return null
      const mapped: IndexKline[] = rows.map(k => ({
        code: k.code,
        date: k.date,
        open: k.open,
        close: k.close,
        high: k.high,
        low: k.low,
        volume: k.volume,
        amount: k.amount,
        changePct: k.changePct,
      }))
      return mapped.length ? mapped : null
    })
  }

  async indexRealtime(code: string) {
    return this.withClient(async client => {
      const rows = await this.fetchKlines(client, code, 'daily', '', '', 2)
      if (!rows?.length) return null
      const bar = rows[rows.length - 1]!
      const q = mapDailyRowToIndexRealtime(code, {
        close: String(bar.close),
        open: String(bar.open),
        high: String(bar.high),
        low: String(bar.low),
        preclose: rows.length > 1 ? String(rows[rows.length - 2]!.close) : '',
        volume: String(bar.volume ?? 0),
        amount: String(bar.amount ?? 0),
        pctChg: bar.changePct != null ? String(bar.changePct) : '',
      }, this.resolveName(code))
      return q ? [q] : null
    })
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    if (isBse920Code(normalizeCode(code))) return null
    return this.withClient(async client => {
      const bsCode = toBaostockCode(code)
      const [basicRes, industryRes] = await Promise.all([
        client.queryStockBasic(bsCode),
        client.queryStockIndustry(bsCode),
      ])
      if (basicRes.error_code !== '0') return null
      const basicRows = zipBaostockRows(basicRes)
      if (!basicRows.length) return null
      const industryRows = industryRes.error_code === '0' ? zipBaostockRows(industryRes) : []
      const row = mapProfileRow(code, basicRows[0]!, industryRows[0])
      if (row.name) this.nameCache.set(normalizeCode(code), row.name)
      return [row]
    })
  }

  async tradeCalendar(year?: number): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const y = year ?? new Date().getFullYear()
      const res = await client.queryTradeDates(`${y}-01-01`, `${y}-12-31`)
      if (res.error_code !== '0') return null
      const rows = filterTradeCalendarYear(mapTradeCalendarRows(res), y)
      return rows.length ? rows : null
    })
  }

  async dividend(code: string): Promise<Dividend[] | null> {
    return this.withClient(async client => {
      const bsCode = toBaostockCode(code)
      const yearNow = new Date().getFullYear()
      const results: BaostockResult[] = []
      for (let y = yearNow; y >= yearNow - 10; y -= 1) {
        const res = await client.queryDividendData(bsCode, String(y), 'report')
        if (res.error_code === '0') results.push(res)
      }
      const mapped = mergeDividendResults(code, results)
      return mapped.length ? mapped : null
    })
  }

  async financials(
    code: string,
    _reportDate = '',
    reportType = 'annual',
  ): Promise<FinancialSummary[] | null> {
    return this.withClient(async client => {
      const bsCode = toBaostockCode(code)
      const yearsBack = reportType === 'quarter' || reportType === 'quarterly' ? 3 : 8
      const [profit, growth, dupont, operation, cashflow] = await Promise.all([
        this.collectSeasonRows(client, bsCode, (y, q) => client.queryProfitData(bsCode, y, q), yearsBack),
        this.collectSeasonRows(client, bsCode, (y, q) => client.queryGrowthData(bsCode, y, q), yearsBack),
        this.collectSeasonRows(client, bsCode, (y, q) => client.queryDupontData(bsCode, y, q), yearsBack),
        this.collectSeasonRows(client, bsCode, (y, q) => client.queryOperationData(bsCode, y, q), yearsBack),
        this.collectSeasonRows(client, bsCode, (y, q) => client.queryCashFlowData(bsCode, y, q), yearsBack),
      ])
      const mapped = mergeFinancialSummary(code, profit, growth, dupont, operation, cashflow)
      const filtered = reportType === 'all'
        ? mapped
        : reportType === 'quarter' || reportType === 'quarterly'
          ? mapped.filter(r => r.reportType === 'quarter')
          : mapped.filter(r => r.reportType === 'annual')
      return filtered.length ? filtered : null
    })
  }

  async balanceSheet(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const bsCode = toBaostockCode(code)
      const rows = await this.collectSeasonRows(
        client, bsCode, (y, q) => client.queryBalanceData(bsCode, y, q),
      )
      const mapped = mapBalanceSheetRecords(code, rows, reportDate)
      return mapped.length ? mapped : null
    })
  }

  async incomeStatement(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const bsCode = toBaostockCode(code)
      const rows = await this.collectSeasonRows(
        client, bsCode, (y, q) => client.queryProfitData(bsCode, y, q),
      )
      const mapped = mapIncomeStatementRecords(code, rows, reportDate)
      return mapped.length ? mapped : null
    })
  }

  async cashFlow(code: string, reportDate = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const bsCode = toBaostockCode(code)
      const rows = await this.collectSeasonRows(
        client, bsCode, (y, q) => client.queryCashFlowData(bsCode, y, q),
      )
      const mapped = mapCashFlowRecords(code, rows, reportDate)
      return mapped.length ? mapped : null
    })
  }

  async indexConstituents(indexCode: string): Promise<Record<string, unknown>[] | null> {
    const kind = resolveIndexConstQuery(indexCode)
    if (!kind) return null

    return this.withClient(async client => {
      const tradeDate = await this.latestTradeDate(client)
      const date = tradeDate ?? todayYmd()
      const res = kind === 'hs300'
        ? await client.queryHs300Stocks(date)
        : kind === 'sz50'
          ? await client.querySz50Stocks(date)
          : await client.queryZz500Stocks(date)
      if (res.error_code !== '0') return null
      const mapped = mapIndexConstituentRows(indexCode, res)
      return mapped.length ? mapped : null
    })
  }

  async fetchIntradaySessions(
    code: string,
    ndays = 5,
    _market?: StockMarket,
  ): Promise<IntradayTrendFetchResult | null> {
    if (isIndexCode(code) || isBse920Code(normalizeCode(code))) return null

    return this.withClient(async client => {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const period = safeDays > 1 ? '5m' : '1m'
      const frequency = opptrixPeriodToBaostock(period)!
      const startDate = ymdDaysAgo(safeDays * 4)
      const endDate = todayYmd()
      const bsCode = toBaostockCode(code)

      const res = await client.queryHistoryKDataPlus(
        bsCode,
        KLINE_QUERY_FIELDS,
        startDate,
        endDate,
        frequency,
        BAOSTOCK_ADJUST_FORWARD,
      )
      if (res.error_code !== '0') return null

      const klines = mapBaostockKlineRows(code, res, period)
      if (!klines.length) return null

      const sessionDates = [...new Set(klines.map(k => k.date.slice(0, 10)))].sort()
      const keep = new Set(sessionDates.slice(-safeDays))
      const filtered = klines.filter(k => keep.has(k.date.slice(0, 10)))

      const daily = await this.fetchKlines(client, code, 'daily', ymdDaysAgo(10), endDate, 3)
      const apiPreClose = daily && daily.length >= 2
        ? daily[daily.length - 2]!.close
        : null

      return groupMinuteKlinesToSessions(filtered, apiPreClose)
    })
  }

  async minuteTrendKline(
    code: string,
    ndays = 1,
    count = 0,
    _market?: StockMarket,
  ): Promise<StockKline[] | null> {
    if (isIndexCode(code) || isBse920Code(normalizeCode(code))) return null

    return this.withClient(async client => {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const startDate = ymdDaysAgo(safeDays * 4)
      const endDate = todayYmd()
      let rows = await this.fetchKlines(client, code, '1m', startDate, endDate)
      if (!rows) return null

      const sessionDates = [...new Set(rows.map(k => k.date.slice(0, 10)))].sort()
      const keep = new Set(sessionDates.slice(-safeDays))
      rows = rows.filter(k => keep.has(k.date.slice(0, 10)))

      if (count > 0 && rows.length > count) rows = rows.slice(-count)
      return rows.length ? rows : null
    })
  }

  async macroIndicator(indicator = ''): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const end = todayYmd()
      const start = ymdDaysAgo(3650)
      const tasks: { key: string; name: string; fn: () => Promise<BaostockResult> }[] = [
        { key: 'deposit', name: '存款利率', fn: () => client.queryDepositRateData(start, end) },
        { key: 'loan', name: '贷款利率', fn: () => client.queryLoanRateData(start, end) },
        { key: 'rrr', name: '存款准备金率', fn: () => client.queryRequiredReserveRatioData(start, end) },
        { key: 'm2m', name: '货币供应量(月)', fn: () => client.queryMoneySupplyDataMonth(start, end) },
        { key: 'm2y', name: '货币供应量(年)', fn: () => client.queryMoneySupplyDataYear(start, end) },
        { key: 'shibor', name: 'SHIBOR', fn: () => client.queryShiborData(start, end) },
        { key: 'cpi', name: 'CPI', fn: () => client.queryCpiData(start, end) },
        { key: 'ppi', name: 'PPI', fn: () => client.queryPpiData(start, end) },
        { key: 'pmi', name: 'PMI', fn: () => client.queryPmiData(start, end) },
      ]

      const want = indicator.trim().toLowerCase()
      const selected = want
        ? tasks.filter(t => t.key.includes(want) || t.name.includes(indicator))
        : tasks

      const results: Record<string, unknown>[] = []
      for (const task of selected) {
        const res = await task.fn()
        if (res.error_code !== '0') continue
        for (const row of zipBaostockRows(res)) {
          results.push({
            indicator: task.name,
            indicatorKey: task.key,
            source: 'Baostock',
            ...row,
          })
        }
      }
      return results.length ? results : null
    })
  }

  async perfForecast(code: string): Promise<Record<string, unknown>[] | null> {
    return this.withClient(async client => {
      const end = todayYmd()
      const start = ymdDaysAgo(3650)
      const bsCode = toBaostockCode(code)
      const results: Record<string, unknown>[] = []

      for (const [kind, res] of [
        ['express', await client.queryPerformanceExpressReport(bsCode, start, end)],
        ['forecast', await client.queryForecastReport(bsCode, start, end)],
      ] as const) {
        if (res.error_code !== '0') continue
        for (const row of zipBaostockRows(res)) {
          results.push({ kind, source: 'Baostock', ...row })
        }
      }

      return results.length ? results : null
    })
  }
}
