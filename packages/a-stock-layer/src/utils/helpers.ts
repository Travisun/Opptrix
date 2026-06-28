const SH_INDEX_CODES = new Set([
  '000001', '000016', '000300', '000688', '000905', '000906', '000985',
])

export function resolveSecId(code: string): string {
  const c = code.trim().padStart(6, '0')
  if (SH_INDEX_CODES.has(c) || c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000) {
    return `1.${c}`
  }
  if (c.startsWith('399')) return `0.${c}`
  if (c.startsWith('6') || c.startsWith('9')) return `1.${c}`
  return `0.${c}`
}

export function normalizeCode(code: string): string {
  return code.trim().padStart(6, '0')
}

export function normalizePrice(v: unknown): number | null {
  const f = safeFloat(v)
  if (f == null) return null
  if (Math.abs(f) > 100000) return f / 100
  return f
}

export function normalizeChangePct(v: unknown): number | null {
  const f = safeFloat(v)
  if (f == null) return null
  if (Math.abs(f) > 50) return f / 100
  return f
}

export function safeFloat(v: unknown): number | null {
  if (v == null || v === '' || v === '-') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Preserve minute datetime from EastMoney kline (YYYY-MM-DD HH:mm[:ss]). */
export function normalizeKlineDateTime(raw: string): string {
  const v = String(raw).trim()
  if (!v) return v
  if (!v.includes(' ')) return v.slice(0, 10)
  const [datePart, timePart = ''] = v.split(/\s+/)
  const date = datePart.slice(0, 10)
  const rawTime = timePart.slice(0, 8)
  const time = rawTime.length === 5 ? `${rawTime}:00` : rawTime
  return `${date} ${time}`
}
