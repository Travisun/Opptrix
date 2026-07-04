import { isShIndexCode, normalizeCode, resolveMarket, secFullCode } from '../../../utils/helpers.js'

/** Sina hq.sinajs.cn list key for A-share / index (e.g. sh600519, sz399001). */
export function toSinaListSymbol(code: string): string {
  return secFullCode(code)
}

/** Compact index snapshot prefix (e.g. s_sh000001). */
export function toSinaIndexListSymbol(code: string): string {
  const base = secFullCode(code)
  return `s_${base}`
}

/** K-line API symbol — same as list symbol without s_ prefix. */
export function toSinaKlineSymbol(code: string): string {
  const c = normalizeCode(code)
  if (isShIndexCode(c) || (c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000)) {
    return `sh${c}`
  }
  if (c.startsWith('399')) return `sz${c}`
  return secFullCode(c)
}

export function fromSinaListSymbol(symbol: string): string {
  const raw = String(symbol ?? '').trim().replace(/^s_/, '')
  const body = raw.replace(/^(sh|sz|bj)/i, '')
  return normalizeCode(body)
}

export function resolveSinaMarket(code: string): 'SH' | 'SZ' | 'BJ' {
  return resolveMarket(code)
}
