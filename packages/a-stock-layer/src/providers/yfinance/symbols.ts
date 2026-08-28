import type { Market } from '@opptrix/shared'
import { toYahooFinanceSymbol } from '../../utils/regional-symbol.js'
import { normalizeUsSymbol } from '../../utils/us-market.js'
import { normalizeCode } from '../../utils/helpers.js'

export type YfinanceGlobalIndex = {
  outCode: string
  yahoo: string
  name: string
  market: string
}

/** 全球主要指数 — Yahoo Finance ticker */
export const YFINANCE_GLOBAL_INDICES: YfinanceGlobalIndex[] = [
  { outCode: 'SPX', yahoo: '^GSPC', name: '标普500', market: 'US' },
  { outCode: 'IXIC', yahoo: '^IXIC', name: '纳斯达克', market: 'US' },
  { outCode: 'DJI', yahoo: '^DJI', name: '道琼斯', market: 'US' },
  { outCode: 'HSI', yahoo: '^HSI', name: '恒生指数', market: 'HK' },
  { outCode: 'N225', yahoo: '^N225', name: '日经225', market: 'JP' },
  { outCode: 'KOSPI', yahoo: '^KS11', name: '韩国综合', market: 'KR' },
  { outCode: 'FTSE', yahoo: '^FTSE', name: '富时100', market: 'UK' },
  { outCode: 'GDAXI', yahoo: '^GDAXI', name: '德国DAX', market: 'DE' },
  { outCode: 'FCHI', yahoo: '^FCHI', name: '法国CAC', market: 'FR' },
]

const ALIAS_TO_OUT: Record<string, string> = {
  spx: 'SPX',
  spy: 'SPX',
  gspc: 'SPX',
  '^gspc': 'SPX',
  ixic: 'IXIC',
  nasdaq: 'IXIC',
  qqq: 'IXIC',
  '^ixic': 'IXIC',
  dji: 'DJI',
  djia: 'DJI',
  dow: 'DJI',
  dia: 'DJI',
  '^dji': 'DJI',
  hsi: 'HSI',
  '^hsi': 'HSI',
  n225: 'N225',
  nikkei: 'N225',
  '^n225': 'N225',
  kospi: 'KOSPI',
  ks11: 'KOSPI',
  '^ks11': 'KOSPI',
  ftse: 'FTSE',
  '^ftse': 'FTSE',
  gdaxi: 'GDAXI',
  '^gdaxi': 'GDAXI',
  fchi: 'FCHI',
  '^fchi': 'FCHI',
}

const OUT_BY_CODE = new Map(YFINANCE_GLOBAL_INDICES.map(row => [row.outCode, row]))
const OUT_BY_YAHOO = new Map(YFINANCE_GLOBAL_INDICES.map(row => [row.yahoo.toUpperCase(), row]))

function normalizeAlias(raw: string): string {
  return raw.trim().toLowerCase()
}

export function resolveYfinanceGlobalIndex(code = ''): YfinanceGlobalIndex | null {
  const raw = code.trim()
  if (!raw) return null
  const alias = normalizeAlias(raw)
  const out = ALIAS_TO_OUT[alias] ?? raw.toUpperCase()
  return OUT_BY_CODE.get(out) ?? OUT_BY_YAHOO.get(raw.toUpperCase()) ?? null
}

export function listYfinanceGlobalIndexTargets(code = ''): YfinanceGlobalIndex[] {
  const hit = resolveYfinanceGlobalIndex(code)
  if (hit) return [hit]
  if (!code.trim()) return [...YFINANCE_GLOBAL_INDICES]
  return []
}

/** InstrumentRef.symbol / 展示码 → Yahoo ticker */
export function resolveYahooIndexTicker(
  market: Market,
  symbol: string,
): string | null {
  const raw = symbol.trim()
  if (!raw) return null

  const global = resolveYfinanceGlobalIndex(raw)
  if (global) return global.yahoo

  if (raw.startsWith('^')) return raw

  const mkt = market.toUpperCase()
  if (mkt === 'US') {
    if (raw.startsWith('^')) return raw
    return raw.toUpperCase()
  }
  if (mkt === 'HK') {
    if (raw.toUpperCase() === 'HSI') return '^HSI'
    const hk = normalizeCode(raw)
    if (/^\d{4,5}$/.test(hk)) return `${hk}.HK`
    return raw.includes('.') ? raw : `${raw}.HK`
  }
  if (mkt === 'JP') {
    if (raw.toUpperCase() === 'N225') return '^N225'
    const digits = normalizeCode(raw)
    return digits ? `${digits}.T` : `${raw}.T`
  }
  if (mkt === 'KR') {
    if (raw.toUpperCase() === 'KOSPI' || raw.toUpperCase() === 'KS11') return '^KS11'
    const digits = normalizeCode(raw)
    return digits ? `${digits}.KS` : `${raw}.KS`
  }
  if (mkt === 'CN') {
    const bare = normalizeCode(raw)
    if (bare.startsWith('399')) return `${bare}.SZ`
    if (/^\d{6}$/.test(bare)) return `${bare}.SS`
  }
  return raw
}

/** 个股 Yahoo ticker */
export function resolveYahooEquityTicker(market: Market, symbol: string): string | null {
  const raw = symbol.trim()
  if (!raw) return null
  if (market === 'US') return normalizeUsSymbol(raw)
  if (market === 'HK' || market === 'JP' || market === 'KR') {
    return toYahooFinanceSymbol(market, raw)
  }
  return raw
}

/** Yahoo ticker → 展示用本地代码 */
export function displayCodeFromYahooTicker(ticker: string, market: Market): string {
  const t = ticker.trim()
  if (market === 'HK' && t.endsWith('.HK')) return t.slice(0, -3).padStart(5, '0')
  if (market === 'JP' && t.endsWith('.T')) return t.slice(0, -2)
  if (market === 'KR' && t.endsWith('.KS')) return t.slice(0, -3).padStart(6, '0')
  if (t.startsWith('^')) return resolveYfinanceGlobalIndex(t)?.outCode ?? t
  return t
}
