import type { StockKline } from '@ni-k/shared'

export interface IndicatorRow {
  date: string
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  ma60?: number | null
  ma_width?: number | null
  rsi_6?: number | null
  rsi_12?: number | null
  macd?: number | null
  macd_signal?: number | null
  macd_hist?: number | null
  boll_up?: number | null
  boll_mid?: number | null
  boll_low?: number | null
  boll_b?: number | null
  kdj_k?: number | null
  kdj_d?: number | null
  kdj_j?: number | null
  williams_r?: number | null
  cci?: number | null
  adx?: number | null
  plus_di?: number | null
  minus_di?: number | null
  obv?: number | null
  volume_ma5?: number | null
  volume_ma10?: number | null
  force_index?: number | null
  volume_ratio?: number | null
}

function sma(arr: number[], period: number, i: number): number | null {
  if (i < period - 1) return null
  let s = 0
  for (let j = i - period + 1; j <= i; j++) s += arr[j]
  return s / period
}

function emaSeries(arr: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const out: (number | null)[] = []
  let prev: number | null = null
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    if (prev == null) {
      let s = 0
      for (let j = 0; j < period; j++) s += arr[j]
      prev = s / period
    } else {
      prev = arr[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

function rsiSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { out.push(null); continue }
    let gains = 0, losses = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - closes[j - 1]
      if (d >= 0) gains += d
      else losses -= d
    }
    const rs = losses === 0 ? 100 : gains / losses
    out.push(100 - 100 / (1 + rs))
  }
  return out
}

function stddev(arr: number[], period: number, i: number): number | null {
  const m = sma(arr, period, i)
  if (m == null) return null
  let s = 0
  for (let j = i - period + 1; j <= i; j++) s += (arr[j] - m) ** 2
  return Math.sqrt(s / period)
}

export function computeAll(klines: StockKline[]): IndicatorRow[] {
  const closes = klines.map(k => k.close)
  const highs = klines.map(k => k.high)
  const lows = klines.map(k => k.low)
  const volumes = klines.map(k => k.volume ?? 0)
  const ema12 = emaSeries(closes, 12)
  const ema26 = emaSeries(closes, 26)
  const rsi6 = rsiSeries(closes, 6)
  const rsi12 = rsiSeries(closes, 12)

  const rows: IndicatorRow[] = []
  let obv = 0
  for (let i = 0; i < klines.length; i++) {
    if (i > 0) {
      if (closes[i] > closes[i - 1]) obv += volumes[i]
      else if (closes[i] < closes[i - 1]) obv -= volumes[i]
    }
    const ma5 = sma(closes, 5, i)
    const ma20 = sma(closes, 20, i)
    const sd = stddev(closes, 20, i)
    const bollMid = sma(closes, 20, i)
    const bollUp = bollMid != null && sd != null ? bollMid + 2 * sd : null
    const bollLow = bollMid != null && sd != null ? bollMid - 2 * sd : null
    const bollB = bollUp != null && bollLow != null && bollUp !== bollLow
      ? ((closes[i] - bollLow) / (bollUp - bollLow)) * 100
      : null

    const e12 = ema12[i]
    const e26 = ema26[i]
    const macd = e12 != null && e26 != null ? e12 - e26 : null

    const ll = Math.min(...lows.slice(Math.max(0, i - 8), i + 1))
    const hh = Math.max(...highs.slice(Math.max(0, i - 8), i + 1))
    const rsv = hh !== ll ? ((closes[i] - ll) / (hh - ll)) * 100 : 50
    const prev = rows[i - 1]
    const kdjK = prev?.kdj_k != null ? (2 / 3) * prev.kdj_k + (1 / 3) * rsv : rsv
    const kdjD = prev?.kdj_d != null ? (2 / 3) * prev.kdj_d + (1 / 3) * kdjK : kdjK
    const kdjJ = 3 * kdjK - 2 * kdjD

    const wrBase = Math.max(...highs.slice(Math.max(0, i - 13), i + 1))
    const wrLow = Math.min(...lows.slice(Math.max(0, i - 13), i + 1))
    const williamsR = wrBase !== wrLow ? -100 * (wrBase - closes[i]) / (wrBase - wrLow) : null

    rows.push({
      date: klines[i].date,
      ma5: sma(closes, 5, i),
      ma10: sma(closes, 10, i),
      ma20,
      ma60: sma(closes, 60, i),
      ma_width: ma5 != null && ma20 ? ((ma5 - ma20) / ma20) * 100 : null,
      rsi_6: rsi6[i],
      rsi_12: rsi12[i],
      macd,
      macd_signal: null,
      macd_hist: null,
      boll_up: bollUp,
      boll_mid: bollMid,
      boll_low: bollLow,
      boll_b: bollB,
      kdj_k: kdjK,
      kdj_d: kdjD,
      kdj_j: kdjJ,
      williams_r: williamsR,
      cci: null,
      obv,
      volume_ma5: sma(volumes, 5, i),
      volume_ma10: sma(volumes, 10, i),
      force_index: i > 0 ? (closes[i] - closes[i - 1]) * volumes[i] : null,
      volume_ratio: sma(volumes, 5, i) && sma(volumes, 20, i)
        ? (sma(volumes, 5, i)! / sma(volumes, 20, i)!)
        : null,
    })
  }

  // MACD signal line
  const macds = rows.map(r => r.macd ?? 0)
  const sig = emaSeries(macds.map((v, i) => rows[i].macd ?? 0), 9)
  for (let i = 0; i < rows.length; i++) {
    rows[i].macd_signal = sig[i]
    if (rows[i].macd != null && sig[i] != null) {
      rows[i].macd_hist = rows[i].macd! - sig[i]!
    }
  }
  return rows
}

export function lastRow<T>(rows: T[]): T | null {
  return rows.length ? rows[rows.length - 1] : null
}
