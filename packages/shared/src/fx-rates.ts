import { holdingReturnPctFromQuote, resolveHoldingTotalCost, type HoldingReturnInputs } from './portfolio-return.js'

/** 外币兑人民币：1 单位外币 = ? CNY */
export type FxRatesToCny = {
  /** ISO 4217 → 1 单位外币兑人民币 */
  byCurrency: Record<string, number>
  USD: number
  HKD: number
  /** 中间价发布日 YYYY-MM-DD */
  tradeDate: string
  /** 缓存写入时间 ISO 8601 */
  updatedAt: string
  /** 数据来源，如 safe（外汇管理局中间价） */
  source: string
}

export const FX_RATES_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export type QuoteCurrency = 'CNY' | 'USD' | 'HKD'

/** Opptrix 量化口径：100 单位外币 = rate 元人民币 */
export function opptrixRmbRateToCnyPerUnit(ratePer100Foreign: number): number {
  if (!Number.isFinite(ratePer100Foreign) || ratePer100Foreign <= 0) return Number.NaN
  return ratePer100Foreign / 100
}

export type OpptrixRmbRateRow = {
  base?: string | null
  currency?: string | null
  rate: number
}

export function buildFxRatesToCnyFromOpptrix(
  rows: OpptrixRmbRateRow[],
  meta: { tradeDate: string; source?: string; updatedAt?: string },
): FxRatesToCny {
  const byCurrency: Record<string, number> = { CNY: 1 }
  for (const row of rows) {
    const code = String(row.base ?? row.currency ?? '').trim().toUpperCase()
    if (!code || code === 'CNY') continue
    const perUnit = opptrixRmbRateToCnyPerUnit(row.rate)
    if (Number.isFinite(perUnit) && perUnit > 0) byCurrency[code] = perUnit
  }
  const updatedAt = meta.updatedAt ?? new Date().toISOString()
  return {
    byCurrency,
    USD: byCurrency.USD ?? 0,
    HKD: byCurrency.HKD ?? 0,
    tradeDate: meta.tradeDate,
    updatedAt,
    source: meta.source ?? 'safe',
  }
}

export function marketQuoteCurrency(market: string | undefined): QuoteCurrency {
  if (market === 'US') return 'USD'
  if (market === 'HK') return 'HKD'
  return 'CNY'
}

function resolveCnyPerUnit(
  currency: QuoteCurrency,
  rates: FxRatesToCny | null | undefined,
): number | null {
  if (!rates || currency === 'CNY') return currency === 'CNY' ? 1 : null
  const fromMap = rates.byCurrency?.[currency]
  if (fromMap != null && Number.isFinite(fromMap) && fromMap > 0) return fromMap
  if (currency === 'USD' && rates.USD > 0) return rates.USD
  if (currency === 'HKD' && rates.HKD > 0) return rates.HKD
  return null
}

export function convertAmountToCny(
  amount: number,
  currency: QuoteCurrency,
  rates: FxRatesToCny | null | undefined,
): number {
  if (!Number.isFinite(amount)) return amount
  if (currency === 'CNY') return amount
  const rate = resolveCnyPerUnit(currency, rates)
  if (rate == null) return amount
  return amount * rate
}

export function convertMarketAmountToCny(
  amount: number,
  market: string | undefined,
  rates: FxRatesToCny | null | undefined,
): number {
  return convertAmountToCny(amount, marketQuoteCurrency(market), rates)
}

/** 将持仓快照换算为人民币口径后计算收益率（港/美用同一套即期汇率） */
export function holdingReturnPctInCny(
  holding: HoldingReturnInputs | null | undefined,
  price: number | null | undefined,
  market: string | undefined,
  rates: FxRatesToCny | null | undefined,
): number | null {
  if (!holding || (holding.shares ?? 0) <= 0) return null
  const currency = marketQuoteCurrency(market)
  if (currency === 'CNY' || !rates) {
    return holdingReturnPctFromQuote(holding, price)
  }

  const livePrice = price ?? holding.currentPrice ?? null
  if (livePrice == null || !Number.isFinite(livePrice)) {
    return holdingReturnPctFromQuote(holding, price)
  }

  const cnyPrice = convertAmountToCny(livePrice, currency, rates)
  const totalCostLocal = resolveHoldingTotalCost(holding)
  const cnyHolding: HoldingReturnInputs = {
    shares: holding.shares,
    totalCost: convertAmountToCny(totalCostLocal, currency, rates),
    realizedPnl: convertAmountToCny(holding.realizedPnl ?? 0, currency, rates),
    totalPnlPct: holding.totalPnlPct,
    unrealizedPnlPct: holding.unrealizedPnlPct,
    currentPrice: cnyPrice,
  }
  return holdingReturnPctFromQuote(cnyHolding, cnyPrice)
}
