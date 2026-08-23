import type { AssetClass, InstrumentRef } from '@opptrix/shared'
import { canonicalCnSymbol, inferCnExchangeFromSymbol, normalizeInstrumentRef } from '@opptrix/shared'

/** 公募基金命名空间交易所标识 — Public Funding（场内 + 场外） */
export const CN_PUBLIC_FUND_EXCHANGE = 'PF' as const

/** @deprecated 使用 CN_PUBLIC_FUND_EXCHANGE */
export const CN_OTC_FUND_EXCHANGE = CN_PUBLIC_FUND_EXCHANGE

/** 场内 LOF（16xxxx，不含 159xxx 深证 ETF 段） */
export function isCnLofSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  return c.length === 6 && c.startsWith('16') && !c.startsWith('159')
}

/** 场内上市基金代码段（ETF / LOF 等） */
export function isCnListedFundSymbol(symbol: string): boolean {
  const c = canonicalCnSymbol(symbol)
  const head2 = c.slice(0, 2)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (c.startsWith('159') || isCnLofSymbol(c)) return true
  return false
}

export function isCnPublicFundRef(ref: InstrumentRef): boolean {
  const n = normalizeInstrumentRef(ref)
  return n.market === 'CN' && n.assetClass === 'FUND'
}

/** StockIndex / 搜索命中行是否应落成 CN:PF 公募基金 */
export function stockIndexItemLooksLikeCnPublicFund(item: {
  code?: string
  nameCn?: string | null
  industryName?: string | null
  assetType?: string
  instrumentId?: string
  board?: string | null
  boards?: string[]
}): boolean {
  const instrumentId = String(item.instrumentId ?? '')
  if (/^CN:(?:PF|OF)\./i.test(instrumentId)) return true
  const board = String(item.board ?? '').toLowerCase()
  if (board === 'fund') return true
  if (item.boards?.some(b => String(b).toLowerCase() === 'fund')) return true
  const at = String(item.assetType ?? '').toLowerCase()
  if (at === 'fund' || at === 'mutual_fund' || at === 'public_fund') return true
  const text = `${item.nameCn ?? ''}${item.industryName ?? ''}`
  if (/基金/.test(text)) return true
  const code = canonicalCnSymbol(String(item.code ?? ''))
  if (code.length === 6 && isCnListedFundSymbol(code)) return true
  return false
}

/** @deprecated 使用 isCnPublicFundRef */
export const isCnOtcFundRef = isCnPublicFundRef

export function toCnPublicFundRef(code: string): InstrumentRef {
  const symbol = canonicalCnSymbol(code)
  return normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol,
    exchange: CN_PUBLIC_FUND_EXCHANGE,
  })
}

/** @deprecated 使用 toCnPublicFundRef */
export const toCnOtcFundRef = toCnPublicFundRef

export function resolveCnPublicFundBareCode(input: string): string | null {
  let raw = String(input ?? '').trim().toUpperCase()
  const ns = /^CN:(?:PF|OF)[.:](\d{6})$/i.exec(raw)
  if (ns) return ns[1]!
  raw = raw.replace(/\.(OF|SH|SZ|BJ|PF)$/i, '')
  const bare = canonicalCnSymbol(raw)
  if (!bare || !/^\d{6}$/.test(bare)) return null
  return bare
}

export function assertCnPublicFundCode(
  input: string | InstrumentRef,
  assetClass?: AssetClass,
): string | null {
  if (typeof input === 'object' && input != null) {
    if (!isCnPublicFundRef(input)) return null
    return canonicalCnSymbol(input.symbol)
  }
  if (assetClass && assetClass !== 'FUND') return null
  return resolveCnPublicFundBareCode(input)
}

/** @deprecated 使用 assertCnPublicFundCode */
export const assertCnOtcFundCode = assertCnPublicFundCode

/** Provider 线格式：场内 SH/SZ/BJ；场外无上市交易所 */
export function inferCnPublicFundListingExchange(symbol: string): 'SH' | 'SZ' | 'BJ' | null {
  if (!isCnListedFundSymbol(symbol)) return null
  const ex = inferCnExchangeFromSymbol(symbol)
  if (ex === 'SH' || ex === 'SZ' || ex === 'BJ') return ex
  return null
}
