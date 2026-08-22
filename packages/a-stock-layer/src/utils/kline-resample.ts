import type { StockKline } from '@opptrix/shared'

type ResampleMode = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

function parseYmd(date: string): Date | null {
  const m = date.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const dt = new Date(y, mo, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function bucketKey(d: Date, mode: ResampleMode): string {
  if (mode === 'yearly') return String(d.getFullYear())
  if (mode === 'quarterly') {
    const q = Math.floor(d.getMonth() / 3) + 1
    return `${d.getFullYear()}-Q${q}`
  }
  if (mode === 'monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const day = d.getDay() || 7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + 4 - day)
  const week = Math.ceil(
    ((thursday.getTime() - new Date(thursday.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7,
  )
  return `${thursday.getFullYear()}-W${week}`
}

function aggregateBars(bars: StockKline[]): StockKline {
  bars.sort((a, b) => a.date.localeCompare(b.date))
  const first = bars[0]!
  const last = bars[bars.length - 1]!
  return {
    code: first.code,
    date: last.date,
    open: first.open,
    close: last.close,
    high: Math.max(...bars.map(b => b.high)),
    low: Math.min(...bars.map(b => b.low)),
    volume: bars.reduce((s, b) => s + (b.volume ?? 0), 0),
    amount: bars.reduce((s, b) => s + (b.amount ?? 0), 0),
    changePct: last.changePct,
    turnoverRate: null,
  }
}

/** 将日/月 K 聚合为周/季/年 K（券商 APP 季K/年K 数据源）。 */
export function resampleOhlcKlines(klines: StockKline[], mode: ResampleMode): StockKline[] {
  if (!klines.length) return []
  const buckets = new Map<string, StockKline[]>()
  for (const bar of klines) {
    const d = parseYmd(bar.date)
    if (!d) continue
    const key = bucketKey(d, mode)
    const list = buckets.get(key) ?? []
    list.push(bar)
    buckets.set(key, list)
  }
  return [...buckets.values()]
    .map(aggregateBars)
    .sort((a, b) => a.date.localeCompare(b.date))
}
