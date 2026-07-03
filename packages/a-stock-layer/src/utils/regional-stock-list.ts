import type { StockListItem } from '@opptrix/shared'
import { getRegionalEquitySeeds } from '../data/regional-equity-seeds.js'
import type { RegionalEquityMarket } from './regional-symbol.js'
import { normalizeRegionalSymbol } from './regional-symbol.js'
import { fetchYahooFinanceSearch, type YahooSearchQuote } from './yahoo-search.js'

const SUFFIX: Record<RegionalEquityMarket, string> = {
  JP: '.T',
  KR: '.KS',
  HK: '.HK',
}

const SEARCH_QUERIES: Record<RegionalEquityMarket, string[]> = {
  JP: [
    'トヨタ', 'ソニー', '任天堂', 'キーエンス', '三菱UFJ', 'ソフトバンク', '東京エレクトロン',
    'ファーストリテイリング', 'リクルート', '信越化学', 'ホンダ', '日立', '村田製作所',
    'Toyota', 'Sony', 'Nintendo', 'Keyence', 'SoftBank', 'Tokyo Electron', 'Fast Retailing',
  ],
  KR: [
    '삼성전자', 'SK하이닉스', 'NAVER', '현대차', 'LG화학', '카카오', '셀트리온', 'KB금융',
    '포스코', '기아', '삼성바이오', 'LG전자', 'Samsung', 'SK Hynix', 'Hyundai', 'Kakao',
  ],
  HK: [
    '腾讯', '阿里巴巴', '美团', '汇丰', '中国移动', '小米', '比亚迪', '网易', '百度',
    'Tencent', 'Alibaba', 'Meituan', 'HSBC', 'Xiaomi', 'BYD', 'NetEase', 'Baidu',
  ],
}

export function regionalSeedStockList(market: RegionalEquityMarket): StockListItem[] {
  return getRegionalEquitySeeds(market).map(seed => ({
    code: normalizeRegionalSymbol(market, seed.code),
    name: seed.name,
    market,
    industry: seed.industry ?? '',
  }))
}

export function yahooQuoteToRegionalStockRow(
  market: RegionalEquityMarket,
  quote: YahooSearchQuote,
): StockListItem | null {
  const suffix = SUFFIX[market]
  const sym = quote.symbol.trim().toUpperCase()
  if (!sym.endsWith(suffix)) return null
  if (quote.quoteType && quote.quoteType !== 'EQUITY') return null
  const rawCode = sym.slice(0, -suffix.length)
  const code = normalizeRegionalSymbol(market, rawCode)
  if (!code) return null
  return {
    code,
    name: quote.longname || quote.shortname || code,
    market,
    industry: '',
  }
}

function filterByKeyword(rows: StockListItem[], keyword: string): StockListItem[] {
  const kw = keyword.trim().toUpperCase()
  if (!kw) return rows
  return rows.filter(row =>
    row.code.toUpperCase().includes(kw)
    || row.name.toUpperCase().includes(kw)
    || row.industry.toUpperCase().includes(kw),
  )
}

/** Yahoo Finance search — provider-internal list discovery */
export async function fetchRegionalStockListFromYahoo(
  market: RegionalEquityMarket,
  opts?: { queries?: string[]; perQuery?: number; keyword?: string },
): Promise<StockListItem[]> {
  const keyword = opts?.keyword?.trim() ?? ''
  if (keyword) {
    try {
      const quotes = await fetchYahooFinanceSearch(keyword, opts?.perQuery ?? 25)
      const rows: StockListItem[] = []
      for (const quote of quotes) {
        const row = yahooQuoteToRegionalStockRow(market, quote)
        if (row) rows.push(row)
      }
      if (rows.length) return rows
    } catch {
      /* fall through to seed filter */
    }
    return filterByKeyword(regionalSeedStockList(market), keyword)
  }

  const queries = opts?.queries ?? SEARCH_QUERIES[market]
  const perQuery = opts?.perQuery ?? 25
  const byCode = new Map<string, StockListItem>()

  for (const seed of regionalSeedStockList(market)) {
    byCode.set(seed.code, seed)
  }

  for (const q of queries) {
    try {
      const quotes = await fetchYahooFinanceSearch(q, perQuery)
      for (const quote of quotes) {
        const row = yahooQuoteToRegionalStockRow(market, quote)
        if (row && !byCode.has(row.code)) byCode.set(row.code, row)
      }
    } catch {
      /* skip failed query */
    }
  }

  return [...byCode.values()]
}
