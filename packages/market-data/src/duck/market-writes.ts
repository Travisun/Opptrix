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
