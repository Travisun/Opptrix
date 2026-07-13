import type { MarketDataStore } from '../store.js'
import { duckQueryAllSync, duckQueryOneSync, hasMarketDuckData } from '../duck/market-duck-sync.js'

export function marketReadAll<T extends Record<string, unknown>>(
  store: MarketDataStore,
  sql: string,
  params: unknown[],
  sqliteFallback: () => T[],
): T[] {
  if (hasMarketDuckData(store.klineDuckDbPath)) {
    const rows = duckQueryAllSync<T>(sql, params, store.klineDuckDbPath)
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
  if (hasMarketDuckData(store.klineDuckDbPath)) {
    const row = duckQueryOneSync<T>(sql, params, store.klineDuckDbPath)
    if (row) return row
  }
  return sqliteFallback()
}
