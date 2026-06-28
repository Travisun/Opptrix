import { normalizeCode, resolveSecId, safeFloat } from '../utils/helpers.js'

export interface SearchQuote {
  code: string
  name: string
  quoteId: string
  marketType?: string
}

const searchCache = new Map<string, SearchQuote>()

/** Search EastMoney quote ID (supports name / HK / US codes) */
export async function searchQuote(keyword: string, count = 1): Promise<SearchQuote | SearchQuote[] | null> {
  const cached = searchCache.get(keyword)
  if (cached && count === 1) return cached

  const qs = new URLSearchParams({
    input: keyword,
    type: '14',
    token: 'D43BF722C8E33BDC906FB84D85E326E8',
    count: String(Math.max(count, 5)),
  })
  const resp = await fetch(`https://searchapi.eastmoney.com/api/suggest/get?${qs}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!resp.ok) return null
  const json = await resp.json() as {
    QuotationCodeTable?: { Data?: Record<string, string>[] }
  }
  const items = json?.QuotationCodeTable?.Data ?? []
  if (!items.length) return null

  const quotes: SearchQuote[] = items.map(it => ({
    code: it.Code ?? '',
    name: it.Name ?? '',
    quoteId: it.QuoteID ?? '',
    marketType: it.Classify,
  }))

  if (count === 1) {
    searchCache.set(keyword, quotes[0])
    return quotes[0]
  }
  return quotes.slice(0, count)
}

/** Resolve secid — fast path for 6-digit A-share codes */
export async function getQuoteId(code: string): Promise<string> {
  const c = normalizeCode(code)
  if (/^\d{6}$/.test(c)) return resolveSecId(c)
  const q = await searchQuote(code, 1)
  if (q && !Array.isArray(q) && q.quoteId) return q.quoteId
  return resolveSecId(c)
}

/** Preserve intraday datetime (YYYY-MM-DD HH:mm[:ss]); daily stays YYYY-MM-DD. */
export function normDate(s: string) {
  const v = String(s).trim()
  if (!v) return v
  if (v.includes(' ')) {
    const [datePart, timePart = ''] = v.split(/\s+/)
    const date = datePart.slice(0, 10)
    const raw = timePart.slice(0, 8)
    const time = raw.length === 5 ? `${raw}:00` : raw
    return `${date} ${time}`
  }
  return v.slice(0, 10)
}

export function num(v: unknown) {
  return safeFloat(v)
}

export function fmtBegEnd(d: string) {
  return d ? d.replace(/-/g, '') : d
}
