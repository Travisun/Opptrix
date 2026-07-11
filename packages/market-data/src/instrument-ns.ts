import type Database from 'better-sqlite3'
import type { AssetClass, InstrumentRef, Market } from '@opptrix/shared'
import {
  buildInstrumentNamespace,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
} from '@opptrix/shared'
import { normalizeInstrumentExchange, normalizeStockCode } from './utils.js'

/** 子表需回填 instrument_ns 的 CN 股票维度表（不含 instruments 自身） */
export const CN_STOCK_CHILD_TABLES = [
  'stock_financials',
  'stock_business_segments',
  'stock_partners',
  'stock_quotes_daily',
  'stock_factors',
  'stock_scores',
  'stock_klines_daily',
  'sync_job_progress',
  'stock_announcements',
  'stock_dividends',
  'stock_shareholder_summary',
  'stock_shareholder_top10',
  'stock_forecasts',
  'stock_inst_holdings',
  'stock_insider_trades',
  'stock_buybacks',
] as const

export function instrumentRefToNs(ref: InstrumentRef): string {
  return buildInstrumentNamespace(normalizeInstrumentRef(ref))
}

export function cnEquityNs(code: string, exchange?: string | null): string {
  return instrumentRefToNs({
    market: 'CN',
    assetClass: 'EQUITY',
    symbol: normalizeStockCode(code),
    exchange: exchange?.trim() ? exchange : undefined,
  })
}

/** 解析裸码或命名空间输入 */
export function resolveCodeOrNsInput(raw: string): { code: string; instrumentNs: string | null } {
  const text = raw.trim()
  const parsed = parseInstrumentNamespace(text)
  if (parsed) {
    return {
      code: normalizeStockCode(parsed.symbol),
      instrumentNs: buildInstrumentNamespace(parsed),
    }
  }
  return { code: normalizeStockCode(text), instrumentNs: null }
}

function instrumentNsFromRow(row: {
  market: string
  asset_class: string
  code: string
  exchange: string
  extra?: string | null
}): string {
  const ref: InstrumentRef = {
    market: row.market as Market,
    assetClass: row.asset_class as AssetClass,
    symbol: row.market === 'CN' ? normalizeStockCode(row.code) : row.code,
    exchange: row.exchange ? row.exchange : undefined,
  }
  if (row.market === 'CRYPTO' && row.extra) {
    try {
      const extra = JSON.parse(row.extra) as { quote?: string; exchange?: string }
      if (extra.quote) ref.quote = extra.quote
      if (extra.exchange) ref.exchange = extra.exchange
    } catch { /* ignore */ }
  }
  return instrumentRefToNs(ref)
}

export function hasInstrumentNsColumn(db: Database.Database): boolean {
  const cols = db.prepare('PRAGMA table_info(instruments)').all() as { name: string }[]
  return cols.some(c => c.name === 'instrument_ns')
}

/** 为 instruments 行计算并写入 instrument_ns（幂等） */
export function backfillInstrumentsNs(db: Database.Database): number {
  if (!hasInstrumentNsColumn(db)) return 0
  const rows = db.prepare(`
    SELECT code, market, asset_class, exchange, extra, instrument_ns
    FROM instruments
  `).all() as {
    code: string
    market: string
    asset_class: string
    exchange: string
    extra: string | null
    instrument_ns: string | null
  }[]
  const upd = db.prepare('UPDATE instruments SET instrument_ns = ? WHERE market = ? AND exchange = ? AND code = ? AND asset_class = ?')
  let n = 0
  for (const row of rows) {
    const ns = instrumentNsFromRow(row)
    if (row.instrument_ns === ns) continue
    upd.run(ns, row.market, normalizeInstrumentExchange(row.exchange), row.code, row.asset_class)
    n++
  }
  return n
}

/** 从 instruments + stocks 回填子表 instrument_ns */
export function backfillChildTableNs(db: Database.Database, table: string): number {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some(c => c.name === 'instrument_ns')) return 0
  const r = db.prepare(`
    UPDATE ${table}
    SET instrument_ns = (
      SELECT i.instrument_ns
      FROM instruments i
      LEFT JOIN stocks s ON s.code = ${table}.code
      WHERE i.market = 'CN'
        AND i.asset_class = 'EQUITY'
        AND i.code = ${table}.code
        AND i.instrument_ns IS NOT NULL
        AND (
          s.code IS NULL
          OR i.exchange = COALESCE(NULLIF(TRIM(s.market), ''), i.exchange)
          OR (SELECT COUNT(*) FROM instruments ix
              WHERE ix.market = 'CN' AND ix.asset_class = 'EQUITY' AND ix.code = ${table}.code) = 1
        )
      ORDER BY
        CASE WHEN s.code IS NOT NULL AND i.exchange = COALESCE(NULLIF(TRIM(s.market), ''), i.exchange) THEN 0 ELSE 1 END
      LIMIT 1
    )
    WHERE instrument_ns IS NULL AND code IS NOT NULL
  `).run()
  return r.changes
}

export function stockProfilesUsesInstrumentNs(db: Database.Database): boolean {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'stock_profiles'",
  ).get() as { sql: string } | undefined
  return Boolean(row?.sql?.includes('instrument_ns'))
}

/** 将 stock_profiles 从 code FK 迁移为 instrument_ns FK（幂等） */
export function migrateStockProfilesToInstrumentNs(db: Database.Database): void {
  if (!hasInstrumentNsColumn(db)) return
  if (stockProfilesUsesInstrumentNs(db)) return

  db.exec('PRAGMA foreign_keys = OFF')
  db.exec(`
    CREATE TABLE stock_profiles_v9 (
      instrument_ns TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      org_name TEXT,
      province TEXT,
      city TEXT,
      employees INTEGER,
      main_business TEXT,
      org_profile TEXT,
      business_scope TEXT,
      website TEXT,
      chairman TEXT,
      total_market_cap REAL,
      circulating_market_cap REAL,
      synced_at TEXT NOT NULL,
      FOREIGN KEY (instrument_ns) REFERENCES instruments(instrument_ns) ON DELETE CASCADE
    );
  `)

  const legacy = db.prepare('SELECT * FROM stock_profiles').all() as Record<string, unknown>[]
  const ins = db.prepare(`
    INSERT INTO stock_profiles_v9 (
      instrument_ns, code, org_name, province, city, employees, main_business, org_profile,
      business_scope, website, chairman, total_market_cap, circulating_market_cap, synced_at
    ) VALUES (
      @instrument_ns, @code, @org_name, @province, @city, @employees, @main_business, @org_profile,
      @business_scope, @website, @chairman, @total_market_cap, @circulating_market_cap, @synced_at
    )
  `)

  for (const row of legacy) {
    const code = normalizeStockCode(String(row.code ?? ''))
    if (!code) continue
    const match = db.prepare(`
      SELECT i.instrument_ns
      FROM instruments i
      LEFT JOIN stocks s ON s.code = i.code
      WHERE i.market = 'CN' AND i.asset_class = 'EQUITY' AND i.code = ?
        AND i.instrument_ns IS NOT NULL
      ORDER BY
        CASE WHEN s.code IS NOT NULL AND i.exchange = COALESCE(NULLIF(TRIM(s.market), ''), i.exchange) THEN 0 ELSE 1 END
      LIMIT 1
    `).get(code) as { instrument_ns: string } | undefined
    const instrumentNs = match?.instrument_ns ?? cnEquityNs(code, null)
    ins.run({
      instrument_ns: instrumentNs,
      code,
      org_name: row.org_name ?? null,
      province: row.province ?? null,
      city: row.city ?? null,
      employees: row.employees ?? null,
      main_business: row.main_business ?? null,
      org_profile: row.org_profile ?? null,
      business_scope: row.business_scope ?? null,
      website: row.website ?? null,
      chairman: row.chairman ?? null,
      total_market_cap: row.total_market_cap ?? null,
      circulating_market_cap: row.circulating_market_cap ?? null,
      synced_at: row.synced_at ?? new Date().toISOString(),
    })
  }

  db.exec('DROP TABLE stock_profiles')
  db.exec('ALTER TABLE stock_profiles_v9 RENAME TO stock_profiles')
  db.exec('PRAGMA foreign_keys = ON')
}

export function refreshInstrumentViews(db: Database.Database): void {
  db.exec(`
    DROP VIEW IF EXISTS v_cn_equity_stocks;
    DROP VIEW IF EXISTS v_instruments_unified;

    CREATE VIEW v_instruments_unified AS
    SELECT
      code,
      market,
      asset_class,
      name,
      NULLIF(exchange, '') AS exchange,
      instrument_ns,
      list_date,
      delist_date,
      status,
      extra,
      updated_at
    FROM instruments
    UNION ALL
    SELECT
      s.code,
      'CN' AS market,
      'EQUITY' AS asset_class,
      s.name,
      s.market AS exchange,
      NULL AS instrument_ns,
      s.listing_date AS list_date,
      NULL AS delist_date,
      s.status,
      json_object(
        'industry', s.industry,
        'industry_csrc', s.industry_csrc,
        'is_st', s.is_st
      ) AS extra,
      s.updated_at
    FROM stocks s
    WHERE NOT EXISTS (
      SELECT 1 FROM instruments i
      WHERE i.code = s.code
        AND i.market = 'CN'
        AND i.asset_class = 'EQUITY'
        AND i.exchange = COALESCE(s.market, '')
    );

    CREATE VIEW v_cn_equity_stocks AS
    SELECT
      u.code,
      u.instrument_ns,
      u.name,
      u.exchange AS market,
      json_extract(u.extra, '$.industry') AS industry,
      json_extract(u.extra, '$.industry_csrc') AS industry_csrc,
      u.list_date AS listing_date,
      CAST(COALESCE(json_extract(u.extra, '$.is_st'), 0) AS INTEGER) AS is_st,
      u.status,
      u.updated_at
    FROM v_instruments_unified u
    WHERE u.market = 'CN' AND u.asset_class = 'EQUITY';
  `)
}

/** v9 数据回填 — 启动时幂等执行 */
export function runInstrumentNsBackfill(db: Database.Database): void {
  if (!hasInstrumentNsColumn(db)) return
  backfillInstrumentsNs(db)
  for (const table of CN_STOCK_CHILD_TABLES) {
    backfillChildTableNs(db, table)
  }
  migrateStockProfilesToInstrumentNs(db)
  refreshInstrumentViews(db)
}
