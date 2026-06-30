import type { StockRealtime } from '../core/schema.js'

/** 现价无效（未开盘/数据源未刷新）时视为缺失 */
export function isMissingLivePrice(price: number | null | undefined): boolean {
  return price == null || !Number.isFinite(price) || price <= 0
}

/**
 * 交易日开盘前等场景：实时接口可能返回 price=0，此时沿用昨收（preClose）。
 * change / changePct 置 0，表示相对昨收暂无变动。
 */
export function normalizePreOpenRealtimeQuote(row: StockRealtime): StockRealtime {
  if (!isMissingLivePrice(row.price)) return row

  const preClose = row.preClose
  if (preClose != null && preClose > 0) {
    return {
      ...row,
      price: preClose,
      change: 0,
      changePct: 0,
    }
  }

  return row
}

export function normalizePreOpenRealtimeQuotes(rows: StockRealtime[] | null | undefined): StockRealtime[] {
  if (!rows?.length) return []
  return rows.map(normalizePreOpenRealtimeQuote)
}
