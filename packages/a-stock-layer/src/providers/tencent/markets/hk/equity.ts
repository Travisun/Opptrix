import type { StockKline, StockListItem, StockProfile, StockRealtime, NewsItem } from '../../../../core/schema.js'
import { isValidHkSymbol } from '../../../../utils/hk-market.js'
import { isCnSecPrefixed } from '../../../../utils/helpers.js'
import {
  fetchTencentHkDividends,
  fetchTencentHkStockKline,
  fetchTencentHkStockNews,
  fetchTencentHkStockNotices,
  fetchTencentHkStockProfile,
  fetchTencentHkStockQuote,
  fetchTencentHkTechnicalAnalysis,
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
  return codes.length > 0 && codes.every(c => {
    const s = String(c)
    if (isCnSecPrefixed(s) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(s.trim())) return false
    return isValidHkSymbol(s)
  })
}

/** 在 Tencent CN handler 上叠加港股标准能力（realtime / kline / profile / list）路由 */
export function mixTencentHkEquity(DriverClass: typeof TencentCnHandler): void {
  const proto = DriverClass.prototype as TencentCnHandler

  const origRealtime = proto.realtime.bind(proto)
  proto.realtime = async function realtime(code: string) {
    if (isCnSecPrefixed(code) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(code.trim())) {
      return origRealtime(code)
    }
    if (isValidHkSymbol(code)) return tencentHkRealtime(code)
    return origRealtime(code)
  }

  const origBatchRealtime = proto.batchRealtime.bind(proto)
  proto.batchRealtime = async function batchRealtime(codes: string[]) {
    if (isHkBatch(codes)) return tencentHkBatchRealtime(codes)
    if (codes.some(c => isCnSecPrefixed(c))) return origBatchRealtime(codes)
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
    if (isCnSecPrefixed(code) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(code.trim())) {
      return origKline(code, period, start, end, count)
    }
    if (isValidHkSymbol(code)) {
      return tencentHkKline(code, period, start, end, count)
    }
    return origKline(code, period, start, end, count)
  }

  const origProfile = proto.profile.bind(proto)
  proto.profile = async function profile(code: string) {
    if (isCnSecPrefixed(code) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(code.trim())) {
      return origProfile(code)
    }
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

  const origNews = proto.news.bind(proto)
  ;(proto as { news: typeof origNews }).news = async function news(
    code: string,
    page = 1,
    pageSize = 20,
    newsType = 'all',
  ): Promise<NewsItem[] | null> {
    if (isCnSecPrefixed(code) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(code.trim())) {
      return origNews(code, page, pageSize, newsType)
    }
    if (!isValidHkSymbol(code)) return origNews(code, page, pageSize, newsType)
    const bare = String(code).trim()
    const pg = Math.max(1, page)
    const n = Math.max(1, Math.min(pageSize, 50))
    const channel = String(newsType ?? '').trim().toLowerCase()
    if (channel === 'notice') {
      const result = await fetchTencentHkStockNotices({ code: bare, page: pg, pageSize: n })
      if (!result.items.length && !result.total) return null
      return [{ code: bare, ...result, source: 'tencent_hk_notice' } as unknown as NewsItem]
    }
    const result = await fetchTencentHkStockNews({ code: bare, page: pg, pageSize: n })
    if (!result.items.length && !result.total) return null
    return [{ code: bare, ...result, source: 'tencent_hk_news' } as unknown as NewsItem]
  }

  ;(proto as { dividend?: unknown }).dividend = async function dividend(
    code: string,
    page = 1,
    pageSize = 10,
    includeRecent = true,
  ) {
    if (isCnSecPrefixed(code) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(code.trim())) return null
    if (!isValidHkSymbol(code)) return null
    const bare = String(code).trim()
    const result = await fetchTencentHkDividends({
      code: bare,
      page: Math.max(1, page),
      pageSize: Math.max(1, Math.min(pageSize, 50)),
      includeRecent: Boolean(includeRecent),
    })
    if (!result.items.length && !result.recent.length) return null
    return [{ ...result, source: 'tencent_hk_dividends' }]
  }

  ;(proto as { technicalAnalysis?: unknown }).technicalAnalysis = async function technicalAnalysis(code: string) {
    if (isCnSecPrefixed(code) || /^\d{6}(\.(SH|SZ|BJ))?$/i.test(code.trim())) return null
    if (!isValidHkSymbol(code)) return null
    const bare = String(code).trim()
    const result = await fetchTencentHkTechnicalAnalysis(bare)
    return [{ ...result, source: 'tencent_hk_technical' }]
  }
}
