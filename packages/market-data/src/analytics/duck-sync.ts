import type { DuckConnection } from '../kline/duck-connection.js'
import { migrateMarketDataFromSqlite } from '../duck/market-migrate.js'
import { MARKET_DUCK_INIT_SQL } from '../duck/market-schema.js'
import { duckRun } from '../kline/duck-connection.js'

export type AnalyticsSyncScope = 'dims' | 'quotes' | 'factors' | 'scores' | 'financials' | 'all'

export async function ensureAnalyticsSchema(conn: DuckConnection): Promise<void> {
  await duckRun(conn, MARKET_DUCK_INIT_SQL)
}

/** @deprecated 市场数据已直写 DuckDB；保留为 SQLite→Duck 兼容迁移入口 */
export async function syncAnalytics(
  conn: DuckConnection,
  sqlitePath: string,
  scope: AnalyticsSyncScope,
): Promise<Record<string, number>> {
  void scope
  const migrated = await migrateMarketDataFromSqlite(conn, sqlitePath, false)
  return { all: Object.values(migrated).reduce((a, b) => a + b, 0), ...migrated }
}
