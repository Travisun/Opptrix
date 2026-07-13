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
