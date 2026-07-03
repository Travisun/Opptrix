import { normalizeCode } from '../../../utils/helpers.js'
import { zipBaostockRows, type BaostockResult } from '../api/client.js'
import { fromBaostockCode } from '../api/symbols.js'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

const INDEX_NAMES: Record<string, string> = {
  '000300': '沪深300',
  '000016': '上证50',
  '000905': '中证500',
}

export function resolveIndexConstQuery(indexCode: string): 'hs300' | 'sz50' | 'zz500' | null {
  const c = normalizeCode(indexCode)
  if (c === '000300' || c === '399300') return 'hs300'
  if (c === '000016') return 'sz50'
  if (c === '000905') return 'zz500'
  return null
}

export function mapIndexConstituentRows(
  indexCode: string,
  result: BaostockResult,
): Record<string, unknown>[] {
  const c = normalizeCode(indexCode)
  const indexName = INDEX_NAMES[c] ?? c
  return zipBaostockRows(result).map(row => {
    const stockCode = normalizeCode(fromBaostockCode(str(row.code)))
    return {
      indexCode: c,
      indexName,
      stockCode,
      stockName: str(row.code_name ?? row.codeName),
      weight: null,
      updateDate: str(row.updateDate).slice(0, 10),
    }
  }).filter(r => r.stockCode && r.stockCode !== '000000')
}
