import type { NewsItem } from '@opptrix/a-stock-layer'

export interface StockDetailShareholderView {
  code?: string
  reportDate?: string
  shareholderCount?: number | null
  shareholderCountChange?: number | null
  avgHoldingValue?: number | null
  holdFocus?: string
  avgFreeShares?: number | null
  top10Shareholders?: Array<{
    rank: number
    name: string
    sharesHeld?: number | null
    sharePct?: number | null
    change?: number | null
    shareType?: string
  }>
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown, fallback = ''): string {
  return v != null ? String(v) : fallback
}

function parseHolderCount(v: unknown): number | null {
  if (v == null || v === '') return null
  const cleaned = String(v).replace(/,/g, '').trim()
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseShareAmount(v: unknown): number | null {
  if (v == null || v === '') return null
  const text = String(v).replace(/,/g, '').trim()
  if (!text || text === '—' || text === '-') return null
  const wan = text.match(/^([\d.]+)\s*万/)
  if (wan) return Number(wan[1]) * 1e4
  const yi = text.match(/^([\d.]+)\s*亿/)
  if (yi) return Number(yi[1]) * 1e8
  const pct = text.match(/^([\d.]+)\s*%$/)
  if (pct) return Number(pct[1])
  return num(text)
}

function parseSharePct(v: unknown): number | null {
  if (v == null || v === '') return null
  const text = String(v).trim()
  const pct = text.match(/^([\d.]+)\s*%$/)
  if (pct) return Number(pct[1])
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function isMetaRow(row: Record<string, unknown>): boolean {
  return row.type === 'meta' || (row.holderCount != null && row.type !== 'holder' && !row.holder_name && !row.name)
}

function isHolderRow(row: Record<string, unknown>): boolean {
  return row.type === 'holder' || row.holder_name != null || (row.name != null && row.rank != null)
}

function pickLatestDate(rows: Record<string, unknown>[]): string {
  const dates = rows
    .map(r => str(r.end_date ?? r.asOfDate ?? r.reportDate ?? r.report_date))
    .filter(Boolean)
    .sort()
  return dates[dates.length - 1] ?? ''
}

function mapHolderItems(rows: Record<string, unknown>[]): StockDetailShareholderView['top10Shareholders'] {
  return rows
    .slice()
    .sort((a, b) => (num(a.rank) ?? 999) - (num(b.rank) ?? 999))
    .map((row, index) => ({
      rank: num(row.rank) ?? index + 1,
      name: str(row.holder_name ?? row.name),
      sharesHeld: parseShareAmount(row.hold_amount ?? row.shares ?? row.sharesHeld),
      sharePct: parseSharePct(row.hold_ratio ?? row.ratio ?? row.sharePct),
      change: num(row.change ?? row.hold_change),
      shareType: str(row.shareType ?? row.share_type, '') || undefined,
    }))
    .filter(row => row.name)
}

/** 将各 provider 股东原始数组归一为详情页结构 */
export function normalizeShareholderPayload(
  code: string,
  rows: Record<string, unknown>[] | null | undefined,
): StockDetailShareholderView | null {
  if (!rows?.length) return null

  const first = rows[0]!
  if (Array.isArray(first.top10Shareholders) || Array.isArray(first.top10_shareholders)) {
    const top10 = (first.top10Shareholders ?? first.top10_shareholders) as StockDetailShareholderView['top10Shareholders']
    return {
      code: str(first.code, code),
      reportDate: str(first.reportDate ?? first.report_date ?? first.asOfDate),
      shareholderCount: parseHolderCount(first.shareholderCount ?? first.holderCount ?? first.holder_count),
      shareholderCountChange: num(first.shareholderCountChange ?? first.holder_count_change),
      avgHoldingValue: num(first.avgHoldingValue ?? first.avg_holding_value),
      holdFocus: str(first.holdFocus ?? first.hold_focus, '') || undefined,
      avgFreeShares: num(first.avgFreeShares ?? first.avg_free_shares),
      top10Shareholders: top10,
    }
  }

  const metaRows = rows.filter(isMetaRow)
  const holderRows = rows.filter(isHolderRow)

  const floatMeta = metaRows.find(r => r.holderCategory === 'float') ?? metaRows[metaRows.length - 1]
  const floatHolders = holderRows.filter(r => r.holderCategory === 'float')
  const majorHolders = holderRows.filter(r => r.holderCategory === 'major')
  const tushareFloat = holderRows.filter(r => r.source === 'top10_floatholders')
  const tushareMajor = holderRows.filter(r => r.source === 'top10_holders')

  let topPool = floatHolders
  if (!topPool.length) topPool = tushareFloat
  if (!topPool.length) topPool = majorHolders
  if (!topPool.length) topPool = tushareMajor
  if (!topPool.length) topPool = holderRows

  const latestDate = pickLatestDate(topPool)
  const datedPool = latestDate
    ? topPool.filter(r => str(r.end_date ?? r.asOfDate) === latestDate || !str(r.end_date ?? r.asOfDate))
    : topPool

  const top10Shareholders = mapHolderItems(datedPool.length ? datedPool : topPool)
  if (!top10Shareholders?.length && !floatMeta && !metaRows.length) return null

  const meta = floatMeta ?? metaRows[metaRows.length - 1]
  return {
    code: str(meta?.code ?? first.code, code),
    reportDate: str(meta?.asOfDate ?? meta?.end_date ?? latestDate),
    shareholderCount: parseHolderCount(meta?.holderCount ?? meta?.holder_count),
    shareholderCountChange: num(meta?.holderCountChange ?? meta?.holder_count_change),
    avgHoldingValue: num(meta?.avgHoldingValue),
    holdFocus: str(meta?.holdFocus, '') || undefined,
    avgFreeShares: num(meta?.avgFreeShares),
    top10Shareholders: top10Shareholders?.length ? top10Shareholders : undefined,
  }
}

const PROFILE_FIELD_ALIASES: Record<string, string> = {
  org_name: 'orgName',
  com_name: 'orgName',
  company_name: 'orgName',
  fullname: 'orgName',
  found_date: 'foundDate',
  setup_date: 'foundDate',
  listing_date: 'listingDate',
  list_date: 'listingDate',
  ipo_date: 'listingDate',
  main_business: 'mainBusiness',
  mainBusiness: 'mainBusiness',
  org_profile: 'orgProfile',
  introduction: 'orgProfile',
  profile: 'orgProfile',
  business_scope: 'businessScope',
  total_market_cap: 'totalMarketCap',
  circulating_market_cap: 'circulatingMarketCap',
  industry_csrc: 'industryCsrc',
  industryClassification: 'industryCsrc',
  legal_person: 'legalPerson',
  legal_representative: 'legalPerson',
  org_tel: 'orgTel',
  phone: 'orgTel',
  security_type: 'securityType',
  former_name: 'formerName',
  old_name: 'formerName',
  issue_price: 'issuePrice',
  reg_capital: 'regCapital',
  board_secretary: 'secretary',
  web_site: 'website',
}

const PROFILE_SCALAR_KEYS = [
  'name', 'orgName', 'industry', 'industryCsrc', 'listingDate', 'foundDate',
  'mainBusiness', 'orgProfile', 'businessScope', 'totalMarketCap', 'circulatingMarketCap',
  'employees', 'province', 'city', 'address', 'website', 'regCapital', 'chairman',
  'legalPerson', 'secretary', 'orgTel', 'securityType', 'formerName', 'issuePrice',
] as const

function isBlankProfileValue(v: unknown): boolean {
  if (v == null || v === '') return true
  if (Array.isArray(v) && !v.length) return true
  return false
}

function normalizeConceptList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map(item => str(item).trim()).filter(Boolean)
  }
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,，、|]/).map(s => s.trim()).filter(Boolean)
  }
  return []
}

/** 将各 provider profile 行归一为详情页 camelCase 结构 */
export function normalizeStockProfileRow(
  code: string,
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null

  const out: Record<string, unknown> = { code: str(raw.code, code) || code }
  let concepts: string[] = []

  for (const [key, value] of Object.entries(raw)) {
    if (isBlankProfileValue(value)) continue
    const target = PROFILE_FIELD_ALIASES[key] ?? key
    if (target === 'concepts') {
      concepts.push(...normalizeConceptList(value))
      continue
    }
    if (target === 'code') {
      out.code = str(value, code) || code
      continue
    }
    if (PROFILE_SCALAR_KEYS.includes(target as typeof PROFILE_SCALAR_KEYS[number])) {
      if (target.endsWith('Cap') || target === 'regCapital' || target === 'issuePrice' || target === 'employees') {
        out[target] = num(value)
      } else {
        out[target] = typeof value === 'number' ? value : str(value)
      }
    }
  }

  if (concepts.length) {
    out.concepts = [...new Set(concepts)]
  }

  const filledScalars = PROFILE_SCALAR_KEYS.filter(k => !isBlankProfileValue(out[k])).length
  if (filledScalars === 0 && !out.concepts) return null
  return out
}

/** 合并多源 profile，优先保留先出现源的非空字段，概念板块取并集 */
export function mergeStockProfileRows(
  code: string,
  rows: Array<Record<string, unknown> | null | undefined>,
): Record<string, unknown> | null {
  const normalized = rows
    .map(row => normalizeStockProfileRow(code, row))
    .filter((row): row is Record<string, unknown> => !!row)
  if (!normalized.length) return null

  const merged: Record<string, unknown> = { code }
  const conceptSet = new Set<string>()

  for (const row of normalized) {
    for (const key of PROFILE_SCALAR_KEYS) {
      if (!isBlankProfileValue(merged[key]) || isBlankProfileValue(row[key])) continue
      merged[key] = row[key]
    }
    for (const tag of normalizeConceptList(row.concepts)) {
      conceptSet.add(tag)
    }
  }

  if (conceptSet.size) {
    merged.concepts = [...conceptSet]
  }

  const filledScalars = PROFILE_SCALAR_KEYS.filter(k => !isBlankProfileValue(merged[k])).length
  if (filledScalars === 0 && !merged.concepts) return null
  return merged
}

/** 用行情中的市值字段补全 profile */
export function enrichDetailProfileFromQuote(
  profile: Record<string, unknown> | null,
  quote: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!profile && !quote) return null
  const out: Record<string, unknown> = { ...(profile ?? {}) }
  if (isBlankProfileValue(out.totalMarketCap) && quote?.marketCap != null) {
    out.totalMarketCap = quote.marketCap
  }
  if (isBlankProfileValue(out.circulatingMarketCap) && quote?.circulatingMarketCap != null) {
    out.circulatingMarketCap = quote.circulatingMarketCap
  }
  if (!out.code && quote?.code) out.code = quote.code
  return out
}

/** 详情页行情：保留 fallback 的 OHLCV，优先采用 enriched 源的估值字段 */
export function mergeDetailQuoteRows(
  code: string,
  preferred: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!preferred && !fallback) return null
  const pick = (key: string) => {
    const p = preferred?.[key]
    if (p != null && p !== '') return p
    const f = fallback?.[key]
    return f != null && f !== '' ? f : p
  }
  return {
    ...(fallback ?? {}),
    ...(preferred ?? {}),
    code,
    name: pick('name'),
    price: pick('price'),
    preClose: pick('preClose'),
    open: pick('open'),
    high: pick('high'),
    low: pick('low'),
    volume: fallback?.volume ?? preferred?.volume ?? null,
    amount: fallback?.amount ?? preferred?.amount ?? null,
    changePct: pick('changePct'),
    change: pick('change'),
    pe: preferred?.pe ?? fallback?.pe ?? null,
    pb: preferred?.pb ?? fallback?.pb ?? null,
    turnoverRate: preferred?.turnoverRate ?? fallback?.turnoverRate ?? null,
    volumeRatio: preferred?.volumeRatio ?? fallback?.volumeRatio ?? null,
    marketCap: preferred?.marketCap ?? fallback?.marketCap ?? null,
    circulatingMarketCap: preferred?.circulatingMarketCap ?? fallback?.circulatingMarketCap ?? null,
    amplitude: preferred?.amplitude ?? fallback?.amplitude ?? null,
  }
}

export function holderHistoryFromRows(rows: Record<string, unknown>[] | null | undefined) {
  if (!rows?.length) return []
  return rows
    .map(row => ({
      date: str(row.end_date ?? row.endDate ?? row.reportDate ?? row.asOfDate).replace(/-/g, '').slice(0, 8),
      count: parseHolderCount(row.holder_num ?? row.holderNum ?? row.holderCount ?? row.holder_count),
    }))
    .filter(row => row.date && row.count != null) as Array<{ date: string; count: number }>
}

function concentrationLabel(top10: StockDetailShareholderView['top10Shareholders']): string | undefined {
  if (!top10?.length) return undefined
  const sumPct = top10.reduce((sum, row) => sum + (row.sharePct ?? 0), 0)
  if (sumPct >= 70) return '高度集中'
  if (sumPct >= 50) return '较为集中'
  if (sumPct >= 30) return '相对分散'
  return '分散'
}

/** 补全股东户数变动、户均持股/市值、集中度等衍生字段 */
export function enrichShareholderView(
  view: StockDetailShareholderView | null,
  ctx?: {
    price?: number | null
    circulatingMarketCap?: number | null
    holderHistory?: Array<{ date: string; count: number }>
  },
): StockDetailShareholderView | null {
  if (!view) return null
  const out: StockDetailShareholderView = { ...view }
  const history = ctx?.holderHistory ?? []
  if (out.shareholderCountChange == null && history.length >= 2) {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    const prev = sorted[sorted.length - 2]!
    const latest = sorted[sorted.length - 1]!
    if (prev.count > 0) {
      out.shareholderCountChange = ((latest.count - prev.count) / prev.count) * 100
    }
    if (!out.shareholderCount) out.shareholderCount = latest.count
    if (!out.reportDate && latest.date.length === 8) {
      out.reportDate = `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`
    }
  }

  const price = ctx?.price ?? null
  const holderCount = out.shareholderCount ?? null
  const circulatingCap = ctx?.circulatingMarketCap ?? null

  if (out.avgFreeShares == null && holderCount && circulatingCap != null && price != null && price > 0) {
    out.avgFreeShares = circulatingCap / price / holderCount
  }
  if (out.avgHoldingValue == null && out.avgFreeShares != null && price != null) {
    out.avgHoldingValue = out.avgFreeShares * price
  } else if (out.avgHoldingValue == null && holderCount && circulatingCap != null) {
    out.avgHoldingValue = circulatingCap / holderCount
  }

  if (!out.holdFocus) {
    out.holdFocus = concentrationLabel(out.top10Shareholders)
  }

  return out
}

/** 公告列表去重（按日期 + 标题 + 链接） */
export function dedupeStockNewsItems(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    const key = `${item.date}|${item.title}|${item.url ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}
