import type { Dividend, FinancialSummary, IndexKline, StockKline, StockListItem, StockProfile, StockRealtime } from '../../../core/schema.js'
import type { TushareRow } from '../api/client.js'
import { fromTsCode, toTsCode } from '../codes.js'
import { normalizeCode } from '../../../utils/helpers.js'

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function fmtDate(v: unknown): string {
  const s = str(v)
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s
}

export function mapStockListRows(rows: TushareRow[]): StockListItem[] {
  return rows.map(r => {
    const ts = str(r.ts_code)
    const code = fromTsCode(ts)
    let market = 'SZ'
    if (ts.endsWith('.BJ')) market = 'BJ'
    else if (ts.endsWith('.SH')) market = 'SH'
    else if (ts.endsWith('.SZ')) market = 'SZ'
    else if (str(r.market).includes('北交')) market = 'BJ'
    else market = code.startsWith('6') ? 'SH' : 'SZ'
    return {
      code,
      name: str(r.name),
      industry: str(r.industry),
      market,
    }
  })
}

export function mapDailyQuoteRows(
  daily: TushareRow[],
  basic: TushareRow[],
  names: Map<string, string>,
): StockRealtime[] {
  const basicByCode = new Map(basic.map(r => [str(r.ts_code), r]))
  return daily.map(r => {
    const tsCode = str(r.ts_code)
    const code = fromTsCode(tsCode)
    const b = basicByCode.get(tsCode)
    const close = num(r.close)
    const preClose = num(r.pre_close)
    let changePct = num(r.pct_chg)
    if (changePct == null && close != null && preClose) {
      changePct = ((close - preClose) / preClose) * 100
    }
    return {
      code,
      name: names.get(code) ?? code,
      price: close,
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      preClose,
      volume: num(r.vol),
      amount: num(r.amount),
      changePct,
      pe: num(b?.pe),
      pb: num(b?.pb),
      turnoverRate: num(b?.turnover_rate),
      marketCap: num(b?.total_mv),
    }
  })
}

export function mapKlineRows(code: string, rows: TushareRow[]): StockKline[] {
  const out: StockKline[] = rows.map(r => ({
    code: normalizeCode(code),
    date: fmtDate(r.trade_date),
    open: num(r.open) ?? 0,
    close: num(r.close) ?? 0,
    high: num(r.high) ?? 0,
    low: num(r.low) ?? 0,
    volume: num(r.vol) ?? 0,
    amount: num(r.amount) ?? 0,
    changePct: num(r.pct_chg),
    turnoverRate: null,
  }))
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export function mapIndexKlineRows(code: string, rows: TushareRow[]): IndexKline[] {
  const out: IndexKline[] = rows.map(r => ({
    code: normalizeCode(code),
    date: fmtDate(r.trade_date),
    open: num(r.open) ?? 0,
    close: num(r.close) ?? 0,
    high: num(r.high) ?? 0,
    low: num(r.low) ?? 0,
    volume: num(r.vol) ?? undefined,
    amount: num(r.amount) ?? undefined,
    changePct: num(r.pct_chg),
  }))
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export function mapFinancialRows(code: string, rows: TushareRow[], reportType = 'annual'): FinancialSummary[] {
  return rows.map(r => ({
    code: normalizeCode(code),
    reportDate: fmtDate(r.end_date),
    reportType,
    revenue: num(r.total_revenue ?? r.revenue),
    revenueYoy: num(r.tr_yoy ?? r.or_yoy),
    netProfit: num(r.n_income ?? r.netprofit ?? r.profit_dedt),
    netProfitYoy: num(r.netprofit_yoy ?? r.dt_netprofit_yoy),
    eps: num(r.eps ?? r.basic_eps),
    roe: num(r.roe),
    grossMargin: num(r.grossprofit_margin ?? r.gross_margin),
    netMargin: num(r.netprofit_margin),
    debtRatio: num(r.debt_to_assets),
    operatingCashFlow: num(r.ocfps != null && r.ocfps !== '' ? Number(r.ocfps) : null),
    bps: num(r.bps),
  }))
}

export function mapProfileRow(code: string, row: TushareRow, company?: TushareRow): StockProfile {
  const base = company ?? row
  return {
    code: normalizeCode(code),
    name: str(row.name ?? base.name),
    orgName: str(base.com_name ?? base.name),
    industry: str(row.industry),
    listingDate: fmtDate(row.list_date),
    foundDate: fmtDate(base.setup_date),
    mainBusiness: str(base.main_business),
    businessScope: str(base.business_scope),
    orgProfile: str(base.introduction),
    province: str(base.province),
    city: str(base.city),
    employees: num(base.employees),
  }
}

export function mapDividendRows(code: string, rows: TushareRow[]): Dividend[] {
  return rows.map(r => ({
    code: normalizeCode(code),
    exDate: fmtDate(r.ex_date),
    recordDate: fmtDate(r.record_date),
    payDate: fmtDate(r.pay_date),
    cashBonus: num(r.cash_div),
    stockBonus: num(r.stk_div),
    plan: str(r.div_proc),
    progress: str(r.imp_ann_date),
  }))
}

export function mapGenericRows(code: string, rows: TushareRow[]): Record<string, unknown>[] {
  return rows.map(r => ({ code: normalizeCode(code), ts_code: toTsCode(code), ...r }))
}

export function latestOpenTradeDate(rows: TushareRow[], onOrBefore: string): string | null {
  const sorted = rows
    .filter(r => str(r.is_open) === '1' && str(r.cal_date) <= onOrBefore.replace(/-/g, ''))
    .map(r => str(r.cal_date))
    .sort()
  return sorted.length ? sorted[sorted.length - 1] : null
}

export function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function ymdDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
