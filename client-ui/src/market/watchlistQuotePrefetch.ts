import type { InstrumentRef } from '../types/instrument'
import type { MarketQuote, WatchlistItem } from '../types/market'
import { research } from '../api/client'
import { unifiedQuoteToMarketQuote, type UnifiedInstrumentQuoteDto } from './instrument-adapters'
import { displayCodeFromInstrument, instrumentKey, watchlistItemKey } from './instrument'

/** 将单条 unified quote 转为关注列表 quotes 字典 patch（多 key 索引） */
export function buildWatchlistQuotePatch(
  item: WatchlistItem,
  ref: InstrumentRef,
  unified: UnifiedInstrumentQuoteDto,
): Record<string, MarketQuote> {
  const mq = unifiedQuoteToMarketQuote(unified)
  const code = displayCodeFromInstrument(ref)
  const rowKey = watchlistItemKey({ code, name: mq.name ?? item.name, instrument: ref })
  const quote: MarketQuote = {
    ...mq,
    code,
    name: mq.name ?? item.name ?? code,
  }
  return {
    [code]: quote,
    [rowKey]: quote,
    [item.code]: quote,
    [watchlistItemKey(item)]: quote,
    [instrumentKey(ref)]: quote,
  }
}

/** 新增关注后立即拉 fresh 单标的价（须在后端 watchlist_save 完成后调用） */
export async function fetchFreshWatchlistInstrumentQuote(
  ref: InstrumentRef,
): Promise<UnifiedInstrumentQuoteDto | null> {
  const resp = await research.instrumentQuote(ref, { fresh: true })
  return resp.success && resp.data?.quote ? resp.data.quote : null
}
