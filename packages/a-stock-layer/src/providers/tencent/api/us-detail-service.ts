import { safeFloat } from '../../../utils/helpers.js'
import { fetchJson, fetchText } from './http.js'
import { fetchTencentJsonp, parseTencentJsonp } from './jsonp.js'
import { mapTencentKlineRows } from '../normalize/kline.js'
import { mapTencentMinuteKlines } from '../normalize/market.js'
import { crossMarketSessionDate } from '../../../utils/cross-market-intraday.js'
import { parseTencentLine } from '../normalize/quote.js'
import type { StockKline } from '../../../core/schema.js'
import { TENCENT_PROXY_BASE } from './types.js'
import { bareUsTicker } from './us-stock-service.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../common/free-provider-call.js';

const IFZQ_WEB = 'https://web.ifzq.gtimg.cn'
const IFZQ_PROXY = TENCENT_PROXY_BASE
const QT_URL = 'https://qt.gtimg.cn/q='

const US_BRIEF_PATH = '/ifzqgtimg/appstock/us/introduce/brief'
const US_NEWS_PATH = '/ifzqgtimg/appstock/news/info/search'
const US_NOTICE_PATH = '/ifzqgtimg/appstock/news/noticeList/search'
const US_FINANCE_PATH = '/ifzqgtimg/appstock/us/UsCw/cwData'
const US_RELATE_PATH = '/ifzqgtimg/stock/relate/data/usRelateStocks'
const US_SHAREHOLDER_PATH = '/ifzqgtimg/appstock/app/StandardPoorsGudong/holdingOwnerList'
const US_SENIOR_TRADE_PATH = '/ifzqgtimg/appstock/us/Manager/getTrade'
const US_MOBILE_QT_PATH = 'https://web.ifzq.gtimg.cn/portable/mobile/qt/data'

const US_SUFFIX_RE = /\.(OQ|N|AM|A)$/i

export type TencentUsKlinePeriod =
  | 'minute'
  | 'fdays'
  | 'day'
  | 'week'
  | 'month'
  | 'year1'
  | 'year3'
  | 'year5'

const KLINE_PERIOD_LIMIT: Record<string, number> = {
  day: 320,
  week: 320,
  month: 120,
  year1: 260,
  year3: 780,
  year5: 1300,
  fdays: 5,
  m5: 5,
}

const YEAR_PERIODS = new Set(['year1', 'year3', 'year5'])

export type TencentUsNewsItem = {
  id: string
  title: string
  time: string
  url: string
  type: string | number
}

export type TencentUsNoticeItem = {
  id: string
  title: string
  time: string
  url: string
  type: string
}

export type TencentUsProfile = {
  code: string
  symbol: string
  companyName: string
  listingDate: string
  exchange: string
  website: string
  industry: { code: string; name: string } | null
  description: string
  totalShares: string
  revenueBreakdown: Array<{
    date: string
    currency: string
    segments: Array<{ label: string; sales: string; ratio: string }>
  }>
  raw: Record<string, unknown>
}

export type TencentUsShareholderItem = {
  name: string
  shares: string
  shareRatio: string
  sharesChange: string
  ratioChange: string
  period: string
  periodStart: string
  holderType: string
}

export type TencentUsSeniorTradeItem = {
  ric: string
  code: string
  name: string
  date: string
  shares: string
  value: string
  detail: string
}

export type TencentUsFinancialYear = {
  year: string
  income: { revenue: number | null; netIncome: number | null }
  balance: { totalAssets: number | null; totalLiabilities: number | null }
  cash: { netIncome: number | null; netCashChange: number | null }
}

export type TencentUsQuote = {
  code: string
  symbol: string
  qtCode: string
  name: string
  price: number | null
  preClose: number | null
  open: number | null
  high: number | null
  low: number | null
  changeAmt: number | null
  changePct: number | null
  volume: number | null
  amount: number | null
  pe: number | null
  pb: number | null
  turnoverRate: number | null
  marketCap: number | null
  currency: string
  quoteTime: string
  week52High: number | null
  week52Low: number | null
}

export type TencentUsKlineResult = {
  code: string
  symbol: string
  period: TencentUsKlinePeriod
  adjust: 'none' | 'qfq'
  startDate: string | null
  endDate: string | null
  items: StockKline[]
  quote?: Record<string, string[]>
}

/** 腾讯美股 symbol，如 usEQIX.OQ */
export function normalizeUsTencentSymbol(raw: string): string {
  let text = raw.trim()
  if (!text) return ''
  if (/^us[A-Z0-9]+\.[A-Z]{1,3}$/i.test(text)) {
    const m = text.match(/^(us)([A-Za-z0-9]+)(\.[A-Za-z]{1,3})$/i)
    if (m) return `us${m[2]!.toUpperCase()}${m[3]!.toUpperCase()}`
  }
  text = text.toUpperCase().replace(/^(US|NYSE|NASDAQ|AMEX):?/i, '')
  let suffix = '.OQ'
  const suffixMatch = text.match(US_SUFFIX_RE)
  if (suffixMatch) {
    suffix = suffixMatch[0].toUpperCase()
    text = text.replace(US_SUFFIX_RE, '')
  }
  const ticker = text.replace(/^US/i, '').replace(/[^A-Z0-9]/g, '')
  return ticker ? `us${ticker}${suffix}` : ''
}

export function normalizeUsTicker(raw: string): string {
  return bareUsTicker(normalizeUsTencentSymbol(raw))
}

/** qt.gtimg.cn 查询码：usEQIX（无交易所后缀） */
export function normalizeUsQtCode(raw: string): string {
  const ticker = normalizeUsTicker(raw)
  return ticker ? `us${ticker}` : ''
}

export function resolveTencentUsKlinePeriod(period: string): TencentUsKlinePeriod | null {
  const key = period.trim().toLowerCase()
  const alias: Record<string, TencentUsKlinePeriod> = {
    minute: 'minute',
    m1: 'minute',
    '1m': 'minute',
    intraday: 'minute',
    fdays: 'fdays',
    '5day': 'fdays',
    five: 'fdays',
    day: 'day',
    daily: 'day',
    week: 'week',
    weekly: 'week',
    month: 'month',
    monthly: 'month',
    year1: 'year1',
    '1y': 'year1',
    year3: 'year3',
    '3y': 'year3',
    year5: 'year5',
    '5y': 'year5',
  }
  return alias[key] ?? null
}

function usProxyUrl(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params)
  return `${IFZQ_PROXY}${path}?${qs}`
}

async function usProxyGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = usProxyUrl(path, params)
  const body = await fetchJson<{ code: number | string; msg?: string; data?: T }>(url)
  const code = Number(body.code)
  if (code !== 0) {
    throw new Error(body.msg?.trim() || `美股接口失败 (${body.code})`)
  }
  return body.data as T
}

function normalizeYmdDate(raw: string | undefined): string | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const m = text.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function resolveUsKlineDateRange(opts: {
  period: TencentUsKlinePeriod
  startDate?: string
  endDate?: string
}): { startDate: string | null; endDate: string | null } {
  const endDate = normalizeYmdDate(opts.endDate) ?? (
    opts.startDate ? todayYmd() : null
  )
  const startDate = normalizeYmdDate(opts.startDate)
  if (YEAR_PERIODS.has(opts.period) && !startDate && endDate) {
    const years = opts.period === 'year1' ? 1 : opts.period === 'year3' ? 3 : 5
    const cutoff = new Date(endDate)
    cutoff.setFullYear(cutoff.getFullYear() - years)
    return { startDate: cutoff.toISOString().slice(0, 10), endDate }
  }
  return { startDate, endDate }
}

function shouldBatchUsKline(
  klineType: string,
  startDate: string | null,
  endDate: string | null,
  limit: number,
): boolean {
  if (!startDate || !endDate) return false
  if (klineType !== 'day') return false
  const startYear = Number(startDate.slice(0, 4))
  const endYear = Number(endDate.slice(0, 4))
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return false
  return endYear - startYear >= 4 || limit >= 2000
}

function mapUsNewsRows(rows: Array<Record<string, unknown>>): TencentUsNewsItem[] {
  return rows.map(row => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    time: String(row.time ?? ''),
    url: String(row.url ?? ''),
    type: row.type as string | number,
  })).filter(row => row.id || row.title)
}

function buildTencentUsNoticeDetailUrl(id: string): string {
  return `https://gu.qq.com/resources/shy/news/detail-v2/index.html#/index?id=${encodeURIComponent(id)}&s=b`
}

function mapUsNoticeRows(rows: Array<Record<string, unknown>>): TencentUsNoticeItem[] {
  return rows.map(row => {
    const id = String(row.id ?? '').trim()
    const external = String(row.url ?? '').trim()
    return {
      id,
      title: String(row.title ?? ''),
      time: String(row.time ?? ''),
      url: external || (id ? buildTencentUsNoticeDetailUrl(id) : ''),
      type: String(row.type ?? ''),
    }
  }).filter(row => row.id || row.title)
}

function mapUsFinancialRows(rows: Array<Record<string, unknown>>): TencentUsFinancialYear[] {
  return rows.map(row => {
    const income = (row.income ?? {}) as Record<string, unknown>
    const balance = (row.balence ?? row.balance ?? {}) as Record<string, unknown>
    const cash = (row.cash ?? {}) as Record<string, unknown>
    return {
      year: String(row.year ?? ''),
      income: {
        revenue: safeFloat(income.zsr),
        netIncome: safeFloat(income.jlr),
      },
      balance: {
        totalAssets: safeFloat(balance.zcze),
        totalLiabilities: safeFloat(balance.fzze),
      },
      cash: {
        netIncome: safeFloat(cash.jlr),
        netCashChange: safeFloat(cash.xjjzje),
      },
    }
  }).filter(row => row.year)
}

function mapUsShareholderRows(rows: Array<Record<string, unknown>>): TencentUsShareholderItem[] {
  return rows.map(row => ({
    name: String(row.name ?? ''),
    shares: String(row.cgs ?? ''),
    shareRatio: String(row.cgbl ?? ''),
    sharesChange: String(row.cgsChange ?? ''),
    ratioChange: String(row.cgblChange ?? ''),
    period: String(row.period ?? ''),
    periodStart: String(row.periodStart ?? ''),
    holderType: String(row.type ?? ''),
  })).filter(row => row.name)
}

function mapUsSeniorTradeRows(rows: Array<Record<string, unknown>>): TencentUsSeniorTradeItem[] {
  return rows.map(row => ({
    ric: String(row.ric ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    date: String(row.date ?? ''),
    shares: String(row.share ?? ''),
    value: String(row.value ?? ''),
    detail: String(row.detail ?? ''),
  })).filter(row => row.name || row.date)
}

function mapUsProfile(symbol: string, data: Record<string, unknown>): TencentUsProfile {
  const jbxx = (data.jbxx ?? {}) as Record<string, unknown>
  const industry = jbxx.industry as { code?: string; name?: string } | undefined
  const srgc = Array.isArray(data.srgc) ? data.srgc as Array<Record<string, unknown>> : []
  return {
    code: normalizeUsTicker(symbol),
    symbol,
    companyName: String(jbxx.gsmc ?? ''),
    listingDate: String(jbxx.ssrq ?? ''),
    exchange: String(jbxx.jys ?? ''),
    website: String(jbxx.website ?? ''),
    industry: industry?.name
      ? { code: String(industry.code ?? ''), name: String(industry.name ?? '') }
      : null,
    description: String(jbxx.jianjie ?? '').trim(),
    totalShares: String(jbxx.zgb ?? ''),
    revenueBreakdown: srgc.map(block => ({
      date: String(block.date ?? ''),
      currency: String(block.currency ?? ''),
      segments: Array.isArray(block.detail)
        ? (block.detail as Array<Record<string, unknown>>).map(seg => ({
          label: String(seg.label ?? ''),
          sales: String(seg.sales ?? ''),
          ratio: String(seg.zb ?? ''),
        }))
        : [],
    })),
    raw: data,
  }
}

function mapUsKlineRows(code: string, rows: string[][]): StockKline[] {
  const ticker = normalizeUsTicker(code)
  return (mapTencentKlineRows(ticker, rows) ?? []).map(row => ({ ...row, code: ticker }))
}

function mapUsMinuteKlines(code: string, rows: string[]): StockKline[] {
  const ticker = normalizeUsTicker(code)
  const date = crossMarketSessionDate('US')
  return mapTencentMinuteKlines(ticker, rows, date).map(row => ({ ...row, code: ticker }))
}

function mapQtUsQuote(qtCode: string, symbol: string, parts: string[]): TencentUsQuote | null {
  const price = safeFloat(parts[3])
  if (price == null) return null
  const ticker = normalizeUsTicker(symbol)
  return {
    code: ticker,
    symbol,
    qtCode,
    name: String(parts[1] ?? ticker).trim(),
    price,
    preClose: safeFloat(parts[4]),
    open: safeFloat(parts[5]),
    high: safeFloat(parts[33]),
    low: safeFloat(parts[34]),
    changeAmt: safeFloat(parts[31]),
    changePct: safeFloat(parts[32]),
    volume: safeFloat(parts[36]),
    amount: safeFloat(parts[37]),
    pe: safeFloat(parts[39]),
    pb: safeFloat(parts[46]),
    turnoverRate: safeFloat(parts[38]),
    marketCap: safeFloat(parts[44]),
    currency: String(parts[35] ?? 'USD').trim() || 'USD',
    quoteTime: String(parts[30] ?? '').trim(),
    week52High: null,
    week52Low: null,
  }
}

function enrichUsQuoteFromMobile(quote: TencentUsQuote, mobile: Record<string, unknown>): TencentUsQuote {
  return {
    ...quote,
    price: safeFloat(mobile.newpri) ?? quote.price,
    preClose: safeFloat(mobile.yespri) ?? quote.preClose,
    open: quote.open,
    high: safeFloat(mobile.higpri) ?? quote.high,
    low: safeFloat(mobile.lowpri) ?? quote.low,
    changeAmt: safeFloat(mobile.zd) ?? quote.changeAmt,
    changePct: safeFloat(mobile.zdf) ?? quote.changePct,
    volume: safeFloat(mobile.volume) ?? quote.volume,
    marketCap: safeFloat(mobile.sz) ?? quote.marketCap,
    pe: safeFloat(mobile.pe) ?? quote.pe,
    pb: safeFloat(mobile.sjl) ?? quote.pb,
    quoteTime: String(mobile.dt ?? quote.quoteTime),
    week52High: safeFloat(mobile['52wh']),
    week52Low: safeFloat(mobile['52wl']),
  }
}

/**
 * 美股基本资料 — `us/introduce/brief`。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/us/introduce/brief?symbol=usEQIX.OQ
 * @pageUrl https://gu.qq.com/usEQIX.OQ/gg/jbzl
 */
export async function fetchTencentUsStockProfile(code: string): Promise<TencentUsProfile> {
  const symbol = normalizeUsTencentSymbol(code)
  const data = await usProxyGet<Record<string, unknown>>(US_BRIEF_PATH, {
    symbol,
    app: 'official_website',
  })
  return mapUsProfile(symbol, data)
}

/**
 * 美股个股新闻 — `news/info/search`（type=2，支持分页）。
 */
export async function fetchTencentUsStockNews(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<{ total: number; totalPages: number; page: number; pageSize: number; items: TencentUsNewsItem[] }> {
  const symbol = normalizeUsTencentSymbol(opts.code)
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 51))
  const data = await usProxyGet<{
    total_num?: number
    total_page?: number
    data?: Array<Record<string, unknown>>
  }>(US_NEWS_PATH, {
    symbol,
    type: '2',
    page: String(page),
    n: String(pageSize),
  })
  const items = mapUsNewsRows(data.data ?? [])
  return {
    total: data.total_num ?? items.length,
    totalPages: data.total_page ?? 1,
    page,
    pageSize,
    items,
  }
}

/**
 * 美股公司公告 — `noticeList/search`（部分标的无数据）。
 */
export async function fetchTencentUsStockNotices(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<{ total: number; page: number; pageSize: number; items: TencentUsNoticeItem[] }> {
  const symbol = normalizeUsTencentSymbol(opts.code)
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 50))
  const data = await usProxyGet<{
    total_num?: number
    data?: Array<Record<string, unknown>>
  }>(US_NOTICE_PATH, {
    symbol,
    page: String(page),
    n: String(pageSize),
  })
  const items = mapUsNoticeRows(data.data ?? [])
  return {
    total: data.total_num ?? items.length,
    page,
    pageSize,
    items,
  }
}

/**
 * 美股财务摘要 — `UsCw/cwData`（损益/资产负债/现金流按年，支持分页）。
 */
export async function fetchTencentUsFinancialSummary(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<{ page: number; pageSize: number; items: TencentUsFinancialYear[] }> {
  const symbol = normalizeUsTencentSymbol(opts.code)
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 10, 20))
  const data = await usProxyGet<{
    data?: Array<Record<string, unknown>>
  }>(US_FINANCE_PATH, {
    symbol,
    page: String(page),
    num: String(pageSize),
  })
  const items = mapUsFinancialRows(data.data ?? [])
  return { page, pageSize, items }
}

/**
 * 美股股东统计 — `StandardPoorsGudong/holdingOwnerList`。
 *
 * 上游单次返回约 50 条，page 参数目前不翻页。
 */
export async function fetchTencentUsShareholderStats(opts: {
  code: string
  page?: number
}): Promise<{ asOfDate: string; page: number; items: TencentUsShareholderItem[] }> {
  const symbol = normalizeUsTencentSymbol(opts.code)
  const page = Math.max(1, opts.page ?? 1)
  const data = await usProxyGet<{
    date?: string
    list?: Array<Record<string, unknown>>
  }>(US_SHAREHOLDER_PATH, {
    code: symbol,
    page: String(page),
  })
  return {
    asOfDate: String(data.date ?? ''),
    page,
    items: mapUsShareholderRows(data.list ?? []),
  }
}

/**
 * 美股高管交易 — `Manager/getTrade`（支持分页）。
 */
export async function fetchTencentUsSeniorTrades(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<{ page: number; pageSize: number; items: TencentUsSeniorTradeItem[] }> {
  const symbol = normalizeUsTencentSymbol(opts.code)
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 10, 50))
  const data = await usProxyGet<{
    trade?: Array<Record<string, unknown>>
  }>(US_SENIOR_TRADE_PATH, {
    symbol,
    page: String(page),
    num: String(pageSize),
  })
  return {
    page,
    pageSize,
    items: mapUsSeniorTradeRows(data.trade ?? []),
  }
}

/**
 * 美股关联股票 — `usRelateStocks`（参数 code）。
 */
export async function fetchTencentUsRelatedStocks(code: string): Promise<Array<{
  code: string
  symbol: string
  name: string
  price: number | null
  changePct: number | null
}>> {
  const symbol = normalizeUsTencentSymbol(code)
  const rows = await usProxyGet<string[]>(US_RELATE_PATH, { code: symbol })
  const peers = (rows ?? []).map(s => normalizeUsTencentSymbol(s)).filter(Boolean)
  if (!peers.length) return []

  const qtCodes = peers.map(s => normalizeUsQtCode(s))
  const text = await fetchText(`${QT_URL}${qtCodes.join(',')}`, 'gbk')
  const lines = text.trim().split('\n').filter(Boolean)
  const quoteByTicker = new Map<string, TencentUsQuote>()

  for (let i = 0; i < lines.length; i += 1) {
    const parts = parseTencentLine(lines[i]!)
    if (!parts) continue
    const qtCode = qtCodes[i] ?? ''
    const peerSymbol = peers[i] ?? normalizeUsTencentSymbol(parts[2] ?? '')
    const quote = mapQtUsQuote(qtCode, peerSymbol, parts)
    if (quote) quoteByTicker.set(quote.code, quote)
  }

  return peers.map(peerSymbol => {
    const ticker = normalizeUsTicker(peerSymbol)
    const quote = quoteByTicker.get(ticker)
    return {
      code: ticker,
      symbol: peerSymbol,
      name: quote?.name ?? ticker,
      price: quote?.price ?? null,
      changePct: quote?.changePct ?? null,
    }
  })
}

/**
 * 美股实时行情 — `qt.gtimg.cn`（代码为 us{TICKER}，无 .OQ 后缀）。
 */
export async function fetchTencentUsStockQuote(code: string): Promise<TencentUsQuote> {
  const symbol = normalizeUsTencentSymbol(code)
  const qtCode = normalizeUsQtCode(code)
  const text = await fetchText(`${QT_URL}${qtCode}`, 'gbk')
  const parts = parseTencentLine(text.trim())
  if (!parts) {
    throw new Error(`未找到美股行情：${symbol}`)
  }
  let quote = mapQtUsQuote(qtCode, symbol, parts)
  if (!quote) {
    throw new Error(`美股行情解析失败：${symbol}`)
  }

  try {
    const mobile = await fetchJson<{ code: number; data?: Record<string, unknown> }>(
      `${US_MOBILE_QT_PATH}?code=${symbol}`,
    )
    if (mobile.code === 0 && mobile.data) {
      quote = enrichUsQuoteFromMobile(quote, mobile.data)
    }
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    // mobile qt 为可选增强
  }

  return quote
}

type UsKlinePayload = {
  code: number
  data?: Record<string, Record<string, string[][] | string[]>>
}

async function fetchUsMinute(symbol: string): Promise<string[]> {
  const minuteCode = normalizeUsQtCode(symbol) || symbol.replace(/\.(OQ|N|AM|A)$/i, '')
  const varName = `minute_data_${minuteCode.replace(/\./g, '_')}`
  const url = `${IFZQ_WEB}/appstock/app/minute/query?_var=${varName}&code=${minuteCode}`
  const body = await fetchTencentJsonp<{
    code: number
    data?: Record<string, { data?: { data?: string[] } }>
  }>(url, varName)
  if (body.code !== 0) {
    throw new Error(`minute/query 失败 (${body.code})`)
  }
  return body.data?.[minuteCode]?.data?.data ?? []
}

async function fetchUsFdays(symbol: string): Promise<StockKline[]> {
  const varName = `fdays_data_${symbol}`
  const param = [symbol, 'm5', '', '', '5', ''].join(',')
  const url = `${IFZQ_WEB}/appstock/app/kline/kline?_var=${varName}&param=${param}`
  const body = await fetchTencentJsonp<UsKlinePayload>(url, varName)
  if (body.code !== 0) {
    throw new Error(`五日 K 线失败 (${body.code})`)
  }
  const rows = body.data?.[symbol]?.m5 ?? []
  return mapUsKlineRows(symbol, Array.isArray(rows) ? rows as string[][] : [])
}

async function fetchUsKlineRaw(
  symbol: string,
  klineType: string,
  limit: number,
  adjust: 'none' | 'qfq',
  startDate = '',
  endDate = '',
): Promise<UsKlinePayload> {
  const varName = `kline_${klineType}${adjust === 'qfq' ? 'qfq' : ''}`
  const param = [symbol, klineType, startDate, endDate, String(limit), adjust === 'qfq' ? 'qfq' : ''].join(',')
  const base = adjust === 'qfq'
    ? `${IFZQ_WEB}/appstock/app/usfqkline/get`
    : `${IFZQ_WEB}/appstock/app/kline/kline`
  const url = `${base}?_var=${varName}&param=${param}`
  return fetchTencentJsonp<UsKlinePayload>(url, varName)
}

function extractUsKlineRows(
  payload: UsKlinePayload,
  symbol: string,
  klineType: string,
  adjust: 'none' | 'qfq',
): string[][] {
  const bucket = payload.data?.[symbol]
  if (!bucket) return []
  const key = adjust === 'qfq' ? `qfq${klineType}` : klineType
  const rows = bucket[key] ?? bucket[klineType] ?? bucket.day ?? []
  return Array.isArray(rows) ? rows as string[][] : []
}

function dedupeKlineRows(rows: string[][]): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const row of rows) {
    const key = String(row[0] ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

async function fetchUsKlineBatched(
  symbol: string,
  klineType: string,
  startDate: string,
  endDate: string,
  adjust: 'none' | 'qfq',
): Promise<string[][]> {
  const startYear = Number(startDate.slice(0, 4))
  const endYear = Number(endDate.slice(0, 4))
  const merged: string[][] = []
  for (let year = startYear; year <= endYear; year += 1) {
    const chunkStart = year === startYear ? startDate : `${year}-01-01`
    const chunkEnd = year === endYear ? endDate : `${year}-12-31`
    const payload = await fetchUsKlineRaw(symbol, klineType, 2000, adjust, chunkStart, chunkEnd)
    merged.push(...extractUsKlineRows(payload, symbol, klineType, adjust))
  }
  return dedupeKlineRows(merged)
}

/**
 * 美股 K 线（分时 / 五日 / 日周月 / 1-3-5 年）。
 *
 * - minute → minute/query
 * - fdays → kline/kline type=m5（近 5 个交易日日 K 摘要；与港股分时五日不同）
 * - day/week/month → kline/kline 或 usfqkline/get（qfq）
 */
export async function fetchTencentUsStockKline(opts: {
  code: string
  period?: TencentUsKlinePeriod | string
  limit?: number
  adjust?: 'none' | 'qfq'
  startDate?: string
  endDate?: string
}): Promise<TencentUsKlineResult> {
  const symbol = normalizeUsTencentSymbol(opts.code)
  const ticker = normalizeUsTicker(opts.code)
  const period = resolveTencentUsKlinePeriod(String(opts.period ?? 'day')) ?? 'day'
  const adjust = opts.adjust === 'qfq' ? 'qfq' : 'none'
  const { startDate, endDate } = resolveUsKlineDateRange({
    period,
    startDate: opts.startDate,
    endDate: opts.endDate,
  })

  if (period === 'minute') {
    const rows = await fetchUsMinute(symbol)
    return {
      code: ticker,
      symbol,
      period,
      adjust,
      startDate: null,
      endDate: null,
      items: mapUsMinuteKlines(ticker, rows),
    }
  }

  if (period === 'fdays') {
    const items = await fetchUsFdays(symbol)
    return {
      code: ticker,
      symbol,
      period,
      adjust,
      startDate: items[0]?.date ?? null,
      endDate: items[items.length - 1]?.date ?? null,
      items,
    }
  }

  const klineType = YEAR_PERIODS.has(period) ? 'day' : period
  const defaultLimit = KLINE_PERIOD_LIMIT[period] ?? KLINE_PERIOD_LIMIT.day ?? 320
  const rangedLimit = startDate && endDate ? 2000 : (opts.limit ?? defaultLimit)
  const limit = Math.max(1, Math.min(rangedLimit, 2000))

  let rows: string[][] = []
  let quote: Record<string, string[]> | undefined

  if (shouldBatchUsKline(klineType, startDate, endDate, limit)) {
    rows = await fetchUsKlineBatched(symbol, klineType, startDate!, endDate!, adjust)
  } else {
    const payload = await fetchUsKlineRaw(
      symbol,
      klineType,
      limit,
      adjust,
      startDate ?? '',
      endDate ?? '',
    )
    rows = extractUsKlineRows(payload, symbol, klineType, adjust)
    quote = payload.data?.[symbol]?.qt as Record<string, string[]> | undefined
  }

  let mapped = mapUsKlineRows(ticker, rows)
  if (YEAR_PERIODS.has(period) && startDate && endDate) {
    const startKey = startDate.replace(/-/g, '')
    const endKey = endDate.replace(/-/g, '')
    mapped = mapped.filter(row => {
      const key = row.date.replace(/-/g, '')
      return key >= startKey && key <= endKey
    })
  }

  return {
    code: ticker,
    symbol,
    period,
    adjust,
    startDate,
    endDate,
    items: mapped,
    quote,
  }
}
