import type { AssetClass, InstrumentRef } from '@opptrix/shared'
import { canonicalCnSymbol, normalizeInstrumentRef } from '@opptrix/shared'
import { isCnEtfCode } from './instrument.js'

export const CN_OTC_FUND_EXCHANGE = 'OF' as const

/** 场外开放式基金 — 须显式 assetClass=FUND 或 exchange=OF，禁止裸码推断 */
export function isCnOtcFundRef(ref: InstrumentRef): boolean {
  const n = normalizeInstrumentRef(ref)
  return n.market === 'CN' && n.assetClass === 'FUND' && !isCnEtfCode(n.symbol)
}

export function toCnOtcFundRef(code: string): InstrumentRef {
  const symbol = canonicalCnSymbol(code)
  return normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol,
    exchange: CN_OTC_FUND_EXCHANGE,
  })
}

export function assertCnOtcFundCode(
  input: string | InstrumentRef,
  assetClass?: AssetClass,
): string | null {
  if (typeof input === 'object' && input != null) {
    if (!isCnOtcFundRef(input)) return null
    return canonicalCnSymbol(input.symbol)
  }
  const symbol = canonicalCnSymbol(input)
  if (!symbol || isCnEtfCode(symbol)) return null
  if (assetClass && assetClass !== 'FUND') return null
  return symbol
}
