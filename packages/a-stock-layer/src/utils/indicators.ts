import type { StockKline, TechnicalIndicator } from '../core/schema.js'

function ma(vals: number[], i: number, n: number) {
  if (i < n - 1) return null
  const slice = vals.slice(i - n + 1, i + 1)
  return slice.reduce((a, b) => a + b, 0) / n
}

function rsi(closes: number[], i: number, period: number) {
  if (i < period) return null
  let gains = 0, losses = 0
  for (let j = i - period + 1; j <= i; j++) {
    const d = closes[j] - closes[j - 1]
    if (d >= 0) gains += d
    else losses -= d
  }
  const rs = losses === 0 ? 100 : gains / losses
  return 100 - 100 / (1 + rs)
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) {
      out.push(null)
      continue
    }
    if (prev == null) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

function macdSeries(closes: number[]) {
  const ema12 = emaSeries(closes, 12)
  const ema26 = emaSeries(closes, 26)
  const macd: (number | null)[] = closes.map((_, i) => {
    if (ema12[i] == null || ema26[i] == null) return null
    return ema12[i]! - ema26[i]!
  })
  const macdFilled = macd.map((v, i) => v ?? (i > 0 ? macd[i - 1] : 0) ?? 0)
  const signal = emaSeries(macdFilled.map(v => v ?? 0), 9)
  const hist = macd.map((v, i) => (v != null && signal[i] != null ? v - signal[i]! : null))
  return { macd, signal, hist }
}

/** Compute technical indicators from kline (aaashare port) */
export function computeIndicators(code: string, klines: StockKline[]): TechnicalIndicator[] {
  const sorted = [...klines].sort((a, b) => a.date.localeCompare(b.date))
  const closes = sorted.map(k => k.close)
  const { macd, signal, hist } = macdSeries(closes)
  return sorted.map((k, i) => ({
    code,
    date: k.date,
    ma5: ma(closes, i, 5),
    ma10: ma(closes, i, 10),
    ma20: ma(closes, i, 20),
    ma60: ma(closes, i, 60),
    rsi6: rsi(closes, i, 6),
    rsi12: rsi(closes, i, 12),
    macd: macd[i] ?? null,
    macdSignal: signal[i] ?? null,
    macdHist: hist[i] ?? null,
  }))
}
