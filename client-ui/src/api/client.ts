import type {
  ApiResponse,
  FeedArticle,
  FeedGroup,
  FeedPageResult,
  FeedSubscription,
  NewsGroupedFeed,
  NewsSettings,
  ValidateFeedResult,
  CommunityFeedKind,
  CommunityFeedResponse,
} from '../types/schemas'
import type { ChatProgressEvent } from '../types/chatProgress'
import type { ChatDisplayMessage, ChatContextUsage, EphemeralAskTurn, SessionContextRef, SessionMeta, AvailableModel, ChatAttachmentMeta, SessionAttachmentListItem } from '../types/chat'
import { resolveFileMime } from '../chat/mediaCapabilities'
import {
  attachmentUploadTimeoutMs,
  formatAttachmentUploadError,
} from '../chat/attachmentUpload'
import type { ExportDestination, ExportPackageResult } from '../platform/saveMarketPackage'
import {
  formatExportResultMessage,
  pickExportDestination,
  saveMarketPackageBlob,
} from '../platform/saveMarketPackage'
import { decodeTextBufferBytes } from '../utils/decodeTextBuffer'

/** Vite dev/preview proxies /api → backend (default :8711). */
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const REQUEST_TIMEOUT = 10000 // 10s — quick reads / mutations
/** 本机重活（语义模型卸载、深度整理卸载、大附件上传等）；勿抬高全局 REQUEST_TIMEOUT。 */
const LOCAL_HEAVY_TIMEOUT = 180_000
/** Agent chat: multiple LLM + tool rounds (server LLM timeout up to 10m per round). */
const CHAT_REQUEST_TIMEOUT = 300_000

async function fetchWithTimeout(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const external = init?.signal
  const onExternalAbort = () => controller.abort()
  external?.addEventListener('abort', onExternalAbort)
  try {
    const { signal: _ignored, ...rest } = init ?? {}
    return await fetch(path, { ...rest, signal: controller.signal })
  } catch (e) {
    if (timedOut && e instanceof Error && e.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw e
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onExternalAbort)
  }
}

async function jsonFetch<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT): Promise<T> {
  const resp = await fetchWithTimeout(`${API_BASE}${path}`, init, timeoutMs)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string; message?: string }
    throw new Error(err.message || err.error || `API error: ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export async function apiCall<T>(
  feature: string,
  params: Record<string, any> = {},
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT,
): Promise<ApiResponse<T>> {
  const resp = await fetchWithTimeout(`${API_BASE}/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature, params }),
    ...init,
  }, timeoutMs)
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  return resp.json()
}

// ─── Typed convenience wrappers ───
import type {
  StockDiagnosisData, InstitutionRatingData,
  StrategySignalData, StrategyVerifyData, TrendBriefData,
  PortfolioAnalysisData,
  SearchStocksData, BacktestResultData, LatestEvalData, ReportTextData,
} from '../types/schemas'
import { cnEquityRef, instrumentKey } from '../market/instrument'
import {
  isUnifiedChart,
  isUnifiedSnapshot,
  unifiedChartToStockChart,
  unifiedSnapshotToCrossMarket,
  unifiedSnapshotToEtfSnapshot,
  unifiedSnapshotToStockDetail,
  unifiedQuoteToMarketQuote,
  type UnifiedInstrumentChartDto,
  type UnifiedInstrumentQuotesDto,
  type UnifiedInstrumentSnapshotDto,
} from '../market/instrument-adapters'
import { instrumentHubParams } from '@opptrix/shared/instrument-param'
import type { InstrumentRef, UnifiedInstrumentQuote } from '../types/instrument'

function hubInstrumentBody(ref: InstrumentRef, extra: Record<string, unknown> = {}) {
  return { ...instrumentHubParams(ref), ...extra }
}

function hubInstrumentCode(ref: InstrumentRef): string {
  return instrumentHubParams(ref).code
}
import type {
  ChartPeriod,
  ChipDistributionPoint,
  MarketQuote,
  OhlcChartBar,
  StockChartData,
  StockDetailData,
  StockKlineBar,
  StockKlineData,
  StockQuotesData,
} from '../types/market'

const INSTRUMENT_JSON_HEADERS = { 'Content-Type': 'application/json' } as const

type InstrumentEnvelope<T> = { success: boolean; data?: T; message?: string }

function toApiResponse<T>(
  feature: string,
  resp: { success: boolean; data?: unknown; message?: string },
  fallback: T,
  mapped?: T,
): ApiResponse<T> {
  return {
    success: resp.success,
    feature,
    data: (resp.success && (mapped ?? resp.data) != null ? (mapped ?? resp.data) : fallback) as T,
    message: resp.message,
  }
}

function unifiedQuoteToMarketQuoteFromApi(q: UnifiedInstrumentQuote): MarketQuote {
  return unifiedQuoteToMarketQuote(q)
}

async function postInstrument<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT,
): Promise<InstrumentEnvelope<T>> {
  return jsonFetch<InstrumentEnvelope<T>>(
    path,
    {
      method: 'POST',
      headers: INSTRUMENT_JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    },
    timeoutMs,
  )
}

async function callInstrumentApi<T>(
  feature: string,
  path: string,
  body: Record<string, unknown>,
  fallback: T,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT,
): Promise<ApiResponse<T>> {
  const resp = await postInstrument<T>(path, body, signal, timeoutMs)
  return toApiResponse(feature, resp, fallback)
}

function ohlcBarsToKlines(code: string, bars: StockChartData['bars']): StockKlineBar[] {
  return (bars as OhlcChartBar[]).map(bar => ({
    code,
    date: bar.time,
    open: bar.open,
    close: bar.close,
    high: bar.high,
    low: bar.low,
    volume: bar.volume,
    amount: bar.amount,
    changePct: bar.changePct,
    turnoverRate: bar.turnoverRate,
  }))
}

export const research = {
  diagnose: (codeOrRef: string | InstrumentRef, scorecard?: string) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    return callInstrumentApi<StockDiagnosisData>(
      'stock_diagnosis',
      '/instruments/evaluation',
      { ...hubInstrumentBody(instrument), ...(scorecard ? { scorecard } : {}) },
      {
        code,
        name: code,
        total_score: 0,
        scorecard_name: scorecard ?? '综合评估',
        scorecard_dimensions: [],
        factors: [],
        valid_factor_count: 0,
        total_factor_count: 0,
        factor_categories: {},
      },
      undefined,
      60000,
    )
  },

  institutionRating: (codeOrRef: string | InstrumentRef, groups?: string[], signal?: AbortSignal) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    return callInstrumentApi<InstitutionRatingData>(
      'institution_rating',
      '/instruments/institution-rating',
      { ...hubInstrumentBody(instrument), ...(groups?.length ? { groups } : {}) },
      {
        code,
        name: code,
        avg_confidence: 0,
        avg_raw_confidence: 0,
        consensus_rating: '',
        consensus_rating_cn: '',
        confidence_std: 0,
        agreement_rate: 0,
        rating_distribution: {},
        bullish_count: 0,
        bearish_count: 0,
        neutral_count: 0,
        group_stats: {},
        ratings: [],
        avg_data_quality: 0,
      },
      signal,
      20000,
    )
  },

  strategySignals: (codeOrRef: string | InstrumentRef, signal?: AbortSignal) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    return callInstrumentApi<StrategySignalData>(
      'strategy_signal',
      '/instruments/strategy-signal',
      hubInstrumentBody(instrument),
      {
        code,
        name: code,
        summary: '',
        bullish_count: 0,
        bearish_count: 0,
        neutral_count: 0,
        signals: [],
      },
      signal,
      30000,
    )
  },
  trendBrief: (code: string, holdingCost?: number | null, signal?: AbortSignal) =>
    apiCall<TrendBriefData>(
      'trend_brief',
      {
        code,
        ...(holdingCost != null && holdingCost > 0 ? { holding_cost: holdingCost } : {}),
      },
      { signal },
      30000,
    ),

  strategyVerify: (code: string, checkpoints = 30, forwardDays = 5) => {
    const instrument = cnEquityRef(code)
    const hubCode = hubInstrumentCode(instrument)
    return callInstrumentApi<StrategyVerifyData>(
      'strategy_verify',
      '/instruments/strategy-verify',
      hubInstrumentBody(instrument, { checkpoints, forward_days: forwardDays }),
      {
        code: hubCode,
        name: hubCode,
        checkpoints,
        forward_days: forwardDays,
        date_range: [],
        avg_win_rate: 0,
        best_strategy: null,
        performances: [],
      },
      undefined,
      120000,
    )
  },

  portfolioAnalysis: (holdings: [string, number][]) =>
    apiCall<PortfolioAnalysisData>('portfolio_analysis', { holdings }),

  marketRegime: (scope: 'cn' | 'us' = 'cn') =>
    apiCall<import('../types/schemas').MarketRegimeData>('market_regime', { profile_scope: scope }),

  marketDynamics: (opts?: { market?: 'cn' | 'us' | 'hk' }) =>
    apiCall<import('../types/schemas').MarketDynamicsData>(
      'market_dynamics',
      { market: opts?.market ?? 'cn' },
      undefined,
      35000,
    ),

  indexConstituents: (indexCode: string, opts?: { withQuotes?: boolean; quoteLimit?: number }) =>
    apiCall<import('../types/schemas').IndexConstituentsData>(
      'index_constituents',
      {
        index_code: indexCode,
        with_quotes: opts?.withQuotes !== false,
        quote_limit: opts?.quoteLimit ?? 400,
      },
      undefined,
      45000,
    ),

  searchStocks: async (keyword: string) => {
    const resp = await jsonFetch<{
      success: boolean
      data?: { items: Array<{ code: string; name: string | null; market?: string }> }
      message?: string
    }>(`/instruments/search?keyword=${encodeURIComponent(keyword)}&markets=CN&limit=30`)
    const items = resp.data?.items ?? []
    return {
      success: resp.success,
      feature: 'search_stocks',
      data: {
        keyword,
        results: items.map(item => ({
          code: item.code,
          name: item.name ?? item.code,
          industry: '',
          market: item.market ?? 'CN',
        })),
      },
      message: resp.message,
    } satisfies ApiResponse<SearchStocksData>
  },

  stockQuotes: async (codesOrRefs: (string | InstrumentRef)[]) => {
    const instruments = codesOrRefs.map(c => cnEquityRef(c))
    const resp = await postInstrument<{ quotes: UnifiedInstrumentQuote[] }>(
      '/instruments/quotes',
      { instruments },
    )
    return toApiResponse<StockQuotesData>(
      'stock_quotes',
      resp.success && resp.data?.quotes
        ? { ...resp, data: { quotes: resp.data.quotes.map(unifiedQuoteToMarketQuoteFromApi) } }
        : resp,
      { quotes: [] },
    )
  },

  watchlistRadar: (codesOrRefs: (string | import('../types/instrument').InstrumentRef)[], signal?: AbortSignal) =>
    apiCall<import('../types/schemas').WatchlistRadarData>(
      'watchlist_radar',
      { codes: codesOrRefs.map(c => typeof c === 'string' ? c : instrumentKey(cnEquityRef(c))) },
      { signal },
      15000,
    ),

  stockKline: async (codeOrRef: string | InstrumentRef, count = 90) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    const resp = await postInstrument<StockChartData | UnifiedInstrumentChartDto>(
      '/instruments/chart',
      hubInstrumentBody(instrument, { period: 'daily', count }),
    )
    if (!resp.success || !resp.data) {
      return toApiResponse<StockKlineData>('stock_kline', resp, { code, klines: [] })
    }
    const chart = isUnifiedChart(resp.data)
      ? unifiedChartToStockChart(resp.data, code)
      : resp.data
    return {
      success: true,
      feature: 'stock_kline',
      data: { code, klines: ohlcBarsToKlines(code, chart.bars) },
      message: resp.message,
    }
  },

  stockChart: async (
    codeOrRef: string | InstrumentRef,
    period: ChartPeriod,
    count?: number,
    signal?: AbortSignal,
    before?: string,
    tail?: number,
  ) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    const body: Record<string, unknown> = { ...hubInstrumentBody(instrument), period }
    if (count != null) body.count = count
    if (before) body.before = before
    if (tail != null) body.tail = tail
    const resp = await postInstrument<StockChartData | UnifiedInstrumentChartDto>('/instruments/chart', body, signal)
    const fallback: StockChartData = {
      code,
      name: code,
      period,
      preClose: null,
      isTradingDay: false,
      bars: [],
      indicators: [],
    }
    if (resp.success && resp.data && isUnifiedChart(resp.data)) {
      return toApiResponse<StockChartData>('stock_chart', resp, fallback, unifiedChartToStockChart(resp.data, code))
    }
    return toApiResponse<StockChartData>('stock_chart', resp, fallback)
  },

  stockCyq: async (codeOrRef: string | InstrumentRef, signal?: AbortSignal) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    const resp = await postInstrument<{
      code: string
      rows: ChipDistributionPoint[]
      latest: ChipDistributionPoint
    }>('/instruments/cyq', hubInstrumentBody(instrument), signal, 15000)
    return toApiResponse('stock_cyq', resp, {
      code,
      rows: [],
      latest: { date: '', benefitPart: 0, avgCost: 0, cost90Low: 0, cost90High: 0, cost90Con: 0, cost70Low: 0, cost70High: 0, cost70Con: 0 },
    })
  },

  stockDetail: async (codeOrRef: string | InstrumentRef, opts?: { fresh?: boolean }) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    const body = {
      ...hubInstrumentBody(instrument),
      ...(opts?.fresh ? { fresh: true } : {}),
    }
    const resp = await postInstrument<StockDetailData | UnifiedInstrumentSnapshotDto>(
      '/instruments/snapshot',
      body,
      undefined,
      30000,
    )
    const fallback: StockDetailData = {
      code,
      name: code,
      quote: null,
      profile: null,
      financial: null,
    }
    if (resp.success && resp.data && isUnifiedSnapshot(resp.data)) {
      return toApiResponse<StockDetailData>(
        'stock_detail',
        resp,
        fallback,
        unifiedSnapshotToStockDetail(resp.data),
      )
    }
    return toApiResponse<StockDetailData>('stock_detail', resp, fallback)
  },

  etfList: (code = '') =>
    apiCall<{ items: import('../types/market').EtfListItem[]; count: number; source?: string }>(
      'local_etf_list',
      code ? { code } : {},
    ),

  etfSnapshot: async (
    instrument: InstrumentRef,
    opts?: { fresh?: boolean },
    signal?: AbortSignal,
  ): Promise<
    import('../types/schemas').ApiResponse<import('../types/market').EtfSnapshotData>
  > => {
    const code = hubInstrumentCode(instrument)
    const fallback: import('../types/market').EtfSnapshotData = {
      code,
      profile: null,
      nav: null,
      quote: null,
    }
    const body = {
      ...hubInstrumentBody(instrument),
      ...(opts?.fresh ? { fresh: true } : {}),
    }
    const resp = await apiCall<
      import('../types/market').EtfSnapshotData | UnifiedInstrumentSnapshotDto
    >('etf_snapshot', body, { signal }, 20000)
    if (resp.success && resp.data && isUnifiedSnapshot(resp.data)) {
      return toApiResponse('etf_snapshot', resp, fallback, unifiedSnapshotToEtfSnapshot(resp.data))
    }
    return toApiResponse(
      'etf_snapshot',
      resp,
      fallback,
      resp.data && !isUnifiedSnapshot(resp.data) ? resp.data : undefined,
    )
  },

  etfNav: (instrument: InstrumentRef, signal?: AbortSignal) =>
    apiCall<{ code: string; items: import('../types/market').EtfNavPoint[]; source?: string }>(
      'etf_nav',
      hubInstrumentBody(instrument),
      { signal },
      20000,
    ),

  etfHoldings: (instrument: InstrumentRef, signal?: AbortSignal) =>
    apiCall<{ code: string; items: import('../types/market').EtfHoldingRow[]; source?: string }>(
      'etf_holdings',
      hubInstrumentBody(instrument),
      { signal },
      20000,
    ),

  fundSnapshot: async (
    instrument: InstrumentRef,
    signal?: AbortSignal,
  ): Promise<
    import('../types/schemas').ApiResponse<import('../types/market').FundSnapshotData>
  > => {
    const code = hubInstrumentCode(instrument)
    const fallback: import('../types/market').FundSnapshotData = {
      code,
      profile: null,
      nav: null,
      quote: null,
    }
    const resp = await apiCall<import('../types/market').FundSnapshotData>(
      'fund_snapshot',
      hubInstrumentBody(instrument),
      { signal },
      20000,
    )
    return toApiResponse('fund_snapshot', resp, fallback, resp.data ?? undefined)
  },

  fundNav: (instrument: InstrumentRef, signal?: AbortSignal, limit = 500) =>
    apiCall<{ code: string; items: import('../types/market').FundNavPoint[]; source?: string }>(
      'fund_nav',
      hubInstrumentBody(instrument, { limit }),
      { signal },
      20000,
    ),

  fundHoldings: (instrument: InstrumentRef, signal?: AbortSignal) =>
    apiCall<{ code: string; items: import('../types/market').FundHoldingRow[]; source?: string }>(
      'local_fund_holdings',
      hubInstrumentBody(instrument),
      { signal },
      20000,
    ),

  fundDetail: (
    instrument: InstrumentRef,
    signal?: AbortSignal,
  ) =>
    apiCall<import('../types/market').FundDetailData>(
      'fund_detail',
      hubInstrumentBody(instrument),
      { signal },
      25000,
    ),

  etfScorecard: (code: string, signal?: AbortSignal) =>
    apiCall<import('../types/market').EtfScorecardData>(
      'etf_scorecard',
      { code },
      { signal },
      20000,
    ),

  searchEtfs: (keyword: string, signal?: AbortSignal) =>
    apiCall<{ items: import('../types/market').EtfListItem[]; count: number; source?: string }>(
      'search_etfs',
      { keyword },
      { signal },
    ),

  searchInstruments: (keyword: string, limit = 20, signal?: AbortSignal) =>
    jsonFetch<{
      success: boolean
      message?: string
      data?: {
        items: import('../types/instrument').LocalInstrumentHit[]
        count: number
        source?: string
        universe_prep?: {
          status: 'ready' | 'preparing' | 'failed'
          percent: number
          message: string
          jobs?: string[]
        }
      }
    }>(
      `/instruments/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
      { signal },
    ),

  marketDataSyncState: (signal?: AbortSignal) =>
    jsonFetch<{
      success: boolean
      data?: {
        running: boolean
        overall_percent: number
        message: string | null
        current_job: string | null
        jobs_completed: number
        jobs_total: number
      }
    }>('/market-data/sync-state', { signal }),

  instrumentsSummary: () =>
    jsonFetch<{ success: boolean; data?: {
      summary: Array<{ market: string; assetClass: string; count: number }>
      counts: { cn_stocks: number; cn_etfs: number; us: number; crypto: number }
    } }>('/instruments/summary'),

  instrumentSnapshot: async (
    instrument: InstrumentRef,
    opts?: { fresh?: boolean },
    signal?: AbortSignal,
  ) => {
    const body = { ...hubInstrumentBody(instrument), ...(opts?.fresh ? { fresh: true } : {}) }
    const resp = await postInstrument<UnifiedInstrumentSnapshotDto>('/instruments/snapshot', body, signal)
    if (resp.success && resp.data && isUnifiedSnapshot(resp.data)) {
      return {
        ...resp,
        data: unifiedSnapshotToCrossMarket(resp.data, instrument),
      }
    }
    return resp
  },

  resolveInstrumentNames: (instruments: InstrumentRef[], signal?: AbortSignal) =>
    postInstrument<{
      items: Array<{ instrument: InstrumentRef; name: string | null; code: string }>
      count: number
    }>('/instruments/resolve-names', { instruments }, signal),

  instrumentQuotes: (instruments: InstrumentRef[], signal?: AbortSignal) =>
    postInstrument<UnifiedInstrumentQuotesDto>(
      '/instruments/quotes',
      { instruments },
      signal,
    ),

  /** 单标的最新价 — 关注添加后立即拉价；默认 fresh 跳过覆盖层缓存 */
  instrumentQuote: (
    instrument: InstrumentRef,
    opts?: { fresh?: boolean },
    signal?: AbortSignal,
  ) => postInstrument<{ quote: UnifiedInstrumentQuote; failed?: { code: string; reason: string } }>(
    '/instruments/quote',
    { ...hubInstrumentBody(instrument), fresh: opts?.fresh ?? true },
    signal,
  ),

  instrumentChart: async (
    instrument: InstrumentRef,
    period: ChartPeriod | 'daily' | 'weekly' | 'monthly' | 'intraday' = 'daily',
    count = 120,
    signal?: AbortSignal,
    before?: string,
    tail?: number,
  ) => {
    const body: Record<string, unknown> = { ...hubInstrumentBody(instrument), period, count }
    if (before) body.before = before
    if (tail != null) body.tail = tail
    const resp = await postInstrument<UnifiedInstrumentChartDto>('/instruments/chart', body, signal)
    if (resp.success && resp.data && isUnifiedChart(resp.data)) {
      return {
        ...resp,
        data: unifiedChartToStockChart(resp.data, hubInstrumentCode(instrument)),
      }
    }
    return resp
  },

  instrumentBatchSnapshots: (
    instruments: InstrumentRef[],
    signal?: AbortSignal,
  ) => postInstrument<{
    trade_date?: string | null
    count: number
    quotes: UnifiedInstrumentQuote[]
    discover_items?: Array<Record<string, unknown>>
  }>('/instruments/batch-snapshots', { instruments }, signal, 30000),

  instrumentEvaluation: (
    instrument: InstrumentRef,
    scorecard?: string,
    signal?: AbortSignal,
  ) => postInstrument<unknown>(
    '/instruments/evaluation',
    hubInstrumentBody(instrument, { ...(scorecard ? { scorecard } : {}) }),
    signal,
    60000,
  ),

  instrumentStrategySignal: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<unknown>('/instruments/strategy-signal', hubInstrumentBody(instrument), signal, 60000),

  instrumentIndicators: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<unknown>('/instruments/indicators', hubInstrumentBody(instrument), signal, 60000),

  instrumentStrategyVerify: (
    instrument: InstrumentRef,
    checkpoints?: unknown[],
    forwardDays?: number,
    signal?: AbortSignal,
  ) => postInstrument<unknown>(
    '/instruments/strategy-verify',
    hubInstrumentBody(instrument, { checkpoints, forward_days: forwardDays }),
    signal,
    120000,
  ),

  instrumentLatestEvaluation: (
    instrument: InstrumentRef,
    scorecard?: string,
    force = false,
    signal?: AbortSignal,
  ) => callInstrumentApi<LatestEvalData>(
    'latest_evaluation',
    '/instruments/latest-evaluation',
    {
      ...hubInstrumentBody(instrument),
      ...(scorecard ? { scorecard } : {}),
      ...(force ? { force: true } : {}),
    },
    {
      code: hubInstrumentCode(instrument),
      name: hubInstrumentCode(instrument),
      timestamp: '',
      scorecard: scorecard ?? 'G=B+M',
      total_score: 0,
      factors: {},
    },
    signal,
    90000,
  ),

  instrumentCapabilities: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<import('../types/instrument').InstrumentCapabilitySet>(
      '/instruments/capabilities',
      hubInstrumentBody(instrument),
      signal,
    ),

  instrumentCyq: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<{
      code: string
      rows: ChipDistributionPoint[]
      latest: ChipDistributionPoint
    }>('/instruments/cyq', hubInstrumentBody(instrument), signal, 15000),

  instrumentInstitutionRating: (
    instrument: InstrumentRef,
    groups?: string[],
    signal?: AbortSignal,
  ) =>
    postInstrument<InstitutionRatingData>(
      '/instruments/institution-rating',
      hubInstrumentBody(instrument, { ...(groups?.length ? { groups } : {}) }),
      signal,
      20000,
    ),

  backtest: (codes: string[], scorecard = '综合评估', periods = 5) =>
    apiCall<BacktestResultData>('backtest', { codes, scorecard, periods }),

  latestEval: (codeOrRef: string | InstrumentRef, signal?: AbortSignal, scorecard?: string, force = false) => {
    const instrument = cnEquityRef(codeOrRef)
    const code = hubInstrumentCode(instrument)
    return callInstrumentApi<LatestEvalData>(
      'latest_evaluation',
      '/instruments/latest-evaluation',
      {
        ...hubInstrumentBody(instrument),
        ...(scorecard ? { scorecard } : {}),
        ...(force ? { force: true } : {}),
      },
      {
        code,
        name: code,
        timestamp: '',
        scorecard: scorecard ?? 'G=B+M',
        total_score: 0,
        factors: {},
      },
      signal,
      90000,
    )
  },

  strategyReport: (code: string) =>
    apiCall<ReportTextData>('strategy_report', { code }),

  portfolioTrades: (code = '', market?: string) =>
    apiCall<import('../types/schemas').PortfolioLedgerData>('portfolio_trades', { code, market }),

  portfolioSummary: () =>
    apiCall<import('../types/schemas').PortfolioSummaryData>('portfolio_summary', {}),
}

export async function fetchFxRatesToCny() {
  const resp = await jsonFetch<{
    success: boolean
    data?: import('@opptrix/shared/fx-rates').FxRatesToCny
    message?: string
  }>('/market/fx-rates')
  if (!resp.success || !resp.data) {
    throw new Error(resp.message || '汇率暂时无法获取')
  }
  return resp.data
}

export async function fetchWatchlist() {
  const resp = await jsonFetch<{
    success: boolean
    data?: {
      items: import('../types/market').WatchlistItem[]
      count: number
      disambiguation_candidates?: Record<string, import('../types/market').DisambiguationCandidate[]>
    }
  }>('/watchlist')
  return resp.data ?? { items: [], count: 0, disambiguation_candidates: {} }
}

export async function saveWatchlist(items: import('../types/market').WatchlistItem[]) {
  const resp = await jsonFetch<{
    success: boolean
    data?: { items: import('../types/market').WatchlistItem[]; count: number }
  }>('/watchlist', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  return resp.data ?? { items, count: items.length }
}

export async function fetchWatchlistGroups() {
  const resp = await jsonFetch<{
    success: boolean
    data?: import('../types/market').WatchlistGroupsDocument
  }>('/watchlist/groups')
  return resp.data ?? { groups: [], membership: {} }
}

export async function saveWatchlistGroups(doc: import('../types/market').WatchlistGroupsDocument) {
  const resp = await jsonFetch<{
    success: boolean
    data?: import('../types/market').WatchlistGroupsDocument
  }>('/watchlist/groups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  return resp.data ?? doc
}

export interface MarketDataPackEntry {
  enabled: boolean
  prepared_at?: string | null
}

export interface MarketDataPackConfig {
  cn: MarketDataPackEntry
  us: MarketDataPackEntry
  crypto: MarketDataPackEntry
  hk: MarketDataPackEntry
  jp: MarketDataPackEntry
  kr: MarketDataPackEntry
}

export type SupplementPackId = 'us' | 'crypto' | 'hk' | 'jp' | 'kr'

export interface MarketDataPackageMetadata {
  app: string
  kind: string
  pack_scope?: 'cn' | 'us' | 'crypto' | 'hk' | 'jp' | 'kr'
  format_version: number
  exported_at: string
  schema_version: number
  pack_signature: string
  compatible: {
    min_format_version: number
    max_format_version: number
    min_schema_version: number
    max_schema_version: number
  }
  snapshot: {
    stock_count: number
    latest_trade_date: string | null
    latest_factor_date: string | null
    is_ready: boolean
    bootstrap: import('../types/market').MarketDataSyncState['db_status']['bootstrap']
    us_count?: number
    crypto_count?: number
    jp_count?: number
    kr_count?: number
    hk_count?: number
  }
}

export interface MarketDataPackageInspectResult {
  valid: boolean
  error?: string
  metadata?: MarketDataPackageMetadata
  compressed_bytes?: number
  sqlite_bytes?: number
}

export type { ExportDestination, ExportPackageResult }

const MARKET_PACKAGE_POLL_TIMEOUT = 30_000
const MARKET_PACKAGE_DOWNLOAD_TIMEOUT = 120_000
/** inspect / import：上传后解析或落盘，仍可能较长但远短于全量导出打包 */
const MARKET_PACKAGE_UPLOAD_TIMEOUT = 180_000

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export interface PackageExportJobSnapshot {
  job_id: string
  status: 'queued' | 'running' | 'ready' | 'failed'
  pack: string | null
  percent: number
  message: string
  error: string | null
  filename: string | null
  bytes: number | null
  download_path: string | null
}

async function startMarketPackageExportJob(pack?: SupplementPackId): Promise<PackageExportJobSnapshot> {
  const json = await jsonFetch<{ success?: boolean; data?: PackageExportJobSnapshot; error?: string }>(
    '/market-data/export/jobs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pack ? { pack } : {}),
    },
    MARKET_PACKAGE_POLL_TIMEOUT,
  )
  if (!json.data?.job_id) {
    throw new Error(json.error || '无法启动导出')
  }
  return json.data
}

async function pollMarketPackageExportJob(jobId: string): Promise<PackageExportJobSnapshot> {
  const json = await jsonFetch<{ success?: boolean; data?: PackageExportJobSnapshot; error?: string }>(
    `/market-data/export/jobs/${encodeURIComponent(jobId)}`,
    {},
    MARKET_PACKAGE_POLL_TIMEOUT,
  )
  if (!json.data) {
    throw new Error(json.error || '导出任务不存在')
  }
  return json.data
}

async function fetchMarketDataPackageBlob(pack?: SupplementPackId): Promise<{ blob: Blob; filename: string }> {
  const started = await startMarketPackageExportJob(pack)
  let job = started
  const deadline = Date.now() + 25 * 60 * 1000
  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() > deadline) {
      throw new Error('导出超时，请稍后重试')
    }
    await sleep(1500)
    job = await pollMarketPackageExportJob(job.job_id)
  }
  if (job.status === 'failed') {
    throw new Error(job.error || job.message || '导出失败')
  }
  const downloadPath = job.download_path
    ?? `/market-data/export/jobs/${encodeURIComponent(job.job_id)}/download`
  const path = downloadPath.startsWith('/api/') ? downloadPath.slice(4) : downloadPath
  const resp = await fetchWithTimeout(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {}, MARKET_PACKAGE_DOWNLOAD_TIMEOUT)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `下载失败（${resp.status}）`)
  }
  const blob = await resp.blob()
  const cd = resp.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(cd)
  const filename = match?.[1] ?? job.filename ?? (pack ? `opptrix-market-${pack}.opmd` : 'opptrix-market.opmd')
  return { blob, filename }
}

export async function exportMarketDataPackageFile(
  destination: ExportDestination,
  pack?: SupplementPackId,
): Promise<ExportPackageResult> {
  const { blob, filename } = await fetchMarketDataPackageBlob(pack)
  return saveMarketPackageBlob(blob, filename, destination)
}

export { pickExportDestination, formatExportResultMessage }

export async function inspectMarketDataPackageFile(file: File): Promise<MarketDataPackageInspectResult> {
  const buffer = await file.arrayBuffer()
  const resp = await fetchWithTimeout(`${API_BASE}/market-data/package/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer,
  }, MARKET_PACKAGE_UPLOAD_TIMEOUT)
  const json = await resp.json().catch(() => ({})) as {
    success?: boolean
    error?: string
    data?: MarketDataPackageInspectResult
  }
  if (!resp.ok) {
    throw new Error(json.error || `无法读取数据包（${resp.status}）`)
  }
  return json.data ?? { valid: false, error: '无效响应' }
}

export async function importMarketDataPackageFile(file: File) {
  const buffer = await file.arrayBuffer()
  return jsonFetch<{
    success: boolean
    message?: string
    data?: { metadata: MarketDataPackageMetadata; status: import('../types/market').MarketDataSyncState['db_status'] }
    error?: string
  }>('/market-data/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer,
  }, MARKET_PACKAGE_UPLOAD_TIMEOUT)
}

export async function listDiscoverJobs() {
  return jsonFetch<{ jobs: import('../types/schemas').DiscoverJobSnapshot[] }>('/discover/jobs')
}

export async function fetchCustomDiscoverStrategies() {
  return jsonFetch<{ strategies: import('../types/schemas').CustomDiscoverStrategy[] }>('/discover/custom-strategies')
}

export async function saveCustomDiscoverStrategies(
  strategies: import('../types/schemas').CustomDiscoverStrategy[],
) {
  return jsonFetch<{ strategies: import('../types/schemas').CustomDiscoverStrategy[] }>('/discover/custom-strategies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategies }),
  })
}

export async function getUserPreference<T>(key: string) {
  return jsonFetch<{ key: string; value: T | null }>(`/preferences/${encodeURIComponent(key)}`)
}

export async function setUserPreference<T>(key: string, value: T) {
  return jsonFetch<{ key: string; value: T }>(`/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

/** 个股分析最近一次报告（本地用户库 documents） */
export interface StockAnalysisRecord {
  instrumentKey: string
  analyzedAt: string
  raw: import('../market/useStockDecisionCard').RawDecisionPayload
}

export async function fetchStockAnalysis(instrumentKey: string, signal?: AbortSignal) {
  const resp = await jsonFetch<{ success: boolean; data: StockAnalysisRecord | null }>(
    `/stock-analysis/${encodeURIComponent(instrumentKey)}`,
    signal ? { signal } : undefined,
  )
  return resp.data ?? null
}

export async function saveStockAnalysis(record: StockAnalysisRecord) {
  const resp = await jsonFetch<{ success: boolean; data: StockAnalysisRecord }>(
    `/stock-analysis/${encodeURIComponent(record.instrumentKey)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyzedAt: record.analyzedAt, raw: record.raw }),
    },
  )
  return resp.data
}

export async function listDiscoverProfiles() {
  return jsonFetch<{ profiles: import('../types/schemas').DiscoverProfileMeta[] }>('/discover/profiles')
}

export async function getDiscoverReadiness(profile?: import('../types/schemas').DiscoverStrategyProfile) {
  const qs = profile ? `?profile=${encodeURIComponent(profile)}` : ''
  return jsonFetch<{
    success: boolean
    data: import('../types/schemas').DiscoverProfileReadiness
      | { items: import('../types/schemas').DiscoverProfileReadiness[] }
  }>(`/discover/readiness${qs}`)
}

export async function listDiscoverStrategies(profile?: import('../types/schemas').DiscoverStrategyProfile) {
  const qs = profile ? `?profile=${encodeURIComponent(profile)}` : ''
  return jsonFetch<{ strategies: import('../types/schemas').DiscoverStrategyPublic[] }>(`/discover/strategies${qs}`)
}

export async function getDiscoverStrategyDetail(id: string) {
  return jsonFetch<{ strategy: import('../types/schemas').DiscoverStrategyDetail }>(`/discover/strategies/${encodeURIComponent(id)}`)
}

export async function startDiscoverRun(
  opts: { strategy_id: string } | {
    custom_prompt: string
    custom_name?: string
    custom_id?: string
    profile?: import('../types/schemas').DiscoverStrategyProfile
  },
  model?: string,
) {
  const body = 'strategy_id' in opts
    ? { strategy_id: opts.strategy_id, model }
    : {
      custom_prompt: opts.custom_prompt,
      custom_name: opts.custom_name,
      custom_id: opts.custom_id,
      profile: opts.profile,
      model,
    }
  const resp = await fetchWithTimeout(`${API_BASE}/discover/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 30000)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
  }
  return resp.json() as Promise<{
    job_id: string
    status: string
    phase: string
    message: string
  }>
}

export async function getDiscoverJob(jobId: string) {
  return jsonFetch<{ job: import('../types/schemas').DiscoverJobSnapshot }>(`/discover/jobs/${jobId}`)
}

export async function cancelDiscoverJob(jobId: string) {
  return jsonFetch<{ cancelled: boolean }>(`/discover/jobs/${jobId}/cancel`, { method: 'POST' })
}

export async function deleteDiscoverJob(jobId: string) {
  return jsonFetch<{ deleted: boolean }>(`/discover/jobs/${jobId}`, { method: 'DELETE' })
}

export interface StockPrepStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message: string | null
}

export interface StockPrepSnapshot {
  code: string
  status: 'idle' | 'running' | 'done' | 'error'
  steps: StockPrepStep[]
  percent: number
  message: string | null
  started_at: string | null
  updated_at: string
  error: string | null
}

export async function startStockPrep(code: string, force = false) {
  return jsonFetch<{ prep: StockPrepSnapshot }>(`/stock/${encodeURIComponent(code)}/prep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(force ? { force: true } : {}),
  })
}

export async function getStockPrep(code: string) {
  return jsonFetch<{ prep: StockPrepSnapshot }>(`/stock/${encodeURIComponent(code)}/prep`)
}

export interface TusharePublicConfig {
  enabled: boolean
  token: string
  token_configured: boolean
  token_preview: string
  config_path: string
}

export async function getTushareConfig() {
  const resp = await jsonFetch<{ success: boolean; data: TusharePublicConfig }>('/tushare/config')
  if (!resp.data) throw new Error('无法读取 Tushare 配置')
  return resp.data
}

export async function saveTushareConfig(payload: { enabled: boolean; token?: string }) {
  return jsonFetch<{ success: boolean; data: TusharePublicConfig; message?: string }>('/tushare/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function testTushareConfig(token?: string) {
  return jsonFetch<{ success: boolean; data: { ok: boolean; message: string }; message?: string }>('/tushare/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token ? { token } : {}),
  })
}

export async function getProviderCatalog() {
  const resp = await jsonFetch<{ success: boolean; data: import('../types/provider').ProviderCatalogResponse }>('/data/providers')
  if (!resp.data) throw new Error('无法读取数据源列表')
  return resp.data
}

export async function saveProviderConfig(
  providerId: string,
  payload: {
    enabled?: boolean
    priority_mode?: 'manifest' | 'custom'
    priority?: number | null
    sort_order?: number | null
    extra?: Record<string, unknown>
  },
) {
  const resp = await jsonFetch<{ success: boolean; data: import('../types/provider').PublicProviderRuntime; message?: string }>(
    `/data/providers/${encodeURIComponent(providerId)}/config`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!resp.success || !resp.data) {
    throw new Error(resp.message ?? '保存失败')
  }
  return resp.data
}

export async function saveProviderOrder(payload: {
  provider_ids: string[]
}) {
  const resp = await jsonFetch<{
    success: boolean
    data: import('../types/provider').ProviderCatalogResponse
    message?: string
  }>('/data/providers/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.success || !resp.data) {
    throw new Error(resp.message ?? '保存排序失败')
  }
  return resp.data
}

export async function getProviderBindingOverrides(providerId: string) {
  const resp = await jsonFetch<{
    success: boolean
    data?: { providerId: string; items: import('../types/provider').PublicProviderBindingOverride[] }
  }>(`/data/providers/${encodeURIComponent(providerId)}/bindings`)
  if (!resp.data?.items) throw new Error('无法读取能力级优先级')
  return resp.data.items
}

export async function saveProviderBindingOverride(
  providerId: string,
  payload: {
    market: string
    asset_class: string
    capability: string
    enabled?: boolean | null
    priority?: number | null
  },
) {
  return jsonFetch<{
    success: boolean
    data?: { providerId: string; items: import('../types/provider').PublicProviderBindingOverride[] }
    message?: string
  }>(`/data/providers/${encodeURIComponent(providerId)}/bindings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function testProviderConfig(providerId: string, extra?: Record<string, unknown>) {
  const resp = await jsonFetch<{ success: boolean; data: { ok: boolean; message: string }; message?: string }>(
    `/data/providers/${encodeURIComponent(providerId)}/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra ?? {}),
    },
  )
  if (!resp.data) {
    throw new Error(resp.message ?? '测试连接失败')
  }
  return resp
}

export async function listInstalledProviders() {
  const resp = await jsonFetch<{
    success: boolean
    data?: import('../types/provider').InstalledProvidersResponse
    message?: string
  }>('/data/providers/installed')
  if (!resp.data?.providers) throw new Error(resp.message ?? '无法读取扩展数据源')
  return resp.data
}

export async function rescanProviders() {
  return jsonFetch<{
    success: boolean
    data?: import('../types/provider').InstalledProvidersResponse
    message?: string
  }>('/data/providers/rescan', { method: 'POST' })
}

export async function uninstallInstalledProvider(providerId: string) {
  return jsonFetch<{ success: boolean; data?: { providerId: string }; message?: string }>(
    `/data/providers/installed/${encodeURIComponent(providerId)}`,
    { method: 'DELETE' },
  )
}

export async function reloadInstalledProvider(providerId: string) {
  return jsonFetch<{ success: boolean; data?: unknown; message?: string }>(
    `/data/providers/installed/${encodeURIComponent(providerId)}/reload`,
    { method: 'POST' },
  )
}

export async function portfolioTrade(payload: {
  code: string
  shares: number
  price: number
  side?: 'buy' | 'sell'
  date?: string
  name?: string
  market?: string
  assetClass?: string
  instrument?: { market: string; assetClass: string; symbol: string; exchange?: string }
}) {
  // 尽量带完整 instrument；code 优先 Opptrix（调用方已传则原样）
  const body = {
    code: payload.code,
    name: payload.name,
    shares: payload.shares,
    price: payload.price,
    side: payload.side,
    date: payload.date,
    market: payload.market ?? payload.instrument?.market,
    assetClass: payload.assetClass ?? payload.instrument?.assetClass,
    instrument: payload.instrument,
  }
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error('trade failed')
  return resp.json()
}

export async function portfolioDeleteTrade(id: number) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/trade/${id}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('delete trade failed')
  return resp.json() as Promise<{ success: boolean }>
}

export async function portfolioClearInstrument(
  code: string,
  market?: string,
  assetClass?: string,
) {
  const qs = new URLSearchParams({ code: code.trim() })
  if (market) qs.set('market', market)
  if (assetClass) qs.set('assetClass', assetClass)
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/instrument?${qs}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('clear portfolio instrument failed')
  return resp.json() as Promise<{ success: boolean; removed: number }>
}

export async function portfolioFeeGlobal() {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/fees/global`)
  if (!resp.ok) throw new Error('portfolio fee global failed')
  return resp.json() as Promise<{
    success: boolean
    data?: { globalFees: import('@opptrix/shared/portfolio-fees').PortfolioGlobalFees }
  }>
}

export async function portfolioFeeGlobalSave(globalFees: import('@opptrix/shared/portfolio-fees').PortfolioGlobalFees) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/fees/global`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ globalFees }),
  })
  if (!resp.ok) throw new Error('portfolio fee global save failed')
  return resp.json() as Promise<{
    success: boolean
    data?: { globalFees: import('@opptrix/shared/portfolio-fees').PortfolioGlobalFees; recalculatedTrades?: number }
  }>
}

export async function portfolioFeeInstrument(code: string, market?: string) {
  const qs = new URLSearchParams({ code: code.trim() })
  if (market) qs.set('market', market)
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/fees/instrument?${qs}`)
  if (!resp.ok) throw new Error('portfolio fee instrument failed')
  return resp.json() as Promise<{
    success: boolean
    data?: {
      ledgerKind: import('@opptrix/shared/portfolio-fees').PortfolioLedgerKind
      overrides: import('@opptrix/shared/portfolio-fees').InstrumentFeeOverrides
      globalFees: import('@opptrix/shared/portfolio-fees').PortfolioGlobalFees
    }
  }>
}

export async function portfolioFeeInstrumentSave(
  code: string,
  overrides: import('@opptrix/shared/portfolio-fees').InstrumentFeeOverrides,
  market?: string,
) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/fees/instrument`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, market, overrides }),
  })
  if (!resp.ok) throw new Error('portfolio fee instrument save failed')
  return resp.json() as Promise<{
    success: boolean
    data?: {
      ledgerKind: import('@opptrix/shared/portfolio-fees').PortfolioLedgerKind
      overrides: import('@opptrix/shared/portfolio-fees').InstrumentFeeOverrides
      recalculatedTrades?: number
    }
  }>
}

export async function getHealth() {
  const resp = await fetchWithTimeout(`${API_BASE}/health`)
  if (!resp.ok) throw new Error(`Health check failed: ${resp.status}`)
  return resp.json() as Promise<{
    status: string
    version: string
    llm_configured: boolean
    model: string | null
    available_models?: number
    scorecard: string
  }>
}

export async function getLegalUserAgreement(): Promise<{ html: string; sourceUrl: string }> {
  const resp = await fetchWithTimeout(`${API_BASE}/legal/user-agreement`)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `协议加载失败（${resp.status}）`)
  }
  return resp.json() as Promise<{ html: string; sourceUrl: string }>
}

export interface PublicProvider {
  id: string
  name: string
  base_url: string
  models: string[]
  api_key_configured: boolean
  proxy_mode?: 'inherit' | 'none' | 'custom'
  proxy_url?: string
}

export interface SystemProxySettings {
  enabled: boolean
  url?: string
}

export interface ProviderPreset {
  id: string
  name: string
  base_url: string
  region?: 'cn' | 'global' | 'custom'
}

export interface AppConfig {
  providers: PublicProvider[]
  available_models: AvailableModel[]
  default_model?: string
  default_scorecard: string
  default_top_n: number
  system_proxy?: SystemProxySettings
  llm_configured: boolean
}

export async function getConfig() {
  const resp = await fetchWithTimeout(`${API_BASE}/config`)
  if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`)
  return resp.json() as Promise<AppConfig>
}

export async function patchConfig(payload: {
  default_scorecard?: string
  default_top_n?: number
  default_model?: string
  system_proxy?: SystemProxySettings
}) {
  return jsonFetch<{ status: string; config: AppConfig }>('/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** @deprecated legacy AgentDrawer — use session chat APIs */
export async function sendChat(message: string, _context?: unknown) {
  return jsonFetch<{ reply: string; tools_used?: string[] }>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

/** @deprecated legacy AgentDrawer */
export async function resetChat() {
  return { ok: true as const }
}

/** @deprecated legacy Settings page */
export async function saveConfig(payload: {
  provider?: string
  model?: string
  scorecard?: string
  api_key?: string
}) {
  return patchConfig({
    default_scorecard: payload.scorecard,
    default_model: payload.model,
  })
}

export async function getProviderPresets() {
  return jsonFetch<{ presets: ProviderPreset[] }>('/providers/presets')
}

/** 拉取模型列表：上游常需 10–30s，须长于默认 REQUEST_TIMEOUT */
const DISCOVER_MODELS_TIMEOUT_MS = 45_000

export async function discoverModels(
  base_url: string,
  api_key: string,
  proxy?: { proxy_mode?: 'inherit' | 'none' | 'custom'; proxy_url?: string },
) {
  return jsonFetch<{ models: string[] }>(
    '/providers/discover-models',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url,
        api_key,
        ...(proxy?.proxy_mode ? { proxy_mode: proxy.proxy_mode } : {}),
        ...(proxy?.proxy_url ? { proxy_url: proxy.proxy_url } : {}),
      }),
    },
    DISCOVER_MODELS_TIMEOUT_MS,
  )
}

export async function createProvider(payload: {
  name: string
  base_url: string
  api_key: string
  models: string[]
  proxy_mode?: 'inherit' | 'none' | 'custom'
  proxy_url?: string
}) {
  return jsonFetch<{ status: string; provider: PublicProvider }>('/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateProvider(id: string, payload: Partial<{
  name: string
  base_url: string
  api_key: string
  models: string[]
  proxy_mode: 'inherit' | 'none' | 'custom'
  proxy_url: string
}>) {
  return jsonFetch<{ status: string; provider: PublicProvider }>(`/providers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteProvider(id: string) {
  return jsonFetch<{ status: string }>(`/providers/${id}`, { method: 'DELETE' })
}

export async function listAvailableModels() {
  // 服务端以同步列表为主，富化最多数百毫秒；仍略放宽超时以防冷启动偶发慢
  return jsonFetch<{ models: AvailableModel[]; default_model: string | null }>(
    '/models/available',
    undefined,
    15_000,
  )
}

export async function listSessions() {
  return jsonFetch<{ sessions: SessionMeta[] }>('/sessions')
}

export async function createSession(opts?: { title?: string; expertId?: string }) {
  const body: { title?: string; expertId?: string } = {}
  if (opts?.title) body.title = opts.title
  if (opts?.expertId) body.expertId = opts.expertId
  return jsonFetch<{ session: SessionMeta }>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function listExperts(query?: {
  q?: string
  tag?: string
  limit?: number
  cursor?: string
  scope?: 'public' | 'personal' | 'all'
}) {
  const params = new URLSearchParams()
  if (query?.q) params.set('q', query.q)
  if (query?.tag) params.set('tag', query.tag)
  if (query?.limit != null) params.set('limit', String(query.limit))
  if (query?.cursor) params.set('cursor', query.cursor)
  if (query?.scope) params.set('scope', query.scope)
  const qs = params.toString()
  return jsonFetch<import('../types/chat').ExpertCatalog>(`/experts${qs ? `?${qs}` : ''}`)
}

export async function getExpert(id: string) {
  return jsonFetch<{ expert: import('../types/chat').ExpertDefinition }>(`/experts/${encodeURIComponent(id)}`)
}

export async function createExpert(body: {
  title: string
  summary: string
  persona: string
  tags?: string[]
  starterPrompts?: import('../types/chat').ExpertStarterPrompt[]
}) {
  return jsonFetch<{ expert: import('../types/chat').ExpertDefinition }>('/experts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function updateExpert(
  id: string,
  body: {
    title?: string
    summary?: string
    persona?: string
    tags?: string[]
    starterPrompts?: import('../types/chat').ExpertStarterPrompt[]
  },
) {
  return jsonFetch<{ expert: import('../types/chat').ExpertDefinition }>(`/experts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function deleteExpert(id: string) {
  return jsonFetch<{ ok: boolean; deleted: string }>(`/experts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function getSession(id: string) {
  return jsonFetch<{
    session: SessionMeta
    messages: ChatDisplayMessage[]
    contextRef: SessionContextRef | null
    contextUsage?: ChatContextUsage | null
  }>(`/sessions/${id}`)
}

export async function getSessionContextUsage(id: string) {
  return jsonFetch<{ contextUsage: ChatContextUsage }>(`/sessions/${id}/context-usage`)
}

export async function renameSession(id: string, title: string) {
  return jsonFetch<{ session: Pick<SessionMeta, 'id' | 'title' | 'updatedAt'> }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function setSessionModel(id: string, model: string | null) {
  return jsonFetch<{
    session: Pick<SessionMeta, 'id' | 'title' | 'model' | 'llmParams' | 'updatedAt'>
    contextHint?: string
  }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
}

export async function setSessionLlmParams(
  id: string,
  llmParams: {
    temperature?: number
    maxTokens?: number
    reasoningEffort?: 'low' | 'medium' | 'high' | null
  },
) {
  return jsonFetch<{
    session: Pick<SessionMeta, 'id' | 'title' | 'model' | 'llmParams' | 'updatedAt'>
  }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llmParams }),
  })
}

export async function getSessionRolePersona(id: string) {
  return jsonFetch<{ rolePersona: string; expertId: string | null }>(`/sessions/${id}/role-persona`)
}

export async function updateSessionRolePersona(id: string, rolePersona: string) {
  return jsonFetch<{ rolePersona: string; expertId: string | null }>(`/sessions/${id}/role-persona`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rolePersona }),
  })
}

export async function deleteSession(id: string) {
  return jsonFetch<{ status: string }>(`/sessions/${id}`, { method: 'DELETE' })
}

export interface WorkspaceGrantDto {
  id: string
  root_id: string
  abs_path: string
  mode: 'ro' | 'rw'
  label?: string
  is_default?: boolean
}

export async function listWorkspaceGrants(sessionId: string) {
  return jsonFetch<{ grants: WorkspaceGrantDto[] }>(`/sessions/${sessionId}/workspace/grants`)
}

export async function addWorkspaceGrant(
  sessionId: string,
  payload: { path: string; mode?: 'ro' | 'rw'; label?: string },
) {
  return jsonFetch<{ grant: WorkspaceGrantDto }>(`/sessions/${sessionId}/workspace/grants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function removeWorkspaceGrant(sessionId: string, grantId: string) {
  return jsonFetch<{ status: string }>(`/sessions/${sessionId}/workspace/grants/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
  })
}

/** Authorized workspace file stream URL for markdown media / links. */
export function sessionWorkspaceFileUrl(sessionId: string, rootId: string, relPath: string): string {
  const qs = new URLSearchParams({
    root_id: rootId,
    path: relPath,
  })
  return `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/workspace/file?${qs.toString()}`
}

export async function listSessionArchiveFolders() {
  return jsonFetch<{ folders: import('../types/chat').SessionArchiveFolder[] }>('/sessions/archive-folders')
}

export async function createSessionArchiveFolder(title: string) {
  return jsonFetch<{ folder: import('../types/chat').SessionArchiveFolder }>('/sessions/archive-folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function renameSessionArchiveFolder(id: string, title: string) {
  return jsonFetch<{ folder: import('../types/chat').SessionArchiveFolder }>(`/sessions/archive-folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function deleteSessionArchiveFolder(id: string) {
  return jsonFetch<{ ok: boolean; movedCount?: number }>(`/sessions/archive-folders/${id}`, {
    method: 'DELETE',
  })
}

export async function clearSessionArchiveFolder(id: string) {
  return jsonFetch<{ ok: boolean; deletedCount: number }>(`/sessions/archive-folders/${id}/clear`, {
    method: 'POST',
  })
}

export async function listArchivedSessions() {
  return jsonFetch<{ groups: Array<{ folder: import('../types/chat').SessionArchiveFolder; sessions: SessionMeta[] }> }>(
    '/sessions/archived',
  )
}

export async function archiveSession(id: string, folderId: string) {
  return jsonFetch<{ session: SessionMeta }>(`/sessions/${id}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  })
}

export async function unarchiveSession(id: string) {
  return jsonFetch<{ session: SessionMeta }>(`/sessions/${id}/unarchive`, {
    method: 'POST',
  })
}

export type SearchHit =
  | { kind: 'session'; id: string; title: string; snippet: string; archived: boolean; archiveFolderId?: string | null; updatedAt: string }
  | { kind: 'stock'; code: string; name: string; industry: string; market: string }
  | { kind: 'news'; id: string; title: string; snippet: string; pubDate: string; sourceTitle: string }

export interface SearchBrowseResult {
  recent: SessionMeta[]
  archived: Array<{ folderId: string; title: string; sessions: SessionMeta[] }>
}

export interface UnifiedSearchResult {
  query: string
  sessions: Extract<SearchHit, { kind: 'session' }>[]
  stocks: Extract<SearchHit, { kind: 'stock' }>[]
  news: Extract<SearchHit, { kind: 'news' }>[]
}

export async function searchWorkspace(q: string, limit = 20) {
  const params = new URLSearchParams({ q, limit: String(limit) })
  return jsonFetch<UnifiedSearchResult>(`/search?${params}`)
}

export async function browseWorkspaceSearch() {
  return jsonFetch<SearchBrowseResult>('/search/browse')
}

export async function forkSession(sessionId: string, messageIndex: number) {
  return jsonFetch<{
    session: SessionMeta
    messages: ChatDisplayMessage[]
    contextRef: SessionContextRef | null
  }>(`/sessions/${sessionId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_index: messageIndex }),
  })
}

export async function truncateSession(sessionId: string, messageIndex: number) {
  return jsonFetch<{
    session: SessionMeta
    messages: ChatDisplayMessage[]
    contextRef: SessionContextRef | null
  }>(`/sessions/${sessionId}/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_index: messageIndex }),
  })
}

export async function clearSessionContext(sessionId: string) {
  return jsonFetch<{
    session: SessionMeta
    contextRef: null
  }>(`/sessions/${sessionId}/context`, {
    method: 'DELETE',
  })
}

export async function setSessionContext(sessionId: string, contextRef: SessionContextRef) {
  return jsonFetch<{
    session: SessionMeta
    contextRef: SessionContextRef | null
  }>(`/sessions/${sessionId}/context`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextRef }),
  })
}

export async function ephemeralAsk(
  sessionId: string,
  message: string,
  selectedText: string,
  model?: string,
  history?: EphemeralAskTurn[],
) {
  return jsonFetch<{ reply: string }>(`/sessions/${sessionId}/ephemeral-ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      selected_text: selectedText,
      ...(model ? { model } : {}),
      ...(history?.length ? { history } : {}),
    }),
  }, CHAT_REQUEST_TIMEOUT)
}

export async function sendSessionChat(
  sessionId: string,
  message: string,
  model?: string,
) {
  return jsonFetch<{
    reply: string
    tools_used?: string[]
    session_id: string
    title?: string
  }>(`/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      ...(model ? { model } : {}),
    }),
  }, CHAT_REQUEST_TIMEOUT)
}

export async function cancelSessionChat(sessionId: string) {
  return jsonFetch<{ cancelled: boolean }>(`/sessions/${sessionId}/chat/cancel`, {
    method: 'POST',
  })
}

/**
 * 结束会话后台任务（A1）。
 * 后端未就绪时返回 ok:false，不抛错，便于 UI 友好提示。
 */
export async function cancelSessionJob(
  sessionId: string,
  jobId: string,
): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const sid = sessionId.trim()
  const jid = jobId.trim()
  if (!sid || !jid) {
    return { ok: false, error: '暂时无法结束该任务，请稍后重试' }
  }
  try {
    const res = await jsonFetch<{ ok?: boolean; cancelled?: boolean; error?: string }>(
      `/sessions/${encodeURIComponent(sid)}/jobs/${encodeURIComponent(jid)}/cancel`,
      { method: 'POST' },
    )
    if (res.ok === false) {
      const err = typeof res.error === 'string' ? res.error.trim() : ''
      if (/not.?cancel|不可取消|不支持/i.test(err)) {
        return { ok: false, error: '此任务暂不支持手动结束' }
      }
      return {
        ok: false,
        error: err || '暂时无法结束该任务，请稍后重试',
      }
    }
    return {
      ok: true,
      cancelled: res.cancelled ?? true,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/404|not found|API error: 404/i.test(msg)) {
      return { ok: false, error: '结束任务功能即将可用，请稍后再试' }
    }
    if (/not.?cancel|不可取消|不支持/i.test(msg)) {
      return { ok: false, error: '此任务暂不支持手动结束' }
    }
    return { ok: false, error: '暂时无法结束该任务，请稍后重试' }
  }
}

/** 本会话协作任务列表（父委派） */
export type SessionCollaborationTaskDto = {
  run_id: string
  label: string
  status: string
  summary?: string
  child_session_id?: string
  mode?: string
  updated_at?: string
}

export async function listSessionSubagents(
  sessionId: string,
): Promise<{ runs: SessionCollaborationTaskDto[] }> {
  const sid = sessionId.trim()
  if (!sid) return { runs: [] }
  try {
    const res = await jsonFetch<{ runs?: SessionCollaborationTaskDto[] }>(
      `/sessions/${encodeURIComponent(sid)}/subagents`,
    )
    return { runs: Array.isArray(res.runs) ? res.runs : [] }
  } catch {
    return { runs: [] }
  }
}

/** 结束本会话某条协作任务 */
export async function cancelSessionSubagent(
  sessionId: string,
  runId: string,
): Promise<{ ok: boolean; status?: string; cancelled?: boolean; error?: string; summary?: string }> {
  const sid = sessionId.trim()
  const rid = runId.trim()
  if (!sid || !rid) {
    return { ok: false, error: '暂时无法结束该协作任务，请稍后重试' }
  }
  try {
    const res = await jsonFetch<{
      ok?: boolean
      status?: string
      cancelled?: boolean
      error?: string
      summary?: string
    }>(
      `/sessions/${encodeURIComponent(sid)}/subagents/${encodeURIComponent(rid)}/cancel`,
      { method: 'POST' },
    )
    if (res.ok === false) {
      const err = typeof res.error === 'string' ? res.error.trim() : ''
      return {
        ok: false,
        status: res.status,
        error: err || '暂时无法结束该协作任务，请稍后重试',
      }
    }
    return {
      ok: true,
      status: res.status,
      cancelled: res.cancelled ?? res.status === 'cancelled',
      summary: res.summary,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/404|not found|API error: 404/i.test(msg)) {
      return { ok: false, error: '协作任务不存在或已结束' }
    }
    return { ok: false, error: '暂时无法结束该协作任务，请稍后重试' }
  }
}

/** 生成中补充说明（soft steer，不取消当前回复） */
export async function steerSessionChat(sessionId: string, message: string) {
  return jsonFetch<{ ok: boolean; reason?: 'no_active_chat' | 'empty' }>(
    `/sessions/${sessionId}/chat/steer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    },
  )
}

export async function submitUserPromptResponse(
  sessionId: string,
  promptId: string,
  answer: {
    kind: 'option' | 'custom' | 'secret'
    selected_ids?: string[]
    selected_labels?: string[]
    custom_text?: string
    name?: string
    secret_value?: string
    inject_hosts?: string[]
  },
) {
  return jsonFetch<{ ok: boolean; stale?: boolean }>(`/sessions/${sessionId}/chat/user-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt_id: promptId,
      ...answer,
    }),
  }, CHAT_REQUEST_TIMEOUT)
}

export async function listSessionAttachments(
  sessionId: string,
): Promise<SessionAttachmentListItem[]> {
  const data = await jsonFetch<{ attachments: SessionAttachmentListItem[] }>(
    `/sessions/${sessionId}/attachments`,
  )
  return data.attachments
}

export type UploadSessionAttachmentOptions = {
  /** 用户取消 / 移除乐观项时中止上传 */
  signal?: AbortSignal
  /** 浏览器 XHR 上传进度（0–1）；不可用时不回调 */
  onProgress?: (ratio: number) => void
}

/**
 * 会话附件上传。使用 XHR 以支持可读进度与 AbortSignal；
 * 超时按体积抬高（基准 LOCAL_HEAVY_TIMEOUT，上限 10min），不抬高全局 REQUEST_TIMEOUT。
 */
export async function uploadSessionAttachment(
  sessionId: string,
  file: File,
  pinnedCount = 0,
  pinnedTotalBytes = 0,
  opts?: UploadSessionAttachmentOptions,
): Promise<ChatAttachmentMeta> {
  // 强制 octet-stream：部分环境会用 File.type（如 video/mp4）覆盖请求头，导致服务端未命中高限 parser
  const body = file.slice(0, file.size, 'application/octet-stream')
  const url = `${API_BASE}/sessions/${sessionId}/attachments`
  const timeoutMs = attachmentUploadTimeoutMs(file.size)
  const signal = opts?.signal
  const onProgress = opts?.onProgress

  return new Promise<ChatAttachmentMeta>((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('已取消添加')
      err.name = 'AbortError'
      reject(err)
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = timeoutMs
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('X-Attachment-Mime', resolveFileMime(file))
    xhr.setRequestHeader('X-Attachment-Name', encodeURIComponent(file.name))
    xhr.setRequestHeader('X-Pinned-Count', String(pinnedCount))
    xhr.setRequestHeader('X-Pinned-Total-Bytes', String(pinnedTotalBytes))
    xhr.responseType = 'text'

    let lastRatio = -1
    xhr.upload.onprogress = (ev) => {
      if (!onProgress || !ev.lengthComputable || ev.total <= 0) return
      const ratio = Math.min(1, Math.max(0, ev.loaded / ev.total))
      // 避免过密 setState：至少变动 1%
      if (ratio - lastRatio < 0.01 && ratio < 1) return
      lastRatio = ratio
      onProgress(ratio)
    }

    const onExternalAbort = () => {
      xhr.abort()
    }
    signal?.addEventListener('abort', onExternalAbort)

    const cleanup = () => {
      signal?.removeEventListener('abort', onExternalAbort)
    }

    xhr.onload = () => {
      cleanup()
      const status = xhr.status
      let parsed: {
        attachment?: ChatAttachmentMeta
        error?: string
        message?: string
        code?: string
      } = {}
      try {
        const text = xhr.responseText?.trim()
        if (text) parsed = JSON.parse(text) as typeof parsed
      } catch {
        parsed = {}
      }
      if (status >= 200 && status < 300 && parsed.attachment) {
        onProgress?.(1)
        resolve(parsed.attachment)
        return
      }
      const raw = (parsed.error || parsed.message || '').trim()
      reject(new Error(formatAttachmentUploadError(null, {
        status,
        code: parsed.code,
        raw,
      })))
    }

    xhr.onerror = () => {
      cleanup()
      reject(new Error(formatAttachmentUploadError(new Error('network'))))
    }

    xhr.ontimeout = () => {
      cleanup()
      reject(new Error(formatAttachmentUploadError(new Error('timeout'))))
    }

    xhr.onabort = () => {
      cleanup()
      const err = new Error('已取消添加')
      err.name = 'AbortError'
      reject(err)
    }

    xhr.send(body)
  })
}

export function sessionAttachmentUrl(sessionId: string, attachmentId: string): string {
  return `${API_BASE}/sessions/${sessionId}/attachments/${attachmentId}`
}

/** 网页制品入口（index.html）；相对资源走同前缀下的路径 */
export function sessionAttachmentWebUrl(
  sessionId: string,
  attachmentId: string,
  relativePath = 'index.html',
): string {
  const rel = relativePath.replace(/^\/+/, '') || 'index.html'
  return `${API_BASE}/sessions/${sessionId}/attachments/${attachmentId}/web/${rel}`
}

/** 网页制品根 URL（以 / 结尾，便于相对路径解析） */
export function sessionAttachmentWebRootUrl(sessionId: string, attachmentId: string): string {
  return `${API_BASE}/sessions/${sessionId}/attachments/${attachmentId}/web/`
}

export type WebAttachmentExportResult =
  | { ok: true; blob: Blob }
  | { ok: false; message: string }

/**
 * 服务端 Playwright fullPage 导出网页预览长图（PNG）。
 * PDF 由客户端基于该 PNG 切页生成。
 */
export async function fetchWebAttachmentExportPng(
  sessionId: string,
  attachmentId: string,
): Promise<WebAttachmentExportResult> {
  const resp = await fetchWithTimeout(
    `${API_BASE}/sessions/${sessionId}/attachments/${attachmentId}/web/export.png`,
    { method: 'GET' },
    LOCAL_HEAVY_TIMEOUT,
  )

  if (resp.ok) {
    const blob = await resp.blob()
    if (!blob.size) {
      return { ok: false, message: '导出失败，请稍后重试' }
    }
    return { ok: true, blob }
  }

  let message = '导出失败，请稍后重试'
  try {
    const data = (await resp.json()) as { error?: string; message?: string }
    const raw = (data.error || data.message || '').trim()
    if (raw) message = raw
  } catch {
    if (resp.status === 503) {
      message = '暂时无法导出。浏览组件未就绪，请重启应用后再试'
    } else if (resp.status === 404) {
      message = '找不到这份网页，请刷新后再试'
    }
  }
  return { ok: false, message }
}

export async function fetchSessionAttachmentMeta(
  sessionId: string,
  attachmentId: string,
): Promise<ChatAttachmentMeta> {
  return jsonFetch<{ attachment: ChatAttachmentMeta }>(
    `/sessions/${sessionId}/attachments/${attachmentId}/meta`,
  ).then(r => r.attachment)
}

export type AttachmentPreviewTextResult =
  | { ok: true; text: string }
  | { ok: false; status: 'pending' | 'failed'; message?: string }

export async function fetchAttachmentPreviewText(
  sessionId: string,
  attachmentId: string,
): Promise<AttachmentPreviewTextResult> {
  const resp = await fetchWithTimeout(
    `${API_BASE}/sessions/${sessionId}/attachments/${attachmentId}/extract/text`,
    { method: 'GET' },
  )

  if (resp.ok) {
    return { ok: true, text: await resp.text() }
  }

  if (resp.status === 202) {
    return { ok: false, status: 'pending' }
  }

  if (resp.status === 422) {
    const data = await resp.json().catch(() => ({})) as { message?: string }
    return { ok: false, status: 'failed', message: data.message }
  }

  throw new Error(`提取预览文本失败 (${resp.status})`)
}

/** 直读附件原文并本地解码（纯文本预览回退，不依赖 extract） */
export async function fetchAttachmentRawText(
  sessionId: string,
  attachmentId: string,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const resp = await fetchWithTimeout(sessionAttachmentUrl(sessionId, attachmentId), {
    method: 'GET',
  })
  if (!resp.ok) return { ok: false }
  try {
    const buf = await resp.arrayBuffer()
    return { ok: true, text: decodeTextBufferBytes(buf) }
  } catch {
    return { ok: false }
  }
}

/** 写回脑图附件内容（后写覆盖） */
export async function putSessionMindmapAttachment(
  sessionId: string,
  attachmentId: string,
  tree: { version: number; rootId: string; nodes: unknown[] },
): Promise<ChatAttachmentMeta> {
  const resp = await fetchWithTimeout(sessionAttachmentUrl(sessionId, attachmentId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.opptrix.mindmap+json' },
    body: JSON.stringify(tree),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `保存失败 (${resp.status})`)
  }
  const data = await resp.json() as { attachment: ChatAttachmentMeta }
  return data.attachment
}

/** 写回画布附件源码（后写覆盖） */
export async function putSessionCanvasAttachment(
  sessionId: string,
  attachmentId: string,
  source: string,
): Promise<ChatAttachmentMeta> {
  const resp = await fetchWithTimeout(sessionAttachmentUrl(sessionId, attachmentId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.opptrix.canvas+tsx' },
    body: source,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `保存失败 (${resp.status})`)
  }
  const data = await resp.json() as { attachment: ChatAttachmentMeta }
  return data.attachment
}

export async function deleteSessionAttachment(sessionId: string, attachmentId: string) {
  return jsonFetch<{ ok: boolean }>(`/sessions/${sessionId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}

export async function streamSessionChat(
  sessionId: string,
  message: string,
  onEvent: (event: ChatProgressEvent) => void,
  model?: string,
  signal?: AbortSignal,
  attachments?: string[],
): Promise<void> {
  const resp = await fetchWithTimeout(`${API_BASE}/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message,
      ...(model ? { model } : {}),
      ...(attachments?.length ? { attachments } : {}),
    }),
    signal,
  }, CHAT_REQUEST_TIMEOUT)

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
  }
  if (!resp.body) throw new Error('流式响应不可用')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find(row => row.startsWith('data: '))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(6)) as ChatProgressEvent)
      } catch {
        /* ignore malformed chunk */
      }
    }
  }

  if (buffer.trim()) {
    const line = buffer.split('\n').find(row => row.startsWith('data: '))
    if (line) {
      onEvent(JSON.parse(line.slice(6)) as ChatProgressEvent)
    }
  }
}

/** 订阅会话后台进度（turn-wake 续跑等）；连接保持到 signal abort。 */
export async function subscribeSessionLiveProgress(
  sessionId: string,
  onEvent: (event: ChatProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/live-progress`, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `订阅进度失败（${resp.status}）`)
  }
  if (!resp.body) throw new Error('流式响应不可用')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      // 心跳行 `: ping`
      if (chunk.startsWith(':')) continue
      const line = chunk.split('\n').find(row => row.startsWith('data: '))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(6)) as ChatProgressEvent)
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}

export async function fetchSessionPendingWakes(sessionId: string): Promise<{
  wakes: Array<{
    wake_id: string
    fire_at: string
    reason?: string
    seconds_left: number
    seconds: number
  }>
  job_watches?: Array<{
    watch_id: string
    job_id: string
    kind?: string
    label?: string
    percent?: number
    seconds_left?: number
    source?: string
    state?: string
  }>
}> {
  return jsonFetch(`/sessions/${sessionId}/pending-wakes`)
}

// ─── News feed API ───

export type SenseVoiceEnsurePhase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'ready'
  | 'error'

export type SenseVoiceEnsureJobSnapshot = {
  phase: SenseVoiceEnsurePhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  modelName: string
  ready: boolean
  modelsDir: string
  source: 'bundled' | 'user' | 'missing'
  error: string | null
}

async function newsJsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return jsonFetch<T>(path, init)
}

export const news = {
  getSettings: () =>
    newsJsonFetch<{ settings: NewsSettings }>('/news/settings'),

  saveSettings: (settings: Partial<NewsSettings>) =>
    newsJsonFetch<{ settings: NewsSettings }>('/news/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),

  listSubscriptions: () =>
    newsJsonFetch<{ subscriptions: FeedSubscription[]; groups: FeedGroup[] }>('/news/subscriptions'),

  listGroups: () =>
    newsJsonFetch<{ groups: FeedGroup[] }>('/news/groups'),

  createGroup: (title: string) =>
    newsJsonFetch<{ group: FeedGroup; groups: FeedGroup[] }>('/news/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),

  updateGroup: (id: string, body: { title?: string; sort_order?: number }) =>
    newsJsonFetch<{ group: FeedGroup; groups: FeedGroup[] }>(`/news/groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteGroup: (id: string) =>
    newsJsonFetch<{ deleted: boolean; groups: FeedGroup[]; subscriptions: FeedSubscription[] }>(
      `/news/groups/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  moveSubscriptionToGroup: (subId: string, groupId: string | null) =>
    newsJsonFetch<{ subscription: FeedSubscription; subscriptions: FeedSubscription[] }>(
      `/news/subscriptions/${encodeURIComponent(subId)}/group`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      },
    ),

  saveSubscriptions: (subscriptions: FeedSubscription[]) =>
    newsJsonFetch<{ subscriptions: FeedSubscription[] }>('/news/subscriptions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptions }),
    }),

  addSubscription: (body: { url: string; title?: string; enabled?: boolean; group_id?: string | null }) =>
    newsJsonFetch<{ subscription: FeedSubscription; subscriptions: FeedSubscription[] }>(
      '/news/subscriptions/item',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),

  importSubscriptions: (file: { schema_version: number; subscriptions: Array<{ url: string; title: string }> }) =>
    newsJsonFetch<{
      added: number
      skipped: number
      errors: Array<{ url: string; error: string }>
      subscriptions: FeedSubscription[]
    }>('/news/subscriptions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    }),

  deleteSubscription: (id: string) =>
    newsJsonFetch<{ deleted: boolean; subscriptions: FeedSubscription[] }>(
      `/news/subscriptions/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  validate: (url: string, title?: string) =>
    newsJsonFetch<{ result: ValidateFeedResult }>('/news/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    }),

  getFeed: (opts: {
    limit?: number
    cursor?: string | null
    subscription_id?: string | null
    group_id?: string | null
    date?: string | null
  } = {}) => {
    const q = new URLSearchParams()
    q.set('limit', String(opts.limit ?? 20))
    if (opts.cursor) q.set('cursor', opts.cursor)
    if (opts.subscription_id) q.set('subscription_id', opts.subscription_id)
    if (opts.group_id) q.set('group_id', opts.group_id)
    if (opts.date) q.set('date', opts.date)
    return newsJsonFetch<FeedPageResult>(`/news/feed?${q.toString()}`)
  },

  getGroupedFeed: () =>
    newsJsonFetch<NewsGroupedFeed>('/news/feed/grouped'),

  getArticle: (id: string) =>
    newsJsonFetch<{ article: FeedArticle }>(`/news/articles/${encodeURIComponent(id)}`),

  getArticleEnrichment: (id: string) =>
    newsJsonFetch<{ enrichment: import('../types/schemas').ArticleEnrichment | null }>(
      `/news/articles/${encodeURIComponent(id)}/enrichment`,
    ),

  enrichArticle: (id: string) =>
    newsJsonFetch<{ job_id: string; article_id: string }>(
      `/news/articles/${encodeURIComponent(id)}/enrich`,
      { method: 'POST' },
    ),

  getEnrichmentJob: (jobId: string) =>
    newsJsonFetch<{
      job: {
        articleId: string
        status: 'running' | 'completed' | 'failed'
        progress: {
          articleId: string
          phase: string
          current: number
          total: number
          message?: string
        } | null
        error?: string
      }
      enrichment: import('../types/schemas').ArticleEnrichment | null
    }>(`/news/enrichment/jobs/${encodeURIComponent(jobId)}`),

  getMultimodalStatus: () =>
    newsJsonFetch<import('../types/schemas').MultimodalStatusResponse>('/news/multimodal/status'),

  /** POST 立即返回 job（短超时）；内部轮询直至 ready/error。 */
  ensureSenseVoiceModel: async (
    opts?: {
      onProgress?: (job: SenseVoiceEnsureJobSnapshot) => void
      signal?: AbortSignal
      pollIntervalMs?: number
    },
  ): Promise<SenseVoiceEnsureJobSnapshot> => {
    const started = await jsonFetch<{
      ok: boolean
      started: boolean
      job: SenseVoiceEnsureJobSnapshot
    }>('/news/multimodal/sensevoice/ensure', { method: 'POST' }, REQUEST_TIMEOUT)

    let job = started.job
    opts?.onProgress?.(job)
    if (job.phase === 'ready') return job
    if (job.phase === 'error') {
      throw new Error(job.error || job.message || '语音识别模型准备失败')
    }

    const pollMs = opts?.pollIntervalMs ?? 1500
    const deadline = Date.now() + 30 * 60 * 1000
    while (Date.now() < deadline) {
      if (opts?.signal?.aborted) {
        throw new Error('已取消准备')
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer)
          reject(new Error('已取消准备'))
        }
        const timer = setTimeout(() => {
          opts?.signal?.removeEventListener('abort', onAbort)
          resolve()
        }, pollMs)
        if (opts?.signal) {
          if (opts.signal.aborted) {
            clearTimeout(timer)
            reject(new Error('已取消准备'))
            return
          }
          opts.signal.addEventListener('abort', onAbort, { once: true })
        }
      })
      const polled = await jsonFetch<{ job: SenseVoiceEnsureJobSnapshot }>(
        '/news/multimodal/sensevoice/ensure',
        undefined,
        REQUEST_TIMEOUT,
      )
      job = polled.job
      opts?.onProgress?.(job)
      if (job.phase === 'ready') return job
      if (job.phase === 'error') {
        throw new Error(job.error || job.message || '语音识别模型准备失败')
      }
    }
    throw new Error('准备超时，请确认网络后重试')
  },

  getSenseVoiceEnsureJob: () =>
    newsJsonFetch<{ job: SenseVoiceEnsureJobSnapshot }>('/news/multimodal/sensevoice/ensure'),

  /** @deprecated 兼容旧调用；服务端已代理到 SenseVoice（异步 job + 轮询） */
  ensureWhisperModel: (
    opts?: {
      onProgress?: (job: SenseVoiceEnsureJobSnapshot) => void
      signal?: AbortSignal
      pollIntervalMs?: number
    },
  ) => news.ensureSenseVoiceModel(opts),

  refresh: () =>
    newsJsonFetch<{
      refreshed: number
      errors: Array<{ id: string; title: string; error: string }>
      articles: FeedArticle[]
      next_cursor: string | null
      has_more: boolean
      total: number
    }>('/news/refresh', { method: 'POST' }),
}

export async function fetchCommunityFeed(kind: CommunityFeedKind, page = 0): Promise<CommunityFeedResponse> {
  const q = new URLSearchParams()
  q.set('kind', kind)
  q.set('page', String(Math.max(0, page)))
  return jsonFetch<CommunityFeedResponse>(`/community/feed?${q.toString()}`)
}

// ─── External MCP Servers ───

import type {
  McpServerCreatePayload,
  McpServerPatchPayload,
  PublicMcpServer,
} from '../types/mcpServer'

export async function listMcpServers() {
  const resp = await jsonFetch<{ servers: PublicMcpServer[] }>('/mcp-servers')
  return resp.servers
}

export async function createMcpServer(payload: McpServerCreatePayload) {
  return jsonFetch<{ server: PublicMcpServer }>('/mcp-servers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateMcpServer(id: string, payload: McpServerPatchPayload) {
  return jsonFetch<{ server: PublicMcpServer }>(`/mcp-servers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteMcpServer(id: string) {
  return jsonFetch<{ ok: boolean; deleted: string }>(`/mcp-servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function testMcpServer(id: string) {
  return jsonFetch<{
    ok: boolean
    message: string
    tools?: string[]
    server?: PublicMcpServer
  }>(`/mcp-servers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  }, 60_000)
}

export async function reorderMcpServers(serverIds: string[]) {
  const resp = await jsonFetch<{ servers: PublicMcpServer[] }>('/mcp-servers/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_ids: serverIds }),
  })
  return resp.servers
}

export interface McpServerFlatConfig {
  type?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export async function exportMcpServers() {
  return jsonFetch<{ mcpServers: Record<string, McpServerFlatConfig> }>('/mcp-servers/export')
}

export async function importMcpServers(mcpServers: Record<string, McpServerFlatConfig>) {
  return jsonFetch<{ servers: PublicMcpServer[] }>('/mcp-servers/import', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mcpServers }),
  })
}

/** 内置 MCP 预设 — service 定义（不含 API Key） */
export interface McpPresetServiceDef {
  serverId: string
  title: string
  /** HTTP URL；stdio 预设可为空字符串 */
  url: string
  /** HTTP header 名，或 stdio 时回填为 apiKeyEnv */
  apiKeyHeader: string
  apiKeyEnv?: string
  transport?: 'stdio' | 'streamable-http'
  configured: boolean
  apiKeyPreview?: string
}

export interface McpPresetDef {
  id: string
  title: string
  description: string
  sortOrder: number
  homepage?: string
  services: McpPresetServiceDef[]
}

export async function getMcpPresets() {
  return jsonFetch<{ presets: McpPresetDef[] }>('/mcp-servers/presets')
}

export async function applyMcpPreset(presetId: string, apiKey?: string) {
  const key = (apiKey ?? '').trim()
  return jsonFetch<{ ok: boolean }>('/mcp-servers/apply-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(key ? { presetId, apiKey: key } : { presetId }),
  })
}

/** 预设是否需要填写数据密钥（HTTP header 或 stdio env） */
export function mcpPresetNeedsSecret(preset: McpPresetDef): boolean {
  return preset.services.some(s => Boolean((s.apiKeyEnv ?? s.apiKeyHeader ?? '').trim()))
}

export async function removeMcpPreset(presetId: string) {
  return jsonFetch<{ ok: boolean }>('/mcp-servers/remove-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presetId }),
  })
}

/** 工作流技能公开视图 */
export interface PublicAgentSkill {
  name: string
  description: string
  source: 'builtin' | 'user' | 'imported' | 'agent_created'
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  /** 空格分隔的能力白名单 */
  allowedTools?: string
  references?: string[]
  body?: string
}

export interface UpdateAgentSkillPayload {
  name: string
  description: string
  body: string
  license?: string
  compatibility?: string
  allowedTools?: string
  references?: string[]
}

export async function listAgentSkills() {
  return jsonFetch<{ skills: PublicAgentSkill[] }>('/agent-skills')
}

export async function getAgentSkill(name: string) {
  return jsonFetch<{ skill: PublicAgentSkill }>(`/agent-skills/${encodeURIComponent(name)}`)
}

export async function forkAgentSkill(name: string) {
  return jsonFetch<{ skill: PublicAgentSkill }>(
    `/agent-skills/${encodeURIComponent(name)}/fork`,
    { method: 'POST' },
  )
}

export async function updateAgentSkill(name: string, payload: UpdateAgentSkillPayload) {
  return jsonFetch<{ skill: PublicAgentSkill }>(
    `/agent-skills/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export async function getAgentSkillFile(name: string, path: string) {
  const qs = `?path=${encodeURIComponent(path)}`
  return jsonFetch<{ skill_name: string; path: string; content: string }>(
    `/agent-skills/${encodeURIComponent(name)}/file${qs}`,
  )
}

export async function importAgentSkill(markdown: string) {
  return jsonFetch<{ skill: PublicAgentSkill }>('/agent-skills/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })
}

export async function createAgentSkill(input: {
  name: string
  description: string
  body: string
  license?: string
  compatibility?: string
  allowedTools?: string
  references?: string[]
}) {
  return jsonFetch<{ skill: PublicAgentSkill }>('/agent-skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function deleteAgentSkill(name: string) {
  return jsonFetch<{ ok: true; name: string }>(`/agent-skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export async function getMcpServerInfo(id: string) {
  return jsonFetch<{
    version: { name: string; version: string } | null
    capabilities: { [key: string]: unknown } | null
    instructions: string | null
  }>(`/mcp-servers/${encodeURIComponent(id)}/info`)
}

export async function pingMcpServer(id: string) {
  return jsonFetch<{ ok: boolean; message: string }>(
    `/mcp-servers/${encodeURIComponent(id)}/ping`,
    { method: 'POST' },
    15_000,
  )
}

export async function listMcpPrompts(id: string) {
  return jsonFetch<{ prompts: Array<{ name: string; description?: string }> }>(
    `/mcp-servers/${encodeURIComponent(id)}/prompts`,
  )
}

export async function getMcpPrompt(id: string, name: string, args?: Record<string, string>) {
  return jsonFetch<{ messages?: unknown[] }>(
    `/mcp-servers/${encodeURIComponent(id)}/prompts/${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args }),
    },
  )
}

export async function listMcpResources(id: string) {
  return jsonFetch<{ resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> }>(
    `/mcp-servers/${encodeURIComponent(id)}/resources`,
  )
}

export async function readMcpResource(id: string, uri: string) {
  return jsonFetch<{ contents?: unknown[] }>(
    `/mcp-servers/${encodeURIComponent(id)}/resources/read`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    },
  )
}

export async function listMcpResourceTemplates(id: string) {
  return jsonFetch<{ templates: Array<{ uriTemplate: string; name: string; description?: string }> }>(
    `/mcp-servers/${encodeURIComponent(id)}/resource-templates`,
  )
}

export async function completeMcp(id: string, ref: unknown, argument: { name: string; value: string }) {
  return jsonFetch<{ completion?: { values: string[] } }>(
    `/mcp-servers/${encodeURIComponent(id)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, argument }),
    },
  )
}

export async function setMcpLoggingLevel(id: string, level: string) {
  return jsonFetch<{ ok: boolean; message?: string }>(
    `/mcp-servers/${encodeURIComponent(id)}/logging-level`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    },
  )
}

export async function subscribeMcpResource(id: string, uri: string) {
  return jsonFetch<{ ok: boolean; message?: string }>(
    `/mcp-servers/${encodeURIComponent(id)}/subscribe`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    },
  )
}

export async function unsubscribeMcpResource(id: string, uri: string) {
  return jsonFetch<{ ok: boolean; message?: string }>(
    `/mcp-servers/${encodeURIComponent(id)}/unsubscribe`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    },
  )
}

// ─── Sandbox settings API ───

export interface SandboxSettings {
  allowed_domains: string[]
  allow_lan_access: boolean
  /** Windows：`elevated` 完整隔离 / `unelevated` 基础隔离（产品默认）；非 Windows 可持久化，运行时忽略 */
  windows_isolation_mode: 'elevated' | 'unelevated'
}

export interface SandboxPlatformStatus {
  platform: string
  supported: boolean
  sandbox_available: boolean
  ready: boolean
  message: string
  setup_hint?: string
  needs_windows_install?: boolean
  needs_linux_install?: boolean
  can_auto_install?: boolean
  needs_elevation?: boolean
  userns_restricted?: boolean
  windows_isolation_mode?: 'elevated' | 'unelevated'
  network_isolation_level?: 'full' | 'basic' | 'none'
}

export const sandboxSettings = {
  getSettings: () =>
    jsonFetch<{ settings: SandboxSettings }>('/settings/sandbox'),

  getStatus: () =>
    jsonFetch<{ status: SandboxPlatformStatus }>('/settings/sandbox/status'),

  saveSettings: (settings: Partial<SandboxSettings>) =>
    jsonFetch<{ settings: SandboxSettings }>('/settings/sandbox', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
}

// ─── Schedule API ───

export type ScheduleOsStatus = 'synced' | 'pending' | 'error' | 'n/a'

export interface ScheduleSettings {
  master_enabled: boolean
  /** 兼容字段：始终 false，不再注册系统定时 */
  run_when_closed: boolean
  autostart: boolean
  allow_shell_scripts: boolean
  os_tick_status?: ScheduleOsStatus
  os_tick_error?: string | null
}

export interface ScheduleOsHealth {
  status: ScheduleOsStatus
  message: string
  error: string | null
  autostart: boolean
}

export interface ScheduleJobSummary {
  total: number
  enabled: number
  disabled: number
  next_due: string | null
}

export interface ScheduledJob {
  id: string
  title: string
  enabled: boolean
  kind: 'agent_prompt' | 'shell_script'
  schedule_kind: 'once' | 'interval' | 'cron'
  schedule: Record<string, unknown>
  payload: Record<string, unknown>
  os_registration_id: string | null
  os_status: ScheduleOsStatus
  next_run_at: string | null
  last_run_at: string | null
  last_status: string | null
  created_at: string
  updated_at: string
}

export const scheduleApi = {
  getSettings: () =>
    jsonFetch<{ settings: ScheduleSettings }>('/schedule/settings'),

  patchSettings: (patch: Partial<ScheduleSettings> & { resync_os?: boolean }) =>
    jsonFetch<{ settings: ScheduleSettings; os?: ScheduleOsHealth }>('/schedule/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  getStatus: () =>
    jsonFetch<{
      master_enabled: boolean
      run_when_closed: boolean
      allow_shell_scripts: boolean
      autostart: boolean
      os: ScheduleOsHealth
      jobs: ScheduleJobSummary
      recent_failures: Array<{
        job_id: string
        job_title: string
        run_id: string
        started_at: string
        error: string | null
      }>
      recent_failure_count: number
    }>('/schedule/status'),

  listJobs: () =>
    jsonFetch<{ jobs: ScheduledJob[] }>('/schedule/jobs'),

  enableJob: (id: string) =>
    jsonFetch<{ job: ScheduledJob }>(`/schedule/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }),

  disableJob: (id: string) =>
    jsonFetch<{ job: ScheduledJob }>(`/schedule/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    }),
}

// ─── Python settings API ───

export interface PythonSettings {
  pip_index_urls: string[]
  prefer_opptrix_python: boolean
}

export interface PythonRuntimeStatus {
  system_path: string | null
  system_version: string | null
  opptrix_path: string | null
  opptrix_version: string | null
  active_source: 'system' | 'opptrix' | 'none'
  active_path: string | null
  active_version: string | null
  ready: boolean
  recommend_install: boolean
  message: string
  /** 安装包内是否带有托管 Python */
  bundled_available?: boolean
}

export interface PythonInstallJobSnapshot {
  state: 'idle' | 'queued' | 'running' | 'failed' | 'completed'
  message: string
  accepted: boolean
  phase: 'idle' | 'prepare' | 'download' | 'extract' | 'configure' | 'pip' | 'verify' | 'done'
  percent: number
  bytes_downloaded: number
  bytes_total: number | null
  steps: string[]
  error: string | null
  /** Agent 轮询用；设置页可忽略 */
  job_id?: string | null
}

export const pythonSettings = {
  getSettings: () =>
    jsonFetch<{ settings: PythonSettings }>('/settings/python'),

  getStatus: () =>
    jsonFetch<{ status: PythonRuntimeStatus }>('/settings/python/status'),

  saveSettings: (settings: Partial<PythonSettings>) =>
    jsonFetch<{ settings: PythonSettings }>('/settings/python', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),

  startInstall: () =>
    jsonFetch<{ job: PythonInstallJobSnapshot; status: PythonInstallJobSnapshot }>(
      '/settings/python/install',
      { method: 'POST' },
    ),

  getInstallJob: () =>
    jsonFetch<{ job: PythonInstallJobSnapshot }>('/settings/python/install'),
}

export type SemanticModelInstallPhase =
  | 'idle'
  | 'downloading'
  | 'enabling'
  | 'ready'
  | 'error'

export type SemanticModelInstallJobSnapshot = {
  phase: SemanticModelInstallPhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  file: string | null
  receivedBytes: number
  totalBytes: number | null
  error: string | null
  installed: boolean
  label: string
  source: 'bundled' | 'user' | 'missing'
}

export type SemanticModelStatus = {
  installed: boolean
  label: string
  /** bundled = 应用自带；user = 本机副本；missing = 未就绪 */
  source?: 'bundled' | 'user' | 'missing'
  phase?: SemanticModelInstallPhase
  progress?: {
    file: string | null
    receivedBytes: number
    totalBytes: number | null
    percent: number
  }
  message?: string
  error?: string | null
  job?: SemanticModelInstallJobSnapshot
}

export const semanticModelSettings = {
  getStatus: () =>
    jsonFetch<SemanticModelStatus>('/settings/semantic-model'),

  /** 立即返回；后台下载。请轮询 getStatus / getInstallJob。 */
  install: () =>
    jsonFetch<{ ok: boolean; started: boolean; job: SemanticModelInstallJobSnapshot }>(
      '/settings/semantic-model/install',
      { method: 'POST' },
    ),

  getInstallJob: () =>
    jsonFetch<{ job: SemanticModelInstallJobSnapshot }>('/settings/semantic-model/install'),

  uninstall: () =>
    jsonFetch<{ ok: boolean; installed: boolean; label: string; source?: string; error?: string }>(
      '/settings/semantic-model/uninstall',
      { method: 'POST' },
      LOCAL_HEAVY_TIMEOUT,
    ),
}

export type ParseEnginesStatus = {
  /** @deprecated 版面增强已停用；旧客户端可能仍读此字段 */
  layout?: {
    available: boolean
    installed: boolean
    label: string
    hint: string
    source?: 'bundled' | 'user' | 'missing'
  }
  deep: {
    available: boolean
    installed: boolean
    label: string
    hint: string
    /** bundled = 应用自带；user = 本机准备；missing = 未就绪 */
    source?: 'bundled' | 'user' | 'missing'
    phase?: OcrDeepPreparePhase
    progress?: {
      file: string | null
      receivedBytes: number
      totalBytes: number | null
      percent: number
    }
    message?: string
    error?: string | null
    job?: OcrDeepPrepareJobSnapshot
  }
  semantic: { installed: boolean; label: string; source?: 'bundled' | 'user' | 'missing' }
}

export type OcrDeepPreparePhase =
  | 'idle'
  | 'downloading'
  | 'ready'
  | 'error'

export type OcrDeepPrepareJobSnapshot = {
  phase: OcrDeepPreparePhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  file: string | null
  receivedBytes: number
  totalBytes: number | null
  error: string | null
  available: boolean
  installed: boolean
  label: string
  source: 'bundled' | 'user' | 'missing'
}

export const parseEnginesSettings = {
  getStatus: () =>
    jsonFetch<ParseEnginesStatus>('/settings/parse-engines'),

  /** 立即返回；后台下载。请轮询 getStatus / getPrepareJob。 */
  prepareDeep: () =>
    jsonFetch<{ ok: boolean; started: boolean; job: OcrDeepPrepareJobSnapshot }>(
      '/settings/parse-engines/deep/prepare',
      { method: 'POST' },
    ),

  getPrepareJob: () =>
    jsonFetch<{ job: OcrDeepPrepareJobSnapshot }>('/settings/parse-engines/deep/prepare'),

  uninstallDeep: () =>
    jsonFetch<{ ok: boolean; error?: string }>(
      '/settings/parse-engines/deep/uninstall',
      { method: 'POST' },
      LOCAL_HEAVY_TIMEOUT,
    ),
}
