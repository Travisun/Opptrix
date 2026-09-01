import type { InstrumentRef } from '../../types/instrument'
import type {
  MarketDynamicsData,
  MarketIndexQuote,
  MarketStockMover,
} from '../../types/schemas'

export type HkMarketDynamicsModel = {
  indices: MarketIndexQuote[]
  sectors: MarketIndexQuote[]
  gainers: MarketStockMover[]
  losers: MarketStockMover[]
  trending: MarketStockMover[]
  sectorStatus: MarketDynamicsData['hk_sector_status']
  sectorHint: string | undefined
}

function sectionItems(data: MarketDynamicsData | null | undefined, id: string): MarketIndexQuote[] {
  return data?.sections?.find(sec => sec.id === id)?.items ?? []
}

/** 港股个股展示码：5 位数字；指数/板块 ETF 保留原样 */
export function normalizeHkDisplayCode(raw: string): string {
  const trimmed = raw.trim().replace(/\.HK$/i, '')
  if (/^\d+$/.test(trimmed)) {
    return trimmed.length <= 4 ? trimmed : trimmed.padStart(5, '0')
  }
  return trimmed
}

/** 5 位港股码 → Yahoo 图表 ticker（如 00700 → 0700.HK） */
export function hkEquityYahooTicker(code: string): string {
  const trimmed = code.trim().replace(/\.HK$/i, '')
  if (/^\d+$/.test(trimmed)) {
    const padded = trimmed.length <= 4 ? trimmed : trimmed.padStart(5, '0')
    const yahoo = padded.length > 4 ? padded.slice(-4) : padded
    return `${yahoo}.HK`
  }
  return trimmed.includes('.') ? trimmed : `${trimmed}.HK`
}

function isHkIndexQuote(item: Pick<MarketIndexQuote, 'code' | 'chart_symbol'>): boolean {
  const sym = (item.chart_symbol ?? item.code ?? '').trim().toUpperCase()
  if (sym.startsWith('^') || sym === 'HSTECH.HK') return true
  const code = (item.code ?? '').trim().toUpperCase()
  return code === 'HSI' || code === 'HSCE' || code === 'HSTECH'
}

export function hkChartInstrument(item: MarketIndexQuote): InstrumentRef {
  const sym = item.chart_symbol?.trim() || hkEquityYahooTicker(item.code)
  return {
    market: 'HK',
    assetClass: isHkIndexQuote(item) ? 'INDEX' : 'EQUITY',
    symbol: sym,
  }
}

function normalizeMover(row: MarketStockMover): MarketStockMover {
  return { ...row, code: normalizeHkDisplayCode(row.code) }
}

function quoteRowToMover(row: MarketIndexQuote): MarketStockMover {
  return normalizeMover({
    code: row.code,
    name: row.name,
    price: row.price,
    change_pct: row.change_pct,
    change_amt: row.change_amt ?? null,
  })
}

function sectionMovers(data: MarketDynamicsData | null | undefined, sectionId: string): MarketStockMover[] {
  return sectionItems(data, sectionId).map((row, idx) => {
    const mover = quoteRowToMover(row)
    if (sectionId !== 'hk_trending') return mover
    const rankRaw = (row as MarketIndexQuote & { rank?: number }).rank
    return {
      ...mover,
      rank: typeof rankRaw === 'number' ? rankRaw : idx + 1,
    }
  })
}

function pickMovers(
  topLevel: MarketStockMover[] | undefined,
  sectionId: string,
  data: MarketDynamicsData | null | undefined,
): MarketStockMover[] {
  const fromTop = topLevel?.map(normalizeMover) ?? []
  if (fromTop.length) return fromTop
  return sectionMovers(data, sectionId)
}

export function buildHkMarketDynamicsModel(data: MarketDynamicsData | null): HkMarketDynamicsModel {
  return {
    indices: data?.hk_indices ?? sectionItems(data, 'hk_major'),
    sectors: sectionItems(data, 'hk_sectors'),
    gainers: pickMovers(data?.hk_gainers, 'hk_gainers', data),
    losers: pickMovers(data?.hk_losers, 'hk_losers', data),
    trending: pickMovers(data?.hk_trending, 'hk_trending', data),
    sectorStatus: data?.hk_sector_status,
    sectorHint: data?.hk_sector_hint,
  }
}
