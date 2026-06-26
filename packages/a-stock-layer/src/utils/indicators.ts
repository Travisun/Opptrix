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

/** Compute technical indicators from kline (aaashare port) */
export function computeIndicators(code: string, klines: StockKline[]): TechnicalIndicator[] {
  const sorted = [...klines].sort((a, b) => a.date.localeCompare(b.date))
  const closes = sorted.map(k => k.close)
  return sorted.map((k, i) => ({
    code,
    date: k.date,
    ma5: ma(closes, i, 5),
    ma10: ma(closes, i, 10),
    ma20: ma(closes, i, 20),
    ma60: ma(closes, i, 60),
    rsi6: rsi(closes, i, 6),
    rsi12: rsi(closes, i, 12),
  }))
}
