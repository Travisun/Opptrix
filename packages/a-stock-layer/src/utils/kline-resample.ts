import type { StockKline } from '@opptrix/shared'

const MINUTE_STEPS: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
}

function parseBarMs(date: string): number | null {
  const raw = date.trim()
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? null : ms
}

/** 将 1 分钟 K 聚合为更大分钟周期（仅用于指数腾讯回退路径） */
export function resampleStockKlinesToPeriod(rows: StockKline[], period: string): StockKline[] {
  const step = MINUTE_STEPS[period] ?? 1
  if (step <= 1 || !rows.length) return rows

  const buckets = new Map<number, StockKline[]>()
  for (const bar of rows) {
    const ms = parseBarMs(bar.date)
    if (ms == null) continue
    const d = new Date(ms)
    const bucketMin = Math.floor((d.getHours() * 60 + d.getMinutes()) / step) * step
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(bucketMin / 60), bucketMin % 60).getTime()
    const list = buckets.get(key) ?? []
    list.push(bar)
    buckets.set(key, list)
  }

  const out: StockKline[] = []
  for (const [, bars] of [...buckets.entries()].sort(([a], [b]) => a - b)) {
    bars.sort((a, b) => a.date.localeCompare(b.date))
    const first = bars[0]!
    const last = bars[bars.length - 1]!
    let high = first.high
    let low = first.low
    let volume = 0
    let amount = 0
    for (const b of bars) {
      high = Math.max(high, b.high)
      low = Math.min(low, b.low)
      volume += b.volume ?? 0
      amount += b.amount ?? 0
    }
    out.push({
      code: first.code,
      date: last.date,
      open: first.open,
      close: last.close,
      high,
      low,
      volume,
      amount,
      changePct: last.changePct,
      turnoverRate: last.turnoverRate,
    })
  }
  return out
}
