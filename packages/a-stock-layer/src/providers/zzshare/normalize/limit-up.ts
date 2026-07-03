import type { LimitUpDown } from '../../../core/schema.js'
import {
  codeFromRow,
  dictRowsFromPayload,
  fmtYmd,
  genericRecords,
  num,
  pick,
  rowsFromPayload,
  str,
  type ZzshareRow,
} from './common.js'

function inferLimitType(row: ZzshareRow): LimitUpDown['type'] {
  const raw = str(pick(row, 'type', 'limit_type', 'status')).toLowerCase()
  if (raw.includes('down') || raw.includes('跌停')) return 'limit_down'
  return 'limit_up'
}

function mapLimitUpRow(row: ZzshareRow, dateHint = ''): LimitUpDown | null {
  const code = codeFromRow(row)
  if (!code) return null
  const date = fmtYmd(pick(row, 'date', 'trade_date', 'date1')) || dateHint
  if (!date) return null
  return {
    code,
    name: str(pick(row, 'name', 'stock_name')) || code,
    date,
    type: inferLimitType(row),
    changePct: num(pick(row, 'change_pct', 'pct_chg', 'quote_rate', 'change_rate')),
    reason: str(pick(row, 'reason', 'uplimit_reason', 'explain')) || undefined,
  }
}

/** uplimit_hot → generic hot-board records. */
export function mapZzshareUplimitHotRows(data: unknown, dateHint = ''): Record<string, unknown>[] {
  return genericRecords(data).map(row => ({
    ...row,
    date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
    board: str(pick(row, 'board', 'plate_code', 'plate_name')),
    source: 'uplimit_hot',
  }))
}

/** uplimit_stocks → LimitUpDown[] (dict or list payload). */
export function mapZzshareUplimitStocksRows(data: unknown, dateHint = ''): LimitUpDown[] {
  const rows = dictRowsFromPayload(data, 'board_key')
  const out: LimitUpDown[] = []
  for (const row of rows) {
    const mapped = mapLimitUpRow(row, dateHint)
    if (mapped) out.push(mapped)
  }
  return out
}

/** review_uplimit_reason / review_uplimit_reason_open → LimitUpDown[]. */
export function mapZzshareReviewUplimitReasonRows(data: unknown, dateHint = ''): LimitUpDown[] {
  const out: LimitUpDown[] = []
  for (const row of rowsFromPayload(data)) {
    const mapped = mapLimitUpRow(row, dateHint)
    if (mapped) out.push(mapped)
  }
  if (!out.length) {
    return genericRecords(data).map(row => ({
      code: codeFromRow(row),
      name: str(pick(row, 'name', 'stock_name')) || codeFromRow(row),
      date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
      type: 'limit_up' as const,
      changePct: num(pick(row, 'change_pct', 'pct_chg', 'quote_rate')),
      reason: str(pick(row, 'reason', 'uplimit_reason', 'logic')),
    }))
  }
  return out
}

/** stock_uplimit_reason → single record or list. */
export function mapZzshareStockUplimitReasonRows(
  data: unknown,
  stockCode = '',
  dateHint = '',
): Record<string, unknown>[] {
  const rows = rowsFromPayload(data)
  if (!rows.length && data && typeof data === 'object' && !Array.isArray(data)) {
    return [{
      ...(data as ZzshareRow),
      code: codeFromRow(data as ZzshareRow, stockCode),
      date: fmtYmd(pick(data as ZzshareRow, 'date', 'trade_date', 'date1')) || dateHint,
      reason: str(pick(data as ZzshareRow, 'reason', 'uplimit_reason', 'logic')),
      source: 'stock_uplimit_reason',
    }]
  }
  return rows.map(row => ({
    ...row,
    code: codeFromRow(row, stockCode),
    date: fmtYmd(pick(row, 'date', 'trade_date', 'date1')) || dateHint,
    reason: str(pick(row, 'reason', 'uplimit_reason', 'logic')),
    source: 'stock_uplimit_reason',
  }))
}
