import { STOCK_CODE_LENGTH } from './constants.js'

const EXCHANGE_TO_BAO: Record<string, string> = {
  SH: 'sh',
  SZ: 'sz',
  sh: 'sh',
  sz: 'sz',
}

const BAO_TO_EXCHANGE: Record<string, string> = {
  sh: 'SH',
  sz: 'SZ',
}

/** Opptrix symbol (600000.SH) → Baostock (sh.600000) */
export function toBaostockCode(symbol: string): string {
  const raw = symbol.trim()
  if (!raw) return raw

  const dot = raw.indexOf('.')
  if (dot > 0) {
    const code = raw.slice(0, dot)
    const exch = EXCHANGE_TO_BAO[raw.slice(dot + 1)] ?? raw.slice(dot + 1).toLowerCase()
    return `${exch}.${code}`
  }

  return normalizeBaostockCode(raw)
}

/** Baostock (sh.600000) → Opptrix symbol (600000.SH) */
export function fromBaostockCode(code: string): string {
  const normalized = normalizeBaostockCode(code)
  const dot = normalized.indexOf('.')
  if (dot <= 0) return normalized
  const prefix = normalized.slice(0, dot)
  const num = normalized.slice(dot + 1)
  const exch = BAO_TO_EXCHANGE[prefix] ?? prefix.toUpperCase()
  return `${num}.${exch}`
}

/** Normalize various Baostock code inputs to sh.600000 form */
export function normalizeBaostockCode(code: string): string {
  let c = code.trim().toLowerCase()
  if (!c) return c

  if (c.length === STOCK_CODE_LENGTH && c.includes('.')) return c

  if ((c.endsWith('sh') || c.endsWith('sz')) && c.length >= 8) {
    const suffix = c.slice(-2)
    const num = c.slice(0, -2)
    return `${suffix}.${num}`
  }

  const dot = c.indexOf('.')
  if (dot > 0 && dot < c.length - 1) {
    const left = c.slice(0, dot)
    const right = c.slice(dot + 1)
    if (right.length === 2 && (right === 'sh' || right === 'sz')) {
      return `${right}.${left}`
    }
  }

  return c
}

/** sh.600000 → SSE | SZSE */
export function baostockMarketFromCode(code: string): 'SSE' | 'SZSE' | null {
  const normalized = normalizeBaostockCode(code)
  const prefix = normalized.split('.')[0]
  if (prefix === 'sh') return 'SSE'
  if (prefix === 'sz') return 'SZSE'
  return null
}
