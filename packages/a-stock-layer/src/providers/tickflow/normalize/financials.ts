import type { FinancialSummary } from '../../../core/schema.js'
import { parseTickflowSymbol } from '../api/symbols.js'

export interface TickflowMetricsRecord {
  period_end: string
  announce_date?: string | null
  eps_basic?: number | null
  eps_diluted?: number | null
  bps?: number | null
  roe?: number | null
  roa?: number | null
  gross_margin?: number | null
  net_margin?: number | null
  debt_to_asset_ratio?: number | null
  ocfps?: number | null
  revenue_yoy?: number | null
  net_income_yoy?: number | null
}

export interface TickflowIncomeRecord {
  period_end: string
  announce_date?: string | null
  revenue?: number | null
  operating_profit?: number | null
  total_profit?: number | null
  net_income?: number | null
  net_income_attributable?: number | null
  net_income_deducted?: number | null
  basic_eps?: number | null
  diluted_eps?: number | null
  rd_expense?: number | null
}

export interface TickflowBalanceSheetRecord {
  period_end: string
  announce_date?: string | null
  total_assets?: number | null
  total_liabilities?: number | null
  total_equity?: number | null
  cash_and_equivalents?: number | null
  accounts_receivable?: number | null
  inventory?: number | null
  fixed_assets?: number | null
  short_term_borrowing?: number | null
  long_term_borrowing?: number | null
}

export interface TickflowCashFlowRecord {
  period_end: string
  announce_date?: string | null
  net_operating_cash_flow?: number | null
  net_investing_cash_flow?: number | null
  net_financing_cash_flow?: number | null
  net_cash_change?: number | null
  capex?: number | null
}

/** 股本结构单期记录 — TickFlow `/v1/financials/shares` */
export interface TickflowSharesRecord {
  period_end: string
  announce_date?: string | null
  float_shares?: number | null
  total_shares?: number | null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** TickFlow ratio fields are decimals (0.15 → 15%). */
function pctFromDecimal(v: unknown): number | null {
  const n = num(v)
  if (n == null) return null
  return Math.abs(n) <= 1 ? n * 100 : n
}

function yoyPct(v: unknown): number | null {
  const n = num(v)
  if (n == null) return null
  return Math.abs(n) <= 1 ? n * 100 : n
}

function reportTypeFromPeriodEnd(periodEnd: string, explicit?: string): string {
  if (explicit === 'quarter' || explicit === 'quarterly') return 'quarter'
  if (explicit === 'annual') return 'annual'
  const month = periodEnd.slice(5, 7)
  if (month === '03' || month === '06' || month === '09') return 'quarter'
  return 'annual'
}

function indexByPeriod<T extends { period_end: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const key = String(row.period_end ?? '').slice(0, 10)
    if (key) map.set(key, row)
  }
  return map
}

export function mergeFinancialSummary(
  tickflowSymbol: string,
  metricsRows: TickflowMetricsRecord[],
  incomeRows: TickflowIncomeRecord[],
  reportType = 'annual',
): FinancialSummary[] {
  const { code } = parseTickflowSymbol(tickflowSymbol)
  const metrics = indexByPeriod(metricsRows)
  const income = indexByPeriod(incomeRows)
  const periods = [...new Set([...metrics.keys(), ...income.keys()])].sort((a, b) => b.localeCompare(a))
  const out: FinancialSummary[] = []

  for (const periodEnd of periods) {
    const m = metrics.get(periodEnd)
    const i = income.get(periodEnd)
    if (!m && !i) continue
    out.push({
      code,
      reportDate: periodEnd,
      reportType: reportTypeFromPeriodEnd(periodEnd, reportType),
      revenue: num(i?.revenue),
      revenueYoy: yoyPct(m?.revenue_yoy),
      netProfit: num(i?.net_income_attributable ?? i?.net_income),
      netProfitYoy: yoyPct(m?.net_income_yoy),
      eps: num(m?.eps_basic ?? i?.basic_eps),
      roe: pctFromDecimal(m?.roe),
      grossMargin: pctFromDecimal(m?.gross_margin),
      netMargin: pctFromDecimal(m?.net_margin),
      debtRatio: pctFromDecimal(m?.debt_to_asset_ratio),
      operatingCashFlow: num(m?.ocfps),
      bps: num(m?.bps),
    })
  }

  return out
}

export function mapBalanceSheetRecords(
  tickflowSymbol: string,
  rows: TickflowBalanceSheetRecord[],
  reportDate = '',
): Record<string, unknown>[] {
  const { code } = parseTickflowSymbol(tickflowSymbol)
  let filtered = rows
  if (reportDate) filtered = rows.filter(r => String(r.period_end).slice(0, 10) >= reportDate)
  return filtered
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))
    .slice(0, 12)
    .map(r => ({
      code,
      reportDate: String(r.period_end).slice(0, 10),
      totalAssets: num(r.total_assets),
      totalLiabilities: num(r.total_liabilities),
      totalEquity: num(r.total_equity),
      cash: num(r.cash_and_equivalents),
      accountsReceivable: num(r.accounts_receivable),
      inventory: num(r.inventory),
      fixedAssets: num(r.fixed_assets),
      shortTermBorrowing: num(r.short_term_borrowing),
      longTermBorrowing: num(r.long_term_borrowing),
    }))
}

export function mapIncomeStatementRecords(
  tickflowSymbol: string,
  rows: TickflowIncomeRecord[],
  reportDate = '',
): Record<string, unknown>[] {
  const { code } = parseTickflowSymbol(tickflowSymbol)
  let filtered = rows
  if (reportDate) filtered = rows.filter(r => String(r.period_end).slice(0, 10) >= reportDate)
  return filtered
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))
    .slice(0, 12)
    .map(r => ({
      code,
      reportDate: String(r.period_end).slice(0, 10),
      revenue: num(r.revenue),
      operatingProfit: num(r.operating_profit),
      totalProfit: num(r.total_profit),
      netProfit: num(r.net_income_attributable ?? r.net_income),
      netProfitDeducted: num(r.net_income_deducted),
      epsBasic: num(r.basic_eps),
      epsDiluted: num(r.diluted_eps),
      rdExpense: num(r.rd_expense),
    }))
}

export function mapCashFlowRecords(
  tickflowSymbol: string,
  rows: TickflowCashFlowRecord[],
  reportDate = '',
): Record<string, unknown>[] {
  const { code } = parseTickflowSymbol(tickflowSymbol)
  let filtered = rows
  if (reportDate) filtered = rows.filter(r => String(r.period_end).slice(0, 10) >= reportDate)
  return filtered
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))
    .slice(0, 12)
    .map(r => ({
      code,
      reportDate: String(r.period_end).slice(0, 10),
      operatingNetCash: num(r.net_operating_cash_flow),
      investingNetCash: num(r.net_investing_cash_flow),
      financingNetCash: num(r.net_financing_cash_flow),
      netCashChange: num(r.net_cash_change),
      capex: num(r.capex),
    }))
}

export function rowsForSymbol<T>(
  data: Record<string, T[]> | undefined,
  tickflowSymbol: string,
): T[] {
  if (!data) return []
  const direct = data[tickflowSymbol]
  if (direct?.length) return direct
  const upper = data[tickflowSymbol.toUpperCase()]
  if (upper?.length) return upper
  const key = Object.keys(data).find(k => k.toUpperCase() === tickflowSymbol.toUpperCase())
  return key ? (data[key] ?? []) : []
}

/**
 * 股本结构 → 股东/股本 Capability 行。
 *
 * @param tickflowSymbol TickFlow 完整代码
 * @param rows `/v1/financials/shares` 单标的记录
 * @param reportDate 可选报告期过滤 YYYY-MM-DD
 */
export function mapShareholderRecords(
  tickflowSymbol: string,
  rows: TickflowSharesRecord[],
  reportDate = '',
): Record<string, unknown>[] {
  const { code } = parseTickflowSymbol(tickflowSymbol)
  let filtered = rows
  if (reportDate) {
    const hint = reportDate.slice(0, 10)
    filtered = rows.filter(r => String(r.period_end).slice(0, 10) === hint)
  }
  return filtered
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)))
    .map(r => ({
      code,
      reportDate: String(r.period_end).slice(0, 10),
      announceDate: r.announce_date ?? null,
      totalShares: num(r.total_shares),
      floatShares: num(r.float_shares),
      source: 'tickflow',
    }))
}
