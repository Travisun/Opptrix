import type { Dividend } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'
import { zipBaostockRows, type BaostockResult } from '../api/client.js'

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
  if (!s) return ''
  if (s.length === 8 && !s.includes('-')) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  return s.slice(0, 10)
}

export function mapDividendRows(code: string, result: BaostockResult): Dividend[] {
  return zipBaostockRows(result).map(row => ({
    code: normalizeCode(code),
    year: fmtDate(row.dividePreNoticeDate ?? row.divAnnual).slice(0, 4) || undefined,
    cashBonus: num(row.dividCashPsBeforeTax ?? row.dividendsps),
    stockBonus: num(row.dividStockPs),
    exDate: fmtDate(row.dividePayDate ?? row.dividOperateDate),
    recordDate: fmtDate(row.dividRegistDate),
    payDate: fmtDate(row.dividPayDate),
    plan: str(row.divProc ?? row.dividCashStock),
    progress: str(row.divAnnual ?? row.dividePreNoticeDate),
  }))
}

export function mergeDividendResults(code: string, results: BaostockResult[]): Dividend[] {
  const out: Dividend[] = []
  for (const result of results) {
    out.push(...mapDividendRows(code, result))
  }
  out.sort((a, b) => (b.exDate ?? '').localeCompare(a.exDate ?? ''))
  return out
}
