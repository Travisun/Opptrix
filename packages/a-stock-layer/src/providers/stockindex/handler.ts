import type { StockListItem } from '@opptrix/shared'
import { Capability } from '../../core/capabilities.js'
import { MarketHandlerShell } from '../common/driver-factory.js'
import {
  stockIndexGetBoardDetail,
  stockIndexGetIndustryDetail,
  stockIndexGetStock,
  stockIndexListBoardStocks,
  stockIndexListBoards,
  stockIndexListEtfs,
  stockIndexListIndustries,
  stockIndexListIndustryStocks,
  stockIndexListStocks,
  stockIndexSearch,
} from './api/client.js'
import { parseStockIndexMarket, stockIndexItemsToListRows } from './normalize.js'

function resolveMarketAndKeyword(marketOrKeyword: string, keyword?: string) {
  if (keyword !== undefined) {
    return {
      market: parseStockIndexMarket(marketOrKeyword) ?? 'CN',
      keyword: keyword.trim(),
    }
  }
  const scoped = marketOrKeyword.trim()
  const boardMatch = scoped.match(/^board:([^:]+)(?::(CN|US|HK))?$/i)
  if (boardMatch) {
    return {
      market: parseStockIndexMarket(boardMatch[2]) ?? 'CN',
      keyword: '',
      board: boardMatch[1]!,
    }
  }
  return { market: 'CN' as const, keyword: scoped }
}

export class StockIndexHandler extends MarketHandlerShell {
  readonly selfThrottled = true

  async stockList(marketOrKeyword = '', keyword = ''): Promise<StockListItem[] | null> {
    try {
      const parsed = resolveMarketAndKeyword(marketOrKeyword, keyword || undefined)
      const market = parsed.market
      const q = parsed.keyword
      const board = 'board' in parsed ? parsed.board : undefined

      if (q) {
        const resp = await stockIndexSearch(q, { market, limit: 50, board })
        const rows = stockIndexItemsToListRows(resp.items ?? [])
        return rows.length ? rows : null
      }

      if (board) {
        const resp = await stockIndexListBoardStocks(board, { market, pageSize: 100 })
        const rows = stockIndexItemsToListRows(resp.items ?? [])
        return rows.length ? rows : null
      }

      const resp = await stockIndexListStocks({ market, pageSize: 100 })
      const rows = stockIndexItemsToListRows(resp.items ?? [])
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  /** boards:CN | industries:CN:1 | board:hsj:CN */
  async sectorList(plateType = 'boards:CN'): Promise<Record<string, unknown>[] | null> {
    try {
      const scoped = plateType.trim()
      const boardMatch = scoped.match(/^board:([^:]+)(?::(CN|US|HK))?$/i)
      if (boardMatch) {
        const detail = await stockIndexGetBoardDetail(
          boardMatch[1]!,
          parseStockIndexMarket(boardMatch[2]),
        )
        return [{ ...detail.item, source: 'stockindex' }]
      }

      const boardsMatch = scoped.match(/^boards(?::(CN|US|HK))?$/i)
      if (boardsMatch || scoped === 'boards') {
        const market = parseStockIndexMarket(boardsMatch?.[1]) ?? 'CN'
        const resp = await stockIndexListBoards({ market, withCount: true })
        const rows = (resp.items ?? []).map(item => ({ ...item, source: 'stockindex' }))
        return rows.length ? rows : null
      }

      const industriesMatch = scoped.match(/^industries(?::(CN|US|HK))?(?::([12]))?$/i)
      if (industriesMatch || scoped === 'industries') {
        const market = parseStockIndexMarket(industriesMatch?.[1]) ?? 'CN'
        const level = industriesMatch?.[2] ? Number(industriesMatch[2]) as 1 | 2 : undefined
        const resp = await stockIndexListIndustries({ market, level, withCount: true })
        const rows = (resp.items ?? []).map(item => ({ ...item, source: 'stockindex' }))
        return rows.length ? rows : null
      }

      return null
    } catch {
      return null
    }
  }

  async etfList(_market = 'CN', keyword = ''): Promise<StockListItem[] | null> {
    try {
      const resp = await stockIndexListEtfs({
        pageSize: 100,
        q: keyword.trim() || undefined,
      })
      const rows = stockIndexItemsToListRows(resp.items ?? [])
      return rows.length ? rows : null
    } catch {
      return null
    }
  }
}

export function mixStockIndexExt(DriverClass: typeof import('../common/base.js').BaseDriver) {
  const p = DriverClass.prototype as StockIndexHandler & Record<string, unknown>

  p.stockIndexSearch = async function stockIndexSearchMethod(
    query: string,
    market?: string,
    limit = 20,
    board?: string,
    industry?: string,
    assetType?: string,
  ) {
    const resp = await stockIndexSearch(query, {
      market: parseStockIndexMarket(market),
      limit,
      board,
      industry,
      assetType,
    })
    return [{ ...resp, source: 'stockindex' }]
  }

  p.stockIndexListStocks = async function stockIndexListStocksMethod(
    market = 'CN',
    page = 1,
    pageSize = 50,
    board?: string,
    industry?: string,
    q?: string,
    assetType?: string,
  ) {
    const resp = await stockIndexListStocks({
      market: parseStockIndexMarket(market) ?? 'CN',
      page,
      pageSize,
      board,
      industry,
      q,
      assetType,
    })
    return [{ ...resp, source: 'stockindex' }]
  }

  p.stockIndexGetStock = async function stockIndexGetStockMethod(
    code?: string,
    instrumentId?: string,
    symbol?: string,
    market?: string,
  ) {
    const resp = await stockIndexGetStock({
      code,
      instrumentId,
      symbol,
      market: parseStockIndexMarket(market),
    })
    return [{ ...resp.item, source: 'stockindex' }]
  }

  p.stockIndexListEtfs = async function stockIndexListEtfsMethod(
    page = 1,
    pageSize = 50,
    q?: string,
  ) {
    const resp = await stockIndexListEtfs({ page, pageSize, q })
    return [{ ...resp, source: 'stockindex' }]
  }

  p.stockIndexListBoards = async function stockIndexListBoardsMethod(
    market = 'CN',
    withCount = true,
  ) {
    const resp = await stockIndexListBoards({
      market: parseStockIndexMarket(market) ?? 'CN',
      withCount,
    })
    return [{ ...resp, source: 'stockindex' }]
  }

  p.stockIndexGetBoardDetail = async function stockIndexGetBoardDetailMethod(
    board: string,
    market = 'CN',
  ) {
    const resp = await stockIndexGetBoardDetail(board, parseStockIndexMarket(market) ?? 'CN')
    return [{ ...resp.item, source: 'stockindex' }]
  }

  p.stockIndexListBoardStocks = async function stockIndexListBoardStocksMethod(
    board: string,
    market = 'CN',
    page = 1,
    pageSize = 50,
    q?: string,
    assetType?: string,
  ) {
    const resp = await stockIndexListBoardStocks(board, {
      market: parseStockIndexMarket(market) ?? 'CN',
      page,
      pageSize,
      q,
      assetType,
    })
    return [{ ...resp, source: 'stockindex' }]
  }

  p.stockIndexListIndustries = async function stockIndexListIndustriesMethod(
    market = 'CN',
    level?: number,
    q?: string,
    parent?: string,
    withCount = true,
  ) {
    const resp = await stockIndexListIndustries({
      market: parseStockIndexMarket(market) ?? 'CN',
      level: level === 1 || level === 2 ? level : undefined,
      q,
      parent,
      withCount,
    })
    return [{ ...resp, source: 'stockindex' }]
  }

  p.stockIndexGetIndustryDetail = async function stockIndexGetIndustryDetailMethod(code: string) {
    const resp = await stockIndexGetIndustryDetail(code)
    return [{ ...resp.item, source: 'stockindex' }]
  }

  p.stockIndexListIndustryStocks = async function stockIndexListIndustryStocksMethod(
    industryCode: string,
    page = 1,
    pageSize = 50,
    q?: string,
  ) {
    const resp = await stockIndexListIndustryStocks(industryCode, { page, pageSize, q })
    return [{ ...resp, source: 'stockindex' }]
  }
}

export const STOCKINDEX_HANDLER_CAPS = [
  Capability.STOCK_LIST,
  Capability.SECTOR_LIST,
  Capability.ETF_LIST,
]
