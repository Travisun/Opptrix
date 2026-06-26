import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import type { FactorMeta, FinancialSummary } from '@inno-a-stock/shared'

export function m(
  name: string,
  category: FactorMeta['category'],
  description: string,
  higherIsBetter = true,
): FactorMeta {
  return { name, category, description, higherIsBetter }
}

export function r(v: number, d = 2) {
  const f = 10 ** d
  return Math.round(v * f) / f
}

export function safeDelta(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null
  return a - b
}

export function safePct(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null || b === 0) return null
  return ((a - b) / Math.abs(b)) * 100
}

export function cagr(values: (number | null | undefined)[]) {
  const vals = values.filter((v): v is number => v != null && v > 0).slice(0, 4)
  if (vals.length < 2) return null
  const n = vals.length - 1
  return (Math.pow(vals[0] / vals[vals.length - 1], 1 / n) - 1) * 100
}

export async function finSeries(
  de: AshareEngine, code: string, quarterly = false,
): Promise<FinancialSummary[]> {
  const r = quarterly
    ? await de.financialsQuarterly(code)
    : await de.financials(code)
  return r.data ?? []
}

export function attrSeries(fins: FinancialSummary[], key: keyof FinancialSummary) {
  return fins.map(f => f[key] as number | null | undefined)
}

export function dailyReturns(closes: number[]) {
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1]) rets.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  return rets
}

export function annualVol(closes: number[]) {
  const rets = dailyReturns(closes)
  if (rets.length < 10) return null
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length
  return Math.sqrt(variance) * Math.sqrt(252) * 100
}

export function maxDrawdown(closes: number[]) {
  let peak = closes[0] ?? 0
  let mdd = 0
  for (const c of closes) {
    if (c > peak) peak = c
    const dd = peak ? (c - peak) / peak : 0
    if (dd < mdd) mdd = dd
  }
  return mdd * 100
}

export function rsi(closes: number[], period = 14) {
  if (closes.length < period + 1) return null
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gains += d
    else losses -= d
  }
  const rs = losses === 0 ? 100 : gains / losses
  return 100 - 100 / (1 + rs)
}

export async function betaVsIndex(de: AshareEngine, code: string, indexCode = '000300') {
  const [k, idx] = await Promise.all([de.kline(code, 260), de.indexKline(indexCode, 260)])
  if (!k.success || !idx.success || !k.data?.length || !idx.data?.length) return null
  const sr = dailyReturns(k.data.map(r => r.close))
  const ir = dailyReturns(idx.data.map(r => r.close))
  const n = Math.min(sr.length, ir.length)
  if (n < 20) return null
  const s = sr.slice(-n), i = ir.slice(-n)
  const meanS = s.reduce((a, b) => a + b, 0) / n
  const meanI = i.reduce((a, b) => a + b, 0) / n
  let cov = 0, varI = 0
  for (let j = 0; j < n; j++) {
    cov += (s[j] - meanS) * (i[j] - meanI)
    varI += (i[j] - meanI) ** 2
  }
  if (varI === 0) return null
  return cov / varI
}

export function momReturn(closes: number[], days: number) {
  if (closes.length < days + 1) return null
  const old = closes[closes.length - days - 1]
  const cur = closes[closes.length - 1]
  if (!old) return null
  return ((cur - old) / old) * 100
}
