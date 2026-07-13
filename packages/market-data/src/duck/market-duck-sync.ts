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

export async function migrateMarketDataViaSubprocess(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
  force = false,
): Promise<Record<string, number>> {
  return gw(duckDbPath, sqliteDbPath).migrateMarketDataAsync(force)
}

export async function syncMarketDataToSqliteViaSubprocess(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): Promise<Record<string, number>> {
  return gw(duckDbPath, sqliteDbPath).syncMarketDataToSqliteAsync()
}

export async function applyDuckBatchAsync(
  ops: DuckWriteOp[],
  duckDbPath = klineDuckDbPath(),
): Promise<number> {
  return gw(duckDbPath).applyBatchAsync(ops)
}

/** @deprecated */
export function applyDuckBatchSync(
  ops: DuckWriteOp[],
  duckDbPath = klineDuckDbPath(),
): number {
  throw new Error('applyDuckBatchSync 已移除，请使用 applyDuckBatchAsync')
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
