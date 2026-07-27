/**
 * 离线日 K 筛选与板块挖掘（纯计算，不写主库）。
 * @module screen
 */

import { getDailyBars } from './query.js'

/**
 * @typedef {import('./parquet.js').DailyBar} DailyBar
 */

/**
 * @typedef {object} ScreenHit
 * @property {string} code
 * @property {string} asOf
 * @property {number} close
 * @property {Record<string, number|string|boolean|null>} metrics
 */

/**
 * 均线多头：收盘价 > MA_fast > MA_slow。
 *
 * @param {DailyBar[]} bars 全市场或子集
 * @param {{ fast?: number, slow?: number, asOf?: string, codes?: string[] }} [opts]
 * @returns {Promise<ScreenHit[]>}
 * @example
 * const hits = await screenByMaTrend(bars, { fast: 20, slow: 60 })
 */
export async function screenByMaTrend(bars, opts = {}) {
  const fast = opts.fast ?? 20
  const slow = opts.slow ?? 60
  const codes = opts.codes ?? uniqueCodes(bars)
  /** @type {ScreenHit[]} */
  const hits = []
  for (const code of codes) {
    const series = await getDailyBars(bars, code, { end: opts.asOf, limit: slow + 5 })
    if (series.length < slow) continue
    const closes = series.map(b => b.close)
    const maF = sma(closes, fast)
    const maS = sma(closes, slow)
    const last = series[series.length - 1]
    if (last.close > maF && maF > maS) {
      hits.push({
        code,
        asOf: last.date,
        close: last.close,
        metrics: { maFast: maF, maSlow: maS, fast, slow },
      })
    }
  }
  return hits
}

/**
 * 价格分位筛选：当前收盘在近 lookback 日分位落在 [low, high]。
 *
 * @param {DailyBar[]} bars
 * @param {{ lookback?: number, low?: number, high?: number, asOf?: string, codes?: string[] }} [opts]
 * @returns {Promise<ScreenHit[]>}
 * @example
 * await screenByPricePercentile(bars, { lookback: 252, low: 0, high: 0.2 })
 */
export async function screenByPricePercentile(bars, opts = {}) {
  const lookback = opts.lookback ?? 252
  const low = opts.low ?? 0
  const high = opts.high ?? 0.3
  const codes = opts.codes ?? uniqueCodes(bars)
  /** @type {ScreenHit[]} */
  const hits = []
  for (const code of codes) {
    const series = await getDailyBars(bars, code, { end: opts.asOf, limit: lookback })
    if (series.length < Math.min(60, lookback)) continue
    const closes = series.map(b => b.close)
    const last = series[series.length - 1]
    const pct = percentileRank(closes, last.close)
    if (pct >= low && pct <= high) {
      hits.push({
        code,
        asOf: last.date,
        close: last.close,
        metrics: { percentile: pct, lookback },
      })
    }
  }
  return hits
}

/**
 * 波动率筛选：近 window 日对数收益标准差（年化可选）。
 *
 * @param {DailyBar[]} bars
 * @param {{ window?: number, maxVol?: number, minVol?: number, annualize?: boolean, asOf?: string, codes?: string[] }} [opts]
 * @returns {Promise<ScreenHit[]>}
 * @example
 * await screenByVolatility(bars, { window: 20, maxVol: 0.4, annualize: true })
 */
export async function screenByVolatility(bars, opts = {}) {
  const window = opts.window ?? 20
  const codes = opts.codes ?? uniqueCodes(bars)
  /** @type {ScreenHit[]} */
  const hits = []
  for (const code of codes) {
    const series = await getDailyBars(bars, code, { end: opts.asOf, limit: window + 1 })
    if (series.length < window + 1) continue
    const rets = []
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1].close
      const b = series[i].close
      if (a > 0 && b > 0) rets.push(Math.log(b / a))
    }
    let vol = stdev(rets)
    if (opts.annualize) vol *= Math.sqrt(252)
    if (opts.minVol != null && vol < opts.minVol) continue
    if (opts.maxVol != null && vol > opts.maxVol) continue
    const last = series[series.length - 1]
    hits.push({
      code,
      asOf: last.date,
      close: last.close,
      metrics: { volatility: vol, window, annualize: Boolean(opts.annualize) },
    })
  }
  return hits
}

/**
 * 放量：当日成交量 / 近 window 日均量 ≥ ratio。
 *
 * @param {DailyBar[]} bars
 * @param {{ window?: number, ratio?: number, asOf?: string, codes?: string[] }} [opts]
 * @returns {Promise<ScreenHit[]>}
 * @example
 * await screenByVolumeSurge(bars, { window: 20, ratio: 2 })
 */
export async function screenByVolumeSurge(bars, opts = {}) {
  const window = opts.window ?? 20
  const ratio = opts.ratio ?? 2
  const codes = opts.codes ?? uniqueCodes(bars)
  /** @type {ScreenHit[]} */
  const hits = []
  for (const code of codes) {
    const series = await getDailyBars(bars, code, { end: opts.asOf, limit: window + 1 })
    if (series.length < window + 1) continue
    const last = series[series.length - 1]
    if (last.volume == null) continue
    const hist = series.slice(0, -1).map(b => b.volume ?? 0)
    const avg = mean(hist)
    if (avg <= 0) continue
    const r = last.volume / avg
    if (r >= ratio) {
      hits.push({
        code,
        asOf: last.date,
        close: last.close,
        metrics: { volumeRatio: r, window, threshold: ratio },
      })
    }
  }
  return hits
}

/**
 * 最大回撤筛选：近 lookback 日回撤绝对值 ≤ maxDrawdown（如 0.15）。
 *
 * @param {DailyBar[]} bars
 * @param {{ lookback?: number, maxDrawdown?: number, asOf?: string, codes?: string[] }} [opts]
 * @returns {Promise<ScreenHit[]>}
 * @example
 * await screenByMaxDrawdown(bars, { lookback: 60, maxDrawdown: 0.12 })
 */
export async function screenByMaxDrawdown(bars, opts = {}) {
  const lookback = opts.lookback ?? 60
  const maxDd = opts.maxDrawdown ?? 0.15
  const codes = opts.codes ?? uniqueCodes(bars)
  /** @type {ScreenHit[]} */
  const hits = []
  for (const code of codes) {
    const series = await getDailyBars(bars, code, { end: opts.asOf, limit: lookback })
    if (series.length < 10) continue
    const dd = maxDrawdown(series.map(b => b.close))
    if (dd <= maxDd) {
      const last = series[series.length - 1]
      hits.push({
        code,
        asOf: last.date,
        close: last.close,
        metrics: { maxDrawdown: dd, lookback },
      })
    }
  }
  return hits
}

/**
 * 板块相对强弱：各板块近 window 日均值收益相对全市场。
 *
 * @param {DailyBar[]} bars 须含 sector 字段
 * @param {{ window?: number, asOf?: string }} [opts]
 * @returns {Promise<Array<{ sector: string, return: number, relative: number, n: number }>>}
 * @example
 * await sectorRelativeStrength(bars, { window: 20 })
 */
export async function sectorRelativeStrength(bars, opts = {}) {
  const window = opts.window ?? 20
  const bySector = groupBySector(bars)
  const marketRet = await averageCodeReturn(bars, window, opts.asOf)
  /** @type {Array<{ sector: string, return: number, relative: number, n: number }>} */
  const out = []
  for (const [sector, rows] of bySector) {
    const ret = await averageCodeReturn(rows, window, opts.asOf)
    out.push({
      sector,
      return: ret.value,
      relative: ret.value - marketRet.value,
      n: ret.n,
    })
  }
  out.sort((a, b) => b.relative - a.relative)
  return out
}

/**
 * 上涨宽度：某日上涨家数 / 有效家数。
 *
 * @param {DailyBar[]} bars
 * @param {string} date
 * @param {{ prevDate?: string }} [opts] 未传则自动取前一交易日
 * @returns {Promise<{ date: string, up: number, down: number, flat: number, breadth: number }>}
 * @example
 * await marketBreadth(bars, '2024-06-28')
 */
export async function marketBreadth(bars, date, opts = {}) {
  const day = String(date).trim()
  const today = bars.filter(b => b.date === day)
  let prev = opts.prevDate
  if (!prev) {
    const dates = [...new Set(bars.map(b => b.date))].sort()
    const idx = dates.indexOf(day)
    prev = idx > 0 ? dates[idx - 1] : null
  }
  if (!prev) {
    return { date: day, up: 0, down: 0, flat: 0, breadth: 0 }
  }
  const prevMap = new Map(bars.filter(b => b.date === prev).map(b => [b.code, b.close]))
  let up = 0
  let down = 0
  let flat = 0
  for (const b of today) {
    const p = prevMap.get(b.code)
    if (p == null || p === 0) continue
    const chg = b.close / p - 1
    if (chg > 1e-8) up++
    else if (chg < -1e-8) down++
    else flat++
  }
  const total = up + down + flat
  return {
    date: day,
    up,
    down,
    flat,
    breadth: total ? up / total : 0,
  }
}

/**
 * 涨幅龙头：近 window 日收益 Top N（可按板块）。
 *
 * @param {DailyBar[]} bars
 * @param {{ window?: number, top?: number, sector?: string, asOf?: string }} [opts]
 * @returns {Promise<ScreenHit[]>}
 * @example
 * await sectorLeaders(bars, { window: 5, top: 10, sector: '白酒' })
 */
export async function sectorLeaders(bars, opts = {}) {
  const window = opts.window ?? 5
  const top = opts.top ?? 10
  let pool = bars
  if (opts.sector) {
    pool = bars.filter(b => b.sector === opts.sector)
  }
  const codes = uniqueCodes(pool)
  /** @type {ScreenHit[]} */
  const hits = []
  for (const code of codes) {
    const series = await getDailyBars(pool, code, { end: opts.asOf, limit: window + 1 })
    if (series.length < 2) continue
    const first = series[0]
    const last = series[series.length - 1]
    if (first.close <= 0) continue
    const ret = last.close / first.close - 1
    hits.push({
      code,
      asOf: last.date,
      close: last.close,
      metrics: {
        return: ret,
        window,
        sector: last.sector ?? opts.sector ?? null,
      },
    })
  }
  hits.sort((a, b) => Number(b.metrics.return) - Number(a.metrics.return))
  return hits.slice(0, top)
}

// ── helpers ──

/**
 * @param {DailyBar[]} bars
 * @returns {string[]}
 */
function uniqueCodes(bars) {
  return [...new Set(bars.map(b => b.code))]
}

/**
 * @param {DailyBar[]} bars
 * @returns {Map<string, DailyBar[]>}
 */
function groupBySector(bars) {
  /** @type {Map<string, DailyBar[]>} */
  const map = new Map()
  for (const b of bars) {
    const s = b.sector?.trim()
    if (!s) continue
    const list = map.get(s)
    if (list) list.push(b)
    else map.set(s, [b])
  }
  return map
}

/**
 * @param {DailyBar[]} bars
 * @param {number} window
 * @param {string} [asOf]
 * @returns {Promise<{ value: number, n: number }>}
 */
async function averageCodeReturn(bars, window, asOf) {
  const codes = uniqueCodes(bars)
  let sum = 0
  let n = 0
  for (const code of codes) {
    const series = await getDailyBars(bars, code, { end: asOf, limit: window + 1 })
    if (series.length < 2) continue
    const first = series[0].close
    const last = series[series.length - 1].close
    if (first <= 0) continue
    sum += last / first - 1
    n++
  }
  return { value: n ? sum / n : 0, n }
}

/**
 * @param {number[]} values
 * @param {number} n
 * @returns {number}
 */
function sma(values, n) {
  const slice = values.slice(-n)
  return mean(slice)
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function mean(values) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function stdev(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(v)
}

/**
 * @param {number[]} values
 * @param {number} x
 * @returns {number} 0–1
 */
function percentileRank(values, x) {
  if (!values.length) return 0
  let below = 0
  for (const v of values) {
    if (v <= x) below++
  }
  return below / values.length
}

/**
 * @param {number[]} closes
 * @returns {number} 正数回撤比例，如 0.12
 */
function maxDrawdown(closes) {
  let peak = closes[0] ?? 0
  let maxDd = 0
  for (const c of closes) {
    if (c > peak) peak = c
    if (peak > 0) {
      const dd = 1 - c / peak
      if (dd > maxDd) maxDd = dd
    }
  }
  return maxDd
}
