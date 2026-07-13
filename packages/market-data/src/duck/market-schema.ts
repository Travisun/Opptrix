/**
 * DuckDB 市场数据层 — 个股/ETF/行情/因子等全量表 + 分析视图。
 * SQLite market.db 仅保留 sync 控制面；读写均走 DuckDB。
 */

export const CN_DAILY_TABLE = 'cn_daily_bars'

/** 物理表 — 与 SQLite 市场表结构对齐（类型 DuckDB 化） */
export const MARKET_PHYSICAL_SQL = `
CREATE TABLE IF NOT EXISTS stocks (
  code VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  market VARCHAR,
  industry VARCHAR,
  industry_csrc VARCHAR,
  listing_date VARCHAR,
  is_st BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR NOT NULL DEFAULT 'active',
  updated_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS instruments (
  market VARCHAR NOT NULL,
  exchange VARCHAR NOT NULL DEFAULT '',
  code VARCHAR NOT NULL,
  asset_class VARCHAR NOT NULL,
  name VARCHAR,
  instrument_ns VARCHAR,
  list_date VARCHAR,
  delist_date VARCHAR,
  status VARCHAR,
  extra VARCHAR,
  updated_at VARCHAR NOT NULL,
  PRIMARY KEY (market, exchange, code, asset_class)
);

CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  id INTEGER PRIMARY KEY,
  market VARCHAR NOT NULL,
  kind VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  name VARCHAR,
  parent_code VARCHAR,
  level INTEGER,
  stock_count INTEGER,
  extra VARCHAR,
  synced_at VARCHAR
);

CREATE TABLE IF NOT EXISTS instrument_taxonomy (
  market VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  taxonomy_id INTEGER NOT NULL,
  synced_at VARCHAR NOT NULL,
  PRIMARY KEY (market, code, taxonomy_id)
);

CREATE TABLE IF NOT EXISTS stock_profiles (
  code VARCHAR PRIMARY KEY,
  instrument_ns VARCHAR,
  org_name VARCHAR,
  province VARCHAR,
  city VARCHAR,
  employees INTEGER,
  main_business VARCHAR,
  org_profile VARCHAR,
  business_scope VARCHAR,
  website VARCHAR,
  chairman VARCHAR,
  total_market_cap DOUBLE,
  circulating_market_cap DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_financials (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  report_date VARCHAR NOT NULL,
  report_type VARCHAR,
  revenue DOUBLE,
  net_profit DOUBLE,
  roe DOUBLE,
  gross_margin DOUBLE,
  debt_ratio DOUBLE,
  eps DOUBLE,
  bps DOUBLE,
  revenue_yoy DOUBLE,
  net_profit_yoy DOUBLE,
  synced_at VARCHAR NOT NULL,
  UNIQUE(code, report_date, report_type)
);

CREATE TABLE IF NOT EXISTS stock_business_segments (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  report_date VARCHAR,
  segment_name VARCHAR NOT NULL,
  segment_type VARCHAR,
  revenue DOUBLE,
  revenue_pct DOUBLE,
  gross_margin DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_partners (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  direction VARCHAR NOT NULL,
  partner_name VARCHAR NOT NULL,
  amount DOUBLE,
  ratio DOUBLE,
  report_date VARCHAR,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_quotes_daily (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  close DOUBLE,
  pe DOUBLE,
  pb DOUBLE,
  market_cap DOUBLE,
  turnover_rate DOUBLE,
  volume_ratio DOUBLE,
  change_pct DOUBLE,
  synced_at VARCHAR NOT NULL,
  PRIMARY KEY (trade_date, code)
);

CREATE TABLE IF NOT EXISTS stock_factors (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  factor_name VARCHAR NOT NULL,
  factor_value DOUBLE,
  synced_at VARCHAR,
  PRIMARY KEY (trade_date, code, factor_name)
);

CREATE TABLE IF NOT EXISTS stock_scores (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  scorecard VARCHAR NOT NULL,
  total_score DOUBLE,
  synced_at VARCHAR,
  PRIMARY KEY (trade_date, code, scorecard)
);

CREATE TABLE IF NOT EXISTS industry_stats (
  trade_date VARCHAR NOT NULL,
  industry VARCHAR NOT NULL,
  stock_count INTEGER,
  avg_score DOUBLE,
  avg_pe DOUBLE,
  avg_pb DOUBLE,
  synced_at VARCHAR,
  PRIMARY KEY (trade_date, industry)
);

CREATE TABLE IF NOT EXISTS stock_announcements (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  pub_date VARCHAR,
  title VARCHAR,
  url VARCHAR,
  source VARCHAR,
  category VARCHAR,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_dividends (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  year VARCHAR,
  cash_bonus DOUBLE,
  ex_date VARCHAR,
  record_date VARCHAR,
  pay_date VARCHAR,
  plan VARCHAR,
  progress VARCHAR,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_shareholder_summary (
  code VARCHAR PRIMARY KEY,
  instrument_ns VARCHAR,
  report_date VARCHAR,
  holder_count INTEGER,
  avg_holdings DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_shareholder_top10 (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  report_date VARCHAR,
  rank INTEGER,
  holder_name VARCHAR,
  hold_amount DOUBLE,
  hold_ratio DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_forecasts (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  report_date VARCHAR,
  forecast_type VARCHAR,
  content VARCHAR,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_inst_holdings (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  report_date VARCHAR,
  inst_name VARCHAR,
  hold_amount DOUBLE,
  hold_ratio DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_insider_trades (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  trade_date VARCHAR,
  insider_name VARCHAR,
  trade_type VARCHAR,
  shares DOUBLE,
  price DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_buybacks (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  instrument_ns VARCHAR,
  ann_date VARCHAR,
  amount DOUBLE,
  shares DOUBLE,
  synced_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS instrument_bars_daily (
  market VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  trade_date VARCHAR NOT NULL,
  open DOUBLE,
  high DOUBLE,
  low DOUBLE,
  close DOUBLE,
  volume DOUBLE,
  amount DOUBLE,
  change_pct DOUBLE,
  synced_at VARCHAR NOT NULL,
  PRIMARY KEY (market, code, trade_date)
);

CREATE TABLE IF NOT EXISTS etf_profiles (
  code VARCHAR PRIMARY KEY,
  profile_json VARCHAR NOT NULL,
  updated_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS etf_nav_daily (
  code VARCHAR NOT NULL,
  trade_date VARCHAR NOT NULL,
  nav DOUBLE,
  acc_nav DOUBLE,
  change_pct DOUBLE,
  premium_rate DOUBLE,
  synced_at VARCHAR NOT NULL,
  PRIMARY KEY (code, trade_date)
);

CREATE TABLE IF NOT EXISTS etf_holdings (
  id INTEGER PRIMARY KEY,
  code VARCHAR NOT NULL,
  report_date VARCHAR NOT NULL,
  holding_symbol VARCHAR,
  holding_name VARCHAR,
  weight DOUBLE,
  shares DOUBLE,
  market_value DOUBLE,
  synced_at VARCHAR NOT NULL
);
`

/** 分析视图 — 与 analytics/duck-query 兼容；升级时先 DROP 旧物理 dim/fact 表 */
export const MARKET_VIEWS_SQL = `
DROP TABLE IF EXISTS dim_cn_stocks;
DROP TABLE IF EXISTS dim_instruments;
DROP TABLE IF EXISTS dim_taxonomy;
DROP TABLE IF EXISTS bridge_instrument_taxonomy;
DROP TABLE IF EXISTS fact_quotes_daily;
DROP TABLE IF EXISTS fact_factors;
DROP TABLE IF EXISTS fact_scores;
DROP TABLE IF EXISTS dim_financials_latest;

CREATE OR REPLACE VIEW dim_cn_stocks AS
  SELECT code, name, market, industry, industry_csrc, listing_date,
         is_st, status, updated_at
  FROM stocks;

CREATE OR REPLACE VIEW dim_instruments AS
  SELECT market, exchange, code, asset_class, name, instrument_ns,
         list_date, status, updated_at
  FROM instruments;

CREATE OR REPLACE VIEW dim_taxonomy AS
  SELECT id, market, kind, code, name, parent_code, level, stock_count, synced_at
  FROM taxonomy_nodes;

CREATE OR REPLACE VIEW bridge_instrument_taxonomy AS
  SELECT it.market, it.code, it.taxonomy_id, tn.kind AS taxonomy_kind, tn.name AS taxonomy_name, it.synced_at
  FROM instrument_taxonomy it
  INNER JOIN taxonomy_nodes tn ON tn.id = it.taxonomy_id;

CREATE OR REPLACE VIEW fact_quotes_daily AS
  SELECT trade_date, code, close, change_pct, pe, pb, market_cap, synced_at
  FROM stock_quotes_daily;

CREATE OR REPLACE VIEW fact_factors AS
  SELECT trade_date, code, factor_name, factor_value
  FROM stock_factors;

CREATE OR REPLACE VIEW fact_scores AS
  SELECT trade_date, code, scorecard, total_score
  FROM stock_scores;

CREATE OR REPLACE VIEW dim_financials_latest AS
  SELECT code, report_date, roe, gross_margin, debt_ratio, net_profit_yoy, net_profit, synced_at
  FROM (
    SELECT code, report_date, roe, gross_margin, debt_ratio, net_profit_yoy, net_profit, synced_at,
      ROW_NUMBER() OVER (PARTITION BY code ORDER BY report_date DESC) AS rn
    FROM stock_financials
    WHERE report_type IS NULL OR report_type = 'annual'
  ) t WHERE rn = 1;

CREATE OR REPLACE VIEW v_cn_equity_stocks AS
  SELECT s.code, s.name, s.market, s.industry, s.industry_csrc, s.listing_date,
         s.is_st, s.status, s.updated_at,
         i.instrument_ns, i.exchange
  FROM stocks s
  LEFT JOIN instruments i
    ON i.market = 'CN' AND i.asset_class = 'EQUITY' AND i.code = s.code
    AND (i.exchange = COALESCE(s.market, '') OR s.market IS NULL OR s.market = '');

CREATE OR REPLACE VIEW v_instruments_unified AS
  SELECT i.market, i.exchange, i.code, i.asset_class, i.name, i.instrument_ns,
         i.list_date, i.status, i.updated_at
  FROM instruments i
  UNION ALL
  SELECT 'CN' AS market, COALESCE(s.market, '') AS exchange, s.code, 'EQUITY' AS asset_class,
         s.name, NULL AS instrument_ns, s.listing_date AS list_date, s.status, s.updated_at
  FROM stocks s
  WHERE NOT EXISTS (
    SELECT 1 FROM instruments ix
    WHERE ix.market = 'CN' AND ix.asset_class = 'EQUITY' AND ix.code = s.code
  );

CREATE OR REPLACE VIEW v_stock_latest AS
  SELECT
    s.code, s.name, s.industry, s.market, s.status,
    sc.total_score, sc.scorecard, sc.trade_date AS score_date,
    q.trade_date AS quote_date, q.close, q.pe, q.pb, q.market_cap, q.change_pct
  FROM stocks s
  LEFT JOIN stock_scores sc ON sc.code = s.code
    AND sc.trade_date = (SELECT MAX(trade_date) FROM stock_scores WHERE code = s.code)
    AND sc.scorecard = '综合评估'
  LEFT JOIN stock_quotes_daily q ON q.code = s.code
    AND q.trade_date = (SELECT MAX(trade_date) FROM stock_quotes_daily WHERE code = s.code);
`

export const MARKET_DUCK_INIT_SQL = `
CREATE TABLE IF NOT EXISTS ${CN_DAILY_TABLE} (
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
${MARKET_PHYSICAL_SQL}
${MARKET_VIEWS_SQL}
`

/** SQLite → DuckDB 一次性迁移的表（按依赖顺序） */
export const MARKET_MIGRATE_TABLES = [
  'stocks',
  'instruments',
  'taxonomy_nodes',
  'instrument_taxonomy',
  'stock_profiles',
  'stock_financials',
  'stock_business_segments',
  'stock_partners',
  'stock_quotes_daily',
  'stock_factors',
  'stock_scores',
  'industry_stats',
  'stock_announcements',
  'stock_dividends',
  'stock_shareholder_summary',
  'stock_shareholder_top10',
  'stock_forecasts',
  'stock_inst_holdings',
  'stock_insider_trades',
  'stock_buybacks',
  'instrument_bars_daily',
  'etf_profiles',
  'etf_nav_daily',
  'etf_holdings',
  CN_DAILY_TABLE,
] as const
