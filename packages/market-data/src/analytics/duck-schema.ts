/** DuckDB 分析层表结构 — 与 SQLite market.db 元数据协同 */

export const CN_DAILY_TABLE = 'cn_daily_bars'

export const ANALYTICS_INIT_SQL = `
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

CREATE TABLE IF NOT EXISTS dim_cn_stocks (
  code VARCHAR PRIMARY KEY,
  name VARCHAR,
  market VARCHAR,
  industry VARCHAR,
  industry_csrc VARCHAR,
  listing_date VARCHAR,
  is_st BOOLEAN,
  status VARCHAR,
  updated_at VARCHAR
);

CREATE TABLE IF NOT EXISTS dim_instruments (
  market VARCHAR NOT NULL,
  exchange VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  asset_class VARCHAR NOT NULL,
  name VARCHAR,
  instrument_ns VARCHAR,
  list_date VARCHAR,
  status VARCHAR,
  updated_at VARCHAR,
  PRIMARY KEY (market, exchange, code, asset_class)
);

CREATE TABLE IF NOT EXISTS dim_taxonomy (
  id INTEGER PRIMARY KEY,
  market VARCHAR NOT NULL,
  kind VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  name VARCHAR,
  parent_code VARCHAR,
  level INTEGER,
  stock_count INTEGER,
  synced_at VARCHAR
);

CREATE TABLE IF NOT EXISTS bridge_instrument_taxonomy (
  market VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  taxonomy_id INTEGER NOT NULL,
  taxonomy_kind VARCHAR,
  taxonomy_name VARCHAR,
  synced_at VARCHAR
);

CREATE TABLE IF NOT EXISTS fact_quotes_daily (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  close DOUBLE,
  change_pct DOUBLE,
  pe DOUBLE,
  pb DOUBLE,
  market_cap DOUBLE,
  synced_at VARCHAR,
  PRIMARY KEY (trade_date, code)
);

CREATE TABLE IF NOT EXISTS fact_factors (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  factor_name VARCHAR NOT NULL,
  factor_value DOUBLE,
  PRIMARY KEY (trade_date, code, factor_name)
);

CREATE TABLE IF NOT EXISTS fact_scores (
  trade_date VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  scorecard VARCHAR NOT NULL,
  total_score DOUBLE,
  PRIMARY KEY (trade_date, code, scorecard)
);

CREATE TABLE IF NOT EXISTS dim_financials_latest (
  code VARCHAR PRIMARY KEY,
  report_date VARCHAR,
  roe DOUBLE,
  gross_margin DOUBLE,
  debt_ratio DOUBLE,
  net_profit_yoy DOUBLE,
  net_profit DOUBLE,
  synced_at VARCHAR
);
`
