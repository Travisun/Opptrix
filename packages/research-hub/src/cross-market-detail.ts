/** 美股 / 港股详情 — 将腾讯自定义方法响应规范为与 A 股 stockDetail 对齐的结构 */

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown, fallback = ''): string {
  return v != null ? String(v).trim() : fallback
}

function parseShareAmount(v: unknown): number | null {
  if (v == null || v === '') return null
  const text = String(v).replace(/,/g, '').trim()
  if (!text || text === '—' || text === '-') return null
  const wan = text.match(/^([\d.]+)\s*万/i)
  if (wan) return Number(wan[1]) * 1e4
  const yi = text.match(/^([\d.]+)\s*亿/i)
  if (yi) return Number(yi[1]) * 1e8
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function parseSharePct(v: unknown): number | null {
  if (v == null || v === '') return null
  const text = String(v).trim()
  const pct = text.match(/^([\d.]+)\s*%$/)
  if (pct) return Number(pct[1])
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function newsDate(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  const m = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]!
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  }
  return text.slice(0, 10)
}

/** 港股公告详情 — 腾讯 H5 阅读页（noticeList 上游 url 恒为空） */
function buildHkNoticeDetailUrl(_code: string, id: string): string {
  return `https://gu.qq.com/resources/shy/news/detail-v2/index.html#/index?id=${encodeURIComponent(id)}&s=b`
}

function isOfficialNoticeRow(row: Record<string, unknown>): boolean {
  const id = str(row.id)
  const typeRaw = str(row.type)
  const typeStr = str(row.typeStr)
  if (id.startsWith('nesSN')) return false
  if (id.startsWith('nokHKEX') || id.startsWith('nos')) return true
  if (typeRaw === '0' || typeStr === '公告') return true
  return Boolean(id && str(row.title))
}

export function mapCrossMarketNewsItems(
  code: string,
  rows: Array<{ title?: string; time?: string; url?: string; type?: unknown }>,
  fallbackType = 'news',
): Array<{ code: string; title: string; date: string; url?: string; type?: string }> {
  return rows.map(row => ({
    code,
    title: str(row.title),
    date: newsDate(str(row.time)),
    url: str(row.url) || undefined,
    type: str(row.type, fallbackType) || fallbackType,
  })).filter(row => row.title)
}

export function normalizeUsTencentProfile(
  code: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const industry = raw.industry as { name?: string } | null | undefined
  const breakdownRaw = Array.isArray(raw.revenueBreakdown)
    ? raw.revenueBreakdown as Array<{
      date?: unknown
      currency?: unknown
      segments?: Array<{ label?: unknown; sales?: unknown; ratio?: unknown }>
    }>
    : []
  const revenueBreakdown = breakdownRaw.map(block => ({
    date: str(block.date),
    currency: str(block.currency) || undefined,
    segments: (block.segments ?? []).map(seg => ({
      label: str(seg.label),
      sales: str(seg.sales) || undefined,
      ratio: str(seg.ratio) || undefined,
    })).filter(seg => seg.label),
  })).filter(block => block.segments.length)
  const mainBusiness = revenueBreakdown.flatMap(block =>
    block.segments.map(s => s.label).filter(Boolean),
  ).slice(0, 8).join('、')
  return {
    code,
    name: str(raw.companyName, code),
    orgName: str(raw.companyName),
    industry: str(industry?.name),
    listingDate: str(raw.listingDate) || undefined,
    website: str(raw.website) || undefined,
    orgProfile: str(raw.description) || undefined,
    mainBusiness: mainBusiness || undefined,
    securityType: str(raw.exchange) || undefined,
    revenueBreakdown: revenueBreakdown.length ? revenueBreakdown : undefined,
    totalShares: parseShareAmount(raw.totalShares),
  }
}

export function normalizeHkTencentProfile(
  code: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const nested = (raw.raw ?? {}) as Record<string, unknown>
  const plates = Array.isArray(nested.plate)
    ? (nested.plate as Array<{ name?: unknown }>).map(p => str(p.name)).filter(Boolean)
    : []
  const brief = str(nested.BriefIntroduction) || str(raw.business ?? nested.Business)
  const business = str(raw.business ?? nested.Business)
  const stockSum = num(nested.STOCK_SUM ?? nested.HK_STOCK_SUM)
  const weekYield = num(nested.WEEK_YIELD)
  return {
    code,
    name: str(raw.chiName ?? nested.ChiName, code),
    orgName: str(raw.chiName ?? nested.ChiName) || undefined,
    website: str(raw.website ?? nested.Website) || undefined,
    orgProfile: brief || undefined,
    mainBusiness: business || undefined,
    industry: plates.join('、') || undefined,
    listingDate: str(nested.ListedDate) || undefined,
    chairman: str(nested.Chairman) || undefined,
    totalShares: stockSum,
    weekDividendYield: weekYield,
  }
}

/** 合并腾讯 US quote enrich（52 周高低、币种等）到 snapshot quote */
export function mergeCrossMarketQuote(
  base: Record<string, unknown> | null | undefined,
  enrich: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!base && !enrich) return null
  const out = { ...(base ?? {}) }
  if (enrich) {
    if (enrich.week52High != null) out.week52High = enrich.week52High
    if (enrich.week52Low != null) out.week52Low = enrich.week52Low
    if (enrich.currency != null) out.currency = enrich.currency
    if (out.turnoverRate == null && enrich.turnoverRate != null) out.turnoverRate = enrich.turnoverRate
    if (out.pe == null && enrich.pe != null) out.pe = enrich.pe
    if (out.pb == null && enrich.pb != null) out.pb = enrich.pb
    if (out.marketCap == null && enrich.marketCap != null) out.marketCap = enrich.marketCap
  }
  return Object.keys(out).length ? out : null
}

function parseHkAmount(raw: string | null | undefined): number | null {
  const text = String(raw ?? '').trim().replace(/,/g, '')
  if (!text || text === '--') return null
  const yi = text.match(/^([\d.]+)亿元$/)
  if (yi) return Number(yi[1]) * 1e8
  const wan = text.match(/^([\d.]+)万元$/)
  if (wan) return Number(wan[1]) * 1e4
  const n = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function findHkTableValue(table: unknown, labelPattern: RegExp): string | null {
  if (!Array.isArray(table)) return null
  for (const row of table) {
    const labelCol = (row as unknown[])?.[0] as unknown[] | undefined
    const label = labelCol?.[0]
    if (typeof label === 'string' && labelPattern.test(label.trim())) {
      const valueCol = (row as unknown[])?.[1] as unknown[] | undefined
      const val = valueCol?.[0]
      return val != null ? String(val) : null
    }
  }
  return null
}

function hkPeriodLabel(table: unknown): string {
  if (!Array.isArray(table)) return ''
  const header = table[0] as unknown[] | undefined
  const periodCol = header?.[1] as unknown[] | undefined
  const code = String(periodCol?.[0] ?? '').trim()
  if (/^\d{8}$/.test(code)) {
    return `${code.slice(0, 4)}-${code.slice(4, 6)}-${code.slice(6, 8)}`
  }
  return code
}

export function normalizeHkFinancialHistory(
  code: string,
  incomePayload: Record<string, unknown> | null | undefined,
  balancePayload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const incomeTables = Array.isArray(incomePayload?.tables)
    ? incomePayload!.tables as unknown[]
    : []
  const balanceTables = Array.isArray(balancePayload?.tables)
    ? balancePayload!.tables as unknown[]
    : []
  if (!incomeTables.length) return []

  const out: Array<Record<string, unknown>> = []
  for (let i = 0; i < incomeTables.length; i += 1) {
    const incomeTable = incomeTables[i]
    const balanceTable = balanceTables[i]
    const reportDate = hkPeriodLabel(incomeTable)
    if (!reportDate) continue
    const revenue = parseHkAmount(findHkTableValue(incomeTable, /^营业收入$/))
    const netProfit = parseHkAmount(findHkTableValue(incomeTable, /^归属母公司所有者净利润$/))
    const totalAssets = parseHkAmount(findHkTableValue(balanceTable, /^资产总计$/))
    const totalLiabilities = parseHkAmount(findHkTableValue(balanceTable, /^总负债$/))
    const debtRatio = totalAssets && totalLiabilities != null
      ? (totalLiabilities / totalAssets) * 100
      : null
    out.push({
      code,
      reportDate,
      reportType: reportDate.endsWith('-03-31') || reportDate.endsWith('-06-30')
        || reportDate.endsWith('-09-30')
        ? 'interim'
        : 'annual',
      revenue,
      revenueYoy: null,
      netProfit,
      netProfitYoy: null,
      eps: null,
      roe: null,
      grossMargin: null,
      netMargin: revenue && netProfit != null ? (netProfit / revenue) * 100 : null,
      debtRatio,
      operatingCashFlow: null,
      totalAssets,
      totalLiabilities,
    })
  }
  return out.sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate)))
}

export function normalizeUsFinancialHistory(
  code: string,
  payload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const items = Array.isArray(payload?.items) ? payload!.items as Record<string, unknown>[] : []
  return items.map(row => {
    const income = (row.income ?? {}) as Record<string, unknown>
    const balance = (row.balance ?? row.balence ?? {}) as Record<string, unknown>
    const cash = (row.cash ?? {}) as Record<string, unknown>
    const year = str(row.year)
    const revenue = num(income.revenue)
    const netProfit = num(income.netIncome)
    const totalAssets = num(balance.totalAssets)
    const totalLiabilities = num(balance.totalLiabilities)
    const debtRatio = totalAssets && totalLiabilities != null
      ? (totalLiabilities / totalAssets) * 100
      : null
    return {
      code,
      reportDate: year,
      reportType: 'annual',
      revenue,
      revenueYoy: null,
      netProfit,
      netProfitYoy: null,
      eps: null,
      roe: null,
      grossMargin: null,
      netMargin: revenue && netProfit != null ? (netProfit / revenue) * 100 : null,
      debtRatio,
      operatingCashFlow: num(cash.netCashChange),
      totalAssets,
      totalLiabilities,
    }
  }).filter(row => row.reportDate)
}

export function normalizeHkDividends(
  code: string,
  payload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const items = Array.isArray(payload?.items) ? payload!.items as Record<string, unknown>[] : []
  const recent = Array.isArray(payload?.recent) ? payload!.recent as Record<string, unknown>[] : []
  const mapped = items.map(row => ({
    code,
    year: str(row.fiscalYear),
    plan: str(row.content) || `${str(row.eventType)} ${str(row.method)}`.trim(),
    progress: str(row.method) || str(row.eventType),
    recordDate: str(row.recordStartDate) || str(row.recordEndDate) || undefined,
    exDate: str(row.exDate) || undefined,
    payDate: str(row.payDate) || undefined,
  })).filter(row => row.plan)
  for (const row of recent) {
    const plan = str(row.content)
    if (!plan) continue
    mapped.unshift({
      code,
      year: '',
      plan,
      progress: '近期派息',
      recordDate: str(row.recordDate) || undefined,
      exDate: str(row.exDate) || undefined,
      payDate: str(row.payDate) || undefined,
    })
  }
  const seen = new Set<string>()
  return mapped.filter(row => {
    const key = `${row.exDate}|${row.plan}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeCrossMarketRelatedStocks(
  market: 'US' | 'HK',
  payload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const items = Array.isArray(payload?.items) ? payload!.items as Record<string, unknown>[] : []
  return items.slice(0, 20).map(row => ({
    code: str(row.code),
    name: str(row.name),
    market,
    price: num(row.price),
    changePct: num(row.changePct ?? row.change_pct),
  })).filter(row => row.code && row.name)
}

export function normalizeUsSeniorTrades(
  code: string,
  payload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const items = Array.isArray(payload?.items) ? payload!.items as Record<string, unknown>[] : []
  return items.map(row => ({
    code,
    personName: str(row.name),
    tradeDate: newsDate(str(row.date)),
    shares: parseShareAmount(row.shares) ?? num(row.shares),
    value: num(row.value),
    detail: str(row.detail) || undefined,
  })).filter(row => row.personName && row.tradeDate)
}

export function normalizeHkTradingDistribution(
  code: string,
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload) return null
  const trading = (payload.trading ?? {}) as Record<string, unknown>
  const levels = Array.isArray(trading.priceLevels)
    ? trading.priceLevels as Record<string, unknown>[]
    : []
  const priceLevels = levels.slice(0, 8).map(row => ({
    price: num(row.price),
    volume: num(row.volume),
    volumeRatio: num(row.volumeRatio),
  })).filter(row => row.price != null)
  const largeOrderPct = num(trading.largeOrderPct)
  if (!priceLevels.length && largeOrderPct == null) return null
  return { code, priceLevels, largeOrderPct }
}

export function normalizeUsShareholders(
  code: string,
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const items = Array.isArray(payload?.items) ? payload!.items as Record<string, unknown>[] : []
  if (!items.length) return null
  return {
    code,
    reportDate: str(payload?.asOfDate),
    top10Shareholders: items.slice(0, 10).map((row, index) => ({
      rank: index + 1,
      name: str(row.name),
      sharesHeld: parseShareAmount(row.shares),
      sharePct: parseSharePct(row.shareRatio),
      change: parseShareAmount(row.sharesChange),
      shareType: str(row.holderType) || undefined,
    })).filter(row => row.name),
  }
}

/** 跨市场详情「公告」Tab — 仅官方公告，不含个股资讯/研报 */
export function normalizeCrossMarketNotices(
  code: string,
  noticePayload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const notices = Array.isArray(noticePayload?.items) ? noticePayload!.items as Record<string, unknown>[] : []
  const seen = new Set<string>()
  return notices
    .filter(isOfficialNoticeRow)
    .map(row => {
      const id = str(row.id)
      const external = str(row.url)
      return {
        code,
        title: str(row.title),
        date: newsDate(str(row.time)),
        url: external || (id ? buildHkNoticeDetailUrl(code, id) : undefined),
        type: 'notice',
      }
    })
    .filter(row => {
      if (!row.title) return false
      const key = `${row.date}|${row.title}|${row.url ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 40)
}

/** 跨市场详情「资讯」Tab — 市场新闻/报道，不含官方公告 */
export function normalizeCrossMarketArticles(
  code: string,
  newsPayload: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  const rows = Array.isArray(newsPayload?.items) ? newsPayload!.items as Record<string, unknown>[] : []
  const seen = new Set<string>()
  return mapCrossMarketNewsItems(code, rows, 'article')
    .map(row => ({ ...row, type: 'article' }))
    .filter(row => {
      if (!row.title) return false
      const key = `${row.date}|${row.title}|${row.url ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 40)
}

export function buildCrossMarketDetailPayload(
  market: 'US' | 'HK',
  symbol: string,
  snap: Record<string, unknown> | null,
  opts: {
    profile?: Record<string, unknown> | null
    quote?: Record<string, unknown> | null
    notices?: Array<Record<string, unknown>>
    articles?: Array<Record<string, unknown>>
    financialHistory?: Array<Record<string, unknown>>
    dividends?: Array<Record<string, unknown>>
    shareholders?: Record<string, unknown> | null
    reviewProspect?: { review: string | null; prospect: string | null } | null
    relatedStocks?: Array<Record<string, unknown>>
    seniorTrades?: Array<Record<string, unknown>>
    tradingDistribution?: Record<string, unknown> | null
  },
): Record<string, unknown> {
  const code = str(snap?.code, symbol) || symbol
  const quote = opts.quote ?? ((snap?.quote ?? null) as Record<string, unknown> | null)
  const profile = opts.profile
    ?? (snap?.profile as Record<string, unknown> | null)
    ?? null
  const name = str(
    profile?.name ?? profile?.orgName ?? quote?.name,
    symbol,
  )
  const financialHistory = opts.financialHistory ?? []
  const financial = financialHistory[0] ?? null
  return {
    code,
    name,
    quote,
    profile,
    financial,
    financialHistory,
    notices: opts.notices ?? [],
    articles: opts.articles ?? [],
    dividends: opts.dividends ?? [],
    shareholders: opts.shareholders ?? null,
    recentKlines: snap?.recentKlines ?? [],
    reviewProspect: opts.reviewProspect ?? null,
    relatedStocks: opts.relatedStocks ?? [],
    seniorTrades: opts.seniorTrades ?? [],
    tradingDistribution: opts.tradingDistribution ?? null,
    market,
  }
}
