import { portfolioHoldingsStorageKey } from '@opptrix/shared/portfolio-fees'
import { normalizeCode } from './format'
import {
  normalizeInstrumentRefLocal,
  tryParseInstrumentInput,
} from './instrument'
import type { InstrumentRef, Market } from '../types/instrument'

function cnOtcFundRef(symbol: string): InstrumentRef {
  return normalizeInstrumentRefLocal({
    market: 'CN',
    assetClass: 'FUND',
    symbol: normalizeCode(symbol),
    exchange: 'OF',
  })
}

/**
 * 组合交易 API 查询码 — 与 store.portfolioCodesMatch / Opptrix 账本键对齐。
 * 禁止把 Opptrix ID 再套一层 CN:PF. 前缀（会导致场外基金记录查不到）。
 */
export function resolvePortfolioTradeLookupCode(
  code: string,
  market?: string,
  assetClass?: InstrumentRef['assetClass'],
): string {
  const trimmed = code.trim()
  if (!trimmed) return trimmed

  const parsed = tryParseInstrumentInput(trimmed)
  if (parsed) {
    const ref = normalizeInstrumentRefLocal(
      assetClass ? { ...parsed, assetClass } : parsed,
    )
    return portfolioHoldingsStorageKey(ref)
  }

  const fundNs = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(trimmed)
  if (fundNs) return portfolioHoldingsStorageKey(cnOtcFundRef(fundNs[1]!))

  const fundSuffix = /^(\d{6})\.(?:OF|PF)$/i.exec(trimmed)
  if (fundSuffix) return portfolioHoldingsStorageKey(cnOtcFundRef(fundSuffix[1]!))

  if (market === 'CN' && assetClass === 'FUND' && /^\d{6}$/.test(trimmed)) {
    return portfolioHoldingsStorageKey(cnOtcFundRef(trimmed))
  }

  if (market && market !== 'CN') return trimmed
  if (/^CN:/i.test(trimmed)) return trimmed
  return normalizeCode(trimmed)
}

export function portfolioTradeCacheKey(
  code: string,
  market?: string,
  assetClass?: InstrumentRef['assetClass'],
): string {
  const lookup = resolvePortfolioTradeLookupCode(code, market, assetClass)
  const m = (market ?? 'CN') as Market
  return `${m}:${lookup}`
}
