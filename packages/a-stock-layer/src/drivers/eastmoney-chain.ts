import { normalizeCode, safeFloat } from '../utils/helpers.js'
import { fetchEmWebPage, fetchF10Financials, fetchF10Profile, fetchF10Shareholders } from './eastmoney-f10.js'
import type { EastMoneyDriver } from './eastmoney.js'

type EM = EastMoneyDriver & {
  dcFetch(reportName: string, columns: string, filter: string, pageSize?: string): Promise<Record<string, unknown>[]>
}

async function dcAll(em: EM, reportName: string, filter: string, pageSize = '50', sortColumns = 'REPORT_DATE') {
  return em.dcFetch(reportName, 'ALL', filter, pageSize)
}

async function dcFirst(em: EM, names: string[], filter: string, pageSize = '50') {
  for (const name of names) {
    const items = await dcAll(em, name, filter, pageSize)
    if (items.length) return items
  }
  return []
}

function c(code: string) { return normalizeCode(code) }

/** Chain / research datacenter methods — mirrors Python eastmoney.py research section */
export function mixEastMoneyChain(Driver: { prototype: EastMoneyDriver }) {
  const p = Driver.prototype as EM

  p.mainBusiness = async function mainBusiness(code: string) {
    try {
      const cc = c(code)
      const industry = await fetchEmWebPage<{ hyzx?: Record<string, unknown>[] }>('IndustryAnalysis', cc)
      const segments = industry?.hyzx ?? []
      if (segments.length) {
        return [{
          code: cc,
          reportDate: String(segments[0]?.REPORT_DATE ?? segments[0]?.END_DATE ?? '').slice(0, 10),
          items: segments.slice(0, 8).map(it => ({
            name: String(it.BOARD_NAME ?? it.INDUSTRY_NAME ?? it.ITEM_NAME ?? ''),
            type: String(it.INDUSTRY_TYPE ?? it.TYPE ?? ''),
            revenue: safeFloat(it.OPERATE_INCOME ?? it.MAIN_BUSINESS_INCOME ?? it.REVENUE),
            revenuePct: safeFloat(it.INCOME_RATIO ?? it.RATIO),
            grossMargin: safeFloat(it.GROSS_PROFIT_RATIO ?? it.GROSS_MARGIN),
          })),
          totalRevenue: safeFloat(segments[0]?.TOTAL_OPERATE_INCOME ?? segments[0]?.MAIN_BUSINESS_INCOME),
        }]
      }

      const profile = await fetchF10Profile(cc)
      const text = profile?.[0]?.businessScope || profile?.[0]?.mainBusiness
      if (!text) return null
      return [{
        code: cc,
        reportDate: profile?.[0]?.listingDate ?? '',
        items: [{ name: '主营业务', type: '概要', revenue: null, revenuePct: null, grossMargin: null }],
        totalRevenue: null,
        summary: text,
      }]
    } catch { return null }
  }

  p.topCustomerSupplier = async function topCustomerSupplier(code: string, direction = 'customer') {
    try {
      const cc = c(code)
      const reports = direction === 'customer'
        ? ['RPT_F10_PROFIT_CUSTOMER', 'RPT_TOPCUSTOMER', 'RPT_DMSK_FN_CUSTSUPPLIER']
        : ['RPT_F10_PROFIT_SUPPLIER', 'RPT_TOPSUPPLIER', 'RPT_DMSK_FN_CUSTSUPPLIER']
      const items = await dcFirst(this, reports, `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        direction,
        name: String(it.CUSTOMER_NAME ?? it.SUPPLIER_NAME ?? it.PARTNER_NAME ?? ''),
        amount: safeFloat(it.TRADE_AMOUNT ?? it.OPERATE_INCOME ?? it.AMOUNT),
        ratio: safeFloat(it.TRADE_RATIO ?? it.RATIO),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.actualController = async function actualController(code: string) {
    try {
      const cc = c(code)
      const profile = await fetchF10Profile(cc)
      const holderRows = await fetchF10Shareholders(cc)
      const holder = holderRows?.[0] as Record<string, unknown> | undefined
      const topList = holder?.top10Shareholders as Record<string, unknown>[] | undefined
      const top = topList?.[0]
      const p0 = profile?.[0]
      if (!p0 && !top) return null
      return [{
        code: cc,
        name: String(p0?.chairman || top?.name || ''),
        type: top?.shareType ? String(top.shareType) : '控制股东',
        ratio: safeFloat(top?.sharePct),
        reportDate: String(holder?.reportDate ?? p0?.listingDate ?? ''),
      }]
    } catch { return null }
  }

  p.subsidiaries = async function subsidiaries(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_SUBSIDIARY_INFO', 'RPT_F10_SUBSIDIARY'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        subsidiaryName: String(it.SUBSIDIARY_NAME ?? it.ORG_NAME ?? ''),
        holdRatio: safeFloat(it.HOLD_RATIO ?? it.SHARE_RATIO),
        business: String(it.BUSINESS_NATURE ?? it.MAIN_BUSINESS ?? ''),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.relatedPartyTrades = async function relatedPartyTrades(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_RELATED_PARTY_TRADE', 'RPT_F10_RELATEDTRADE'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        partyName: String(it.RELATED_PARTY_NAME ?? it.PARTY_NAME ?? ''),
        tradeType: String(it.TRADE_TYPE ?? it.TRANSACTION_TYPE ?? ''),
        amount: safeFloat(it.TRADE_AMOUNT ?? it.AMOUNT),
        reportDate: String(it.REPORT_DATE ?? it.ANN_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.rdInvestment = async function rdInvestment(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_RD_INVEST', 'RPT_F10_RDINVEST'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        rdExpense: safeFloat(it.RD_EXPENSE ?? it.RESEARCH_EXPENSE),
        rdRatio: safeFloat(it.RD_RATIO ?? it.RD_EXPENSE_RATIO),
        rdStaff: safeFloat(it.RD_STAFF_NUM ?? it.RD_EMPLOYEE),
      }))
    } catch { return null }
  }

  p.maEvents = async function maEvents(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_MA_EVENT', 'RPT_F10_MERGER'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        title: String(it.EVENT_TITLE ?? it.MA_TITLE ?? it.TITLE ?? ''),
        eventType: String(it.EVENT_TYPE ?? it.MA_TYPE ?? ''),
        amount: safeFloat(it.TRADE_AMOUNT ?? it.MA_AMOUNT),
        date: String(it.ANN_DATE ?? it.EVENT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.employeeComposition = async function employeeComposition(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_EMPLOYEE_COMPOSITION', 'RPT_F10_EMPLOYEE'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        category: String(it.EMPLOYEE_TYPE ?? it.CATEGORY ?? it.EDUCATION ?? ''),
        count: safeFloat(it.EMPLOYEE_NUM ?? it.EMP_NUM),
        ratio: safeFloat(it.EMPLOYEE_RATIO ?? it.RATIO),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.institutionalVisits = async function institutionalVisits(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_INST_VISIT', 'RPT_F10_INSTITUTIONAL_VISIT'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        date: String(it.RECEIVE_DATE ?? it.VISIT_DATE ?? '').slice(0, 10),
        orgName: String(it.ORG_NAME ?? it.INSTITUTION_NAME ?? ''),
        participants: String(it.PARTICIPANTS ?? it.VISITOR ?? ''),
        content: String(it.RESEARCH_CONTENT ?? it.CONTENT ?? ''),
      }))
    } catch { return null }
  }

  p.peerCompanies = async function peerCompanies(code: string) {
    try {
      const cc = c(code)
      const prof = await this.profile?.(cc)
      const industry = prof?.[0]?.industry ?? ''
      if (!industry) return null
      const list = await this.stockList?.('all')
      if (!list?.length) return null
      return list
        .filter(s => s.code !== cc && (s.industry === industry || s.industry.includes(industry) || industry.includes(s.industry)))
        .slice(0, 30)
        .map(s => ({
          code: cc, peerCode: s.code, peerName: s.name, industry: s.industry, reason: '同行业',
        }))
    } catch { return null }
  }
}

declare module './eastmoney.js' {
  interface EastMoneyDriver {
    mainBusiness(code: string): Promise<Record<string, unknown>[] | null>
    topCustomerSupplier(code: string, direction?: string): Promise<Record<string, unknown>[] | null>
    actualController(code: string): Promise<Record<string, unknown>[] | null>
    subsidiaries(code: string): Promise<Record<string, unknown>[] | null>
    relatedPartyTrades(code: string): Promise<Record<string, unknown>[] | null>
    rdInvestment(code: string): Promise<Record<string, unknown>[] | null>
    maEvents(code: string): Promise<Record<string, unknown>[] | null>
    employeeComposition(code: string): Promise<Record<string, unknown>[] | null>
    institutionalVisits(code: string): Promise<Record<string, unknown>[] | null>
    peerCompanies(code: string): Promise<Record<string, unknown>[] | null>
  }
}
