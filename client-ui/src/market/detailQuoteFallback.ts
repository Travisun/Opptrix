import { research } from '../api/client'
import type { InstrumentRef } from '../types/instrument'
import type { EtfSnapshotData, FundSnapshotData, MarketQuote, StockDetailData } from '../types/market'
import { hasApplicationCapability } from './capabilities'
import { unifiedQuoteToMarketQuote } from './instrument-adapters'

function hasUsableMarketQuote(quote: MarketQuote | null | undefined): boolean {
  return quote != null && typeof quote.price === 'number' && Number.isFinite(quote.price) && quote.price > 0
}

function hasUsableFundQuote(quote: Record<string, unknown> | null | undefined): boolean {
  if (!quote) return false
  const price = quote.price ?? quote.exchangePrice ?? quote.unitNav
  return typeof price === 'number' && Number.isFinite(price) && price > 0
}

/** live / snapshot 无有效价时，单标的 fresh 补价（与 CrossMarket 详情一致） */
export async function fetchFreshMarketQuote(ref: InstrumentRef): Promise<MarketQuote | null> {
  if (!hasApplicationCapability(ref, 'quote')) return null
  try {
    const resp = await research.instrumentQuote(ref, { fresh: true })
    const dto = resp.success ? resp.data?.quote : null
    return dto ? unifiedQuoteToMarketQuote(dto) : null
  } catch {
    return null
  }
}

export async function patchStockDetailQuoteIfMissing(
  ref: InstrumentRef,
  data: StockDetailData,
): Promise<StockDetailData> {
  if (hasUsableMarketQuote(data.quote)) return data
  const quote = await fetchFreshMarketQuote(ref)
  return quote ? { ...data, quote } : data
}

export async function patchEtfSnapshotQuoteIfMissing(
  ref: InstrumentRef,
  data: EtfSnapshotData,
): Promise<EtfSnapshotData> {
  if (hasUsableMarketQuote(data.quote)) return data
  const quote = await fetchFreshMarketQuote(ref)
  return quote ? { ...data, quote } : data
}

export async function patchFundSnapshotQuoteIfMissing(
  ref: InstrumentRef,
  data: FundSnapshotData,
): Promise<FundSnapshotData> {
  if (hasUsableFundQuote(data.quote)) return data
  const quote = await fetchFreshMarketQuote(ref)
  return quote ? { ...data, quote: { ...quote } } : data
}
