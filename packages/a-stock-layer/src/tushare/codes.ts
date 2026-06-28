import { normalizeCode } from '../utils/helpers.js'

export function toTsCode(code: string): string {
  const c = normalizeCode(code)
  if (c.startsWith('399') || c.startsWith('159') || c.startsWith('16')) return `${c}.SZ`
  if (c.startsWith('6') || c.startsWith('9') || (c.startsWith('000') && parseInt(c, 10) < 1000)) {
    return `${c}.SH`
  }
  return `${c}.SZ`
}

export function fromTsCode(tsCode: string): string {
  return normalizeCode(tsCode.split('.')[0] ?? tsCode)
}

export function indexTsCode(code: string): string {
  const c = normalizeCode(code)
  if (c.startsWith('399')) return `${c}.SZ`
  if (c.startsWith('000') && parseInt(c, 10) < 1000) return `${c}.SH`
  return toTsCode(c)
}
