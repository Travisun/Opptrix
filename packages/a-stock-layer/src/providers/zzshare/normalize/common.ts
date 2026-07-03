import { normalizeCode, resolveMarket } from '../../../utils/helpers.js'

export type ZzshareRow = Record<string, unknown>

export function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function str(v: unknown): string {
  return v == null ? '' : String(v)
}

export function pick(row: ZzshareRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key]
  }
  return undefined
}

/** 600000.SH → 600000 */
export function bareCodeFromTsCode(tsCode: string): string {
  const raw = tsCode.trim()
  const dot = raw.indexOf('.')
  return normalizeCode(dot > 0 ? raw.slice(0, dot) : raw)
}

export function codeFromRow(row: ZzshareRow, fallback = ''): string {
  const raw = str(pick(row, 'ts_code', 'symbol', 'code', 'stock_code', 'stock_id', 'b_code'))
  if (!raw) return normalizeCode(fallback)
  return raw.includes('.') ? bareCodeFromTsCode(raw) : normalizeCode(raw || fallback)
}

export function fmtYmd(v: unknown): string {
  const s = str(v).replace(/\D/g, '')
  if (s.length >= 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return str(v).slice(0, 10)
}

export function fmtTradeTime(v: unknown): string {
  const raw = str(v).trim()
  if (!raw) return raw
  if (raw.includes('-') || raw.includes(':')) {
    const normalized = raw.replace('T', ' ')
    if (normalized.includes(' ')) return normalized.slice(0, 19)
    return fmtYmd(raw)
  }
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 12) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14) || '00'}`
  }
  if (digits.length === 8) return fmtYmd(digits)
  return raw
}

export function marketFromRow(row: ZzshareRow, code: string): string {
  const exchange = str(pick(row, 'exchange', 'market', 'exchang')).toUpperCase()
  if (exchange === 'SSE' || exchange === 'SH' || exchange === 'SS') return 'SH'
  if (exchange === 'SZSE' || exchange === 'SZ') return 'SZ'
  if (exchange === 'BSE' || exchange === 'BJ') return 'BJ'
  return resolveMarket(code)
}

/** Normalize Zzshare API payloads to row arrays. */
export function rowsFromPayload(data: unknown): ZzshareRow[] {
  if (data == null) return []
  if (Array.isArray(data)) {
    return data.filter((item): item is ZzshareRow => !!item && typeof item === 'object' && !Array.isArray(item))
  }
  if (typeof data !== 'object') return []

  const obj = data as Record<string, unknown>
  const list = obj.list
  if (Array.isArray(list)) {
    return list.filter((item): item is ZzshareRow => !!item && typeof item === 'object' && !Array.isArray(item))
  }

  const nested = obj.data
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedList = (nested as Record<string, unknown>).list
    if (Array.isArray(nestedList)) {
      return nestedList.filter((item): item is ZzshareRow => !!item && typeof item === 'object' && !Array.isArray(item))
    }
  }

  return Object.values(obj).filter((item): item is ZzshareRow => !!item && typeof item === 'object' && !Array.isArray(item))
}

/** Dict-shaped payloads (e.g. uplimit_stocks) → row array with key preserved. */
export function dictRowsFromPayload(data: unknown, keyField = 'key'): ZzshareRow[] {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return rowsFromPayload(data)
  }
  const obj = data as Record<string, unknown>
  if ('list' in obj || 'data' in obj || 'x' in obj) return rowsFromPayload(data)
  return Object.entries(obj).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { [keyField]: key, ...(value as ZzshareRow) }
    }
    return { [keyField]: key, value }
  })
}

export function genericRecords(data: unknown): Record<string, unknown>[] {
  return rowsFromPayload(data).map(row => ({ ...row }))
}
