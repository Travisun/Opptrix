import Database from 'better-sqlite3'
import { marketDbPath } from './paths.js'
import { migrate, nowIso, todayTradeDate } from './utils.js'

export interface JobProgressSummary {
  done: number
  error: number
  pending: number
}

export interface MarketDbStatus {
  db_path: string
  schema_version: number
  stock_count: number
  latest_trade_date: string | null
  latest_factor_date: string | null
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
}

export class MarketDataStore {
  readonly db: Database.Database

  constructor(dbPath = marketDbPath()) {
    this.db = new Database(dbPath)
    migrate(this.db)
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

  logError(runId: number | null, jobName: string, code: string | null, error: string): void {
    this.db.prepare(`
      INSERT INTO sync_errors (run_id, job_name, code, error, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(runId, jobName, code, error.slice(0, 500), nowIso())
  }

  getStatus(): MarketDbStatus {
    const stockCount = (this.db.prepare('SELECT COUNT(*) AS c FROM stocks').get() as { c: number }).c
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
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error
      FROM sync_job_progress
      GROUP BY job_name
    `).all() as { job_name: string; done: number; error: number }[]
    for (const row of progressRows) {
      jobProgress[row.job_name] = {
        done: row.done,
        error: row.error,
        pending: Math.max(0, stockCount - row.done),
      }
    }

    return {
      db_path: this.db.name,
      schema_version: schemaVersion,
      stock_count: stockCount,
      latest_trade_date: latestQuote.d,
      latest_factor_date: latestFactor.d,
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
      is_ready: stockCount > 1000 && latestFactor.d != null,
    }
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
  }

  listStockCodes(activeOnly = true): string[] {
    const sql = activeOnly
      ? `SELECT code FROM stocks WHERE status = 'active' ORDER BY code`
      : `SELECT code FROM stocks ORDER BY code`
    return (this.db.prepare(sql).all() as { code: string }[]).map(r => r.code)
  }

  profileSyncedAt(code: string): string | null {
    const row = this.db.prepare('SELECT synced_at FROM stock_profiles WHERE code = ?').get(code) as
      | { synced_at: string }
      | undefined
    return row?.synced_at ?? null
  }

  replaceProfile(code: string, profile: Record<string, unknown>): void {
    const ts = nowIso()
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
    this.db.prepare(`
      INSERT INTO stock_financials (
        code, report_date, report_type, revenue, net_profit, roe, gross_margin, debt_ratio,
        eps, bps, revenue_yoy, net_profit_yoy, synced_at
      ) VALUES (
        @code, @report_date, @report_type, @revenue, @net_profit, @roe, @gross_margin, @debt_ratio,
        @eps, @bps, @revenue_yoy, @net_profit_yoy, @synced_at
      )
      ON CONFLICT(code, report_date, report_type) DO UPDATE SET
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
      code,
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
    const del = this.db.prepare('DELETE FROM stock_business_segments WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_business_segments (
        code, report_date, segment_name, segment_type, revenue, revenue_pct, gross_margin, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const seg of segments) {
        ins.run(
          code,
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
    const del = this.db.prepare('DELETE FROM stock_partners WHERE code = ? AND direction = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_partners (code, direction, partner_name, amount, ratio, report_date, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code, direction)
      for (const p of partners.slice(0, 20)) {
        ins.run(
          code,
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
    this.db.prepare(`
      INSERT INTO stock_quotes_daily (
        trade_date, code, close, pe, pb, market_cap, turnover_rate, volume_ratio, change_pct, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trade_date, code) DO UPDATE SET
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
      code,
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
    const del = this.db.prepare('DELETE FROM stock_factors WHERE trade_date = ? AND code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_factors (trade_date, code, factor_name, factor_value, synced_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(tradeDate, code)
      for (const [name, value] of Object.entries(factors)) {
        if (value == null || Number.isNaN(value)) continue
        ins.run(tradeDate, code, name, value, ts)
      }
    })
    tx()
  }

  upsertScore(tradeDate: string, code: string, scorecard: string, totalScore: number | null): void {
    const ts = nowIso()
    this.db.prepare(`
      INSERT INTO stock_scores (trade_date, code, scorecard, total_score, synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(trade_date, code, scorecard) DO UPDATE SET
        total_score = excluded.total_score,
        synced_at = excluded.synced_at
    `).run(tradeDate, code, scorecard, totalScore, ts)
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
    const row = this.db.prepare(`
      SELECT 1 FROM sync_job_progress
      WHERE job_name = ? AND code = ? AND scope_key = ? AND status = 'done'
      LIMIT 1
    `).get(jobName, code, scopeKey)
    return Boolean(row)
  }

  jobProgressSyncedAt(jobName: string, code: string, scopeKey = ''): string | null {
    const row = this.db.prepare(`
      SELECT synced_at FROM sync_job_progress
      WHERE job_name = ? AND code = ? AND scope_key = ?
    `).get(jobName, code, scopeKey) as { synced_at: string } | undefined
    return row?.synced_at ?? null
  }

  markJobProgress(jobName: string, code: string, scopeKey: string, status: 'done' | 'error'): void {
    this.db.prepare(`
      INSERT INTO sync_job_progress (job_name, code, scope_key, status, synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_name, code, scope_key) DO UPDATE SET
        status = excluded.status,
        synced_at = excluded.synced_at
    `).run(jobName, code, scopeKey, status, nowIso())
  }

  clearJobProgress(jobName?: string): number {
    if (jobName) {
      return this.db.prepare('DELETE FROM sync_job_progress WHERE job_name = ?').run(jobName).changes
    }
    return this.db.prepare('DELETE FROM sync_job_progress').run().changes
  }

  replaceAnnouncements(code: string, items: Record<string, unknown>[]): void {
    const ts = nowIso()
    const del = this.db.prepare('DELETE FROM stock_announcements WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_announcements (code, pub_date, title, url, source, category, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code, pub_date, title) DO UPDATE SET
        url = excluded.url,
        source = excluded.source,
        category = excluded.category,
        synced_at = excluded.synced_at
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const item of items.slice(0, 60)) {
        ins.run(
          code,
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
    const del = this.db.prepare('DELETE FROM stock_dividends WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_dividends (
        code, year, ex_date, record_date, pay_date, cash_bonus, stock_bonus, plan, progress, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const item of items.slice(0, 30)) {
        ins.run(
          code,
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
    const reportDate = String(row.reportDate ?? row.report_date ?? '')
    const delSummary = this.db.prepare('DELETE FROM stock_shareholder_summary WHERE code = ?')
    const delTop = this.db.prepare('DELETE FROM stock_shareholder_top10 WHERE code = ?')
    const insSummary = this.db.prepare(`
      INSERT INTO stock_shareholder_summary (
        code, report_date, shareholder_count, shareholder_count_change,
        avg_holding_value, hold_focus, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const insTop = this.db.prepare(`
      INSERT INTO stock_shareholder_top10 (
        code, report_date, rank, holder_name, shares_held, share_pct, share_change, share_type, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const top10 = (row.top10Shareholders as Record<string, unknown>[] | undefined) ?? []
    const tx = this.db.transaction(() => {
      delSummary.run(code)
      delTop.run(code)
      insSummary.run(
        code,
        reportDate,
        row.shareholderCount ?? row.shareholder_count ?? null,
        row.shareholderCountChange ?? row.shareholder_count_change ?? null,
        row.avgHoldingValue ?? row.avg_holding_value ?? null,
        row.holdFocus ?? row.hold_focus ?? null,
        ts,
      )
      for (const h of top10.slice(0, 10)) {
        insTop.run(
          code,
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
    const del = this.db.prepare('DELETE FROM stock_forecasts WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_forecasts (
        code, report_date, ann_date, forecast_type, summary, profit_lower, profit_upper, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const item of items.slice(0, 20)) {
        ins.run(
          code,
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
    const del = this.db.prepare('DELETE FROM stock_inst_holdings WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_inst_holdings (
        code, report_date, institution_type, shares_held, share_pct, market_value, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const item of items.slice(0, 30)) {
        ins.run(
          code,
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
    const del = this.db.prepare('DELETE FROM stock_insider_trades WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_insider_trades (
        code, trade_date, person_name, position, change_type, shares_changed, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const item of items.slice(0, 30)) {
        ins.run(
          code,
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
    const del = this.db.prepare('DELETE FROM stock_buybacks WHERE code = ?')
    const ins = this.db.prepare(`
      INSERT INTO stock_buybacks (code, ann_date, amount, shares, synced_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction(() => {
      del.run(code)
      for (const item of items.slice(0, 20)) {
        ins.run(
          code,
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
}

let sharedStore: MarketDataStore | null = null

export function getMarketDataStore(): MarketDataStore {
  if (!sharedStore) sharedStore = new MarketDataStore()
  return sharedStore
}
