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

function returnVolatility(closes: number[], window = 20): number | null {
  if (closes.length < window + 1) return null
  const slice = closes.slice(-window - 1)
  const rets: number[] = []
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1]!
    const cur = slice[i]!
    if (prev > 0) rets.push((cur - prev) / prev * 100)
  }
  if (rets.length < 2) return null
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1)
  return Math.sqrt(variance)
}

function drawdownFromHigh(closes: number[], highs: number[], days = 60): number | null {
  if (!closes.length || highs.length < days) return null
  const peak = Math.max(...highs.slice(-days))
  const close = closes[closes.length - 1]!
  if (!peak) return null
  return ((close / peak) - 1) * 100
}

export interface LocalFactorInput {
  code: string
  closes: number[]
  volumes: number[]
  highs: number[]
}

/** 仅基于日 K 序列计算离线筛选因子 */
export function computeScreenFactors(input: LocalFactorInput): Record<string, number | null> {
  const factors: Record<string, number | null> = {}

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

  const vol20 = returnVolatility(input.closes, 20)
  if (vol20 != null) factors.volatility_20d = round(vol20)

  const dd60 = drawdownFromHigh(input.closes, input.highs, 60)
  if (dd60 != null) factors.drawdown_60d = round(dd60)

  const out: Record<string, number | null> = {}
  for (const key of SCREEN_PACK_FACTORS) {
    if (factors[key] != null && !Number.isNaN(factors[key])) out[key] = factors[key]!
  }
  return out
}

export function computeSimpleScore(factors: Record<string, number | null>): number | null {
  const mom = factors.momentum_3m ?? null
  const vol = factors.volume_ratio ?? null
  const dd = factors.drawdown_60d ?? null
  if (mom == null && vol == null && dd == null) return null
  let score = 50
  if (mom != null) score += Math.min(20, Math.max(-15, mom * 0.6))
  if (vol != null) score += Math.min(10, Math.max(-5, (vol - 1) * 8))
  if (dd != null) score += Math.min(10, Math.max(-10, dd * 0.3))
  return round(Math.min(100, Math.max(0, score)), 1)
}

function loadKlineSeries(
  store: MarketDataStore,
  code: string,
): { close: number | null; volume: number | null; high: number | null }[] {
  const duck = store.duckGateway().queryKlinesSync(code, 800)
  if (duck.length) {
    return duck.map(k => ({ close: k.close, volume: k.volume, high: k.high }))
  }
  const rows = store.db.prepare(`
    SELECT close, volume, high FROM stock_klines_daily
    WHERE code = ? ORDER BY trade_date ASC
  `).all(code) as { close: number | null; volume: number | null; high: number | null }[]
  return rows
}

export function buildLocalFactorInputs(store: MarketDataStore, codes: string[]): LocalFactorInput[] {
  const out: LocalFactorInput[] = []
  for (const code of codes) {
    const krows = loadKlineSeries(store, code)
    const closes = krows.map(r => r.close).filter((v): v is number => v != null && v > 0)
    const volumes = krows.map(r => r.volume ?? 0)
    const highs = krows.map(r => r.high).filter((v): v is number => v != null && v > 0)
    if (!closes.length) continue

    out.push({ code, closes, volumes, highs })
  }
  return out
}

export function runLocalScreenFactors(
  store: MarketDataStore,
  tradeDate: string,
  codes: string[],
): { success: number; skipped: number } {
  const gw = store.duckGateway()
  if (gw.hasMarketData()) {
    store.flushDuckWritesSync()
    const batch = gw.computeFactorsSync(tradeDate, codes)
    if (batch.computed > 0) {
      store.flushDuckWritesSync()
      let success = 0
      for (const code of codes) {
        store.markJobProgress('screen_factors', code, tradeDate, 'done')
        success++
      }
      return { success: Math.min(batch.computed, codes.length), skipped: Math.max(0, codes.length - batch.computed) }
    }
  }

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
