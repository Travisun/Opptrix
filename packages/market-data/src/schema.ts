/** SQLite schema — analytics-oriented star-ish layout with long factor table. */
export const SCHEMA_VERSION = 9

/**
 * 版本迁移注册表见 `schema-migrate.ts`（MIGRATION_STEPS）。
 * 新增 v10+ 时：在此追加 MIGRATION_V10_SQL，在 MIGRATION_STEPS 注册 up/isApplied，并将 SCHEMA_VERSION +1。
 */

export const MIGRATION_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  message TEXT
);

CREATE TABLE IF NOT EXISTS sync_cursor (
  job_name TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_trade_date TEXT,
  meta_json TEXT
);

CREATE TABLE IF NOT EXISTS stocks (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT,
  industry TEXT,
  industry_csrc TEXT,
  listing_date TEXT,
  is_st INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stocks_industry ON stocks(industry);
CREATE INDEX IF NOT EXISTS idx_stocks_status ON stocks(status);

CREATE TABLE IF NOT EXISTS stock_profiles (
  code TEXT PRIMARY KEY,
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
  FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_financials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  report_type TEXT,
  revenue REAL,
  net_profit REAL,
  roe REAL,
  gross_margin REAL,
  debt_ratio REAL,
  eps REAL,
  bps REAL,
  revenue_yoy REAL,
  net_profit_yoy REAL,
  synced_at TEXT NOT NULL,
  UNIQUE(code, report_date, report_type)
);

CREATE INDEX IF NOT EXISTS idx_financials_code ON stock_financials(code, report_date DESC);

CREATE TABLE IF NOT EXISTS stock_business_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  report_date TEXT,
  segment_name TEXT NOT NULL,
  segment_type TEXT,
  revenue REAL,
  revenue_pct REAL,
  gross_margin REAL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_segments_code ON stock_business_segments(code);

CREATE TABLE IF NOT EXISTS stock_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  direction TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  amount REAL,
  ratio REAL,
  report_date TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partners_code ON stock_partners(code, direction);

CREATE TABLE IF NOT EXISTS stock_quotes_daily (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  close REAL,
  pe REAL,
  pb REAL,
  market_cap REAL,
  turnover_rate REAL,
  volume_ratio REAL,
  change_pct REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_quotes_date ON stock_quotes_daily(trade_date);

CREATE TABLE IF NOT EXISTS stock_factors (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  factor_name TEXT NOT NULL,
  factor_value REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, code, factor_name)
);

CREATE INDEX IF NOT EXISTS idx_factors_filter ON stock_factors(trade_date, factor_name, factor_value);
CREATE INDEX IF NOT EXISTS idx_factors_code ON stock_factors(code, trade_date);

CREATE TABLE IF NOT EXISTS stock_scores (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  scorecard TEXT NOT NULL,
  total_score REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, code, scorecard)
);

CREATE INDEX IF NOT EXISTS idx_scores_date ON stock_scores(trade_date, total_score DESC);

CREATE TABLE IF NOT EXISTS industry_stats (
  trade_date TEXT NOT NULL,
  industry TEXT NOT NULL,
  stock_count INTEGER NOT NULL,
  avg_score REAL,
  avg_pe REAL,
  avg_pb REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, industry)
);

CREATE TABLE IF NOT EXISTS sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  job_name TEXT NOT NULL,
  code TEXT,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS v_stock_latest AS
SELECT
  s.code,
  s.name,
  s.market,
  s.industry,
  s.is_st,
  s.status,
  q.trade_date,
  q.close,
  q.pe,
  q.pb,
  q.market_cap,
  q.change_pct,
  sc.total_score,
  sc.scorecard
FROM stocks s
LEFT JOIN stock_quotes_daily q ON q.code = s.code
  AND q.trade_date = (SELECT MAX(trade_date) FROM stock_quotes_daily)
LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = q.trade_date
  AND sc.scorecard = '综合评估';
`

export const MIGRATION_V2_SQL = `
CREATE TABLE IF NOT EXISTS sync_job_progress (
  job_name TEXT NOT NULL,
  code TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done',
  synced_at TEXT NOT NULL,
  PRIMARY KEY (job_name, code, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_job_progress_job ON sync_job_progress(job_name, status);

CREATE TABLE IF NOT EXISTS stock_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  pub_date TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,
  category TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE(code, pub_date, title)
);

CREATE INDEX IF NOT EXISTS idx_announcements_code ON stock_announcements(code, pub_date DESC);

CREATE TABLE IF NOT EXISTS stock_dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  year TEXT,
  ex_date TEXT,
  record_date TEXT,
  pay_date TEXT,
  cash_bonus REAL,
  stock_bonus REAL,
  plan TEXT,
  progress TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dividends_code ON stock_dividends(code, ex_date DESC);

CREATE TABLE IF NOT EXISTS stock_shareholder_summary (
  code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  shareholder_count REAL,
  shareholder_count_change REAL,
  avg_holding_value REAL,
  hold_focus TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (code, report_date)
);

CREATE TABLE IF NOT EXISTS stock_shareholder_top10 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  rank INTEGER,
  holder_name TEXT NOT NULL,
  shares_held REAL,
  share_pct REAL,
  share_change REAL,
  share_type TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shareholder_top10 ON stock_shareholder_top10(code, report_date);

CREATE TABLE IF NOT EXISTS stock_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  ann_date TEXT,
  forecast_type TEXT,
  summary TEXT,
  profit_lower REAL,
  profit_upper REAL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forecasts_code ON stock_forecasts(code, report_date DESC);

CREATE TABLE IF NOT EXISTS stock_inst_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  institution_type TEXT,
  shares_held REAL,
  share_pct REAL,
  market_value REAL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inst_holdings_code ON stock_inst_holdings(code, report_date DESC);

CREATE TABLE IF NOT EXISTS stock_insider_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  person_name TEXT,
  position TEXT,
  change_type TEXT,
  shares_changed REAL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insider_trades_code ON stock_insider_trades(code, trade_date DESC);

CREATE TABLE IF NOT EXISTS stock_buybacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  ann_date TEXT NOT NULL,
  amount REAL,
  shares REAL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_buybacks_code ON stock_buybacks(code, ann_date DESC);
`

export const MIGRATION_V3_SQL = `
CREATE TABLE IF NOT EXISTS sync_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  current_job TEXT,
  jobs_completed INTEGER DEFAULT 0,
  jobs_total INTEGER DEFAULT 0,
  job_current INTEGER DEFAULT 0,
  job_total INTEGER DEFAULT 0,
  message TEXT
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_session ON sync_logs(session_id, id DESC);
`

export const MIGRATION_V4_SQL = `
CREATE TABLE IF NOT EXISTS stock_klines_daily (
  trade_date TEXT NOT NULL,
  code TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  change_pct REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (trade_date, code)
);

CREATE INDEX IF NOT EXISTS idx_klines_code_date ON stock_klines_daily(code, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_klines_date ON stock_klines_daily(trade_date);
`

export const MIGRATION_V5_SQL = `
CREATE TABLE IF NOT EXISTS instruments (
  code TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  name TEXT,
  exchange TEXT,
  list_date TEXT,
  delist_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  extra TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_instruments_market_class ON instruments(market, asset_class);
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments(code);

CREATE TABLE IF NOT EXISTS etf_profiles (
  code TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etf_nav_daily (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  nav REAL,
  acc_nav REAL,
  change_pct REAL,
  premium_rate REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (code, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_etf_nav_code_date ON etf_nav_daily(code, trade_date DESC);

CREATE TABLE IF NOT EXISTS etf_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  holding_symbol TEXT NOT NULL,
  holding_name TEXT,
  weight REAL,
  shares REAL,
  market_value REAL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_etf_holdings_code ON etf_holdings(code, report_date DESC);
`

/** v6 — instruments/stocks unified views + backfill CN EQUITY */
export const MIGRATION_V6_SQL = `
INSERT OR IGNORE INTO instruments (code, market, asset_class, name, exchange, list_date, status, extra, updated_at)
SELECT
  code,
  'CN',
  'EQUITY',
  name,
  market,
  listing_date,
  status,
  json_object(
    'industry', industry,
    'industry_csrc', industry_csrc,
    'is_st', is_st
  ),
  updated_at
FROM stocks;

CREATE VIEW IF NOT EXISTS v_instruments_unified AS
SELECT code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at
FROM instruments
UNION ALL
SELECT
  s.code,
  'CN' AS market,
  'EQUITY' AS asset_class,
  s.name,
  s.market AS exchange,
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
WHERE NOT EXISTS (SELECT 1 FROM instruments i WHERE i.code = s.code);

CREATE VIEW IF NOT EXISTS v_cn_equity_stocks AS
SELECT
  u.code,
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
`

/** v7 — cross-market bars + taxonomy (initial data layer) */
export const MIGRATION_V7_SQL = `
CREATE TABLE IF NOT EXISTS instrument_bars_daily (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  change_pct REAL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (market, code, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_instrument_bars_market_code
  ON instrument_bars_daily(market, code, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_instrument_bars_date
  ON instrument_bars_daily(trade_date);

CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market TEXT NOT NULL,
  kind TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_code TEXT,
  level INTEGER,
  stock_count INTEGER,
  extra TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE(market, kind, code)
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_market_kind ON taxonomy_nodes(market, kind);

CREATE TABLE IF NOT EXISTS instrument_taxonomy (
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  taxonomy_id INTEGER NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (market, code, taxonomy_id),
  FOREIGN KEY (taxonomy_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_instrument_taxonomy_tax ON instrument_taxonomy(taxonomy_id);

INSERT OR IGNORE INTO instrument_bars_daily (
  market, code, trade_date, open, high, low, close, volume, amount, change_pct, synced_at
)
SELECT
  'CN',
  code,
  trade_date,
  open,
  high,
  low,
  close,
  volume,
  amount,
  change_pct,
  synced_at
FROM stock_klines_daily;
`

/** v8 — instruments composite key (market, exchange, code, asset_class) */
export const MIGRATION_V8_SQL = `
DROP VIEW IF EXISTS v_cn_equity_stocks;
DROP VIEW IF EXISTS v_instruments_unified;

CREATE TABLE instruments_new (
  code TEXT NOT NULL,
  market TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  name TEXT,
  exchange TEXT NOT NULL DEFAULT '',
  list_date TEXT,
  delist_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  extra TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (market, exchange, code, asset_class)
);

INSERT INTO instruments_new (
  code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at
)
SELECT
  code,
  market,
  asset_class,
  name,
  COALESCE(exchange, ''),
  list_date,
  delist_date,
  status,
  extra,
  updated_at
FROM instruments;

DROP TABLE instruments;
ALTER TABLE instruments_new RENAME TO instruments;

CREATE INDEX IF NOT EXISTS idx_instruments_market_class ON instruments(market, asset_class);
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments(code);
CREATE INDEX IF NOT EXISTS idx_instruments_lookup ON instruments(market, code, asset_class);

CREATE VIEW v_instruments_unified AS
SELECT
  code,
  market,
  asset_class,
  name,
  NULLIF(exchange, '') AS exchange,
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
`

/** v8 variant — preserve instrument_ns when v8 re-runs after partial v9 column add */
export const MIGRATION_V8_PRESERVE_NS_SQL = `
DROP VIEW IF EXISTS v_cn_equity_stocks;
DROP VIEW IF EXISTS v_instruments_unified;

CREATE TABLE instruments_new (
  code TEXT NOT NULL,
  market TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  name TEXT,
  exchange TEXT NOT NULL DEFAULT '',
  list_date TEXT,
  delist_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  extra TEXT,
  updated_at TEXT NOT NULL,
  instrument_ns TEXT,
  PRIMARY KEY (market, exchange, code, asset_class)
);

INSERT INTO instruments_new (
  code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at, instrument_ns
)
SELECT
  code,
  market,
  asset_class,
  name,
  COALESCE(exchange, ''),
  list_date,
  delist_date,
  status,
  extra,
  updated_at,
  instrument_ns
FROM instruments;

DROP TABLE instruments;
ALTER TABLE instruments_new RENAME TO instruments;

CREATE INDEX IF NOT EXISTS idx_instruments_market_class ON instruments(market, asset_class);
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments(code);
CREATE INDEX IF NOT EXISTS idx_instruments_lookup ON instruments(market, code, asset_class);

CREATE VIEW v_instruments_unified AS
SELECT
  code,
  market,
  asset_class,
  name,
  NULLIF(exchange, '') AS exchange,
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
`

/** v9 — instrument_ns on instruments + CN stock child tables; stock_profiles FK → instruments(instrument_ns) */
export const MIGRATION_V9_SQL = `
ALTER TABLE instruments ADD COLUMN instrument_ns TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_ns ON instruments(instrument_ns);

ALTER TABLE stock_financials ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_business_segments ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_partners ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_quotes_daily ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_factors ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_scores ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_klines_daily ADD COLUMN instrument_ns TEXT;
ALTER TABLE sync_job_progress ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_announcements ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_dividends ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_shareholder_summary ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_shareholder_top10 ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_forecasts ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_inst_holdings ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_insider_trades ADD COLUMN instrument_ns TEXT;
ALTER TABLE stock_buybacks ADD COLUMN instrument_ns TEXT;

CREATE INDEX IF NOT EXISTS idx_financials_instrument_ns ON stock_financials(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_segments_instrument_ns ON stock_business_segments(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_partners_instrument_ns ON stock_partners(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_quotes_instrument_ns ON stock_quotes_daily(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_factors_instrument_ns ON stock_factors(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_scores_instrument_ns ON stock_scores(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_klines_instrument_ns ON stock_klines_daily(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_job_progress_instrument_ns ON sync_job_progress(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_announcements_instrument_ns ON stock_announcements(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_dividends_instrument_ns ON stock_dividends(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_shareholder_summary_ns ON stock_shareholder_summary(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_shareholder_top10_ns ON stock_shareholder_top10(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_forecasts_instrument_ns ON stock_forecasts(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_inst_holdings_ns ON stock_inst_holdings(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_insider_trades_ns ON stock_insider_trades(instrument_ns);
CREATE INDEX IF NOT EXISTS idx_buybacks_instrument_ns ON stock_buybacks(instrument_ns);
`
