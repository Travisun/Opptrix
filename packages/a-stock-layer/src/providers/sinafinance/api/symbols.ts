import { bareCnSymbol, ensureCnSecSymbol, isCnSecPrefixed, isShIndexCode, normalizeCode, resolveMarket, secFullCode } from '../../../utils/helpers.js'

/** Sina hq.sinajs.cn list key（如 sh600519） */
export function toSinaListSymbol(code: string): string {
  return ensureCnSecSymbol(code)
}

/** 新浪指数精简快照前缀（如 s_sh000001） */
export function toSinaIndexListSymbol(code: string): string {
  return `s_${ensureCnSecSymbol(code)}`
}

/** 新浪 K 线 symbol */
export function toSinaKlineSymbol(code: string): string {
  if (isCnSecPrefixed(code)) return ensureCnSecSymbol(code)
  const c = bareCnSymbol(code)
  if (isShIndexCode(c)) {
    return `sh${c}`
  }
  if (c.startsWith('399')) return `sz${c}`
  return ensureCnSecSymbol(c)
}

export function fromSinaListSymbol(symbol: string): string {
  const raw = String(symbol ?? '').trim().replace(/^s_/, '')
  const body = raw.replace(/^(sh|sz|bj)/i, '')
  return normalizeCode(body)
}

export function resolveSinaMarket(code: string): 'SH' | 'SZ' | 'BJ' {
  return resolveMarket(code)
}
