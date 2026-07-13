import type { MarketDataStore } from '../store.js'
import { isDerivedMaintenanceActive, isMarketSyncActive } from '../duck/duck-subprocess-gate.js'

/** 后台 Duck 写入进行中时，UI 读路径直接走 SQLite 回退，不 spawn 子进程 */
function preferSqliteFallback(): boolean {
  return isMarketSyncActive() || isDerivedMaintenanceActive()
}

export function marketReadAll<T extends Record<string, unknown>>(
  store: MarketDataStore,
  sql: string,
  params: unknown[],
  sqliteFallback: () => T[],
): T[] {
  if (preferSqliteFallback()) return sqliteFallback()
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
  if (preferSqliteFallback()) return sqliteFallback()
  const gw = store.duckGateway()
  if (gw.hasMarketData()) {
    const row = gw.queryOneSync<T>(sql, params)
    if (row) return row
  }
  return sqliteFallback()
}
