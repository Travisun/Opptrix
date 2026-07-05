import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'
import { fetchEmWebPage, fetchF10Financials, fetchF10Profile, fetchF10Shareholders } from '../../api/f10.js'
import type { EastMoneyDriver } from '../../driver.js'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = Driver.prototype as any

  /**
   * 获取公司主营业务构成
   * 对应 Python: 东财 F10 行业分析数据
   * 数据源: 东财 F10 IndustryAnalysis 页面 + fallback 到 push2 profile
   * @param code - 股票代码
   * @returns 包含 reportDate/items（name/type/revenue/revenuePct/grossMargin）/totalRevenue 的数组，或 null
   * 数据清洗: 优先使用 IndustryAnalysis 页面的 hyzx 数据（最多 8 条业务分部）；无数据时 fallback 到 F10 profile 的主营业务概要文本
   */
  p.mainBusiness = async function mainBusiness(code: string) {
    try {
      const cc = c(code)
      const industry = await fetchEmWebPage<{ hyzx?: Record<string, unknown>[] }>('IndustryAnalysis', cc)
      const segments = industry?.hyzx ?? []
      if (segments.length) {
        return [{
          code: cc,
          reportDate: String(segments[0]?.REPORT_DATE ?? segments[0]?.END_DATE ?? '').slice(0, 10),
          items: segments.slice(0, 8).map((it: Record<string, unknown>) => ({
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

  /**
   * 获取公司前五大客户/供应商
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_F10_PROFIT_CUSTOMER / RPT_TOPCUSTOMER / RPT_F10_PROFIT_SUPPLIER 等）
   * @param code - 股票代码
   * @param direction - 查询方向: 'customer'（前五大客户）| 'supplier'（前五大供应商），默认 'customer'
   * @returns 包含 code/direction/name/amount/ratio/reportDate 的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称（dcFirst）；字段名存在多种命名变体（CUSTOMER_NAME/PARTNER_NAME 等），统一映射
   */
  p.topCustomerSupplier = async function topCustomerSupplier(code: string, direction = 'customer') {
    try {
      const cc = c(code)
      const reports = direction === 'customer'
        ? ['RPT_F10_PROFIT_CUSTOMER', 'RPT_TOPCUSTOMER', 'RPT_DMSK_FN_CUSTSUPPLIER']
        : ['RPT_F10_PROFIT_SUPPLIER', 'RPT_TOPSUPPLIER', 'RPT_DMSK_FN_CUSTSUPPLIER']
      const items = await dcFirst(this, reports, `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        direction,
        name: String(it.CUSTOMER_NAME ?? it.SUPPLIER_NAME ?? it.PARTNER_NAME ?? ''),
        amount: safeFloat(it.TRADE_AMOUNT ?? it.OPERATE_INCOME ?? it.AMOUNT),
        ratio: safeFloat(it.TRADE_RATIO ?? it.RATIO),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * 获取公司实际控制人信息
   * 对应 Python: 东财 F10 股东研究数据
   * 数据源: 东财 F10 profile + shareholders 数据
   * @param code - 股票代码
   * @returns 包含 code/name（实际控制人姓名）/type（股东类型）/ratio（持股比例）/reportDate 的数组，或 null
   * 数据清洗: 综合 F10 profile（董事长）和十股东列表（第一大股东）；优先取十股东的 name 和 shareType
   */
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

  /**
   * 获取公司控股子公司列表
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_SUBSIDIARY_INFO / RPT_F10_SUBSIDIARY）
   * @param code - 股票代码
   * @returns 包含 code/subsidiaryName/holdRatio/business/reportDate 的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称；字段名变体 SUBSIDIARY_NAME/ORG_NAME 统一映射
   */
  p.subsidiaries = async function subsidiaries(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_SUBSIDIARY_INFO', 'RPT_F10_SUBSIDIARY'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        subsidiaryName: String(it.SUBSIDIARY_NAME ?? it.ORG_NAME ?? ''),
        holdRatio: safeFloat(it.HOLD_RATIO ?? it.SHARE_RATIO),
        business: String(it.BUSINESS_NATURE ?? it.MAIN_BUSINESS ?? ''),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * 获取公司关联交易明细
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_RELATED_PARTY_TRADE / RPT_F10_RELATEDTRADE）
   * @param code - 股票代码
   * @returns 包含 code/partyName/tradeType/amount/reportDate 的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称；字段名变体 RELATED_PARTY_NAME/PARTY_NAME 统一映射
   */
  p.relatedPartyTrades = async function relatedPartyTrades(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_RELATED_PARTY_TRADE', 'RPT_F10_RELATEDTRADE'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        partyName: String(it.RELATED_PARTY_NAME ?? it.PARTY_NAME ?? ''),
        tradeType: String(it.TRADE_TYPE ?? it.TRANSACTION_TYPE ?? ''),
        amount: safeFloat(it.TRADE_AMOUNT ?? it.AMOUNT),
        reportDate: String(it.REPORT_DATE ?? it.ANN_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * 获取公司研发投入数据
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_RD_INVEST / RPT_F10_RDINVEST）
   * @param code - 股票代码
   * @returns 包含 code/reportDate/rdExpense（研发费用）/rdRatio（研发占比）/rdStaff（研发人员数）的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称；字段名变体 RD_EXPENSE/RESEARCH_EXPENSE 等统一映射
   */
  p.rdInvestment = async function rdInvestment(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_RD_INVEST', 'RPT_F10_RDINVEST'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        rdExpense: safeFloat(it.RD_EXPENSE ?? it.RESEARCH_EXPENSE),
        rdRatio: safeFloat(it.RD_RATIO ?? it.RD_EXPENSE_RATIO),
        rdStaff: safeFloat(it.RD_STAFF_NUM ?? it.RD_EMPLOYEE),
      }))
    } catch { return null }
  }

  /**
   * 获取公司重大资产重组/并购事件
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_MA_EVENT / RPT_F10_MERGER）
   * @param code - 股票代码
   * @returns 包含 code/title/eventType/amount/date 的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称；字段名变体 EVENT_TITLE/MA_TITLE/TITLE 等统一映射
   */
  p.maEvents = async function maEvents(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_MA_EVENT', 'RPT_F10_MERGER'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        title: String(it.EVENT_TITLE ?? it.MA_TITLE ?? it.TITLE ?? ''),
        eventType: String(it.EVENT_TYPE ?? it.MA_TYPE ?? ''),
        amount: safeFloat(it.TRADE_AMOUNT ?? it.MA_AMOUNT),
        date: String(it.ANN_DATE ?? it.EVENT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * 获取公司员工构成数据
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_EMPLOYEE_COMPOSITION / RPT_F10_EMPLOYEE）
   * @param code - 股票代码
   * @returns 包含 code/category（员工类别/学历）/count（人数）/ratio（占比）/reportDate 的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称；字段名变体 EMPLOYEE_TYPE/CATEGORY/EDUCATION 等统一映射
   */
  p.employeeComposition = async function employeeComposition(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_EMPLOYEE_COMPOSITION', 'RPT_F10_EMPLOYEE'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        category: String(it.EMPLOYEE_TYPE ?? it.CATEGORY ?? it.EDUCATION ?? ''),
        count: safeFloat(it.EMPLOYEE_NUM ?? it.EMP_NUM),
        ratio: safeFloat(it.EMPLOYEE_RATIO ?? it.RATIO),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * 获取公司机构调研记录
   * 对应 Python: 东财 datacenter 报表数据
   * 数据源: datacenter.eastmoney.com（RPT_INST_VISIT / RPT_F10_INSTITUTIONAL_VISIT）
   * @param code - 股票代码
   * @returns 包含 code/date/orgName（调研机构）/participants（参与人员）/content（调研内容）的数组，或 null
   * 数据清洗: 按优先级尝试多个报表名称；字段名变体 ORG_NAME/INSTITUTION_NAME 等统一映射
   */
  p.institutionalVisits = async function institutionalVisits(code: string) {
    try {
      const cc = c(code)
      const items = await dcFirst(this, ['RPT_INST_VISIT', 'RPT_F10_INSTITUTIONAL_VISIT'], `(SECURITY_CODE="${cc}")`)
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        date: String(it.RECEIVE_DATE ?? it.VISIT_DATE ?? '').slice(0, 10),
        orgName: String(it.ORG_NAME ?? it.INSTITUTION_NAME ?? ''),
        participants: String(it.PARTICIPANTS ?? it.VISITOR ?? ''),
        content: String(it.RESEARCH_CONTENT ?? it.CONTENT ?? ''),
      }))
    } catch { return null }
  }

  /**
   * 获取同行业可比公司列表
   * 对应 Python: 无直接对应 AKShare 接口，东财原生实现
   * 数据源: 复用 profile（获取行业）+ stockList（获取全市场列表）进行匹配
   * @param code - 股票代码
   * @returns 包含 code/peerCode/peerName/industry/reason='同行业' 的数组（最多 30 家），或 null
   * 数据清洗: 通过 profile 获取当前股票行业属性；在 stockList 中筛选相同/包含行业关系的公司；双向包含匹配（A 包含 B 或 B 包含 A）
   */
  p.peerCompanies = async function peerCompanies(code: string) {
    try {
      const cc = c(code)
      const prof = await this.profile?.(cc)
      const industry = prof?.[0]?.industry ?? ''
      if (!industry) return null
      const list = await this.stockList?.('all')
      if (!list?.length) return null
      return list
        .filter((s: { code: string; industry?: string }) => s.code !== cc && s.industry != null && (s.industry === industry || s.industry.includes(industry) || industry.includes(s.industry)))
        .slice(0, 30)
        .map((s: { code: string; name: string; industry?: string }) => ({
          code: cc, peerCode: s.code, peerName: s.name, industry: s.industry, reason: '同行业',
        }))
    } catch { return null }
  }
}

declare module '../../driver.js' {
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
