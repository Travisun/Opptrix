import type { StockListItem, StockProfile } from '../../../core/schema.js'
import { normalizeCode, resolveMarket } from '../../../utils/helpers.js'
import { zipBaostockRows, type BaostockResult } from '../api/client.js'
import { fromBaostockCode } from '../api/symbols.js'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function bareCode(raw: string): string {
  const sym = fromBaostockCode(raw)
  const dot = sym.indexOf('.')
  return normalizeCode(dot > 0 ? sym.slice(0, dot) : sym)
}

function fmtDate(v: unknown): string {
  const s = str(v)
  if (s.length === 8 && !s.includes('-')) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  return s.slice(0, 10)
}

export function mapStockListRows(result: BaostockResult): StockListItem[] {
  return zipBaostockRows(result).map(row => {
    const code = bareCode(str(row.code))
    return {
      code,
      name: str(row.code_name ?? row.codeName),
      industry: '',
      market: resolveMarket(code),
    }
  })
}

export function mapStockBasicRows(result: BaostockResult): StockListItem[] {
  return zipBaostockRows(result).map(row => {
    const code = bareCode(str(row.code))
    return {
      code,
      name: str(row.code_name ?? row.codeName),
      industry: '',
      market: resolveMarket(code),
    }
  })
}

export function mapProfileRow(
  code: string,
  basic: Record<string, string>,
  industry?: Record<string, string>,
): StockProfile {
  const ind = industry ?? {}
  return {
    code: normalizeCode(code),
    name: str(basic.code_name ?? basic.codeName),
    industry: str(ind.industry),
    industryCsrc: str(ind.industryClassification),
    listingDate: fmtDate(basic.ipoDate),
    orgProfile: str(basic.type),
    securityType: str(basic.type),
    formerName: str(basic.code_name ?? basic.codeName),
  }
}

export function mapIndustryRow(row: Record<string, string>): { code: string; industry: string; classification: string } {
  return {
    code: bareCode(str(row.code)),
    industry: str(row.industry),
    classification: str(row.industryClassification),
  }
}
