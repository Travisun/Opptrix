const SH_INDEX_CODES = new Set([
  '000001', '000016', '000300', '000688', '000905', '000906', '000985',
])

export type StockMarket = 'SH' | 'SZ' | 'BJ'

export function isShIndexCode(code: string): boolean {
  return SH_INDEX_CODES.has(normalizeCode(code))
}

export function parseStockMarket(value: unknown): StockMarket | null {
  const m = String(value ?? '').trim().toUpperCase()
  if (m === 'SH' || m === 'SZ' || m === 'BJ') return m
  return null
}

/**
 * 无本地 market 时的代码段推断（个股场景）。
 * 000001 默认深市平安银行；上证指数等应走指数接口或显式传 market=SH。
 */
export function resolveStockMarketCode(code: string): StockMarket {
  const c = normalizeCode(code)
  if (isBseCode(c)) return 'BJ'
  if (c.startsWith('399')) return 'SZ'
  if (c.startsWith('6')) return 'SH'
  if (c.startsWith('9') && !isBseCode(c)) return 'SH'
  if (c.startsWith('3') || c.startsWith('2')) return 'SZ'
  if (c === '000001') return 'SZ'
  if (isShIndexCode(c)) return 'SH'
  if (c.startsWith('0')) return 'SZ'
  return 'SZ'
}

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
  if (isShIndexCode(c)) {
    return 'SH'
  }
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return 'SH'
  return 'SZ'
}

export function resolveSecId(code: string): string {
  const c = normalizeCode(code)
  if (isShIndexCode(c)) {
    return `1.${c}`
  }
  if (c.startsWith('399')) return `0.${c}`
  if (isBse920Code(c)) return `3.${c}`
  if (isBseCode(c)) return `0.${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return `1.${c}`
  return `0.${c}`
}

/** 个股行情/分时：用 market 或代码段推断 secid；指数请用 resolveSecId 或 indexRealtime。 */
export function resolveStockSecId(
  code: string,
  market?: StockMarket | null,
): string {
  const c = normalizeCode(code)
  const m = market ?? resolveStockMarketCode(c)
  if (m === 'SZ') return `0.${c}`
  if (m === 'SH') return `1.${c}`
  return isBse920Code(c) ? `3.${c}` : `0.${c}`
}

/** 从 wire/用户输入提取 6 位 A 股裸码（支持 sh600519、000977.SZ、600519） */
export function bareCnSymbol(code: string): string {
  const raw = String(code ?? '').trim()
  const sec = /^(sh|sz|bj)(\d{6})$/i.exec(raw)
  if (sec) return sec[2]!
  const dot = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(raw)
  if (dot) return dot[1]!
  const baostock = /^(sh|sz)\.(\d{6})$/i.exec(raw)
  if (baostock) return baostock[2]!
  return normalizeCode(raw)
}

/** 是否已为新浪/腾讯 sec 符号（sh600519） */
export function isCnSecPrefixed(code: string): boolean {
  return /^(sh|sz|bj)\d{6}$/i.test(String(code ?? '').trim())
}

/** 构造 sec 符号；已带前缀时幂等返回小写形式 */
export function ensureCnSecSymbol(code: string): string {
  const raw = String(code ?? '').trim()
  const sec = /^(sh|sz|bj)(\d{6})$/i.exec(raw)
  if (sec) return `${sec[1]!.toLowerCase()}${sec[2]!}`
  return buildSecFromBare(bareCnSymbol(raw))
}

function buildSecFromBare(c: string): string {
  if (isBseCode(c)) return `bj${c}`
  if (c.startsWith('399') || (c.startsWith('0') && !c.startsWith('000'))) return `sz${c}`
  if (isShIndexCode(c)) return `sh${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return `sh${c}`
  return `sz${c}`
}

/** Sina / Tencent 等行情 list 参数（如 bj920002、sh600519） */
export function secFullCode(code: string): string {
  return ensureCnSecSymbol(code)
}

/** 显式 exchange 时构造行情 sec 符号，避免同码异名（如 000977）走错交易所 */
export function cnSecSymbol(code: string, exchange?: string | null): string {
  const c = normalizeCode(code)
  const ex = parseStockMarket(exchange)
  if (ex) return `${ex.toLowerCase()}${c}`
  return secFullCode(c)
}

/** 雪球 symbol（如 BJ920002） */
export function secXueqiuSymbol(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `BJ${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c)) || isShIndexCode(c)) {
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
