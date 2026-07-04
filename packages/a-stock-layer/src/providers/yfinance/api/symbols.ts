import type { Market } from '@opptrix/shared'
import { normalizeUsSymbol } from '../../../utils/us-market.js'
import {
  normalizeRegionalSymbol,
  toYahooFinanceSymbol,
  type RegionalEquityMarket,
} from '../../../utils/regional-symbol.js'

export const YFINANCE_GLOBAL_INDEX_MAP: Record<string, { yahoo: string; name: string }> = {
  dji: { yahoo: '^DJI', name: '道琼斯指数' },
  spx: { yahoo: '^GSPC', name: '标普500' },
  ixic: { yahoo: '^IXIC', name: '纳斯达克综合' },
  hsi: { yahoo: '^HSI', name: '恒生指数' },
  n225: { yahoo: '^N225', name: '日经225' },
  kospi: { yahoo: '^KS11', name: '韩国综合' },
}

const US_LIST_SCREENERS = ['most_actives', 'day_gainers', 'undervalued_large_caps'] as const

export function usListScreenerIds(): readonly string[] {
  return US_LIST_SCREENERS
}

export function parseStockListMarket(market = 'US'): 'US' | RegionalEquityMarket {
  const m = market.trim().toUpperCase()
  if (m === 'HK' || m === 'JP' || m === 'KR') return m
  return 'US'
}

/** Normalized display code → Yahoo Finance ticker. */
export function toYahooTicker(symbol: string, marketHint?: Market | RegionalEquityMarket): string {
  const hint = marketHint?.toUpperCase()
  if (hint === 'US') return normalizeUsSymbol(symbol)
  if (hint === 'HK' || hint === 'JP' || hint === 'KR') {
    return toYahooFinanceSymbol(hint, symbol)
  }

  const raw = symbol.trim()
  if (/[A-Za-z]/.test(raw) && !/^\d+$/.test(raw)) {
    return normalizeUsSymbol(raw)
  }

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 6) {
    return toYahooFinanceSymbol('KR', digits)
  }
  if (digits.length === 5 || (digits.length === 4 && parseInt(digits, 10) >= 1000)) {
    return toYahooFinanceSymbol('HK', digits)
  }
  if (digits.length === 4) {
    return toYahooFinanceSymbol('JP', digits)
  }
  if (digits.length > 0) {
    return toYahooFinanceSymbol('HK', digits)
  }
  return normalizeUsSymbol(raw)
}

export function displayCode(symbol: string, marketHint?: Market | RegionalEquityMarket): string {
  const hint = marketHint?.toUpperCase()
  if (hint === 'US') return normalizeUsSymbol(symbol)
  if (hint === 'HK' || hint === 'JP' || hint === 'KR') {
    return normalizeRegionalSymbol(hint, symbol)
  }

  const raw = symbol.trim()
  if (/[A-Za-z]/.test(raw) && !/^\d+$/.test(raw)) {
    return normalizeUsSymbol(raw)
  }
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 6) return normalizeRegionalSymbol('KR', digits)
  if (digits.length === 5 || (digits.length === 4 && parseInt(digits, 10) >= 1000)) {
    return normalizeRegionalSymbol('HK', digits)
  }
  if (digits.length === 4) return normalizeRegionalSymbol('JP', digits)
  if (digits.length > 0) return normalizeRegionalSymbol('HK', digits)
  return normalizeUsSymbol(raw)
}
