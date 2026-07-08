/** 港股代码识别 — 5 位数字（非 6 位 A 股） */

export function normalizeHkEquityCode(symbol: string): string {
  const raw = symbol.trim().replace(/^HK:/i, '')
  if (/^hk\d/i.test(raw)) {
    return raw.slice(2).replace(/\D/g, '').padStart(5, '0')
  }
  return raw.replace(/\D/g, '').padStart(5, '0')
}

/** 是否为港股个股代码（1–5 位纯数字，或 hk 前缀；排除 6 位 A 股） */
export function isValidHkSymbol(symbol: string): boolean {
  const raw = symbol.trim()
  if (!raw) return false
  if (/^HK:/i.test(raw)) return true
  if (/^hk\d/i.test(raw)) return true
  const body = raw.replace(/^HK:/i, '')
  if (/[A-Za-z]/.test(body)) return false
  const digits = body.replace(/\D/g, '')
  if (!digits) return false
  if (digits.length === 6) return false
  return digits.length >= 1 && digits.length <= 5
}
