const SH_INDEX_CODES = new Set([
  '000001', '000016', '000300', '000688', '000905', '000906', '000985',
])

/** 北交所股票（920 新代码；43/83/87 为存量旧代码） */
export function isBseCode(code: string): boolean {
  const c = normalizeCode(code)
  return c.startsWith('92') || c.startsWith('43') || c.startsWith('83') || c.startsWith('87')
}

/** 北交所 920 新代码段（东财 push2 secid 使用 3. 前缀） */
export function isBse920Code(code: string): boolean {
  return normalizeCode(code).startsWith('92')
}

export function resolveMarket(code: string): 'BJ' | 'SH' | 'SZ' {
  const c = normalizeCode(code)
  if (isBseCode(c)) return 'BJ'
  if (c.startsWith('399')) return 'SZ'
  if (SH_INDEX_CODES.has(c) || (c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000)) {
    return 'SH'
  }
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return 'SH'
  return 'SZ'
}

export function resolveSecId(code: string): string {
  const c = normalizeCode(code)
  if (SH_INDEX_CODES.has(c) || (c.startsWith('000') && c.length === 6 && parseInt(c, 10) < 1000)) {
    return `1.${c}`
  }
  if (c.startsWith('399')) return `0.${c}`
  if (isBse920Code(c)) return `3.${c}`
  if (isBseCode(c)) return `0.${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return `1.${c}`
  return `0.${c}`
}

/** Sina / Tencent 等行情 list 参数（如 bj920002、sh600519） */
export function secFullCode(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `bj${c}`
  if (c.startsWith('399') || (c.startsWith('0') && !c.startsWith('000'))) return `sz${c}`
  if (c.startsWith('000') && parseInt(c, 10) < 1000) return `sh${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return `sh${c}`
  return `sz${c}`
}

/** 雪球 symbol（如 BJ920002） */
export function secXueqiuSymbol(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `BJ${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c)) || (c.startsWith('000') && parseInt(c, 10) < 1000)) {
    return `SH${c}`
  }
  return `SZ${c}`
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
