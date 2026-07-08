import type { StockKline } from '../core/schema.js'

function sortKlines(klines: StockKline[]): StockKline[] {
  return [...klines].sort((a, b) => a.date.localeCompare(b.date))
}

function aggregateBucket(bars: StockKline[]): StockKline | null {
  if (!bars.length) return null
  bars.sort((a, b) => a.date.localeCompare(b.date))
  const first = bars[0]!
  const last = bars[bars.length - 1]!
  let high = first.high
  let low = first.low
  let volume = 0
  let amount = 0
  for (const bar of bars) {
    high = Math.max(high, bar.high)
    low = Math.min(low, bar.low)
    volume += bar.volume ?? 0
    amount += bar.amount ?? 0
  }
  return {
    code: first.code,
    date: last.date.slice(0, 10),
    open: first.open,
    close: last.close,
    high,
    low,
    volume,
    amount,
    changePct: last.changePct,
    turnoverRate: last.turnoverRate ?? null,
  }
}

/** 日 K → 周 K（按自然周聚合，bar 日期取该周最后一个交易日） */
export function resampleKlinesWeekly(klines: StockKline[]): StockKline[] {
  if (!klines.length) return []
  const buckets = new Map<string, StockKline[]>()
  for (const bar of klines) {
    const d = new Date(bar.date.slice(0, 10))
    if (Number.isNaN(d.getTime())) continue
    const day = d.getDay() || 7
    const monday = new Date(d)
    monday.setDate(d.getDate() - day + 1)
    const key = monday.toISOString().slice(0, 10)
    const list = buckets.get(key) ?? []
    list.push(bar)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bars]) => aggregateBucket(bars))
    .filter((row): row is StockKline => !!row)
}

/** 日 K → 月 K（按自然月聚合） */
export function resampleKlinesMonthly(klines: StockKline[]): StockKline[] {
  if (!klines.length) return []
  const buckets = new Map<string, StockKline[]>()
  for (const bar of klines) {
    const d = new Date(bar.date.slice(0, 10))
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = buckets.get(key) ?? []
    list.push(bar)
    buckets.set(key, list)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bars]) => aggregateBucket(bars))
    .filter((row): row is StockKline => !!row)
}

/** 日 K → N 日 K（按连续交易日每 N 根聚合） */
export function resampleKlinesByTradingDays(klines: StockKline[], bucketSize: number): StockKline[] {
  if (!klines.length || bucketSize < 2) return sortKlines(klines)
  const sorted = sortKlines(klines)
  const out: StockKline[] = []
  for (let i = 0; i < sorted.length; i += bucketSize) {
    const bucket = aggregateBucket(sorted.slice(i, i + bucketSize))
    if (bucket) out.push(bucket)
  }
  return out
}

/** 截取最近 N 个自然年内的日 K（仍保留日 K 粒度，用于 1/3/5 年视图） */
export function filterKlinesByCalendarYears(klines: StockKline[], years: number): StockKline[] {
  if (!klines.length || years <= 0) return []
  const sorted = sortKlines(klines)
  const latest = sorted[sorted.length - 1]!.date.slice(0, 10)
  const cutoff = new Date(latest)
  cutoff.setFullYear(cutoff.getFullYear() - years)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return sorted.filter(row => row.date.slice(0, 10) >= cutoffStr)
}

export type CrossMarketDerivedKlinePeriod =
  | '5day'
  | 'weekly'
  | 'monthly'
  | 'year1'
  | 'year3'
  | 'year5'

export function isCrossMarketDerivedKlinePeriod(period: string): period is CrossMarketDerivedKlinePeriod {
  return period === '5day'
    || period === 'weekly'
    || period === 'monthly'
    || period === 'year1'
    || period === 'year3'
    || period === 'year5'
}

/** 跨市场图表：由日 K 派生 5 日 / 周 / 月 / 1-3-5 年视图 */
export function deriveCrossMarketKlinesFromDaily(
  daily: StockKline[],
  period: CrossMarketDerivedKlinePeriod,
): StockKline[] {
  switch (period) {
    case '5day':
      return resampleKlinesByTradingDays(daily, 5)
    case 'weekly':
      return resampleKlinesWeekly(daily)
    case 'monthly':
      return resampleKlinesMonthly(daily)
    case 'year1':
      return filterKlinesByCalendarYears(daily, 1)
    case 'year3':
      return filterKlinesByCalendarYears(daily, 3)
    case 'year5':
      return filterKlinesByCalendarYears(daily, 5)
    default:
      return sortKlines(daily)
  }
}

/** 为跨市场派生周期估算所需日 K 根数 */
export function dailyBarsNeededForCrossMarketPeriod(period: string, requestedCount: number): number {
  const count = Math.max(20, requestedCount || 120)
  switch (period) {
    case '5day':
      return Math.min(Math.max(count * 5, 260), 2000)
    case 'weekly':
      return Math.min(Math.max(count * 5, 400), 2000)
    case 'monthly':
      return Math.min(Math.max(count * 22, 800), 2000)
    case 'year1':
      return 260
    case 'year3':
      return 780
    case 'year5':
      return 1300
    default:
      return Math.min(count, 2000)
  }
}
