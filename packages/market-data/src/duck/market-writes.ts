import { duckRun, type DuckConnection } from '../kline/duck-connection.js'

/** DuckDB 批量写入操作 — 由 duck-cli apply-batch 或 MarketDataStore 队列 flush 执行 */
export type DuckWriteOp =
  | { op: 'upsertStock'; row: Record<string, unknown> }
  | { op: 'upsertInstrument'; row: Record<string, unknown> }
  | { op: 'upsertTaxonomyNode'; row: Record<string, unknown> }
  | { op: 'replaceInstrumentTaxonomy'; market: string; taxonomyId: number; codes: string[]; syncedAt: string }
  | { op: 'upsertQuoteDaily'; tradeDate: string; code: string; quote: Record<string, unknown>; instrumentNs?: string | null; syncedAt: string }
  | { op: 'replaceFactors'; tradeDate: string; code: string; factors: Record<string, number | null>; instrumentNs?: string | null; syncedAt: string }
  | { op: 'upsertScore'; tradeDate: string; code: string; scorecard: string; totalScore: number | null; instrumentNs?: string | null; syncedAt: string }
  | { op: 'replaceProfile'; code: string; profile: Record<string, unknown>; instrumentNs?: string | null; syncedAt: string }
  | { op: 'replaceFinancial'; code: string; fin: Record<string, unknown>; instrumentNs?: string | null; syncedAt: string }
  | { op: 'upsertEtfProfile'; code: string; profile: Record<string, unknown>; syncedAt: string }
  | { op: 'replaceBusinessSegments'; code: string; instrumentNs?: string | null; reportDate: string; segments: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replacePartners'; code: string; instrumentNs?: string | null; direction: string; partners: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replaceAnnouncements'; code: string; instrumentNs?: string | null; items: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replaceDividends'; code: string; instrumentNs?: string | null; items: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replaceShareholders'; code: string; instrumentNs?: string | null; row: Record<string, unknown>; syncedAt: string }
  | { op: 'replaceForecasts'; code: string; instrumentNs?: string | null; items: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replaceInstHoldings'; code: string; instrumentNs?: string | null; items: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replaceInsiderTrades'; code: string; instrumentNs?: string | null; items: Record<string, unknown>[]; syncedAt: string }
  | { op: 'replaceBuybacks'; code: string; instrumentNs?: string | null; items: Record<string, unknown>[]; syncedAt: string }
  | { op: 'rebuildIndustryStats'; tradeDate: string; syncedAt: string }
  | { op: 'replaceEtfNav'; code: string; rows: Array<{ date: string; nav?: number | null; accNav?: number | null; changePct?: number | null; premiumRate?: number | null }>; syncedAt: string }
  | { op: 'replaceEtfHoldings'; code: string; rows: Array<{ reportDate: string; holdingSymbol: string; holdingName?: string | null; weight?: number | null; shares?: number | null; marketValue?: number | null }>; syncedAt: string }
  | { op: 'exec'; sql: string; params?: unknown[] }

export async function applyDuckWriteOps(conn: DuckConnection, ops: DuckWriteOp[]): Promise<number> {
  let applied = 0
  for (const item of ops) {
    switch (item.op) {
      case 'upsertStock': {
        const r = item.row
        await duckRun(conn, `
          INSERT OR REPLACE INTO stocks (code, name, market, industry, industry_csrc, listing_date, is_st, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, r.code, r.name, r.market ?? null, r.industry ?? null, r.industry_csrc ?? null,
        r.listing_date ?? null, Boolean(r.is_st), r.status ?? 'active', r.updated_at)
        applied++
        break
      }
      case 'upsertInstrument': {
        const r = item.row
        await duckRun(conn, `
          INSERT OR REPLACE INTO instruments (market, exchange, code, asset_class, name, instrument_ns, list_date, delist_date, status, extra, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, r.market, r.exchange ?? '', r.code, r.asset_class, r.name ?? null, r.instrument_ns ?? null,
        r.list_date ?? null, r.delist_date ?? null, r.status ?? 'active', r.extra ?? null, r.updated_at)
        applied++
        break
      }
      case 'upsertTaxonomyNode': {
        const r = item.row
        await duckRun(conn, `
          INSERT OR REPLACE INTO taxonomy_nodes (id, market, kind, code, name, parent_code, level, stock_count, extra, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, r.id, r.market, r.kind, r.code, r.name ?? null, r.parent_code ?? null, r.level ?? null,
        r.stock_count ?? null, r.extra ?? null, r.synced_at)
        applied++
        break
      }
      case 'replaceInstrumentTaxonomy': {
        await duckRun(conn, `DELETE FROM instrument_taxonomy WHERE market = ? AND taxonomy_id = ?`, item.market, item.taxonomyId)
        for (const code of item.codes) {
          await duckRun(conn, `
            INSERT INTO instrument_taxonomy (market, code, taxonomy_id, synced_at) VALUES (?, ?, ?, ?)
          `, item.market, code, item.taxonomyId, item.syncedAt)
        }
        applied++
        break
      }
      case 'upsertQuoteDaily': {
        const q = item.quote
        await duckRun(conn, `
          INSERT OR REPLACE INTO stock_quotes_daily (
            trade_date, code, instrument_ns, close, pe, pb, market_cap, turnover_rate, volume_ratio, change_pct, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, item.tradeDate, item.code, item.instrumentNs ?? null, q.close ?? null, q.pe ?? null, q.pb ?? null,
        q.market_cap ?? null, q.turnover_rate ?? null, q.volume_ratio ?? null, q.change_pct ?? null, item.syncedAt)
        applied++
        break
      }
      case 'replaceFactors': {
        await duckRun(conn, `DELETE FROM stock_factors WHERE trade_date = ? AND code = ?`, item.tradeDate, item.code)
        for (const [name, val] of Object.entries(item.factors)) {
          if (val == null) continue
          await duckRun(conn, `
            INSERT INTO stock_factors (trade_date, code, instrument_ns, factor_name, factor_value, synced_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `, item.tradeDate, item.code, item.instrumentNs ?? null, name, val, item.syncedAt)
        }
        applied++
        break
      }
      case 'upsertScore': {
        await duckRun(conn, `
          INSERT OR REPLACE INTO stock_scores (trade_date, code, instrument_ns, scorecard, total_score, synced_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, item.tradeDate, item.code, item.instrumentNs ?? null, item.scorecard, item.totalScore, item.syncedAt)
        applied++
        break
      }
      case 'replaceProfile': {
        const p = item.profile
        await duckRun(conn, `
          INSERT OR REPLACE INTO stock_profiles (
            code, instrument_ns, org_name, province, city, employees, main_business, org_profile,
            business_scope, website, chairman, total_market_cap, circulating_market_cap, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, item.code, item.instrumentNs ?? null, p.org_name ?? null, p.province ?? null, p.city ?? null,
        p.employees ?? null, p.main_business ?? null, p.org_profile ?? null, p.business_scope ?? null,
        p.website ?? null, p.chairman ?? null, p.total_market_cap ?? null, p.circulating_market_cap ?? null, item.syncedAt)
        applied++
        break
      }
      case 'replaceFinancial': {
        const f = item.fin
        await duckRun(conn, `
          INSERT OR REPLACE INTO stock_financials (
            code, instrument_ns, report_date, report_type, revenue, net_profit, roe, gross_margin,
            debt_ratio, eps, bps, revenue_yoy, net_profit_yoy, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, item.code, item.instrumentNs ?? null, f.report_date, f.report_type ?? null, f.revenue ?? null,
        f.net_profit ?? null, f.roe ?? null, f.gross_margin ?? null, f.debt_ratio ?? null, f.eps ?? null,
        f.bps ?? null, f.revenue_yoy ?? null, f.net_profit_yoy ?? null, item.syncedAt)
        applied++
        break
      }
      case 'upsertEtfProfile': {
        await duckRun(conn, `
          INSERT OR REPLACE INTO etf_profiles (code, profile_json, updated_at) VALUES (?, ?, ?)
        `, item.code, JSON.stringify(item.profile), item.syncedAt)
        applied++
        break
      }
      case 'replaceBusinessSegments': {
        await duckRun(conn, `DELETE FROM stock_business_segments WHERE code = ?`, item.code)
        for (const seg of item.segments) {
          await duckRun(conn, `
            INSERT INTO stock_business_segments (
              code, instrument_ns, report_date, segment_name, segment_type, revenue, revenue_pct, gross_margin, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, item.reportDate,
          String(seg.name ?? ''), String(seg.type ?? ''),
          seg.revenue ?? null, seg.revenuePct ?? null, seg.grossMargin ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replacePartners': {
        await duckRun(conn, `DELETE FROM stock_partners WHERE code = ? AND direction = ?`, item.code, item.direction)
        for (const p of item.partners.slice(0, 20)) {
          await duckRun(conn, `
            INSERT INTO stock_partners (code, instrument_ns, direction, partner_name, amount, ratio, report_date, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, item.direction, String(p.name ?? ''),
          p.amount ?? null, p.ratio ?? null, p.reportDate ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceAnnouncements': {
        await duckRun(conn, `DELETE FROM stock_announcements WHERE code = ?`, item.code)
        for (const ann of item.items.slice(0, 60)) {
          await duckRun(conn, `
            INSERT INTO stock_announcements (code, instrument_ns, pub_date, title, url, source, category, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (code, pub_date, title) DO UPDATE SET
              instrument_ns = COALESCE(excluded.instrument_ns, stock_announcements.instrument_ns),
              url = excluded.url,
              source = excluded.source,
              category = excluded.category,
              synced_at = excluded.synced_at
          `, item.code, item.instrumentNs ?? null,
          String(ann.date ?? ann.pub_date ?? ''), String(ann.title ?? ''),
          ann.url ?? null, ann.source ?? null, ann.type ?? ann.category ?? 'announcement', item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceDividends': {
        await duckRun(conn, `DELETE FROM stock_dividends WHERE code = ?`, item.code)
        for (const div of item.items.slice(0, 30)) {
          await duckRun(conn, `
            INSERT INTO stock_dividends (
              code, instrument_ns, year, ex_date, record_date, pay_date, cash_bonus, stock_bonus, plan, progress, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, div.year ?? null,
          div.exDate ?? div.ex_date ?? null, div.recordDate ?? div.record_date ?? null,
          div.payDate ?? div.pay_date ?? null, div.cashBonus ?? div.cash_bonus ?? null,
          div.stockBonus ?? div.stock_bonus ?? null, div.plan ?? null, div.progress ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceShareholders': {
        const row = item.row
        const reportDate = String(row.reportDate ?? row.report_date ?? '')
        const top10 = (row.top10Shareholders as Record<string, unknown>[] | undefined) ?? []
        await duckRun(conn, `DELETE FROM stock_shareholder_summary WHERE code = ?`, item.code)
        await duckRun(conn, `DELETE FROM stock_shareholder_top10 WHERE code = ?`, item.code)
        await duckRun(conn, `
          INSERT INTO stock_shareholder_summary (
            code, instrument_ns, report_date, shareholder_count, shareholder_count_change,
            avg_holding_value, hold_focus, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, item.code, item.instrumentNs ?? null, reportDate,
        row.shareholderCount ?? row.shareholder_count ?? null,
        row.shareholderCountChange ?? row.shareholder_count_change ?? null,
        row.avgHoldingValue ?? row.avg_holding_value ?? null,
        row.holdFocus ?? row.hold_focus ?? null, item.syncedAt)
        for (const h of top10.slice(0, 10)) {
          await duckRun(conn, `
            INSERT INTO stock_shareholder_top10 (
              code, instrument_ns, report_date, rank, holder_name, shares_held, share_pct, share_change, share_type, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, reportDate, h.rank ?? null, String(h.name ?? ''),
          h.sharesHeld ?? h.shares_held ?? null, h.sharePct ?? h.share_pct ?? null,
          h.change ?? h.share_change ?? null, h.shareType ?? h.share_type ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceForecasts': {
        await duckRun(conn, `DELETE FROM stock_forecasts WHERE code = ?`, item.code)
        for (const fc of item.items.slice(0, 20)) {
          await duckRun(conn, `
            INSERT INTO stock_forecasts (
              code, instrument_ns, report_date, ann_date, forecast_type, summary, profit_lower, profit_upper, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, String(fc.reportDate ?? fc.report_date ?? ''),
          fc.annDate ?? fc.ann_date ?? null, fc.forecastType ?? fc.forecast_type ?? null,
          fc.summary ?? null, fc.profitLower ?? fc.profit_lower ?? null,
          fc.profitUpper ?? fc.profit_upper ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceInstHoldings': {
        await duckRun(conn, `DELETE FROM stock_inst_holdings WHERE code = ?`, item.code)
        for (const inst of item.items.slice(0, 30)) {
          await duckRun(conn, `
            INSERT INTO stock_inst_holdings (
              code, instrument_ns, report_date, institution_type, shares_held, share_pct, market_value, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, String(inst.reportDate ?? inst.report_date ?? ''),
          inst.institutionType ?? inst.institution_type ?? null,
          inst.sharesHeld ?? inst.shares_held ?? null, inst.sharePct ?? inst.share_pct ?? null,
          inst.marketValue ?? inst.market_value ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceInsiderTrades': {
        await duckRun(conn, `DELETE FROM stock_insider_trades WHERE code = ?`, item.code)
        for (const tr of item.items.slice(0, 30)) {
          await duckRun(conn, `
            INSERT INTO stock_insider_trades (
              code, instrument_ns, trade_date, person_name, position, change_type, shares_changed, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, String(tr.date ?? tr.trade_date ?? ''),
          tr.name ?? tr.person_name ?? null, tr.position ?? null,
          tr.changeType ?? tr.change_type ?? null, tr.sharesChanged ?? tr.shares_changed ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceBuybacks': {
        await duckRun(conn, `DELETE FROM stock_buybacks WHERE code = ?`, item.code)
        for (const bb of item.items.slice(0, 20)) {
          await duckRun(conn, `
            INSERT INTO stock_buybacks (code, instrument_ns, ann_date, amount, shares, synced_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `, item.code, item.instrumentNs ?? null, String(bb.date ?? bb.ann_date ?? ''),
          bb.amount ?? null, bb.shares ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'rebuildIndustryStats': {
        await duckRun(conn, `DELETE FROM industry_stats WHERE trade_date = ?`, item.tradeDate)
        await duckRun(conn, `
          INSERT INTO industry_stats (trade_date, industry, stock_count, avg_score, avg_pe, avg_pb, synced_at)
          SELECT
            ?,
            COALESCE(s.industry, '未分类') AS industry,
            COUNT(*)::INTEGER AS stock_count,
            AVG(sc.total_score) AS avg_score,
            AVG(q.pe) AS avg_pe,
            AVG(q.pb) AS avg_pb,
            ?
          FROM stocks s
          LEFT JOIN stock_quotes_daily q ON q.code = s.code AND q.trade_date = ?
          LEFT JOIN stock_scores sc ON sc.code = s.code AND sc.trade_date = ? AND sc.scorecard = '综合评估'
          WHERE s.status = 'active' AND s.industry IS NOT NULL AND s.industry != ''
          GROUP BY COALESCE(s.industry, '未分类')
        `, item.tradeDate, item.syncedAt, item.tradeDate, item.tradeDate)
        applied++
        break
      }
      case 'replaceEtfNav': {
        await duckRun(conn, `DELETE FROM etf_nav_daily WHERE code = ?`, item.code)
        for (const r of item.rows) {
          const d = String(r.date ?? '').slice(0, 10)
          if (!d) continue
          await duckRun(conn, `
            INSERT INTO etf_nav_daily (code, trade_date, nav, acc_nav, change_pct, premium_rate, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, item.code, d, r.nav ?? null, r.accNav ?? null, r.changePct ?? null, r.premiumRate ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'replaceEtfHoldings': {
        await duckRun(conn, `DELETE FROM etf_holdings WHERE code = ?`, item.code)
        for (const r of item.rows) {
          const rd = String(r.reportDate ?? '').slice(0, 10)
          const sym = String(r.holdingSymbol ?? '').trim()
          if (!rd || !sym) continue
          await duckRun(conn, `
            INSERT INTO etf_holdings (code, report_date, holding_symbol, holding_name, weight, shares, market_value, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, item.code, rd, sym, r.holdingName ?? null, r.weight ?? null, r.shares ?? null, r.marketValue ?? null, item.syncedAt)
        }
        applied++
        break
      }
      case 'exec': {
        await duckRun(conn, item.sql, ...(item.params ?? []))
        applied++
        break
      }
      default:
        break
    }
  }
  return applied
}
