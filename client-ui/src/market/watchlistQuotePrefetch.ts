import type { InstrumentRef } from '../types/instrument'
import type { MarketQuote, WatchlistItem } from '../types/market'
import { research } from '../api/client'
import { unifiedQuoteToMarketQuote, type UnifiedInstrumentQuoteDto } from './instrument-adapters'
import { displayCodeFromInstrument, instrumentKey, watchlistItemKey } from './instrument'
import { hasApplicationCapability } from './capabilities'

function quotePatchKeys(
  item: WatchlistItem,
  ref: InstrumentRef,
  quote: MarketQuote,
): Record<string, MarketQuote> {
  const code = displayCodeFromInstrument(ref)
  const rowKey = watchlistItemKey({ code, name: quote.name ?? item.name, instrument: ref })
  return {
    [code]: quote,
    [rowKey]: quote,
    [item.code]: quote,
    [watchlistItemKey(item)]: quote,
    [instrumentKey(ref)]: quote,
  }
}

/** 将单条 unified quote 转为关注列表 quotes 字典 patch（多 key 索引） */
export function buildWatchlistQuotePatch(
  item: WatchlistItem,
  ref: InstrumentRef,
  unified: UnifiedInstrumentQuoteDto,
): Record<string, MarketQuote> {
  const mq = unifiedQuoteToMarketQuote(unified)
  const code = displayCodeFromInstrument(ref)
  const quote: MarketQuote = {
    ...mq,
    code,
    name: mq.name ?? item.name ?? code,
  }
  return quotePatchKeys(item, ref, quote)
}

/** live 失败时用搜索/添加时的快照价占位，避免新行裸空 */
export function buildWatchlistAddedPricePatch(
  item: WatchlistItem,
  ref: InstrumentRef,
  addedPrice: number,
): Record<string, MarketQuote> {
  const code = displayCodeFromInstrument(ref)
  const quote: MarketQuote = {
    code,
    name: item.name ?? code,
    price: addedPrice,
    changePct: null,
    pe: null,
    pb: null,
    turnoverRate: null,
  }
  return quotePatchKeys(item, ref, quote)
}

/** 新增关注后立即拉 fresh 单标的价（须在后端 watchlist_save 完成后调用） */
export async function fetchFreshWatchlistInstrumentQuote(
  ref: InstrumentRef,
): Promise<UnifiedInstrumentQuoteDto | null> {
  const resp = await research.instrumentQuote(ref, { fresh: true })
  return resp.success && resp.data?.quote ? resp.data.quote : null
}

/**
 * save 完成后拉 fresh 价；失败则回退 addedPrice 快照。
 * 供 addItemAndSync 统一调用。
 */
export async function prefetchWatchlistQuotePatch(
  item: WatchlistItem,
  ref: InstrumentRef,
): Promise<Record<string, MarketQuote>> {
  if (!hasApplicationCapability(ref, 'batch_quote') && !hasApplicationCapability(ref, 'quote')) {
    return {}
  }
  try {
    const unified = await fetchFreshWatchlistInstrumentQuote(ref)
    if (unified?.price != null && unified.price > 0) {
      return buildWatchlistQuotePatch(item, ref, unified)
    }
  } catch {
    /* 回退 addedPrice */
  }
  const addedPrice = item.addedPrice
  if (addedPrice != null && addedPrice > 0) {
    return buildWatchlistAddedPricePatch(item, ref, addedPrice)
  }
  return {}
}
