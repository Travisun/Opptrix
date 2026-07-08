import { safeFloat } from '../../../utils/helpers.js'
import { parseTencentLine } from '../normalize/quote.js'
import { fetchJson, fetchText } from './http.js'
import { fetchTencentJsonp, parseTencentJsonp } from './jsonp.js'
import { mapTencentKlineRows } from '../normalize/kline.js'
import { mapTencentMinuteKlines, mapTencentMinuteTicks } from '../normalize/market.js'
import type { StockKline } from '../../../core/schema.js'
import { TENCENT_PROXY_BASE } from './types.js'

const IFZQ_WEB = 'https://web.ifzq.gtimg.cn'
const IFZQ_PROXY = TENCENT_PROXY_BASE
const QT_URL = 'https://qt.gtimg.cn/q='

const HK_JIANKUANG_PATH = '/ifzqgtimg/appstock/app/hkStockinfo/jiankuang'
const HK_NEWS_PATH = '/ifzqgtimg/appstock/news/info/search'
const HK_NOTICE_PATH = '/ifzqgtimg/appstock/news/noticeList/search'
const HK_FINANCE_PATH = '/ifzqgtimg/stock/corp/hkcwbb/detail'
const HK_RELATE_PATH = '/ifzqgtimg/hk/aastocks/relate/relate'
const HK_REVIEW_PATH = '/ifzqgtimg/appstock/hk/HkInfo/getReview'
const HK_PROSPECT_PATH = '/ifzqgtimg/appstock/hk/HkInfo/getProspect'
const HK_INVEST_RATING_PATH = '/ifzqgtimg/appstock/hk/HkInfo/getInvestBankRating'
const HK_DIVIDENDS_PATH = '/ifzqgtimg/appstock/hk/HkInfo/getDividends'
const HK_TRADING_VOL_PATH = '/message/hk/hk_trading_vol_analyse.php'
const HK_AVG_VOL_PATH = '/ifzqgtimg/appstock/hk/Hkinchot/averageVolatility'

export type TencentHkKlinePeriod =
  | 'minute'
  | 'fdays'
  | 'day'
  | 'week'
  | 'month'
  | 'year1'
  | 'year3'
  | 'year5'

export type TencentHkFinancialType = 'income' | 'cashflow' | 'balance'

export type TencentHkFinancialPeriod = 'all' | 'annual' | 'interim'

const FINANCIAL_TYPE_MAP: Record<TencentHkFinancialType, string> = {
  income: 'zhsy',
  cashflow: 'xjll',
  balance: 'zcfz',
}

const KLINE_PERIOD_LIMIT: Record<string, number> = {
  day: 320,
  week: 320,
  month: 120,
  year1: 260,
  year3: 780,
  year5: 1300,
}

const YEAR_PERIODS = new Set(['year1', 'year3', 'year5'])

export type TencentHkDividendItem = {
  code: string
  name: string
  announceDate: string | null
  fiscalYear: string
  eventType: string
  method: string
  exDate: string | null
  recordStartDate: string | null
  recordEndDate: string | null
  payDate: string | null
  content: string
}

/** 详情页底部「分红派息」摘要（jiankuang.fhpx，比 getDividends 更新） */
export type TencentHkDividendRecentItem = {
  content: string
  exDate: string | null
  payDate: string | null
  recordDate: string | null
}

export type TencentHkNewsItem = {
  id: string
  title: string
  time: string
  url: string
  type: string | number
}

export type TencentHkNoticeItem = {
  id: string
  title: string
  time: string
  url: string
  type: string
}

export type TencentHkProfile = {
  code: string
  symbol: string
  chiName: string
  website: string
  business: string
  raw: Record<string, unknown>
}

export type TencentHkTradingPriceLevel = {
  price: number
  volume: number
  volumeRatio: number | null
}

export type TencentHkTechnicalAnalysis = {
  code: string
  symbol: string
  trading: {
    priceLevels: TencentHkTradingPriceLevel[]
    largeOrderPct: number | null
  }
  average: {
    ma10: string | null
    ma30: string | null
    ma50: string | null
    ma100: string | null
    ma250: string | null
    volatility: Record<string, string | null>
  }
}

export type TencentHkFdaysDay = {
  date: string
  preClose: number | null
  points: ReturnType<typeof mapTencentMinuteTicks>
}

export type TencentHkKlineResult = {
  code: string
  symbol: string
  period: TencentHkKlinePeriod
  adjust: 'none' | 'qfq'
  startDate: string | null
  endDate: string | null
  items: StockKline[] | TencentHkFdaysDay[]
  quote?: Record<string, string[]>
}

/** 5 位港股代码，如 00700 */
export function normalizeHkNumericCode(raw: string): string {
  const text = raw.trim()
  const lower = text.toLowerCase()
  if (lower.startsWith('hk')) return text.slice(2).padStart(5, '0')
  return text.padStart(5, '0')
}

/** 腾讯 symbol，如 hk00700 */
export function normalizeHkSymbol(raw: string): string {
  return `hk${normalizeHkNumericCode(raw)}`
}

export function resolveTencentHkKlinePeriod(period: string): TencentHkKlinePeriod | null {
  const key = period.trim().toLowerCase()
  const alias: Record<string, TencentHkKlinePeriod> = {
    minute: 'minute',
    m1: 'minute',
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

export function resolveTencentHkFinancialType(type: string): TencentHkFinancialType {
  const key = type.trim().toLowerCase()
  if (key === 'cashflow' || key === 'xjll' || key === '现金流' || key === '现金流量表') return 'cashflow'
  if (key === 'balance' || key === 'zcfz' || key === '负债' || key === '资产负债表') return 'balance'
  return 'income'
}

function hkProxyUrl(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params)
  return `${IFZQ_PROXY}${path}?${qs}`
}

async function hkProxyGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = hkProxyUrl(path, params)
  const body = await fetchJson<{ code: number | string; msg?: string; data?: T }>(url)
  const code = Number(body.code)
  if (code !== 0) {
    throw new Error(body.msg?.trim() || `港股接口失败 (${body.code})`)
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

function resolveHkKlineDateRange(opts: {
  period: TencentHkKlinePeriod
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

function shouldBatchHkKline(
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

function formatYmdFromCompact(compact: string): string {
  const text = compact.trim()
  if (text.length !== 8) return text
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
}

function formatHkCompactDate(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  if (/^\d{8}$/.test(text)) return formatYmdFromCompact(text)
  return text
}

function mapHkDividendRows(code: string, rows: Array<Record<string, unknown>>): TencentHkDividendItem[] {
  const numeric = normalizeHkNumericCode(code)
  return rows.map(row => ({
    code: numeric,
    name: String(row.SEC_ABNAME ?? '').trim(),
    announceDate: formatHkCompactDate(row.AFFICHE_DATE),
    fiscalYear: String(row.REPORT_ANNUAL ?? '').trim(),
    eventType: String(row.DIVIDENDS_TYPE_N ?? '').trim(),
    method: String(row.DIVIDEND_METHOD_N ?? '').trim(),
    exDate: formatHkCompactDate(row.DIVIDENDS_DATE),
    recordStartDate: formatHkCompactDate(row.DEADLINE_BEGIN_DATE),
    recordEndDate: formatHkCompactDate(row.DEADLINE_END_DATE),
    payDate: formatHkCompactDate(row.PAY_DATE),
    content: String(row.CONTENT ?? '').trim(),
  })).filter(row => row.content || row.fiscalYear)
}

function mapHkDividendRecentRows(rows: Array<Record<string, unknown>>): TencentHkDividendRecentItem[] {
  return rows.map(row => ({
    content: String(row.CONTENT ?? '').trim(),
    exDate: formatHkCompactDate(row.cqr ?? row.DIVIDENDS_DATE),
    payDate: formatHkCompactDate(row.real_pay_date ?? row.PAY_DATE),
    recordDate: formatHkCompactDate(row.cqr),
  })).filter(row => row.content)
}

function mapHkNewsRows(rows: Array<Record<string, unknown>>): TencentHkNewsItem[] {
  return rows.map(row => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    time: String(row.time ?? ''),
    url: String(row.url ?? ''),
    type: row.type as string | number,
  })).filter(row => row.id || row.title)
}

function mapHkNoticeRows(rows: Array<Record<string, unknown>>): TencentHkNoticeItem[] {
  return rows.map(row => ({
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    time: String(row.time ?? ''),
    url: String(row.url ?? ''),
    type: String(row.type ?? ''),
  })).filter(row => row.id || row.title)
}

function mapHkMinuteKlines(code: string, rows: string[]): StockKline[] {
  const numeric = normalizeHkNumericCode(code)
  const date = new Date().toISOString().slice(0, 10)
  return mapTencentMinuteKlines(numeric, rows, date).map(row => ({ ...row, code: numeric }))
}

function mapHkMinuteTicks(code: string, rows: string[], tradeDate: string) {
  return mapTencentMinuteTicks(code, rows, tradeDate).map(row => ({
    ...row,
    code: normalizeHkNumericCode(code),
  }))
}

function mapHkKlineRows(code: string, rows: string[][]): StockKline[] {
  const numeric = normalizeHkNumericCode(code)
  return (mapTencentKlineRows(numeric, rows) ?? []).map(row => ({ ...row, code: numeric }))
}

function mapTradingLevels(
  stockInfo: Array<[number, number]> | undefined,
  percent: number | undefined,
): TencentHkTechnicalAnalysis['trading'] {
  const levels = stockInfo ?? []
  const maxVol = levels.length ? Math.max(...levels.map(([, v]) => v)) : 0
  return {
    priceLevels: levels.map(([price, volume]) => ({
      price,
      volume,
      volumeRatio: maxVol > 0 ? Math.round((volume / maxVol) * 10000) / 10000 : null,
    })),
    largeOrderPct: safeFloat(percent),
  }
}

/**
 * 港股实时行情 — `qt.gtimg.cn`（代码为 hk{5位}，如 hk00700）。
 */
export async function fetchTencentHkStockQuote(code: string): Promise<{
  code: string
  symbol: string
  parts: string[]
}> {
  const symbol = normalizeHkSymbol(code)
  const text = await fetchText(`${QT_URL}${symbol}`, 'gbk')
  const parts = parseTencentLine(text.trim())
  if (!parts) {
    throw new Error(`未找到港股行情：${symbol}`)
  }
  return {
    code: normalizeHkNumericCode(code),
    symbol,
    parts,
  }
}

/**
 * 港股基本资料 — `hkStockinfo/jiankuang`。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/hkStockinfo/jiankuang?code=hk00700
 * @pageUrl https://gu.qq.com/hk00700/gp
 */
export async function fetchTencentHkStockProfile(code: string): Promise<TencentHkProfile> {
  const symbol = normalizeHkSymbol(code)
  const data = await hkProxyGet<{
    basic?: Record<string, unknown>
  }>(HK_JIANKUANG_PATH, { code: symbol })
  const basic = data.basic ?? {}
  return {
    code: normalizeHkNumericCode(code),
    symbol,
    chiName: String(basic.ChiName ?? ''),
    website: String(basic.Website ?? ''),
    business: String(basic.Business ?? '').trim(),
    raw: basic,
  }
}

/**
 * 港股个股新闻 — `news/info/search`（type=2）。
 */
export async function fetchTencentHkStockNews(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<{ total: number; items: TencentHkNewsItem[] }> {
  const symbol = normalizeHkSymbol(opts.code)
  const data = await hkProxyGet<{
    total_num?: number
    data?: Array<Record<string, unknown>>
  }>(HK_NEWS_PATH, {
    symbol,
    type: '2',
    page: String(Math.max(1, opts.page ?? 1)),
    n: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
  const items = mapHkNewsRows(data.data ?? [])
  return {
    total: data.total_num ?? items.length,
    items,
  }
}

/**
 * 港股个股公告 — `noticeList/search`。
 */
export async function fetchTencentHkStockNotices(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<{ total: number; items: TencentHkNoticeItem[] }> {
  const symbol = normalizeHkSymbol(opts.code)
  const data = await hkProxyGet<{
    total_num?: number
    data?: Array<Record<string, unknown>>
  }>(HK_NOTICE_PATH, {
    symbol,
    page: String(Math.max(1, opts.page ?? 1)),
    n: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
  const items = mapHkNoticeRows(data.data ?? [])
  return {
    total: data.total_num ?? items.length,
    items,
  }
}

/**
 * 港股财务三表 — `hkcwbb/detail`。
 *
 * type: zhsy 损益 / xjll 现金流 / zcfz 负债
 */
export async function fetchTencentHkFinancialReport(opts: {
  code: string
  reportType?: TencentHkFinancialType | string
  reportPeriod?: TencentHkFinancialPeriod
  periods?: number
}): Promise<{ reportType: TencentHkFinancialType; reportPeriod: string; tables: unknown }> {
  const symbol = normalizeHkSymbol(opts.code)
  const reportType = resolveTencentHkFinancialType(String(opts.reportType ?? 'income'))
  const rttype = opts.reportPeriod === 'annual'
    ? 'annual'
    : opts.reportPeriod === 'interim'
      ? 'interim'
      : 'all'
  const data = await hkProxyGet<{ data?: unknown }>(HK_FINANCE_PATH, {
    num: String(Math.max(1, Math.min(opts.periods ?? 4, 12))),
    _appName: 'android',
    type: FINANCIAL_TYPE_MAP[reportType],
    rttype,
    symbol,
  })
  return {
    reportType,
    reportPeriod: rttype,
    tables: data.data ?? data,
  }
}

/**
 * 港股关联股票 — `hk/aastocks/relate/relate`。
 */
export async function fetchTencentHkRelatedStocks(code: string): Promise<Array<{ code: string; name: string }>> {
  const symbol = normalizeHkSymbol(code)
  const rows = await hkProxyGet<Array<{ code?: string; name?: string }>>(HK_RELATE_PATH, { code: symbol })
  return (rows ?? []).map(row => ({
    code: normalizeHkNumericCode(String(row.code ?? '')),
    name: String(row.name ?? '').trim(),
  })).filter(row => row.code)
}

/**
 * 港股业绩回顾与展望 — `HkInfo/getReview` + `getProspect`（参数 c=5位代码）。
 */
export async function fetchTencentHkReviewProspect(code: string): Promise<{ review: string | null; prospect: string | null }> {
  const numeric = normalizeHkNumericCode(code)
  const [reviewBody, prospectBody] = await Promise.all([
    fetchJson<{ code: number; data?: string | null }>(hkProxyUrl(HK_REVIEW_PATH, { c: numeric })),
    fetchJson<{ code: number; data?: string | null }>(hkProxyUrl(HK_PROSPECT_PATH, { c: numeric })),
  ])
  return {
    review: reviewBody.code === 0 ? (reviewBody.data ?? null) : null,
    prospect: prospectBody.code === 0 ? (prospectBody.data ?? null) : null,
  }
}

/**
 * 港股投行评级 — `HkInfo/getInvestBankRating`。
 */
export async function fetchTencentHkInvestRating(code: string): Promise<Record<string, unknown>[]> {
  const numeric = normalizeHkNumericCode(code)
  const body = await fetchJson<{ code: number; data?: { data?: Record<string, unknown>[] } }>(
    hkProxyUrl(HK_INVEST_RATING_PATH, { c: numeric }),
  )
  if (body.code !== 0) return []
  return body.data?.data ?? []
}

/**
 * 港股分红派息。
 *
 * - `recent`：详情页底部摘要，来自 `hkStockinfo/jiankuang.fhpx`（含近年派息，更新更及时）
 * - `items`：完整列表页数据，来自 `HkInfo/getDividends`（历史档案，支持分页）
 */
export async function fetchTencentHkDividends(opts: {
  code: string
  page?: number
  pageSize?: number
  includeRecent?: boolean
}): Promise<{
  code: string
  symbol: string
  page: number
  pageSize: number
  hasMore: boolean
  recent: TencentHkDividendRecentItem[]
  items: TencentHkDividendItem[]
}> {
  const numeric = normalizeHkNumericCode(opts.code)
  const symbol = normalizeHkSymbol(opts.code)
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 10, 50))
  const includeRecent = opts.includeRecent ?? page === 1

  const [dividendBody, jiankuangData] = await Promise.all([
    fetchJson<{
      code: number
      msg?: string
      data?: { data?: Array<Record<string, unknown>>; hasMore?: boolean | string | number }
    }>(hkProxyUrl(HK_DIVIDENDS_PATH, {
      c: numeric,
      p: String(page),
      max: String(pageSize),
    })),
    includeRecent
      ? hkProxyGet<{ fhpx?: Array<Record<string, unknown>> }>(HK_JIANKUANG_PATH, { code: symbol })
      : Promise.resolve(null),
  ])

  if (dividendBody.code !== 0) {
    throw new Error(dividendBody.msg?.trim() || `getDividends 失败 (${dividendBody.code})`)
  }

  const rawItems = dividendBody.data?.data ?? []
  const hasMore = dividendBody.data?.hasMore === true
    || dividendBody.data?.hasMore === 1
    || dividendBody.data?.hasMore === '1'

  return {
    code: numeric,
    symbol,
    page,
    pageSize,
    hasMore,
    recent: jiankuangData?.fhpx ? mapHkDividendRecentRows(jiankuangData.fhpx) : [],
    items: mapHkDividendRows(numeric, rawItems),
  }
}

async function fetchHkTradingVol(numeric: string): Promise<TencentHkTechnicalAnalysis['trading']> {
  const url = `${IFZQ_PROXY}${HK_TRADING_VOL_PATH}?code=${numeric}`
  try {
    const text = await fetchText(url)
    const parsed = parseTencentJsonp<{
      code?: number
      data?: { stockInfo?: Array<[number, number]>; percent?: number }
    }>(text, 'v_list')
    return mapTradingLevels(parsed.data?.stockInfo, parsed.data?.percent)
  } catch {
    return { priceLevels: [], largeOrderPct: null }
  }
}

/**
 * 港股技术面：成交分布 + 均价波幅。
 */
export async function fetchTencentHkTechnicalAnalysis(code: string): Promise<TencentHkTechnicalAnalysis> {
  const symbol = normalizeHkSymbol(code)
  const numeric = normalizeHkNumericCode(code)
  const [trading, avgBody] = await Promise.all([
    fetchHkTradingVol(numeric),
    hkProxyGet<Record<string, string>>(HK_AVG_VOL_PATH, { code: symbol }).catch(
      () => ({} as Record<string, string>),
    ),
  ])
  return {
    code: numeric,
    symbol,
    trading,
    average: {
      ma10: avgBody.MA10 ?? null,
      ma30: avgBody.MA30 ?? null,
      ma50: avgBody.MA50 ?? null,
      ma100: avgBody.MA100 ?? null,
      ma250: avgBody.MA250 ?? null,
      volatility: {
        bofu1: avgBody.BOFU1 ?? null,
        bofu4: avgBody.BOFU4 ?? null,
        bofu8: avgBody.BOFU8 ?? null,
        bofu10: avgBody.BOFU10 ?? null,
        bofu20: avgBody.BOFU20 ?? null,
        bofu24: avgBody.BOFU24 ?? null,
      },
    },
  }
}

async function fetchHkMinute(symbol: string): Promise<string[]> {
  const varName = `minute_data_${symbol}`
  const url = `${IFZQ_WEB}/appstock/app/minute/query?_var=${varName}&code=${symbol}`
  const body = await fetchTencentJsonp<{
    code: number
    data?: Record<string, { data?: { data?: string[] } }>
  }>(url, varName)
  if (body.code !== 0) {
    throw new Error(`minute/query 失败 (${body.code})`)
  }
  return body.data?.[symbol]?.data?.data ?? []
}

async function fetchHkFdays(symbol: string): Promise<TencentHkFdaysDay[]> {
  const varName = `fdays_data_${symbol}`
  const url = `${IFZQ_WEB}/appstock/app/day/query?_var=${varName}&code=${symbol}`
  const body = await fetchTencentJsonp<{
    code: number
    data?: Record<string, { data?: Array<{ date?: string; prec?: string; data?: string[] }> }>
  }>(url, varName)
  if (body.code !== 0) {
    throw new Error(`day/query 失败 (${body.code})`)
  }
  const days = body.data?.[symbol]?.data ?? []
  return days.map(day => {
    const date = formatYmdFromCompact(String(day.date ?? ''))
    const rows = day.data ?? []
    return {
      date,
      preClose: safeFloat(day.prec),
      points: mapHkMinuteTicks(normalizeHkNumericCode(symbol), rows, date),
    }
  }).filter(day => day.date)
}

type HkKlinePayload = {
  code: number
  data?: Record<string, Record<string, string[][] | string[]>>
}

async function fetchHkKlineRaw(
  symbol: string,
  klineType: string,
  limit: number,
  adjust: 'none' | 'qfq',
  startDate = '',
  endDate = '',
): Promise<HkKlinePayload> {
  const varName = `kline_${klineType}${adjust === 'qfq' ? 'qfq' : ''}`
  const param = [symbol, klineType, startDate, endDate, String(limit), adjust === 'qfq' ? 'qfq' : ''].join(',')
  const base = adjust === 'qfq'
    ? `${IFZQ_WEB}/appstock/app/hkfqkline/get`
    : `${IFZQ_WEB}/appstock/app/kline/kline`
  const url = `${base}?_var=${varName}&param=${param}`
  return fetchTencentJsonp<HkKlinePayload>(url, varName)
}

function dedupeKlineRows(rows: string[][]): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const row of rows) {
    const date = String(row[0] ?? '')
    if (!date || seen.has(date)) continue
    seen.add(date)
    out.push(row)
  }
  return out.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

async function fetchHkKlineBatched(
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
    const payload = await fetchHkKlineRaw(symbol, klineType, 2000, adjust, chunkStart, chunkEnd)
    merged.push(...extractKlineRows(payload, symbol, klineType, adjust))
  }
  return dedupeKlineRows(merged)
}

function extractKlineRows(
  payload: HkKlinePayload,
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

/**
 * 港股 K 线（分时 / 五日 / 日周月 / 1-3-5年）。
 *
 * - minute → minute/query（仅当日）
 * - fdays → day/query（近 5 个交易日分时）
 * - day/week/month → kline/kline 或 hkfqkline/get（qfq）
 * - year1/3/5 → 按年限换算 startDate/endDate
 * - startDate/endDate → 历史区间；日 K 跨多年时自动按年分批（上游单次最多 2000 根）
 */
export async function fetchTencentHkStockKline(opts: {
  code: string
  period?: TencentHkKlinePeriod | string
  limit?: number
  adjust?: 'none' | 'qfq'
  startDate?: string
  endDate?: string
}): Promise<TencentHkKlineResult> {
  const symbol = normalizeHkSymbol(opts.code)
  const numeric = normalizeHkNumericCode(opts.code)
  const period = resolveTencentHkKlinePeriod(String(opts.period ?? 'day')) ?? 'day'
  const adjust = opts.adjust === 'qfq' ? 'qfq' : 'none'
  const { startDate, endDate } = resolveHkKlineDateRange({
    period,
    startDate: opts.startDate,
    endDate: opts.endDate,
  })

  if (period === 'minute') {
    const rows = await fetchHkMinute(symbol)
    return {
      code: numeric,
      symbol,
      period,
      adjust,
      startDate: null,
      endDate: null,
      items: mapHkMinuteKlines(numeric, rows),
    }
  }

  if (period === 'fdays') {
    const days = await fetchHkFdays(symbol)
    return {
      code: numeric,
      symbol,
      period,
      adjust,
      startDate: days[days.length - 1]?.date ?? null,
      endDate: days[0]?.date ?? null,
      items: days,
    }
  }

  const klineType = YEAR_PERIODS.has(period) ? 'day' : period
  const defaultLimit = KLINE_PERIOD_LIMIT[period] ?? KLINE_PERIOD_LIMIT.day ?? 320
  const rangedLimit = startDate && endDate ? 2000 : (opts.limit ?? defaultLimit)
  const limit = Math.max(1, Math.min(rangedLimit, 2000))

  let rows: string[][] = []
  let quote: Record<string, string[]> | undefined

  if (shouldBatchHkKline(klineType, startDate, endDate, limit)) {
    rows = await fetchHkKlineBatched(symbol, klineType, startDate!, endDate!, adjust)
  } else {
    const payload = await fetchHkKlineRaw(
      symbol,
      klineType,
      limit,
      adjust,
      startDate ?? '',
      endDate ?? '',
    )
    rows = extractKlineRows(payload, symbol, klineType, adjust)
    quote = payload.data?.[symbol]?.qt as Record<string, string[]> | undefined
  }

  let mapped = mapHkKlineRows(numeric, rows)
  if (YEAR_PERIODS.has(period) && startDate && endDate) {
    const startKey = startDate.replace(/-/g, '')
    const endKey = endDate.replace(/-/g, '')
    mapped = mapped.filter(row => {
      const key = row.date.replace(/-/g, '')
      return key >= startKey && key <= endKey
    })
  }

  return {
    code: numeric,
    symbol,
    period,
    adjust,
    startDate,
    endDate,
    items: mapped,
    quote,
  }
}
