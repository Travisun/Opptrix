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
    dividends?: unknown[]
    money_flow?: unknown[]
    shareholders?: unknown
    nav?: unknown
    holdings?: unknown
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
    volume: q.volume,
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
    profile: data.profile,
    quote,
    recentKlines: klines,
  }
}

/** UnifiedInstrumentChart → StockChartData */
export function unifiedChartToStockChart(
  data: UnifiedInstrumentChartDto,
  fallbackCode: string,
): StockChartData {
  const period = data.period as ChartPeriod
  if (period === 'intraday') {
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
      indicators: (data.indicators ?? []) as StockChartData['indicators'],
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
    indicators: (data.indicators ?? []) as StockChartData['indicators'],
    cyqLatest: data.extras?.cyqLatest as StockChartData['cyqLatest'],
    cyqProfile: data.extras?.cyqProfile as StockChartData['cyqProfile'],
  }
}
