import type { DuckConnection } from '../kline/duck-connection.js'
import { attachSqlite, detachSqlite, duckGet, duckRun } from '../kline/duck-connection.js'
import { MARKET_DUCK_INIT_SQL, MARKET_MIGRATE_TABLES, CN_DAILY_TABLE } from './market-schema.js'

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

async function sqliteTableExists(conn: DuckConnection, table: string): Promise<boolean> {
  const row = await duckGet<{ c: number }>(conn, `
    SELECT COUNT(*)::INTEGER AS c FROM duckdb_tables()
    WHERE database_name = 'md' AND table_name = ?
  `, [table]).catch(() => ({ c: 0 }))
  return (row?.c ?? 0) > 0
}

/** DuckDB → SQLite 回写（导出 .opmd 前将主存储落回 SQLite 快照） */
export async function migrateMarketDataToSqlite(
  conn: DuckConnection,
  sqlitePath: string,
): Promise<Record<string, number>> {
  await ensureMarketDuckSchema(conn)
  await attachSqlite(conn, sqlitePath, 'md', false)
  const out: Record<string, number> = {}
  try {
    for (const table of MARKET_MIGRATE_TABLES) {
      if (table === CN_DAILY_TABLE) continue
      const exists = await sqliteTableExists(conn, table)
      if (!exists) {
        out[table] = 0
        continue
      }
      const srcCount = await duckGet<{ c: number }>(conn, `
        SELECT COUNT(*)::INTEGER AS c FROM ${table}
      `).catch(() => ({ c: 0 }))
      if ((srcCount?.c ?? 0) === 0) {
        out[table] = 0
        continue
      }
      // instruments/stocks：按 Duck 主键删除后插入，保留 SQLite 中尚未迁入 Duck 的行
      if (table === 'instruments') {
        await duckRun(conn, `
          DELETE FROM md.instruments
          WHERE (market, exchange, code, asset_class) IN (
            SELECT market, exchange, code, asset_class FROM instruments
          )
        `)
        await duckRun(conn, `INSERT INTO md.instruments BY NAME SELECT * FROM ${table}`)
      } else if (table === 'stocks') {
        await duckRun(conn, `
          DELETE FROM md.stocks WHERE code IN (SELECT code FROM stocks)
        `)
        await duckRun(conn, `INSERT INTO md.stocks BY NAME SELECT * FROM ${table}`)
      } else {
        await duckRun(conn, `DELETE FROM md.${table}`)
        await duckRun(conn, `INSERT INTO md.${table} BY NAME SELECT * FROM ${table}`)
      }
      const after = await duckGet<{ c: number }>(conn, `
        SELECT COUNT(*)::INTEGER AS c FROM md.${table}
      `)
      out[table] = after?.c ?? 0
    }
    const legacyK = await duckGet<{ c: number }>(conn, `
      SELECT COUNT(*)::INTEGER AS c FROM ${CN_DAILY_TABLE}
    `).catch(() => ({ c: 0 }))
    const sqliteHasKlines = await sqliteTableExists(conn, 'stock_klines_daily')
    if ((legacyK?.c ?? 0) > 0 && sqliteHasKlines) {
      await duckRun(conn, `DELETE FROM md.stock_klines_daily`)
      await duckRun(conn, `
        INSERT INTO md.stock_klines_daily (trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at)
        SELECT trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
        FROM ${CN_DAILY_TABLE}
      `)
      const afterK = await duckGet<{ c: number }>(conn, `
        SELECT COUNT(*)::INTEGER AS c FROM md.stock_klines_daily
      `)
      out.stock_klines_daily = afterK?.c ?? 0
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
  kline_codes: number
  kline_codes_min60: number
  profiles: number
  etf: number
  cn_equity: number
  hk_equity: number
  us_equity: number
  announcements: number
  dividends: number
  partners: number
  segments: number
  shareholders: number
  forecasts: number
  inst_holdings: number
  insider_trades: number
  buybacks: number
}> {
  const q = async (sql: string, ...params: unknown[]) =>
    (await duckGet<{ c: number }>(conn, sql, ...params))?.c ?? 0
  return {
    stocks: await q('SELECT COUNT(*)::INTEGER AS c FROM stocks'),
    instruments: await q('SELECT COUNT(*)::INTEGER AS c FROM instruments'),
    taxonomy: await q('SELECT COUNT(*)::INTEGER AS c FROM taxonomy_nodes'),
    quotes: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_quotes_daily'),
    factors: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_factors'),
    klines: await q('SELECT COUNT(*)::INTEGER AS c FROM cn_daily_bars'),
    kline_codes: await q('SELECT COUNT(DISTINCT code)::INTEGER AS c FROM cn_daily_bars'),
    kline_codes_min60: await q(`
      SELECT COUNT(*)::INTEGER AS c FROM (
        SELECT code FROM cn_daily_bars GROUP BY code HAVING COUNT(*) >= 60
      ) t
    `),
    profiles: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_profiles'),
    etf: await q('SELECT COUNT(*)::INTEGER AS c FROM etf_profiles'),
    cn_equity: await q(`SELECT COUNT(*)::INTEGER AS c FROM instruments WHERE market = 'CN' AND asset_class = 'EQUITY'`),
    hk_equity: await q(`SELECT COUNT(*)::INTEGER AS c FROM instruments WHERE market = 'HK' AND asset_class = 'EQUITY'`),
    us_equity: await q(`SELECT COUNT(*)::INTEGER AS c FROM instruments WHERE market = 'US' AND asset_class = 'EQUITY'`),
    announcements: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_announcements'),
    dividends: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_dividends'),
    partners: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_partners'),
    segments: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_business_segments'),
    shareholders: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_shareholder_summary'),
    forecasts: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_forecasts'),
    inst_holdings: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_inst_holdings'),
    insider_trades: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_insider_trades'),
    buybacks: await q('SELECT COUNT(*)::INTEGER AS c FROM stock_buybacks'),
  }
}
