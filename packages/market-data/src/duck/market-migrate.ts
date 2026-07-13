import type { DuckConnection } from '../kline/duck-connection.js'
import { attachSqlite, detachSqlite, duckGet, duckRun } from '../kline/duck-connection.js'
import { MARKET_DUCK_INIT_SQL, MARKET_MIGRATE_TABLES } from './market-schema.js'

export async function ensureMarketDuckSchema(conn: DuckConnection): Promise<void> {
  await duckRun(conn, MARKET_DUCK_INIT_SQL)
}

/** 从 SQLite 一次性迁移市场数据到 DuckDB（幂等：按表行数对比跳过已迁移表） */
export async function migrateMarketDataFromSqlite(
  conn: DuckConnection,
  sqlitePath: string,
  force = false,
): Promise<Record<string, number>> {
  await ensureMarketDuckSchema(conn)
  await attachSqlite(conn, sqlitePath, 'md', true)
  const out: Record<string, number> = {}
  try {
    for (const table of MARKET_MIGRATE_TABLES) {
      const srcCount = await duckGet<{ c: number }>(conn, `
        SELECT COUNT(*)::INTEGER AS c FROM md.${table}
      `).catch(() => ({ c: 0 }))
      const src = srcCount?.c ?? 0
      if (src === 0) {
        out[table] = 0
        continue
      }
      const dstCount = await duckGet<{ c: number }>(conn, `
        SELECT COUNT(*)::INTEGER AS c FROM ${table}
      `).catch(() => ({ c: 0 }))
      const dst = dstCount?.c ?? 0
      if (!force && dst >= src) {
        out[table] = dst
        continue
      }
      await duckRun(conn, `DELETE FROM ${table}`)
      await duckRun(conn, `INSERT INTO ${table} BY NAME SELECT * FROM md.${table}`)
      const after = await duckGet<{ c: number }>(conn, `SELECT COUNT(*)::INTEGER AS c FROM ${table}`)
      out[table] = after?.c ?? 0
    }
    // 遗留 SQLite K 线 → cn_daily_bars
    const legacyK = await duckGet<{ c: number }>(conn, `
      SELECT COUNT(*)::INTEGER AS c FROM md.stock_klines_daily
    `).catch(() => ({ c: 0 }))
    const duckK = await duckGet<{ c: number }>(conn, `
      SELECT COUNT(*)::INTEGER AS c FROM cn_daily_bars
    `).catch(() => ({ c: 0 }))
    if ((legacyK?.c ?? 0) > 0 && (force || (duckK?.c ?? 0) < (legacyK?.c ?? 0))) {
      await duckRun(conn, `
        INSERT INTO cn_daily_bars (trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at)
        SELECT trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
        FROM md.stock_klines_daily
        WHERE NOT EXISTS (
          SELECT 1 FROM cn_daily_bars k
          WHERE k.trade_date = md.stock_klines_daily.trade_date AND k.code = md.stock_klines_daily.code
        )
      `)
      const afterK = await duckGet<{ c: number }>(conn, `SELECT COUNT(*)::INTEGER AS c FROM cn_daily_bars`)
      out.cn_daily_bars = afterK?.c ?? 0
    }
  } finally {
    await detachSqlite(conn)
  }
  return out
}

export async function marketDuckStats(conn: DuckConnection): Promise<{
  stocks: number
  instruments: number
  taxonomy: number
  quotes: number
  factors: number
  klines: number
  profiles: number
  etf: number
}> {
  const q = async (sql: string) => (await duckGet<{ c: number }>(conn, sql))?.c ?? 0
  return {
    stocks: await q('SELECT COUNT(*)::INTEGER AS c FROM stocks'),
    instruments: await q('SELECT COUNT(*)::INTEGER AS c FROM instruments'),
    taxonomy: await q('SELECT COUNT(*)::INTEGER AS c FROM taxonomy_nodes'),
    quotes: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_quotes_daily'),
    factors: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_factors'),
    klines: await q('SELECT COUNT(*)::INTEGER AS c FROM cn_daily_bars'),
    profiles: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_profiles'),
    etf: await q('SELECT COUNT(*)::INTEGER AS c FROM etf_profiles'),
  }
}
