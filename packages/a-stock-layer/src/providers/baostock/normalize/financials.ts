import type { FinancialSummary } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function fmtStatDate(v: unknown): string {
  return str(v).slice(0, 10)
}

function reportTypeFromStatDate(statDate: string): string {
  const month = statDate.slice(5, 7)
  if (month === '03' || month === '06' || month === '09') return 'quarter'
  return 'annual'
}

function indexByStatDate<T extends Record<string, string>>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const key = fmtStatDate(row.statDate)
    if (key) map.set(key, row)
  }
  return map
}

/** 合并季频 profit / growth / dupont / operation / cashflow 为 FinancialSummary */
export function mergeFinancialSummary(
  code: string,
  profitRows: Record<string, string>[],
  growthRows: Record<string, string>[],
  dupontRows: Record<string, string>[],
  operationRows: Record<string, string>[],
  cashflowRows: Record<string, string>[],
): FinancialSummary[] {
  const profit = indexByStatDate(profitRows)
  const growth = indexByStatDate(growthRows)
  const dupont = indexByStatDate(dupontRows)
  const operation = indexByStatDate(operationRows)
  const cashflow = indexByStatDate(cashflowRows)

  const periods = [...new Set([
    ...profit.keys(),
    ...growth.keys(),
    ...dupont.keys(),
    ...operation.keys(),
    ...cashflow.keys(),
  ])].sort((a, b) => b.localeCompare(a))

  const out: FinancialSummary[] = []
  for (const statDate of periods) {
    const p = profit.get(statDate)
    const g = growth.get(statDate)
    const d = dupont.get(statDate)
    const o = operation.get(statDate)
    const c = cashflow.get(statDate)
    if (!p && !g && !d && !o && !c) continue

    out.push({
      code: normalizeCode(code),
      reportDate: statDate,
      reportType: reportTypeFromStatDate(statDate),
      revenue: num(p?.MBRevenue),
      revenueYoy: num(g?.YOYEquity != null ? g.YOYAsset : g?.YOYEquity),
      netProfit: num(p?.netProfit),
      netProfitYoy: num(g?.YOYNI ?? g?.YOYPNI),
      eps: num(p?.epsTTM),
      roe: num(d?.dupontROE ?? p?.roeAvg),
      grossMargin: num(p?.gpMargin),
      netMargin: num(p?.npMargin),
      debtRatio: num(c?.liabilityToAsset),
      operatingCashFlow: num(c?.CFOToOR),
      bps: null,
    })
  }
  return out
}

export function mapBalanceSheetRecords(
  code: string,
  rows: Record<string, string>[],
  reportDate = '',
): Record<string, unknown>[] {
  let filtered = rows
  if (reportDate) {
    filtered = rows.filter(r => fmtStatDate(r.statDate) >= reportDate.slice(0, 10))
  }
  return filtered
    .sort((a, b) => fmtStatDate(b.statDate).localeCompare(fmtStatDate(a.statDate)))
    .slice(0, 12)
    .map(r => ({
      code: normalizeCode(code),
      reportDate: fmtStatDate(r.statDate),
      pubDate: str(r.pubDate).slice(0, 10),
      currentRatio: num(r.currentRatio),
      quickRatio: num(r.quickRatio),
      cashRatio: num(r.cashRatio),
      liabilityToAsset: num(r.liabilityToAsset),
      assetToEquity: num(r.assetToEquity),
      liabilityYoy: num(r.YOYLiability),
    }))
}

export function mapIncomeStatementRecords(
  code: string,
  rows: Record<string, string>[],
  reportDate = '',
): Record<string, unknown>[] {
  let filtered = rows
  if (reportDate) {
    filtered = rows.filter(r => fmtStatDate(r.statDate) >= reportDate.slice(0, 10))
  }
  return filtered
    .sort((a, b) => fmtStatDate(b.statDate).localeCompare(fmtStatDate(a.statDate)))
    .slice(0, 12)
    .map(r => ({
      code: normalizeCode(code),
      reportDate: fmtStatDate(r.statDate),
      pubDate: str(r.pubDate).slice(0, 10),
      revenue: num(r.MBRevenue),
      netProfit: num(r.netProfit),
      epsBasic: num(r.epsTTM),
      grossMargin: num(r.gpMargin),
      netMargin: num(r.npMargin),
      roeAvg: num(r.roeAvg),
      totalShare: num(r.totalShare),
      liqaShare: num(r.liqaShare),
    }))
}

export function mapCashFlowRecords(
  code: string,
  rows: Record<string, string>[],
  reportDate = '',
): Record<string, unknown>[] {
  let filtered = rows
  if (reportDate) {
    filtered = rows.filter(r => fmtStatDate(r.statDate) >= reportDate.slice(0, 10))
  }
  return filtered
    .sort((a, b) => fmtStatDate(b.statDate).localeCompare(fmtStatDate(a.statDate)))
    .slice(0, 12)
    .map(r => ({
      code: normalizeCode(code),
      reportDate: fmtStatDate(r.statDate),
      pubDate: str(r.pubDate).slice(0, 10),
      caToAsset: num(r.CAToAsset),
      ncaToAsset: num(r.NCAToAsset),
      tangibleToAsset: num(r.tangibleToAsset),
      cfoToOr: num(r.CFOToOR),
      cfoToNp: num(r.CFOToNP),
      cfoToGr: num(r.CFOToGr),
      ebitToInterest: num(r.ebitToInterest),
    }))
}

export function mapOperationRecords(
  code: string,
  rows: Record<string, string>[],
): Record<string, unknown>[] {
  return rows
    .sort((a, b) => fmtStatDate(b.statDate).localeCompare(fmtStatDate(a.statDate)))
    .slice(0, 12)
    .map(r => ({
      code: normalizeCode(code),
      reportDate: fmtStatDate(r.statDate),
      pubDate: str(r.pubDate).slice(0, 10),
      nrTurnRatio: num(r.NRTurnRatio),
      nrTurnDays: num(r.NRTurnDays),
      invTurnRatio: num(r.INVTurnRatio),
      invTurnDays: num(r.INVTurnDays),
      caTurnRatio: num(r.CATurnRatio),
      assetTurnRatio: num(r.AssetTurnRatio),
    }))
}

export function mapDupontRecords(
  code: string,
  rows: Record<string, string>[],
): Record<string, unknown>[] {
  return rows
    .sort((a, b) => fmtStatDate(b.statDate).localeCompare(fmtStatDate(a.statDate)))
    .slice(0, 12)
    .map(r => ({
      code: normalizeCode(code),
      reportDate: fmtStatDate(r.statDate),
      pubDate: str(r.pubDate).slice(0, 10),
      roe: num(r.dupontROE),
      assetStoEquity: num(r.dupontAssetStoEquity),
      assetTurn: num(r.dupontAssetTurn),
      pnitoni: num(r.dupontPnitoni),
      nitogr: num(r.dupontNitogr),
      taxBurden: num(r.dupontTaxBurden),
    }))
}
