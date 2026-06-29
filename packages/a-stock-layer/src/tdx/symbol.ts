import { isBseCode, normalizeCode } from '../utils/helpers.js'

/** Map A-share code → nodetdx symbol (e.g. SH.600519, BJ.920002) */
export function toTdxSymbol(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `BJ.${c}`
  const isSh = c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))
    || (c.startsWith('000') && parseInt(c, 10) < 1000)
  return `${isSh ? 'SH' : 'SZ'}.${c}`
}

export function isIndexCode(code: string): boolean {
  const c = normalizeCode(code)
  return (c.startsWith('000') && parseInt(c, 10) < 1000) || c.startsWith('399')
}
