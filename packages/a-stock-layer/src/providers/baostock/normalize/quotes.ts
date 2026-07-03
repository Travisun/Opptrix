import type { IndexRealtime, StockRealtime } from '../../../core/schema.js'
import type { StockKline } from '@opptrix/shared'
import { normalizeCode } from '../../../utils/helpers.js'

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Baostock 无实时行情 — 用最近一根日 K 模拟 EOD 快照 */
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

/** 从 baostock 日 K 行直接映射（含 preclose 字段） */
export function mapDailyRowToStockRealtime(
  code: string,
  row: Record<string, string>,
  name = '',
): StockRealtime | null {
  const close = num(row.close)
  if (close == null || close <= 0) return null
  const preClose = num(row.preclose ?? row.preClose)
  let changePct = num(row.pctChg)
  if (changePct == null && preClose != null && preClose > 0) {
    changePct = ((close - preClose) / preClose) * 100
  }
  return {
    code: normalizeCode(code),
    name: name || code,
    price: close,
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    preClose,
    volume: num(row.volume),
    amount: num(row.amount),
    changePct,
    turnoverRate: num(row.turn),
    pe: null,
    pb: null,
  }
}

export function mapDailyRowToIndexRealtime(
  code: string,
  row: Record<string, string>,
  name = '',
): IndexRealtime | null {
  const q = mapDailyRowToStockRealtime(code, row, name)
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
