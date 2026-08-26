import type { StockListItem } from '@opptrix/shared'
import { Capability } from '../../core/capabilities.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import { opptrixInstrumentSearch } from './api/client.js'
import {
  opptrixInstrumentToStockIndexItem,
  stockIndexItemsToListRows,
} from './normalize.js'

/** OpptrixQuant 支持的市场（含 SG，超集应用内 Market） */
const OPPTRIX_MARKETS = new Set(['CN', 'US', 'HK', 'JP', 'KR', 'SG'])

function opptrixMarket(raw: string | undefined): string {
  const m = String(raw ?? '').trim().toUpperCase()
  return OPPTRIX_MARKETS.has(m) ? m : 'CN'
}

/** OpptrixQuant class_token → 搜索过滤参数 */
function classTokenForAssetType(assetType?: string): string | undefined {
  const at = String(assetType ?? '').trim().toLowerCase()
  if (at === 'stock' || at === 'equity') return 'stock'
  if (at === 'ind' || at === 'index') return 'ind'
  if (at === 'otc' || at === 'of' || at === 'fund') return 'otc'
  if (at === 'etf') return 'etf'
  if (at === 'lof') return 'lof'
  if (at === 'reit') return 'reit'
  return undefined
}

function toRows(raw: Awaited<ReturnType<typeof opptrixInstrumentSearch>>): StockListItem[] | null {
  if (!raw) return null
  const rows = stockIndexItemsToListRows(raw.map(opptrixInstrumentToStockIndexItem))
  return rows.length ? rows : null
}

export class StockIndexHandler extends MarketHandlerShell {
  readonly selfThrottled = true

  /** 标准 instrument_search — 跨市场关键词搜索 */
  async instrumentSearch(
    query: string,
    market = 'CN',
    limit = 20,
    _board?: string,
    _industry?: string,
    assetType?: string,
  ): Promise<StockListItem[] | null> {
    try {
      return toRows(
        await opptrixInstrumentSearch(query, {
          market: opptrixMarket(market),
          classToken: classTokenForAssetType(assetType),
          limit: Math.min(Math.max(limit, 1), 100),
        }),
      )
    } catch {
      return null
    }
  }
}

export const STOCKINDEX_HANDLER_CAPS = [
  Capability.INSTRUMENT_SEARCH,
]
