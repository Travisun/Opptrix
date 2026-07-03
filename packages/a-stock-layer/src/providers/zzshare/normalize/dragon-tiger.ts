import type { DragonTiger } from '../../../core/schema.js'
import {
  codeFromRow,
  fmtYmd,
  genericRecords,
  num,
  pick,
  rowsFromPayload,
  str,
  type ZzshareRow,
} from './common.js'

function mapDragonTigerRow(row: ZzshareRow, dateHint = ''): DragonTiger | null {
  const code = codeFromRow(row)
  if (!code) return null
  const name = str(pick(row, 'name', 'stock_name', 'sec_name'))
  const date = fmtYmd(pick(row, 'date', 'trade_date', 'date1', 'lhb_date')) || dateHint
  if (!date) return null

  return {
    code,
    name: name || code,
    date,
    reason: str(pick(row, 'reason', 'explanation', 'explain', 'lhb_reason')) || undefined,
    buyAmount: num(pick(row, 'buy_amount', 'buy_amt', 'buy', 'l_buy')),
    sellAmount: num(pick(row, 'sell_amount', 'sell_amt', 'sell', 'l_sell')),
    netAmount: num(pick(row, 'net_amount', 'net_amt', 'net_buy', 'net')),
    changePct: num(pick(row, 'change_pct', 'pct_chg', 'quote_rate', 'change_rate')),
  }
}

/** lhb_list → DragonTiger[]. */
export function mapZzshareLhbListRows(data: unknown, dateHint = ''): DragonTiger[] {
  const out: DragonTiger[] = []
  for (const row of rowsFromPayload(data)) {
    const mapped = mapDragonTigerRow(row, dateHint)
    if (mapped) out.push(mapped)
  }
  return out
}

/** lhb_detail → generic seat/detail records. */
export function mapZzshareLhbDetailRows(data: unknown, dateHint = ''): Record<string, unknown>[] {
  return genericRecords(data).map(row => ({
    ...row,
    code: codeFromRow(row),
    date: fmtYmd(pick(row, 'date', 'trade_date', 'date1')) || dateHint,
    traderName: str(pick(row, 'trader_name', 'branch_name', 'seat_name')),
    buyAmount: num(pick(row, 'buy_amount', 'buy_amt', 'buy')),
    sellAmount: num(pick(row, 'sell_amount', 'sell_amt', 'sell')),
    netAmount: num(pick(row, 'net_amount', 'net_amt', 'net')),
    source: 'lhb_detail',
  }))
}

/** lhb_stock_history → generic history records. */
export function mapZzshareLhbStockHistoryRows(data: unknown, stockCode = ''): Record<string, unknown>[] {
  return genericRecords(data).map(row => ({
    ...row,
    code: codeFromRow(row, stockCode),
    date: fmtYmd(pick(row, 'date', 'trade_date', 'date1')),
    traderName: str(pick(row, 'trader_name', 'branch_name')),
    reason: str(pick(row, 'reason', 'explanation')),
    source: 'lhb_stock_history',
  }))
}
