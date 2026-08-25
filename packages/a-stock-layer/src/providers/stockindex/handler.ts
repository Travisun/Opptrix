import type { StockListItem } from '@opptrix/shared'
import { Capability } from '../../core/capabilities.js'
import { resolveCnPublicFundBareCode } from '../../core/fund-instrument.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import {
  opptrixFundMetrics,
  opptrixFundNav,
  opptrixFundQuoteBatch,
  opptrixGetInstrument,
  opptrixInstrumentSearch,
  stockIndexListStocks,
} from './api/client.js'
import {
  opptrixInstrumentToProfileRow,
  opptrixInstrumentToStockIndexItem,
  opptrixLatestNavToQuoteRow,
  opptrixMetricsToRow,
  opptrixNavToStandardRows,
  stockIndexItemsToListRows,
} from './normalize.js'

/** OpptrixQuant 支持的市场（含 SG，超集应用内 Market） */
const OPPTRIX_MARKETS = new Set(['CN', 'US', 'HK', 'JP', 'KR', 'SG'])

function opptrixMarket(raw: string | undefined): string {
  const m = String(raw ?? '').trim().toUpperCase()
  return OPPTRIX_MARKETS.has(m) ? m : 'CN'
}

/** 业务 assetType → OpptrixQuant class_token（stock/etf/fund/of/lof） */
function classTokenForAssetType(assetType?: string): string | undefined {
  const at = String(assetType ?? '').trim().toLowerCase()
  if (at === 'stock' || at === 'etf' || at === 'fund' || at === 'of' || at === 'lof') return at
  if (at === 'equity') return 'stock'
  return undefined
}

function toRows(raw: Awaited<ReturnType<typeof opptrixInstrumentSearch>>): StockListItem[] | null {
  if (!raw) return null
  const rows = stockIndexItemsToListRows(raw.map(opptrixInstrumentToStockIndexItem))
  return rows.length ? rows : null
}

export class StockIndexHandler extends MarketHandlerShell {
  readonly selfThrottled = true

  async stockList(marketOrKeyword = '', keyword = '', page = 1, pageSize = 100): Promise<StockListItem[] | null> {
    try {
      const hasKeyword = keyword !== undefined && keyword !== ''
      const bareMarket = marketOrKeyword.trim().toUpperCase()
      const market = opptrixMarket(
        hasKeyword ? marketOrKeyword : (OPPTRIX_MARKETS.has(bareMarket) ? marketOrKeyword : undefined),
      )
      const q = hasKeyword
        ? keyword.trim()
        : (OPPTRIX_MARKETS.has(bareMarket) ? '' : marketOrKeyword.trim())

      if (q) {
        return toRows(
          await opptrixInstrumentSearch(q, {
            market,
            limit: Math.min(Math.max(pageSize, 1), 100),
          }),
        )
      }

      const raw = await opptrixInstrumentSearch('', {
        market,
        classToken: 'stock',
        limit: Math.min(Math.max(pageSize, 1), 100) * Math.max(page, 1),
      })
      if (!raw) return null
      const start = (page - 1) * pageSize
      const rows = stockIndexItemsToListRows(raw.map(opptrixInstrumentToStockIndexItem)).slice(
        start,
        start + pageSize,
      )
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** 标准 instrument_search — 跨市场关键词搜索（board/industry 已随旧上游下线而忽略） */
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

  async etfList(_market = 'CN', keyword = ''): Promise<StockListItem[] | null> {
    try {
      const q = String(keyword ?? '').trim()
      return toRows(
        await opptrixInstrumentSearch(q, {
          market: 'CN',
          classToken: 'etf',
          limit: 500,
        }),
      )
    } catch {
      return null
    }
  }

  /** 基金档案 — GET /api/v1/instruments/{id}（id = CN:of:{code}） */
  async fundProfile(fundCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const bare = resolveCnPublicFundBareCode(fundCode)
      if (!bare) return null
      const instrument = await opptrixGetInstrument(`CN:of:${bare}`)
      if (!instrument) return null
      const row = opptrixInstrumentToProfileRow(instrument)
      return row ? [row] : null
    } catch {
      return null
    }
  }

  /** 基金历史净值 — GET /api/v1/funds/{code}/nav（最近 N=120） */
  async fundNav(fundCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const bare = resolveCnPublicFundBareCode(fundCode)
      if (!bare) return null
      const rows = await opptrixFundNav(bare, { limit: 120 })
      if (!rows) return null
      const mapped = opptrixNavToStandardRows(rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /** 基金最新净值 — POST /api/v1/funds/nav/latest（单只） */
  async fundQuote(fundCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const bare = resolveCnPublicFundBareCode(fundCode)
      if (!bare) return null
      const items = await opptrixFundQuoteBatch([bare])
      if (!items) return null
      const first = items[0]
      if (!first) return null
      const row = opptrixLatestNavToQuoteRow(first)
      return row ? [row] : null
    } catch {
      return null
    }
  }

  /** 基金绩效指标（自定义方法）— GET /api/v1/funds/{code}/metrics */
  async fundMetrics(fundCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const bare = resolveCnPublicFundBareCode(fundCode)
      if (!bare) return null
      const metrics = await opptrixFundMetrics(bare)
      if (!metrics) return null
      const row = opptrixMetricsToRow(metrics)
      return row ? [row] : null
    } catch {
      return null
    }
  }
}

export function mixStockIndexExt(DriverClass: typeof import('../common/base.js').BaseDriver) {
  const p = DriverClass.prototype as StockIndexHandler & Record<string, unknown>

  p.stockIndexListStocks = async function stockIndexListStocksMethod(
    market = 'CN',
    page = 1,
    pageSize = 35,
    q?: string,
  ) {
    const resp = await stockIndexListStocks({
      market: opptrixMarket(market),
      page,
      pageSize,
      q,
    })
    return [{ ...resp, source: 'stockindex' }]
  }
}

export const STOCKINDEX_HANDLER_CAPS = [
  Capability.STOCK_LIST,
  Capability.INSTRUMENT_SEARCH,
  Capability.ETF_LIST,
  Capability.FUND_PROFILE,
  Capability.FUND_NAV,
  Capability.FUND_QUOTE,
]
