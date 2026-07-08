/** Map Opptrix chart period → exchange kline interval. */

export interface CryptoKlineInterval {
  binance: string
  okx: string
  intraday: boolean
}

const PERIOD_MAP: Record<string, CryptoKlineInterval> = {
  daily: { binance: '1d', okx: '1D', intraday: false },
  '1d': { binance: '1d', okx: '1D', intraday: false },
  weekly: { binance: '1w', okx: '1W', intraday: false },
  week: { binance: '1w', okx: '1W', intraday: false },
  '1w': { binance: '1w', okx: '1W', intraday: false },
  monthly: { binance: '1M', okx: '1M', intraday: false },
  month: { binance: '1M', okx: '1M', intraday: false },
  '1M': { binance: '1M', okx: '1M', intraday: false },
  intraday: { binance: '1m', okx: '1m', intraday: true },
  '1m': { binance: '1m', okx: '1m', intraday: true },
  '5m': { binance: '5m', okx: '5m', intraday: true },
  '15m': { binance: '15m', okx: '15m', intraday: true },
  '30m': { binance: '30m', okx: '30m', intraday: true },
  '60m': { binance: '1h', okx: '1H', intraday: true },
}

export function resolveCryptoKlineInterval(period: string): CryptoKlineInterval | null {
  return PERIOD_MAP[period.trim().toLowerCase()] ?? null
}

export function formatCryptoKlineDate(raw: string, intraday: boolean): string {
  if (!intraday) {
    return raw.length > 10 ? new Date(Number(raw)).toISOString().slice(0, 10) : raw
  }
  const ms = Number(raw)
  if (Number.isFinite(ms) && ms > 1e11) {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
  }
  if (raw.includes(' ') || raw.includes('T')) return raw.replace('T', ' ').slice(0, 16)
  return raw
}

export const CRYPTO_LIST_QUOTES: { quote: string; limit: number }[] = [
  { quote: 'USDT', limit: 400 },
  { quote: 'USDC', limit: 150 },
  { quote: 'BTC', limit: 80 },
]

export function matchesCryptoKeyword(code: string, base: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  const c = code.toLowerCase()
  const b = base.toLowerCase()
  return c.includes(kw) || b.includes(kw)
}
