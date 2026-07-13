/**
 * DuckDB 分析子进程 CLI — K 线 / 维表 / 因子 / 筛选查询。
 * 独立进程运行，不阻塞 API 主进程事件循环。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  closeDuck,
  connectDuck,
  duckAll,
  duckGet,
  duckRun,
  openDuckDatabase,
  attachSqlite,
  detachSqlite,
} from './duck-connection.js'
import { CN_DAILY_TABLE } from '../analytics/duck-schema.js'
import { ensureAnalyticsSchema, syncAnalytics, type AnalyticsSyncScope } from '../analytics/duck-sync.js'
import { computeScreenFactors, analyticsStats } from '../analytics/duck-compute.js'
import { ensureMarketDuckSchema, migrateMarketDataFromSqlite, migrateMarketDataToSqlite, marketDuckStats } from '../duck/market-migrate.js'
import { applyDuckWriteOps, type DuckWriteOp } from '../duck/market-writes.js'
import {
  latestFactorDateDuck,
  queryIndustryStatsDuck,
  queryIndustryStocksDuck,
  queryUniverseScreenDuck,
  type DuckUniverseScreenQuery,
} from '../analytics/duck-query.js'

const CN_TABLE = CN_DAILY_TABLE

function emit(obj: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true'
      out[key] = val
    } else {
      positional.push(a)
    }
  }
  return { cmd: positional[0] ?? '', flags: out }
}

const PARQUET_SELECT = `
  SELECT
    strftime(
      timezone('Asia/Shanghai', to_timestamp(CAST(date_ms AS DOUBLE) / 1000)),
      '%Y-%m-%d'
    ) AS trade_date,
    regexp_replace(CAST(thscode AS VARCHAR), '\\.(SH|SZ|BJ)$', '', 'i') AS code,
    CAST(open_price AS DOUBLE) AS open,
    CAST(high_price AS DOUBLE) AS high,
    CAST(low_price AS DOUBLE) AS low,
    CAST(close_price AS DOUBLE) AS close,
    CAST(volume AS DOUBLE) AS volume,
    CAST(turnover AS DOUBLE) AS amount,
    CAST(NULL AS DOUBLE) AS change_pct,
    strftime(now(), '%Y-%m-%dT%H:%M:%S') AS synced_at
  FROM read_parquet(?)
  WHERE date_ms IS NOT NULL
    AND length(regexp_replace(CAST(thscode AS VARCHAR), '\\.(SH|SZ|BJ)$', '', 'i')) = 6
`

async function ensureKlineImportSchema(conn: ReturnType<typeof connectDuck>) {
  await duckRun(conn, `
    CREATE TABLE IF NOT EXISTS ${CN_TABLE} (
      trade_date VARCHAR NOT NULL,
      code VARCHAR NOT NULL,
      open DOUBLE,
      high DOUBLE,
      low DOUBLE,
      close DOUBLE,
      volume DOUBLE,
      amount DOUBLE,
      change_pct DOUBLE,
      synced_at VARCHAR NOT NULL,
      PRIMARY KEY (trade_date, code)
    );
  `)
}

async function cmdImport(flags: Record<string, string>) {
  const parquetPath = flags.parquet
  const duckPath = flags.duckdb
  const mode = flags.mode === 'incremental' ? 'incremental' : 'full'
  if (!parquetPath || !duckPath) {
    throw new Error('import 需要 --parquet --duckdb')
  }
  if (!fs.existsSync(parquetPath)) throw new Error(`Parquet 不存在: ${parquetPath}`)

  const dir = path.dirname(duckPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  emit({ type: 'progress', message: 'DuckDB 打开数据库', percent: 72 })
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    emit({ type: 'progress', message: 'DuckDB 读取 Parquet', percent: 78 })

    if (mode === 'full') {
      await duckRun(conn, `DELETE FROM ${CN_TABLE}`)
    }

    await duckRun(conn, `
      INSERT OR REPLACE INTO ${CN_TABLE}
      ${PARQUET_SELECT}
    `, parquetPath)

    const countRow = await duckGet<{ c: number }>(conn, `SELECT COUNT(*)::INTEGER AS c FROM ${CN_TABLE}`)
    const rows = countRow?.c ?? 0
    emit({ type: 'progress', message: `DuckDB 已写入 ${rows.toLocaleString()} 条`, percent: 95 })
    emit({ type: 'done', rowsImported: rows, klineRows: rows })
  } finally {
    await closeDuck(db)
  }
}

async function cmdStats(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  if (!duckPath) throw new Error('stats 需要 --duckdb')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({ rows: 0, codes: 0, maxDate: null }))
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    const row = await duckGet<{ rows: number; codes: number; maxDate: string | null }>(conn, `
      SELECT
        COUNT(*)::INTEGER AS rows,
        COUNT(DISTINCT code)::INTEGER AS codes,
        MAX(trade_date) AS maxDate
      FROM ${CN_TABLE}
    `)
    process.stdout.write(JSON.stringify(row ?? { rows: 0, codes: 0, maxDate: null }))
  } finally {
    await closeDuck(db)
  }
}

async function cmdQueryKlines(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const code = String(flags.code ?? '').padStart(6, '0')
  const limit = Math.max(1, Math.min(Number(flags.limit ?? 800), 800))
  const before = flags.before?.slice(0, 10)
  if (!duckPath || !code) throw new Error('query-klines 需要 --duckdb --code')

  if (!fs.existsSync(duckPath)) {
    process.stdout.write('[]')
    return
  }

  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    const params: unknown[] = [code]
    let beforeClause = ''
    if (before) {
      beforeClause = ' AND trade_date < ?'
      params.push(before)
    }
    params.push(limit)
    const rows = await duckAll(conn, `
      SELECT trade_date, open, high, low, close, volume, amount, change_pct
      FROM ${CN_TABLE}
      WHERE code = ?${beforeClause}
      ORDER BY trade_date DESC
      LIMIT ?
    `, ...params)
    const mapped = rows.reverse().map((row: Record<string, unknown>) => ({
      code,
      date: row.trade_date,
      open: row.open ?? 0,
      high: row.high ?? 0,
      low: row.low ?? 0,
      close: row.close ?? 0,
      volume: row.volume ?? 0,
      amount: row.amount ?? 0,
      changePct: row.change_pct ?? null,
      turnoverRate: null,
    }))
    process.stdout.write(JSON.stringify(mapped))
  } finally {
    await closeDuck(db)
  }
}

async function cmdMigrateFromSqlite(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  if (!duckPath || !sqlitePath) throw new Error('migrate-from-sqlite 需要 --duckdb --sqlite')
  if (!fs.existsSync(sqlitePath)) {
    emit({ type: 'done', rowsImported: 0, skipped: true })
    return
  }

  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    const existing = await duckGet<{ c: number }>(conn, `SELECT COUNT(*)::INTEGER AS c FROM ${CN_TABLE}`)
    if ((existing?.c ?? 0) > 0) {
      emit({ type: 'done', rowsImported: 0, skipped: true })
      return
    }
    emit({ type: 'progress', message: '从 SQLite 迁移历史 K 线到 DuckDB', percent: 10 })
    await attachSqlite(conn, sqlitePath, 'md', true)
    await duckRun(conn, `
      INSERT INTO ${CN_TABLE} (
        trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
      )
      SELECT trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
      FROM md.stock_klines_daily
    `)
    await detachSqlite(conn)
    const countRow = await duckGet<{ c: number }>(conn, `SELECT COUNT(*)::INTEGER AS c FROM ${CN_TABLE}`)
    emit({ type: 'done', rowsImported: countRow?.c ?? 0, migrated: true })
  } finally {
    await closeDuck(db)
  }
}

async function cmdCodesWithMin(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const min = Math.max(1, Number(flags.min ?? 60))
  if (!duckPath || !fs.existsSync(duckPath)) {
    process.stdout.write('[]')
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    const rows = await duckAll<{ code: string }>(conn, `
      SELECT code FROM ${CN_TABLE} GROUP BY code HAVING COUNT(*) >= ?
    `, min)
    process.stdout.write(JSON.stringify(rows.map(r => r.code)))
  } finally {
    await closeDuck(db)
  }
}

async function cmdLatestBars(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const tradeDate = flags.date?.slice(0, 10)
  if (!duckPath || !fs.existsSync(duckPath)) {
    process.stdout.write('[]')
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    const rows = tradeDate
      ? await duckAll(conn, `SELECT code, close, change_pct FROM ${CN_TABLE} WHERE trade_date = ?`, tradeDate)
      : await duckAll(conn, `
          SELECT k.code, k.close, k.change_pct
          FROM ${CN_TABLE} k
          INNER JOIN (
            SELECT code, MAX(trade_date) AS trade_date FROM ${CN_TABLE} GROUP BY code
          ) l ON k.code = l.code AND k.trade_date = l.trade_date
        `)
    process.stdout.write(JSON.stringify(rows))
  } finally {
    await closeDuck(db)
  }
}

async function cmdUpsert(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  const filePath = flags.file
  if (!duckPath || !sqlitePath || !filePath) throw new Error('upsert 需要 --duckdb --sqlite --file')
  const raw = fs.readFileSync(filePath, 'utf8')
  const rows = JSON.parse(raw) as Array<{
    tradeDate: string; code: string
    open?: number | null; high?: number | null; low?: number | null; close?: number | null
    volume?: number | null; amount?: number | null; changePct?: number | null
  }>
  if (!rows.length) {
    emit({ type: 'done', rowsImported: 0 })
    return
  }
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    const syncedAt = new Date().toISOString()
    await duckRun(conn, 'BEGIN TRANSACTION')
    for (const r of rows) {
      const code = String(r.code).padStart(6, '0')
      await duckRun(conn, `
        INSERT OR REPLACE INTO ${CN_TABLE} (
          trade_date, code, open, high, low, close, volume, amount, change_pct, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, r.tradeDate, code, r.open ?? null, r.high ?? null, r.low ?? null, r.close ?? null,
      r.volume ?? null, r.amount ?? null, r.changePct ?? null, syncedAt)
    }
    await duckRun(conn, 'COMMIT')
    await attachSqlite(conn, sqlitePath, 'md', false)
    const minDate = rows.reduce((m, r) => (r.tradeDate < m ? r.tradeDate : m), rows[0]!.tradeDate)
    const maxDate = rows.reduce((m, r) => (r.tradeDate > m ? r.tradeDate : m), rows[0]!.tradeDate)
    await duckRun(conn, `
      DELETE FROM md.instrument_bars_daily
      WHERE market = 'CN' AND trade_date >= ? AND trade_date <= ?
    `, minDate, maxDate)
    await duckRun(conn, `
      INSERT INTO md.instrument_bars_daily (
        market, code, trade_date, open, high, low, close, volume, amount, change_pct, synced_at
      )
      SELECT 'CN', code, trade_date, open, high, low, close, volume, amount, change_pct, synced_at
      FROM ${CN_TABLE}
      WHERE trade_date >= ? AND trade_date <= ?
    `, minDate, maxDate)
    await detachSqlite(conn)
    emit({ type: 'done', rowsImported: rows.length })
  } catch (e) {
    await duckRun(conn, 'ROLLBACK').catch(() => {})
    throw e
  } finally {
    await closeDuck(db)
  }
}

async function cmdSyncBars(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  if (!duckPath || !sqlitePath) throw new Error('sync-bars 需要 --duckdb --sqlite')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({ barsSynced: 0 }))
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureKlineImportSchema(conn)
    await attachSqlite(conn, sqlitePath, 'md', false)
    const missing = await duckGet<{ c: number }>(conn, `
      SELECT COUNT(*)::INTEGER AS c FROM ${CN_TABLE} k
      WHERE NOT EXISTS (
        SELECT 1 FROM md.instrument_bars_daily b
        WHERE b.market = 'CN' AND b.code = k.code AND b.trade_date = k.trade_date
      )
    `)
    const toSync = missing?.c ?? 0
    if (toSync > 0) {
      await duckRun(conn, `
        INSERT INTO md.instrument_bars_daily (
          market, code, trade_date, open, high, low, close, volume, amount, change_pct, synced_at
        )
        SELECT 'CN', k.code, k.trade_date, k.open, k.high, k.low, k.close, k.volume, k.amount, k.change_pct, k.synced_at
        FROM ${CN_TABLE} k
        WHERE NOT EXISTS (
          SELECT 1 FROM md.instrument_bars_daily b
          WHERE b.market = 'CN' AND b.code = k.code AND b.trade_date = k.trade_date
        )
      `)
    }
    await detachSqlite(conn)
    process.stdout.write(JSON.stringify({ barsSynced: toSync }))
  } finally {
    await closeDuck(db)
  }
}

async function cmdSyncAnalytics(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  const scope = (flags.scope ?? 'all') as AnalyticsSyncScope
  if (!duckPath || !sqlitePath) throw new Error('sync-analytics 需要 --duckdb --sqlite')
  const dir = path.dirname(duckPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    await ensureAnalyticsSchema(conn)
    const result = await syncAnalytics(conn, sqlitePath, scope)
    process.stdout.write(JSON.stringify(result))
  } finally {
    await closeDuck(db)
  }
}

async function cmdComputeFactors(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  const tradeDate = flags.date?.slice(0, 10)
  const filePath = flags.file
  if (!duckPath || !sqlitePath || !tradeDate) throw new Error('compute-factors 需要 --duckdb --sqlite --date')
  let codes: string[] | undefined
  if (filePath) {
    codes = JSON.parse(fs.readFileSync(filePath, 'utf8')) as string[]
  }
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    await ensureAnalyticsSchema(conn)
    const result = await computeScreenFactors(conn, sqlitePath, tradeDate, codes)
    process.stdout.write(JSON.stringify(result))
  } finally {
    await closeDuck(db)
  }
}

async function cmdAnalyticsStats(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  if (!duckPath) throw new Error('analytics-stats 需要 --duckdb')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({
      stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0,
    }))
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureAnalyticsSchema(conn)
    process.stdout.write(JSON.stringify(await analyticsStats(conn)))
  } finally {
    await closeDuck(db)
  }
}

async function cmdQueryIndustryStats(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const tradeDate = flags.date?.slice(0, 10) ?? ''
  if (!duckPath || !tradeDate) throw new Error('query-industry-stats 需要 --duckdb --date')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({ trade_date: tradeDate, quote_date: null, items: [] }))
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureAnalyticsSchema(conn)
    const date = tradeDate || (await latestFactorDateDuck(conn)) || new Date().toISOString().slice(0, 10)
    process.stdout.write(JSON.stringify(await queryIndustryStatsDuck(conn, date)))
  } finally {
    await closeDuck(db)
  }
}

async function cmdQueryIndustryStocks(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const industry = flags.industry ?? ''
  const tradeDate = flags.date?.slice(0, 10) ?? ''
  const limit = Math.min(200, Math.max(1, Number(flags.limit ?? 120)))
  if (!duckPath || !industry) throw new Error('query-industry-stocks 需要 --duckdb --industry')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({ items: [] }))
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureAnalyticsSchema(conn)
    const date = tradeDate || (await latestFactorDateDuck(conn)) || new Date().toISOString().slice(0, 10)
    const items = await queryIndustryStocksDuck(conn, industry, date, limit)
    process.stdout.write(JSON.stringify({ trade_date: date, items }))
  } finally {
    await closeDuck(db)
  }
}

async function cmdScreenUniverse(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const filePath = flags.file
  if (!duckPath || !filePath) throw new Error('screen-universe 需要 --duckdb --file')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({ items: [], passed: 0, total_universe: 0 }))
    return
  }
  const query = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DuckUniverseScreenQuery & { trade_date?: string }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    await ensureAnalyticsSchema(conn)
    const tradeDate = query.trade_date?.slice(0, 10)
      || (await latestFactorDateDuck(conn))
      || new Date().toISOString().slice(0, 10)
    const result = await queryUniverseScreenDuck(conn, query, tradeDate)
    const items = result.items.map(row => ({
      ...row,
      market_cap_yi: row.market_cap != null
        ? Math.round((row.market_cap / 100_000_000) * 100) / 100
        : null,
    }))
    process.stdout.write(JSON.stringify({ ...result, items }))
  } finally {
    await closeDuck(db)
  }
}

async function cmdMigrateMarketData(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  const force = flags.force === 'true' || flags.force === '1'
  if (!duckPath || !sqlitePath) throw new Error('migrate-market-data 需要 --duckdb --sqlite')
  const dir = path.dirname(duckPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    const result = await migrateMarketDataFromSqlite(conn, sqlitePath, force)
    process.stdout.write(JSON.stringify(result))
  } finally {
    await closeDuck(db)
  }
}

async function cmdSyncMarketDataToSqlite(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const sqlitePath = flags.sqlite
  if (!duckPath || !sqlitePath) throw new Error('sync-market-data-to-sqlite 需要 --duckdb --sqlite')
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    const result = await migrateMarketDataToSqlite(conn, sqlitePath)
    process.stdout.write(JSON.stringify(result))
  } finally {
    await closeDuck(db)
  }
}

async function cmdApplyBatch(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const filePath = flags.file
  if (!duckPath || !filePath) throw new Error('apply-batch 需要 --duckdb --file')
  const ops = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DuckWriteOp[]
  const db = openDuckDatabase(duckPath)
  const conn = connectDuck(db)
  try {
    await ensureMarketDuckSchema(conn)
    const applied = await applyDuckWriteOps(conn, ops)
    process.stdout.write(JSON.stringify({ applied }))
  } finally {
    await closeDuck(db)
  }
}

async function cmdQueryJson(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  const filePath = flags.file
  if (!duckPath || !filePath) throw new Error('query-json 需要 --duckdb --file')
  const { sql, params } = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { sql: string; params?: unknown[] }
  if (!fs.existsSync(duckPath)) {
    process.stdout.write('[]')
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    const rows = await duckAll(conn, sql, ...(params ?? []))
    process.stdout.write(JSON.stringify(rows))
  } finally {
    await closeDuck(db)
  }
}

async function cmdMarketStats(flags: Record<string, string>) {
  const duckPath = flags.duckdb
  if (!duckPath) throw new Error('market-stats 需要 --duckdb')
  if (!fs.existsSync(duckPath)) {
    process.stdout.write(JSON.stringify({
      stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0,
      kline_codes: 0, kline_codes_min60: 0, profiles: 0, etf: 0,
      cn_equity: 0, hk_equity: 0, us_equity: 0,
      announcements: 0, dividends: 0, partners: 0, segments: 0,
      shareholders: 0, forecasts: 0, inst_holdings: 0, insider_trades: 0, buybacks: 0,
    }))
    return
  }
  const db = openDuckDatabase(duckPath, true)
  const conn = connectDuck(db)
  try {
    process.stdout.write(JSON.stringify(await marketDuckStats(conn)))
  } finally {
    await closeDuck(db)
  }
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2))
  try {
    if (cmd === 'import') await cmdImport(flags)
    else if (cmd === 'stats') await cmdStats(flags)
    else if (cmd === 'query-klines') await cmdQueryKlines(flags)
    else if (cmd === 'migrate-from-sqlite') await cmdMigrateFromSqlite(flags)
    else if (cmd === 'codes-with-min') await cmdCodesWithMin(flags)
    else if (cmd === 'latest-bars') await cmdLatestBars(flags)
    else if (cmd === 'upsert') await cmdUpsert(flags)
    else if (cmd === 'sync-bars') await cmdSyncBars(flags)
    else if (cmd === 'sync-analytics') await cmdSyncAnalytics(flags)
    else if (cmd === 'sync-dims') await cmdSyncAnalytics({ ...flags, scope: 'dims' })
    else if (cmd === 'compute-factors') await cmdComputeFactors(flags)
    else if (cmd === 'analytics-stats') await cmdAnalyticsStats(flags)
    else if (cmd === 'query-industry-stats') await cmdQueryIndustryStats(flags)
    else if (cmd === 'query-industry-stocks') await cmdQueryIndustryStocks(flags)
    else if (cmd === 'screen-universe') await cmdScreenUniverse(flags)
    else if (cmd === 'migrate-market-data') await cmdMigrateMarketData(flags)
    else if (cmd === 'sync-market-data-to-sqlite') await cmdSyncMarketDataToSqlite(flags)
    else if (cmd === 'apply-batch') await cmdApplyBatch(flags)
    else if (cmd === 'query-json') await cmdQueryJson(flags)
    else if (cmd === 'market-stats') await cmdMarketStats(flags)
    else throw new Error(`未知命令: ${cmd}`)
  } catch (e) {
    emit({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    process.exit(1)
  }
}

main()
