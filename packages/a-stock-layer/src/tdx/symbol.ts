import { normalizeCode } from '../utils/helpers.js'

/** Map A-share code → nodetdx symbol (e.g. SH.600519) */
export function toTdxSymbol(code: string): string {
  const c = normalizeCode(code)
  const isSh = c.startsWith('6') || c.startsWith('9')
    || (c.startsWith('000') && parseInt(c, 10) < 1000)
  return `${isSh ? 'SH' : 'SZ'}.${c}`
}

export function isIndexCode(code: string): boolean {
  const c = normalizeCode(code)
  return (c.startsWith('000') && parseInt(c, 10) < 1000) || c.startsWith('399')
}
