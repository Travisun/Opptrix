import { isBseCode, normalizeCode, resolveMarket } from '../../../utils/helpers.js'

/** NetEase 7-digit quote/kline code: 0=SH, 1=SZ, 2=BJ + 6-digit symbol. */
export function toNeteaseCode(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `2${c}`
  if (resolveMarket(c) === 'SH') return `0${c}`
  return `1${c}`
}

export function fromNeteaseCode(neteaseCode: string): string {
  const raw = String(neteaseCode ?? '').trim()
  if (raw.length < 7) return normalizeCode(raw.slice(1))
  return normalizeCode(raw.slice(1))
}
