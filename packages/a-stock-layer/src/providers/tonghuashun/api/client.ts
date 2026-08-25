/**
 * 同花顺扶摇 HTTP 适配层 — 对外保留历史 `FuyaoClient` 方法名与 `{ item? }` unwrap 形状；
 * 实际请求经 `@opptrix/fuyao` SDK。markets/* 勿直接 import SDK（除非 `import type`）。
 */
import {
  FuyaoClient as SdkFuyaoClient,
  FuyaoApiError as SdkFuyaoApiError,
  type AdjustMode,
  type AssetType,
  type FundType,
  type NavRange,
} from '@opptrix/fuyao'
import { tonghuashunClient } from './http-client.js'
import { FUYAO_BASE_URL, loadTonghuashunConfig } from '../config.js'

/** 适配层错误：兼容旧 `code` + `rawMessage` + `requestId`；`instanceof` 供 fund.ts 3001 路径使用。 */
export class FuyaoApiError extends Error {
  constructor(
    readonly code: number,
    /** 上游返回的原始 message（不含 wrapper 前缀 / request_id） */
    readonly rawMessage: string,
    readonly requestId?: string | null,
  ) {
    super(`同花顺 API code=${code}: ${rawMessage}${requestId ? ` (${requestId})` : ''}`)
    this.name = 'FuyaoApiError'
  }

  static fromSdk(err: SdkFuyaoApiError): FuyaoApiError {
    return new FuyaoApiError(err.code, err.message, err.requestId)
  }
}

type QueryValue = string | number | boolean | null | undefined

type FuyaoTickerAssetType = 'a-share' | 'a-share-index' | 'fund-etf' | 'fund-lof'

const RETRY_CODES = new Set([4001, 5001, 5002, 5003])
const TEN_YEARS_MS = Math.floor(10 * 365.25 * 86400 * 1000)
const FIVE_YEARS_MS = Math.floor(5 * 365.25 * 86400 * 1000)
const ONE_YEAR_MS = Math.floor(365.25 * 86400 * 1000)

function cleanParams(params: Record<string, QueryValue>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    out[k] = String(v)
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function asFundType(fundType: string): FundType {
  return fundType as FundType
}

function asAssetType(assetType: string): AssetType {
  return assetType as AssetType
}

function ymdFromMs(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function defaultRankTrendWindow(start?: string, end?: string): { startDate: string; endDate: string } {
  const endDate = (end?.trim() || ymdFromMs(Date.now()))
  const startDate = (start?.trim() || ymdFromMs(Date.now() - ONE_YEAR_MS))
  return { startDate, endDate }
}

function injectFetch(input: string, init?: RequestInit): Promise<Response> {
  return tonghuashunClient.fetch(input, { ...init, timeoutMs: 30000 })
}

export class FuyaoClient {
  private readonly sdk: SdkFuyaoClient
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey: string, baseUrl = FUYAO_BASE_URL) {
    this.apiKey = apiKey.trim()
    this.baseUrl = baseUrl.replace(/\/$/, '') || FUYAO_BASE_URL
    this.sdk = new SdkFuyaoClient({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      timeoutMs: 30000,
      intervalMs: 300,
      fetch: injectFetch,
    })
  }

  static fromConfig(): FuyaoClient | null {
    const cfg = loadTonghuashunConfig()
    if (!cfg.apiKey.trim()) return null
    return new FuyaoClient(cfg.apiKey.trim(), cfg.baseUrl)
  }

  /**
   * 将 SDK `ApiResponse` unwrap 为旧形状（`Record` 线材），调用方继续用 `.item`。
   * 故意不把 SDK 具名类型泄漏到 declaration emit / markets。
   */
  private async unwrap<T extends Record<string, unknown>>(
    fn: () => Promise<{ data: unknown }>,
  ): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fn()
        return (res.data ?? {}) as T
      } catch (e) {
        lastErr = e
        if (e instanceof SdkFuyaoApiError) {
          if (RETRY_CODES.has(e.code) && attempt < 2) {
            await sleep(1000 * (2 ** attempt))
            continue
          }
          throw FuyaoApiError.fromSdk(e)
        }
        if (e instanceof FuyaoApiError) throw e
        // 瞬时网络 / HTTP / 超时：与旧手写 client 一致，有限次退避重试
        if (attempt < 2) {
          await sleep(1000 * (2 ** attempt))
          continue
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  /**
   * SDK 未暴露的基金 financials 等：最小私有 GET（同一 fetch + 信封 unwrap）。
   * 保持与旧 `get` 相同的重试与 `FuyaoApiError` 行为。
   */
  private async rawGet<T = Record<string, unknown>>(
    path: string,
    params: Record<string, QueryValue> = {},
  ): Promise<T> {
    const qs = new URLSearchParams(cleanParams(params))
    const suffix = qs.toString()
    const base = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const url = suffix ? `${base}?${suffix}` : base
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await tonghuashunClient.fetch(url, {
          method: 'GET',
          headers: {
            'X-api-key': this.apiKey,
            Referer: 'https://fuyao.aicubes.cn/',
          },
          timeoutMs: 30000,
        })
        const payload = await resp.json() as {
          code?: number
          message?: string
          request_id?: string
          data?: T
        }
        const code = payload.code ?? -1
        if (code === 0) return (payload.data ?? {}) as T
        if (RETRY_CODES.has(code) && attempt < 2) {
          await sleep(1000 * (2 ** attempt))
          continue
        }
        throw new FuyaoApiError(code, String(payload.message ?? 'unknown'), payload.request_id)
      } catch (e) {
        lastErr = e
        if (e instanceof FuyaoApiError) throw e
        if (attempt < 2) {
          await sleep(1000 * (2 ** attempt))
          continue
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  tickersSearch(q: string, limit = 5, assetType: FuyaoTickerAssetType | string = 'a-share') {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.meta.search({ q, limit, assetType: asAssetType(String(assetType)) }),
    )
  }

  tickersList(
    limit = 1000,
    offset = 0,
    assetType: FuyaoTickerAssetType | string = 'a-share',
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[]; total?: number }>(() =>
      this.sdk.meta.listTickers({
        limit,
        offset,
        assetType: asAssetType(String(assetType)),
      }),
    )
  }

  async tickersListAll(assetType: FuyaoTickerAssetType | string = 'a-share'): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = []
    try {
      for await (const t of this.sdk.meta.iterateAllTickers({
        assetType: asAssetType(String(assetType)),
        pageSize: 1000,
      })) {
        all.push(t as unknown as Record<string, unknown>)
      }
    } catch (e) {
      if (e instanceof SdkFuyaoApiError) throw FuyaoApiError.fromSdk(e)
      throw e
    }
    return all
  }

  pricesSnapshot(thscodes: string | string[]) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.aShare.prices.snapshot({ thscodes }))
  }

  /**
   * A 股估值快照（PE/PB 等）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/valuations/snapshot
   */
  valuationsSnapshot(thscodes: string | string[]) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.aShare.valuations.snapshot({ thscodes }))
  }

  async pricesHistorical(
    thscode: string,
    startMs: number,
    endMs: number,
    adjust: 'none' | 'forward' | 'backward' = 'forward',
  ): Promise<Record<string, unknown>[]> {
    const slices: Array<[number, number]> = []
    let cur = startMs
    while (cur < endMs) {
      const end = Math.min(cur + TEN_YEARS_MS, endMs)
      slices.push([cur, end])
      cur = end + 1
    }
    const seen = new Set<number>()
    const bars: Record<string, unknown>[] = []
    for (const [start, end] of slices) {
      const data = await this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
        this.sdk.aShare.prices.historical({
          thscode,
          interval: '1d',
          start,
          end,
          adjust: adjust as AdjustMode,
        }),
      )
      for (const bar of (data.item as Record<string, unknown>[] | undefined) ?? []) {
        const d = Number(bar.date_ms)
        if (seen.has(d)) continue
        seen.add(d)
        bars.push(bar)
      }
    }
    bars.sort((a, b) => Number(a.date_ms) - Number(b.date_ms))
    return bars
  }

  indexPricesSnapshot(thscodes: string | string[]) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.index.pricesSnapshot({ thscodes }))
  }

  indexPricesHistorical(thscode: string, startMs: number, endMs: number, interval = '1d') {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.index.pricesHistorical({
        thscode,
        interval: interval === '1d' ? '1d' : '1d',
        start: startMs,
        end: endMs,
      }),
    )
  }

  financialsIncome(
    thscode: string,
    period: 'annual' | 'quarterly',
    limit = 20,
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.aShare.financials.incomeStatements({ thscode, period, limit }),
    )
  }

  /**
   * 资产负债表多期序列
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/balance-sheets
   */
  financialsBalanceSheets(
    thscode: string,
    period: 'annual' | 'quarterly' = 'quarterly',
    limit = 20,
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.aShare.financials.balanceSheets({ thscode, period, limit }),
    )
  }

  /**
   * 现金流量表多期序列
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/cash-flow-statements
   */
  financialsCashFlowStatements(
    thscode: string,
    period: 'annual' | 'quarterly' = 'quarterly',
    limit = 20,
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.aShare.financials.cashFlowStatements({ thscode, period, limit }),
    )
  }

  /**
   * 财务指标（成长/盈利/偿债/营运/现金流）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/indicators
   * @param report 报告期，如 2024Q3 / 2024
   */
  financialsIndicators(thscode: string, report: string) {
    return this.unwrap<{ abilities?: Record<string, unknown> } & Record<string, unknown>>(() => this.sdk.aShare.financials.indicators({ thscode, report }))
  }

  /**
   * 同花顺指数目录（按 tag）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share-index/catalog/ths-index-list
   * @param tag cn_concept | region | tszs | industry
   */
  thsIndexList(tag: 'cn_concept' | 'region' | 'tszs' | 'industry' | string = 'cn_concept') {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.index.catalogThsIndexList({
        tag: tag as 'cn_concept' | 'region' | 'tszs' | 'industry',
      }),
    )
  }

  /**
   * 指数/板块成分股
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share-index/constituents/ths-stock-list
   */
  thsIndexConstituents(thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.index.constituentsThsStockList({ thscode }))
  }

  adjustmentFactors(thscode: string, from?: string, to?: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.aShare.corporateActions.adjustmentFactors({ thscode, from, to }),
    )
  }

  tradingDays() {
    return this.unwrap<{ item?: Array<{ date_ms?: number; date?: string }> }>(() => this.sdk.aShare.calendar.tradingDays())
  }

  dragonTigerList(date?: string, boardType: 'all' | 'org' | 'hot_money' = 'all') {
    return this.unwrap<Record<string, unknown>>(() =>
      this.sdk.specialData.dragonTigerList({ boardType, date }),
    )
  }

  limitUpPool(dateMs?: number, page = 1, size = 100) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.specialData.limitUpPool({ dateMs, page, size }),
    )
  }

  /**
   * 连板天梯（近 30 交易日）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/limit-up-ladder
   */
  limitUpLadder() {
    return this.unwrap<{ item?: Record<string, unknown>[] } & Record<string, unknown>>(() => this.sdk.specialData.limitUpLadder())
  }

  hotStockList(period: 'day' | 'hour' = 'day') {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.specialData.hotStockList({ period }))
  }

  /**
   * 热度飙升榜 Top30
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/skyrocket-list
   */
  skyrocketList(period: 'day' | 'hour' = 'day') {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.specialData.skyrocketList({ period }))
  }

  /**
   * 历史热股排行（按自然日）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/hot-stock-list-history
   */
  hotStockListHistory(date: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.specialData.hotStockListHistory({ date }))
  }

  /**
   * 个股热榜排名走势
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/hot-stock-rank-trend
   */
  hotStockRankTrend(thscode: string, start?: string, end?: string) {
    const { startDate, endDate } = defaultRankTrendWindow(start, end)
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.specialData.hotStockRankTrend({ thscode, startDate, endDate }),
    )
  }

  /**
   * 当日个股异动原因列表
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/anomaly-analysis-list
   */
  anomalyAnalysisList(tag?: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.specialData.anomalyAnalysisList(
        tag ? { tagCodes: tag } : undefined,
      ),
    )
  }

  /**
   * 按股票批量查当日异动原因
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/anomaly-analysis-stock
   */
  anomalyAnalysisStock(thscodes: string | string[]) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.specialData.anomalyAnalysisStock({ thscodes }))
  }

  /**
   * 基金基本资料
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/profile/detail
   */
  fundProfileDetail(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.profile.detail({ fundType: asFundType(fundType), thscode }),
    )
  }

  /**
   * 基金重仓股
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/holdings
   */
  fundPortfolioHoldings(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.portfolio.holdings({ fundType: asFundType(fundType), thscode }),
    )
  }

  /**
   * 基金净值序列（GET /api/fund/performance/nav）
   * - fund_type: otc | exchange | reits；thscode 须带后缀（.OF / .SH 等）
   * - 不传 range → 最多最新 1 条；传 week|month|tmonth|hyear|year|twoyear|tyear|fyear → 区间序列
   * - nav_type: unit | adj | unit,adj；响应 adj_nav 为复权净值（≠累计净值）
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/performance/nav
   */
  fundPerformanceNav(
    fundType: string,
    thscode: string,
    opts?: { range?: string; nav_type?: string },
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.performance.nav({
        fundType: asFundType(fundType),
        thscode,
        range: opts?.range as NavRange | undefined,
        navType: opts?.nav_type as 'unit' | 'adj' | 'unit,adj' | undefined,
      }),
    )
  }

  /**
   * 基金区间收益
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/performance/returns
   */
  fundPerformanceReturns(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.performance.returns({ fundType: asFundType(fundType), thscode }),
    )
  }

  /**
   * 基金持有人结构
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/holders/detail
   */
  fundHoldersDetail(
    fundType: string,
    thscode: string,
    mergeScope: 'all' | 'merged' | 'separate' = 'all',
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.holders.detail({
        fundType: asFundType(fundType),
        thscode,
        mergeScope,
      }),
    )
  }

  /**
   * 场内 ETF 行情快照（仅 ETF）
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/market/snapshot
   */
  fundMarketSnapshot(thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.funds.market.snapshot({ thscode }))
  }

  /**
   * 场内 ETF 历史日线（仅 ETF；单次窗口最长 5 自然年）
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/market/historical
   */
  async fundMarketHistorical(
    thscode: string,
    startMs: number,
    endMs: number,
    interval = '1d',
  ): Promise<Record<string, unknown>[]> {
    void interval
    const slices: Array<[number, number]> = []
    let cur = startMs
    while (cur < endMs) {
      const end = Math.min(cur + FIVE_YEARS_MS, endMs)
      slices.push([cur, end])
      cur = end + 1
    }
    const seen = new Set<number>()
    const bars: Record<string, unknown>[] = []
    for (const [start, end] of slices) {
      const data = await this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
        this.sdk.funds.market.historical({ thscode, interval: '1d', start, end }),
      )
      for (const bar of (data.item as Record<string, unknown>[] | undefined) ?? []) {
        const d = Number(bar.date_ms)
        if (seen.has(d)) continue
        seen.add(d)
        bars.push(bar)
      }
    }
    bars.sort((a, b) => Number(a.date_ms) - Number(b.date_ms))
    return bars
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/companies/detail */
  fundCompaniesDetail(companyId: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.funds.companies.detail({ companyId }))
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/corporate-actions/dividends */
  fundCorporateActionsDividends(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.corporateActions.dividends({ fundType: asFundType(fundType), thscode }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/diagnostics/detail */
  fundDiagnosticsDetail(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.diagnostics.detail({ fundType: asFundType(fundType), thscode }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/financials/indicators — SDK 未暴露，走 rawGet */
  fundFinancialsIndicators(fundType: string, thscode: string) {
    return this.rawGet<{ item?: Record<string, unknown>[] }>(
      '/api/fund/financials/indicators',
      { fund_type: fundType, thscode },
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/financials/income-statements — SDK 未暴露，走 rawGet */
  fundFinancialsIncomeStatements(fundType: string, thscode: string) {
    return this.rawGet<{ item?: Record<string, unknown>[] }>(
      '/api/fund/financials/income-statements',
      { fund_type: fundType, thscode },
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/financials/balance-sheets — SDK 未暴露，走 rawGet */
  fundFinancialsBalanceSheets(fundType: string, thscode: string) {
    return this.rawGet<{ item?: Record<string, unknown>[] }>(
      '/api/fund/financials/balance-sheets',
      { fund_type: fundType, thscode },
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/holders/top */
  fundHoldersTop(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.holders.top({ fundType: asFundType(fundType), thscode }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/managers/investment-style */
  fundManagersInvestmentStyle(managerId: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.funds.managers.investmentStyle({ managerId }))
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/managers/performance */
  fundManagersPerformance(
    managerId: string,
    range: 'month' | 'tmonth' | 'year' | 'nowyear' | 'now' = 'year',
  ) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.funds.managers.performance({ managerId, range }))
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/managers/experience */
  fundManagersExperience(managerId: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.funds.managers.experience({ managerId }))
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/managers/detail */
  fundManagersDetail(managerId: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() => this.sdk.funds.managers.detail({ managerId }))
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/news/article-list */
  fundNewsArticleList(fundType: string, thscode: string, opts?: { limit?: number }) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.news.articleList({
        fundType: asFundType(fundType),
        thscode,
        limit: opts?.limit,
      }),
    )
  }

  /**
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/offerings/list
   * SDK 必填 `subscribe`；旧 opts 无此字段时默认 `active`。
   */
  fundOfferingsList(opts?: {
    fund_type?: string
    limit?: number
    subscribe?: 'active' | 'upcoming'
  }) {
    void opts?.fund_type
    void opts?.limit
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.offerings.list({ subscribe: opts?.subscribe ?? 'active' }),
    )
  }

  /**
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/performance/indicators-historical
   * SDK 必填 start/end；适配层默认近 1 年窗口。
   */
  fundPerformanceIndicatorsHistorical(fundType: string, thscode: string) {
    const end = Date.now()
    const start = end - ONE_YEAR_MS
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.performance.indicatorsHistorical({
        fundType: asFundType(fundType),
        thscode,
        start,
        end,
      }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/performance/drawdowns */
  fundPerformanceDrawdowns(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.performance.drawdowns({ fundType: asFundType(fundType), thscode }),
    )
  }

  /**
   * @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/stock-history
   * SDK 需 `reportType` + `endDate`；第三参可传对象，或仅传 ms 时抛 TypeError（当前无调用方）。
   */
  fundPortfolioStockHistory(
    fundType: string,
    thscode: string,
    reportDateMsOrOpts?: number | { reportType: string; endDate: string },
  ) {
    if (
      reportDateMsOrOpts
      && typeof reportDateMsOrOpts === 'object'
      && reportDateMsOrOpts.reportType
      && reportDateMsOrOpts.endDate
    ) {
      return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
        this.sdk.funds.portfolio.stockHistory({
          fundType: asFundType(fundType),
          thscode,
          reportType: reportDateMsOrOpts.reportType,
          endDate: reportDateMsOrOpts.endDate,
        }),
      )
    }
    throw new TypeError(
      'fundPortfolioStockHistory: @opptrix/fuyao 需要 reportType 与 endDate（yyyy-MM-dd）；'
      + '请传第三参 { reportType, endDate }（仅 reportDateMs 的旧调用已废弃）',
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/bond-history */
  fundPortfolioBondHistory(
    fundType: string,
    thscode: string,
    reportDateMsOrOpts?: number | { reportType: string; endDate: string },
  ) {
    if (
      reportDateMsOrOpts
      && typeof reportDateMsOrOpts === 'object'
      && reportDateMsOrOpts.reportType
      && reportDateMsOrOpts.endDate
    ) {
      return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
        this.sdk.funds.portfolio.bondHistory({
          fundType: asFundType(fundType),
          thscode,
          reportType: reportDateMsOrOpts.reportType,
          endDate: reportDateMsOrOpts.endDate,
        }),
      )
    }
    throw new TypeError(
      'fundPortfolioBondHistory: @opptrix/fuyao 需要 reportType 与 endDate（yyyy-MM-dd）；'
      + '请传第三参 { reportType, endDate }（仅 reportDateMs 的旧调用已废弃）',
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/stock-report-dates */
  fundPortfolioStockReportDates(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.portfolio.stockReportDates({ fundType: asFundType(fundType), thscode }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/bond-report-dates */
  fundPortfolioBondReportDates(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.portfolio.bondReportDates({ fundType: asFundType(fundType), thscode }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/asset-allocation */
  fundPortfolioAssetAllocation(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.portfolio.assetAllocation({ fundType: asFundType(fundType), thscode }),
    )
  }

  /** @sourceUrl https://fuyao.aicubes.cn/api/fund/portfolio/industry-allocation */
  fundPortfolioIndustryAllocation(fundType: string, thscode: string) {
    return this.unwrap<{ item?: Record<string, unknown>[] }>(() =>
      this.sdk.funds.portfolio.industryAllocation({ fundType: asFundType(fundType), thscode }),
    )
  }
}

export async function testTonghuashunConnection(
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API Key 未配置' }
  try {
    const client = new FuyaoClient(key)
    const data = await client.tickersSearch('600519', 1)
    const hit = data.item?.[0]
    if (hit?.thscode) {
      return { ok: true, message: `同花顺连接成功 · ${String(hit.name ?? hit.thscode)}` }
    }
    return { ok: false, message: '响应格式异常' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
