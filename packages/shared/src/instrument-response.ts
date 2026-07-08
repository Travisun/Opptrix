import type { AssetClass, InstrumentRef, Market } from './market-data.js'
import type { StockKline } from './types.js'
import type { UnifiedInstrumentQuote } from './application-api.js'
import { instrumentDisplayCode } from './instrument-ref.js'
import { normalizeInstrumentRef } from './instrument-symbol.js'

/** 本地 L0 离线因子摘要 — 仅 CN 同步库就绪时有值；不替代 local_universe_screen */
export interface LocalInstrumentInsights {
  trade_date: string | null
  total_score: number | null
  scorecard: string | null
  pe: number | null
  pb: number | null
  pe_percentile: number | null
  pb_percentile: number | null
}

export interface UnifiedChartBar {
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

export interface UnifiedInstrumentChart {
  instrument: InstrumentRef
  code: string
  name: string
  period: string
  pre_close: number | null
  session_date?: string | null
  is_trading_day?: boolean
  has_more?: boolean
  bars: UnifiedChartBar[]
  indicators?: Record<string, unknown>[]
  /** CN 专属：筹码等扩展块，跨市场为空 */
  extras?: Record<string, unknown>
  source: 'local' | 'live' | 'mixed'
}

export interface UnifiedInstrumentBatchResult {
  trade_date?: string | null
  count: number
  quotes: UnifiedInstrumentQuote[]
  /** CN 离线初选行（含 key_factors）— 与 local_universe_screen 同源 */
  discover_items?: Array<Record<string, unknown>>
  /** @deprecated 与 discover_items 相同，保留供 legacy Agent 工具读取 */
  items?: Array<Record<string, unknown>>
}

export interface UnifiedInstrumentSearchHit {
  instrument: InstrumentRef
  code: string
  ref_label: string
  name: string | null
  market: Market
  asset_class: AssetClass
  exchange: string | null
  source: 'stock_index' | 'tencent' | 'local' | 'online'
}

export interface UnifiedInstrumentSnapshot {
  instrument: InstrumentRef
  code: string
  name: string
  quote: UnifiedInstrumentQuote | null
  profile: Record<string, unknown> | null
  recent_bars: UnifiedChartBar[]
  extras?: {
    financial?: unknown
    financial_history?: unknown[]
    news?: unknown[]
    dividends?: unknown[]
    money_flow?: unknown[]
    shareholders?: unknown
    nav?: unknown
    holdings?: unknown
    /** 本地离线因子/评分摘要 — 与 local_universe_screen 互补，非替代 */
    local_insights?: LocalInstrumentInsights | null
  }
  source: 'local' | 'live' | 'mixed'
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown, fallback = ''): string {
  return v != null ? String(v) : fallback
}

export function quoteFromProviderRow(
  ref: InstrumentRef,
  row: Record<string, unknown>,
  source: UnifiedInstrumentQuote['source'] = 'live',
): UnifiedInstrumentQuote {
  const instrument = normalizeInstrumentRef(ref)
  return {
    instrument,
    code: instrumentDisplayCode(instrument),
    name: str(row.name, instrument.symbol),
    price: num(row.price),
    change_pct: num(row.changePct ?? row.change_pct),
    volume: num(row.volume),
    amount: num(row.amount),
    market: instrument.market,
    asset_class: instrument.assetClass,
    source,
  }
}

export function klinesToChartBars(rows: StockKline[] | Record<string, unknown>[]): UnifiedChartBar[] {
  return rows.map(row => {
    const r = row as Record<string, unknown>
    const date = str(r.date ?? r.time ?? r.sessionDate)
    const isIntraday = r.price != null && r.open == null
    if (isIntraday) {
      return {
        time: date,
        price: num(r.price),
        volume: num(r.volume),
        amount: num(r.amount),
        avg_price: num(r.avgPrice ?? r.avg_price),
      }
    }
    return {
      time: date,
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      close: num(r.close),
      volume: num(r.volume),
      amount: num(r.amount),
      change_pct: num(r.changePct ?? r.change_pct),
      turnover_rate: num(r.turnoverRate ?? r.turnover_rate),
    }
  })
}

export function localHitToSearchHit(hit: {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  refLabel: string
}): UnifiedInstrumentSearchHit {
  const instrument = normalizeInstrumentRef(hit.instrument)
  return {
    instrument,
    code: hit.code,
    ref_label: hit.refLabel,
    name: hit.name,
    market: instrument.market,
    asset_class: instrument.assetClass,
    exchange: hit.exchange,
    source: 'local',
  }
}

export function onlineHitToSearchHit(hit: {
  code: string
  name: string | null
  market: Market
  assetClass: AssetClass
  exchange: string | null
  instrument: InstrumentRef
  refLabel: string
  source: 'stock_index' | 'tencent'
}): UnifiedInstrumentSearchHit {
  const instrument = normalizeInstrumentRef(hit.instrument)
  return {
    instrument,
    code: hit.code,
    ref_label: hit.refLabel,
    name: hit.name,
    market: instrument.market,
    asset_class: instrument.assetClass,
    exchange: hit.exchange,
    source: hit.source,
  }
}

/** 将各市场原始 snapshot 聚合为统一结构 */
export function normalizeInstrumentSnapshot(
  ref: InstrumentRef,
  raw: Record<string, unknown>,
  opts?: { localInsights?: LocalInstrumentInsights | null; source?: UnifiedInstrumentSnapshot['source'] },
): UnifiedInstrumentSnapshot {
  const instrument = normalizeInstrumentRef(ref)
  const code = instrumentDisplayCode(instrument)

  // CN 详情页
  if (raw.quote != null && (raw.profile != null || raw.financial != null || raw.news != null)) {
    const quoteRow = raw.quote as Record<string, unknown>
    return {
      instrument,
      code: str(raw.code, code),
      name: str(raw.name, instrument.symbol),
      quote: quoteFromProviderRow(instrument, quoteRow, opts?.source ?? 'mixed'),
      profile: (raw.profile as Record<string, unknown> | null) ?? null,
      recent_bars: [],
      extras: {
        financial: raw.financial,
        financial_history: raw.financialHistory as unknown[] | undefined,
        news: raw.news as unknown[] | undefined,
        dividends: raw.dividends as unknown[] | undefined,
        money_flow: raw.moneyFlow as unknown[] | undefined,
        shareholders: raw.shareholders,
        local_insights: opts?.localInsights ?? null,
      },
      source: opts?.source ?? 'mixed',
    }
  }

  // ETF / 跨市场 composite
  const quoteRow = (raw.quote ?? null) as Record<string, unknown> | null
  const klines = (raw.recentKlines ?? raw.items ?? []) as StockKline[] | Record<string, unknown>[]
  const pairCode = str(raw.pair, code)

  return {
    instrument,
    code: str(raw.code, pairCode || code),
    name: str(raw.name ?? (quoteRow?.name), instrument.symbol),
    quote: quoteRow ? quoteFromProviderRow(instrument, quoteRow, opts?.source ?? 'live') : null,
    profile: (raw.profile as Record<string, unknown> | null) ?? null,
    recent_bars: klinesToChartBars(klines),
    extras: {
      nav: raw.nav,
      holdings: raw.holdings,
      local_insights: opts?.localInsights ?? null,
    },
    source: opts?.source ?? 'live',
  }
}

/** 将 CN chart 或跨市场 kline 包统一为 bars 结构 */
export function normalizeInstrumentChart(
  ref: InstrumentRef,
  period: string,
  raw: Record<string, unknown>,
  source: UnifiedInstrumentChart['source'] = 'live',
): UnifiedInstrumentChart {
  const instrument = normalizeInstrumentRef(ref)
  const code = instrumentDisplayCode(instrument)

  if (Array.isArray(raw.bars)) {
    return {
      instrument,
      code: str(raw.code, code),
      name: str(raw.name, instrument.symbol),
      period: str(raw.period, period),
      pre_close: num(raw.preClose ?? raw.pre_close),
      session_date: raw.sessionDate != null ? str(raw.sessionDate) : raw.session_date != null ? str(raw.session_date) : undefined,
      is_trading_day: raw.isTradingDay as boolean | undefined ?? raw.is_trading_day as boolean | undefined,
      has_more: raw.hasMore as boolean | undefined ?? raw.has_more as boolean | undefined,
      bars: (raw.bars as Record<string, unknown>[]).map(b => ({
        time: str(b.time),
        open: num(b.open),
        high: num(b.high),
        low: num(b.low),
        close: num(b.close),
        price: num(b.price),
        volume: num(b.volume),
        amount: num(b.amount),
        change_pct: num(b.changePct ?? b.change_pct),
        turnover_rate: num(b.turnoverRate ?? b.turnover_rate),
        avg_price: num(b.avgPrice ?? b.avg_price),
      })),
      indicators: raw.indicators as Record<string, unknown>[] | undefined,
      extras: {
        cyqLatest: raw.cyqLatest,
        cyqProfile: raw.cyqProfile,
      },
      source,
    }
  }

  const items = (raw.items ?? []) as StockKline[] | Record<string, unknown>[]
  return {
    instrument,
    code: str(raw.symbol ?? raw.pair ?? raw.code, code),
    name: str(raw.name, instrument.symbol),
    period,
    pre_close: null,
    bars: klinesToChartBars(items),
    source,
  }
}
