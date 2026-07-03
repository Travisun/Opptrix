/** Crypto SPOT pair notation — BTC/USDT, BTC-USDT, BTCUSDT */

export interface CryptoPairRef {
  base: string
  quote: string
  /** Binance symbol e.g. BTCUSDT */
  binanceSymbol: string
  /** OKX instId e.g. BTC-USDT */
  okxInstId: string
  /** Display pair e.g. BTC/USDT */
  pair: string
}

const QUOTES = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB'] as const

export function normalizeCryptoBase(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function parseCryptoPair(input: string, defaultQuote = 'USDT'): CryptoPairRef | null {
  const raw = input.trim().toUpperCase()
  if (!raw) return null

  if (raw.includes('/')) {
    const [base, quote] = raw.split('/').map(s => s.trim())
    if (!base || !quote) return null
    return toPairRef(base, quote)
  }
  if (raw.includes('-')) {
    const [base, quote] = raw.split('-').map(s => s.trim())
    if (!base || !quote) return null
    return toPairRef(base, quote)
  }

  for (const q of QUOTES) {
    if (raw.endsWith(q) && raw.length > q.length) {
      const base = raw.slice(0, -q.length)
      if (base.length >= 2) return toPairRef(base, q)
    }
  }

  if (/^[A-Z]{2,10}$/.test(raw)) {
    return toPairRef(raw, defaultQuote)
  }
  return null
}

function toPairRef(base: string, quote: string): CryptoPairRef {
  const b = normalizeCryptoBase(base)
  const q = normalizeCryptoBase(quote)
  return {
    base: b,
    quote: q,
    binanceSymbol: `${b}${q}`,
    okxInstId: `${b}-${q}`,
    pair: `${b}/${q}`,
  }
}

export function isCryptoPairNotation(input: string): boolean {
  return parseCryptoPair(input) != null
}
