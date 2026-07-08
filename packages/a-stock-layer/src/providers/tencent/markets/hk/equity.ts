import type { StockKline, StockListItem, StockProfile, StockRealtime } from '../../../../core/schema.js'
import { isValidHkSymbol } from '../../../../utils/hk-market.js'
import {
  fetchTencentHkStockKline,
  fetchTencentHkStockProfile,
  fetchTencentHkStockQuote,
  resolveTencentHkKlinePeriod,
} from '../../api/hk-detail-service.js'
import { fetchTencentHkStockList } from '../../api/hk-rank-service.js'
import type { TencentCnHandler } from '../cn/handler.js'
import {
  mapTencentHkProfileRow,
  mapTencentHkQuoteRow,
} from '../../normalize/hk-equity.js'

async function tencentHkRealtime(code: string): Promise<StockRealtime[] | null> {
  try {
    const quote = await fetchTencentHkStockQuote(code)
    return [mapTencentHkQuoteRow(quote.code, quote.parts)]
  } catch {
    return null
  }
}

async function tencentHkBatchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
  const out: StockRealtime[] = []
  for (const code of codes) {
    const rows = await tencentHkRealtime(String(code))
    if (rows?.[0]) out.push(rows[0])
  }
  return out.length ? out : null
}

async function tencentHkKline(
  code: string,
  period = 'daily',
  start = '',
  end = '',
  count?: number,
): Promise<StockKline[] | null> {
  const hkPeriod = resolveTencentHkKlinePeriod(period)
  if (!hkPeriod) return null
  try {
    const result = await fetchTencentHkStockKline({
      code,
      period: hkPeriod,
      limit: count != null && count > 0 ? count : undefined,
      startDate: start || undefined,
      endDate: end || undefined,
    })
    const items = result.items
    return items.length ? (items as StockKline[]) : null
  } catch {
    return null
  }
}

async function tencentHkProfile(code: string): Promise<StockProfile[] | null> {
  try {
    const profile = await fetchTencentHkStockProfile(code)
    return [mapTencentHkProfileRow(profile)]
  } catch {
    return null
  }
}

async function tencentHkStockList(
  market: unknown,
  keyword = '',
  page = 1,
  pageSize = 100,
): Promise<StockListItem[] | null> {
  const kw = String(keyword ?? '').trim().toLowerCase()
  try {
    const list = await fetchTencentHkStockList({
      board: 'MB',
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.max(1, Math.min(Number(pageSize) || 100, 100)),
    })
    const seen = new Set<string>()
    const items: StockListItem[] = []
    for (const row of list.items) {
      const code = String(row.code ?? '').trim()
      if (!code || seen.has(code)) continue
      const name = String(row.name ?? code)
      if (kw && !code.toLowerCase().includes(kw) && !name.toLowerCase().includes(kw)) continue
      seen.add(code)
      items.push({
        code,
        name,
        market: 'HK',
        industry: String(list.boardLabel ?? 'HK'),
      })
    }
    return items.length ? items : null
  } catch {
    return null
  }
}

function isHkStockListCall(market: unknown): boolean {
  return String(market ?? '').trim().toUpperCase() === 'HK'
}

function isHkBatch(codes: unknown[]): boolean {
  return codes.length > 0 && codes.every(c => isValidHkSymbol(String(c)))
}

/** 在 Tencent CN handler 上叠加港股标准能力（realtime / kline / profile / list）路由 */
export function mixTencentHkEquity(DriverClass: typeof TencentCnHandler): void {
  const proto = DriverClass.prototype as TencentCnHandler

  const origRealtime = proto.realtime.bind(proto)
  proto.realtime = async function realtime(code: string) {
    if (isValidHkSymbol(code)) return tencentHkRealtime(code)
    return origRealtime(code)
  }

  const origBatchRealtime = proto.batchRealtime.bind(proto)
  proto.batchRealtime = async function batchRealtime(codes: string[]) {
    if (isHkBatch(codes)) return tencentHkBatchRealtime(codes)
    return origBatchRealtime(codes)
  }

  const origKline = proto.kline.bind(proto)
  proto.kline = async function kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ) {
    if (isValidHkSymbol(code)) {
      return tencentHkKline(code, period, start, end, count)
    }
    return origKline(code, period, start, end, count)
  }

  const origProfile = proto.profile.bind(proto)
  proto.profile = async function profile(code: string) {
    if (isValidHkSymbol(code)) return tencentHkProfile(code)
    return origProfile(code)
  }

  const origStockList = proto.stockList.bind(proto)
  proto.stockList = async function stockList(market = 'all', keyword = '', page?: number, pageSize?: number) {
    if (isHkStockListCall(market)) {
      return tencentHkStockList(market, keyword, page, pageSize)
    }
    return origStockList(market)
  }
}
