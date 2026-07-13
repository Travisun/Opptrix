import type { MarketDataStore } from '../store.js'

export function marketReadAll<T extends Record<string, unknown>>(
  store: MarketDataStore,
  sql: string,
  params: unknown[],
  sqliteFallback: () => T[],
): T[] {
  const gw = store.duckGateway()
  if (gw.hasMarketData()) {
    const rows = gw.queryAllSync<T>(sql, params)
    if (rows.length) return rows
  }
  return sqliteFallback()
}

export function marketReadOne<T extends Record<string, unknown>>(
  store: MarketDataStore,
  sql: string,
  params: unknown[],
  sqliteFallback: () => T | undefined,
): T | undefined {
  const gw = store.duckGateway()
  if (gw.hasMarketData()) {
    const row = gw.queryOneSync<T>(sql, params)
    if (row) return row
  }
  return sqliteFallback()
}
