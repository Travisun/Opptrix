const SUFFIX_MAP: Record<string, string> = {
  SS: 'SH',
  SH: 'SH',
  XSHG: 'SH',
  SZ: 'SZ',
  XSHE: 'SZ',
  BJ: 'BJ',
  BSE: 'BJ',
}

/** Normalize to bare 6-digit code (strip exchange suffix). */
export function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim()
  return trimmed.includes('.') ? trimmed.split('.')[0]! : trimmed
}

/** Convert to Tushare-style ts_code, e.g. `600000.SH`. */
export function toTsCode(symbol: string): string {
  const normalized = symbol.trim().toUpperCase()
  if (normalized.includes('.')) {
    const [code, suffix] = normalized.split('.', 2)
    return `${code}.${SUFFIX_MAP[suffix] ?? suffix}`
  }
  if (normalized.startsWith('6') || normalized.startsWith('5')) return `${normalized}.SH`
  if (normalized.startsWith('0') || normalized.startsWith('3')) return `${normalized}.SZ`
  if (normalized.startsWith('8') || normalized.startsWith('4') || normalized.startsWith('2') || normalized.startsWith('9')) {
    return `${normalized}.BJ`
  }
  return normalized
}

/** Parse ts_code into `{ code, exchange }` where exchange is SSE/SZSE/BSE. */
export function fromTsCode(tsCode: string): { code: string; exchange: string } {
  const code = normalizeSymbol(tsCode)
  let exchange = ''
  if (code.startsWith('6') || code.startsWith('5')) exchange = 'SSE'
  else if (code.startsWith('0') || code.startsWith('3')) exchange = 'SZSE'
  else if (code.startsWith('8') || code.startsWith('4') || code.startsWith('2') || code.startsWith('9')) exchange = 'BSE'
  return { code, exchange }
}

/** Map Tushare-style exchange to zzshare backend exchange code. */
export function toBackendExchange(exchange?: string | null): string | null {
  if (!exchange) return null
  const mapping: Record<string, string> = {
    SSE: 'SS',
    SZSE: 'SZ',
    BSE: 'BJ',
    SH: 'SS',
    SZ: 'SZ',
    BJ: 'BJ',
    GEM: 'GEM',
    KSH: 'KSH',
    STAR: 'KSH',
    SS: 'SS',
    ALL: 'ALL',
  }
  return mapping[exchange.toUpperCase()] ?? null
}
