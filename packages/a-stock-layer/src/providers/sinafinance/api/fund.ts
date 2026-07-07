import { normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'
import { fetchJson } from './http.js'
import { fetchSinaHqList } from './sina.js'
import { parseHqLine } from '../normalize/quote.js'
import { SINA_REFERER } from './types.js'

export const SINA_ETF_HQ_NODE = 'etf_hq_fund'
export const SINA_LOF_HQ_NODE = 'lof_hq_fund'
export const SINA_FUND_OPENAPI_BASE = 'https://stock.finance.sina.com.cn/fundInfo/api/openapi.php'
export const SINA_FUND_DETAIL_BASE = 'https://finance.sina.com.cn/fund/quotes'
export const SINA_FUND_GG_DETAIL_BASE = 'https://stock.finance.sina.com.cn/fundInfo/view/FundGG_Info.php'

const MARKET_CENTER_URL =
  'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData'
const MARKET_COUNT_URL =
  'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount'

export type SinaFundMarketNode = typeof SINA_ETF_HQ_NODE | typeof SINA_LOF_HQ_NODE | string

export interface SinaFundOpenApiEnvelope<T> {
  result?: {
    status?: { code?: number; msg?: string }
    data?: T
  }
}

export interface SinaEtfHqRow {
  symbol?: string
  code?: string
  name?: string
  trade?: string | number
  pricechange?: string | number
  changepercent?: string | number
  buy?: string | number
  sell?: string | number
  settlement?: string | number
  open?: string | number
  high?: string | number
  low?: string | number
  volume?: string | number
  amount?: string | number
  ticktime?: string
  turnoverratio?: string | number
  mktcap?: string | number
  nmc?: string | number
}

export interface SinaFundQuoteRaw {
  code: string
  name?: string
  unitNav?: number | null
  accNav?: number | null
  prevNav?: number | null
  changePct?: number | null
  navDate?: string
  exchangePrice?: number | null
  exchangeChange?: number | null
  exchangeChangePct?: number | null
  exchangeOpen?: number | null
  exchangeHigh?: number | null
  exchangeLow?: number | null
  exchangeVolume?: number | null
  exchangeAmount?: number | null
  premiumPct?: number | null
}

export interface SinaFundProfileRaw {
  fullName?: string
  shortName?: string
  symbol?: string
  establishDate?: string
  listDate?: string
  custodian?: string
  listPlace?: string
  type1?: string
  type2?: string
  type3?: string
  fundScale?: string
  fundShares?: string
  manager?: string
  company?: string
  benchmark?: string
  investTarget?: string
  investScope?: string
  fields: Record<string, string>
}

export interface SinaFundNavRow {
  date: string
  unitNav?: string
  accNav?: string
  dailyReturn?: string
  weeklyReturn?: string
}

export interface SinaFundAnnouncementRow {
  id: string
  title: string
  type?: string
  publishDate?: string
  publisher?: string
  link: string
}

export interface SinaFundDocumentRow {
  id: string
  title: string
  date?: string
  link: string
}

function fundCode(code: string): string {
  return normalizeCode(code)
}

function fundMarketPrefix(code: string): 'sh' | 'sz' {
  const market = resolveMarket(code)
  return market === 'SH' ? 'sh' : 'sz'
}

async function fetchFundOpenApi<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams({ ...params, format: 'json' })
  const url = `${SINA_FUND_OPENAPI_BASE}/${path}?${qs}`
  const env = await fetchJson<SinaFundOpenApiEnvelope<T>>(url, SINA_REFERER)
  if (env.result?.status?.code !== 0) return null
  return env.result?.data ?? null
}

export function buildSinaFundDetailUrl(code: string): string {
  return `${SINA_FUND_DETAIL_BASE}/${fundCode(code)}/bc.shtml`
}

export function buildSinaFundAnnouncementUrl(id: string): string {
  return `${SINA_FUND_GG_DETAIL_BASE}?id=${encodeURIComponent(id)}`
}

/** ETF / LOF 场内基金行情列表（分页） */
export async function fetchSinaFundHqPage(opts: {
  node?: SinaFundMarketNode
  page?: number
  pageSize?: number
  sort?: string
  asc?: boolean
}): Promise<{ total: number; items: SinaEtfHqRow[]; page: number; pageSize: number; hasNext: boolean }> {
  const node = opts.node ?? SINA_ETF_HQ_NODE
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const pageSize = Math.max(1, Math.min(Math.floor(opts.pageSize ?? 40), 100))
  const totalRaw = await fetchJson<string | number>(
    `${MARKET_COUNT_URL}?node=${encodeURIComponent(node)}`,
    SINA_REFERER,
  )
  const total = Number(totalRaw) || 0
  const params = new URLSearchParams({
    page: String(page),
    num: String(pageSize),
    sort: opts.sort ?? 'symbol',
    asc: opts.asc === false ? '0' : '1',
    node,
    symbol: '',
  })
  const batch = await fetchJson<SinaEtfHqRow[]>(`${MARKET_CENTER_URL}?${params}`, SINA_REFERER)
  const items = Array.isArray(batch) ? batch.filter(r => /^\d{6}$/.test(String(r.code ?? ''))) : []
  const maxPage = total > 0 ? Math.ceil(total / pageSize) : page
  return {
    total,
    items,
    page,
    pageSize,
    hasNext: page < maxPage && items.length > 0,
  }
}

export function parseOpenFundHq(parts: string[]): Partial<SinaFundQuoteRaw> {
  if (parts.length < 5) return {}
  return {
    name: parts[0],
    unitNav: safeFloat(parts[1]),
    accNav: safeFloat(parts[2]),
    prevNav: safeFloat(parts[3]),
    changePct: safeFloat(parts[4]),
    navDate: parts[5],
  }
}

export function parseExchangeEtfHq(parts: string[]): Partial<SinaFundQuoteRaw> {
  if (parts.length < 10) return {}
  const name = parts[0]
  const open = safeFloat(parts[1])
  const prevClose = safeFloat(parts[2])
  const price = safeFloat(parts[3])
  const high = safeFloat(parts[4])
  const low = safeFloat(parts[5])
  const change = price != null && prevClose != null ? price - prevClose : null
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null
  return {
    name,
    exchangePrice: price,
    exchangeOpen: open,
    exchangeHigh: high,
    exchangeLow: low,
    exchangeChange: change,
    exchangeChangePct: changePct,
    exchangeVolume: safeFloat(parts[8]),
    exchangeAmount: safeFloat(parts[9]),
    prevNav: prevClose,
  }
}

/** 基金详情页行情 — `hq.sinajs.cn` of/f_/交易所代码 */
export async function fetchSinaFundQuoteRaw(code: string): Promise<SinaFundQuoteRaw | null> {
  const bare = fundCode(code)
  if (!/^\d{6}$/.test(bare)) return null
  const prefix = fundMarketPrefix(bare)
  const text = await fetchSinaHqList([`of${bare}`, `f_${bare}`, `${prefix}${bare}`])
  const rows = text.trim().split('\n').map(parseHqLine).filter(Boolean)
  const byKey = new Map(rows.map(r => [r!.key, r!.values]))
  const openParts = byKey.get(`of${bare}`) ?? []
  const fParts = byKey.get(`f_${bare}`) ?? []
  const exParts = byKey.get(`${prefix}${bare}`) ?? []

  const open = parseOpenFundHq(openParts)
  const exchange = parseExchangeEtfHq(exParts)
  const unitNav = open.unitNav ?? safeFloat(fParts[1])
  const accNav = open.accNav ?? safeFloat(fParts[2])
  const exchangePrice = exchange.exchangePrice
  let premiumPct: number | null = null
  if (unitNav != null && unitNav > 0 && exchangePrice != null) {
    premiumPct = ((exchangePrice - unitNav) / unitNav) * 100
  }

  return {
    code: bare,
    name: open.name ?? exchange.name ?? fParts[0],
    unitNav,
    accNav,
    prevNav: open.prevNav ?? safeFloat(fParts[3]),
    changePct: open.changePct,
    navDate: open.navDate ?? fParts[4],
    ...exchange,
    premiumPct,
  }
}

const PROFILE_FIELD_MAP: Record<string, keyof SinaFundProfileRaw | 'fields'> = {
  jjqc: 'fullName',
  jjjc: 'shortName',
  symbol: 'symbol',
  clrq: 'establishDate',
  ssrq: 'listDate',
  xcr: 'custodian',
  ssdd: 'listPlace',
  Type1Name: 'type1',
  Type2Name: 'type2',
  Type3Name: 'type3',
  NewType1Name: 'type1',
  NewType2Name: 'type2',
  NewType3Name: 'type3',
  jjgm: 'fundScale',
  jjfe: 'fundShares',
  jjjl: 'manager',
  jjgs: 'company',
  yjbjjz: 'benchmark',
  tzmb: 'investTarget',
  tzfw: 'investScope',
}

/** 基本信息 — `FundPageInfoService.tabjjgk` */
export async function fetchSinaFundProfileRaw(code: string): Promise<SinaFundProfileRaw | null> {
  const data = await fetchFundOpenApi<Record<string, string>>(
    'FundPageInfoService.tabjjgk',
    { symbol: fundCode(code) },
  )
  if (!data) return null

  const out: SinaFundProfileRaw = { fields: {} }
  for (const [key, value] of Object.entries(data)) {
    const mapped = PROFILE_FIELD_MAP[key]
    if (mapped && mapped !== 'fields') {
      ;(out as unknown as Record<string, unknown>)[mapped] = value === '--' ? undefined : value
    } else if (value != null && value !== '--') {
      out.fields[key] = String(value)
    }
  }
  out.symbol = out.symbol ?? fundCode(code)
  return out
}

/** 历史净值 — `CaihuiFundInfoService.getNav` */
export async function fetchSinaFundNavPage(
  code: string,
  page = 1,
  pageSize = 20,
): Promise<{ total: number; rows: SinaFundNavRow[]; page: number; pageSize: number; hasNext: boolean }> {
  const data = await fetchFundOpenApi<{ data?: Array<Record<string, string>>; total_num?: string | number }>(
    'CaihuiFundInfoService.getNav',
    {
      symbol: fundCode(code),
      page: String(Math.max(1, page)),
      num: String(Math.max(1, Math.min(pageSize, 100))),
    },
  )
  const total = Number(data?.total_num ?? 0)
  const rows = (data?.data ?? []).map(row => ({
    date: String(row.fbrq ?? '').slice(0, 10),
    unitNav: row.jjjz,
    accNav: row.ljjz,
    dailyReturn: row.rzzl,
    weeklyReturn: row.zzzl,
  }))
  const pg = Math.max(1, page)
  const size = Math.max(1, Math.min(pageSize, 100))
  const maxPage = total > 0 ? Math.ceil(total / size) : pg
  return { total, rows, page: pg, pageSize: size, hasNext: pg < maxPage && rows.length > 0 }
}

/** 费率 — `FundPageInfoService.tabfl` + `FdFundService.getDealRule` */
export async function fetchSinaFundFeesRaw(code: string): Promise<Record<string, unknown> | null> {
  const symbol = fundCode(code)
  const [tabfl, dealRule] = await Promise.all([
    fetchFundOpenApi<Record<string, unknown>>('FundPageInfoService.tabfl', { symbol }),
    fetchFundOpenApi<Record<string, unknown>>('FdFundService.getDealRule', { symbol }),
  ])
  if (!tabfl && !dealRule) return null
  return {
    publishedFees: tabfl ?? {},
    tradingRules: dealRule ?? {},
  }
}

/** 分红 / 拆分 — `FdFundService.getJJFHAll` */
export async function fetchSinaFundDistributionRaw(code: string): Promise<Record<string, unknown> | null> {
  return fetchFundOpenApi<Record<string, unknown>>('FdFundService.getJJFHAll', { symbol: fundCode(code) })
}

/** 公告 — `CaihuiFundInfoService.getGG` */
export async function fetchSinaFundAnnouncementsPage(
  code: string,
  opts: { page?: number; type?: string; dateFrom?: string; dateTo?: string } = {},
): Promise<{ total: number; rows: SinaFundAnnouncementRow[]; page: number; hasNext: boolean }> {
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const data = await fetchFundOpenApi<{ data?: Array<Record<string, string>>; total_num?: string | number }>(
    'CaihuiFundInfoService.getGG',
    {
      symbol: fundCode(code),
      datefrom: opts.dateFrom ?? '',
      dateto: opts.dateTo ?? '',
      type: opts.type ?? '',
      page: String(page),
    },
  )
  const total = Number(data?.total_num ?? 0)
  const pageSize = 20
  const rows = (data?.data ?? []).map(row => {
    const id = String(row.id ?? '')
    return {
      id,
      title: String(row.title ?? ''),
      type: row.gglx,
      publishDate: String(row.fbsj ?? '').slice(0, 10),
      publisher: row.ggly,
      link: buildSinaFundAnnouncementUrl(id),
    }
  })
  const maxPage = total > 0 ? Math.ceil(total / pageSize) : page
  return { total, rows, page, hasNext: page < maxPage && rows.length > 0 }
}

/** 法律文件 — `FundPageInfoService.tabflwj` */
export async function fetchSinaFundDocumentsRaw(code: string): Promise<SinaFundDocumentRow[]> {
  const data = await fetchFundOpenApi<{ ht?: Array<Record<string, string>>; zm?: Array<Record<string, string>> }>(
    'FundPageInfoService.tabflwj',
    { symbol: fundCode(code) },
  )
  if (!data) return []
  const out: SinaFundDocumentRow[] = []
  for (const group of [data.ht ?? [], data.zm ?? []]) {
    for (const row of group) {
      const id = String(row.id ?? '')
      if (!id) continue
      const link = String(row.wjlink ?? '').startsWith('http')
        ? String(row.wjlink)
        : `https://stock.finance.sina.com.cn/fundInfo/view/FundGG_Info.php?id=${id}`
      out.push({
        id,
        title: String(row.title ?? ''),
        date: row.date?.replace(/\//g, '-'),
        link,
      })
    }
  }
  return out
}

/** 申购赎回份额 — `FundPageInfoService.tabsgsh` */
export async function fetchSinaFundShareChangeRaw(code: string): Promise<Array<Record<string, string>> | null> {
  const data = await fetchFundOpenApi<Array<Record<string, string>>>(
    'FundPageInfoService.tabsgsh',
    { symbol: fundCode(code) },
  )
  return data ?? null
}

/** 销售机构 — `FundPageInfoService.tabxsjg` */
export async function fetchSinaFundAgenciesRaw(code: string): Promise<Record<string, unknown> | null> {
  return fetchFundOpenApi<Record<string, unknown>>('FundPageInfoService.tabxsjg', { symbol: fundCode(code) })
}

/** 财务指标字段标签 — 来自详情页 `fh_cwzb_tmp` */
export const SINA_FUND_FINANCIAL_INDICATOR_FIELDS: Record<string, string> = {
  bgq: 'reportDate',
  bqlr: 'periodProfit',
  bqjsy: 'periodNetIncome',
  jqpjlr: 'weightedAvgProfitPerShare',
  jcjz: 'periodEndNav',
  dwjz: 'periodEndUnitNav',
}

/** 利润表字段标签 — 来自详情页 `fh_lrb_tmp` */
export const SINA_FUND_INCOME_STATEMENT_FIELDS: Record<string, string> = {
  REPORTDATE: 'reportDate',
  ICST_NEW1: 'revenue',
  ICST_NEW2: 'interestIncome',
  ICST_NEW3: 'depositInterestIncome',
  ICST_NEW4: 'bondInterestIncome',
  ICST_NEW5: 'absInterestIncome',
  ICST_NEW6: 'reverseRepoIncome',
  ICST_NEW7: 'investmentIncome',
  ICST_NEW8: 'stockInvestmentIncome',
  ICST_NEW9: 'bondInvestmentIncome',
  ICST_NEW10: 'absInvestmentIncome',
  ICST_NEW11: 'fundInvestmentIncome',
  ICST_NEW12: 'derivativeIncome',
  ICST_NEW13: 'dividendIncome',
  ICST_NEW14: 'fairValueChangeIncome',
  ICST_NEW15: 'otherIncome',
  ICST_NEW16: 'expenses',
  ICST_NEW17: 'managementFee',
  ICST_NEW18: 'custodyFee',
  ICST_NEW19: 'salesServiceFee',
  ICST_NEW20: 'tradingFee',
  ICST_NEW21: 'interestExpense',
  ICST_NEW22: 'reverseRepoExpense',
  ICST_NEW24: 'otherExpenses',
  ICST_NEW25: 'totalProfit',
  ICST_NEW26: 'exchangeGain',
  ICST_NEW27: 'incomeTax',
  ICST_NEW28: 'netProfit',
}

/** 基金负债表字段标签 — 来自详情页 `fh_jjfzb_tmp`（API: `tabfzb`） */
export const SINA_FUND_BALANCE_SHEET_FIELDS: Record<string, string> = {
  REPORTDATE: 'reportDate',
  BSHEET_NEW1: 'cashInBank',
  BSHEET_NEW2: 'settlementReserve',
  BSHEET_NEW3: 'marginDeposit',
  BSHEET_NEW4: 'tradingFinancialAssets',
  BSHEET_NEW5: 'stockInvestment',
  BSHEET_NEW9: 'derivativeAssets',
  BSHEET_NEW10: 'reverseRepoAssets',
  BSHEET_NEW11: 'securitiesSettlementReceivable',
  BSHEET_NEW12: 'interestReceivable',
  BSHEET_NEW13: 'dividendReceivable',
  BSHEET_NEW14: 'subscriptionReceivable',
  BSHEET_NEW15: 'otherAssets',
  BSHEET_NEW16: 'totalAssets',
  BSHEET_NEW17: 'shortTermBorrowings',
  BSHEET_NEW18: 'tradingFinancialLiabilities',
  BSHEET_NEW19: 'derivativeLiabilities',
  BSHEET_NEW20: 'reverseRepoLiabilities',
  BSHEET_NEW21: 'securitiesSettlementPayable',
  BSHEET_NEW22: 'redemptionPayable',
  BSHEET_NEW23: 'managementFeePayable',
  BSHEET_NEW24: 'custodyFeePayable',
  BSHEET_NEW25: 'salesServiceFeePayable',
  BSHEET_NEW26: 'tradingFeePayable',
  BSHEET_NEW27: 'taxPayable',
  BSHEET_NEW28: 'interestPayable',
  BSHEET_NEW29: 'profitPayable',
  BSHEET_NEW30: 'otherLiabilities',
  BSHEET_NEW31: 'totalLiabilities',
  BSHEET_NEW32: 'paidInCapital',
  BSHEET_NEW33: 'undistributedProfit',
  BSHEET_NEW34: 'totalEquity',
  BSHEET_NEW35: 'totalLiabilitiesAndEquity',
}

function normalizeFundFieldValue(value: unknown): string | number | null {
  if (value == null || value === '' || value === '--') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  if (!text || text === '--') return null
  const num = Number(text.replace(/,/g, ''))
  return Number.isFinite(num) ? num : text
}

function normalizeFundReportDate(value: unknown): string {
  return String(value ?? '').slice(0, 10)
}

/**
 * 将多期财报原始行映射为带语义字段名的 `periods`
 * @param rows - 新浪 OpenAPI 原始数组（`tabcwzb` / `tablrb` / `tabfzb`）
 * @param fieldMap - 原始字段 → 语义键名，见 `SINA_FUND_*_FIELDS`
 */
export function mapFundStatementPeriods(
  rows: Array<Record<string, unknown>>,
  fieldMap: Record<string, string>,
): Array<{ reportDate: string; metrics: Record<string, string | number | null> }> {
  return rows.map(row => {
    const metrics: Record<string, string | number | null> = {}
    for (const [rawKey, label] of Object.entries(fieldMap)) {
      if (!(rawKey in row)) continue
      const value = normalizeFundFieldValue(row[rawKey])
      if (value != null) metrics[label] = value
    }
    const reportDate =
      normalizeFundReportDate(row.REPORTDATE ?? row.bgq ?? metrics.reportDate)
    if (reportDate) metrics.reportDate = reportDate
    return { reportDate, metrics }
  })
}

/** 十大持有人原始响应 — `tabsdcyr` · `info[]` */
export interface SinaFundTopHolderRaw {
  cyrmc?: string
  cyfe?: string
  zfeb?: string
}

/** 十大持有人原始响应 — `tabsdcyr` */
export interface SinaFundTopHoldersRaw {
  dates: Array<{ PUBLISHDATE?: string }>
  info: SinaFundTopHolderRaw[]
}

/** 持有人结构原始响应 — `tabcyrjg` */
export interface SinaFundHolderStructureRaw {
  CYRInfo?: Record<string, string>
  CYRDate?: Array<{ REPORTDATE?: string }>
}

/**
 * 十大持有人 — `FundPageInfoService.tabsdcyr`
 * @param date - 报告期 `YYYY-MM-DD`，可选
 */
export async function fetchSinaFundTopHoldersRaw(
  code: string,
  date = '',
): Promise<SinaFundTopHoldersRaw | null> {
  const params: Record<string, string> = { symbol: fundCode(code) }
  if (date) params.date = date
  return fetchFundOpenApi<SinaFundTopHoldersRaw>('FundPageInfoService.tabsdcyr', params)
}

/**
 * 持有人结构 — `FundPageInfoService.tabcyrjg`
 * @param date - 报告期 `YYYY-MM-DD`，可选
 */
export async function fetchSinaFundHolderStructureRaw(
  code: string,
  date = '',
): Promise<SinaFundHolderStructureRaw | null> {
  const params: Record<string, string> = { symbol: fundCode(code) }
  if (date) params.date = date
  return fetchFundOpenApi<SinaFundHolderStructureRaw>('FundPageInfoService.tabcyrjg', params)
}

/** 持有人结构历史 — `FundPageInfoService.tabsdcyrbd` · 按报告期键名索引 */
export async function fetchSinaFundHolderStructureHistoryRaw(
  code: string,
): Promise<Record<string, Record<string, string>> | null> {
  return fetchFundOpenApi<Record<string, Record<string, string>>>(
    'FundPageInfoService.tabsdcyrbd',
    { symbol: fundCode(code) },
  )
}

/** 财务指标 — `FundPageInfoService.tabcwzb` */
export async function fetchSinaFundFinancialIndicatorsRaw(
  code: string,
): Promise<Array<Record<string, string>> | null> {
  return fetchFundOpenApi<Array<Record<string, string>>>(
    'FundPageInfoService.tabcwzb',
    { symbol: fundCode(code) },
  )
}

/** 利润表 — `FundPageInfoService.tablrb` */
export async function fetchSinaFundIncomeStatementRaw(
  code: string,
): Promise<Array<Record<string, unknown>> | null> {
  return fetchFundOpenApi<Array<Record<string, unknown>>>(
    'FundPageInfoService.tablrb',
    { symbol: fundCode(code) },
  )
}

/** 基金负债表 — `FundPageInfoService.tabfzb` */
export async function fetchSinaFundBalanceSheetRaw(
  code: string,
): Promise<Array<Record<string, unknown>> | null> {
  return fetchFundOpenApi<Array<Record<string, unknown>>>(
    'FundPageInfoService.tabfzb',
    { symbol: fundCode(code) },
  )
}
