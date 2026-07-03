import type { IndexKline } from '../../../core/schema.js'
import { genericRecords, num, pick, rowsFromPayload, str, type ZzshareRow } from './common.js'
import { mapZzshareIndexKlineRows, mapZzsharePlateOrTopicKlineRows } from './klines.js'

/** topic_table_list → generic topic table records. */
export function mapZzshareTopicTableListRows(data: unknown): Record<string, unknown>[] {
  return genericRecords(data).map(row => ({
    ...row,
    tid: pick(row, 'tid', 'id', 'topic_id'),
    title: str(pick(row, 'title', 'name', 'topic_name')),
    source: 'topic_table_list',
  }))
}

/** topic_table_stocks → generic topic constituent records. */
export function mapZzshareTopicTableStocksRows(data: unknown, tid?: number): Record<string, unknown>[] {
  return genericRecords(data).map(row => ({
    ...row,
    tid: tid ?? pick(row, 'tid', 'topic_id'),
    code: str(pick(row, 'code', 'stock_code', 'ts_code', 'symbol')),
    name: str(pick(row, 'name', 'stock_name')),
    reason: str(pick(row, 'reason', 'logic', 'desc')),
    source: 'topic_table_stocks',
  }))
}

function mapTopicKlineRow(code: string, row: ZzshareRow): IndexKline | null {
  const close = num(pick(row, 'close', 'c'))
  if (close == null || close <= 0) return null
  return {
    code,
    date: str(pick(row, 'date', 'trade_date', 'date1')).slice(0, 10),
    open: num(pick(row, 'open', 'o')) ?? close,
    close,
    high: num(pick(row, 'high', 'h')) ?? close,
    low: num(pick(row, 'low', 'l')) ?? close,
    volume: num(pick(row, 'vol', 'volume')) ?? 0,
    amount: num(pick(row, 'amount', 'turnover')) ?? 0,
    changePct: num(pick(row, 'pct_chg', 'quote_rate', 'change_pct')),
  }
}

/** topic_kline → IndexKline[] (supports compact or tabular payloads). */
export function mapZzshareTopicKlineRows(code: string, data: unknown): IndexKline[] {
  const plateLike = mapZzsharePlateOrTopicKlineRows(code, data)
  if (plateLike.length) return plateLike

  const out: IndexKline[] = []
  for (const row of rowsFromPayload(data)) {
    const mapped = mapTopicKlineRow(code, row)
    if (mapped) out.push(mapped)
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export { mapZzshareIndexKlineRows }
