import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

export function marketDataDir(): string {
  const dir = resolveUserDataRoot()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function marketDbPath(): string {
  return process.env.OPPTRIX_MARKET_DB_PATH ?? path.join(marketDataDir(), 'market.db')
}

/** A 股日 K 与分析列存（DuckDB）— 与 market.db（SQLite 元数据/控制面）协同 */
export function klineDuckDbPath(): string {
  return process.env.OPPTRIX_KLINE_DUCKDB_PATH ?? path.join(marketDataDir(), 'market-kline.duckdb')
}

/** @alias klineDuckDbPath — 同一 DuckDB 文件承载 K 线 + 维表 + 因子 */
export function analyticsDuckDbPath(): string {
  return klineDuckDbPath()
}

/** DuckDB 路径 — 与给定 market SQLite 库配对 */
export function duckDbPathForMarketDb(sqlitePath = marketDbPath()): string {
  if (
    process.env.OPPTRIX_MARKET_DB_PATH
    && process.env.OPPTRIX_KLINE_DUCKDB_PATH
    && sqlitePath === process.env.OPPTRIX_MARKET_DB_PATH
  ) {
    return process.env.OPPTRIX_KLINE_DUCKDB_PATH
  }
  const defaultSqlite = path.join(marketDataDir(), 'market.db')
  if (sqlitePath === defaultSqlite || (sqlitePath === marketDbPath() && !process.env.OPPTRIX_MARKET_DB_PATH)) {
    return klineDuckDbPath()
  }
  return sqlitePath.replace(/\.(sqlite|db)$/i, '.duckdb')
}
