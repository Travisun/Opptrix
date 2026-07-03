import { zipBaostockRows, type BaostockResult } from '../api/client.js'
import { fromBaostockCode } from '../api/symbols.js'
import { normalizeCode } from '../../../utils/helpers.js'

export function mapBaostockGenericRows(
  result: BaostockResult,
  source: string,
): Record<string, unknown>[] {
  if (result.error_code !== '0') return []
  return zipBaostockRows(result).map(row => ({
    source,
    ...row,
    code: row.code
      ? normalizeCode(fromBaostockCode(String(row.code)))
      : row.code,
  }))
}

export function mapBaostockStockListSpecialty(
  result: BaostockResult,
  source: string,
  day = '',
): Record<string, unknown>[] {
  return mapBaostockGenericRows(result, source).map(row => ({
    ...row,
    tradeDate: day || row.date || row.updateDate,
  }))
}
