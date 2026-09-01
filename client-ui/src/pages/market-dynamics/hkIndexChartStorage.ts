const STORAGE_KEY = 'opptrix-market-hk-index-chart'

export function readHkIndexChartCode(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw?.trim() || null
  } catch {
    return null
  }
}

export function writeHkIndexChartCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, code.trim())
  } catch {
    /* ignore */
  }
}

export function hkChartCodeFromIndex(item: { chart_symbol?: string | null; code?: string }): string | null {
  const sym = item.chart_symbol?.trim()
  if (sym) return sym
  const code = item.code?.trim()
  return code || null
}
