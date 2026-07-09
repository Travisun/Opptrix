import type {
  ApiResponse,
  FeedArticle,
  FeedGroup,
  FeedPageResult,
  FeedSubscription,
  NewsGroupedFeed,
  NewsSettings,
  ValidateFeedResult,
} from '../types/schemas'
import type { ChatProgressEvent } from '../types/chatProgress'
import type { ChatDisplayMessage, EphemeralAskTurn, SessionContextRef, SessionMeta, AvailableModel } from '../types/chat'
import type { ExportDestination, ExportPackageResult } from '../platform/saveMarketPackage'
import {
  formatExportResultMessage,
  pickExportDestination,
  saveMarketPackageBlob,
} from '../platform/saveMarketPackage'

/** Vite dev/preview proxies /api → backend (default :8711). */
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const REQUEST_TIMEOUT = 10000 // 10s — quick reads / mutations
/** Agent chat: multiple LLM + tool rounds (server LLM timeout up to 120s per round). */
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
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `API error: ${resp.status}`)
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
  ScreeningData, StrategySignalData, StrategyVerifyData, TrendBriefData,
  PortfolioAnalysisData, IndustryMiningData, IndustryStatItem, IndustryStockItem, MarketReportData,
  SearchStocksData, BacktestResultData, LatestEvalData, ReportTextData,
} from '../types/schemas'
import { cnEquityRef } from '../market/instrument'
import {
  isUnifiedChart,
  isUnifiedSnapshot,
  unifiedChartToStockChart,
  unifiedSnapshotToCrossMarket,
  unifiedSnapshotToStockDetail,
  unifiedQuoteToMarketQuote,
  type UnifiedInstrumentChartDto,
  type UnifiedInstrumentSnapshotDto,
} from '../market/instrument-adapters'
import type { InstrumentRef, UnifiedInstrumentQuote } from '../types/instrument'
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
  resp: InstrumentEnvelope<T>,
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
  diagnose: (code: string, scorecard?: string) =>
    callInstrumentApi<StockDiagnosisData>(
      'stock_diagnosis',
      '/instruments/evaluation',
      { instrument: cnEquityRef(code), ...(scorecard ? { scorecard } : {}) },
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
    ),

  institutionRating: (code: string, groups?: string[], signal?: AbortSignal) =>
    callInstrumentApi<InstitutionRatingData>(
      'institution_rating',
      '/instruments/institution-rating',
      { instrument: cnEquityRef(code), ...(groups?.length ? { groups } : {}) },
      {
        code,
        name: code,
        avg_confidence: 0,
        avg_raw_confidence: 0,
        consensus_rating: '',
        consensus_rating_cn: '',
        items: [],
      },
      signal,
      20000,
    ),

  screen: (conditions: any[], scorecard = '综合评估', topN = 20, signal?: AbortSignal) =>
    apiCall<ScreeningData>('screening', { conditions, scorecard, top_n: topN }, { signal }, 120000),

  marketDbStatus: () =>
    apiCall<import('../types/market').MarketDbStatusData>('market_db_status'),

  marketDbSync: (mode: 'auto' | 'full' | 'incremental' | 'resume' = 'auto', background = true, force = false) =>
    apiCall<{ started: boolean; running: boolean; mode: string }>(
      'market_db_sync',
      { mode, background, force },
      undefined,
      background ? 15000 : 600000,
    ),

  strategySignals: (code: string, signal?: AbortSignal) =>
    callInstrumentApi<StrategySignalData>(
      'strategy_signal',
      '/instruments/strategy-signal',
      { instrument: cnEquityRef(code) },
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
    ),

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

  strategyVerify: (code: string, checkpoints = 30, forwardDays = 5) =>
    callInstrumentApi<StrategyVerifyData>(
      'strategy_verify',
      '/instruments/strategy-verify',
      { instrument: cnEquityRef(code), checkpoints, forward_days: forwardDays },
      {
        code,
        name: code,
        checkpoints,
        forward_days: forwardDays,
        date_range: [],
        avg_win_rate: 0,
        best_strategy: null,
        performances: [],
      },
      undefined,
      120000,
    ),

  portfolioAnalysis: (holdings: [string, number][]) =>
    apiCall<PortfolioAnalysisData>('portfolio_analysis', { holdings }),

  industryMining: (industry: string) =>
    apiCall<IndustryMiningData>('industry_mining', { industry }),

  marketIndustryStats: (tradeDate?: string) =>
    apiCall<{ items: IndustryStatItem[]; trade_date: string | null; quote_date: string | null }>(
      'market_industry_stats',
      tradeDate ? { trade_date: tradeDate } : {},
    ),

  marketRegime: (scope: 'cn' | 'us' = 'cn') =>
    apiCall<import('../types/schemas').MarketRegimeData>('market_regime', { profile_scope: scope }),

  industryStocks: (industry: string, limit = 120) =>
    apiCall<{ trade_date: string; quote_date: string | null; industry: string; items: IndustryStockItem[] }>(
      'market_industry_stocks',
      { industry, limit },
    ),

  marketReport: (type: 'morning' | 'closing') =>
    apiCall<MarketReportData>('market_report', { type }),

  marketDynamics: () =>
    apiCall<import('../types/schemas').MarketDynamicsData>('market_dynamics', {}, undefined, 20000),

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

  stockQuotes: async (codes: string[]) => {
    const instruments = codes.map(c => cnEquityRef(c))
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

  watchlistRadar: (codes: string[], signal?: AbortSignal) =>
    apiCall<import('../types/schemas').WatchlistRadarData>('watchlist_radar', { codes }, { signal }, 15000),

  stockKline: async (code: string, count = 90) => {
    const instrument = cnEquityRef(code)
    const resp = await postInstrument<StockChartData | UnifiedInstrumentChartDto>(
      '/instruments/chart',
      { instrument, period: 'daily', count },
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
    code: string,
    period: ChartPeriod,
    count?: number,
    signal?: AbortSignal,
    before?: string,
    tail?: number,
  ) => {
    const instrument = cnEquityRef(code)
    const body: Record<string, unknown> = { instrument, period }
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

  stockCyq: async (code: string, signal?: AbortSignal) => {
    const instrument = cnEquityRef(code)
    const resp = await postInstrument<{
      code: string
      rows: ChipDistributionPoint[]
      latest: ChipDistributionPoint
    }>('/instruments/cyq', { instrument }, signal, 15000)
    return toApiResponse('stock_cyq', resp, {
      code,
      rows: [],
      latest: { date: '', benefitPart: 0, avgCost: 0, cost90Low: 0, cost90High: 0, cost90Con: 0, cost70Low: 0, cost70High: 0, cost70Con: 0 },
    })
  },

  stockDetail: async (code: string) => {
    const instrument = cnEquityRef(code)
    const resp = await postInstrument<StockDetailData | UnifiedInstrumentSnapshotDto>(
      '/instruments/snapshot',
      { instrument },
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

  etfSnapshot: (code: string, signal?: AbortSignal) =>
    apiCall<import('../types/market').EtfSnapshotData>('etf_snapshot', { code }, { signal }, 20000),

  etfNav: (code: string, signal?: AbortSignal) =>
    apiCall<{ code: string; items: import('../types/market').EtfNavPoint[]; source?: string }>(
      'local_etf_nav',
      { code },
      { signal },
      20000,
    ),

  etfHoldings: (code: string, signal?: AbortSignal) =>
    apiCall<{ code: string; items: import('../types/market').EtfHoldingRow[]; source?: string }>(
      'local_etf_holdings',
      { code },
      { signal },
      20000,
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
    jsonFetch<{ success: boolean; data?: { items: import('../types/instrument').LocalInstrumentHit[]; count: number } }>(
      `/instruments/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
      { signal },
    ),

  instrumentsSummary: () =>
    jsonFetch<{ success: boolean; data?: {
      summary: Array<{ market: string; assetClass: string; count: number }>
      counts: { cn_stocks: number; cn_etfs: number; us: number; crypto: number }
    } }>('/instruments/summary'),

  instrumentSnapshot: async (instrument: InstrumentRef, signal?: AbortSignal) => {
    const resp = await postInstrument<UnifiedInstrumentSnapshotDto>('/instruments/snapshot', { instrument }, signal)
    if (resp.success && resp.data && isUnifiedSnapshot(resp.data)) {
      return {
        ...resp,
        data: unifiedSnapshotToCrossMarket(resp.data, instrument),
      }
    }
    return resp
  },

  instrumentQuotes: (instruments: InstrumentRef[], signal?: AbortSignal) =>
    postInstrument<{ quotes: UnifiedInstrumentQuote[] }>(
      '/instruments/quotes',
      { instruments },
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
    const body: Record<string, unknown> = { instrument, period, count }
    if (before) body.before = before
    if (tail != null) body.tail = tail
    const resp = await postInstrument<UnifiedInstrumentChartDto>('/instruments/chart', body, signal)
    if (resp.success && resp.data && isUnifiedChart(resp.data)) {
      return {
        ...resp,
        data: unifiedChartToStockChart(resp.data, instrument.symbol),
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
    { instrument, scorecard },
    signal,
    60000,
  ),

  instrumentStrategySignal: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<unknown>('/instruments/strategy-signal', { instrument }, signal, 60000),

  instrumentIndicators: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<unknown>('/instruments/indicators', { instrument }, signal, 60000),

  instrumentStrategyVerify: (
    instrument: InstrumentRef,
    checkpoints?: unknown[],
    forwardDays?: number,
    signal?: AbortSignal,
  ) => postInstrument<unknown>(
    '/instruments/strategy-verify',
    { instrument, checkpoints, forward_days: forwardDays },
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
      instrument,
      ...(scorecard ? { scorecard } : {}),
      ...(force ? { force: true } : {}),
    },
    {
      code: instrument.symbol,
      name: instrument.symbol,
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
      { instrument },
      signal,
    ),

  instrumentCyq: (instrument: InstrumentRef, signal?: AbortSignal) =>
    postInstrument<{
      code: string
      rows: ChipDistributionPoint[]
      latest: ChipDistributionPoint
    }>('/instruments/cyq', { instrument }, signal, 15000),

  instrumentInstitutionRating: (
    instrument: InstrumentRef,
    groups?: string[],
    signal?: AbortSignal,
  ) =>
    postInstrument<InstitutionRatingData>(
      '/instruments/institution-rating',
      { instrument, ...(groups?.length ? { groups } : {}) },
      signal,
      20000,
    ),

  backtest: (codes: string[], scorecard = '综合评估', periods = 5) =>
    apiCall<BacktestResultData>('backtest', { codes, scorecard, periods }),

  latestEval: (code: string, signal?: AbortSignal, scorecard?: string, force = false) =>
    callInstrumentApi<LatestEvalData>(
      'latest_evaluation',
      '/instruments/latest-evaluation',
      {
        instrument: cnEquityRef(code),
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
    ),

  strategyReport: (code: string) =>
    apiCall<ReportTextData>('strategy_report', { code }),

  portfolioTrades: (code = '', market?: string) =>
    apiCall<import('../types/schemas').PortfolioLedgerData>('portfolio_trades', { code, market }),

  portfolioSummary: () =>
    apiCall<import('../types/schemas').PortfolioSummaryData>('portfolio_summary', {}),
}

export async function fetchWatchlist() {
  const resp = await jsonFetch<{
    success: boolean
    data?: { items: import('../types/market').WatchlistItem[]; count: number }
  }>('/watchlist')
  return resp.data ?? { items: [], count: 0 }
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

export async function getMarketDataSyncState() {
  const resp = await jsonFetch<{ success: boolean; data: import('../types/market').MarketDataSyncState }>(
    '/market-data/sync-state',
  )
  if (!resp.data) throw new Error('无法获取同步状态')
  return resp.data
}

export async function startMarketDataSync(options: { force?: boolean } = {}) {
  return jsonFetch<{ success: boolean; message?: string }>('/market-data/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'auto',
      background: true,
      force: options.force ?? false,
    }),
  })
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

export interface MarketDataPacksState {
  config: MarketDataPackConfig
  counts: {
    cn_stocks: number
    cn_etfs: number
    us: number
    crypto: number
    jp: number
    kr: number
    hk: number
  }
}

export async function getMarketDataPacks() {
  const resp = await jsonFetch<{ success: boolean; data: MarketDataPacksState }>('/market-data/packs')
  if (!resp.data) throw new Error('无法读取市场数据包设置')
  return resp.data
}

export async function patchMarketDataPacks(
  patch: Partial<Record<'us' | 'crypto' | 'hk' | 'jp' | 'kr', { enabled?: boolean }>>,
) {
  return jsonFetch<{ success: boolean; data: { config: MarketDataPackConfig }; message?: string }>(
    '/market-data/packs',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    },
  )
}

export async function prepareMarketDataPack(pack: 'us' | 'crypto' | 'cn' | 'hk' | 'jp' | 'kr', force = false) {
  return jsonFetch<{ success: boolean; message?: string }>(`/market-data/packs/${pack}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  })
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

const MARKET_PACKAGE_TIMEOUT = 300_000

async function fetchMarketDataPackageBlob(pack?: SupplementPackId): Promise<{ blob: Blob; filename: string }> {
  const qs = pack ? `?pack=${pack}` : ''
  const resp = await fetchWithTimeout(`${API_BASE}/market-data/export${qs}`, {}, MARKET_PACKAGE_TIMEOUT)
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error || `导出失败（${resp.status}）`)
  }
  const blob = await resp.blob()
  const cd = resp.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(cd)
  const filename = match?.[1] ?? (pack ? `opptrix-market-${pack}.opmd` : 'opptrix-market.opmd')
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
  }, MARKET_PACKAGE_TIMEOUT)
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
  }, MARKET_PACKAGE_TIMEOUT)
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
  code: string; shares: number; price: number; side?: 'buy' | 'sell'; date?: string; market?: string
}) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error('trade failed')
  return resp.json()
}

export async function portfolioDeleteTrade(id: number) {
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/trade/${id}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('delete trade failed')
  return resp.json() as Promise<{ success: boolean }>
}

export async function portfolioClearInstrument(code: string, market?: string) {
  const qs = new URLSearchParams({ code: code.trim() })
  if (market) qs.set('market', market)
  const resp = await fetchWithTimeout(`${API_BASE}/portfolio/instrument?${qs}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error('clear portfolio instrument failed')
  return resp.json() as Promise<{ success: boolean; removed: number }>
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

export interface PublicProvider {
  id: string
  name: string
  base_url: string
  models: string[]
  api_key_configured: boolean
}

export interface ProviderPreset {
  id: string
  name: string
  base_url: string
}

export interface AppConfig {
  providers: PublicProvider[]
  available_models: AvailableModel[]
  default_model?: string
  default_scorecard: string
  default_top_n: number
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
}) {
  return jsonFetch<{ status: string; config: AppConfig }>('/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getProviderPresets() {
  return jsonFetch<{ presets: ProviderPreset[] }>('/providers/presets')
}

export async function discoverModels(base_url: string, api_key: string) {
  return jsonFetch<{ models: string[] }>('/providers/discover-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url, api_key }),
  })
}

export async function createProvider(payload: {
  name: string
  base_url: string
  api_key: string
  models: string[]
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
  return jsonFetch<{ models: AvailableModel[]; default_model: string | null }>('/models/available')
}

export async function listSessions() {
  return jsonFetch<{ sessions: SessionMeta[] }>('/sessions')
}

export async function createSession(title?: string) {
  return jsonFetch<{ session: SessionMeta }>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  })
}

export async function getSession(id: string) {
  return jsonFetch<{
    session: SessionMeta
    messages: ChatDisplayMessage[]
    contextRef: SessionContextRef | null
  }>(`/sessions/${id}`)
}

export async function renameSession(id: string, title: string) {
  return jsonFetch<{ session: Pick<SessionMeta, 'id' | 'title' | 'updatedAt'> }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function setSessionModel(id: string, model: string | null) {
  return jsonFetch<{ session: Pick<SessionMeta, 'id' | 'title' | 'model' | 'updatedAt'> }>(`/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
}

export async function deleteSession(id: string) {
  return jsonFetch<{ status: string }>(`/sessions/${id}`, { method: 'DELETE' })
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

export async function streamSessionChat(
  sessionId: string,
  message: string,
  onEvent: (event: ChatProgressEvent) => void,
  model?: string,
  signal?: AbortSignal,
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

// ─── News feed API ───

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

  ensureWhisperModel: () =>
    newsJsonFetch<{ ok: boolean; modelName: string }>('/news/multimodal/whisper/ensure', {
      method: 'POST',
    }),

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
