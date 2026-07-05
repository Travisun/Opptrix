/**
 * 东方财富 F10 数据接口 — 公司资料、财务数据、分红送转、龙虎榜等。
 *
 * 用途：获取上市公司基本面数据，支持公司概况、财务摘要、分红记录、股东信息。
 * 数据源：
 *   - F10 公司资料: https://emweb.securities.eastmoney.com/PC_HSF10/
 *   - 证券数据中心: https://datacenter.eastmoney.com/securities/api/data/v1/get
 *   - 旧版数据中心: https://datacenter-web.eastmoney.com/api/data/v1/get
 *   - 北向资金: https://push2.eastmoney.com/api/qt/kamt/get
 */

import type { Dividend, FinancialSummary, StockProfile } from '../../../core/schema.js'
import { isBseCode, normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'
import {
  EMWEB_HEADERS,
  SEC_HEADERS,
  eastmoneyGet,
} from './client.js'

/** 东财 F10 公司资料页面 API 基地址 */
const EMWEB_BASE = 'https://emweb.securities.eastmoney.com/PC_HSF10'
/** 证券数据中心 API（新版，优先使用） */
export const SEC_DC_API = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
/** 证券数据中心 API（旧版，降级兜底） */
export const LEGACY_DC_API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const SEC_API = SEC_DC_API

/**
 * 将股票代码转换为东财 F10 页面格式（如 "SH600519"）。
 * @param code 6 位股票代码
 * @returns 东财格式代码（如 "SH600519"、"SZ000858"）
 */
export function toEmWebCode(code: string): string {
  const c = normalizeCode(code)
  const m = resolveMarket(c)
  return `${m}${c}`
}

/**
 * 将股票代码转换为证券数据中心 SECUCODE 格式（如 "600519.SH"）。
 * @param code 6 位股票代码
 * @returns SECUCODE 格式（如 "600519.SH"、"430047.BJ"）
 */
export function toSecuCode(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `${c}.BJ`
  return `${c}.${resolveMarket(c)}`
}

/** 截取日期字符串前 10 位（YYYY-MM-DD） */
function sliceDate(v: unknown): string {
  return String(v ?? '').slice(0, 10)
}

/**
 * 升级旧版 SECURITY_CODE 过滤器为 SECUCODE 格式。
 * 证券数据中心新版 API 要求 SECUCODE（如 "600519.SH"），旧版 SECURITY_CODE（"600519"）不再支持。
 * @param filter 原始过滤条件（可能含 SECURITY_CODE="600519"）
 * @returns 升级后的过滤条件（SECUCODE="600519.SH"）
 */
export function upgradeDataCenterFilter(filter: string): string {
  if (filter.includes('SECUCODE=')) return filter
  return filter.replace(/SECURITY_CODE="(\d{6})"/g, (_, raw: string) => `SECUCODE="${toSecuCode(raw)}"`)
}

/**
 * 从证券数据中心获取报表数据 — 自动降级（新版 → 旧版）。
 *
 * 用途：统一的 datacenter 报表查询入口，所有 F10 数据函数通过此获取数据。
 * 降级策略：优先调用新版 SEC_DC_API，失败时降级到旧版 LEGACY_DC_API。
 *
 * @param reportName  报表名称（如 "RPT_F10_FINANCE_MAINFINADATA"）
 * @param filter      筛选条件（如 '(SECUCODE="600519.SH")'）
 * @param pageSize    每页条数，默认 20
 * @param sortColumns 排序字段，默认 "REPORT_DATE"
 * @param columns     返回字段，默认 "ALL"
 * @returns 数据行数组，失败返回空数组
 */
export async function fetchDataCenterReport(
  reportName: string,
  filter: string,
  pageSize = '20',
  sortColumns = 'REPORT_DATE',
  columns = 'ALL',
): Promise<Record<string, unknown>[]> {
  const upgraded = upgradeDataCenterFilter(filter)
  try {
    const secJson = await eastmoneyGet(SEC_DC_API, {
      reportName,
      columns,
      filter: upgraded,
      pageNumber: '1',
      pageSize,
      sortTypes: '-1',
      sortColumns,
      source: 'HSF10',
      client: 'PC',
    }, 15000, SEC_HEADERS)
    if (secJson?.success !== false) {
      const secRows = (secJson?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (secRows.length) return secRows
    }
  } catch { /* fall through */ }

  try {
    const legacyJson = await eastmoneyGet(LEGACY_DC_API, {
      reportName,
      columns,
      filter,
      pageNumber: '1',
      pageSize,
      sortTypes: '-1',
      sortColumns,
    }, 15000, SEC_HEADERS)
    if (legacyJson?.success === false) return []
    return (legacyJson?.result as { data?: Record<string, unknown>[] })?.data ?? []
  } catch {
    return []
  }
}

/** 生成最近 N 个交易日的日期列表（跳过周末） */
function recentDates(max = 6): string[] {
  const out: string[] = []
  const dt = new Date()
  for (let i = 0; i < max * 2 && out.length < max; i++) {
    const d = new Date(dt)
    d.setDate(d.getDate() - i)
    const day = d.getDay()
    if (day === 0 || day === 6) continue
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * 获取龙虎榜详情 — 指定日期或最近交易日的龙虎榜上榜数据。
 *
 * 用途：龙虎榜分析、游资动向追踪。
 * 数据源：datacenter-web RPT_DAILYBILLBOARD_DETAILS
 *
 * @param date 查询日期 YYYY-MM-DD，为空时查最近 6 个交易日
 * @returns { date, items } 或 null
 */
export async function fetchDragonTigerDetails(date = '') {
  const candidates = date ? [date, ...recentDates(5)] : recentDates(6)
  for (const d of candidates) {
    const items = await fetchDataCenterReport(
      'RPT_DAILYBILLBOARD_DETAILS',
      `(TRADE_DATE='${d}')`,
      '100',
      'BILLBOARD_NET_AMT',
    )
    if (items.length) return { date: d, items }
  }
  return null
}

/**
 * 获取交易日历 — 指定年份的全部交易日列表。
 *
 * 用途：交易日判断、日历组件数据。
 * 数据源：push2his 上证指数 K 线（仅取日期字段）
 *
 * @param year 年份，默认当前年份
 * @returns 交易日数组 [{ date, isTradeDay: true }]，失败返回 null
 */
export async function fetchTradeCalendar(year = new Date().getFullYear()) {
  try {
    const json = await eastmoneyGet('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
      secid: '1.000001',
      klt: '101',
      fqt: '0',
      beg: `${year}0101`,
      end: `${year}1231`,
      fields1: 'f1',
      fields2: 'f51',
    }, 15000, SEC_HEADERS)
    const klines = (json?.data as { klines?: string[] })?.klines ?? []
    if (!klines.length) return null
    return klines.map(line => ({
      date: line.split(',')[0],
      isTradeDay: true,
    }))
  } catch {
    return null
  }
}

/**
 * 获取北向资金快照 — 沪股通/深股通当日净流入额。
 *
 * 用途：北向资金流向分析、外资动向判断。
 * 数据源：push2.eastmoney.com/api/qt/kamt/get
 *
 * @returns MarketMoneyFlow 数组（direction='north'），失败返回 null
 */
export async function fetchNorthMoneyFlowSnapshot() {
  try {
    const json = await eastmoneyGet('https://push2.eastmoney.com/api/qt/kamt/get', {
      fields1: 'f1,f2,f3,f4',
      fields2: 'f51,f52,f53,f54,f55,f56',
    }, 15000, SEC_HEADERS)
    const data = json?.data as Record<string, Record<string, unknown>> | undefined
    if (!data) return null
    const hk2sh = data.hk2sh ?? {}
    const hk2sz = data.hk2sz ?? {}
    const date = String(hk2sh.date2 ?? hk2sz.date2 ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
    const shNet = safeFloat(hk2sh.dayNetAmtIn) ?? 0
    const szNet = safeFloat(hk2sz.dayNetAmtIn) ?? 0
    return [{
      direction: 'north',
      date,
      netAmount: shNet + szNet,
      shNet,
      szNet,
    }]
  } catch {
    return null
  }
}

/** 从分红方案文本中解析每股现金分红金额（元/股） */
function parseCashBonusPerShare(plan: unknown): number | null {
  const text = String(plan ?? '')
  const m = text.match(/(\d+(?:\.\d+)?)\s*元/)
  if (!m) return null
  const perTen = Number(m[1])
  if (!Number.isFinite(perTen)) return null
  if (text.includes('10派') || text.includes('10 派')) return perTen / 10
  return perTen
}

/**
 * 获取东财 F10 公司资料页面数据。
 *
 * 用途：公司概况、核心概念、主营业务等基本面信息。
 * 数据源：emweb.securities.eastmoney.com/PC_HSF10/{segment}/PageAjax
 *
 * @typeParam T - 返回数据结构（如 { jbzl?: ...; fxxg?: ... }）
 * @param segment 页面类型（如 "CompanySurvey"、"CoreConception"、"BonusFinancing"）
 * @param code 股票代码
 * @returns 页面数据对象，失败返回 null
 */
export async function fetchEmWebPage<T extends Record<string, unknown>>(
  segment: string,
  code: string,
): Promise<T | null> {
  try {
    const json = await eastmoneyGet(
      `${EMWEB_BASE}/${segment}/PageAjax`,
      { code: toEmWebCode(code) },
      15000,
      EMWEB_HEADERS,
    )
    return json as T
  } catch {
    return null
  }
}

/**
 * 从证券数据中心获取单只股票的报表数据。
 *
 * 用途：财务摘要、分红、股东等 F10 数据的统一查询入口。
 * 数据源：datacenter.eastmoney.com/securities/api/data/v1/get
 *
 * @param reportName  报表名称
 * @param code        股票代码
 * @param pageSize    每页条数，默认 16
 * @param sortColumns 排序字段，默认 "REPORT_DATE"
 * @returns 数据行数组
 */
export async function fetchSecuritiesReport(
  reportName: string,
  code: string,
  pageSize = '16',
  sortColumns = 'REPORT_DATE',
): Promise<Record<string, unknown>[]> {
  try {
    const json = await eastmoneyGet(SEC_API, {
      reportName,
      columns: 'ALL',
      pageNumber: '1',
      pageSize,
      sortTypes: '-1',
      sortColumns,
      source: 'HSF10',
      client: 'PC',
      filter: `(SECUCODE="${toSecuCode(code)}")`,
    }, 15000, SEC_HEADERS)
    if (json?.success === false) return []
    return (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
  } catch {
    return []
  }
}

/** 将东财财务数据行映射为标准 FinancialSummary 结构 */
function mapFinanceRow(code: string, item: Record<string, unknown>): FinancialSummary {
  return {
    code,
    reportDate: sliceDate(item.REPORT_DATE),
    reportType: String(item.REPORT_TYPE ?? item.REPORT_DATE_NAME ?? ''),
    revenue: safeFloat(item.TOTALOPERATEREVE),
    revenueYoy: safeFloat(item.TOTALOPERATEREVETZ),
    netProfit: safeFloat(item.PARENTNETPROFIT),
    netProfitYoy: safeFloat(item.PARENTNETPROFITTZ),
    eps: safeFloat(item.EPSJB),
    roe: safeFloat(item.ROEJQ),
    grossMargin: safeFloat(item.XSMLL),
    netMargin: safeFloat(item.XSJLL),
    debtRatio: safeFloat(item.ZCFZL),
    operatingCashFlow: safeFloat(item.NETCASH_OPERATE_PK) ?? safeFloat(item.MGJYXJJE),
    bps: safeFloat(item.BPS),
    totalAssets: safeFloat(item.TOTAL_ASSETS_PK),
    totalLiabilities: safeFloat(item.LIABILITY),
  }
}

function isAnnualReport(type: string) {
  return type.includes('年报')
}

function isQuarterReport(type: string) {
  return /一季报|中报|三季报|季报/.test(type)
}

/**
 * 获取 F10 财务摘要数据 — 营收、净利润、EPS、ROE 等核心财务指标。
 *
 * 对应 Python: akshare stock_financial_abstract（东财 F10 财务数据）
 * 数据源：RPT_F10_FINANCE_MAINFINADATA
 *
 * @param code       股票代码
 * @param reportType 报告类型: 'annual'（年报）| 'quarter'（季报）| 'all'（全部），默认 'annual'
 * @returns FinancialSummary 数组，失败返回 null
 */
export async function fetchF10Financials(
  code: string,
  reportType: 'annual' | 'quarter' | 'all' = 'annual',
): Promise<FinancialSummary[] | null> {
  const c = normalizeCode(code)
  const rows = await fetchSecuritiesReport('RPT_F10_FINANCE_MAINFINADATA', c, '24')
  if (!rows.length) return null

  const mapped = rows.map(item => mapFinanceRow(c, item))
  if (reportType === 'all') return mapped
  if (reportType === 'quarter') {
    const quarters = mapped.filter(item => isQuarterReport(item.reportType ?? ''))
    return quarters.length ? quarters : mapped.slice(0, 12)
  }
  const annual = mapped.filter(item => isAnnualReport(item.reportType ?? ''))
  return annual.length ? annual : [mapped[0]]
}

/**
 * 获取 F10 公司概况 — 工商信息、行业分类、概念板块、主营业务等。
 *
 * 对应 Python: akshare stock_profile_em（东财 F10 公司概况）
 * 数据源：emweb CompanySurvey + CoreConception 页面
 *
 * @param code              股票代码
 * @param marketCap         总市值（元），可选
 * @param circulatingMarketCap 流通市值（元），可选
 * @returns StockProfile 数组，失败返回 null
 */
export async function fetchF10Profile(
  code: string,
  marketCap?: number | null,
  circulatingMarketCap?: number | null,
): Promise<StockProfile[] | null> {
  const c = normalizeCode(code)
  const [survey, concepts] = [
    await fetchEmWebPage<{ jbzl?: Record<string, unknown>[]; fxxg?: Record<string, unknown>[] }>('CompanySurvey', c),
    await fetchEmWebPage<{ ssbk?: Record<string, unknown>[]; hxtc?: Record<string, unknown>[] }>('CoreConception', c),
  ]
  const base = survey?.jbzl?.[0]
  if (!base) return null

  const issue = survey?.fxxg?.[0]
  const boards = (concepts?.ssbk ?? []).map(it => String(it.BOARD_NAME ?? '')).filter(Boolean)
  const highlights = (concepts?.hxtc ?? [])
    .filter(it => String(it.IS_POINT ?? '') === '1')
    .map(it => String(it.KEYWORD ?? ''))
    .filter(Boolean)

  const industry = String(base.EM2016 ?? base.INDUSTRYCSRC1 ?? '').replace(/^-/,'').trim()
  const mainBusiness = String(base.BUSINESS_SCOPE ?? base.ORG_PROFILE ?? '').trim()

  return [{
    code: c,
    name: String(base.SECURITY_NAME_ABBR ?? base.ORG_NAME ?? ''),
    orgName: String(base.ORG_NAME ?? ''),
    industry: industry || boards[0] || '',
    industryCsrc: String(base.INDUSTRYCSRC1 ?? ''),
    concepts: [...new Set([...boards, ...highlights])],
    listingDate: sliceDate(issue?.LISTING_DATE ?? base.LISTING_DATE),
    foundDate: sliceDate(issue?.FOUND_DATE),
    mainBusiness,
    orgProfile: String(base.ORG_PROFILE ?? '').trim(),
    businessScope: String(base.BUSINESS_SCOPE ?? '').trim(),
    province: String(base.PROVINCE ?? ''),
    city: '',
    address: String(base.ADDRESS ?? base.REG_ADDRESS ?? ''),
    website: String(base.ORG_WEB ?? ''),
    employees: safeFloat(base.EMP_NUM),
    regCapital: safeFloat(base.REG_CAPITAL),
    chairman: String(base.CHAIRMAN ?? ''),
    legalPerson: String(base.LEGAL_PERSON ?? ''),
    secretary: String(base.SECRETARY ?? ''),
    orgTel: String(base.ORG_TEL ?? ''),
    securityType: String(base.SECURITY_TYPE ?? ''),
    formerName: String(base.FORMERNAME ?? ''),
    issuePrice: safeFloat(issue?.ISSUE_PRICE),
    totalMarketCap: marketCap ?? null,
    circulatingMarketCap: circulatingMarketCap ?? null,
  }]
}

/**
 * 获取 F10 分红送配数据 — 历次现金分红、股票分红及实施进度。
 *
 * 对应 Python: akshare stock_fhps_em（分红送配）
 * 数据源：emweb BonusFinancing 页面
 *
 * @param code 股票代码
 * @returns Dividend 数组，失败返回 null
 */
export async function fetchF10Dividends(code: string): Promise<Dividend[] | null> {
  const c = normalizeCode(code)
  const bonus = await fetchEmWebPage<{
    fhyx?: Record<string, unknown>[]
    lnfhrz?: Record<string, unknown>[]
  }>('BonusFinancing', c)
  const plans = bonus?.fhyx ?? []
  if (!plans.length) return null

  return plans.map(it => ({
    code: c,
    year: String(it.NOTICE_DATE ?? it.EX_DIVIDEND_DATE ?? '').slice(0, 4),
    cashBonus: parseCashBonusPerShare(it.IMPL_PLAN_PROFILE),
    exDate: sliceDate(it.EX_DIVIDEND_DATE),
    recordDate: sliceDate(it.EQUITY_RECORD_DATE),
    payDate: sliceDate(it.PAY_CASH_DATE),
    plan: String(it.IMPL_PLAN_PROFILE ?? ''),
    progress: String(it.ASSIGN_PROGRESS ?? ''),
  }))
}

/**
 * 获取 F10 股东信息 — 十大股东、股东户数、人均持股等。
 *
 * 对应 Python: akshare stock_gdfx_free_holding_analyse_em（股东研究）
 * 数据源：emweb ShareholderResearch 页面
 *
 * @param code 股票代码
 * @returns 股东信息数组（含 top10Shareholders），失败返回 null
 */
export async function fetchF10Shareholders(code: string): Promise<Record<string, unknown>[] | null> {
  const c = normalizeCode(code)
  const holder = await fetchEmWebPage<{
    gdrs?: Record<string, unknown>[]
    sdgd?: Record<string, unknown>[]
  }>('ShareholderResearch', c)
  const summary = holder?.gdrs?.[0]
  const top10 = holder?.sdgd ?? []
  if (!summary && !top10.length) return null

  const parseChange = (v: unknown): number | null => {
    const s = String(v ?? '').trim()
    if (!s || s === '不变' || s === '--') return null
    const n = Number(s.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  return [{
    code: c,
    reportDate: sliceDate(summary?.END_DATE ?? top10[0]?.END_DATE),
    shareholderCount: safeFloat(summary?.HOLDER_TOTAL_NUM),
    shareholderCountChange: safeFloat(summary?.TOTAL_NUM_RATIO),
    avgHoldingValue: safeFloat(summary?.AVG_HOLD_AMT),
    holdFocus: String(summary?.HOLD_FOCUS ?? ''),
    avgFreeShares: safeFloat(summary?.AVG_FREE_SHARES),
    top10Shareholders: top10.map(it => ({
      rank: Number(it.HOLDER_RANK) || 0,
      name: String(it.HOLDER_NAME ?? ''),
      sharesHeld: safeFloat(it.HOLD_NUM),
      sharePct: safeFloat(it.HOLD_NUM_RATIO),
      change: parseChange(it.HOLD_NUM_CHANGE),
      shareType: String(it.SHARES_TYPE ?? ''),
    })),
  }]
}
