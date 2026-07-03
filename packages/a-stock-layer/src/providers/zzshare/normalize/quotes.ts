import type { IndexRealtime, StockRealtime } from '../../../core/schema.js'
import type { StockKline } from '@opptrix/shared'
import { normalizeCode } from '../../../utils/helpers.js'
import { codeFromRow, num, pick, rowsFromPayload, str, type ZzshareRow } from './common.js'

function mapRtRow(row: ZzshareRow): StockRealtime | null {
  const tsCode = str(pick(row, 'ts_code', 'code', 'symbol'))
  if (!tsCode) return null

  const code = codeFromRow(row)
  const price = num(pick(row, 'close', 'price', 'last'))
  const preClose = num(pick(row, 'pre_close', 'prev_close', 'preclose'))
  let changePct = num(pick(row, 'quote_rate', 'pct_chg', 'pct_change', 'change_pct'))
  if (changePct == null && price != null && preClose != null && preClose !== 0) {
    changePct = ((price - preClose) / preClose) * 100
  }

  const name = str(pick(row, 'name', 'stock_name')) || code

  return {
    code,
    name,
    price,
    open: num(pick(row, 'open')),
    high: num(pick(row, 'high')),
    low: num(pick(row, 'low')),
    preClose,
    volume: num(pick(row, 'vol', 'volume')),
    amount: num(pick(row, 'amount', 'turnover')),
    changePct,
    turnoverRate: num(pick(row, 'turnover_rate', 'turn')),
    pe: num(pick(row, 'ttm_pe_rate', 'pe')),
    pb: null,
    change: num(pick(row, 'change', 'change_amount')),
    amplitude: num(pick(row, 'amp_rate', 'amplitude')),
    marketCap: num(pick(row, 'market_value', 'total_mv')),
    timestamp: str(pick(row, 'trade_time', 'timestamp', 'update_time')) || undefined,
  }
}

export function mapZzshareRtKRow(row: ZzshareRow): StockRealtime | null {
  return mapRtRow(row)
}

export function mapZzshareRtKRows(rows: unknown): StockRealtime[] {
  const out: StockRealtime[] = []
  for (const row of rowsFromPayload(rows)) {
    const mapped = mapRtRow(row)
    if (mapped) out.push(mapped)
  }
  return out
}

/** Baostock-style fallback — latest daily bar as EOD snapshot. */
export function mapLatestKlineToStockRealtime(
  bar: StockKline,
  name = '',
): StockRealtime {
  const preClose = num((bar as StockKline & { preClose?: number }).preClose)
  let changePct = bar.changePct ?? null
  if (changePct == null && preClose != null && preClose > 0) {
    changePct = ((bar.close - preClose) / preClose) * 100
  }
  return {
    code: normalizeCode(bar.code),
    name: name || bar.code,
    price: bar.close,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    preClose,
    volume: bar.volume,
    amount: bar.amount,
    changePct,
    turnoverRate: bar.turnoverRate ?? null,
    pe: null,
    pb: null,
  }
}

export function mapLatestKlineToIndexRealtime(
  bar: StockKline,
  name = '',
): IndexRealtime {
  const stock = mapLatestKlineToStockRealtime(bar, name)
  return {
    code: stock.code,
    name: stock.name,
    price: stock.price,
    open: stock.open,
    high: stock.high,
    low: stock.low,
    preClose: stock.preClose,
    volume: stock.volume,
    amount: stock.amount,
    changePct: stock.changePct,
  }
}

export function mapZzshareDailyRowToStockRealtime(
  code: string,
  row: ZzshareRow,
  name = '',
): StockRealtime | null {
  const close = num(pick(row, 'close', 'c'))
  if (close == null || close <= 0) return null
  const preClose = num(pick(row, 'pre_close', 'prev_close', 'preclose'))
  let changePct = num(pick(row, 'pct_chg', 'pct_change', 'quote_rate'))
  if (changePct == null && preClose != null && preClose > 0) {
    changePct = ((close - preClose) / preClose) * 100
  }
  const bare = codeFromRow(row, code)
  return {
    code: bare,
    name: name || str(pick(row, 'name')) || bare,
    price: close,
    open: num(pick(row, 'open', 'o')),
    high: num(pick(row, 'high', 'h')),
    low: num(pick(row, 'low', 'l')),
    preClose,
    volume: num(pick(row, 'vol', 'volume')),
    amount: num(pick(row, 'amount', 'turnover')),
    changePct,
    turnoverRate: num(pick(row, 'turnover_rate', 'turn')),
    pe: null,
    pb: null,
  }
}

export function mapZzshareDailyRowToIndexRealtime(
  code: string,
  row: ZzshareRow,
  name = '',
): IndexRealtime | null {
  const q = mapZzshareDailyRowToStockRealtime(code, row, name)
  if (!q) return null
  return {
    code: q.code,
    name: q.name,
    price: q.price,
    open: q.open,
    high: q.high,
    low: q.low,
    preClose: q.preClose,
    volume: q.volume,
    amount: q.amount,
    changePct: q.changePct,
  }
}
