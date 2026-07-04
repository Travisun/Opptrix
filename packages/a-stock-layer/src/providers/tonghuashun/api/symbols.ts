import { normalizeCode, resolveMarket } from '../../../utils/helpers.js'

/** Opptrix bare code → Fuyao thscode (e.g. 600519 → 600519.SH) */
export function toThsCode(code: string): string {
  const c = normalizeCode(code)
  return `${c}.${resolveMarket(c)}`
}

/** Fuyao thscode → bare code */
export function fromThsCode(thscode: string): string {
  const raw = String(thscode ?? '').trim()
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return normalizeCode(raw)
  return normalizeCode(raw.slice(0, dot))
}

/** Standard A-share index thscode (000300 → 000300.SH) */
export function toIndexThsCode(code: string): string {
  const c = normalizeCode(code)
  if (c.includes('.')) return c.toUpperCase()
  if (c.startsWith('399') || c.startsWith('88')) return `${c}.${c.startsWith('399') ? 'SZ' : 'TI'}`
  return `${c}.SH`
}
