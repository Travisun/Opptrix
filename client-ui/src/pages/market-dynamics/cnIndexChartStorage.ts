const STORAGE_KEY = 'opptrix-market-cn-index-chart'

export function readCnIndexChartCode(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw?.trim() || null
  } catch {
    return null
  }
}

export function writeCnIndexChartCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, code.trim())
  } catch {
    /* ignore */
  }
}

export { indexChartCodeFromQuote } from './marketBoardUtils'
