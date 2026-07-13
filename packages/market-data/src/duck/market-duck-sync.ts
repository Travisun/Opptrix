/**
 * @deprecated 请使用 getMarketDuckGateway() — 本模块保留薄封装以兼容现有 import。
 */
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import type { DuckWriteOp } from './market-writes.js'
import {
  getMarketDuckGateway,
  invalidateHasMarketDuckDataCache,
  type MarketDuckStats,
} from './market-duck-gateway.js'

export { invalidateHasMarketDuckDataCache, type MarketDuckStats }

function gw(duckDbPath = klineDuckDbPath(), sqliteDbPath = marketDbPath()) {
  return getMarketDuckGateway(duckDbPath, sqliteDbPath)
}

export function migrateMarketDataViaSubprocess(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
  force = false,
): Record<string, number> {
  return gw(duckDbPath, sqliteDbPath).migrateMarketDataSync(force)
}

export function syncMarketDataToSqliteViaSubprocess(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): Record<string, number> {
  return gw(duckDbPath, sqliteDbPath).syncMarketDataToSqliteSync()
}

export function applyDuckBatchSync(
  ops: DuckWriteOp[],
  duckDbPath = klineDuckDbPath(),
): number {
  return gw(duckDbPath).applyBatchSync(ops)
}

export function duckQueryAllSync<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  duckDbPath = klineDuckDbPath(),
): T[] {
  return gw(duckDbPath).queryAllSync<T>(sql, params)
}

export function duckQueryOneSync<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  duckDbPath = klineDuckDbPath(),
): T | undefined {
  return gw(duckDbPath).queryOneSync<T>(sql, params)
}

export function duckMarketStatsSync(duckDbPath = klineDuckDbPath()): MarketDuckStats {
  return gw(duckDbPath).marketStatsSync()
}

export function hasMarketDuckData(duckDbPath = klineDuckDbPath()): boolean {
  return gw(duckDbPath).hasMarketData()
}
