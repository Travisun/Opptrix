export interface UsTechSymbol {
  symbol: string
  name: string
}

export const DEFAULT_US_TECH_SYMBOLS: UsTechSymbol[] = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'TSLA', name: 'Tesla' },
]

const STORAGE_KEY = 'opptrix-us-tech-watch'

export function readUsTechWatch(): UsTechSymbol[] {
  if (typeof window === 'undefined') return DEFAULT_US_TECH_SYMBOLS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_US_TECH_SYMBOLS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_US_TECH_SYMBOLS
    const rows = parsed
      .map(row => {
        if (!row || typeof row !== 'object') return null
        const sym = String((row as UsTechSymbol).symbol ?? '').trim().toUpperCase()
        const name = String((row as UsTechSymbol).name ?? sym).trim()
        if (!sym) return null
        return { symbol: sym, name: name || sym }
      })
      .filter((row): row is UsTechSymbol => row != null)
    return rows.length ? rows : DEFAULT_US_TECH_SYMBOLS
  } catch {
    return DEFAULT_US_TECH_SYMBOLS
  }
}

export function writeUsTechWatch(symbols: UsTechSymbol[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
  } catch {
    /* ignore */
  }
}

export function resetUsTechWatch(): UsTechSymbol[] {
  writeUsTechWatch(DEFAULT_US_TECH_SYMBOLS)
  return [...DEFAULT_US_TECH_SYMBOLS]
}
