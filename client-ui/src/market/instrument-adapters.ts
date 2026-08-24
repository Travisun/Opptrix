/**
 * 将标准 instrument_* REST 响应适配为现有 UI 类型（camelCase / 旧字段名）。
 * Mirrors @opptrix/shared instrument-response shapes.
 */

import type { InstrumentRef } from '../types/instrument'
import type {
  ChartPeriod,
  CrossMarketKlineBar,
  CrossMarketQuote,
  CryptoSnapshotData,
  EtfNavPoint,
  EtfProfileData,
  EtfSnapshotData,
  IntradayChartBar,
  MarketQuote,
  OhlcChartBar,
  StockChartData,
  StockDetailData,
  UsSnapshotData,
} from '../types/market'

export interface UnifiedInstrumentQuoteDto {
  instrument: InstrumentRef
  code: string
  name: string
  price: number | null
  change_pct: number | null
  volume: number | null
  amount: number | null
  market: InstrumentRef['market']
  asset_class: InstrumentRef['assetClass']
  source: 'local' | 'live' | 'mixed'
  open?: number | null
  high?: number | null
  low?: number | null
  pre_close?: number | null
  change?: number | null
  pe?: number | null
  pb?: number | null
  turnover_rate?: number | null
  amplitude?: number | null
  volume_ratio?: number | null
  market_cap?: number | null
  circulating_market_cap?: number | null
  week52_high?: number | null
  week52_low?: number | null
  currency?: string | null
  quote_session?: string | null
  session_label?: string | null
}

/** 单只标的行情获取失败项 — /instruments/quotes 响应 failed[] 契约 */
export type QuoteFailedReason = 'no_provider' | 'unsupported' | 'empty' | 'error' | 'not_found'

export interface QuoteFailedItem {
  instrument: InstrumentRef
  code: string
  reason: QuoteFailedReason
}

/** /instruments/quotes 成功响应（部分成功 success:true 时携带 failed[]） */
export interface UnifiedInstrumentQuotesDto {
  quotes: UnifiedInstrumentQuoteDto[]
  failed?: QuoteFailedItem[]
}

export interface UnifiedChartBarDto {
  time: string
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  price?: number | null
  volume?: number | null
  amount?: number | null
  change_pct?: number | null
  turnover_rate?: number | null
  avg_price?: number | null
}

export interface UnifiedInstrumentChartDto {
  instrument: InstrumentRef
  code: string
  name: string
  period: string
  pre_close: number | null
  session_date?: string | null
  is_trading_day?: boolean
  has_more?: boolean
  bars: UnifiedChartBarDto[]
  indicators?: Record<string, unknown>[]
  chart_time_zone?: string
  extras?: Record<string, unknown>
  source?: string
}

export interface UnifiedInstrumentSnapshotDto {
  instrument: InstrumentRef
  code: string
  name: string
  quote: UnifiedInstrumentQuoteDto | null
  profile: Record<string, unknown> | null
  recent_bars: UnifiedChartBarDto[]
  extras?: {
    financial?: unknown
    financial_history?: unknown[]
    news?: unknown[]
    notices?: unknown[]
    articles?: unknown[]
    dividends?: unknown[]
    money_flow?: unknown[]
    shareholders?: unknown
    nav?: unknown
    holdings?: unknown
    review_prospect?: { review?: string | null; prospect?: string | null } | null
    related_stocks?: unknown[]
    senior_trades?: unknown[]
    trading_distribution?: unknown
    local_insights?: {
      trade_date: string | null
      total_score: number | null
      scorecard: string | null
      pe: number | null
      pb: number | null
      pe_percentile: number | null
      pb_percentile: number | null
    } | null
  }
  source?: string
}

export function isUnifiedSnapshot(data: unknown): data is UnifiedInstrumentSnapshotDto {
  return !!data && typeof data === 'object' && 'instrument' in data && 'recent_bars' in data
}

export function isUnifiedChart(data: unknown): data is UnifiedInstrumentChartDto {
  return !!data && typeof data === 'object' && 'instrument' in data && Array.isArray((data as UnifiedInstrumentChartDto).bars)
}

export function unifiedQuoteToMarketQuote(q: UnifiedInstrumentQuoteDto): MarketQuote {
  return {
    code: q.code,
    name: q.name,
    price: q.price,
    changePct: q.change_pct,
    pe: q.pe ?? null,
    pb: q.pb ?? null,
    turnoverRate: q.turnover_rate ?? null,
    marketCap: q.market_cap ?? null,
    open: q.open ?? null,
    high: q.high ?? null,
    low: q.low ?? null,
    preClose: q.pre_close ?? null,
    volume: q.volume,
    amount: q.amount,
    change: q.change ?? null,
    amplitude: q.amplitude ?? null,
    volumeRatio: q.volume_ratio ?? null,
  }
}

function quoteDtoToMarketQuote(q: UnifiedInstrumentQuoteDto): MarketQuote {
  return unifiedQuoteToMarketQuote(q)
}

function quoteDtoToCrossMarket(q: UnifiedInstrumentQuoteDto): CrossMarketQuote {
  return {
    code: q.code,
    name: q.name,
    price: q.price,
    changePct: q.change_pct,
    change: q.change ?? null,
    open: q.open ?? null,
    high: q.high ?? null,
    low: q.low ?? null,
    preClose: q.pre_close ?? null,
    volume: q.volume,
    amount: q.amount ?? null,
    pe: q.pe ?? null,
    pb: q.pb ?? null,
    turnoverRate: q.turnover_rate ?? null,
    amplitude: q.amplitude ?? null,
    volumeRatio: q.volume_ratio ?? null,
    marketCap: q.market_cap ?? null,
    circulatingMarketCap: q.circulating_market_cap ?? null,
    week52High: q.week52_high ?? null,
    week52Low: q.week52_low ?? null,
    currency: q.currency ?? null,
    quoteSession: (q.quote_session as CrossMarketQuote['quoteSession']) ?? undefined,
    sessionLabel: q.session_label ?? undefined,
  }
}

function barsToCrossMarketKlines(bars: UnifiedChartBarDto[]): CrossMarketKlineBar[] {
  return bars.map(b => ({
    date: b.time,
    open: b.open ?? b.close ?? 0,
    close: b.close ?? b.price ?? 0,
    high: b.high ?? b.close ?? b.price ?? 0,
    low: b.low ?? b.close ?? b.price ?? 0,
    volume: b.volume ?? 0,
    changePct: b.change_pct ?? null,
  }))
}

/** UnifiedInstrumentSnapshot → StockDetailData（A 股详情 Tab） */
export function unifiedSnapshotToStockDetail(data: UnifiedInstrumentSnapshotDto): StockDetailData {
  const quote = data.quote ? quoteDtoToMarketQuote(data.quote) : null
  return {
    code: data.code,
    name: data.name,
    quote,
    profile: data.profile as StockDetailData['profile'],
    financial: (data.extras?.financial as StockDetailData['financial']) ?? null,
    financialHistory: data.extras?.financial_history as StockDetailData['financialHistory'],
    news: data.extras?.news as StockDetailData['news'],
    dividends: data.extras?.dividends as StockDetailData['dividends'],
    moneyFlow: data.extras?.money_flow as StockDetailData['moneyFlow'],
    shareholders: data.extras?.shareholders as StockDetailData['shareholders'],
  }
}

function asEtfNavPoint(raw: unknown): EtfNavPoint | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const date = String(row.date ?? row.navDate ?? '').slice(0, 10)
  return {
    code: row.code != null ? String(row.code) : undefined,
    date: date || new Date().toISOString().slice(0, 10),
    nav: typeof row.nav === 'number' ? row.nav : null,
    accNav: typeof row.accNav === 'number' ? row.accNav : null,
    changePct: typeof row.changePct === 'number' ? row.changePct : null,
    premiumRate: typeof row.premiumRate === 'number' ? row.premiumRate : null,
  }
}

/** UnifiedInstrumentSnapshot → EtfSnapshotData（ETF 详情 Tab） */
export function unifiedSnapshotToEtfSnapshot(data: UnifiedInstrumentSnapshotDto): EtfSnapshotData {
  const quote = data.quote ? quoteDtoToMarketQuote(data.quote) : null
  const profile = (data.profile as EtfProfileData | null) ?? null
  const nav = asEtfNavPoint(data.extras?.nav)
  const name = data.name?.trim() || profile?.name
  return {
    code: data.code,
    profile: profile
      ? {
        ...profile,
        name: profile.name || name,
        changePct: profile.changePct ?? quote?.changePct ?? null,
        nav: profile.nav ?? nav?.nav ?? null,
        premiumRate: profile.premiumRate ?? nav?.premiumRate ?? null,
      }
      : name
        ? { code: data.code, name, changePct: quote?.changePct ?? null }
        : null,
    nav,
    quote,
  }
}

/** UnifiedInstrumentSnapshot → 跨市场快照视图 */
export function unifiedSnapshotToCrossMarket(
  data: UnifiedInstrumentSnapshotDto,
  ref: InstrumentRef,
): UsSnapshotData | CryptoSnapshotData {
  const quote = data.quote ? quoteDtoToCrossMarket(data.quote) : null
  const klines = barsToCrossMarketKlines(data.recent_bars)
  if (ref.market === 'CRYPTO') {
    return { pair: data.code, quote, recentKlines: klines }
  }
  return {
    code: data.code,
    name: data.name,
    profile: data.profile,
    quote,
    recentKlines: klines,
    financial: (data.extras?.financial as UsSnapshotData['financial']) ?? null,
    financialHistory: data.extras?.financial_history as UsSnapshotData['financialHistory'],
    notices: (data.extras?.notices ?? data.extras?.news) as UsSnapshotData['notices'],
    articles: data.extras?.articles as UsSnapshotData['articles'],
    dividends: data.extras?.dividends as UsSnapshotData['dividends'],
    shareholders: data.extras?.shareholders as UsSnapshotData['shareholders'],
    reviewProspect: data.extras?.review_prospect
      ? {
        review: data.extras.review_prospect.review ?? null,
        prospect: data.extras.review_prospect.prospect ?? null,
      }
      : null,
    relatedStocks: data.extras?.related_stocks as UsSnapshotData['relatedStocks'],
    seniorTrades: data.extras?.senior_trades as UsSnapshotData['seniorTrades'],
    tradingDistribution: data.extras?.trading_distribution as UsSnapshotData['tradingDistribution'],
  }
}

/** UnifiedInstrumentChart → StockChartData */
export function unifiedChartToStockChart(
  data: UnifiedInstrumentChartDto,
  fallbackCode: string,
): StockChartData {
  const period = data.period as ChartPeriod
  const isLinePeriod = period === 'intraday' || period === '5day'
  if (isLinePeriod) {
    const bars: IntradayChartBar[] = data.bars.map(b => ({
      time: b.time,
      price: b.price ?? b.close ?? 0,
      volume: b.volume ?? 0,
      amount: b.amount ?? 0,
      avgPrice: b.avg_price ?? b.price ?? b.close ?? 0,
    }))
    return {
      code: data.code || fallbackCode,
      name: data.name || fallbackCode,
      period,
      preClose: data.pre_close,
      sessionDate: data.session_date ?? null,
      isTradingDay: data.is_trading_day ?? false,
      hasMore: data.has_more,
      bars,
      indicators: (data.indicators ?? []) as unknown as StockChartData['indicators'],
      chartTimeZone: data.chart_time_zone,
      cyqLatest: data.extras?.cyqLatest as StockChartData['cyqLatest'],
      cyqProfile: data.extras?.cyqProfile as StockChartData['cyqProfile'],
    }
  }

  const bars: OhlcChartBar[] = data.bars.map(b => ({
    time: b.time,
    open: b.open ?? b.close ?? b.price ?? 0,
    high: b.high ?? b.close ?? b.price ?? 0,
    low: b.low ?? b.close ?? b.price ?? 0,
    close: b.close ?? b.price ?? 0,
    volume: b.volume ?? 0,
    amount: b.amount ?? 0,
    changePct: b.change_pct ?? null,
    turnoverRate: b.turnover_rate ?? null,
  }))
  return {
    code: data.code || fallbackCode,
    name: data.name || fallbackCode,
    period: data.period as ChartPeriod,
    preClose: data.pre_close,
    sessionDate: data.session_date ?? null,
    isTradingDay: data.is_trading_day ?? false,
    hasMore: data.has_more,
    bars,
    indicators: (data.indicators ?? []) as unknown as StockChartData['indicators'],
    chartTimeZone: data.chart_time_zone,
    cyqLatest: data.extras?.cyqLatest as StockChartData['cyqLatest'],
    cyqProfile: data.extras?.cyqProfile as StockChartData['cyqProfile'],
  }
}
