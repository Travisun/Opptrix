/** 市场指数点位（非个股价格）：千分位 + 小数，不带货币符号 */
export function formatIndexPoints(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** 指数涨跌点数 */
export function formatIndexChangePoints(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || Number.isNaN(value)) return ''
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

const CN_INDEX_DISPLAY_NAMES: Record<string, string> = {
  '000001': '上证指数',
  '000016': '上证50',
  '000300': '沪深300',
  '000905': '中证500',
  '399001': '深证成指',
  '399006': '创业板指',
  '000688': '科创50',
  HSI: '恒生指数',
}

function looksLikeInstrumentCode(value: string): boolean {
  return /^\d{4,6}$/.test(value) || /^[A-Z]{2,6}$/.test(value)
}

/** 稳定展示指数中文名，避免行情源返回纯代码时顶栏显示编码 */
export function resolveIndexDisplayName(item: {
  name?: string
  code?: string
  qt_code?: string
}): string {
  const code = (item.qt_code || item.code || '').trim()
  const rawName = item.name?.trim() ?? ''
  const fallback = code ? CN_INDEX_DISPLAY_NAMES[code] : undefined

  if (rawName && rawName !== code && !looksLikeInstrumentCode(rawName)) {
    return rawName
  }
  if (fallback) return fallback
  if (rawName && !looksLikeInstrumentCode(rawName)) return rawName
  return fallback ?? rawName ?? code ?? '指数'
}

export function resolveIndexDisplayCode(item: {
  code?: string
  qt_code?: string
  name?: string
}): string {
  const code = (item.qt_code || item.code || '').trim()
  const name = item.name?.trim() ?? ''
  if (!code) return ''
  if (name && name !== code && !looksLikeInstrumentCode(name)) return code
  return code
}

/** 涨跌点数：优先行情字段，缺失时由现价与涨跌幅反推 */
export function resolveIndexChangeAmt(
  price: number | null | undefined,
  changePct: number | null | undefined,
  changeAmt?: number | null,
): number | null {
  if (changeAmt != null && Number.isFinite(changeAmt)) return changeAmt
  if (price == null || changePct == null) return null
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null
  const prev = price / (1 + changePct / 100)
  if (!Number.isFinite(prev) || prev === 0) return null
  const derived = price - prev
  return Number.isFinite(derived) ? derived : null
}
