import type { StrategyData } from './base.js'
import { lastRow } from './indicators.js'

export function buildInstrumentIndicators(data: StrategyData) {
  const rows = data.indicators ?? []
  return {
    latest: lastRow(rows),
    series_tail: rows.slice(-5),
    bar_count: rows.length,
    computed_at: new Date().toISOString(),
  }
}
