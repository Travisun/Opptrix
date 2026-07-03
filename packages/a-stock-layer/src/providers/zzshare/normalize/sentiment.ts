import { fmtYmd, genericRecords, pick, rowsFromPayload, str, type ZzshareRow } from './common.js'

function withDate(rows: Record<string, unknown>[], date?: string): Record<string, unknown>[] {
  if (!date) return rows
  return rows.map(row => ({ date, ...row }))
}

/** market_sentiment K 线 → generic records. */
export function mapZzshareMarketSentimentRows(data: unknown, dateHint = ''): Record<string, unknown>[] {
  const rows = genericRecords(data)
  if (!rows.length && data && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>
    if (Array.isArray(payload.x) && Array.isArray(payload.y)) {
      const dates = payload.x as unknown[]
      const values = payload.y as unknown[]
      return dates.map((d, i) => ({
        date: fmtYmd(d),
        values: values[i],
        source: 'market_sentiment',
      }))
    }
  }
  return withDate(rows.map(row => ({
    ...row,
    date: fmtYmd(pick(row, 'date', 'trade_date', 'date1', 'time')) || dateHint,
    source: 'market_sentiment',
  })), dateHint)
}

/** sentiment_trend / sentiment_trend_range → generic records. */
export function mapZzshareSentimentTrendRows(data: unknown, model?: number, dateHint = ''): Record<string, unknown>[] {
  const rows = genericRecords(data).map(row => ({
    ...row,
    model: model ?? pick(row, 'model'),
    time: str(pick(row, 'time', 'trade_time', 'datetime')),
    date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
    source: 'sentiment_trend',
  }))
  if (rows.length) return rows

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>
    const list = payload.list ?? payload.trend ?? payload.data
    if (Array.isArray(list)) {
      return mapZzshareSentimentTrendRows(list, model, dateHint)
    }
  }
  return []
}

/** updown_distribution → generic records (market breadth). */
export function mapZzshareUpdownDistributionRows(data: unknown, dateHint = ''): Record<string, unknown>[] {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const payload = { ...(data as ZzshareRow) }
    if (!rowsFromPayload(data).length) {
      return [{
        date: fmtYmd(pick(payload, 'date', 'date1', 'trade_date')) || dateHint,
        source: 'updown_distribution',
        ...payload,
      }]
    }
  }
  return genericRecords(data).map(row => ({
    ...row,
    date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
    source: 'updown_distribution',
  }))
}

/** sentiment_bull_data → generic records. */
export function mapZzshareSentimentBullDataRows(data: unknown, dateHint = ''): Record<string, unknown>[] {
  const rows = genericRecords(data)
  if (!rows.length && data && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>
    if (Array.isArray(payload.x) && Array.isArray(payload.y)) {
      const dates = payload.x as unknown[]
      const values = payload.y as unknown[]
      return dates.map((d, i) => ({
        date: fmtYmd(d),
        value: values[i],
        source: 'sentiment_bull_data',
      }))
    }
    return [{
      date: fmtYmd(pick(payload, 'date', 'date1')) || dateHint,
      source: 'sentiment_bull_data',
      ...payload,
    }]
  }
  return rows.map(row => ({
    ...row,
    date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
    source: 'sentiment_bull_data',
  }))
}

export { genericRecords as mapZzshareGenericRecords }
