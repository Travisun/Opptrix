export function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
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

export function pctTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value == null || Number.isNaN(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

export function normalizeCode(code: string): string {
  return code.trim().padStart(6, '0')
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
