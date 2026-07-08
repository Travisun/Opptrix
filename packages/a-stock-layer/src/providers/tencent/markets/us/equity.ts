import type { StockKline, StockListItem, StockProfile, StockRealtime } from '../../../../core/schema.js'
import { isValidUsSymbol } from '../../../../utils/us-market.js'
import {
  fetchTencentUsStockKline,
  fetchTencentUsStockProfile,
  fetchTencentUsStockQuote,
  resolveTencentUsKlinePeriod,
} from '../../api/us-detail-service.js'
import { fetchTencentUsStockList } from '../../api/us-stock-service.js'
import type { TencentCnHandler } from '../cn/handler.js'
import {
  mapTencentUsProfileRow,
  mapTencentUsQuoteRow,
} from '../../normalize/us-equity.js'

async function tencentUsRealtime(symbol: string): Promise<StockRealtime[] | null> {
  try {
    const quote = await fetchTencentUsStockQuote(symbol)
    return [mapTencentUsQuoteRow(quote)]
  } catch {
    return null
  }
}

async function tencentUsBatchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
  const out: StockRealtime[] = []
  for (const code of codes) {
    const rows = await tencentUsRealtime(String(code))
    if (rows?.[0]) out.push(rows[0])
  }
  return out.length ? out : null
}

async function tencentUsKline(
  code: string,
  period = 'daily',
  start = '',
  end = '',
  count?: number,
): Promise<StockKline[] | null> {
  const usPeriod = resolveTencentUsKlinePeriod(period)
  if (!usPeriod) return null
  try {
    const result = await fetchTencentUsStockKline({
      code,
      period: usPeriod,
      limit: count != null && count > 0 ? count : undefined,
      startDate: start || undefined,
      endDate: end || undefined,
    })
    return result.items.length ? result.items : null
  } catch {
    return null
  }
}

async function tencentUsProfile(code: string): Promise<StockProfile[] | null> {
  try {
    const profile = await fetchTencentUsStockProfile(code)
    return [mapTencentUsProfileRow(profile)]
  } catch {
    return null
  }
}

async function tencentUsStockList(keyword = ''): Promise<StockListItem[] | null> {
  const kw = keyword.trim().toLowerCase()
  try {
    const [tec, cdr] = await Promise.all([
      fetchTencentUsStockList({ board: 'tec', page: 1, pageSize: 100 }),
      fetchTencentUsStockList({ board: 'cdr', page: 1, pageSize: 100 }),
    ])
    const seen = new Set<string>()
    const items: StockListItem[] = []
    for (const row of [...tec.items, ...cdr.items]) {
      const code = String(row.code ?? '').trim()
      if (!code || seen.has(code)) continue
      const name = String(row.name ?? code)
      if (kw && !code.toLowerCase().includes(kw) && !name.toLowerCase().includes(kw)) continue
      seen.add(code)
      items.push({
        code,
        name,
        market: 'US',
        industry: String(row.boardLabel ?? 'US'),
      })
    }
    return items.length ? items : null
  } catch {
    return null
  }
}

function isUsStockListCall(market: unknown): boolean {
  return String(market ?? '').trim().toUpperCase() === 'US'
}

function isUsBatch(codes: unknown[]): boolean {
  return codes.length > 0 && codes.every(c => isValidUsSymbol(String(c)))
}

/** 在 Tencent CN handler 上叠加美股标准能力（realtime / kline / profile / list）路由 */
export function mixTencentUsEquity(DriverClass: typeof TencentCnHandler): void {
  const proto = DriverClass.prototype as TencentCnHandler

  const origRealtime = proto.realtime.bind(proto)
  proto.realtime = async function realtime(code: string) {
    if (isValidUsSymbol(code)) return tencentUsRealtime(code)
    return origRealtime(code)
  }

  const origBatchRealtime = proto.batchRealtime.bind(proto)
  proto.batchRealtime = async function batchRealtime(codes: string[]) {
    if (isUsBatch(codes)) return tencentUsBatchRealtime(codes)
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
    if (isValidUsSymbol(code)) {
      return tencentUsKline(code, period, start, end, count)
    }
    return origKline(code, period, start, end, count)
  }

  const origProfile = proto.profile.bind(proto)
  proto.profile = async function profile(code: string) {
    if (isValidUsSymbol(code)) return tencentUsProfile(code)
    return origProfile(code)
  }

  const origStockList = proto.stockList.bind(proto)
  proto.stockList = async function stockList(market = 'all', keyword = '') {
    if (isUsStockListCall(market)) {
      return tencentUsStockList(String(keyword ?? ''))
    }
    return origStockList(market)
  }
}
