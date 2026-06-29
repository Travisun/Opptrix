/** SQLite schema — analytics-oriented star-ish layout with long factor table. */
export const SCHEMA_VERSION = 4

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
