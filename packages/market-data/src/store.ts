import Database from 'better-sqlite3'
import { parseStockMarket, type StockMarket, normalizeUsSymbol } from '@opptrix/a-stock-layer'
import { marketDbPath } from './paths.js'
import {
  migrate,
  nowIso,
  todayTradeDate,
  daysSince,
  normalizeStockCode,
  normalizeInstrumentExchange,
} from './utils.js'
import {
  cnEquityNs,
  instrumentRefToNs,
  resolveCodeOrNsInput,
  stockProfilesUsesInstrumentNs,
} from './instrument-ns.js'
import type { InstrumentRef } from '@opptrix/shared'
import { normalizeInstrumentRef } from '@opptrix/shared'

export interface JobProgressSummary {
  done: number
  error: number
  pending: number
}

export interface MarketDbStatus {
  db_path: string
  schema_version: number
  stock_count: number
  etf_count: number
  us_count: number
  crypto_count: number
  jp_count: number
  kr_count: number
  hk_count: number
  latest_trade_date: string | null
  latest_factor_date: string | null
  kline_dates: Record<string, string | null>
  profile_count: number
  partner_count: number
  segment_count: number
  announcement_count: number
  dividend_count: number
  shareholder_count: number
  forecast_count: number
  inst_holding_count: number
  insider_trade_count: number
  buyback_count: number
  last_sync: Record<string, string | null>
  job_progress: Record<string, JobProgressSummary>
  is_ready: boolean
  bootstrap: BootstrapReadiness
}

export interface BootstrapReadiness {
  ready: boolean
  /** A 股股票名录 */
  initial_cn: boolean
  initial_hk: boolean
  initial_us: boolean
  initial_cn_etf: boolean
  initial_taxonomy: boolean
  /** @deprecated 等同 initial_cn */
  universe: boolean
  /** @deprecated 本地 K 线层已停用 */
  quotes: boolean
  klines: boolean
  fundamentals: boolean
  screen_factors: boolean
  quote_stock_ratio: number
  /** 至少 60 根日 K 的覆盖率（历史深度） */
  kline_stock_ratio: number
  /** 有任何日 K 的覆盖率（增量/近期） */
  kline_recent_ratio: number
  fin_stock_ratio: number
  factor_stock_ratio: number
  kline_cross_market: boolean
}

export class MarketDataStore {
  readonly db: Database.Database
  readonly dbPath: string

  constructor(dbPath = marketDbPath()) {
    this.dbPath = dbPath
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
    migrate(this.db)
  }

  /** 解析 A 股 EQUITY 命名空间 — 优先 instruments 表，回退 stocks.market */
  resolveCnEquityInstrumentNs(code: string, exchange?: string | null): string {
    const { code: bare, instrumentNs } = resolveCodeOrNsInput(code)
    if (instrumentNs) return instrumentNs
    const normalized = normalizeStockCode(bare)
    const ex = normalizeInstrumentExchange(exchange ?? this.stockMarket(normalized) ?? undefined)
    const row = this.db.prepare(`
      SELECT instrument_ns FROM instruments
      WHERE market = 'CN' AND asset_class = 'EQUITY' AND code = ?
        AND (? = '' OR exchange = ?)
        AND instrument_ns IS NOT NULL
      LIMIT 1
    `).get(normalized, ex, ex) as { instrument_ns: string } | undefined
    if (row?.instrument_ns) return row.instrument_ns
    return cnEquityNs(normalized, ex || (this.stockMarket(normalized) ?? undefined))
  }

  private writeInstrumentNs(
    table: string,
    code: string,
    exchange?: string | null,
  ): string | null {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!cols.some(c => c.name === 'instrument_ns')) return null
    return this.resolveCnEquityInstrumentNs(code, exchange)
  }

  close(): void {
    this.db.close()
  }

  beginRun(jobName: string, mode: string): number {
    const started = nowIso()
    const r = this.db.prepare(`
      INSERT INTO sync_runs (job_name, mode, started_at, status)
      VALUES (?, ?, ?, 'running')
    `).run(jobName, mode, started)
    return Number(r.lastInsertRowid)
  }

  finishRun(
    runId: number,
    status: 'success' | 'failed' | 'partial',
    counts: { total: number; success: number; error: number },
    message?: string,
  ): void {
    this.db.prepare(`
      UPDATE sync_runs
      SET finished_at = ?, status = ?, total_count = ?, success_count = ?, error_count = ?, message = ?
      WHERE id = ?
    `).run(nowIso(), status, counts.total, counts.success, counts.error, message ?? null, runId)
  }

  setCursor(jobName: string, meta?: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT INTO sync_cursor (job_name, last_success_at, last_trade_date, meta_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(job_name) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        last_trade_date = excluded.last_trade_date,
        meta_json = excluded.meta_json
    `).run(jobName, nowIso(), todayTradeDate(), meta ? JSON.stringify(meta) : null)
  }

  getCursorLastSuccess(jobName: string): string | null {
    const row = this.db.prepare(
      'SELECT last_success_at FROM sync_cursor WHERE job_name = ?',
    ).get(jobName) as { last_success_at: string | null } | undefined
    return row?.last_success_at ?? null
  }

  clearCursor(jobName: string): void {
    this.db.prepare('DELETE FROM sync_cursor WHERE job_name = ?').run(jobName)
  }

  logError(runId: number | null, jobName: string, code: string | null, error: string): void {
    this.db.prepare(`
      INSERT INTO sync_errors (run_id, job_name, code, error, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, jobName, code, error.slice(0, 500), nowIso())
  }

  getStatus(): MarketDbStatus {
    const stocksTableCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stocks').get() as { c: number }).c
    const cnEquityCount = this.countEquityInstruments('CN')
    // 概览与 bootstrap 门控对齐 instruments；兼容仅 stocks 表有历史数据的库
    const stockCount = Math.max(stocksTableCount, cnEquityCount)
    const etfCount = this.countEtfInstruments()
    const usCount = this.countUsInstruments()
    const cryptoCount = this.countCryptoInstruments()
    const jpCount = this.countRegionalEquityInstruments('JP')
    const krCount = this.countRegionalEquityInstruments('KR')
    const hkCount = this.countRegionalEquityInstruments('HK')
    const profileCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_profiles').get() as { c: number }).c
    const partnerCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_partners').get() as { c: number }).c
    const segmentCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_business_segments').get() as { c: number }).c
    const announcementCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_announcements').get() as { c: number }).c
    const dividendCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_dividends').get() as { c: number }).c
    const shareholderCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_shareholder_summary').get() as { c: number }).c
    const forecastCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_forecasts').get() as { c: number }).c
    const instHoldingCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_inst_holdings').get() as { c: number }).c
    const insiderTradeCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_insider_trades').get() as { c: number }).c
    const buybackCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stock_buybacks').get() as { c: number }).c
    const latestQuote = this.db.prepare('SELECT MAX(trade_date) AS d FROM stock_quotes_daily').get() as { d: string | null }
    const latestFactor = this.db.prepare('SELECT MAX(trade_date) AS d FROM stock_factors').get() as { d: string | null }
    const schemaVersion = (this.db.prepare('SELECT MAX(version) AS v FROM schema_meta').get() as { v: number }).v ?? 0
    const cursors = this.db.prepare('SELECT job_name, last_success_at FROM sync_cursor').all() as {
      job_name: string
      last_success_at: string | null
    }[]
    const lastSync: Record<string, string | null> = {}
    for (const c of cursors) lastSync[c.job_name] = c.last_success_at

    const jobProgress: Record<string, JobProgressSummary> = {}
    const progressRows = this.db.prepare(`
      SELECT job_name,
        COUNT(DISTINCT CASE WHEN status = 'done' THEN code END) AS done,
        COUNT(DISTINCT CASE WHEN status = 'error' THEN code END) AS error
      FROM sync_job_progress
      GROUP BY job_name
    `).all() as { job_name: string; done: number; error: number }[]
    for (const row of progressRows) {
      const etfJobs = new Set(['etf_list', 'etf_nav', 'etf_holdings', 'etf_kline_bootstrap', 'initial_cn_etf'])
      const usJobs = new Set(['us_list'])
      const cryptoJobs = new Set(['crypto_list'])
      const jpJobs = new Set(['jp_list', 'jp_quotes'])
      const krJobs = new Set(['kr_list', 'kr_quotes'])
      const hkJobs = new Set(['hk_list', 'hk_quotes'])
      const baseCount = cryptoJobs.has(row.job_name)
        ? cryptoCount
        : usJobs.has(row.job_name)
          ? usCount
          : jpJobs.has(row.job_name)
            ? jpCount
            : krJobs.has(row.job_name)
              ? krCount
              : hkJobs.has(row.job_name)
                ? hkCount
                : etfJobs.has(row.job_name)
                  ? etfCount
                  : stockCount
      jobProgress[row.job_name] = {
        done: row.done,
        error: row.error,
        pending: Math.max(0, baseCount - row.done),
      }
    }

    const activeCount = (this.db.prepare(
      'SELECT COUNT(*) AS c FROM stocks WHERE status = \'active\'',
    ).get() as { c: number }).c
    const bootstrap = this.assessBootstrapReadiness(activeCount, latestQuote.d, latestFactor.d)
    this.enrichThsKlineDumpJobProgress(jobProgress, stockCount, bootstrap, lastSync)

    return {
      db_path: this.db.name,
      schema_version: schemaVersion,
      stock_count: stockCount,
      etf_count: etfCount,
      us_count: usCount,
      crypto_count: cryptoCount,
      jp_count: jpCount,
      kr_count: krCount,
      hk_count: hkCount,
      latest_trade_date: latestQuote.d,
      latest_factor_date: latestFactor.d,
      kline_dates: {
        CN: this.latestKlineDateByMarket('CN'),
        HK: this.latestKlineDateByMarket('HK'),
        US: this.latestKlineDateByMarket('US'),
      },
      profile_count: profileCount,
      partner_count: partnerCount,
      segment_count: segmentCount,
      announcement_count: announcementCount,
      dividend_count: dividendCount,
      shareholder_count: shareholderCount,
      forecast_count: forecastCount,
      inst_holding_count: instHoldingCount,
      insider_trade_count: insiderTradeCount,
      buyback_count: buybackCount,
      last_sync: lastSync,
      job_progress: jobProgress,
      is_ready: bootstrap.ready,
      bootstrap,
    }
  }

  assessBootstrapReadiness(
    stockCount?: number,
    _latestQuoteDate?: string | null,
    _latestFactorDate?: string | null,
  ): BootstrapReadiness {
    const cnEquity = stockCount ?? this.countEquityInstruments('CN')
    const hkEquity = this.countEquityInstruments('HK')
    const usEquity = this.countEquityInstruments('US')
    const etfCount = this.listEtfCodes(true).length

    const initial_cn = cnEquity > 1000
    const initial_hk = hkEquity > 100
    const initial_us = usEquity > 500
    const initial_cn_etf = etfCount > 50
    const initial_taxonomy = this.countTaxonomyNodes('CN', 'industry') >= 5

    const klineWithMin = this.listCodesWithMinKlines(60).length
    const klineRecent = this.countDistinctKlineCodes()
    const kline_stock_ratio = cnEquity > 0
      ? Math.round((klineWithMin / cnEquity) * 1000) / 10
      : 0
    const kline_recent_ratio = cnEquity > 0
      ? Math.round((klineRecent / cnEquity) * 1000) / 10
      : 0
    const klines = kline_stock_ratio >= 95

    const ready = initial_cn && initial_taxonomy && klines

    return {
      ready,
      initial_cn,
      initial_hk,
      initial_us,
      initial_cn_etf,
      initial_taxonomy,
      universe: initial_cn,
      quotes: false,
      klines,
      fundamentals: false,
      screen_factors: false,
      quote_stock_ratio: 0,
      kline_stock_ratio,
      kline_recent_ratio,
      fin_stock_ratio: 0,
      factor_stock_ratio: 0,
      kline_cross_market: false,
    }
  }

  /** @deprecated 本地因子层已停用 */
  screenFactorsStale(_tradeDate = todayTradeDate()): boolean {
    return false
  }

  industryStatsStale(tradeDate = todayTradeDate()): boolean {
    const last = this.getCursorLastSuccess('industry_stats')
    if (!last) return true
    if (daysSince(last) >= 1) return true
    const factorCursor = this.getCursorLastSuccess('screen_factors')
    if (factorCursor && new Date(factorCursor).getTime() > new Date(last).getTime()) return true
    const meta = this.getCursorMeta('industry_stats')
    const metaDate = meta?.trade_date != null ? String(meta.trade_date) : ''
    return metaDate !== tradeDate
  }

  getCursorMeta(jobName: string): Record<string, unknown> | null {
    const row = this.db.prepare(
      'SELECT meta_json FROM sync_cursor WHERE job_name = ?',
    ).get(jobName) as { meta_json: string | null } | undefined
    if (!row?.meta_json) return null
    try {
      return JSON.parse(row.meta_json) as Record<string, unknown>
    } catch {
      return null
    }
  }

  bulkUpsertKlines(
    rows: Array<{
      tradeDate: string
      code: string
      open?: number | null
      high?: number | null
      low?: number | null
      close?: number | null
      volume?: number | null
      amount?: number | null
      changePct?: number | null
    }>,
    onBatch?: (done: number, total: number) => void,
  ): number {
    if (!rows.length) return 0
    const ts = nowIso()
    const total = rows.length
    const stmt = this.db.prepare(`
      INSERT INTO stock_klines_daily (
        trade_date, code, instrument_ns, open, high, low, close, volume, amount, change_pct, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trade_date, code) DO UPDATE SET
        instrument_ns = COALESCE(excluded.instrument_ns, stock_klines_daily.instrument_ns),
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        amount = excluded.amount,
        change_pct = excluded.change_pct,
        synced_at = excluded.synced_at
    `)
    const tx = this.db.transaction((batch: typeof rows) => {
      for (const r of batch) {
        const normalized = normalizeStockCode(resolveCodeOrNsInput(r.code).code)
        const instrumentNs = this.writeInstrumentNs('stock_klines_daily', normalized)
        stmt.run(
          r.tradeDate,
          normalized,
          instrumentNs,
          r.open ?? null,
          r.high ?? null,
          r.low ?? null,
          r.close ?? null,
          r.volume ?? null,
          r.amount ?? null,
          r.changePct ?? null,
          ts,
        )
      }
    })
    for (let i = 0; i < rows.length; i += 800) {
      tx(rows.slice(i, i + 800))
      onBatch?.(Math.min(i + 800, total), total)
    }
    const cnRows = rows.map(r => ({ ...r, market: 'CN' as const }))
    if (cnRows.length) this.bulkUpsertInstrumentBars(cnRows)
    return rows.length
  }

  bulkUpsertInstrumentBars(
    rows: Array<{
      market: string
      code: string
      tradeDate: string
      open?: number | null
      high?: number | null
      low?: number | null
      close?: number | null
      volume?: number | null
      amount?: number | null
      changePct?: number | null
    }>,
  ): number {
    if (!rows.length) return 0
    const ts = nowIso()
    const stmt = this.db.prepare(`
      INSERT INTO instrument_bars_daily (
        market, code, trade_date, open, high, low, close, volume, amount, change_pct, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market, code, trade_date) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        amount = excluded.amount,
        change_pct = excluded.change_pct,
        synced_at = excluded.synced_at
    `)
    const tx = this.db.transaction((batch: typeof rows) => {
      for (const r of batch) {
        if (!r.tradeDate) continue
        stmt.run(
          r.market,
          r.code,
          r.tradeDate,
          r.open ?? null,
          r.high ?? null,
          r.low ?? null,
          r.close ?? null,
          r.volume ?? null,
          r.amount ?? null,
          r.changePct ?? null,
          ts,
        )
      }
    })
    for (let i = 0; i < rows.length; i += 800) tx(rows.slice(i, i + 800))
    return rows.length
  }

  /** Check if K-line data exists in the database */
  hasKlineData(): boolean {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM stock_klines_daily').get() as { c: number }
    return row.c > 0
  }

  countDistinctKlineCodes(): number {
    const row = this.db.prepare(
      'SELECT COUNT(DISTINCT code) AS c FROM stock_klines_daily',
    ).get() as { c: number }
    return row.c
  }

  /** 同花顺 Parquet 导入任务 — 用 K 线库覆盖率展示进度，而非逐股 sync_job_progress */
  private enrichThsKlineDumpJobProgress(
    jobProgress: Record<string, JobProgressSummary>,
    stockCount: number,
    bootstrap: BootstrapReadiness,
    lastSync: Record<string, string | null>,
  ): void {
    const klineCodes = this.countDistinctKlineCodes()
    const universe = Math.max(stockCount, klineCodes, 1)
    const done = klineCodes
    const pending = Math.max(0, universe - done)

    jobProgress.kline_bootstrap = {
      done: bootstrap.klines ? universe : done,
      pending: bootstrap.klines ? 0 : pending,
      error: jobProgress.kline_bootstrap?.error ?? 0,
    }

    const dailyFresh = !!lastSync.kline_daily && daysSince(lastSync.kline_daily) < 7
    jobProgress.kline_daily = {
      done: dailyFresh && bootstrap.klines ? universe : done,
      pending: dailyFresh && bootstrap.klines ? 0 : pending,
      error: jobProgress.kline_daily?.error ?? 0,
    }
  }

  /** 关闭长时间无响应的 running 会话/任务，避免 UI 永久卡在同步中 */
  reconcileStaleSyncState(maxAgeMs = 30 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString()
    const finished = nowIso()

    const latestRunning = this.db.prepare(`
      SELECT id FROM sync_sessions WHERE status = 'running' ORDER BY id DESC LIMIT 1
    `).get() as { id: number } | undefined
    const keepId = latestRunning?.id ?? -1

    const dupSessions = this.db.prepare(`
      UPDATE sync_sessions
      SET status = 'interrupted', finished_at = ?, message = '重复会话，已自动关闭'
      WHERE status = 'running' AND id != ?
    `).run(finished, keepId).changes

    const sessions = this.db.prepare(`
      UPDATE sync_sessions
      SET status = 'interrupted', finished_at = ?, message = '会话超时，已自动关闭'
      WHERE status = 'running' AND started_at < ?
    `).run(finished, cutoff).changes
    const runs = this.db.prepare(`
      UPDATE sync_runs
      SET status = 'interrupted', finished_at = ?, message = '任务超时，已自动关闭'
      WHERE status = 'running' AND started_at < ?
    `).run(finished, cutoff).changes
    return dupSessions + sessions + runs
  }

  countEquityInstruments(market: 'CN' | 'US' | 'HK'): number {
    if (market === 'CN') {
      return (this.db.prepare(
        `SELECT COUNT(*) AS c FROM instruments WHERE market = 'CN' AND asset_class = 'EQUITY'`,
      ).get() as { c: number }).c
    }
    if (market === 'US') return this.countUsInstruments()
    return this.countRegionalEquityInstruments('HK')
  }

  countTaxonomyNodes(market: string, kind: string): number {
    return (this.db.prepare(
      'SELECT COUNT(*) AS c FROM taxonomy_nodes WHERE market = ? AND kind = ?',
    ).get(market, kind) as { c: number }).c
  }

  upsertTaxonomyNode(row: {
    market: string
    kind: string
    code: string
    name: string
    parentCode?: string | null
    level?: number | null
    stockCount?: number | null
    extra?: string | null
  }): number {
    const ts = nowIso()
    const result = this.db.prepare(`
      INSERT INTO taxonomy_nodes (market, kind, code, name, parent_code, level, stock_count, extra, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market, kind, code) DO UPDATE SET
        name = excluded.name,
        parent_code = excluded.parent_code,
        level = excluded.level,
        stock_count = excluded.stock_count,
        extra = excluded.extra,
        synced_at = excluded.synced_at
    `).run(
      row.market,
      row.kind,
      row.code,
      row.name,
      row.parentCode ?? null,
      row.level ?? null,
      row.stockCount ?? null,
      row.extra ?? null,
      ts,
    )
    const id = Number(result.lastInsertRowid)
    if (id > 0) return id
    const existing = this.db.prepare(
      'SELECT id FROM taxonomy_nodes WHERE market = ? AND kind = ? AND code = ?',
    ).get(row.market, row.kind, row.code) as { id: number } | undefined
    return existing?.id ?? 0
  }

  replaceInstrumentTaxonomy(market: string, taxonomyId: number, codes: string[]): number {
    if (!taxonomyId || !codes.length) return 0
    const ts = nowIso()
    const del = this.db.prepare(
      'DELETE FROM instrument_taxonomy WHERE taxonomy_id = ? AND market = ?',
    ).run(taxonomyId, market)
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO instrument_taxonomy (market, code, taxonomy_id, synced_at)
      VALUES (?, ?, ?, ?)
    `)
    let n = 0
    for (const code of codes) {
      stmt.run(market, code, taxonomyId, ts)
      n++
    }
    return n
  }

  /** 用 taxonomy 行业分类回填 stocks.industry（syncInitialTaxonomy 收尾） */
  backfillCnStockIndustryFromTaxonomy(): number {
    const ts = nowIso()
    return this.db.prepare(`
      UPDATE stocks
      SET industry = (
        SELECT tn.name
        FROM instrument_taxonomy it
        INNER JOIN taxonomy_nodes tn ON tn.id = it.taxonomy_id
        WHERE it.market = 'CN' AND it.code = stocks.code AND tn.kind = 'industry'
        ORDER BY tn.level DESC, tn.id
        LIMIT 1
      ),
      updated_at = ?
      WHERE status = 'active'
        AND EXISTS (
          SELECT 1
          FROM instrument_taxonomy it
          INNER JOIN taxonomy_nodes tn ON tn.id = it.taxonomy_id
          WHERE it.market = 'CN' AND it.code = stocks.code AND tn.kind = 'industry'
        )
    `).run(ts).changes
  }

  listCodesWithMinInstrumentBars(market: string, minBars: number): string[] {
    const rows = this.db.prepare(`
      SELECT code FROM instrument_bars_daily
      WHERE market = ?
      GROUP BY code
      HAVING COUNT(*) >= ?
    `).all(market, minBars) as { code: string }[]
    return rows.map(r => r.code)
  }

  latestInstrumentBarDate(market: string, code: string): string | null {
    const row = this.db.prepare(`
      SELECT MAX(trade_date) AS d FROM instrument_bars_daily WHERE market = ? AND code = ?
    `).get(market, code) as { d: string | null } | undefined
    return row?.d ?? null
  }

  latestKlineDateByMarket(market: string): string | null {
    const row = this.db.prepare(`
      SELECT MAX(trade_date) AS d FROM instrument_bars_daily WHERE market = ?
    `).get(market) as { d: string | null } | undefined
    return row?.d ?? null
  }

  hasTradeDateKlines(tradeDate: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM stock_klines_daily WHERE trade_date = ? LIMIT 1',
    ).get(tradeDate)
    return Boolean(row)
  }

  pruneKlinesOlderThan(cutoffDate: string): number {
    return this.db.prepare('DELETE FROM stock_klines_daily WHERE trade_date < ?').run(cutoffDate).changes
  }

  shareholderSyncedAt(code: string): string | null {
    const row = this.db.prepare(
      'SELECT MAX(synced_at) AS synced_at FROM stock_shareholder_summary WHERE code = ?',
    ).get(code) as { synced_at: string | null } | undefined
    return row?.synced_at ?? null
  }

  listFinancials(code: string, limit = 4): Array<Record<string, unknown>> {
    return this.db.prepare(`
      SELECT * FROM stock_financials
      WHERE code = ? AND (report_type IS NULL OR report_type = 'annual')
      ORDER BY report_date DESC LIMIT ?
    `).all(code, limit) as Array<Record<string, unknown>>
  }

  upsertStock(row: {
    code: string
    name: string
    market?: string | null
    industry?: string | null
    industry_csrc?: string | null
    listing_date?: string | null
    is_st?: boolean
    status?: string
  }): void {
    const ts = nowIso()
    this.db.prepare(`
      INSERT INTO stocks (code, name, market, industry, industry_csrc, listing_date, is_st, status, updated_at)
      VALUES (@code, @name, @market, @industry, @industry_csrc, @listing_date, @is_st, @status, @updated_at)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        market = excluded.market,
        industry = excluded.industry,
        industry_csrc = excluded.industry_csrc,
        listing_date = COALESCE(excluded.listing_date, stocks.listing_date),
        is_st = excluded.is_st,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run({
      code: row.code,
      name: row.name,
      market: row.market ?? null,
      industry: row.industry ?? null,
      industry_csrc: row.industry_csrc ?? null,
      listing_date: row.listing_date ?? null,
      is_st: row.is_st ? 1 : 0,
      status: row.status ?? 'active',
      updated_at: ts,
    })
    this.upsertInstrument({
      code: row.code,
      market: 'CN',
      assetClass: 'EQUITY',
      name: row.name,
      exchange: row.market ?? null,
      listDate: row.listing_date ?? null,
      status: row.status ?? 'active',
      extra: JSON.stringify({
        industry: row.industry ?? null,
        industry_csrc: row.industry_csrc ?? null,
        is_st: row.is_st ? 1 : 0,
      }),
    })
  }

  listStockCodes(activeOnly = true): string[] {
    const sql = activeOnly
      ? `SELECT code FROM v_cn_equity_stocks WHERE status = 'active' ORDER BY code`
      : `SELECT code FROM v_cn_equity_stocks ORDER BY code`
    return (this.db.prepare(sql).all() as { code: string }[]).map(r => r.code)
  }

  stockMeta(
    code: string,
    exchange?: string | null,
  ): { code: string; name: string; industry: string | null; exchange?: string | null } | null {
    const normalized = normalizeStockCode(code)
    const ex = exchange ? parseStockMarket(exchange) : null
    type Row = { code: string; name: string; industry: string | null; market: string | null }
    if (ex) {
      const row = this.db.prepare(
        'SELECT code, name, industry, market FROM v_cn_equity_stocks WHERE code = ? AND market = ?',
      ).get(normalized, ex) as Row | undefined
      if (row) {
        return { code: row.code, name: row.name, industry: row.industry, exchange: row.market }
      }
    }
    const row = this.db.prepare(
      'SELECT code, name, industry, market FROM v_cn_equity_stocks WHERE code = ? LIMIT 1',
    ).get(normalized) as Row | undefined
    if (!row) return null
    return { code: row.code, name: row.name, industry: row.industry, exchange: row.market }
  }

  /** 复合键：有交易所时 `SZ:000977`，否则裸码 */
  stockMetaLookupKey(code: string, exchange?: string | null): string {
    const normalized = normalizeStockCode(code)
    const ex = exchange ? parseStockMarket(exchange) : null
    return ex ? `${ex}:${normalized}` : normalized
  }

  stockMarket(code: string, exchange?: string | null): StockMarket | null {
    const normalized = normalizeStockCode(code)
    const ex = exchange ? parseStockMarket(exchange) : null
    if (ex) {
      const row = this.db.prepare(
        'SELECT market FROM v_cn_equity_stocks WHERE code = ? AND market = ?',
      ).get(normalized, ex) as { market: string | null } | undefined
      return parseStockMarket(row?.market)
    }
    const row = this.db.prepare(
      'SELECT market FROM v_cn_equity_stocks WHERE code = ? LIMIT 1',
    ).get(normalized) as { market: string | null } | undefined
    return parseStockMarket(row?.market)
  }

  /** 复合键：有交易所时 `SZ:000977`，否则裸码 — 与 stockMetaLookupKey 一致 */
  stockMarketLookupKey(code: string, exchange?: string | null): string {
    return this.stockMetaLookupKey(code, exchange)
  }

  stockMarketBatch(
    codes: string[],
    exchangeByCode?: ReadonlyMap<string, string | null | undefined>,
  ): Map<string, StockMarket> {
    const normalized = [...new Set(codes.map(c => normalizeStockCode(c)).filter(Boolean))]
    const out = new Map<string, StockMarket>()
    if (!normalized.length) return out

    const withExchange = normalized.filter(c => exchangeByCode?.get(c) && parseStockMarket(exchangeByCode.get(c)))
    const bareOnly = normalized.filter(c => !withExchange.includes(c))

    if (bareOnly.length) {
      const placeholders = bareOnly.map(() => '?').join(',')
      const rows = this.db.prepare(
        `SELECT code, market FROM v_cn_equity_stocks WHERE code IN (${placeholders})`,
      ).all(...bareOnly) as { code: string; market: string | null }[]
      for (const row of rows) {
        const market = parseStockMarket(row.market)
        if (market) out.set(row.code, market)
      }
    }

    for (const code of withExchange) {
      const market = this.stockMarket(code, exchangeByCode!.get(code))
      if (market) out.set(this.stockMarketLookupKey(code, exchangeByCode!.get(code)), market)
    }

    return out
  }

  stockMetaBatch(
    codes: string[],
    exchangeByCode?: ReadonlyMap<string, string | null | undefined>,
  ): Map<string, { code: string; name: string; industry: string | null; exchange?: string | null }> {
    const normalized = [...new Set(codes.map(c => normalizeStockCode(c)).filter(Boolean))]
    const out = new Map<string, { code: string; name: string; industry: string | null; exchange?: string | null }>()
    if (!normalized.length) return out

    const withExchange = normalized.filter(c => exchangeByCode?.get(c) && parseStockMarket(exchangeByCode.get(c)))
    const bareOnly = normalized.filter(c => !withExchange.includes(c))

    if (bareOnly.length) {
      const placeholders = bareOnly.map(() => '?').join(',')
      const rows = this.db.prepare(
        `SELECT code, name, industry, market FROM v_cn_equity_stocks WHERE code IN (${placeholders})`,
      ).all(...bareOnly) as { code: string; name: string; industry: string | null; market: string | null }[]
      for (const row of rows) {
        out.set(row.code, {
          code: row.code,
          name: row.name,
          industry: row.industry,
          exchange: row.market,
        })
      }
    }

    for (const code of withExchange) {
      const meta = this.stockMeta(code, exchangeByCode!.get(code))
      if (meta) out.set(this.stockMetaLookupKey(code, exchangeByCode!.get(code)), meta)
    }

    return out
  }

  profileSyncedAt(code: string): string | null {
    const normalized = normalizeStockCode(code)
    const ns = this.resolveCnEquityInstrumentNs(code)
    if (stockProfilesUsesInstrumentNs(this.db)) {
      const row = this.db.prepare(
        'SELECT synced_at FROM stock_profiles WHERE instrument_ns = ? OR code = ?',
      ).get(ns, normalized) as { synced_at: string } | undefined
      return row?.synced_at ?? null
    }
    const row = this.db.prepare('SELECT synced_at FROM stock_profiles WHERE code = ?').get(normalized) as
      | { synced_at: string }
      | undefined
    return row?.synced_at ?? null
  }

  replaceProfile(code: string, profile: Record<string, unknown>): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(code)
    const instrumentNs = this.resolveCnEquityInstrumentNs(code)
    if (stockProfilesUsesInstrumentNs(this.db)) {
      this.db.prepare(`
        INSERT INTO stock_profiles (
          instrument_ns, code, org_name, province, city, employees, main_business, org_profile,
          business_scope, website, chairman, total_market_cap, circulating_market_cap, synced_at
        ) VALUES (
          @instrument_ns, @code, @org_name, @province, @city, @employees, @main_business, @org_profile,
          @business_scope, @website, @chairman, @total_market_cap, @circulating_market_cap, @synced_at
        )
        ON CONFLICT(instrument_ns) DO UPDATE SET
          code = excluded.code,
          org_name = excluded.org_name,
          province = excluded.province,
          city = excluded.city,
          employees = excluded.employees,
          main_business = excluded.main_business,
          org_profile = excluded.org_profile,
          business_scope = excluded.business_scope,
          website = excluded.website,
          chairman = excluded.chairman,
          total_market_cap = excluded.total_market_cap,
          circulating_market_cap = excluded.circulating_market_cap,
          synced_at = excluded.synced_at
      `).run({
        instrument_ns: instrumentNs,
        code: normalized,
        org_name: profile.orgName ?? null,
        province: profile.province ?? null,
        city: profile.city ?? null,
        employees: profile.employees ?? null,
        main_business: profile.mainBusiness ?? null,
        org_profile: profile.orgProfile ?? null,
        business_scope: profile.businessScope ?? null,
        website: profile.website ?? null,
        chairman: profile.chairman ?? null,
        total_market_cap: profile.totalMarketCap ?? null,
        circulating_market_cap: profile.circulatingMarketCap ?? null,
        synced_at: ts,
      })
      return
    }
    this.db.prepare(`
      INSERT INTO stock_profiles (
        code, org_name, province, city, employees, main_business, org_profile,
        business_scope, website, chairman, total_market_cap, circulating_market_cap, synced_at
      ) VALUES (
        @code, @org_name, @province, @city, @employees, @main_business, @org_profile,
        @business_scope, @website, @chairman, @total_market_cap, @circulating_market_cap, @synced_at
      )
      ON CONFLICT(code) DO UPDATE SET
        org_name = excluded.org_name,
        province = excluded.province,
        city = excluded.city,
        employees = excluded.employees,
        main_business = excluded.main_business,
        org_profile = excluded.org_profile,
        business_scope = excluded.business_scope,
        website = excluded.website,
        chairman = excluded.chairman,
        total_market_cap = excluded.total_market_cap,
        circulating_market_cap = excluded.circulating_market_cap,
        synced_at = excluded.synced_at
    `).run({
      code,
      org_name: profile.orgName ?? null,
      province: profile.province ?? null,
      city: profile.city ?? null,
      employees: profile.employees ?? null,
      main_business: profile.mainBusiness ?? null,
      org_profile: profile.orgProfile ?? null,
      business_scope: profile.businessScope ?? null,
      website: profile.website ?? null,
      chairman: profile.chairman ?? null,
      total_market_cap: profile.totalMarketCap ?? null,
      circulating_market_cap: profile.circulatingMarketCap ?? null,
      synced_at: ts,
    })
  }

  replaceFinancial(code: string, fin: Record<string, unknown>): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_financials', normalized)
    this.db.prepare(`
      INSERT INTO stock_financials (
        code, instrument_ns, report_date, report_type, revenue, net_profit, roe, gross_margin, debt_ratio,
        eps, bps, revenue_yoy, net_profit_yoy, synced_at
      ) VALUES (
        @code, @instrument_ns, @report_date, @report_type, @revenue, @net_profit, @roe, @gross_margin, @debt_ratio,
        @eps, @bps, @revenue_yoy, @net_profit_yoy, @synced_at
      )
      ON CONFLICT(code, report_date, report_type) DO UPDATE SET
        instrument_ns = COALESCE(excluded.instrument_ns, stock_financials.instrument_ns),
        revenue = excluded.revenue,
        net_profit = excluded.net_profit,
        roe = excluded.roe,
        gross_margin = excluded.gross_margin,
        debt_ratio = excluded.debt_ratio,
        eps = excluded.eps,
        bps = excluded.bps,
        revenue_yoy = excluded.revenue_yoy,
        net_profit_yoy = excluded.net_profit_yoy,
        synced_at = excluded.synced_at
    `).run({
      code: normalized,
      instrument_ns: instrumentNs,
      report_date: fin.reportDate ?? '',
      report_type: fin.reportType ?? 'annual',
      revenue: fin.revenue ?? null,
      net_profit: fin.netProfit ?? null,
      roe: fin.roe ?? null,
      gross_margin: fin.grossMargin ?? null,
      debt_ratio: fin.debtRatio ?? null,
      eps: fin.eps ?? null,
      bps: fin.bps ?? null,
      revenue_yoy: fin.revenueYoy ?? null,
      net_profit_yoy: fin.netProfitYoy ?? null,
      synced_at: ts,
    })
  }

  replaceBusinessSegments(code: string, reportDate: string, segments: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_business_segments', normalized)
    const del = this.db.prepare('DELETE FROM stock_business_segments WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_business_segments (
        code, instrument_ns, report_date, segment_name, segment_type, revenue, revenue_pct, gross_margin, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const seg of segments) {
        ins.run(
          normalized,
          instrumentNs,
          reportDate,
          String(seg.name ?? ''),
          String(seg.type ?? ''),
          seg.revenue ?? null,
          seg.revenuePct ?? null,
          seg.grossMargin ?? null,
          ts,
        )
      }
    })
    tx()
  }

  replacePartners(code: string, direction: string, partners: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_partners', normalized)
    const del = this.db.prepare('DELETE FROM stock_partners WHERE code = ? AND direction = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_partners (code, instrument_ns, direction, partner_name, amount, ratio, report_date, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized, direction)
      for (const p of partners.slice(0, 20)) {
        ins.run(
          normalized,
          instrumentNs,
          direction,
          String(p.name ?? ''),
          p.amount ?? null,
          p.ratio ?? null,
          p.reportDate ?? null,
          ts,
        )
      }
    })
    tx()
  }

  upsertQuoteDaily(tradeDate: string, code: string, quote: Record<string, unknown>): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_quotes_daily', normalized)
    this.db.prepare(`
      INSERT INTO stock_quotes_daily (
        trade_date, code, instrument_ns, close, pe, pb, market_cap, turnover_rate, volume_ratio, change_pct, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trade_date, code) DO UPDATE SET
        instrument_ns = COALESCE(excluded.instrument_ns, stock_quotes_daily.instrument_ns),
        close = excluded.close,
        pe = excluded.pe,
        pb = excluded.pb,
        market_cap = excluded.market_cap,
        turnover_rate = excluded.turnover_rate,
        volume_ratio = excluded.volume_ratio,
        change_pct = excluded.change_pct,
        synced_at = excluded.synced_at
    `).run(
      tradeDate,
      normalized,
      instrumentNs,
      quote.price ?? quote.close ?? null,
      quote.pe ?? null,
      quote.pb ?? null,
      quote.marketCap ?? null,
      quote.turnoverRate ?? null,
      quote.volumeRatio ?? null,
      quote.changePct ?? null,
      ts,
    )
  }

  replaceFactors(tradeDate: string, code: string, factors: Record<string, number | null>): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_factors', normalized)
    const del = this.db.prepare('DELETE FROM stock_factors WHERE trade_date = ? AND code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_factors (trade_date, code, instrument_ns, factor_name, factor_value, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(tradeDate, normalized)
      for (const [name, value] of Object.entries(factors)) {
        if (value == null || Number.isNaN(value)) continue
        ins.run(tradeDate, normalized, instrumentNs, name, value, ts)
      }
    })
    tx()
  }

  upsertScore(tradeDate: string, code: string, scorecard: string, totalScore: number | null): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_scores', normalized)
    this.db.prepare(`
      INSERT INTO stock_scores (trade_date, code, instrument_ns, scorecard, total_score, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(trade_date, code, scorecard) DO UPDATE SET
        instrument_ns = COALESCE(excluded.instrument_ns, stock_scores.instrument_ns),
        total_score = excluded.total_score,
        synced_at = excluded.synced_at
    `).run(tradeDate, normalized, instrumentNs, scorecard, totalScore, ts)
  }

  rebuildIndustryStats(tradeDate: string): number {
    const ts = nowIso()
    this.db.prepare('DELETE FROM industry_stats WHERE trade_date = ?').run(tradeDate)
    const r = this.db.prepare(`
      INSERT INTO industry_stats (trade_date, industry, stock_count, avg_score, avg_pe, avg_pb, synced_at)
      SELECT
        ?,
        COALESCE(s.industry, '未分类') AS industry,
        COUNT(*) AS stock_count,
        AVG(sc.total_score) AS avg_score,
        AVG(q.pe) AS avg_pe,
        AVG(q.pb) AS avg_pb,
        ?
      FROM stocks s
      LEFT JOIN stock_quotes_daily q ON q.code = s.code AND q.trade_date = ?
      LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
      WHERE s.status = 'active' AND s.industry IS NOT NULL AND s.industry != ''
      GROUP BY COALESCE(s.industry, '未分类')
    `).run(tradeDate, ts, tradeDate, tradeDate)
    return r.changes
  }

  hasFactorsForDate(code: string, tradeDate: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM stock_factors WHERE code = ? AND trade_date = ? LIMIT 1',
    ).get(code, tradeDate)
    return Boolean(row)
  }

  partnerSyncedAt(code: string): string | null {
    const row = this.db.prepare(
      'SELECT MAX(synced_at) AS synced_at FROM stock_partners WHERE code = ?',
    ).get(code) as { synced_at: string | null } | undefined
    return row?.synced_at ?? null
  }

  isJobDone(jobName: string, code: string, scopeKey = ''): boolean {
    const { code: bare, instrumentNs } = resolveCodeOrNsInput(code)
    const normalized = normalizeStockCode(bare)
    const row = this.db.prepare(`
      SELECT 1 FROM sync_job_progress
      WHERE job_name = ? AND scope_key = ? AND status = 'done'
        AND (code = ? OR (? IS NOT NULL AND instrument_ns = ?))
      LIMIT 1
    `).get(jobName, scopeKey, normalized, instrumentNs, instrumentNs)
    return Boolean(row)
  }

  isJobError(jobName: string, code: string, scopeKey = ''): boolean {
    const { code: bare, instrumentNs } = resolveCodeOrNsInput(code)
    const normalized = normalizeStockCode(bare)
    const row = this.db.prepare(`
      SELECT 1 FROM sync_job_progress
      WHERE job_name = ? AND scope_key = ? AND status = 'error'
        AND (code = ? OR (? IS NOT NULL AND instrument_ns = ?))
      LIMIT 1
    `).get(jobName, scopeKey, normalized, instrumentNs, instrumentNs)
    return Boolean(row)
  }

  countJobFailed(jobName: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT code) AS c FROM sync_job_progress
      WHERE job_name = ? AND status = 'error'
    `).get(jobName) as { c: number }
    return row.c
  }

  jobProgressSyncedAt(jobName: string, code: string, scopeKey = ''): string | null {
    const row = this.db.prepare(`
      SELECT synced_at FROM sync_job_progress
      WHERE job_name = ? AND code = ? AND scope_key = ?
    `).get(jobName, code, scopeKey) as { synced_at: string } | undefined
    return row?.synced_at ?? null
  }

  markJobProgress(jobName: string, code: string, scopeKey: string, status: 'done' | 'error'): void {
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('sync_job_progress', normalized)
    this.db.prepare(`
      INSERT INTO sync_job_progress (job_name, code, instrument_ns, scope_key, status, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_name, code, scope_key) DO UPDATE SET
        instrument_ns = COALESCE(excluded.instrument_ns, sync_job_progress.instrument_ns),
        status = excluded.status,
        synced_at = excluded.synced_at
    `).run(jobName, normalized, instrumentNs, scopeKey, status, nowIso())
  }

  clearJobProgress(jobName?: string): number {
    if (jobName) {
      return this.db.prepare('DELETE FROM sync_job_progress WHERE job_name = ?').run(jobName).changes
    }
    return this.db.prepare('DELETE FROM sync_job_progress').run().changes
  }

  /** Clear prior per-stock errors for 北交所 920xxx — retry after code mapping fix. */
  clearBseJobErrors(jobNames?: string[]): number {
    if (jobNames?.length) {
      const placeholders = jobNames.map(() => '?').join(',')
      return this.db.prepare(`
        DELETE FROM sync_job_progress
        WHERE status = 'error' AND code LIKE '92%' AND job_name IN (${placeholders})
      `).run(...jobNames).changes
    }
    return this.db.prepare(`
      DELETE FROM sync_job_progress WHERE status = 'error' AND code LIKE '92%'
    `).run().changes
  }

  listCodesWithMinKlines(minBars: number): string[] {
    return (this.db.prepare(`
      SELECT code FROM stock_klines_daily
      GROUP BY code HAVING COUNT(*) >= ?
    `).all(minBars) as { code: string }[]).map(r => r.code)
  }

  /** BJ-listed codes with fewer than minBars daily K-lines (for post-bulk supplement). */
  listBseCodesNeedingKlines(minBars: number): string[] {
    const withMin = new Set(this.listCodesWithMinKlines(minBars))
    const rows = this.db.prepare(`
      SELECT code FROM stocks
      WHERE market = 'BJ' AND status IN ('active', 'st')
    `).all() as { code: string }[]
    return rows.map(r => r.code).filter(c => !withMin.has(c))
  }

  markBootstrapJobDoneForCodes(jobName: string, codes: string[], scopeKey = ''): void {
    const tx = this.db.transaction((list: string[]) => {
      for (const code of list) this.markJobProgress(jobName, code, scopeKey, 'done')
    })
    for (let i = 0; i < codes.length; i += 500) tx(codes.slice(i, i + 500))
  }

  /** Backfill per-stock job flags for bulk bootstrap tasks (fixes stale progress display). */
  repairBootstrapJobProgress(): { klines: number; industry: number } {
    const klineCodes = this.listCodesWithMinKlines(60)
    if (klineCodes.length) this.markBootstrapJobDoneForCodes('kline_bootstrap', klineCodes)

    const tradeDate = (this.db.prepare(
      'SELECT MAX(trade_date) AS d FROM industry_stats',
    ).get() as { d: string | null }).d
    let industry = 0
    if (tradeDate) {
      const codes = (this.db.prepare(
        'SELECT code FROM stocks WHERE status = \'active\'',
      ).all() as { code: string }[]).map(r => r.code)
      if (codes.length) {
        this.markBootstrapJobDoneForCodes('industry_stats', codes, tradeDate)
        industry = codes.length
      }
    }
    return { klines: klineCodes.length, industry }
  }

  replaceAnnouncements(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_announcements', normalized)
    const del = this.db.prepare('DELETE FROM stock_announcements WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_announcements (code, instrument_ns, pub_date, title, url, source, category, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code, pub_date, title) DO UPDATE SET
        instrument_ns = COALESCE(excluded.instrument_ns, stock_announcements.instrument_ns),
        url = excluded.url,
        source = excluded.source,
        category = excluded.category,
        synced_at = excluded.synced_at
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const item of items.slice(0, 60)) {
        ins.run(
          normalized,
          instrumentNs,
          String(item.date ?? item.pub_date ?? ''),
          String(item.title ?? ''),
          item.url ?? null,
          item.source ?? null,
          item.type ?? item.category ?? 'announcement',
          ts,
        )
      }
    })
    tx()
  }

  replaceDividends(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_dividends', normalized)
    const del = this.db.prepare('DELETE FROM stock_dividends WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_dividends (
        code, instrument_ns, year, ex_date, record_date, pay_date, cash_bonus, stock_bonus, plan, progress, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const item of items.slice(0, 30)) {
        ins.run(
          normalized,
          instrumentNs,
          item.year ?? null,
          item.exDate ?? item.ex_date ?? null,
          item.recordDate ?? item.record_date ?? null,
          item.payDate ?? item.pay_date ?? null,
          item.cashBonus ?? item.cash_bonus ?? null,
          item.stockBonus ?? item.stock_bonus ?? null,
          item.plan ?? null,
          item.progress ?? null,
          ts,
        )
      }
    })
    tx()
  }

  replaceShareholders(code: string, row: Record<string, unknown>): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_shareholder_summary', normalized)
    const reportDate = String(row.reportDate ?? row.report_date ?? '')
    const delSummary = this.db.prepare('DELETE FROM stock_shareholder_summary WHERE code = ?')
    const delTop = this.db.prepare('DELETE FROM stock_shareholder_top10 WHERE code = ?')
    const insSummary = this.db.prepare(`
      INSERT INTO stock_shareholder_summary (
        code, instrument_ns, report_date, shareholder_count, shareholder_count_change,
        avg_holding_value, hold_focus, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insTop = this.db.prepare(`
      INSERT INTO stock_shareholder_top10 (
        code, instrument_ns, report_date, rank, holder_name, shares_held, share_pct, share_change, share_type, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const top10 = (row.top10Shareholders as Record<string, unknown>[] | undefined) ?? []
    const tx = this.db.transaction(() => {
      delSummary.run(normalized)
      delTop.run(normalized)
      insSummary.run(
        normalized,
        instrumentNs,
        reportDate,
        row.shareholderCount ?? row.shareholder_count ?? null,
        row.shareholderCountChange ?? row.shareholder_count_change ?? null,
        row.avgHoldingValue ?? row.avg_holding_value ?? null,
        row.holdFocus ?? row.hold_focus ?? null,
        ts,
      )
      for (const h of top10.slice(0, 10)) {
        insTop.run(
          normalized,
          instrumentNs,
          reportDate,
          h.rank ?? null,
          String(h.name ?? ''),
          h.sharesHeld ?? h.shares_held ?? null,
          h.sharePct ?? h.share_pct ?? null,
          h.change ?? h.share_change ?? null,
          h.shareType ?? h.share_type ?? null,
          ts,
        )
      }
    })
    tx()
  }

  replaceForecasts(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_forecasts', normalized)
    const del = this.db.prepare('DELETE FROM stock_forecasts WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_forecasts (
        code, instrument_ns, report_date, ann_date, forecast_type, summary, profit_lower, profit_upper, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const item of items.slice(0, 20)) {
        ins.run(
          normalized,
          instrumentNs,
          String(item.reportDate ?? item.report_date ?? ''),
          item.annDate ?? item.ann_date ?? null,
          item.forecastType ?? item.forecast_type ?? null,
          item.summary ?? null,
          item.profitLower ?? item.profit_lower ?? null,
          item.profitUpper ?? item.profit_upper ?? null,
          ts,
        )
      }
    })
    tx()
  }

  replaceInstHoldings(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_inst_holdings', normalized)
    const del = this.db.prepare('DELETE FROM stock_inst_holdings WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_inst_holdings (
        code, instrument_ns, report_date, institution_type, shares_held, share_pct, market_value, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const item of items.slice(0, 30)) {
        ins.run(
          normalized,
          instrumentNs,
          String(item.reportDate ?? item.report_date ?? ''),
          item.institutionType ?? item.institution_type ?? null,
          item.sharesHeld ?? item.shares_held ?? null,
          item.sharePct ?? item.share_pct ?? null,
          item.marketValue ?? item.market_value ?? null,
          ts,
        )
      }
    })
    tx()
  }

  replaceInsiderTrades(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_insider_trades', normalized)
    const del = this.db.prepare('DELETE FROM stock_insider_trades WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_insider_trades (
        code, instrument_ns, trade_date, person_name, position, change_type, shares_changed, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const item of items.slice(0, 30)) {
        ins.run(
          normalized,
          instrumentNs,
          String(item.date ?? item.trade_date ?? ''),
          item.name ?? item.person_name ?? null,
          item.position ?? null,
          item.changeType ?? item.change_type ?? null,
          item.sharesChanged ?? item.shares_changed ?? null,
          ts,
        )
      }
    })
    tx()
  }

  replaceBuybacks(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const normalized = normalizeStockCode(resolveCodeOrNsInput(code).code)
    const instrumentNs = this.writeInstrumentNs('stock_buybacks', normalized)
    const del = this.db.prepare('DELETE FROM stock_buybacks WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_buybacks (code, instrument_ns, ann_date, amount, shares, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(normalized)
      for (const item of items.slice(0, 20)) {
        ins.run(
          normalized,
          instrumentNs,
          String(item.date ?? item.ann_date ?? ''),
          item.amount ?? null,
          item.shares ?? null,
          ts,
        )
      }
    })
    tx()
  }

  beginSession(mode: string, jobsTotal: number): number {
    const started = nowIso()
    const r = this.db.prepare(`
      INSERT INTO sync_sessions (
        mode, status, started_at, jobs_total, jobs_completed, job_current, job_total
      ) VALUES (?, 'running', ?, ?, 0, 0, 0)
    `).run(mode, started, jobsTotal)
    return Number(r.lastInsertRowid)
  }

  /** Re-attach to an interrupted session (resume after restart). */
  reopenSession(sessionId: number): void {
    this.db.prepare(`
      UPDATE sync_sessions
      SET status = 'running', finished_at = NULL, message = NULL
      WHERE id = ?
    `).run(sessionId)
  }

  countJobDone(jobName: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT code) AS c FROM sync_job_progress
      WHERE job_name = ? AND status = 'done'
    `).get(jobName) as { c: number }
    return row.c
  }

  updateSessionProgress(
    sessionId: number,
    patch: {
      current_job?: string
      jobs_completed?: number
      jobs_total?: number
      job_current?: number
      job_total?: number
      message?: string
    },
  ): void {
    const cur = this.getSession(sessionId)
    if (!cur) return
    this.db.prepare(`
      UPDATE sync_sessions SET
        current_job = ?,
        jobs_completed = ?,
        jobs_total = ?,
        job_current = ?,
        job_total = ?,
        message = ?
      WHERE id = ?
    `).run(
      patch.current_job ?? cur.current_job,
      patch.jobs_completed ?? cur.jobs_completed,
      patch.jobs_total ?? cur.jobs_total,
      patch.job_current ?? cur.job_current,
      patch.job_total ?? cur.job_total,
      patch.message ?? cur.message,
      sessionId,
    )
  }

  finishSession(sessionId: number, status: string, message?: string): void {
    this.db.prepare(`
      UPDATE sync_sessions SET status = ?, finished_at = ?, message = ? WHERE id = ?
    `).run(status, nowIso(), message ?? null, sessionId)
  }

  getSession(sessionId: number) {
    return this.db.prepare('SELECT * FROM sync_sessions WHERE id = ?').get(sessionId) as {
      id: number
      mode: string
      status: string
      started_at: string
      finished_at: string | null
      current_job: string | null
      jobs_completed: number
      jobs_total: number
      job_current: number
      job_total: number
      message: string | null
    } | undefined
  }

  getLatestSession() {
    return this.db.prepare(`
      SELECT * FROM sync_sessions ORDER BY id DESC LIMIT 1
    `).get() as {
      id: number
      mode: string
      status: string
      started_at: string
      finished_at: string | null
      current_job: string | null
      jobs_completed: number
      jobs_total: number
      job_current: number
      job_total: number
      message: string | null
    } | undefined
  }

  appendLog(sessionId: number, message: string): void {
    this.db.prepare(`
      INSERT INTO sync_logs (session_id, message, created_at) VALUES (?, ?, ?)
    `).run(sessionId, message, nowIso())
  }

  getRecentLogs(sessionId: number | null, limit = 500): string[] {
    if (sessionId != null) {
      const rows = this.db.prepare(`
        SELECT message FROM sync_logs WHERE session_id = ? ORDER BY id DESC LIMIT ?
      `).all(sessionId, limit) as { message: string }[]
      return rows.reverse().map(r => r.message)
    }
    const rows = this.db.prepare(`
      SELECT message FROM sync_logs ORDER BY id DESC LIMIT ?
    `).all(limit) as { message: string }[]
    return rows.reverse().map(r => r.message)
  }

  upsertInstrument(row: {
    code: string
    market: string
    assetClass: string
    name?: string | null
    exchange?: string | null
    listDate?: string | null
    delistDate?: string | null
    status?: string | null
    extra?: string | null
  }): void {
    const code = row.market === 'US'
      ? normalizeUsSymbol(row.code)
      : row.market === 'CN'
        ? normalizeStockCode(row.code)
        : row.code.trim()
    const exchange = normalizeInstrumentExchange(row.exchange)
    const now = nowIso()
    const instrumentNs = instrumentRefToNs(normalizeInstrumentRef({
      market: row.market as InstrumentRef['market'],
      assetClass: row.assetClass as InstrumentRef['assetClass'],
      symbol: code,
      exchange: exchange || undefined,
    }))
    const hasNs = (this.db.prepare('PRAGMA table_info(instruments)').all() as { name: string }[])
      .some(c => c.name === 'instrument_ns')
    if (hasNs) {
      this.db.prepare(`
        INSERT INTO instruments (code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at, instrument_ns)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(market, exchange, code, asset_class) DO UPDATE SET
          name = COALESCE(excluded.name, instruments.name),
          list_date = COALESCE(excluded.list_date, instruments.list_date),
          delist_date = COALESCE(excluded.delist_date, instruments.delist_date),
          status = COALESCE(excluded.status, instruments.status),
          extra = COALESCE(excluded.extra, instruments.extra),
          updated_at = excluded.updated_at,
          instrument_ns = COALESCE(excluded.instrument_ns, instruments.instrument_ns)
      `).run(
        code,
        row.market,
        row.assetClass,
        row.name ?? null,
        exchange,
        row.listDate ?? null,
        row.delistDate ?? null,
        row.status ?? 'active',
        row.extra ?? null,
        now,
        instrumentNs,
      )
      return
    }
    this.db.prepare(`
      INSERT INTO instruments (code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(market, exchange, code, asset_class) DO UPDATE SET
        name = COALESCE(excluded.name, instruments.name),
        list_date = COALESCE(excluded.list_date, instruments.list_date),
        delist_date = COALESCE(excluded.delist_date, instruments.delist_date),
        status = COALESCE(excluded.status, instruments.status),
        extra = COALESCE(excluded.extra, instruments.extra),
        updated_at = excluded.updated_at
    `).run(
      code,
      row.market,
      row.assetClass,
      row.name ?? null,
      exchange,
      row.listDate ?? null,
      row.delistDate ?? null,
      row.status ?? 'active',
      row.extra ?? null,
      now,
    )
  }

  /** Dual-read: prefer composite key; fall back to first match by code when exchange omitted */
  getInstrument(row: {
    market: string
    code: string
    assetClass: string
    exchange?: string | null
  }): {
    code: string
    market: string
    assetClass: string
    name: string | null
    exchange: string | null
    listDate: string | null
    delistDate: string | null
    status: string
    extra: string | null
    updatedAt: string
  } | null {
    const code = row.market === 'US'
      ? normalizeUsSymbol(row.code)
      : row.market === 'CN'
        ? normalizeStockCode(row.code)
        : row.code.trim()
    type Raw = {
      code: string
      market: string
      asset_class: string
      name: string | null
      exchange: string
      list_date: string | null
      delist_date: string | null
      status: string
      extra: string | null
      updated_at: string
    }
    const mapRow = (r: Raw) => ({
      code: r.code,
      market: r.market,
      assetClass: r.asset_class,
      name: r.name,
      exchange: r.exchange || null,
      listDate: r.list_date,
      delistDate: r.delist_date,
      status: r.status,
      extra: r.extra,
      updatedAt: r.updated_at,
    })
    if (row.exchange != null && String(row.exchange).trim()) {
      const exact = this.db.prepare(`
        SELECT code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at
        FROM instruments
        WHERE market = ? AND exchange = ? AND code = ? AND asset_class = ?
      `).get(row.market, normalizeInstrumentExchange(row.exchange), code, row.assetClass) as Raw | undefined
      return exact ? mapRow(exact) : null
    }
    const fallback = this.db.prepare(`
      SELECT code, market, asset_class, name, exchange, list_date, delist_date, status, extra, updated_at
      FROM instruments
      WHERE market = ? AND code = ? AND asset_class = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(row.market, code, row.assetClass) as Raw | undefined
    return fallback ? mapRow(fallback) : null
  }

  upsertEtfProfile(code: string, profile: Record<string, unknown>): void {
    const normalized = normalizeStockCode(code)
    const now = nowIso()
    this.db.prepare(`
      INSERT INTO etf_profiles (code, profile_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
    `).run(normalized, JSON.stringify(profile), now)
  }

  listEtfInstruments(limit = 5000): { code: string; name: string | null; market: string }[] {
    return this.db.prepare(`
      SELECT code, name, market FROM instruments
      WHERE asset_class = 'ETF' AND market = 'CN'
      ORDER BY code
      LIMIT ?
    `).all(limit) as { code: string; name: string | null; market: string }[]
  }

  listEtfCodes(activeOnly = true): string[] {
    const sql = activeOnly
      ? `SELECT code FROM instruments WHERE asset_class = 'ETF' AND market = 'CN' AND status = 'active' ORDER BY code`
      : `SELECT code FROM instruments WHERE asset_class = 'ETF' AND market = 'CN' ORDER BY code`
    return (this.db.prepare(sql).all() as { code: string }[]).map(r => r.code)
  }

  etfNavSyncedAt(code: string): string | null {
    const row = this.db.prepare(
      'SELECT MAX(synced_at) AS synced_at FROM etf_nav_daily WHERE code = ?',
    ).get(normalizeStockCode(code)) as { synced_at: string | null } | undefined
    return row?.synced_at ?? null
  }

  etfHoldingsSyncedAt(code: string): string | null {
    const row = this.db.prepare(
      'SELECT MAX(synced_at) AS synced_at FROM etf_holdings WHERE code = ?',
    ).get(normalizeStockCode(code)) as { synced_at: string | null } | undefined
    return row?.synced_at ?? null
  }

  replaceEtfNav(code: string, rows: Array<{
    date: string
    nav?: number | null
    accNav?: number | null
    changePct?: number | null
    premiumRate?: number | null
  }>): number {
    const normalized = normalizeStockCode(code)
    const ts = nowIso()
    const del = this.db.prepare('DELETE FROM etf_nav_daily WHERE code = ?').run(normalized)
    const stmt = this.db.prepare(`
      INSERT INTO etf_nav_daily (code, trade_date, nav, acc_nav, change_pct, premium_rate, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction((batch: typeof rows) => {
      for (const r of batch) {
        const d = String(r.date ?? '').slice(0, 10)
        if (!d) continue
        stmt.run(
          normalized,
          d,
          r.nav ?? null,
          r.accNav ?? null,
          r.changePct ?? null,
          r.premiumRate ?? null,
          ts,
        )
      }
    })
    tx(rows)
    return del.changes + rows.length
  }

  getEtfNavHistory(code: string, limit = 120): Array<{
    date: string
    nav: number | null
    accNav: number | null
    changePct: number | null
    premiumRate: number | null
  }> {
    const rows = this.db.prepare(`
      SELECT trade_date, nav, acc_nav, change_pct, premium_rate
      FROM etf_nav_daily WHERE code = ?
      ORDER BY trade_date DESC LIMIT ?
    `).all(normalizeStockCode(code), limit) as Array<{
      trade_date: string
      nav: number | null
      acc_nav: number | null
      change_pct: number | null
      premium_rate: number | null
    }>
    return rows.map(r => ({
      date: r.trade_date,
      nav: r.nav,
      accNav: r.acc_nav,
      changePct: r.change_pct,
      premiumRate: r.premium_rate,
    }))
  }

  replaceEtfHoldings(code: string, rows: Array<{
    reportDate: string
    holdingSymbol: string
    holdingName?: string | null
    weight?: number | null
    shares?: number | null
    marketValue?: number | null
  }>): number {
    const normalized = normalizeStockCode(code)
    const ts = nowIso()
    this.db.prepare('DELETE FROM etf_holdings WHERE code = ?').run(normalized)
    const stmt = this.db.prepare(`
      INSERT INTO etf_holdings (code, report_date, holding_symbol, holding_name, weight, shares, market_value, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    let n = 0
    for (const r of rows) {
      const rd = String(r.reportDate ?? '').slice(0, 10)
      const sym = String(r.holdingSymbol ?? '').trim()
      if (!rd || !sym) continue
      stmt.run(
        normalized,
        rd,
        sym,
        r.holdingName ?? null,
        r.weight ?? null,
        r.shares ?? null,
        r.marketValue ?? null,
        ts,
      )
      n++
    }
    return n
  }

  getEtfHoldings(code: string, limit = 100): Array<{
    reportDate: string
    holdingSymbol: string
    holdingName: string | null
    weight: number | null
    shares: number | null
    marketValue: number | null
  }> {
    const rows = this.db.prepare(`
      SELECT report_date, holding_symbol, holding_name, weight, shares, market_value
      FROM etf_holdings WHERE code = ?
      ORDER BY report_date DESC, weight DESC
      LIMIT ?
    `).all(normalizeStockCode(code), limit) as Array<{
      report_date: string
      holding_symbol: string
      holding_name: string | null
      weight: number | null
      shares: number | null
      market_value: number | null
    }>
    return rows.map(r => ({
      reportDate: r.report_date,
      holdingSymbol: r.holding_symbol,
      holdingName: r.holding_name,
      weight: r.weight,
      shares: r.shares,
      marketValue: r.market_value,
    }))
  }

  searchEtfInstruments(keyword: string, limit = 30): { code: string; name: string | null }[] {
    const kw = keyword.trim()
    if (kw.length < 1) return []
    const like = `%${kw}%`
    return this.db.prepare(`
      SELECT code, name FROM instruments
      WHERE asset_class = 'ETF' AND market = 'CN'
        AND (code LIKE ? OR name LIKE ?)
      ORDER BY code
      LIMIT ?
    `).all(like, like, limit) as { code: string; name: string | null }[]
  }

  getEtfProfile(code: string): Record<string, unknown> | null {
    const row = this.db.prepare('SELECT profile_json FROM etf_profiles WHERE code = ?').get(
      normalizeStockCode(code),
    ) as { profile_json: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.profile_json) as Record<string, unknown>
    } catch {
      return null
    }
  }

  countEtfInstruments(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS c FROM instruments WHERE asset_class = 'ETF' AND market = 'CN'
    `).get() as { c: number }
    return row.c
  }

  listUsInstruments(limit = 5000): { code: string; name: string | null; market: string; exchange: string | null }[] {
    return this.db.prepare(`
      SELECT code, name, market, exchange FROM instruments
      WHERE asset_class = 'EQUITY' AND market = 'US'
      ORDER BY code
      LIMIT ?
    `).all(limit) as { code: string; name: string | null; market: string; exchange: string | null }[]
  }

  listUsCodes(activeOnly = true): string[] {
    const sql = activeOnly
      ? `SELECT code FROM instruments WHERE asset_class = 'EQUITY' AND market = 'US' AND status = 'active' ORDER BY code`
      : `SELECT code FROM instruments WHERE asset_class = 'EQUITY' AND market = 'US' ORDER BY code`
    return (this.db.prepare(sql).all() as { code: string }[]).map(r => r.code)
  }

  listRegionalCodes(market: 'JP' | 'KR' | 'HK', activeOnly = true): string[] {
    const sql = activeOnly
      ? `SELECT code FROM instruments WHERE asset_class = 'EQUITY' AND market = ? AND status = 'active' ORDER BY code`
      : `SELECT code FROM instruments WHERE asset_class = 'EQUITY' AND market = ? ORDER BY code`
    return (this.db.prepare(sql).all(market) as { code: string }[]).map(r => r.code)
  }

  searchUsInstruments(keyword: string, limit = 30): { code: string; name: string | null }[] {
    const kw = keyword.trim().toUpperCase()
    if (kw.length < 1) return []
    const like = `%${kw}%`
    return this.db.prepare(`
      SELECT code, name FROM instruments
      WHERE asset_class = 'EQUITY' AND market = 'US'
        AND (code LIKE ? OR UPPER(name) LIKE ?)
      ORDER BY code
      LIMIT ?
    `).all(like, like, limit) as { code: string; name: string | null }[]
  }

  countUsInstruments(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS c FROM instruments WHERE asset_class = 'EQUITY' AND market = 'US'
    `).get() as { c: number }
    return row.c
  }

  listCryptoCodes(activeOnly = true): string[] {
    const sql = activeOnly
      ? `SELECT code FROM instruments WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO' AND status = 'active' ORDER BY code`
      : `SELECT code FROM instruments WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO' ORDER BY code`
    return (this.db.prepare(sql).all() as { code: string }[]).map(r => r.code)
  }

  listCryptoInstruments(limit = 5000): { code: string; name: string | null; market: string; exchange: string | null }[] {
    return this.db.prepare(`
      SELECT code, name, market, exchange FROM instruments
      WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO'
      ORDER BY code
      LIMIT ?
    `).all(limit) as { code: string; name: string | null; market: string; exchange: string | null }[]
  }

  searchCryptoInstruments(keyword: string, limit = 30): { code: string; name: string | null }[] {
    const kw = keyword.trim().toUpperCase()
    if (kw.length < 1) return []
    const like = `%${kw}%`
    return this.db.prepare(`
      SELECT code, name FROM instruments
      WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO'
        AND (code LIKE ? OR UPPER(name) LIKE ?)
      ORDER BY code
      LIMIT ?
    `).all(like, like, limit) as { code: string; name: string | null }[]
  }

  countCryptoInstruments(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS c FROM instruments WHERE asset_class = 'CRYPTO_SPOT' AND market = 'CRYPTO'
    `).get() as { c: number }
    return row.c
  }

  countRegionalEquityInstruments(market: 'JP' | 'KR' | 'HK'): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS c FROM instruments WHERE asset_class = 'EQUITY' AND market = ?
    `).get(market) as { c: number }
    return row.c
  }
}

let sharedStore: MarketDataStore | null = null

export function getMarketDataStore(): MarketDataStore {
  if (!sharedStore) sharedStore = new MarketDataStore()
  return sharedStore
}

export function resetSharedMarketDataStore(): void {
  if (sharedStore) {
    sharedStore.close()
    sharedStore = null
  }
}
