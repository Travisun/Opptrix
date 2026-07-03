import type { Dividend, FinancialSummary, StockProfile } from '../../../core/schema.js'
import { httpGet } from '../../../utils/http.js'
import { isBseCode, normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'

const EMWEB_BASE = 'https://emweb.securities.eastmoney.com/PC_HSF10'
export const SEC_DC_API = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
export const LEGACY_DC_API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const SEC_API = SEC_DC_API

const EMWEB_HEADERS = { Referer: 'https://emweb.securities.eastmoney.com/' }
const SEC_HEADERS = { Referer: 'https://data.eastmoney.com/' }

export function toEmWebCode(code: string): string {
  const c = normalizeCode(code)
  const m = resolveMarket(c)
  return `${m}${c}`
}

export function toSecuCode(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `${c}.BJ`
  return `${c}.${resolveMarket(c)}`
}

function sliceDate(v: unknown): string {
  return String(v ?? '').slice(0, 10)
}

/** Upgrade legacy SECURITY_CODE filters to SECUCODE for securities API. */
export function upgradeDataCenterFilter(filter: string): string {
  if (filter.includes('SECUCODE=')) return filter
  return filter.replace(/SECURITY_CODE="(\d{6})"/g, (_, raw: string) => `SECUCODE="${toSecuCode(raw)}"`)
}

export async function fetchDataCenterReport(
  reportName: string,
  filter: string,
  pageSize = '20',
  sortColumns = 'REPORT_DATE',
  columns = 'ALL',
): Promise<Record<string, unknown>[]> {
  const upgraded = upgradeDataCenterFilter(filter)
  try {
    const secJson = await httpGet(SEC_DC_API, {
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
    const legacyJson = await httpGet(LEGACY_DC_API, {
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

export async function fetchTradeCalendar(year = new Date().getFullYear()) {
  try {
    const json = await httpGet('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
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

export async function fetchNorthMoneyFlowSnapshot() {
  try {
    const json = await httpGet('https://push2.eastmoney.com/api/qt/kamt/get', {
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

function parseCashBonusPerShare(plan: unknown): number | null {
  const text = String(plan ?? '')
  const m = text.match(/(\d+(?:\.\d+)?)\s*元/)
  if (!m) return null
  const perTen = Number(m[1])
  if (!Number.isFinite(perTen)) return null
  if (text.includes('10派') || text.includes('10 派')) return perTen / 10
  return perTen
}

export async function fetchEmWebPage<T extends Record<string, unknown>>(
  segment: string,
  code: string,
): Promise<T | null> {
  try {
    const json = await httpGet(
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

export async function fetchSecuritiesReport(
  reportName: string,
  code: string,
  pageSize = '16',
  sortColumns = 'REPORT_DATE',
): Promise<Record<string, unknown>[]> {
  try {
    const json = await httpGet(SEC_API, {
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

export async function fetchF10Profile(
  code: string,
  marketCap?: number | null,
  circulatingMarketCap?: number | null,
): Promise<StockProfile[] | null> {
  const c = normalizeCode(code)
  const [survey, concepts] = await Promise.all([
    fetchEmWebPage<{ jbzl?: Record<string, unknown>[]; fxxg?: Record<string, unknown>[] }>('CompanySurvey', c),
    fetchEmWebPage<{ ssbk?: Record<string, unknown>[]; hxtc?: Record<string, unknown>[] }>('CoreConception', c),
  ])
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
