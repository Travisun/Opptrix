export function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

/** 按市场格式化价格 — CN 保留小数；US/JP/KR/HK 同；Crypto 低价多小数位 */
export function formatPriceForMarket(
  market: string | undefined,
  value: number | null | undefined,
  digits?: number,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (market === 'CRYPTO') {
    const d = digits ?? (Math.abs(value) < 1 ? 4 : 2)
    return value.toFixed(d)
  }
  if (market === 'JP' && Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: digits ?? 0 })
  }
  return value.toFixed(digits ?? 2)
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`
  return value.toFixed(2)
}

/** 按市场格式化大数 — 中文万/亿 vs 英文 K/M/B */
export function formatCompactNumberForMarket(
  market: string | undefined,
  value: number | null | undefined,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const useWestern = market === 'US' || market === 'HK' || market === 'JP' || market === 'KR' || market === 'CRYPTO'
  if (useWestern) {
    if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`
    return value.toFixed(2)
  }
  return formatCompactNumber(value)
}

export function pctTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value == null || Number.isNaN(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

export function normalizeCode(code: string): string {
  return code.trim().padStart(6, '0')
}

/** 持仓 map 键 — A 股六位，港/美用展示代码 */
export function portfolioHoldingsKey(code: string, market?: string): string {
  const trimmed = code.trim()
  if (market && market !== 'CN') return trimmed
  if (/^\d+$/.test(trimmed) && trimmed.length <= 6) return normalizeCode(trimmed)
  return trimmed
}

/** 无 exchange 时可安全判为上证指数的常见代码（不含 000001） */
const SH_CN_INDEX_CODES = new Set([
  '000016', '000300', '000688', '000905', '000906', '000985',
])

/** 从代码段推断交易所（无 exchange 时兜底，与 shared inferCnExchangeFromSymbol 对齐） */
export function inferCnExchangeFromCode(code: string): 'SH' | 'SZ' | 'BJ' {
  const c = normalizeCode(code)
  if (c.startsWith('92') || c.startsWith('43') || c.startsWith('83') || c.startsWith('87')) return 'BJ'
  if (c.startsWith('399')) return 'SZ'
  if (c.startsWith('6')) return 'SH'
  if (c.startsWith('9')) return 'SH'
  if (c.startsWith('3') || c.startsWith('2')) return 'SZ'
  if (c === '000001') return 'SZ'
  if (SH_CN_INDEX_CODES.has(c)) return 'SH'
  if (c.startsWith('0')) return 'SZ'
  return 'SZ'
}

function inferCnAssetClass(code: string, exchange: 'SH' | 'SZ' | 'BJ'): 'EQUITY' | 'ETF' | 'INDEX' {
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return 'ETF'
  if (exchange === 'SZ') return c.startsWith('399') ? 'INDEX' : 'EQUITY'
  if (exchange === 'SH') return (c.startsWith('000') && c.length === 6) ? 'INDEX' : 'EQUITY'
  return 'EQUITY'
}

/** A 股指数判定 — 以 exchange 为主键 */
export function isCnIndexCode(code: string, exchange?: string | null): boolean {
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return false
  const ex = (exchange ?? inferCnExchangeFromCode(c)).toUpperCase()
  if (ex === 'SZ') return c.startsWith('399')
  if (ex === 'SH') return c.startsWith('000') && c.length === 6
  return false
}

/** A 股 ETF 代码段（宽基/行业/跨境等） */
export function isCnEtfCode(code: string): boolean {
  const c = normalizeCode(code)
  if (c.length !== 6) return false
  const head2 = c.slice(0, 2)
  const head3 = c.slice(0, 3)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (head3 === '159' || head2 === '16') return true
  return false
}

export function hasCjkText(value: string | null | undefined): boolean {
  return Boolean(value && /[\u4e00-\u9fff]/.test(value))
}

/** Prefer Chinese name from quote / radar / stored watchlist item. */
export function resolveDisplayStockName(
  code: string,
  ...candidates: Array<string | null | undefined>
): string {
  const normalized = normalizeCode(code)
  const clean = candidates
    .map(c => c?.trim())
    .filter((c): c is string => Boolean(c && c !== normalized))
  const cjk = clean.find(hasCjkText)
  if (cjk) return cjk
  if (clean[0]) return clean[0]
  return normalized
}

/** A-share volume in lots (手). */
export function formatVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿手`
  if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万手`
  return `${value.toFixed(0)}手`
}

export function formatSignedNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}
