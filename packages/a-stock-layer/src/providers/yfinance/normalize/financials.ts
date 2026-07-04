import type { FinancialSummary } from '../../../core/schema.js'
import { normalizeUsSymbol } from '../../../utils/us-market.js'

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const raw = typeof v === 'object' && v && 'raw' in v
    ? (v as { raw?: unknown }).raw
    : v
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function fmtEpoch(v: unknown): string {
  const raw = typeof v === 'object' && v && 'raw' in v
    ? (v as { raw?: unknown }).raw
    : v
  const n = num(raw)
  if (n == null) return ''
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function historyRows(
  container: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown>[] {
  if (!container) return []
  const list = container[key]
  return Array.isArray(list) ? list as Record<string, unknown>[] : []
}

export function mapYfinanceFinancials(
  json: Record<string, unknown>,
  displayCode: string,
  reportType = 'annual',
): FinancialSummary[] | null {
  const result = ((json.quoteSummary as Record<string, unknown>)?.result as unknown[])?.[0] as Record<string, unknown> | undefined
  if (!result) return null

  const income = historyRows(result.incomeStatementHistory as Record<string, unknown>, 'incomeStatementHistory')[0]
  const balance = historyRows(result.balanceSheetHistory as Record<string, unknown>, 'balanceSheetHistory')[0]
  const cash = historyRows(result.cashflowStatementHistory as Record<string, unknown>, 'cashflowStatementHistory')[0]
  const financialData = result.financialData as Record<string, unknown> | undefined

  const reportDate = fmtEpoch(income?.endDate)
    || fmtEpoch(balance?.endDate)
    || fmtEpoch(cash?.endDate)
  if (!reportDate && !financialData) return null

  const code = normalizeUsSymbol(displayCode)
  const row: FinancialSummary = {
    code,
    reportDate: reportDate || new Date().toISOString().slice(0, 10),
    reportType,
    revenue: num(income?.totalRevenue) ?? num(financialData?.totalRevenue),
    revenueYoy: num(financialData?.revenueGrowth) != null
      ? (num(financialData?.revenueGrowth)! * 100)
      : null,
    netProfit: num(income?.netIncome) ?? num(financialData?.profitMargins),
    netProfitYoy: num(financialData?.earningsGrowth) != null
      ? (num(financialData?.earningsGrowth)! * 100)
      : null,
    eps: num(income?.dilutedEPS) ?? num(income?.basicEPS),
    roe: num(financialData?.returnOnEquity) != null
      ? (num(financialData?.returnOnEquity)! * 100)
      : null,
    grossMargin: num(financialData?.grossMargins) != null
      ? (num(financialData?.grossMargins)! * 100)
      : null,
    netMargin: num(financialData?.profitMargins) != null
      ? (num(financialData?.profitMargins)! * 100)
      : null,
    debtRatio: num(financialData?.debtToEquity),
    operatingCashFlow: num(cash?.totalCashFromOperatingActivities)
      ?? num(financialData?.operatingCashflow),
    bps: num(balance?.totalStockholderEquity),
    totalAssets: num(balance?.totalAssets),
    totalLiabilities: num(balance?.totalLiab),
  }
  return [row]
}
