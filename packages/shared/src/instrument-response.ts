import type { AssetClass, InstrumentRef, Market } from './market-data.js'
import type { StockKline } from './types.js'
import type { UnifiedInstrumentQuote } from './application-api.js'
import { instrumentDisplayCode } from './instrument-ref.js'
import { buildInstrumentNamespace, normalizeInstrumentRef } from './instrument-symbol.js'

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
  chart_time_zone?: string
}

/** 批量快照单只失败项 — code（CN）或 symbol（跨市场）二选一或并存 */
export interface UnifiedInstrumentBatchFailure {
  code?: string
  symbol?: string
  reason: string
}

export interface UnifiedInstrumentBatchResult {
  trade_date?: string | null
  count: number
  quotes: UnifiedInstrumentQuote[]
  /** CN 离线初选行（含 key_factors）— 与 local_universe_screen 同源 */
  discover_items?: Array<Record<string, unknown>>
  /** @deprecated 与 discover_items 相同，保留供 legacy Agent 工具读取 */
  items?: Array<Record<string, unknown>>
  /** 调用方请求的标的数（截断上限前） */
  requested_count?: number
  /** 实际尝试拉取的标的数（截断后） */
  attempted_count?: number
  /** 单只失败列表；整批仍可为 success（部分成功） */
  failed?: UnifiedInstrumentBatchFailure[]
}

export interface UnifiedInstrumentSearchHit {
  instrument: InstrumentRef
  code: string
  ref_label: string
  name: string | null
  market: Market
  asset_class: AssetClass
  exchange: string | null
  source: 'stock_index' | 'local' | 'online'
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

/** 基金报价常用 unitNav；场内基金/ETF 优先 exchangePrice（交易所价） */
export function resolveInstrumentQuotePrice(row: Record<string, unknown>): number | null {
  const exchangePrice = num(row.exchangePrice ?? row.exchange_price)
  if (exchangePrice != null) return exchangePrice
  return num(row.price) ?? num(row.unitNav)
}

export function resolveInstrumentQuotePreClose(row: Record<string, unknown>): number | null {
  const exchangePrice = num(row.exchangePrice ?? row.exchange_price)
  const exchangePre = num(row.preClose ?? row.pre_close)
  if (exchangePrice != null) {
    return exchangePre
  }
  const navPrice = num(row.price) ?? num(row.unitNav)
  const navPre = num(row.prevNav ?? row.prev_nav)
  const unitNav = num(row.unitNav)
  const price = num(row.price)
  if (navPrice != null && navPre != null) {
    if (price != null && unitNav != null) {
      const navGap = Math.abs(price - unitNav) / Math.max(price, unitNav)
      const prevRatio = navPre / price
      if (navGap < 0.05 && (prevRatio > 1.15 || prevRatio < 0.85)) {
        return exchangePre ?? null
      }
    }
    return navPre
  }
  return exchangePre ?? navPre
}

/** 将基金报价行规范为带 price 的行情行，供关注列表 / 持仓估值复用 */
export function coerceInstrumentQuoteRow(row: Record<string, unknown>): Record<string, unknown> {
  const price = resolveInstrumentQuotePrice(row)
  const preClose = resolveInstrumentQuotePreClose(row)
  if (price == null && preClose == null) return row
  const out = { ...row }
  if (price != null && out.price == null) out.price = price
  if (preClose != null && out.preClose == null && out.pre_close == null) out.preClose = preClose
  return out
}

/** 从报价行解析涨跌幅；平价时补 0% 而非留空；异常大值用现价/昨收重算 */
export function resolveInstrumentQuoteChangePct(
  row: Record<string, unknown>,
  price?: number | null,
  preClose?: number | null,
): number | null {
  const p = price ?? resolveInstrumentQuotePrice(row)
  const pc = preClose ?? resolveInstrumentQuotePreClose(row)
  const derived = p != null && pc != null && pc > 0
    ? Math.round(((p - pc) / pc) * 10000) / 100
    : null
  const raw = num(row.changePct ?? row.change_pct)
  if (raw != null) {
    if (Math.abs(raw) <= 500) return raw
    if (derived != null) return derived
    return raw
  }
  if (p != null && pc != null && pc > 0 && p === pc) return 0
  return derived
}

export function quoteFromProviderRow(
  ref: InstrumentRef,
  row: Record<string, unknown>,
  source: UnifiedInstrumentQuote['source'] = 'live',
): UnifiedInstrumentQuote {
  const normalizedRow = coerceInstrumentQuoteRow(row)
  const instrument = normalizeInstrumentRef(ref)
  const price = resolveInstrumentQuotePrice(normalizedRow)
  const preClose = resolveInstrumentQuotePreClose(normalizedRow)
  const changePct = resolveInstrumentQuoteChangePct(normalizedRow, price, preClose)
  return {
    instrument,
    code: instrumentDisplayCode(instrument),
    name: str(normalizedRow.name, instrument.symbol),
    price,
    change_pct: changePct,
    volume: num(normalizedRow.volume ?? normalizedRow.exchangeVolume),
    amount: num(normalizedRow.amount ?? normalizedRow.exchangeAmount),
    market: instrument.market,
    asset_class: instrument.assetClass,
    source,
    open: num(normalizedRow.open ?? normalizedRow.exchangeOpen),
    high: num(normalizedRow.high ?? normalizedRow.exchangeHigh),
    low: num(normalizedRow.low ?? normalizedRow.exchangeLow),
    pre_close: preClose,
    change: num(normalizedRow.change) ?? (
      price != null && preClose != null ? price - preClose : null
    ),
    pe: num(normalizedRow.pe),
    pb: num(normalizedRow.pb),
    turnover_rate: num(normalizedRow.turnoverRate ?? normalizedRow.turnover_rate),
    amplitude: num(normalizedRow.amplitude),
    volume_ratio: num(normalizedRow.volumeRatio ?? normalizedRow.volume_ratio),
    market_cap: num(normalizedRow.marketCap ?? normalizedRow.market_cap),
    circulating_market_cap: num(normalizedRow.circulatingMarketCap ?? normalizedRow.circulating_market_cap),
    week52_high: num(normalizedRow.week52High ?? normalizedRow.week52_high),
    week52_low: num(normalizedRow.week52Low ?? normalizedRow.week52_low),
    currency: str(normalizedRow.currency) || null,
    quote_session: str(normalizedRow.quoteSession ?? normalizedRow.quote_session) || null,
    session_label: str(normalizedRow.sessionLabel ?? normalizedRow.session_label) || null,
  }
}

export function klinesToChartBars(
  rows: StockKline[] | Record<string, unknown>[],
  period?: string,
): UnifiedChartBar[] {
  const intraday = period === 'intraday'
  return rows.map(row => {
    const r = row as Record<string, unknown>
    const date = str(r.date ?? r.time ?? r.sessionDate)
    const volume = num(r.volume)
    const amount = num(r.amount)
    const close = num(r.close)
    const price = num(r.price) ?? close
    const avgFromAmount = volume != null && volume > 0 && amount != null
      ? amount / volume
      : null
    if (intraday || (price != null && r.open == null)) {
      return {
        time: date,
        price,
        volume,
        amount,
        avg_price: num(r.avgPrice ?? r.avg_price) ?? avgFromAmount ?? price,
      }
    }
    return {
      time: date,
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      close,
      volume,
      amount,
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
  const ns = buildInstrumentNamespace(instrument)
  return {
    instrument,
    code: ns,
    ref_label: ns,
    name: hit.name,
    market: instrument.market,
    asset_class: instrument.assetClass,
    exchange: instrument.exchange ?? hit.exchange,
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
  source: 'stock_index' | 'online'
}): UnifiedInstrumentSearchHit {
  const instrument = normalizeInstrumentRef(hit.instrument)
  const ns = buildInstrumentNamespace(instrument)
  return {
    instrument,
    code: ns,
    ref_label: ns,
    name: hit.name,
    market: instrument.market,
    asset_class: instrument.assetClass,
    exchange: instrument.exchange ?? hit.exchange,
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

  // 详情页（A 股 / 美股 / 港股）
  const klines = (raw.recentKlines ?? raw.items ?? []) as StockKline[] | Record<string, unknown>[]
  if (raw.quote != null && (
    raw.profile != null || raw.financial != null || raw.news != null
    || raw.notices != null || raw.articles != null
    || raw.relatedStocks != null || raw.dividends != null || klines.length > 0
  )) {
    const quoteRow = raw.quote as Record<string, unknown>
    return {
      instrument,
      code,
      name: str(raw.name, instrument.symbol),
      quote: quoteFromProviderRow(instrument, quoteRow, opts?.source ?? 'mixed'),
      profile: (raw.profile as Record<string, unknown> | null) ?? null,
      recent_bars: klinesToChartBars(klines),
      extras: {
        financial: raw.financial,
        financial_history: raw.financialHistory as unknown[] | undefined,
        news: raw.news as unknown[] | undefined,
        notices: (raw.notices ?? raw.news) as unknown[] | undefined,
        articles: raw.articles as unknown[] | undefined,
        dividends: raw.dividends as unknown[] | undefined,
        money_flow: raw.moneyFlow as unknown[] | undefined,
        shareholders: raw.shareholders,
        review_prospect: raw.reviewProspect as { review?: string | null; prospect?: string | null } | null | undefined,
        related_stocks: raw.relatedStocks as unknown[] | undefined,
        senior_trades: raw.seniorTrades as unknown[] | undefined,
        trading_distribution: raw.tradingDistribution,
        local_insights: opts?.localInsights ?? null,
      },
      source: opts?.source ?? 'mixed',
    }
  }

  // ETF / 跨市场 composite（Crypto 等）
  const quoteRow = (raw.quote ?? null) as Record<string, unknown> | null

  return {
    instrument,
    code,
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
      code,
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
  const sessionDate = items.length
    ? str((items[0] as Record<string, unknown>).date ?? (items[0] as Record<string, unknown>).time).slice(0, 10)
    : null
  const firstItem = items[0] as Record<string, unknown> | undefined
  const hasIntradayPoints = !!(firstItem?.time && firstItem.price != null && firstItem.open == null && firstItem.close == null)
  const intradayBars = (period === 'intraday' || period === '5day') && items.length && hasIntradayPoints
    ? (items as Record<string, unknown>[]).map(row => ({
      time: str(row.time),
      price: num(row.price),
      volume: num(row.volume),
      amount: num(row.amount),
      avg_price: num(row.avg_price ?? row.avgPrice),
    }))
    : klinesToChartBars(items, period)
  return {
    instrument,
    code,
    name: str(raw.name, instrument.symbol),
    period,
    pre_close: num(raw.preClose ?? raw.pre_close),
    session_date: raw.sessionDate != null ? str(raw.sessionDate) : raw.session_date != null ? str(raw.session_date) : sessionDate || undefined,
    is_trading_day: raw.isTradingDay as boolean | undefined ?? raw.is_trading_day as boolean | undefined,
    has_more: raw.hasMore as boolean | undefined ?? raw.has_more as boolean | undefined,
    bars: intradayBars,
    indicators: raw.indicators as Record<string, unknown>[] | undefined,
    chart_time_zone: str(raw.chartTimeZone ?? raw.chart_time_zone) || undefined,
    source,
  }
}
