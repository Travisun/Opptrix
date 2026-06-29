import type { MarketDataStore } from '../store.js'
import { SCREEN_PACK_FACTORS } from './config.js'

function round(v: number, d = 2): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}

function momReturn(closes: number[], days: number): number | null {
  if (closes.length < days + 1) return null
  const old = closes[closes.length - days - 1]
  const cur = closes[closes.length - 1]
  if (!old) return null
  return ((cur - old) / old) * 100
}

function cagr(values: (number | null)[]): number | null {
  const vals = values.filter((v): v is number => v != null && v > 0).slice(0, 4)
  if (vals.length < 2) return null
  const n = vals.length - 1
  return (Math.pow(vals[0] / vals[vals.length - 1], 1 / n) - 1) * 100
}

export interface LocalFactorInput {
  code: string
  closes: number[]
  volumes: number[]
  pe: number | null
  pb: number | null
  roe: number | null
  grossMargin: number | null
  debtRatio: number | null
  netProfitYoy: number | null
  roeSeries: (number | null)[]
  profitSeries: (number | null)[]
}

export function computeScreenFactors(input: LocalFactorInput): Record<string, number | null> {
  const factors: Record<string, number | null> = {}

  if (input.pe != null && input.pe > 0) factors.pe = round(input.pe)
  if (input.pb != null && input.pb > 0) factors.pb = round(input.pb)

  if (input.roe != null) factors.roe = round(input.roe)
  if (input.grossMargin != null) factors.gross_margin = round(input.grossMargin)
  if (input.debtRatio != null) factors.debt_ratio = round(input.debtRatio)
  if (input.netProfitYoy != null) factors.net_profit_yoy = round(input.netProfitYoy)

  const profitCagr = cagr(input.profitSeries)
  if (profitCagr != null) factors.profit_cagr_3y = round(profitCagr)

  const roes = input.roeSeries.filter((v): v is number => v != null)
  if (roes.length >= 2) factors.roe_trend = round(roes[0] - roes[roes.length - 1])

  if (input.pe != null && input.pe > 0 && profitCagr != null && profitCagr > 0) {
    factors.peg = round(input.pe / profitCagr)
  }

  for (const [name, days] of [
    ['momentum_1m', 20],
    ['momentum_3m', 60],
    ['momentum_6m', 120],
  ] as const) {
    const v = momReturn(input.closes, days)
    if (v != null) factors[name] = round(v)
  }

  if (input.volumes.length >= 40) {
    const vols = input.volumes
    const short = vols.slice(-5).reduce((a, b) => a + b, 0) / 5
    const long = vols.slice(-40, -5).reduce((a, b) => a + b, 0) / 35
    if (long > 0) factors.volume_ratio = round(short / long, 2)
  }

  const out: Record<string, number | null> = {}
  for (const key of SCREEN_PACK_FACTORS) {
    if (factors[key] != null && !Number.isNaN(factors[key])) out[key] = factors[key]!
  }
  return out
}

export function computeSimpleScore(factors: Record<string, number | null>): number | null {
  const roe = factors.roe ?? null
  const mom = factors.momentum_3m ?? null
  const pe = factors.pe ?? null
  if (roe == null && mom == null && pe == null) return null
  let score = 50
  if (roe != null) score += Math.min(20, Math.max(-10, (roe - 10) * 1.5))
  if (mom != null) score += Math.min(15, Math.max(-15, mom * 0.8))
  if (pe != null && pe > 0) score += Math.min(10, Math.max(-10, (25 - pe) * 0.4))
  return round(Math.min(100, Math.max(0, score)), 1)
}

export function buildLocalFactorInputs(store: MarketDataStore, codes: string[]): LocalFactorInput[] {
  const klineStmt = store.db.prepare(`
    SELECT trade_date, close, volume FROM stock_klines_daily
    WHERE code = ? ORDER BY trade_date ASC
  `)
  const finStmt = store.db.prepare(`
    SELECT roe, gross_margin, debt_ratio, net_profit_yoy, net_profit
    FROM stock_financials
    WHERE code = ? AND (report_type IS NULL OR report_type = 'annual')
    ORDER BY report_date DESC LIMIT 4
  `)
  const quoteStmt = store.db.prepare(`
    SELECT pe, pb FROM stock_quotes_daily
    WHERE code = ? ORDER BY trade_date DESC LIMIT 1
  `)

  const out: LocalFactorInput[] = []
  for (const code of codes) {
    const krows = klineStmt.all(code) as { trade_date: string; close: number | null; volume: number | null }[]
    const fins = finStmt.all(code) as {
      roe: number | null
      gross_margin: number | null
      debt_ratio: number | null
      net_profit_yoy: number | null
      net_profit: number | null
    }[]
    const quote = quoteStmt.get(code) as { pe: number | null; pb: number | null } | undefined
    const closes = krows.map(r => r.close).filter((v): v is number => v != null && v > 0)
    const volumes = krows.map(r => r.volume ?? 0)
    if (!closes.length) continue

    out.push({
      code,
      closes,
      volumes,
      pe: quote?.pe ?? null,
      pb: quote?.pb ?? null,
      roe: fins[0]?.roe ?? null,
      grossMargin: fins[0]?.gross_margin ?? null,
      debtRatio: fins[0]?.debt_ratio ?? null,
      netProfitYoy: fins[0]?.net_profit_yoy ?? null,
      roeSeries: fins.map(f => f.roe),
      profitSeries: fins.map(f => f.net_profit),
    })
  }
  return out
}

export function runLocalScreenFactors(
  store: MarketDataStore,
  tradeDate: string,
  codes: string[],
): { success: number; skipped: number } {
  let success = 0
  let skipped = 0
  for (const input of buildLocalFactorInputs(store, codes)) {
    const factors = computeScreenFactors(input)
    if (!Object.keys(factors).length) {
      skipped++
      continue
    }
    store.replaceFactors(tradeDate, input.code, factors)
    const score = computeSimpleScore(factors)
    if (score != null) store.upsertScore(tradeDate, input.code, '综合评估', score)
    store.markJobProgress('screen_factors', input.code, tradeDate, 'done')
    success++
  }
  return { success, skipped }
}
