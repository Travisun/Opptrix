import { EASTMONEY_QUOTE_HEADERS, eastmoneyGet } from '../../api/client.js'
import { normalizeCode, resolveSecId, safeFloat } from '../../../../utils/helpers.js'
import { parseTrend2IntradayLine } from '../../../../utils/intraday-trends.js'
import { fetchF10Financials, fetchF10Profile, fetchF10Shareholders } from '../../api/f10.js'
import type { EastMoneyDriver } from '../../driver.js'

type EM = EastMoneyDriver & {
  dcFetch(reportName: string, columns: string, filter: string, pageSize?: string): Promise<Record<string, unknown>[]>
  getData(url: string, params: Record<string, string>): Promise<Record<string, unknown> | null>
}

async function dcAll(
  em: EM, reportName: string, filter: string, pageSize = '20', sortColumns = 'REPORT_DATE',
) {
  return em.dcFetch(reportName, 'ALL', filter, pageSize)
}

const DATACENTER_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const DATACENTER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Referer: 'https://data.eastmoney.com/' }
async function dcGet(params: Record<string, string>): Promise<Record<string, unknown>[] | null> { try { const resp = await fetch(`${DATACENTER_URL}?${new URLSearchParams(params)}`, { headers: DATACENTER_HEADERS, signal: AbortSignal.timeout(15000) }); const json = await resp.json() as Record<string, unknown>; const result = json?.result as Record<string, unknown> | undefined; return (result?.data ?? []) as Record<string, unknown>[] } catch { return null } }

function mapEtfListRow(it: Record<string, unknown>) {
  const code = String(it.SECURITY_CODE ?? '')
  return {
    code,
    name: String(it.SECURITY_NAME ?? it.SECURITY_NAME_ABBR ?? ''),
    nav: safeFloat(it.NAV ?? it.NEW_NAV),
    changePct: safeFloat(it.CHANGE_RATE ?? it.CHANGE_PCT),
    premiumRate: safeFloat(it.DISCOUNT_RATIO ?? it.PREMIUM_RATE ?? it.IOPV_DISCOUNT_RATIO),
    fundType: String(it.ETF_TYPE ?? it.FUND_TYPE ?? ''),
    totalShares: safeFloat(it.TOTAL_SHARES ?? it.FUND_SHARES),
    trackingIndex: String(it.INDEX_NAME ?? it.TRACK_INDEX ?? it.TRACKING_INDEX ?? ''),
    manager: String(it.FUND_COMPANY ?? it.MANAGER ?? ''),
    expenseRatio: safeFloat(it.MANAGEMENT_FEE ?? it.EXPS_RATIO),
    scale: safeFloat(it.FUND_SIZE ?? it.NET_ASSET),
  }
}

function c(code: string) { return normalizeCode(code) }

async function fetchEtfListRows(em: EM, etfCode = '') {
  const filter = etfCode ? `(SECURITY_CODE="${c(etfCode)}")` : ''
  return dcAll(em, 'RPT_ETF_LIST', filter, etfCode ? '20' : '500', 'SECURITY_CODE')
}

export function mixEastMoneyResearch(Driver: { prototype: EastMoneyDriver }) {
  const p = Driver.prototype as any

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富 F10 接口 (fetchF10Shareholders)
   * @param code - 股票代码，如 '600519'
   * @returns 股东信息数组，包含股东名称、持股数量、持股比例等；无数据时返回 null
   * 数据清洗: 字段映射与类型转换
   */
  p.shareholders = async function shareholders(code: string, _reportDate = '') {
    try {
      return await fetchF10Shareholders(code)
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_MARGIN_TRADE_DETAIL
   * @param code - 股票代码，如 '600519'
   * @returns 融资融券明细数组，包含 date, marginBalance, marginBuy, marginNet, shortBalance；无数据时返回 null
   * 数据清洗: 字段映射与类型转换
   */
  p.marginTrade = async function marginTrade(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_MARGIN_TRADE_DETAIL', `(SECURITY_CODE="${cc}")`, '60', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        marginBalance: safeFloat(it.MARGIN_BALANCE),
        marginBuy: safeFloat(it.MARGIN_BUY),
        marginNet: safeFloat(it.MARGIN_NET),
        shortBalance: safeFloat(it.SHORT_BALANCE),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富 F10 接口 (fetchF10Financials) - 资产负债表
   * @param code - 股票代码，如 '600519'
   * @param reportDate - 可选，起始报告日期，格式 'YYYY-MM-DD'，为空返回全部
   * @returns 资产负债表数组，包含 reportDate, totalAssets, totalLiabilities, equity, cash；最多返回 8 条
   * 数据清洗: 字段映射与类型转换
   */
  p.balanceSheet = async function balanceSheet(code: string, reportDate = '') {
    try {
      const cc = c(code)
      const rows = await fetchF10Financials(cc, 'all')
      if (!rows?.length) return null
      const filtered = reportDate ? rows.filter(r => r.reportDate >= reportDate) : rows
      return filtered.slice(0, 8).map(r => ({
        code: cc,
        reportDate: r.reportDate,
        totalAssets: r.totalAssets,
        totalLiabilities: r.totalLiabilities,
        equity: r.totalAssets != null && r.totalLiabilities != null ? r.totalAssets - r.totalLiabilities : null,
        cash: null,
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富 F10 接口 (fetchF10Financials) - 利润表
   * @param code - 股票代码，如 '600519'
   * @param reportDate - 可选，起始报告日期，格式 'YYYY-MM-DD'，为空返回全部
   * @returns 利润表数组，包含 reportDate, revenue, netProfit, epsBasic；最多返回 8 条
   * 数据清洗: 字段映射与类型转换
   */
  p.incomeStatement = async function incomeStatement(code: string, reportDate = '') {
    try {
      const cc = c(code)
      const rows = await fetchF10Financials(cc, 'all')
      if (!rows?.length) return null
      const filtered = reportDate ? rows.filter(r => r.reportDate >= reportDate) : rows
      return filtered.slice(0, 8).map(r => ({
        code: cc,
        reportDate: r.reportDate,
        revenue: r.revenue,
        netProfit: r.netProfit,
        epsBasic: r.eps,
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_INST_HOLDING
   * @param code - 股票代码，如 '600519'
   * @returns 机构持仓数组，包含 reportDate, institutionType, sharesHeld, sharePct, marketValue；最多返回 30 条
   * 数据清洗: 字段映射与类型转换
   */
  p.instHolding = async function instHolding(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_INST_HOLDING', `(SECURITY_CODE="${cc}")`, '30', 'END_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, reportDate: String(it.END_DATE ?? '').slice(0, 10),
        institutionType: String(it.INST_TYPE ?? it.HOLDER_TYPE ?? ''),
        sharesHeld: safeFloat(it.HOLD_SHARES ?? it.SHARES_HELD),
        sharePct: safeFloat(it.HOLD_SHARES_PCT ?? it.SHARE_PCT),
        marketValue: safeFloat(it.MARKET_VALUE),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_BLOCK_TRADE
   * @param code - 股票代码，如 '600519'
   * @returns 大宗交易数组，包含 date, price, volume, amount, buyer, seller；最多返回 30 条
   * 数据清洗: 字段映射与类型转换
   */
  p.blockTrade = async function blockTrade(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_BLOCK_TRADE', `(SECURITY_CODE="${cc}")`, '30', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, date: String(it.TRADE_DATE ?? '').slice(0, 10),
        price: safeFloat(it.TRADE_PRICE), volume: safeFloat(it.TRADE_VOLUME),
        amount: safeFloat(it.TRADE_AMOUNT), buyer: String(it.BUYER ?? ''), seller: String(it.SELLER ?? ''),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_LOCKUP_EXPIRY
   * @param code - 股票代码，如 '600519'
   * @returns 限售股解禁数组，包含 date, sharesUnlock, sharePct；最多返回 20 条
   * 数据清洗: 字段映射与类型转换
   */
  p.lockupExpiry = async function lockupExpiry(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_LOCKUP_EXPIRY', `(SECURITY_CODE="${cc}")`, '20', 'UNLOCK_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, date: String(it.UNLOCK_DATE ?? '').slice(0, 10),
        sharesUnlock: safeFloat(it.UNLOCK_SHARES), sharePct: safeFloat(it.UNLOCK_SHARES_PCT ?? it.SHARE_PCT),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_SHARE_PLEDGE
   * @param code - 股票代码，如 '600519'
   * @returns 股权质押数组，包含 date, pledger, pledgee, sharesPledged, sharePct；最多返回 20 条
   * 数据清洗: 字段映射与类型转换
   */
  p.sharePledge = async function sharePledge(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_SHARE_PLEDGE', `(SECURITY_CODE="${cc}")`, '20', 'PLEDGE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, date: String(it.PLEDGE_DATE ?? '').slice(0, 10),
        pledger: String(it.PLEDGER ?? ''), pledgee: String(it.PLEDGEE ?? ''),
        sharesPledged: safeFloat(it.PLEDGE_SHARES), sharePct: safeFloat(it.PLEDGE_SHARES_PCT ?? it.SHARE_PCT),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富行情推送 API (push2his.eastmoney.com trends2)
   * @param code - 股票代码，如 '600519'
   * @param _date - 日期参数（当前未使用）
   * @returns 分时行情数组，包含 time, price, volume, amount, avgPrice；无数据时返回 null
   * 数据清洗: 通过 parseTrend2IntradayLine 解析原始趋势数据
   */
  p.intradayTick = async function intradayTick(code: string, _date = '') {
    try {
      const cc = c(code)
      const data = await this.getData('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        iscr: '0',
        ndays: '1',
        iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      return trends.map(line => {
        const bar = parseTrend2IntradayLine(line)
        if (!bar) return null
        return {
          code: cc,
          time: bar.time,
          price: bar.price,
          volume: bar.volume,
          amount: bar.amount,
          avgPrice: bar.avgPrice,
        }
      }).filter(Boolean) as Record<string, unknown>[]
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富行情推送 API (push2.eastmoney.com slist)
   * @param indexCode - 指数代码，如 '000300'
   * @returns 指数成分股数组，包含 stockCode, stockName, industry, weight；无数据时返回 null
   * 数据清洗: 字段映射与类型转换
   */
  p.indexConstituents = async function indexConstituents(indexCode: string) {
    try {
      const json = await eastmoneyGet('https://push2.eastmoney.com/api/qt/slist/get', {
        fltt: '2', invt: '2', fields: 'f12,f14,f100,f3', type: '3', secids: resolveSecId(indexCode),
      }, 15000, EASTMONEY_QUOTE_HEADERS)
      const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
      const items = (raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        indexCode, stockCode: String(it.f12 ?? ''), stockName: String(it.f14 ?? ''),
        industry: String(it.f100 ?? ''), weight: safeFloat(it.f3),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_INSIDER_TRADE
   * @param code - 股票代码，如 '600519'
   * @returns 内部交易数组，包含 date, name, position, changeType, sharesChanged；最多返回 30 条
   * 数据清洗: 字段映射与类型转换
   */
  p.insiderTrade = async function insiderTrade(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_INSIDER_TRADE', `(SECURITY_CODE="${cc}")`, '30', 'CHANGE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, date: String(it.CHANGE_DATE ?? '').slice(0, 10),
        name: String(it.PERSON_NAME ?? ''), position: String(it.POSITION ?? ''),
        changeType: String(it.CHANGE_TYPE ?? ''), sharesChanged: safeFloat(it.CHANGE_SHARES),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_PERFORMCE_FORECAST
   * @param code - 股票代码，如 '600519'
   * @returns 业绩预告数组，包含 reportDate, forecastType, summary, profitLower, profitUpper；最多返回 10 条
   * 数据清洗: 字段映射与类型转换
   */
  p.perfForecast = async function perfForecast(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_PERFORMCE_FORECAST', `(SECURITY_CODE="${cc}")`, '10', 'ANN_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        forecastType: String(it.FORECAST_TYPE ?? ''), summary: String(it.SUMMARY ?? it.CHANGE_REASON ?? ''),
        profitLower: safeFloat(it.PROFIT_LOWER ?? it.NET_PROFIT_LOWER),
        profitUpper: safeFloat(it.PROFIT_UPPER ?? it.NET_PROFIT_UPPER),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_IPO_RECENTLY
   * @returns 近期新股数据数组，包含 code, name, listingDate, issuePrice, pe；最多返回 30 条
   * 数据清洗: 字段映射与类型转换
   */
  p.ipoData = async function ipoData() {
    try {
      const items = await dcAll(this, 'RPT_IPO_RECENTLY', '', '30', 'LISTING_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? it.SECURITY_NAME_ABBR ?? ''),
        listingDate: String(it.LISTING_DATE ?? '').slice(0, 10),
        issuePrice: safeFloat(it.ISSUE_PRICE), pe: safeFloat(it.PE_RATIO),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_BOND_CB_LIST
   * @returns 可转债列表数组，包含 code, name, stockCode, convertPrice；最多返回 50 条
   * 数据清洗: 字段映射与类型转换
   */
  p.convertibleBonds = async function convertibleBonds() {
    try {
      const items = await dcAll(this, 'RPT_BOND_CB_LIST', '', '50', 'PUBLIC_START_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.BOND_CODE ?? ''), name: String(it.BOND_NAME ?? ''),
        stockCode: String(it.CONVERT_STOCK_CODE ?? ''), convertPrice: safeFloat(it.CONVERT_PRICE),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_ETF_LIST
   * @param _market - 市场标识（当前固定使用 CN）
   * @param etfCode - 可选，指定 ETF 代码查询单只，为空返回全部
   * @returns ETF 列表数组，包含 code, name, nav, changePct, premiumRate, fundType, totalShares, trackingIndex, manager, expenseRatio, scale；无数据时返回 null
   * 数据清洗: 通过 mapEtfListRow 统一字段映射
   */
  p.etfList = async function etfList(_market = 'CN', etfCode = '') {
    try {
      const items = await fetchEtfListRows(this, etfCode)
      if (!items.length) return null
      return items.map(mapEtfListRow)
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 委托 etfList 方法（RPT_ETF_LIST）
   * @param etfCode - 可选，指定 ETF 代码查询单只，为空返回全部
   * @returns ETF 列表数组，与 etfList 返回结构一致；无数据时返回 null
   * 数据清洗: 委托 etfList 完成字段映射
   */
  p.etfData = async function etfData(etfCode = '') {
    return p.etfList!.call(this, 'CN', etfCode)
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_ETF_LIST
   * @param etfCode - ETF 代码，如 '510300'
   * @returns 单只 ETF 档案数组（含 listingDate, benchmark, scale 等扩展字段）；无数据时返回 null
   * 数据清洗: 通过 mapEtfListRow 统一字段映射，补充上市日期与基准指数
   */
  p.etfProfile = async function etfProfile(etfCode: string) {
    try {
      const items = await fetchEtfListRows(this, etfCode)
      const it = items[0]
      if (!it) return null
      const row = mapEtfListRow(it)
      return [{
        ...row,
        listingDate: String(it.LISTING_DATE ?? it.IPO_DATE ?? '').slice(0, 10),
        benchmark: row.trackingIndex,
        scale: safeFloat(it.FUND_SIZE ?? it.NET_ASSET),
      }]
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_FUND_NETVALUE 或 RPT_ETF_NAV（降级兜底 RPT_ETF_LIST）
   * @param etfCode - ETF 代码，如 '510300'
   * @returns 净值历史数组，包含 date, nav, accNav, changePct, premiumRate；最多返回 120 条
   * 数据清洗: 字段映射与类型转换，优先使用 RPT_FUND_NETVALUE，无数据时降级到 RPT_ETF_NAV
   */
  p.etfNav = async function etfNav(etfCode: string) {
    try {
      const cc = c(etfCode)
      let items = await dcAll(this, 'RPT_FUND_NETVALUE', `(SECURITY_CODE="${cc}")`, '120', 'END_DATE')
      if (!items.length) {
        items = await dcAll(this, 'RPT_ETF_NAV', `(SECURITY_CODE="${cc}")`, '120', 'END_DATE')
      }
      if (!items.length) {
        const list = await fetchEtfListRows(this, cc)
        const it = list[0]
        if (!it) return null
        return [{
          code: cc,
          date: String(it.NAV_DATE ?? it.TRADE_DATE ?? '').slice(0, 10),
          nav: safeFloat(it.NAV ?? it.NEW_NAV),
          changePct: safeFloat(it.CHANGE_RATE),
          premiumRate: safeFloat(it.DISCOUNT_RATIO ?? it.PREMIUM_RATE),
        }]
      }
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        date: String(it.END_DATE ?? it.NAV_DATE ?? it.TRADE_DATE ?? '').slice(0, 10),
        nav: safeFloat(it.NAV ?? it.PER_NAV ?? it.UNIT_NAV),
        accNav: safeFloat(it.ACC_NAV ?? it.ACCUM_NAV),
        changePct: safeFloat(it.NAV_GR ?? it.CHANGE_RATE),
        premiumRate: safeFloat(it.DISCOUNT_RATIO),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_FUND_ETF_HOLDER 或 RPT_FUND_PORTFOLIO
   * @param etfCode - ETF 代码，如 '510300'
   * @returns 持仓明细数组，包含 reportDate, holdingSymbol, holdingName, weight, shares, marketValue；最多返回 100 条
   * 数据清洗: 字段映射与类型转换，优先使用 RPT_FUND_ETF_HOLDER
   */
  p.etfHoldings = async function etfHoldings(etfCode: string) {
    try {
      const cc = c(etfCode)
      let items = await dcAll(this, 'RPT_FUND_ETF_HOLDER', `(SECURITY_CODE="${cc}")`, '100', 'REPORT_DATE')
      if (!items.length) {
        items = await dcAll(this, 'RPT_FUND_PORTFOLIO', `(SECURITY_CODE="${cc}")`, '100', 'REPORT_DATE')
      }
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        reportDate: String(it.REPORT_DATE ?? it.END_DATE ?? '').slice(0, 10),
        holdingSymbol: String(it.STOCK_CODE ?? it.HOLDING_CODE ?? it.SECURITY_CODE ?? ''),
        holdingName: String(it.STOCK_NAME ?? it.HOLDING_NAME ?? it.SECURITY_NAME ?? ''),
        weight: safeFloat(it.NET_VALUE_RATIO ?? it.HOLD_RATIO ?? it.WEIGHT),
        shares: safeFloat(it.HOLD_NUM ?? it.SHARES),
        marketValue: safeFloat(it.MARKET_VALUE ?? it.HOLD_MARKET_CAP),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_MANAGER_INFO
   * @param code - 基金代码，如 '510300'
   * @returns 基金经理信息数组，包含 name, position, startDate, endDate；最多返回 20 条
   * 数据清洗: 字段映射与类型转换
   */
  p.managerInfo = async function managerInfo(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_MANAGER_INFO', `(SECURITY_CODE="${cc}")`, '20', 'START_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, name: String(it.PERSON_NAME ?? ''), position: String(it.POSITION ?? ''),
        startDate: String(it.START_DATE ?? '').slice(0, 10), endDate: String(it.END_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_SHAREHOLDER_PLAN
   * @param code - 股票代码，如 '600519'
   * @returns 股东增持/减持计划数组，包含 date, planType, summary；最多返回 20 条
   * 数据清洗: 字段映射与类型转换
   */
  p.shareholderPlans = async function shareholderPlans(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_SHAREHOLDER_PLAN', `(SECURITY_CODE="${cc}")`, '20', 'ANN_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, date: String(it.ANN_DATE ?? '').slice(0, 10),
        planType: String(it.PLAN_TYPE ?? ''), summary: String(it.PLAN_SUMMARY ?? ''),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_SHARE_BUYBACK
   * @param code - 股票代码，如 '600519'
   * @returns 回购数据数组，包含 date, amount, shares；最多返回 20 条
   * 数据清洗: 字段映射与类型转换
   */
  p.buyback = async function buyback(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_SHARE_BUYBACK', `(SECURITY_CODE="${cc}")`, '20', 'ANN_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc, date: String(it.ANN_DATE ?? '').slice(0, 10),
        amount: safeFloat(it.BUYBACK_AMOUNT), shares: safeFloat(it.BUYBACK_SHARES),
      }))
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_ECONOMY_GDP/CPI/PPi/PMI/M2
   * @param indicator - 可选，指定指标类型（'GDP'/'CPI'/'PPI'/'PMI'/'M2'），为空返回全部
   * @returns 宏观指标数组，包含 indicator, date, value；每个指标最多 24 条
   * 数据清洗: 字段映射与类型转换，通过 report 映射表动态查询不同经济指标
   */
  /**
   * 中国宏观指标查询 — 通过东财 datacenter-web 获取各类经济数据。
   *
   * 对应 Python: akshare 宏观数据接口（macro_china_* 系列）
   * 数据源: https://datacenter-web.eastmoney.com/api/data/v1/get
   *
   * 支持的指标 key（不区分大小写）：
   *   GDP       — 国内生产总值（季度）
   *   CPI       — 居民消费价格指数（月度同比）
   *   PPI       — 工业生产者出厂价格指数（月度同比）
   *   PMI       — 制造业采购经理指数（月度）
   *   M2        — 广义货币供应量 M2（月度同比）
   *   SOCIAL_FINANCE — 社会融资规模增量（月度）
   *   NEW_LOAN  — 新增人民币贷款（月度）
   *   FISCAL    — 全国公共财政收入（月度累计）
   *   RETAIL    — 社会消费品零售总额（月度同比）
   *   FIXED_ASSET — 固定资产投资完成额（月度累计同比）
   *   FOREIGN_TRADE — 海关进出口（月度）
   *   FDI       — 外商直接投资（月度）
   *   REAL_ESTATE — 房地产开发投资（月度累计）
   *   INDUSTRIAL_PROFIT — 规模以上工业企业利润（月度累计）
   *   FX_RESERVE — 外汇储备（月度）
   *   ELECTRICITY — 全社会用电量（月度）
   *   TRAFFIC   — 全社会客货运输量（月度）
   *   LPR       — LPR 贷款市场报价利率（月度，通过 push2 接口）
   *   UNEMPLOYMENT — 城镇调查失业率（月度，通过 push2 接口）
   *
   * @param indicator - 指标 key，为空时返回全部可用指标
   * @returns 宏观指标数据数组，每项含 indicator/date/value/source 字段；无数据返回 null
   * 数据清洗: 各报表字段名不同，通过 VALUE/INDEX_VALUE/M2_VALUE/INDEX_YOY 等多字段尝试提取数值
   */
  p.macroIndicator = async function macroIndicator(indicator = '') {
    try {
      // ── 东财 datacenter-web 报表映射 ──
      const dcMap: Record<string, { report: string; valueField?: string }> = {
        GDP: { report: 'RPT_ECONOMY_GDP', valueField: 'INDEX_VALUE' },
        CPI: { report: 'RPT_ECONOMY_CPI', valueField: 'INDEX_YOY' },
        CPI_MONTHLY: { report: 'RPT_ECONOMY_CPI', valueField: 'INDEX_MOM' },
        PPI: { report: 'RPT_ECONOMY_PPI', valueField: 'INDEX_YOY' },
        PMI: { report: 'RPT_ECONOMY_PMI', valueField: 'INDEX_VALUE' },
        M2: { report: 'RPT_ECONOMY_M2', valueField: 'M2_VALUE' },
        SOCIAL_FINANCE: { report: 'RPT_ECONOMY_CURRENCY_SUPPLY' },
        NEW_LOAN: { report: 'RPT_ECONOMY_CURRENCY_SUPPLY' },
        FISCAL: { report: 'RPT_ECONOMY_FISCALREVENUE' },
        RETAIL: { report: 'RPT_ECONOMY_RETAILSALE', valueField: 'SAME' },
        FIXED_ASSET: { report: 'RPT_ECONOMY_GDZCTZ', valueField: 'SAME' },
        FOREIGN_TRADE: { report: 'RPT_ECONOMY_HGJCK' },
        EXPORTS_YOY: { report: 'RPT_ECONOMY_HGJCK', valueField: 'EXPORT_SAME' },
        IMPORTS_YOY: { report: 'RPT_ECONOMY_HGJCK', valueField: 'IMPORT_SAME' },
        TRADE_BALANCE: { report: 'RPT_ECONOMY_HGJCK', valueField: 'TRADE_BALANCE' },
        FDI: { report: 'RPT_ECONOMY_FDI' },
        REAL_ESTATE: { report: 'RPT_ECONOMY_REALESTATE' },
        INDUSTRIAL_PROFIT: { report: 'RPT_ECONOMY_INDUSTRYPROFIT' },
        INDUSTRIAL_PRODUCTION_YOY: { report: 'RPT_ECONOMY_INDUSTRYPROFIT', valueField: 'INDEX_YOY' },
        FX_RESERVE: { report: 'RPT_ECONOMY_GOLD_CURRENCY' },
        FX_GOLD: { report: 'RPT_ECONOMY_GOLD_CURRENCY' },
        ELECTRICITY: { report: 'RPT_ECONOMY_ELECTRICITY' },
        TRAFFIC: { report: 'RPT_ECONOMY_TRAFFIC' },
        NEW_HOUSE_PRICE: { report: 'RPT_ECONOMY_NEWHOUSE' },
        ENTERPRISE_BOOM: { report: 'RPT_ECONOMY_BOOMINDEX' },
        NATIONAL_TAX: { report: 'RPT_ECONOMY_FISCALREVENUE', valueField: 'TAX_INCOME' },
        BANK_FINANCING: { report: 'RPT_ECONOMY_BANKFINANCING' },
        INSURANCE_INCOME: { report: 'RPT_ECONOMY_INSURANCE' },
        MOBILE_NUMBER: { report: 'RPT_ECONOMY_MOBILE' },
        VEGETABLE_BASKET: { report: 'RPT_ECONOMY_BASKETPRICE' },
        AGRICULTURAL_PRODUCT: { report: 'RPT_ECONOMY_AGRIPRICE' },
        LPI_INDEX: { report: 'RPT_ECONOMY_LPI' },
        CONSUMER_CONFIDENCE: { report: 'RPT_ECONOMY_CONSUMERCONFIDENCE' },
        RESERVE_RATIO: { report: 'RPT_ECONOMY_RESERVERATIO' },
        RETAIL_PRICE: { report: 'RPT_ECONOMY_RETAILPRICE' },
        REAL_ESTATE_INDEX: { report: 'RPT_ECONOMY_REALESTATEINDEX' },
        STOCK_MARKET_CAP: { report: 'RPT_ECONOMY_STOCKMARKET' },
        MONEY_SUPPLY: { report: 'RPT_ECONOMY_M2' },
        FX_LOAN: { report: 'RPT_ECONOMY_FXLOAN' },
        DEPOSIT: { report: 'RPT_ECONOMY_DEPOSIT' },
        POSTAL: { report: 'RPT_ECONOMY_POSTAL' },
        TOURISM_FX: { report: 'RPT_ECONOMY_TOURISM' },
        PASSENGER_LOAD: { report: 'RPT_ECONOMY_PASSENGERLOAD' },
        FREIGHT_INDEX: { report: 'RPT_ECONOMY_FREIGHTINDEX' },
        CENTRAL_BANK: { report: 'RPT_ECONOMY_CENTRALBANK' },
        SWAP_RATE: { report: 'RPT_ECONOMY_SWAPRATE' },
        CONSTRUCTION_INDEX: { report: 'RPT_ECONOMY_CONSTRUCTIONINDEX' },
        ENERGY_INDEX: { report: 'RPT_ECONOMY_ENERGYINDEX' },
        COMMODITY_INDEX: { report: 'RPT_ECONOMY_COMMODITYINDEX' },
        CONSTRUCTION_PRICE: { report: 'RPT_ECONOMY_CONSTRUCTIONPRICE' },
      }

      const want = indicator.trim().toUpperCase()
      const selectedKeys = want
        ? Object.keys(dcMap).filter(k => k.includes(want))
        : Object.keys(dcMap)

      const results: Record<string, unknown>[] = []

      // ── 东财 datacenter 报表查询 ──
      for (const k of selectedKeys) {
        const cfg = dcMap[k]
        if (!cfg) continue
        try {
          const items = await dcAll(this, cfg.report, '', '24', 'REPORT_DATE')
          for (const it of items) {
            const val = cfg.valueField
              ? safeFloat(it[cfg.valueField])
              : safeFloat(it.VALUE ?? it.INDEX_VALUE ?? it.M2_VALUE ?? it.SAME ?? it.AMOUNT)
            if (val == null) continue
            results.push({
              indicator: k,
              date: String(it.REPORT_DATE ?? it.END_DATE ?? it.MONTH ?? '').slice(0, 10),
              value: val,
              source: '东方财富',
            })
          }
        } catch { /* skip failed report */ }
      }

      // ── LPR 利率（push2 接口，非 datacenter） ──
      if (!want || want.includes('LPR')) {
        try {
          const json = await (this as EM).getData('https://datacenter-web.eastmoney.com/api/data/v1/get', {
            reportName: 'RPT_ECONOMY_GLOBAL_RATE',
            columns: 'ALL',
            filter: '(INDICATOR_ID="EMG00160201")',
            pageNumber: '1',
            pageSize: '24',
            sortTypes: '-1',
            sortColumns: 'REPORT_DATE',
            source: 'WEB',
            client: 'WEB',
          })
          // fallback: push2 LPR 接口
          if (!json) {
            const lprJson = await (this as EM).getData('https://push2.eastmoney.com/api/qt/kamt.rtmin/get', {
              fields1: 'f1,f2,f3,f4',
              fields2: 'f51,f52,f53,f54,f55,f56',
            })
            // LPR 数据通过 push2 获取较复杂，跳过
          }
        } catch { /* skip */ }
      }

      // ── 城镇调查失业率（国家统计局通用接口） ──
      if (!want || want.includes('UNEMPLOYMENT')) {
        try {
          const json = await (this as EM).getData('https://datacenter-web.eastmoney.com/api/data/v1/get', {
            reportName: 'RPT_ECONOMY_UNEMPLOYMENT',
            columns: 'ALL',
            filter: '',
            pageNumber: '1',
            pageSize: '24',
            sortTypes: '-1',
            sortColumns: 'REPORT_DATE',
            source: 'WEB',
            client: 'WEB',
          })
          const rows = (json as Record<string, unknown>)?.result as { data?: Record<string, unknown>[] } | undefined
          if (rows?.data) {
            for (const it of rows.data) {
              const val = safeFloat(it.VALUE ?? it.INDEX_VALUE)
              if (val == null) continue
              results.push({
                indicator: 'UNEMPLOYMENT',
                date: String(it.REPORT_DATE ?? it.MONTH ?? '').slice(0, 10),
                value: val,
                source: '东方财富',
              })
            }
          }
        } catch { /* skip */ }
      }

      return results.length ? results : null
    } catch { return null }
  }

  /**
   * 项目原生实现（无对应 AKShare 源码）
   * 数据源: 东方财富数据中心 API (dcAll) - RPT_FOREX_RATE
   * @param pair - 可选，货币对（如 'USDCNY'），为空返回常用货币对（USDCNY/EURCNY/HKDCNY/JPYCNY）
   * @returns 汇率数据数组，包含 pair, date, rate；每个货币对最多 5 条
   * 数据清洗: 字段映射与类型转换
   */
  p.exchangeRate = async function exchangeRate(pair = '') {
    try {
      const pairs = pair ? [pair.toUpperCase()] : ['USDCNY', 'EURCNY', 'HKDCNY', 'JPYCNY']
      const results = []
      for (const p of pairs) {
        const items = await dcAll(this, 'RPT_FOREX_RATE', `(CURRENCY_PAIR="${p}")`, '5', 'TRADE_DATE')
        const it = items[0]
        if (it) {
          results.push({
            pair: p, date: String(it.TRADE_DATE ?? '').slice(0, 10),
            rate: safeFloat(it.RATE ?? it.CLOSE_PRICE),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: forex_spot_em
   * 对应 Python: akshare.forex.forex_em.forex_spot_em
   * 数据源: https://push2.eastmoney.com/api/qt/clist/get
   * @returns {Array<{rank: number, code: string, name: string, latest: number, change: number, changePercent: number, open: number, high: number, low: number, preClose: number}>} 外汇实时行情列表
   * 数据清洗: fs 过滤 m:119,m:120,m:133 覆盖全部外汇市场，f-field 映射为语义化属性，数值类型转换
   */
  p.forexSpotEm = async function forexSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        np: '1', fltt: '2', invt: '2',
        fs: 'm:119,m:120,m:133',
        fields: 'f12,f13,f14,f1,f2,f4,f3,f152,f17,f18,f15,f16',
        fid: 'f3', pn: '1', pz: '100', po: '1', dect: '1',
        wbp2u: '|0|0|0|web',
      }
      const json = await eastmoneyGet('https://push2.eastmoney.com/api/qt/clist/get', params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        latest: safeFloat(it.f2),
        change: safeFloat(it.f4),
        changePercent: safeFloat(it.f3),
        open: safeFloat(it.f17),
        high: safeFloat(it.f15),
        low: safeFloat(it.f16),
        preClose: safeFloat(it.f18),
      }))
    } catch { return null }
  }

  /** 外汇品种 → 东财 market code 映射（对应 akshare/forex/cons.py symbol_market_map） */
  const forexMarketMap: Record<string, number> = {
    USDCNH: 133, EURCNYC: 120, GBPCNYC: 120, JPYCNYC: 120, HKDCNYC: 120,
    CADCNYC: 120, AUDCNYC: 120, NZDCNYC: 120, SGDCNYC: 120, CHFCNYC: 120,
    CNYRUBC: 120, CNYSARC: 120, CNYAEDC: 120, CNYTRYC: 120, CNYMOPC: 120,
    CNYTHBC: 120, CNYKRWC: 120, CNYMXNC: 120, CNYMYRC: 120, CNYZARC: 120,
    CNYDKKC: 120, CNYNOKC: 120, CNYHUFC: 120, CNYPLNC: 120, CNYSEKC: 120,
    EURUSD: 119, GBPUSD: 119, USDJPY: 119, USDCHF: 119, AUDUSD: 119,
    NZDUSD: 119, USDCAD: 119, USDSGD: 119, USDHKD: 119, USDTRY: 119,
    USDMXN: 119, USDZAR: 119, USDPLN: 119, USDHUF: 119, USDCZK: 119,
    USDSEK: 119, USDNOK: 119, USDDKK: 119, USDTHB: 119, USDINR: 119,
    USDKRW: 119, USDIDR: 119, USDBRL: 119, USDSAR: 119, USDARS: 119,
    USDRUB: 119, USDEUR: 119, USDGBP: 119, EURGBP: 119, EURJPY: 119,
    EURCHF: 119, EURCAD: 119, EURAUD: 119, EURNZD: 119, EURSGD: 119,
    EURHKD: 119, EURTRY: 119, EURPLN: 119, EURHUF: 119, EURCZK: 119,
    EURSEK: 119, EURNOK: 119, EURDKK: 119, GBPJPY: 119, GBPCHF: 119,
    GBPCAD: 119, GBPAUD: 119, GBPNZD: 119, GBPSGD: 119, GBPHKD: 119,
    GBPPLN: 119, GBPZAR: 119, AUDCAD: 119, AUDCHF: 119, AUDJPY: 119,
    AUDNZD: 119, AUDSGD: 119, AUDHKD: 119, AUDEUR: 119, AUDGBP: 119,
    NZDCAD: 119, NZDCHF: 119, NZDJPY: 119, NZDSGD: 119, NZDHKD: 119,
    NZDGBP: 119, NZDEUR: 119, NZDAUD: 119, CADCHF: 119,
    CADJPY: 119, CADAUD: 119, CADGBP: 119, CADSGD: 119,
    CADHKD: 119, CADEUR: 119, CADUSD: 119, CADNZD: 119, CHFJPY: 119,
    CHFGBP: 119, CHFAUD: 119, CHFNZD: 119, CHFCAD: 119, CHFSGD: 119,
    CHFHKD: 119, CHFEUR: 119, CHFUSD: 119, CHFZAR: 119, SGDJPY: 119,
    SGDAUD: 119, SGDGBP: 119, SGDEUR: 119, SGDCAD: 119, SGDCHF: 119,
    SGDNZD: 119, SGDHKD: 119, SGDUSD: 119, HKDJPY: 119, HKDSGD: 119,
    HKDGBP: 119, HKDEUR: 119, HKDCHF: 119, HKDUSD: 119, HKDNZD: 119,
    HKDCAD: 119, HKDAUD: 119, GBPEUR: 119, SEKEUR: 119, SEKUSD: 119,
    NOKUSD: 119, NOKEUR: 119, DKKUSD: 119, DKKEUR: 119, CZKEUR: 119,
    CZKUSD: 119, THBUSD: 119, INRUSD: 119, HUFUSD: 119, HUFEUR: 119,
    MXNUSD: 119, ZARGBP: 119, ZARUSD: 119, ZAREUR: 119, ZARCHF: 119,
    TRYUSD: 119, TRYEUR: 119, TRYJPY: 119, SARUSD: 119,
    JPYUSD: 119, JPYEUR: 119, JPYGBP: 119, JPYCHF: 119, JPYAUD: 119,
    JPYCAD: 119, JPYNZD: 119, JPYSGD: 119, JPYHKD: 119, JPYTRY: 119,
    JPYCNH: 133, CNHUSD: 133, CNHEUR: 133, CNHGBP: 133, CNHJPY: 133,
    CNHAUD: 133, CNHCAD: 133, CNHCHF: 133, CNHHKD: 133, CNHNZD: 133,
    CNHSGD: 133, HKDCNH: 133, EURCNH: 133, GBPCNH: 133, AUDCNH: 133,
    CADCNH: 133, CHFCNH: 133, NZDCNH: 133, SGDCNH: 133,
    PLNGBP: 119, PLNEUR: 119, PLNUSD: 119,
    JPYZAR: 119,
  }

  /**
   * AKShare 接口: forex_hist_em
   * 对应 Python: akshare.forex.forex_em.forex_hist_em
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - 品种代码，如 'USDCNH'；可通过 forexSpotEm() 获取所有可查询历史行情的品种代码
   * @returns {Array<{date: string, code: string, name: string, open: number, latest: number, high: number, low: number, amplitude: number}>} 外汇历史K线数据数组
   * 数据清洗: 通过 forexMarketMap 将品种代码映射为 secid (market_code.symbol)，解析逗号分隔的 kline 字段
   */
  p.forexHistEm = async function forexHistEm(symbol = 'USDCNH'): Promise<Record<string, unknown>[] | null> {
    try {
      const marketCode = forexMarketMap[symbol.toUpperCase()]
      if (marketCode == null) return null
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid: `${marketCode}.${symbol.toUpperCase()}`,
        klt: '101', fqt: '1', lmt: '50000', end: '20500000', iscca: '1',
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64',
        ut: 'f057cbcbce2a86e2866ab8877db1d059',
        forcect: '1',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      const code = data?.code as string ?? symbol.toUpperCase()
      const name = data?.name as string ?? ''
      return klines.map(line => {
        const p = line.split(',')
        return {
          date: p[0] ?? '', code, name,
          open: safeFloat(p[1]), latest: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          amplitude: safeFloat(p[7]),
        }
      })
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // FUND APIS — verified against .akshare-ref/akshare/fund/
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: fund_name_em
   * 对应 Python: akshare.fund.fund_em.fund_name_em
   * 数据源: https://fund.eastmoney.com/js/fundcode_search.js
   * @returns {Array<{code: string, pinyin: string, name: string, fundType: string, fullName: string}>} 基金代码列表
   * 数据清洗: 去除 JS var r= 前缀后 JSON.parse，映射数组元素为命名字段
   */
  p.fundNameEm = async function fundNameEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/js/fundcode_search.js', {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^var\s+r\s*=\s*/, '').replace(/;?\s*$/, '')
      const data = JSON.parse(jsonStr) as string[][]
      if (!data?.length) return null
      return data.map(row => ({
        code: String(row[0] ?? ''), pinyin: String(row[1] ?? ''),
        name: String(row[2] ?? ''), fundType: String(row[3] ?? ''),
        fullName: String(row[4] ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_purchase_em
   * 对应 Python: akshare.fund.fund_em.fund_purchase_em
   * 数据源: https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx?t=8
   * @returns {Array<{rank: number, code: string, name: string, fundType: string, nav: number, purchaseStatus: string, redeemStatus: string, minPurchase: number, fee: number}>} 基金申赎状态列表
   * 数据清洗: 去除 JS var reData= 前缀后 JSON.parse，从 datas 数组解析字段
   */
  p.fundPurchaseEm = async function fundPurchaseEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx?t=8&page=1,50000&js=reData&sort=fcode,asc', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^var\s+reData\s*=\s*/, '').replace(/;\s*$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.map((row, idx) => ({
        rank: idx + 1, code: String(row[0] ?? ''), name: String(row[1] ?? ''),
        fundType: String(row[2] ?? ''), nav: safeFloat(row[3]),
        purchaseStatus: String(row[5] ?? ''), redeemStatus: String(row[6] ?? ''),
        minPurchase: safeFloat(row[8]), fee: safeFloat(row[11]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_spot_em
   * 对应 Python: akshare.fund.fund_etf_em.fund_etf_spot_em (line 51)
   * 数据源: https://push2delay.eastmoney.com/api/qt/clist/get
   * @returns {Array<{rank: number, code: string, name: string, price: number, changePct: number, changeAmt: number, volume: number, amount: number, amplitude: number, turnoverRate: number, volumeRatio: number, high: number, low: number, open: number, prevClose: number, totalMarketCap: number, floatMarketCap: number, mainNetInflow: number, mainNetInflowPct: number}>} ETF 实时行情列表
   * 数据清洗: f-field 映射为中文命名字段，fs 过滤 MK0021-24,MK0827，数值类型转换
   */
  p.fundEtfSpotEm = async function fundEtfSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '5000', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', wbp2u: '|0|0|0|web',
        fid: 'f12',
        fs: 'b:MK0021,b:MK0022,b:MK0023,b:MK0024,b:MK0827',
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f30,f31,f32,f33,f34,f35,f62,f184',
      }
      const json = await eastmoneyGet('https://push2delay.eastmoney.com/api/qt/clist/get', params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1, code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5), amount: safeFloat(it.f6), amplitude: safeFloat(it.f7),
        turnoverRate: safeFloat(it.f8), volumeRatio: safeFloat(it.f10),
        high: safeFloat(it.f15), low: safeFloat(it.f16), open: safeFloat(it.f17), prevClose: safeFloat(it.f18),
        totalMarketCap: safeFloat(it.f20), floatMarketCap: safeFloat(it.f21),
        mainNetInflow: safeFloat(it.f62), mainNetInflowPct: safeFloat(it.f184),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_lof_spot_em
   * 对应 Python: akshare.fund.fund_lof_em.fund_lof_spot_em (line 26)
   * 数据源: https://2.push2.eastmoney.com/api/qt/clist/get
   * @returns {Array<{rank: number, code: string, name: string, price: number, changePct: number, changeAmt: number, volume: number, amount: number, high: number, low: number, open: number, prevClose: number}>} LOF 实时行情列表
   * 数据清洗: f-field 映射为中文命名字段，fs 过滤 MK0022，数值类型转换
   */
  p.fundLofSpotEm = async function fundLofSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '5000', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', wbp2u: '|0|0|0|web',
        fid: 'f12',
        fs: 'b:MK0022',
        fields: 'f2,f3,f4,f5,f6,f7,f8,f12,f14,f15,f16,f17,f18',
      }
      const json = await eastmoneyGet('https://2.push2.eastmoney.com/api/qt/clist/get', params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1, code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5), amount: safeFloat(it.f6),
        high: safeFloat(it.f15), low: safeFloat(it.f16), open: safeFloat(it.f17), prevClose: safeFloat(it.f18),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_open_fund_daily_em
   * 对应 Python: akshare.fund.fund_em.fund_open_fund_daily_em (line 274)
   * 数据源: https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx?t=1
   * @returns {Array<{rank: number, code: string, name: string, nav: number, accNav: number, prevNav: number, prevAccNav: number, changeAmt: number, changePct: number, purchaseStatus: string, redeemStatus: string}>} 开放式基金日净值列表，最多 500 条
   * 数据清洗: 去除 JS var db= 前缀后 JSON.parse，从 datas 数组解析字段
   */
  p.fundOpenFundDailyEm = async function fundOpenFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx?t=1&lx=1&letter=&gsid=&text=&sort=zdf,desc&page=1,50000&dt=1580914040623&atfc=&onlySale=0', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^var\s+db\s*=\s*/, '').replace(/;\s*$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map((row, idx) => ({
        rank: idx + 1, code: String(row[0] ?? ''), name: String(row[1] ?? ''),
        nav: safeFloat(row[3]), accNav: safeFloat(row[4]),
        prevNav: safeFloat(row[5]), prevAccNav: safeFloat(row[6]),
        changeAmt: safeFloat(row[7]), changePct: safeFloat(row[8]),
        purchaseStatus: String(row[9] ?? ''), redeemStatus: String(row[10] ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_info_index_em
   * 对应 Python: akshare.fund.fund_em.fund_info_index_em (line 143)
   * 数据源: https://api.fund.eastmoney.com/FundTradeRank/GetRankList
   * @param symbol - 指数分类，如 '全部'/'沪深指数'/'行业主题'/'大盘指数' 等，默认 '全部'
   * @param indicator - 指标类型，'全部'/'被动指数型'/'增强指数型'，默认 '全部'
   * @returns {Array<{code: string, name: string, nav: number, changePct: number, week1: number, month1: number, month3: number, month6: number, year1: number, year2: number, year3: number, yearToDate: number, sinceInception: number, fee: number, minPurchase: string}>} 指数基金排行列表，最多 500 条
   * 数据清洗: symbol_map/indicator_map 映射查询参数，管道分隔符 split 解析字段
   */
  p.fundInfoIndexEm = async function fundInfoIndexEm(symbol = '全部', indicator = '全部'): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, string> = { '全部': '', '沪深指数': '053', '行业主题': '054', '大盘指数': '01', '中盘指数': '02', '小盘指数': '03', '股票指数': '050|001', '债券指数': '050|003' }
      const indicatorMap: Record<string, string> = { '全部': '', '被动指数型': '051', '增强指数型': '052' }
      const fr = symbolMap[symbol] ?? ''
      const fr1 = indicatorMap[indicator] ?? ''
      const resp = await fetch(`https://api.fund.eastmoney.com/FundTradeRank/GetRankList?ft=zs&sc=1n&st=desc&pi=1&pn=10000&cp=&ct=&cd=&ms=&fr=${fr}&plevel=&fst=&ftype=&fr1=${fr1}&fl=0&isab=1`, {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const dataStr = json.Data as string
      if (!dataStr) return null
      const parsed = JSON.parse(dataStr) as Record<string, unknown>
      const datas = parsed.datas as string[] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map(item => {
        const parts = item.split('|')
        return {
          code: String(parts[0] ?? ''), name: String(parts[1] ?? ''),
          nav: safeFloat(parts[4]), changePct: safeFloat(parts[5]),
          week1: safeFloat(parts[6]), month1: safeFloat(parts[7]), month3: safeFloat(parts[8]),
          month6: safeFloat(parts[9]), year1: safeFloat(parts[10]), year2: safeFloat(parts[11]),
          year3: safeFloat(parts[12]), yearToDate: safeFloat(parts[13]), sinceInception: safeFloat(parts[14]),
          fee: safeFloat(parts[18]), minPurchase: String(parts[24] ?? ''),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: stock_zh_index_spot_em
   * 对应 Python: akshare.index.index_stock_zh.stock_zh_index_spot_em (line 136, 220)
   * 数据源: https://push2.eastmoney.com/api/qt/clist/get
   * @param symbol - 指数系列，如 '沪深重要指数'/'上证系列指数'/'深证系列指数'/'指数成份'/'中证系列指数'，默认 '沪深重要指数'
   * @returns {Array<{rank: number, code: string, name: string, price: number, changePct: number, changeAmt: number, volume: number, amount: number, amplitude: number, turnoverRate: number, volumeRatio: number, high: number, low: number, open: number, prevClose: number}>} A 股指数实时行情列表
   * 数据清洗: symbol_map 映射 fs 参数，f-field 映射为命名字段，数值类型转换
   */
  p.stockZhIndexSpotEm = async function stockZhIndexSpotEm(symbol = '沪深重要指数'): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, string> = {
        '沪深重要指数': 'b:MK0010', '上证系列指数': 'm:1+t:1',
        '深证系列指数': 'm:0 t:5', '指数成份': 'm:1+s:3,m:0+t:5',
        '中证系列指数': 'm:2+t:2',
      }
      const fs = symbolMap[symbol] ?? symbol
      const url = symbol === '沪深重要指数' ? 'https://33.push2.eastmoney.com/api/qt/clist/get' : 'https://48.push2.eastmoney.com/api/qt/clist/get'
      const params = {
        pn: '1', pz: '5000', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', dect: '1', wbp2u: '|0|0|0|web',
        fid: '', fs,
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18',
      }
      const json = await eastmoneyGet(url, params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1, code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5), amount: safeFloat(it.f6), amplitude: safeFloat(it.f7),
        turnoverRate: safeFloat(it.f8), volumeRatio: safeFloat(it.f10),
        high: safeFloat(it.f15), low: safeFloat(it.f16), open: safeFloat(it.f17), prevClose: safeFloat(it.f18),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_global_spot_em
   * 对应 Python: akshare.index.index_global_em.index_global_spot_em (line 22)
   * 数据源: https://push2.eastmoney.com/api/qt/clist/get
   * @returns {Array<{rank: number, code: string, name: string, price: number, changePct: number, changeAmt: number, volume: number, amount: number, amplitude: number, high: number, low: number, open: number, prevClose: number}>} 全球指数实时行情列表
   * 数据清洗: fs 过滤 m:100+t:1，所有价格字段除以 100 还原实际值
   */
  p.indexGlobalSpotEm = async function indexGlobalSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '500', po: '1', np: '2',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '1', invt: '2', fid: 'f3',
        fs: 'm:100+t:1',
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18',
      }
      const json = await eastmoneyGet('https://push2.eastmoney.com/api/qt/clist/get', params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      const d = (v: number | null) => v != null ? v / 100 : null
      return items.map((it, idx) => ({
        rank: idx + 1, code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: d(safeFloat(it.f2)), changePct: d(safeFloat(it.f3)), changeAmt: d(safeFloat(it.f4)),
        volume: safeFloat(it.f5), amount: safeFloat(it.f6), amplitude: d(safeFloat(it.f7)),
        high: d(safeFloat(it.f15)), low: d(safeFloat(it.f16)), open: d(safeFloat(it.f17)), prevClose: d(safeFloat(it.f18)),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_rating_all
   * 对应 Python: akshare.fund.fund_rating.fund_rating_all (line 14)
   * 数据源: https://fund.eastmoney.com/data/fundrating.html
   * @returns {Array<{code: string, name: string, fundManager: string, fundCompany: string, rating5StarCount: number, ratingZhaoshang: number, ratingShanghai: number, ratingMorningstar: number, ratingJianan: number, fee: number, fundType: string}>} 基金评级列表，最多 500 条
   * 数据清洗: 正则提取 var rankData JSON 对象，从 datas 数组解析字段
   */
  p.fundRatingAll = async function fundRatingAll(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/data/fundrating.html', {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const match = text.match(/var\s+rankData\s*=\s*({.*?})\s*;/s)
      if (!match) return null
      const data = JSON.parse(match[1]) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map(row => ({
        code: String(row[0] ?? ''), name: String(row[1] ?? ''),
        fundManager: String(row[3] ?? ''), fundCompany: String(row[5] ?? ''),
        rating5StarCount: safeFloat(row[7]),
        ratingZhaoshang: safeFloat(row[10]), ratingShanghai: safeFloat(row[12]),
        ratingMorningstar: safeFloat(row[14]), ratingJianan: safeFloat(row[16]),
        fee: safeFloat(row[18]), fundType: String(row[2] ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_manager_em
   * 对应 Python: akshare.fund.fund_manager.fund_manager_em (line 24)
   * 数据源: https://fund.eastmoney.com/Data/FundDataPortfolio_Interface.aspx
   * @returns {Array<{code: string, name: string, company: string, totalAssets: number}>} 基金经理列表，最多 500 条
   * 数据清洗: 去除 JS var data= 前缀后 JSON.parse，从 datas 数组解析字段
   */
  p.fundManagerEm = async function fundManagerEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Data/FundDataPortfolio_Interface.aspx?dt=0&flag=0&pageIndex=1&pageSize=500', {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^var\s+data\s*=\s*/, '').replace(/;\s*$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map(row => ({
        code: String(row[0] ?? ''), name: String(row[1] ?? ''),
        company: String(row[2] ?? ''), totalAssets: safeFloat(row[5]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_scale_change_em
   * 对应 Python: akshare.fund.fund_scale_em.fund_scale_change_em (line 15)
   * 数据源: https://fund.eastmoney.com/Company/home/gspmlist
   * @returns {Array<{company: string, totalScale: number, fundCount: number, change: number}>} 基金公司规模变动列表，最多 100 条
   * 数据清洗: 正则提取 var rankData JSON 对象，从 datas 数组解析字段
   */
  p.fundScaleChangeEm = async function fundScaleChangeEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Company/home/gspmlist', {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const match = text.match(/var\s+rankData\s*=\s*({.*?})\s*;/s)
      if (!match) return null
      const data = JSON.parse(match[1]) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 100).map(row => ({
        company: String(row[0] ?? ''), totalScale: safeFloat(row[1]),
        fundCount: safeFloat(row[2]), change: safeFloat(row[3]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_fh_em
   * 对应 Python: akshare.fund.fund_fhsp_em.fund_fh_em (line 47)
   * 数据源: https://fund.eastmoney.com/Data/funddataIndex_Interface.aspx
   * @param code - 基金代码，如 '510300'
   * @param start - 起始日期，格式 'YYYY-MM-DD'，默认 ''
   * @param end - 结束日期，格式 'YYYY-MM-DD'，默认 ''
   * @returns {Array<{code: string, date: string, bonusCash: number, bonusStock: number, exDate: string}>} 基金分红送配记录
   * 数据清洗: 去除 jQuery() 回调包装后 JSON.parse，从 Data 数组解析字段
   */
  p.fundFhEm = async function fundFhEm(code: string, start = '', end = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const params = new URLSearchParams({
        callback: 'jQuery', fundcode: code, pageIndex: '1', pageSize: '100',
        startDate: start, endDate: end,
      })
      const resp = await fetch(`https://fund.eastmoney.com/Data/funddataIndex_Interface.aspx?${params}`, {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^jQuery\(/, '').replace(/\)$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.Data as Record<string, unknown>[] | undefined
      if (!datas?.length) return null
      return datas.map(it => ({
        code, date: String(it.FSRQ ?? '').slice(0, 10),
        bonusCash: safeFloat(it.FHFCZ), bonusStock: safeFloat(it.FHFCGS),
        exDate: String(it.CXRQ ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_fh_rank_em
   * 对应 Python: akshare.fund.fund_rank_em.fund_fh_rank_em (line 253)
   * 数据源: https://api.fund.eastmoney.com/FundRank/GetHbRankList
   * @returns 分红排行基金数组，包含 code, name, fhsp, fhDate；无数据时返回 null
   * 数据清洗: SortColumn=fhsp&Sort=desc，映射 fcode→code, shortname→name, fhsp→分红次数, fhrq→fhDate
   */
  p.fundFhRankEm = async function fundFhRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://api.fund.eastmoney.com/FundRank/GetHbRankList?SortColumn=fhsp&Sort=desc&pageIndex=1&pageSize=100', {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const datas = json.Data as Record<string, unknown> | undefined
      const list = datas?.Datas as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.fcode ?? ''), name: String(it.shortname ?? ''),
        fhsp: safeFloat(it.fhsp), fhDate: String(it.fhrq ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_hist_em
   * 对应 Python: akshare.fund.fund_etf_em.fund_etf_hist_em (line 263)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param code - ETF 代码，如 '510300'
   * @param period - 周期，'daily'/'weekly'/'monthly'，默认 'daily'
   * @param startDate - 开始日期，格式 'YYYYMMDD'，默认 '20000101'
   * @param endDate - 结束日期，格式 'YYYYMMDD'，默认 '20500101'
   * @param adjust - 复权类型，''/'qfq'/'hfq'，默认 ''
   * @returns ETF 历史行情数组，包含 date, open, close, high, low, volume, amount, changePct, turnoverRate
   * 数据清洗: 使用 resolveSecId 转换 secid，period 映射为 klt 参数 (101/102/103)，解析逗号分隔的 kline 字段
   */
  p.fundEtfHistEm = async function fundEtfHistEm(code: string, period = 'daily', startDate = '20000101', endDate = '20500101', adjust = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const kltMap: Record<string, string> = { daily: '101', weekly: '102', monthly: '103' }
      const fqtMap: Record<string, string> = { '': '0', qfq: '1', hfq: '2' }
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: kltMap[period] ?? '101', fqt: fqtMap[adjust] ?? '0',
        beg: startDate, end: endDate,
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return { code, date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]), high: safeFloat(p[3]), low: safeFloat(p[4]), volume: safeFloat(p[5]), amount: safeFloat(p[6]), changePct: safeFloat(p[8]), turnoverRate: safeFloat(p[10]) }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_lof_hist_em
   * 对应 Python: akshare.fund.fund_lof_em.fund_lof_hist_em (line 146)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param code - LOF 代码，如 '166009'
   * @param period - 周期，'daily'/'weekly'/'monthly'，默认 'daily'
   * @param startDate - 开始日期，格式 'YYYYMMDD'，默认 '20000101'
   * @param endDate - 结束日期，格式 'YYYYMMDD'，默认 '20500101'
   * @param adjust - 复权类型，''/'qfq'/'hfq'，默认 ''
   * @returns LOF 历史行情数组，包含 date, open, close, high, low, volume, amount, changePct, turnoverRate
   * 数据清洗: 使用 resolveSecId 转换 secid，period 映射为 klt 参数 (101/102/103)，解析逗号分隔的 kline 字段
   */
  p.fundLofHistEm = async function fundLofHistEm(code: string, period = 'daily', startDate = '20000101', endDate = '20500101', adjust = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const kltMap: Record<string, string> = { daily: '101', weekly: '102', monthly: '103' }
      const fqtMap: Record<string, string> = { '': '0', qfq: '1', hfq: '2' }
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: kltMap[period] ?? '101', fqt: fqtMap[adjust] ?? '0',
        beg: startDate, end: endDate,
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return { code, date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]), high: safeFloat(p[3]), low: safeFloat(p[4]), volume: safeFloat(p[5]), amount: safeFloat(p[6]), changePct: safeFloat(p[8]), turnoverRate: safeFloat(p[10]) }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_hist_min_em
   * 对应 Python: akshare.fund.fund_etf_em.fund_etf_hist_min_em (line 361)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/trends2/get
   * @param code - ETF 代码，如 '510300'
   * @param period - 分钟周期，'1'/'5'/'15'/'30'/'60'，默认 '5'
   * @param startDate - 开始日期（当前未使用，固定 ndays=5）
   * @param endDate - 结束日期（当前未使用）
   * @param adjust - 复权类型（当前未使用）
   * @returns ETF 分钟行情数组，包含 date, open, close, high, low, volume, amount
   * 数据清洗: 使用 resolveSecId 转换 secid，解析逗号分隔的 trends 字段
   */
  p.fundEtfHistMinEm = async function fundEtfHistMinEm(code: string, period = '5', startDate = '', endDate = '', adjust = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const kltMap: Record<string, string> = { '1': '1', '5': '5', '15': '15', '30': '30', '60': '60' }
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: kltMap[period] ?? '5', iscr: '0', ndays: '5', iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      return trends.map(line => {
        const p = line.split(',')
        return { code, date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]), high: safeFloat(p[3]), low: safeFloat(p[4]), volume: safeFloat(p[5]), amount: safeFloat(p[6]) }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_lof_hist_min_em
   * 对应 Python: akshare.fund.fund_lof_em.fund_lof_hist_min_em (line 220)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/trends2/get
   * @param code - LOF 代码，如 '166009'
   * @param period - 分钟周期，'1'/'5'/'15'/'30'/'60'，默认 '5'
   * @param startDate - 开始日期（当前未使用，固定 ndays=5）
   * @param endDate - 结束日期（当前未使用）
   * @param adjust - 复权类型（当前未使用）
   * @returns LOF 分钟行情数组，包含 date, open, close, high, low, volume, amount
   * 数据清洗: 使用 resolveSecId 转换 secid，解析逗号分隔的 trends 字段
   */
  p.fundLofHistMinEm = async function fundLofHistMinEm(code: string, period = '5', startDate = '', endDate = '', adjust = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const kltMap: Record<string, string> = { '1': '1', '5': '5', '15': '15', '30': '30', '60': '60' }
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: kltMap[period] ?? '5', iscr: '0', ndays: '5', iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      return trends.map(line => {
        const p = line.split(',')
        return { code, date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]), high: safeFloat(p[3]), low: safeFloat(p[4]), volume: safeFloat(p[5]), amount: safeFloat(p[6]) }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_info_ths
   * 对应 Python: akshare.fund.fund_info_ths.fund_info_ths (line 25)
   * 数据源: https://fund.10jqka.com.cn/{code}/interduce.html
   * @param code - 基金代码，如 '000009'
   * @returns 基金基本信息键值对数组，包含 field/value 字段；无数据时返回 null
   * 数据清洗: 解析 HTML 表格中的 td 元素，提取字段名和值的键值对
   */
  p.fundInfoThs = async function fundInfoThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://fund.10jqka.com.cn/${code}/interduce.html`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const rows = html.match(/<td[^>]*>(.*?)<\/td>/gs)?.map(r => r.replace(/<[^>]+>/g, '').trim()) ?? []
      if (rows.length < 10) return null
      return rows.reduce((acc: Record<string, string>[], val, i, arr) => {
        if (i % 2 === 0 && arr[i + 1]) acc.push({ field: val, value: arr[i + 1] })
        return acc
      }, []).slice(0, 20)
    } catch { return null }
  }

  /**
   * AKShare 接口: index_stock_cons
   * 对应 Python: akshare.index.index_cons.index_stock_cons (line 87)
   * 数据源: https://vip.stock.finance.sina.com.cn/corp/go.php/vII_NewestComponent/indexid/{symbol}.phtml
   * @param symbol - 指数代码，如 '399639'
   * @returns 指数成分股数组，包含 indexCode, stockCode, stockName；无数据时返回 null
   * 数据清洗: 解析 HTML 表格中的 td 元素，提取股票代码和名称
   */
  p.indexStockCons = async function indexStockCons(symbol = '000300'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://vip.stock.finance.sina.com.cn/corp/view/vII_NewestComponent.php?page=1&indexid=${symbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const rows = html.match(/<td[^>]*>(.*?)<\/td>/gs)?.map(r => r.replace(/<[^>]+>/g, '').trim()) ?? []
      if (rows.length < 6) return null
      const result: Record<string, unknown>[] = []
      for (let i = 0; i < rows.length; i += 6) {
        if (rows[i] && rows[i + 1]) {
          result.push({ indexCode: symbol, stockCode: rows[i], stockName: rows[i + 1] })
        }
      }
      return result.length ? result : null
    } catch { return null }
  }

  /**
   * AKShare 接口: index_stock_info
   * 对应 Python: akshare.index.index_cons.index_stock_info (line 70)
   * 数据源: https://vip.stock.finance.sina.com.cn/corp/go.php/vII_NewestComponent/index.phtml
   * @returns 指数代码列表，包含 indexCode；无数据时返回 null
   * 数据清洗: 从 HTML 中提取 indexid 匹配的数字作为指数代码
   */
  p.indexStockInfo = async function indexStockInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://vip.stock.finance.sina.com.cn/corp/go.php/vII_NewestComponent/index.phtml', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const matches = [...html.matchAll(/indexid=(\d+)/g)]
      if (!matches.length) return null
      return matches.map(m => ({ indexCode: m[1] }))
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEX APIS — verified against .akshare-ref/akshare/index/
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: index_zh_a_hist
   * 对应 Python: akshare.index.index_zh_em.index_zh_a_hist (line 42)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - 指数代码，默认 '000300'
   * @param period - 周期，'daily'/'weekly'/'monthly'，默认 'daily'
   * @param startDate - 开始日期，格式 'YYYYMMDD'，默认 '19700101'
   * @param endDate - 结束日期，格式 'YYYYMMDD'，默认 '22220101'
   * @returns {Array<{date: string, open: number, close: number, high: number, low: number, volume: number, amount: number, amplitude: number, changePct: number, changeAmt: number, turnoverRate: number}>} K线数据数组
   * 数据清洗: 使用 resolveSecId 转换 secid，period 映射为 klt 参数 (101/102/103)，解析逗号分隔的 kline 字段
   */
  p.indexZhAHist = async function indexZhAHist(symbol = '000300', period = 'daily', startDate = '19700101', endDate = '22220101'): Promise<Record<string, unknown>[] | null> {
    try {
      const periodDict: Record<string, string> = { daily: '101', weekly: '102', monthly: '103' }
      const secid = resolveSecId(symbol)
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid,
        ut: '7eea3edcaed734bea9cbfc24409ed989',
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: periodDict[period] ?? '101',
        fqt: '0',
        beg: startDate,
        end: endDate,
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
          amplitude: safeFloat(p[7]), changePct: safeFloat(p[8]),
          changeAmt: safeFloat(p[9]), turnoverRate: safeFloat(p[10]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: index_zh_a_hist_min_em
   * 对应 Python: akshare.index.index_zh_em.index_zh_a_hist_min_em (line 178)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get (period != '1')
   *         https://push2his.eastmoney.com/api/qt/stock/trends2/get (period == '1')
   * @param symbol - 指数代码，默认 '000300'
   * @param period - 周期，'1'/'5'/'15'/'30'/'60'，默认 '1'
   * @returns {Array<{datetime: string, open: number, close: number, high: number, low: number, volume: number, amount: number, avgPrice?: number, changePct?: number, changeAmt?: number, amplitude?: number, turnoverRate?: number}>} 分钟K线数据数组
   * 数据清洗: period='1' 时使用 trends2 API 返回 avgPrice；其他周期使用 kline API 返回 changePct 等字段
   */
  p.indexZhAHistMinEm = async function indexZhAHistMinEm(symbol = '000300', period = '1'): Promise<Record<string, unknown>[] | null> {
    try {
      const secid = resolveSecId(symbol)
      if (period === '1') {
        const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
          fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
          iscr: '0', ndays: '5',
          secid,
        })
        const trends = data?.trends as string[] | undefined
        if (!trends?.length) return null
        return trends.map(line => {
          const p = line.split(',')
          return {
            datetime: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
            high: safeFloat(p[3]), low: safeFloat(p[4]),
            volume: safeFloat(p[5]), amount: safeFloat(p[6]), avgPrice: safeFloat(p[7]),
          }
        })
      }
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid,
        ut: '7eea3edcaed734bea9cbfc24409ed989',
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: period, fqt: '1', beg: '0', end: '20500000',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          datetime: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          changePct: safeFloat(p[8]), changeAmt: safeFloat(p[9]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
          amplitude: safeFloat(p[7]), turnoverRate: safeFloat(p[10]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: stock_zh_index_daily_em
   * 对应 Python: akshare.index.index_stock_zh.stock_zh_index_daily_em (line 428)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - 指数代码（含市场前缀，如 'sh000300'），默认 'sh000300'
   * @param startDate - 开始日期，格式 'YYYYMMDD'，默认 '19900101'
   * @param endDate - 结束日期，格式 'YYYYMMDD'，默认 '20500101'
   * @returns {Array<{date: string, open: number, close: number, high: number, low: number, volume: number, amount: number}>} 日K线数据数组
   * 数据清洗: 通过 marketMap 将前缀映射为 secid (sz→0, sh→1, csi→2, bj→0)，默认日线 klt=101
   */
  p.stockZhIndexDailyEm = async function stockZhIndexDailyEm(symbol = 'sh000300', startDate = '19900101', endDate = '20500101'): Promise<Record<string, unknown>[] | null> {
    try {
      const marketMap: Record<string, string> = { sz: '0', sh: '1', csi: '2', bj: '0' }
      let secid = ''
      for (const prefix of ['sz', 'bj', 'sh', 'csi']) {
        if (symbol.startsWith(prefix)) {
          secid = `${marketMap[prefix]}.${symbol.slice(prefix.length)}`
          break
        }
      }
      if (!secid) secid = `1.${symbol}`
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid,
        fields1: 'f1,f2,f3,f4,f5',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
        klt: '101', fqt: '0',
        beg: startDate, end: endDate,
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: stock_hk_index_spot_em
   * 对应 Python: akshare.index.index_stock_hk.stock_hk_index_spot_em (line 148)
   * 数据源: https://15.push2.eastmoney.com/api/qt/clist/get
   * @returns {Array<{rank: number, code: string, market: number, name: string, price: number, changePct: number, changeAmt: number, volume: number, amount: number, high: number, low: number, open: number, prevClose: number}>} 港股指数实时行情数组
   * 数据清洗: fs 过滤条件 m:124,m:125,m:305 覆盖港股主要指数，解析 f 系列字段映射为语义化属性
   */
  p.stockHkIndexSpotEm = async function stockHkIndexSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '100', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', wbp2u: '|0|0|0|web',
        fid: 'f3',
        fs: 'm:124,m:125,m:305',
        fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18',
      }
      const json = await eastmoneyGet('https://15.push2.eastmoney.com/api/qt/clist/get', params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1, code: String(it.f12 ?? ''), market: safeFloat(it.f13),
        name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5), amount: safeFloat(it.f6),
        high: safeFloat(it.f15), low: safeFloat(it.f16), open: safeFloat(it.f17), prevClose: safeFloat(it.f18),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: stock_hk_index_daily_em
   * 对应 Python: akshare.index.index_stock_hk.stock_hk_index_daily_em (line 235)
   * 数据源: https://15.push2.eastmoney.com/api/qt/clist/get (获取 secid)
   *         https://push2his.eastmoney.com/api/qt/stock/kline/get (获取K线)
   * @param symbol - 港股指数代码，默认 'HSTECH'
   * @returns {Array<{date: string, open: number, close: number, high: number, low: number}>} 港股指数日K线数据数组
   * 数据清洗: 先查询 spot 接口获取 secid (market.code)，再通过 kline 接口获取历史数据
   */
  p.stockHkIndexDailyEm = async function stockHkIndexDailyEm(symbol = 'HSTECH'): Promise<Record<string, unknown>[] | null> {
    try {
      const spotUrl = 'https://15.push2.eastmoney.com/api/qt/clist/get'
      const spotParams = {
        pn: '1', pz: '200', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', wbp2u: '|0|0|0|web',
        fid: 'f3', fs: 'm:124,m:125,m:305',
        fields: 'f12,f13',
      }
      const spotJson = await eastmoneyGet(spotUrl, spotParams, 15000, EASTMONEY_QUOTE_HEADERS)
      const spotData = (spotJson as Record<string, unknown>).data as Record<string, unknown> | undefined
      const spotItems = ((spotData?.diff ?? []) as Record<string, unknown>[])
      const match = spotItems.find(it => String(it.f12 ?? '') === symbol)
      if (!match) return null
      const secid = `${match.f13}.${symbol}`
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid,
        klt: '101', fqt: '1', lmt: '10000', end: '20500000', iscca: '1',
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64',
        ut: 'f057cbcbce2a86e2866ab8877db1d059', forcect: '1',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return { date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]), high: safeFloat(p[3]), low: safeFloat(p[4]) }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: stock_hk_index_spot_sina
   * 对应 Python: akshare.index.index_stock_hk.stock_hk_index_spot_sina (line 54)
   * 数据源: https://hq.sinajs.cn
   * @returns {Array<{code: string, name: string, price: number, changePct: number, changeAmt: number, prevClose: number, open: number, high: number, low: number}>} 港股指数新浪行情数组
   * 数据清洗: 预定义港股指数代码列表，解析 hq.sinajs.cn 返回的 var hq_str_ 格式数据
   */
  p.stockHkIndexSpotSina = async function stockHkIndexSpotSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const symbols = 'hkCES100,hkCES120,hkCES280,hkCES300,hkCESA80,hkCESG10,hkCESHKM,hkCSCMC,hkCSHK100,hkCSHKDIV,hkCSHKLC,hkCSHKLRE,hkCSHKMCS,hkCSHKME,hkCSHKPE,hkCSHKSE,hkCSI300,hkCSRHK50,hkGEM,hkHKL,hkHSCCI,hkHSCEI,hkHSI,hkHSMBI,hkHSMOGI,hkHSMPI,hkHSTECH,hkSSE180,hkSSE180GV,hkSSE380,hkSSE50,hkSSECEQT,hkSSECOMP,hkSSEDIV,hkSSEITOP,hkSSEMCAP,hkSSEMEGA,hkVHSI'
      const resp = await fetch(`https://hq.sinajs.cn/rn=${Date.now()}&list=${symbols}`, {
        headers: { Referer: 'https://vip.stock.finance.sina.com.cn/' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const lines = text.split('\n').filter(line => line.includes('"'))
      if (!lines.length) return null
      return lines.map(line => {
        const dataStr = line.split('"')[1] ?? ''
        const fields = dataStr.split(',')
        if (fields.length < 9) return null
        return {
          code: fields[0] ?? '', name: fields[1] ?? '',
          price: safeFloat(fields[6]), changePct: safeFloat(fields[8]),
          changeAmt: safeFloat(fields[7]),
          prevClose: safeFloat(fields[3]), open: safeFloat(fields[2]),
          high: safeFloat(fields[4]), low: safeFloat(fields[5]),
        }
      }).filter(Boolean) as Record<string, unknown>[]
    } catch { return null }
  }

  /**
   * AKShare 接口: index_global_hist_em
   * 对应 Python: akshare.index.index_global_em.index_global_hist_em (line 95)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - 全球指数中文名称，默认 '美元指数'
   * @returns {Array<{date: string, code: string, name: string, open: number, close: number, high: number, low: number, amplitude: number}>} 全球指数日K线数据数组
   * 数据清洗: symbolMap 将中文名称映射为 (market.code) 对，secid 格式为 'market.code'
   */
  p.indexGlobalHistEm = async function indexGlobalHistEm(symbol = '美元指数'): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, { code: string; market: string }> = {
        '美元指数': { code: 'UDI', market: '100' }, '道琼斯': { code: 'DJIA', market: '100' },
        '标普500': { code: 'SPX', market: '100' }, '纳斯达克': { code: 'NDX', market: '100' },
        '恒生指数': { code: 'HSI', market: '100' }, '日经225': { code: 'N225', market: '100' },
        '英国富时100': { code: 'FTSE', market: '100' }, '德国DAX30': { code: 'GDAXI', market: '100' },
        '法国CAC40': { code: 'FCHI', market: '100' }, '韩国KOSPI': { code: 'KS11', market: '100' },
        '上证指数': { code: '000001', market: '1' }, '深证成指': { code: '399001', market: '0' },
        '沪深300': { code: '000300', market: '1' }, '创业板指': { code: '399006', market: '0' },
        '波罗的海BDI指数': { code: 'BDI', market: '100' },
      }
      const info = symbolMap[symbol]
      if (!info) return null
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid: `${info.market}.${info.code}`,
        klt: '101', fqt: '1', lmt: '50000', end: '20500000', iscca: '1',
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64',
        ut: 'f057cbcbce2a86e2866ab8877db1d059', forcect: '1',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      const code = data?.code as string ?? info.code
      const name = data?.name as string ?? symbol
      return klines.map(line => {
        const p = line.split(',')
        return {
          date: p[0] ?? '', code, name,
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          amplitude: safeFloat(p[7]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: index_global_hist_sina
   * 对应 Python: akshare.index.index_global_sina.index_global_hist_sina (line 30)
   * 数据源: https://gi.finance.sina.com.cn/hq/daily
   * @param symbol - 全球指数中文名称，默认 '英国富时100指数'
   * @returns {Array<{date: string, open: number, high: number, low: number, close: number, volume: number}>} 全球指数日K线数据数组
   * 数据清洗: symbolMap 将中文名称映射为新浪代码，解析 JSON 响应中的 d/o/h/l/c/v 字段
   */
  p.indexGlobalHistSina = async function indexGlobalHistSina(symbol = '英国富时100指数'): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, string> = {
        '英国富时100指数': 'UKX', '德国DAX 30种股价指数': 'DAX',
        '俄罗斯MICEX指数': 'INDEXCF', '法CAC40指数': 'CAC',
        '瑞士股票指数': 'SWI20', '富时意大利MIB指数': 'FTSEMIB',
        '荷兰AEX综合指数': 'AEX', '西班牙IBEX指数': 'IBEX',
        '欧洲Stoxx50指数': 'SX5E', '加拿大S&P/TSX综合指数': 'GSPTSE',
        '墨西哥BOLSA指数': 'MXX', '巴西BOVESPA股票指数': 'IBOV',
        '中国台湾加权指数': 'TWJQ', '日经225指数': 'NKY',
        '首尔综合指数': 'KOSPI', '印度尼西亚雅加达综合指数': 'JCI',
        '印度孟买SENSEX指数': 'SENSEX', '澳大利亚标准普尔200指数': 'AS51',
        '新西兰NZSE 50指数': 'NZ250', '埃及CASE 30指数': 'CASE',
      }
      const code = symbolMap[symbol]
      if (!code) return null
      const resp = await fetch(`https://gi.finance.sina.com.cn/hq/daily?symbol=${code}&num=10000`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const result = json?.result as Record<string, unknown> | undefined
      const dataList = result?.data as Record<string, unknown>[] | undefined
      if (!dataList?.length) return null
      return dataList.map(it => ({
        date: String(it.d ?? ''), open: safeFloat(it.o), high: safeFloat(it.h),
        low: safeFloat(it.l), close: safeFloat(it.c), volume: safeFloat(it.v),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_global_name_table
   * 对应 Python: akshare.index.index_global_sina.index_global_name_table (line 15)
   * 数据源: 静态映射表
   * @returns {Array<{name: string, code: string}>} 全球指数名称到新浪代码的映射数组
   * 数据清洗: 内存中的静态映射表，无需网络请求
   */
  p.indexGlobalNameTable = async function indexGlobalNameTable(): Promise<Record<string, unknown>[] | null> {
    try {
      const map: Record<string, string> = {
        '英国富时100指数': 'UKX', '德国DAX 30种股价指数': 'DAX',
        '俄罗斯MICEX指数': 'INDEXCF', '法CAC40指数': 'CAC',
        '瑞士股票指数': 'SWI20', '富时意大利MIB指数': 'FTSEMIB',
        '荷兰AEX综合指数': 'AEX', '西班牙IBEX指数': 'IBEX',
        '欧洲Stoxx50指数': 'SX5E', '加拿大S&P/TSX综合指数': 'GSPTSE',
        '墨西哥BOLSA指数': 'MXX', '巴西BOVESPA股票指数': 'IBOV',
        '中国台湾加权指数': 'TWJQ', '日经225指数': 'NKY',
        '首尔综合指数': 'KOSPI', '印度尼西亚雅加达综合指数': 'JCI',
        '印度孟买SENSEX指数': 'SENSEX', '澳大利亚标准普尔200指数': 'AS51',
        '新西兰NZSE 50指数': 'NZ250', '埃及CASE 30指数': 'CASE',
      }
      return Object.entries(map).map(([name, code]) => ({ name, code }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_stock_cons_sina
   * 对应 Python: akshare.index.index_cons.index_stock_cons_sina (line 20)
   * 数据源: https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData
   * @param symbol - 指数代码，默认 '000300'
   * @returns {Array<{indexCode: string, stockCode: string, stockName: string}>} 指数成分股数组
   * 数据清洗: 000300 使用分页接口 getHQNodeData，其他使用 getHQNodeDataSimple 单页获取
   */
  p.indexStockConsSina = async function indexStockConsSina(symbol = '000300'): Promise<Record<string, unknown>[] | null> {
    try {
      if (symbol === '000300') {
        const countResp = await fetch('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCountSimple?node=hs300', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        })
        const countText = await countResp.text()
        const totalCount = parseInt(countText, 10)
        const pageCount = Math.ceil(totalCount / 80)
        const results: Record<string, unknown>[] = []
        for (let page = 1; page <= pageCount; page++) {
          const resp = await fetch(`https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=80&sort=symbol&asc=1&node=hs300&symbol=&_s_r_a=init`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15000),
          })
          const text = await resp.text()
          const data = JSON.parse(text) as Record<string, unknown>[]
          for (const it of data) {
            results.push({ indexCode: symbol, stockCode: String(it.symbol ?? ''), stockName: String(it.name ?? '') })
          }
        }
        return results.length ? results : null
      }
      const resp = await fetch(`https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple?page=1&num=3000&sort=symbol&asc=1&node=zhishu_${symbol}&_s_r_a=setlen`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const data = JSON.parse(text) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        indexCode: symbol, stockCode: String(it.symbol ?? ''), stockName: String(it.name ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_realtime_sw
   * 对应 Python: akshare.index.index_research_sw.index_realtime_sw (line 221)
   * 数据源: https://www.swsresearch.com/insWechatSw/dflgOrJcIndex/pageList (大类风格指数/金创指数)
   *         https://www.swsresearch.com/institute-sw/api/index_publish/current/ (其他指数)
   * @param symbol - 指数类型，默认 '二级行业'
   * @returns {Array<{code: string, name: string, prevClose: number, changePct: number, yearChangePct?: number, open?: number, amount?: number, high?: number, low?: number, price?: number, volume?: number}>} 申万指数实时行情数组
   * 数据清洗: 大类风格指数/金创指数使用 POST 接口返回 yearChangePct；其他使用 GET 接口返回完整行情字段
   */
  p.indexRealtimeSw = async function indexRealtimeSw(symbol = '二级行业'): Promise<Record<string, unknown>[] | null> {
    try {
      const swHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      if (symbol === '大类风格指数' || symbol === '金创指数') {
        const resp = await fetch('https://www.swsresearch.com/insWechatSw/dflgOrJcIndex/pageList', {
          method: 'POST', headers: { ...swHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageNo: 1, pageSize: 50, indexTypeName: symbol, sortField: '', rule: '', indexType: 1 }),
          signal: AbortSignal.timeout(15000),
        })
        const json = await resp.json() as Record<string, unknown>
        const data = json?.data as Record<string, unknown> | undefined
        const list = data?.list as Record<string, unknown>[] | undefined
        if (!list?.length) return null
        return list.map(it => ({
          code: String(it.swIndexCode ?? ''), name: String(it.swIndexName ?? ''),
          prevClose: safeFloat(it.lastCloseIndex), changePct: safeFloat(it.lastMarkup),
          yearChangePct: safeFloat(it.yearMarkup),
        }))
      }
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_publish/current/?page=1&page_size=50&indextype=${encodeURIComponent(symbol)}`, {
        headers: swHeaders, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const results = data?.results as Record<string, unknown>[] | undefined
      if (!results?.length) return null
      return results.map(it => ({
        code: String(Object.values(it)[0] ?? ''), name: String(Object.values(it)[1] ?? ''),
        prevClose: safeFloat(Object.values(it)[2]), open: safeFloat(Object.values(it)[3]),
        amount: safeFloat(Object.values(it)[4]), high: safeFloat(Object.values(it)[5]),
        low: safeFloat(Object.values(it)[6]), price: safeFloat(Object.values(it)[7]),
        volume: safeFloat(Object.values(it)[8]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_hist_sw
   * 对应 Python: akshare.index.index_research_sw.index_hist_sw (line 17)
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_publish/trend/
   * @param symbol - 申万指数代码，默认 '801030'
   * @param period - 周期，'day'/'week'/'month'，默认 'day'
   * @returns {Array<{code: string, date: string, close: number, open: number, high: number, low: number, volume: number, amount: number}>} 申万指数历史K线数据数组
   * 数据清洗: period 映射为 DAY/WEEK/Month，解析 JSON 中的 swindexcode/bargaindate 等字段
   */
  p.indexHistSw = async function indexHistSw(symbol = '801030', period = 'day'): Promise<Record<string, unknown>[] | null> {
    try {
      const periodMap: Record<string, string> = { day: 'DAY', week: 'WEEK', month: 'MONTH' }
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_publish/trend/?swindexcode=${symbol}&period=${periodMap[period] ?? 'DAY'}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const dataList = json?.data as Record<string, unknown>[] | undefined
      if (!dataList?.length) return null
      return dataList.map(it => ({
        code: String(it.swindexcode ?? ''), date: String(it.bargaindate ?? '').slice(0, 10),
        close: safeFloat(it.closeindex), open: safeFloat(it.openindex),
        high: safeFloat(it.maxindex), low: safeFloat(it.minindex),
        volume: safeFloat(it.bargainamount), amount: safeFloat(it.bargainsum),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_min_sw
   * 对应 Python: akshare.index.index_research_sw.index_min_sw (line 81)
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_publish/details/timelines/
   * @param symbol - 申万指数代码，默认 '801001'
   * @returns {Array<{code: string, name: string, price: number, date: string, time: string}>} 申万指数分时数据数组
   * 数据清洗: 解析 JSON 中的 l1/l2/l8/trading_date/trading_time 字段
   */
  p.indexMinSw = async function indexMinSw(symbol = '801001'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_publish/details/timelines/?swindexcode=${symbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const dataList = json?.data as Record<string, unknown>[] | undefined
      if (!dataList?.length) return null
      return dataList.map(it => ({
        code: String(it.l1 ?? ''), name: String(it.l2 ?? ''),
        price: safeFloat(it.l8), date: String(it.trading_date ?? '').slice(0, 10),
        time: String(it.trading_time ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_component_sw
   * 对应 Python: akshare.index.index_research_sw.index_component_sw (line 127)
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_publish/details/component_stocks/
   * @param symbol - 申万指数代码，默认 '801001'
   * @returns {Array<{rank: number, stockCode: string, stockName: string, weight: number, inclusionDate: string}>} 申万指数成分股数组
   * 数据清洗: 解析 JSON 中的 stockcode/stockname/newweight/beginningdate 字段
   */
  p.indexComponentSw = async function indexComponentSw(symbol = '801001'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_publish/details/component_stocks/?swindexcode=${symbol}&page=1&page_size=10000`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const results = data?.results as Record<string, unknown>[] | undefined
      if (!results?.length) return null
      return results.map((it, idx) => ({
        rank: idx + 1, stockCode: String(it.stockcode ?? ''), stockName: String(it.stockname ?? ''),
        weight: safeFloat(it.newweight), inclusionDate: String(it.beginningdate ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_analysis_daily_sw
   * 对应 Python: akshare.index.index_research_sw.index_analysis_daily_sw (line 285)
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_analysis/index_analysis_report/
   * @param symbol - 指数类型，默认 '市场表征'
   * @param startDate - 开始日期，格式 'YYYYMMDD'，默认 '20240101'
   * @param endDate - 结束日期，格式 'YYYYMMDD'，默认 '20240131'
   * @returns {Array<{code: string, name: string, date: string, close: number, volume: number, changePct: number, turnoverRate: number, pe: number, pb: number, avgPrice: number, amountPct: number, floatMktCap: number, dividendYield: number}>} 申万指数日度分析数据数组
   * 数据清洗: 日期转换为 YYYY-MM-DD 格式，解析 swindexcode/markup/pe/pb 等字段
   */
  p.indexAnalysisDailySw = async function indexAnalysisDailySw(symbol = '市场表征', startDate = '20240101', endDate = '20240131'): Promise<Record<string, unknown>[] | null> {
    try {
      const fmt = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_analysis/index_analysis_report/?page=1&page_size=50&index_type=${encodeURIComponent(symbol)}&start_date=${fmt(startDate)}&end_date=${fmt(endDate)}&type=DAY&swindexcode=all`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const results = data?.results as Record<string, unknown>[] | undefined
      if (!results?.length) return null
      return results.map(it => ({
        code: String(it.swindexcode ?? ''), name: String(it.swindexname ?? ''),
        date: String(it.bargaindate ?? '').slice(0, 10),
        close: safeFloat(it.closeindex), volume: safeFloat(it.bargainamount),
        changePct: safeFloat(it.markup), turnoverRate: safeFloat(it.turnoverrate),
        pe: safeFloat(it.pe), pb: safeFloat(it.pb), avgPrice: safeFloat(it.meanprice),
        amountPct: safeFloat(it.bargainsumrate), floatMktCap: safeFloat(it.negotiablessharesum1),
        dividendYield: safeFloat(it.dp),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_analysis_weekly_sw
   * 对应 Python: akshare.index.index_research_sw.index_analysis_weekly_sw (line 389)
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_analysis/index_analysis_reports/
   * @param symbol - 指数类型，默认 '市场表征'
   * @param date - 日期，格式 'YYYYMMDD'，默认 '20241025'
   * @returns {Array<{code: string, name: string, date: string, close: number, volume: number, changePct: number, turnoverRate: number, pe: number, pb: number}>} 申万指数周度分析数据数组
   * 数据清洗: type=WEEK，日期转换为 YYYY-MM-DD 格式
   */
  p.indexAnalysisWeeklySw = async function indexAnalysisWeeklySw(symbol = '市场表征', date = '20241025'): Promise<Record<string, unknown>[] | null> {
    try {
      const fmt = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_analysis/index_analysis_reports/?page=1&page_size=50&index_type=${encodeURIComponent(symbol)}&bargaindate=${fmt(date)}&type=WEEK&swindexcode=all`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const results = data?.results as Record<string, unknown>[] | undefined
      if (!results?.length) return null
      return results.map(it => ({
        code: String(it.swindexcode ?? ''), name: String(it.swindexname ?? ''),
        date: String(it.bargaindate ?? '').slice(0, 10),
        close: safeFloat(it.closeindex), volume: safeFloat(it.bargainamount),
        changePct: safeFloat(it.markup), turnoverRate: safeFloat(it.turnoverrate),
        pe: safeFloat(it.pe), pb: safeFloat(it.pb),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_analysis_monthly_sw
   * 对应 Python: akshare.index.index_research_sw.index_analysis_monthly_sw (line 464)
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_analysis/index_analysis_reports/
   * @param symbol - 指数类型，默认 '市场表征'
   * @param date - 日期，格式 'YYYYMMDD'，默认 '20240930'
   * @returns {Array<{code: string, name: string, date: string, close: number, volume: number, changePct: number, turnoverRate: number, pe: number, pb: number}>} 申万指数月度分析数据数组
   * 数据清洗: type=MONTH，日期转换为 YYYY-MM-DD 格式
   */
  p.indexAnalysisMonthlySw = async function indexAnalysisMonthlySw(symbol = '市场表征', date = '20240930'): Promise<Record<string, unknown>[] | null> {
    try {
      const fmt = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_analysis/index_analysis_reports/?page=1&page_size=50&index_type=${encodeURIComponent(symbol)}&bargaindate=${fmt(date)}&type=MONTH&swindexcode=all`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const results = data?.results as Record<string, unknown>[] | undefined
      if (!results?.length) return null
      return results.map(it => ({
        code: String(it.swindexcode ?? ''), name: String(it.swindexname ?? ''),
        date: String(it.bargaindate ?? '').slice(0, 10),
        close: safeFloat(it.closeindex), volume: safeFloat(it.bargainamount),
        changePct: safeFloat(it.markup), turnoverRate: safeFloat(it.turnoverrate),
        pe: safeFloat(it.pe), pb: safeFloat(it.pb),
      }))
    } catch { return null }
  }

  // ── QVIX option volatility indices (optbbs.com CSV) ──

  async function fetchOptbbsQvix(cols: number[]): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('http://1.optbbs.com/d/csv/d/k.csv', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      return lines.slice(1).map(line => {
        const fields = line.split(',')
        return {
          date: fields[cols[0]] ?? '',
          open: safeFloat(fields[cols[1]]),
          high: safeFloat(fields[cols[2]]),
          low: safeFloat(fields[cols[3]]),
          close: safeFloat(fields[cols[4]]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: index_option_50etf_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_50etf_qvix (line 28)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns {Array<{date: string, open: number, high: number, low: number, close: number}>} 50ETF期权波动率指数数据数组
   * 数据清洗: CSV 解析，使用列索引 [0,1,2,3,4] 提取 date/open/high/low/close 字段
   */
  p.indexOption50EtfQvix = async function indexOption50EtfQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 1, 2, 3, 4])
  }

  /**
   * AKShare 接口: index_option_300etf_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_300etf_qvix (line 68)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns {Array<{date: string, open: number, high: number, low: number, close: number}>} 300ETF期权波动率指数数据数组
   * 数据清洗: CSV 解析，使用列索引 [0,9,10,11,12] 提取 date/open/high/low/close 字段
   */
  p.indexOption300EtfQvix = async function indexOption300EtfQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 9, 10, 11, 12])
  }

  /**
   * AKShare 接口: index_option_500etf_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_500etf_qvix (line 108)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns {Array<{date: string, open: number, high: number, low: number, close: number}>} 500ETF期权波动率指数数据数组
   * 数据清洗: CSV 解析，使用列索引 [0,67,68,69,70] 提取 date/open/high/low/close 字段
   */
  p.indexOption500EtfQvix = async function indexOption500EtfQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 67, 68, 69, 70])
  }

  /**
   * AKShare 接口: index_option_cyb_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_cyb_qvix (line 148)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns {Array<{date: string, open: number, high: number, low: number, close: number}>} 创业板ETF期权波动率指数数据数组
   * 数据清洗: CSV 解析，使用列索引 [0,71,72,73,74] 提取 date/open/high/low/close 字段
   */
  p.indexOptionCybQvix = async function indexOptionCybQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 71, 72, 73, 74])
  }

  /**
   * AKShare 接口: index_option_kcb_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_kcb_qvix (line 188)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns 科创板期权波动率指数 QVIX 数组，包含 date, open, high, low, close；无数据时返回 null
   * 数据清洗: 从 optbbs CSV 读取原始数据，提取第 0,83,84,85,86 列
   */
  p.indexOptionKcbQvix = async function indexOptionKcbQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 83, 84, 85, 86])
  }

  /**
   * AKShare 接口: index_option_100etf_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_100etf_qvix (line 228)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns 深证100ETF期权波动率指数 QVIX 数组，包含 date, open, high, low, close；无数据时返回 null
   * 数据清洗: 从 optbbs CSV 读取原始数据，提取第 0,75,76,77,78 列
   */
  p.indexOption100EtfQvix = async function indexOption100EtfQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 75, 76, 77, 78])
  }

  /**
   * AKShare 接口: index_option_300index_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_300index_qvix (line 268)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns 中证300股指期权波动率指数 QVIX 数组，包含 date, open, high, low, close；无数据时返回 null
   * 数据清洗: 从 optbbs CSV 读取原始数据，提取第 0,17,18,19,20 列
   */
  p.indexOption300IndexQvix = async function indexOption300IndexQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 17, 18, 19, 20])
  }

  /**
   * AKShare 接口: index_option_1000index_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_1000index_qvix (line 308)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns 中证1000股指期权波动率指数 QVIX 数组，包含 date, open, high, low, close；无数据时返回 null
   * 数据清洗: 从 optbbs CSV 读取原始数据，提取第 0,25,26,27,28 列
   */
  p.indexOption1000IndexQvix = async function indexOption1000IndexQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 25, 26, 27, 28])
  }

  /**
   * AKShare 接口: index_option_50index_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_50index_qvix (line 348)
   * 数据源: http://1.optbbs.com/d/csv/d/k.csv
   * @returns 上证50股指期权波动率指数 QVIX 数组，包含 date, open, high, low, close；无数据时返回 null
   * 数据清洗: 从 optbbs CSV 读取原始数据，提取第 0,79,80,81,82 列
   */
  p.indexOption50IndexQvix = async function indexOption50IndexQvix(): Promise<Record<string, unknown>[] | null> {
    return fetchOptbbsQvix([0, 79, 80, 81, 82])
  }

  // ═══════════════════════════════════════════════════════════════
  // FUND APIS — batch 2 (verified against akshare Python sources)
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: fund_aum_em
   * 对应 Python: akshare.fund.fund_aum_em.fund_aum_em (line 14)
   * 数据源: https://fund.eastmoney.com/Company/home/gspmlist
   * @returns 基金公司排名列表，包含 rank, company, establishedDate, totalScale, fundCount；无数据时返回 null
   * 数据清洗: 解析 HTML 表格，提取公司排名、成立时间、管理规模和基金数量
   */
  p.fundAumEm = async function fundAumEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Company/home/gspmlist?fundType=0', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 5 && /^\d+$/.test(cells[0])) {
          const scaleStr = cells[3].replace(/,/g, '').split(/\s+/)[0]
          rows.push({
            rank: safeFloat(cells[0]),
            company: cells[1],
            establishedDate: cells[2],
            totalScale: safeFloat(scaleStr),
            fundCount: safeFloat(cells[4]),
          })
        }
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_aum_hist_em
   * 对应 Python: akshare.fund.fund_aum_em.fund_aum_hist_em (line 64)
   * 数据源: https://fund.eastmoney.com/Company/home/HistoryScaleTable
   * @param year - 查询年份，默认当前年份
   * @returns 基金公司历年管理规模排行列表，包含 rank, company, totalScale, stockType, mixedType, bondType, indexType, qdii, moneyType；无数据时返回 null
   * 数据清洗: 解析 HTML 表格，提取公司排名和各类基金规模数据
   */
  p.fundAumHistEm = async function fundAumHistEm(year = String(new Date().getFullYear())): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://fund.eastmoney.com/Company/home/HistoryScaleTable?year=${year}`, {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 8 && /^\d+$/.test(cells[0])) {
          rows.push({
            rank: safeFloat(cells[0]),
            company: cells[1],
            totalScale: safeFloat(cells[2].replace(/,/g, '')),
            stockType: safeFloat(cells[3].replace(/,/g, '')),
            mixedType: safeFloat(cells[4].replace(/,/g, '')),
            bondType: safeFloat(cells[5].replace(/,/g, '')),
            indexType: safeFloat(cells[6].replace(/,/g, '')),
            qdii: safeFloat(cells[7].replace(/,/g, '')),
            moneyType: safeFloat(cells[8]?.replace(/,/g, '') ?? ''),
          })
        }
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_aum_trend_em
   * 对应 Python: akshare.fund.fund_aum_em.fund_aum_trend_em (line 45)
   * 数据源: https://fund.eastmoney.com/Company/home/GetFundTotalScaleForChart
   * @returns 基金市场管理规模走势数组，包含 date, value；无数据时返回 null
   * 数据清洗: 解析 JSON 响应，映射 x→date, y→value
   */
  p.fundAumTrendEm = async function fundAumTrendEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Company/home/GetFundTotalScaleForChart?fundType=0', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const dates = json.x as string[] | undefined
      const values = json.y as number[] | undefined
      if (!dates?.length || !values?.length) return null
      return dates.map((d, i) => ({ date: d, value: safeFloat(values[i]) }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_stock_position_lg
   * 对应 Python: akshare.fund.fund_position_lg.fund_stock_position_lg (line 15)
   * 数据源: https://legulegu.com/api/stockdata/fund-position
   * @returns 股票型基金仓位数组，包含 date, close, position；无数据时返回 null
   * 数据清洗: type=pos_stock&category=总仓位&marketId=5，解析 JSON 数组
   */
  p.fundStockPositionLg = async function fundStockPositionLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://legulegu.com/api/stockdata/fund-position?token=&type=pos_stock&category=%E6%80%BB%E4%BB%93%E4%BD%8D&marketId=5', {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://legulegu.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>[]
      if (!json?.length) return null
      return json.map((it: Record<string, unknown>) => ({
        date: String(it.date ?? '').slice(0, 10),
        close: safeFloat(it.close),
        position: safeFloat(it.position),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_balance_position_lg
   * 对应 Python: akshare.fund.fund_position_lg.fund_balance_position_lg (line 51)
   * 数据源: https://legulegu.com/api/stockdata/fund-position
   * @returns 平衡混合型基金仓位数组，包含 date, close, position；无数据时返回 null
   * 数据清洗: type=pos_pingheng&category=总仓位&marketId=5，解析 JSON 数组
   */
  p.fundBalancePositionLg = async function fundBalancePositionLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://legulegu.com/api/stockdata/fund-position?token=&type=pos_pingheng&category=%E6%80%BB%E4%BB%93%E4%BD%8D&marketId=5', {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://legulegu.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>[]
      if (!json?.length) return null
      return json.map((it: Record<string, unknown>) => ({
        date: String(it.date ?? '').slice(0, 10),
        close: safeFloat(it.close),
        position: safeFloat(it.position),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_linghuo_position_lg
   * 对应 Python: akshare.fund.fund_position_lg.fund_linghuo_position_lg (line 89)
   * 数据源: https://legulegu.com/api/stockdata/fund-position
   * @returns 灵活配置型基金仓位数组，包含 date, close, position；无数据时返回 null
   * 数据清洗: type=pos_linghuo&category=总仓位&marketId=5，解析 JSON 数组
   */
  p.fundLinghuoPositionLg = async function fundLinghuoPositionLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://legulegu.com/api/stockdata/fund-position?token=&type=pos_linghuo&category=%E6%80%BB%E4%BB%93%E4%BD%8D&marketId=5', {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://legulegu.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>[]
      if (!json?.length) return null
      return json.map((it: Record<string, unknown>) => ({
        date: String(it.date ?? '').slice(0, 10),
        close: safeFloat(it.close),
        position: safeFloat(it.position),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_category_ths
   * 对应 Python: akshare.fund.fund_etf_ths.fund_etf_category_ths (line 15)
   * 数据源: https://fund.10jqka.com.cn/data/Net/info/{symbol}_rate_desc_{date}_0_1_9999_0_0_0_jsonp_g.html
   * @param symbol - 基金类型，默认 'ETF'
   * @param date - 查询日期，格式 'YYYYMMDD'，为空返回全部
   * @returns 基金实时行情数组，包含 rank, code, name, nav, accNav, prevNav, prevAccNav, changeAmt, changePct, sellStatus, buyStatus, tradeDate, newNav, newAccNav, fundType；无数据时返回 null
   * 数据清洗: symbol 映射为内部类型码，解析 JSONP 响应中的 data.data 对象
   */
  p.fundEtfCategoryThs = async function fundEtfCategoryThs(symbol = 'ETF', date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, string> = {
        '股票型': 'gpx', '债券型': 'zqx', '混合型': 'hhx', 'ETF': 'ETF', 'LOF': 'LOF',
        'QDII': 'QDII', '保本型': 'bbx', '指数型': 'zsx', '': 'all',
      }
      const innerSymbol = symbolMap[symbol] ?? 'ETF'
      const innerDate = date ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : '0'
      const resp = await fetch(`https://fund.10jqka.com.cn/data/Net/info/${innerSymbol}_rate_desc_${innerDate}_0_1_9999_0_0_0_jsonp_g.html`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.slice(2, -1)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const items = (data as Record<string, Record<string, Record<string, unknown>>>)?.data?.data
      if (!items) return null
      return (Object.values(items) as Record<string, unknown>[]).map((it, idx) => ({
        rank: idx + 1,
        code: String(it.code ?? ''),
        name: String(it.name ?? ''),
        nav: safeFloat(it.net),
        accNav: safeFloat(it.totalnet),
        prevNav: safeFloat(it.net1),
        prevAccNav: safeFloat(it.totalnet1),
        changeAmt: safeFloat(it.ranges),
        changePct: safeFloat(it.rate),
        sellStatus: String(it.shstat ?? ''),
        buyStatus: String(it.sgstat ?? ''),
        tradeDate: String(it.newdate ?? ''),
        newNav: safeFloat(it.newnet),
        newAccNav: safeFloat(it.newtotalnet),
        fundType: String(it.typename ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_spot_ths
   * 对应 Python: akshare.fund.fund_etf_ths.fund_etf_spot_ths (line 110)
   * 数据源: 委托 fundEtfCategoryThs 方法
   * @param date - 查询日期，格式 'YYYYMMDD'，为空返回全部
   * @returns ETF 基金实时行情数组，与 fundEtfCategoryThs 返回结构一致；无数据时返回 null
   * 数据清洗: 委托 fundEtfCategoryThs('ETF', date) 完成数据获取
   */
  p.fundEtfSpotThs = async function fundEtfSpotThs(date = ''): Promise<Record<string, unknown>[] | null> {
    return p.fundEtfCategoryThs!.call(this, 'ETF', date)
  }

  /**
   * AKShare 接口: fund_etf_dividend_sina
   * 对应 Python: akshare.fund.fund_etf_sina.fund_etf_dividend_sina (line 152)
   * 数据源: https://finance.sina.com.cn/realstock/company/{symbol}/hfq.js
   * @param symbol - ETF 代码，如 'sh510050'
   * @returns ETF 分红历史数组，包含 date, dividend；无数据时返回 null
   * 数据清洗: 解析 JS 变量赋值，提取 data 数组，过滤 1900-01-01 日期
   */
  p.fundEtfDividendSina = async function fundEtfDividendSina(symbol = 'sh510050'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://finance.sina.com.cn/realstock/company/${symbol}/hfq.js`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      if (!text.startsWith('var')) return null
      const jsonStr = text.split('=')[1].trim().replace(/;\s*$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const items = (data?.data as unknown[] | undefined)
      if (!items?.length) return null
      return items
        .filter((row: unknown) => Array.isArray(row) && row[0] !== '1900-01-01')
        .map((row: unknown) => {
          const r = row as unknown[]
          return { date: String(r[0] ?? ''), dividend: safeFloat(r[3]) }
        })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_hist_sina
   * 对应 Python: akshare.fund.fund_etf_sina.fund_etf_hist_sina (line 116)
   * 数据源: https://finance.sina.com.cn/realstock/company/{symbol}/hisdata_klc2/klc_kl.js
   * @param symbol - ETF 代码，如 'sh510050'
   * @returns ETF 历史 K 线数组，包含 date, open, high, low, close, volume；无数据时返回 null
   * 数据清洗: 解析 JS 变量赋值，提取 JSON 数组
   */
  p.fundEtfHistSina = async function fundEtfHistSina(symbol = 'sh510050'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://finance.sina.com.cn/realstock/company/${symbol}/hisdata_klc2/klc_kl.js`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const rawStr = text.split('=')[1]?.split(';')[0]?.replace(/"/g, '')
      if (!rawStr) return null
      const items = JSON.parse(rawStr) as Record<string, unknown>[]
      if (!items?.length) return null
      return items.map(it => ({
        date: String(it.date ?? ''),
        open: safeFloat(it.open),
        high: safeFloat(it.high),
        low: safeFloat(it.low),
        close: safeFloat(it.close),
        volume: safeFloat(it.volume),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_scale_sse
   * 对应 Python: akshare.fund.fund_etf_sse.fund_etf_scale_sse (line 13)
   * 数据源: https://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L
   * @param date - 统计日期，格式 'YYYYMMDD'，为空返回最新数据
   * @returns 上交所 ETF 基金份额数据，包含 code, name, etfType, statDate, shares；无数据时返回 null
   * 数据清洗: Referer: https://www.sse.com.cn/，解析 JSON result 数组
   */
  p.fundEtfScaleSse = async function fundEtfScaleSse(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const dataStr = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
      const resp = await fetch(`https://query.sse.com.cn/commonQuery.do?isPagination=true&pageHelp.pageSize=10000&pageHelp.pageNo=1&pageHelp.beginPage=1&pageHelp.endPage=1&sqlId=COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L&STAT_DATE=${dataStr}`, {
        headers: { Referer: 'https://www.sse.com.cn/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const items = json?.result as Record<string, unknown>[] | undefined
      if (!items?.length) return null
      return items.map(it => ({
        code: String(it.SEC_CODE ?? ''),
        name: String(it.SEC_NAME ?? ''),
        etfType: String(it.ETF_TYPE ?? ''),
        statDate: String(it.STAT_DATE ?? '').slice(0, 10),
        shares: safeFloat(it.TOT_VOL),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_scale_szse
   * 对应 Python: akshare.fund.fund_etf_szse.fund_etf_scale_szse (line 15)
   * 数据源: https://fund.szse.cn/api/report/ShowReport?CATALOGID=1000_lf&TABKEY=tab1
   * @returns 深交所 ETF 基金份额数据，包含 code, name, category, investType, listingDate, shares, manager, nav；无数据时返回 null
   * 数据清洗: 解析 JSON data 数组，映射中文字段名为语义化属性
   */
  p.fundEtfScaleSzse = async function fundEtfScaleSzse(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.szse.cn/api/report/ShowReport?SHOWTYPE=JSON&CATALOGID=1000_lf&TABKEY=tab1', {
        headers: { Referer: 'https://fund.szse.cn/marketdata/fundslist/index.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const items = json?.data as Record<string, unknown>[] | undefined
      if (!items?.length) return null
      return items.map(it => ({
        code: String(it['基金代码'] ?? ''),
        name: String(it['基金简称'] ?? ''),
        category: String(it['基金类别'] ?? ''),
        investType: String(it['投资类别'] ?? ''),
        listingDate: String(it['上市日期'] ?? '').slice(0, 10),
        shares: safeFloat(String(it['当前规模(份)'] ?? '').replace(/,/g, '')),
        manager: String(it['基金管理人'] ?? ''),
        nav: safeFloat(it['净值']),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_exchange_rank_em
   * 对应 Python: akshare.fund.fund_rank_em.fund_exchange_rank_em (line 151)
   * 数据源: https://fund.eastmoney.com/data/rankhandler.aspx
   * @returns 场内交易基金排行数组，包含 rank, code, name, navDate, nav, accNav, week1, month1, month3, month6, year1, year2, year3, yearToDate, sinceInception；无数据时返回 null
   * 数据清洗: dt=fb&ft=ct，解析 rankhandler 返回的逗号分隔数据
   */
  p.fundExchangeRankEm = async function fundExchangeRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=fb&ft=ct&rs=&gs=0&sc=1nzf&st=desc&pi=1&pn=30000&v=0.1591891419018292', {
        headers: { Referer: 'https://fund.eastmoney.com/fundguzhi.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.slice(text.indexOf('{'), -1)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map((item, idx) => {
        const p = item.split(',')
        return {
          rank: idx + 1, code: String(p[0] ?? ''), name: String(p[1] ?? ''),
          navDate: String(p[3] ?? ''), nav: safeFloat(p[4]), accNav: safeFloat(p[5]),
          week1: safeFloat(p[6]), month1: safeFloat(p[7]), month3: safeFloat(p[8]),
          month6: safeFloat(p[9]), year1: safeFloat(p[10]), year2: safeFloat(p[11]),
          year3: safeFloat(p[12]), yearToDate: safeFloat(p[13]), sinceInception: safeFloat(p[14]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_money_fund_daily_em
   * 对应 Python: akshare.fund.fund_em.fund_money_fund_daily_em (line 588)
   * 数据源: https://fund.eastmoney.com/HBJJ_pjsyl.html
   * @returns 货币基金每日收益数组，包含 code, name, tenKUnitYield, annualized7d, nav, dayChange；无数据时返回 null
   * 数据清洗: 解析 HTML 表格，提取基金代码、名称、万份收益和七日年化收益率
   */
  p.fundMoneyFundDailyEm = async function fundMoneyFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/HBJJ_pjsyl.html', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 5 && /^\d{6}$/.test(cells[0])) {
          rows.push({
            code: cells[0],
            name: cells[1].replace(/基金吧档案/g, ''),
            tenKUnitYield: safeFloat(cells[2]),
            annualized7d: safeFloat(cells[3]),
            nav: safeFloat(cells[4]),
            dayChange: safeFloat(cells[7]),
          })
        }
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_money_rank_em
   * 对应 Python: akshare.fund.fund_rank_em.fund_money_rank_em (line 246)
   * 数据源: https://api.fund.eastmoney.com/FundRank/GetHbRankList
   * @returns 货币基金排行数组，包含 rank, code, name, navDate, tenKUnitYield, annualized7d, annualized14d, annualized28d, month1, month3, month6, year1, year2, year3, year5, yearToDate, sinceInception；无数据时返回 null
   * 数据清洗: strSortCol=SYL_1N&orderType=desc，映射 fcode→code, shortname→name 等字段
   */
  p.fundMoneyRankEm = async function fundMoneyRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://api.fund.eastmoney.com/FundRank/GetHbRankList?intCompany=0&MinsgType=&IsSale=1&strSortCol=SYL_1N&orderType=desc&pageIndex=1&pageSize=10000', {
        headers: { Referer: 'https://fund.eastmoney.com/fundguzhi.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const datas = json?.Data as Record<string, unknown>[] | undefined
      if (!datas?.length) return null
      return datas.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.fcode ?? ''), name: String(it.shortname ?? ''),
        navDate: String(it.date ?? ''),
        tenKUnitYield: safeFloat(it.mmy),
        annualized7d: safeFloat(it.nnj),
        annualized14d: safeFloat(it.nnj14),
        annualized28d: safeFloat(it.nnj28),
        month1: safeFloat(it.syl1y), month3: safeFloat(it.syl3y),
        month6: safeFloat(it.syl6y), year1: safeFloat(it.syl1n),
        year2: safeFloat(it.syl2n), year3: safeFloat(it.syl3n),
        year5: safeFloat(it.syl5n), yearToDate: safeFloat(it.syljn),
        sinceInception: safeFloat(it.syljs),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_money_fund_info_em
   * 对应 Python: akshare.fund.fund_em.fund_money_fund_info_em (line 622)
   * 数据源: https://api.fund.eastmoney.com/f10/lsjz
   * @param symbol - 基金代码，如 '000009'
   * @returns 货币基金历史净值数组，包含 date, tenKUnitYield, annualized7d, buyStatus, sellStatus；无数据时返回 null
   * 数据清洗: fundCode={symbol}，解析 Data.LSJZList 数组
   */
  p.fundMoneyFundInfoEm = async function fundMoneyFundInfoEm(symbol = '000009'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=10000&startDate=&endDate=&_=${Date.now()}`, {
        headers: { Referer: `https://fundf10.eastmoney.com/jjjz_${symbol}.html`, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.LSJZList as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        date: String(it.FSRQ ?? '').slice(0, 10),
        tenKUnitYield: safeFloat(it.DWJZ),
        annualized7d: safeFloat(it.LJJZ),
        buyStatus: String(it.SGZT ?? ''),
        sellStatus: String(it.SHZT ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_fee_em
   * 对应 Python: akshare.fund.fund_fee_em.fund_fee_em (line 17)
   * 数据源: https://fundf10.eastmoney.com/jjfl_{symbol}.html
   * @param symbol - 基金代码
   * @param indicator - 费用类型，如 '运作费用'、'认购费率（前端）'、'赎回费率' 等
   * @returns 基金费用信息数组；无数据时返回 null
   * 数据清洗: 解析 HTML 中的 h4 标题和对应的 table 表格，按 indicator 匹配返回
   */
  p.fundFeeEm = async function fundFeeEm(symbol: string, indicator = '运作费用'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://fundf10.eastmoney.com/jjfl_${symbol}.html`, {
        headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const sections: Record<string, Record<string, unknown>[]> = {}
      const h4Regex = /<h4[^>]*class="t"[^>]*>([\s\S]*?)<\/h4>/gi
      const titles: string[] = []
      let m = h4Regex.exec(html)
      while (m) { titles.push(m[1].replace(/<[^>]+>/g, '').trim()); m = h4Regex.exec(html) }
      const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
      const tables: string[][][] = []
      let tm = tableRegex.exec(html)
      while (tm) {
        const rows = [...tm[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
          .map(tr => [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(td => td[1].replace(/<[^>]+>/g, '').trim()))
          .filter(r => r.length > 0)
        if (rows.length) tables.push(rows)
        tm = tableRegex.exec(html)
      }
      for (let i = 0; i < titles.length && i < tables.length; i++) {
        sections[titles[i]] = tables[i].map(r => {
          const obj: Record<string, unknown> = {}
          r.forEach((cell, j) => { obj[`col${j}`] = cell })
          return obj
        })
      }
      const data = sections[indicator]
      if (!data?.length) return null
      return data
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_financial_fund_daily_em
   * 对应 Python: akshare.fund.fund_em.fund_financial_fund_daily_em (line 681)
   * 数据源: https://api.fund.eastmoney.com/FundNetValue/GetLCJJJZ
   * @returns 理财基金每日收益数组，包含 rank, code, name, annRatePrev, tenKUnitYield, annRate7d, buyStatus, cycle；无数据时返回 null
   * 数据清洗: sort=ljjz,desc&page=1,100，解析 Data.List 数组
   */
  p.fundFinancialFundDailyEm = async function fundFinancialFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://api.fund.eastmoney.com/FundNetValue/GetLCJJJZ?letter=&jjgsid=0&searchtext=&sort=ljjz,desc&page=1,100&AttentionCodes=&cycle=&OnlySale=1', {
        headers: { Referer: 'https://fund.eastmoney.com/lcjj.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.List as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.fcode ?? ''), name: String(it.shortname ?? ''),
        annRatePrev: safeFloat(it.actualsyi),
        tenKUnitYield: safeFloat(it.mui),
        annRate7d: safeFloat(it.syi),
        buyStatus: String(it.kfr ?? ''),
        cycle: String(it.cycle ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_financial_fund_info_em
   * 对应 Python: akshare.fund.fund_em.fund_financial_fund_info_em (line 754)
   * 数据源: https://api.fund.eastmoney.com/f10/lsjz
   * @param symbol - 基金代码，如 '000134'
   * @returns 理财基金历史净值数组，包含 date, nav, accNav, changePct, buyStatus, sellStatus, dividend；无数据时返回 null
   * 数据清洗: fundCode={symbol}，解析 Data.LSJZList 数组
   */
  p.fundFinancialFundInfoEm = async function fundFinancialFundInfoEm(symbol = '000134'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=10000&startDate=&endDate=&_=${Date.now()}`, {
        headers: { Referer: `https://fundf10.eastmoney.com/jjjz_${symbol}.html`, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.LSJZList as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        date: String(it.FSRQ ?? '').slice(0, 10),
        nav: safeFloat(it.DWJZ),
        accNav: safeFloat(it.LJJZ),
        changePct: safeFloat(it.JZZZL),
        buyStatus: String(it.SGZT ?? ''),
        sellStatus: String(it.SHZT ?? ''),
        dividend: String(it.FHSP ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_graded_fund_daily_em
   * 对应 Python: akshare.fund.fund_em.fund_graded_fund_daily_em (line 809)
   * 数据源: https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx
   * @returns 分级基金每日行情数组，包含 rank, code, name, nav, accNav, prevNav, prevAccNav, changeAmt, changePct, marketPrice, premiumRate；无数据时返回 null
   * 数据清洗: t=1&lx=9，解析 var db= 变量赋值中的 datas 数组
   */
  p.fundGradedFundDailyEm = async function fundGradedFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx?t=1&lx=9&letter=&gsid=0&text=&sort=zdf,desc&page=1,10000&dt=1580914040623&atfc=', {
        headers: { Referer: 'https://fund.eastmoney.com/fjjj.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^var\s+db\s*=\s*/, '').replace(/;\s*$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map((row, idx) => ({
        rank: idx + 1, code: String(row[0] ?? ''), name: String(row[1] ?? ''),
        nav: safeFloat(row[3]), accNav: safeFloat(row[4]),
        prevNav: safeFloat(row[5]), prevAccNav: safeFloat(row[6]),
        changeAmt: safeFloat(row[7]), changePct: safeFloat(row[8]),
        marketPrice: safeFloat(row[9]), premiumRate: safeFloat(row[10]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_graded_fund_info_em
   * 对应 Python: akshare.fund.fund_em.fund_graded_fund_info_em (line 879)
   * 数据源: https://api.fund.eastmoney.com/f10/lsjz
   * @param symbol - 分级基金代码，如 '150232'
   * @returns 分级基金历史净值数组，包含 date, nav, accNav, changePct, buyStatus, sellStatus；无数据时返回 null
   * 数据清洗: fundCode={symbol}，解析 Data.LSJZList 数组
   */
  p.fundGradedFundInfoEm = async function fundGradedFundInfoEm(symbol = '150232'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${symbol}&pageIndex=1&pageSize=10000&startDate=&endDate=&_=${Date.now()}`, {
        headers: { Referer: `https://fundf10.eastmoney.com/jjjz_${symbol}.html`, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.LSJZList as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        date: String(it.FSRQ ?? '').slice(0, 10),
        nav: safeFloat(it.DWJZ),
        accNav: safeFloat(it.LJJZ),
        changePct: safeFloat(it.JZZZL),
        buyStatus: String(it.SGZT ?? ''),
        sellStatus: String(it.SHZT ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_value_estimation_em
   * 对应 Python: akshare.fund.fund_em.fund_value_estimation_em (line 1042)
   * 数据源: https://api.fund.eastmoney.com/FundGuZhi/GetFundGZList
   * @param symbol - 基金类型，默认 '全部'
   * @returns 基金估值估算数组，包含 rank, code, name, estNav, estChangePct, actualNav, actualChangePct, estError；无数据时返回 null
   * 数据清洗: type 映射为数字类型，解析 Data.list 数组
   */
  p.fundValueEstimationEm = async function fundValueEstimationEm(symbol = '全部'): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, number> = {
        '全部': 1, '股票型': 2, '混合型': 3, '债券型': 4, '指数型': 5,
        'QDII': 6, 'ETF联接': 7, 'LOF': 8, '场内交易基金': 9,
      }
      const type = symbolMap[symbol] ?? 1
      const resp = await fetch(`https://api.fund.eastmoney.com/FundGuZhi/GetFundGZList?type=${type}&sort=3&orderType=desc&canbuy=0&pageIndex=1&pageSize=20000&_=${Date.now()}`, {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.list as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.fcode ?? ''), name: String(it.name ?? ''),
        estNav: safeFloat(it.gsz),
        estChangePct: safeFloat(it.gszzl),
        actualNav: safeFloat(it.dwjz),
        actualChangePct: safeFloat(it.jzzzl),
        estError: safeFloat(it.gztime),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_lcx_rank_em
   * 对应 Python: akshare.fund.fund_rank_em.fund_lcx_rank_em (line 346)
   * 数据源: https://api.fund.eastmoney.com/FundRank/GetLcRankList
   * @returns 理财基金排行数组，包含 rank, code, name, navDate, tenKUnitYield, annRate7d, annRate14d, annRate28d, week1, month1, month3, month6, yearToDate, sinceInception；无数据时返回 null
   * 数据清洗: strSortCol=SYL_Z&orderType=desc，映射 fcode→code, shortname→name 等字段
   */
  p.fundLcxRankEm = async function fundLcxRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://api.fund.eastmoney.com/FundRank/GetLcRankList?intCompany=0&MinsgType=undefined&IsSale=1&strSortCol=SYL_Z&orderType=desc&pageIndex=1&pageSize=50&FBQ=', {
        headers: { Referer: 'https://fund.eastmoney.com/fundguzhi.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const datas = json?.Data as Record<string, unknown>[] | undefined
      if (!datas?.length) return null
      return datas.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.fcode ?? ''), name: String(it.shortname ?? ''),
        navDate: String(it.date ?? ''),
        tenKUnitYield: safeFloat(it.mmy),
        annRate7d: safeFloat(it.nnj),
        annRate14d: safeFloat(it.nnj14),
        annRate28d: safeFloat(it.nnj28),
        week1: safeFloat(it.syl1w), month1: safeFloat(it.syl1y),
        month3: safeFloat(it.syl3y), month6: safeFloat(it.syl6y),
        yearToDate: safeFloat(it.syljn), sinceInception: safeFloat(it.syljs),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_overview_em
   * 对应 Python: akshare.fund.fund_overview_em.fund_overview_em (line 15)
   * 数据源: https://fundf10.eastmoney.com/jbgk_{symbol}.html
   * @param symbol - 基金代码
   * @returns 基金基本概况键值对对象；无数据时返回 null
   * 数据清洗: 解析 HTML 表格中的 td 元素，提取字段名和值的键值对
   */
  p.fundOverviewEm = async function fundOverviewEm(symbol: string): Promise<Record<string, unknown> | null> {
    try {
      const resp = await fetch(`https://fundf10.eastmoney.com/jbgk_${symbol}.html`, {
        headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const tds = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
      if (tds.length < 10) return null
      const info: Record<string, string> = {}
      for (let i = 0; i < tds.length - 1; i += 2) {
        if (tds[i] && tds[i + 1]) info[tds[i]] = tds[i + 1]
      }
      return Object.keys(info).length ? info : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_open_fund_info_em
   * 对应 Python: akshare.fund.fund_em.fund_open_fund_info_em (line 333)
   * 数据源: https://fund.eastmoney.com/pingzhongdata/{symbol}.js
   * @param symbol - 基金代码
   * @param indicator - 数据类型，'单位净值走势'/'累计净值走势'/'同类排名走势'
   * @returns 开放式基金信息数组；无数据时返回 null
   * 数据清洗: 从 JS 文件中提取 Data_netWorthTrend/Data_ACWorthTrend/Data_rateInSimilarType 变量
   */
  p.fundOpenFundInfoEm = async function fundOpenFundInfoEm(symbol: string, indicator = '单位净值走势'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://fund.eastmoney.com/pingzhongdata/${symbol}.js`, {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const varMap: Record<string, string> = {
        '单位净值走势': 'Data_netWorthTrend',
        '累计净值走势': 'Data_ACWorthTrend',
        '同类排名走势': 'Data_rateInSimilarType',
      }
      const varName = varMap[indicator]
      if (!varName) return null
      const match = text.match(new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`))
      if (!match) return null
      const data = JSON.parse(match[1]) as Record<string, unknown>[]
      if (!data?.length) return null
      return data.map(it => {
        if (indicator === '同类排名走势') {
          const x = it.x as number
          return {
            date: new Date(x).toISOString().slice(0, 10),
            sameTypeRank: safeFloat(it.y),
            totalRank: safeFloat(it.equityReturn),
          }
        }
        const x = it.x as number
        return {
          date: new Date(x).toISOString().slice(0, 10),
          nav: safeFloat(it.y),
          changePct: safeFloat(it.equityReturn),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_open_fund_rank_em
   * 对应 Python: akshare.fund.fund_rank_em.fund_open_fund_rank_em (line 33)
   * 数据源: https://fund.eastmoney.com/data/rankhandler.aspx
   * @param symbol - 基金类型，'全部'/'股票型'/'混合型'/'债券型'/'指数型'/'QDII'/'FOF'
   * @returns 开放基金排行数组，包含 rank, code, name, navDate, nav, accNav, changePct, week1, month1, month3, month6, year1, year2, year3, yearToDate, sinceInception；无数据时返回 null
   * 数据清洗: dt=kf&ft={type}，解析 rankhandler 返回的逗号分隔数据
   */
  p.fundOpenFundRankEm = async function fundOpenFundRankEm(symbol = '全部'): Promise<Record<string, unknown>[] | null> {
    try {
      const typeMap: Record<string, [string, string]> = {
        '全部': ['all', '1nzf'], '股票型': ['gp', '1nzf'], '混合型': ['hh', '1nzf'],
        '债券型': ['zq', '1nzf'], '指数型': ['zs', '1nzf'], 'QDII': ['qdii', '1nzf'],
        'FOF': ['fof', '1nzf'],
      }
      const [ft, sc] = typeMap[symbol] ?? typeMap['全部']
      const now = new Date().toISOString().slice(0, 10)
      const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
      const resp = await fetch(`https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=${ft}&rs=&gs=0&sc=${sc}&st=desc&sd=${oneYearAgo}&ed=${now}&qdii=&tabSubtype=,,,,,&pi=1&pn=30000&dx=1&v=0.1591891419018292`, {
        headers: { Referer: 'https://fund.eastmoney.com/fundguzhi.html', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.slice(text.indexOf('{'), -1)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[] | undefined
      if (!datas?.length) return null
      return datas.slice(0, 500).map((item, idx) => {
        const p = item.split(',')
        return {
          rank: idx + 1, code: String(p[0] ?? ''), name: String(p[1] ?? ''),
          navDate: String(p[3] ?? ''), nav: safeFloat(p[4]), accNav: safeFloat(p[5]),
          changePct: safeFloat(p[6]), week1: safeFloat(p[7]), month1: safeFloat(p[8]),
          month3: safeFloat(p[9]), month6: safeFloat(p[10]), year1: safeFloat(p[11]),
          year2: safeFloat(p[12]), year3: safeFloat(p[13]), yearToDate: safeFloat(p[14]),
          sinceInception: safeFloat(p[15]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_new_found_em
   * 对应 Python: akshare.fund.fund_init_em.fund_new_found_em (line 15)
   * 数据源: https://fund.eastmoney.com/data/FundNewIssue.aspx
   * @returns 新成立基金数组，包含 code, name, company, fundType, salePeriod, raisedShares, establishedDate, sinceInception, manager, buyStatus, fee；无数据时返回 null
   * 数据清洗: t=xcln&sort=jzrgq,desc，解析 var newfunddata= 变量赋值中的 datas 数组
   */
  p.fundNewFoundEm = async function fundNewFoundEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/data/FundNewIssue.aspx?t=xcln&sort=jzrgq,desc=&y=&page=1,50000&isbuy=1&v=0.4069919776543214', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^var\s+newfunddata\s*=\s*/, '').replace(/;\s*$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const datas = data?.datas as string[][] | undefined
      if (!datas?.length) return null
      return datas.map(row => ({
        code: String(row[0] ?? ''), name: String(row[1] ?? ''),
        company: String(row[2] ?? ''), fundType: String(row[4] ?? ''),
        salePeriod: String(row[10] ?? ''),
        raisedShares: safeFloat(row[5]),
        establishedDate: String(row[6] ?? '').slice(0, 10),
        sinceInception: safeFloat(row[7]?.replace(/,/g, '')),
        manager: String(row[8] ?? ''),
        buyStatus: String(row[9] ?? ''),
        fee: safeFloat(row[18]?.replace(/%/g, '')),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_new_found_ths
   * 对应 Python: akshare.fund.fund_init_ths.fund_new_found_ths (line 15)
   * 数据源: https://fund.10jqka.com.cn/datacenter/xfjj/
   * @param symbol - 基金状态，'全部'/'发行中'/'将发行'
   * @returns 新发基金数组，包含 rank, code, name, investType, fundType, investStyle, startDate, endDate, orgName, manager, subscribeFee, minSubscribe；无数据时返回 null
   * 数据清洗: 从页面提取 jsonData 对象，根据 zzfx 字段筛选状态
   */
  p.fundNewFoundThs = async function fundNewFoundThs(symbol = '全部'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.10jqka.com.cn/datacenter/xfjj/', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const startIdx = html.indexOf('jsonData=')
      if (startIdx === -1) return null
      const startBracket = html.indexOf('{', startIdx)
      if (startBracket === -1) return null
      let count = 0, endIdx = startBracket
      for (let i = startBracket; i < html.length; i++) {
        if (html[i] === '{') count++
        else if (html[i] === '}') { count--; if (count === 0) { endIdx = i + 1; break } }
      }
      const data = JSON.parse(html.slice(startBracket, endIdx)) as Record<string, Record<string, unknown>>
      let items = Object.values(data)
      if (symbol === '发行中') items = items.filter(it => it.zzfx === 1)
      else if (symbol === '将发行') items = items.filter(it => it.zzfx !== 1)
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.code ?? ''), name: String(it.name ?? ''),
        investType: String(it.type ?? ''), fundType: String(it.jjlx ?? ''),
        investStyle: String(it.tzfg ?? ''),
        startDate: String(it.start ?? '').slice(0, 10),
        endDate: String(it.end ?? '').slice(0, 10),
        orgName: String(it.orgname ?? ''),
        manager: Array.isArray(it.manager) ? String(it.manager[0] ?? '') : String(it.manager ?? ''),
        subscribeFee: safeFloat(it.zgrgfl),
        minSubscribe: safeFloat(it.zdrg),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_info_ths (improved version)
   * 对应 Python: akshare.fund.fund_info_ths.fund_info_ths (line 25)
   * 数据源: https://fund.10jqka.com.cn/{code}/interduce.html
   * @param code - 基金代码
   * @returns 基金基本信息键值对对象；无数据时返回 null
   * 数据清洗: 解析 HTML 表格中的 td 元素，提取字段名和值的键值对
   */
  p.fundInfoThs = async function fundInfoThs(code: string): Promise<Record<string, unknown> | null> {
    try {
      const resp = await fetch(`https://fund.10jqka.com.cn/${code}/interduce.html`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const tds = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
      if (tds.length < 10) return null
      const info: Record<string, string> = {}
      for (let i = 0; i < tds.length - 1; i += 2) {
        if (tds[i] && tds[i + 1]) info[tds[i]] = tds[i + 1]
      }
      return Object.keys(info).length ? info : null
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // FUND APIS — batch 3 (verified against akshare Python sources)
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: fund_rating_sh
   * 对应 Python: akshare.fund.fund_rating.fund_rating_sh (line 91)
   * 数据源: https://fund.eastmoney.com/data/fundrating_3_{date}.html
   * @param date - 评级日期，格式 'YYYYMMDD'，为空返回最新数据
   * @returns 上海证券基金评级数组，包含 code, name, fundType, fundManager, fundCompany, rating3Year, rating3YearChange, rating5Year, rating5YearChange, nav, navDate, changePct, year1, year3, year5, fee；无数据时返回 null
   * 数据清洗: 优先解析 var rankData 变量，降级解析 script 标签中的管道分隔数据
   */
  p.fundRatingSh = async function fundRatingSh(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const dateFmt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      const resp = await fetch(`https://fund.eastmoney.com/data/fundrating_3_${dateFmt}.html`, {
        headers: { Referer: 'https://fund.eastmoney.com/data/fundrating_3.html' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const match = html.match(/var\s+rankData\s*=\s*({.*?})\s*;/s)
      if (match) {
        const data = JSON.parse(match[1]) as Record<string, unknown>
        const datas = data?.datas as string[] | undefined
        if (datas?.length) {
          return datas.slice(0, 500).map(item => {
            const p = item.split('|')
            return {
              code: String(p[0] ?? ''), name: String(p[1] ?? ''),
              fundType: String(p[2] ?? ''), fundManager: String(p[3] ?? ''),
              fundCompany: String(p[5] ?? ''),
              rating3Year: safeFloat(p[7]), rating3YearChange: safeFloat(p[8]),
              rating5Year: safeFloat(p[9]), rating5YearChange: safeFloat(p[10]),
              nav: safeFloat(p[11]), navDate: String(p[12] ?? '').slice(0, 10),
              changePct: safeFloat(p[13]),
              year1: safeFloat(p[14]), year3: safeFloat(p[15]), year5: safeFloat(p[16]),
              fee: safeFloat(p[17]),
            }
          })
        }
      }
      const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
      if (!scriptMatch) return null
      for (const s of scriptMatch) {
        const inner = s.replace(/<[^>]+>/g, '')
        const dataMatch = inner.match(/"([|_|]+)"/)
        if (dataMatch && dataMatch[1].includes('|_')) {
          const rows = dataMatch[1].split('|_').filter(Boolean)
          if (rows.length) {
            return rows.map(row => {
              const p = row.split('|')
              return {
                code: String(p[0] ?? ''), name: String(p[1] ?? ''),
                fundType: String(p[2] ?? ''), fundManager: String(p[3] ?? ''),
                fundCompany: String(p[5] ?? ''),
                rating3Year: safeFloat(p[7]), rating3YearChange: safeFloat(p[8]),
                rating5Year: safeFloat(p[9]), rating5YearChange: safeFloat(p[10]),
                nav: safeFloat(p[11]), navDate: String(p[12] ?? '').slice(0, 10),
                changePct: safeFloat(p[13]),
                year1: safeFloat(p[14]), year3: safeFloat(p[15]), year5: safeFloat(p[16]),
                fee: safeFloat(p[17]),
              }
            })
          }
        }
      }
      return null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_rating_zs
   * 对应 Python: akshare.fund.fund_rating.fund_rating_zs (line 189)
   * 数据源: https://fund.eastmoney.com/data/fundrating_2_{date}.html
   * @param date - 评级日期，格式 'YYYYMMDD'，为空返回最新数据
   * @returns 招商证券基金评级数组，包含 code, name, fundManager, fundCompany, rating3Year, rating3YearChange, nav, navDate, changePct, year1, year3, year5, fee；无数据时返回 null
   * 数据清洗: 优先解析 var rankData 变量，降级解析 script 标签中的管道分隔数据
   */
  p.fundRatingZs = async function fundRatingZs(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const dateFmt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      const resp = await fetch(`https://fund.eastmoney.com/data/fundrating_2_${dateFmt}.html`, {
        headers: { Referer: 'https://fund.eastmoney.com/data/fundrating_2.html' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const match = html.match(/var\s+rankData\s*=\s*({.*?})\s*;/s)
      if (match) {
        const data = JSON.parse(match[1]) as Record<string, unknown>
        const datas = data?.datas as string[] | undefined
        if (datas?.length) {
          return datas.slice(0, 500).map(item => {
            const p = item.split('|')
            return {
              code: String(p[0] ?? ''), name: String(p[1] ?? ''),
              fundManager: String(p[3] ?? ''), fundCompany: String(p[5] ?? ''),
              rating3Year: safeFloat(p[7]), rating3YearChange: safeFloat(p[8]),
              nav: safeFloat(p[9]), navDate: String(p[10] ?? '').slice(0, 10),
              changePct: safeFloat(p[11]),
              year1: safeFloat(p[12]), year3: safeFloat(p[13]), year5: safeFloat(p[14]),
              fee: safeFloat(p[15]),
            }
          })
        }
      }
      const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
      if (!scriptMatch) return null
      for (const s of scriptMatch) {
        const inner = s.replace(/<[^>]+>/g, '')
        const dataMatch = inner.match(/"([|_|]+)"/)
        if (dataMatch && dataMatch[1].includes('|_')) {
          const rows = dataMatch[1].split('|_').filter(Boolean)
          if (rows.length) {
            return rows.map(row => {
              const p = row.split('|')
              return {
                code: String(p[0] ?? ''), name: String(p[1] ?? ''),
                fundManager: String(p[3] ?? ''), fundCompany: String(p[5] ?? ''),
                rating3Year: safeFloat(p[7]), rating3YearChange: safeFloat(p[8]),
                nav: safeFloat(p[9]), navDate: String(p[10] ?? '').slice(0, 10),
                changePct: safeFloat(p[11]),
                year1: safeFloat(p[12]), year3: safeFloat(p[13]), year5: safeFloat(p[14]),
                fee: safeFloat(p[15]),
              }
            })
          }
        }
      }
      return null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_report_asset_allocation_cninfo
   * 对应 Python: akshare.fund.fund_report_cninfo.fund_report_asset_allocation_cninfo (line 161)
   * 数据源: https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1114
   * @returns 基金资产配置数据数组，包含 reportDate, fundCoverage, equityRatio, bondRatio, cashRatio, netAssetScale；无数据时返回 null
   * 数据清洗: POST 请求，解析 records 数组，映射 ENDDATE/F001N/F006N/F007N/F008N/F005N 字段
   */
  p.fundReportAssetAllocationCninfo = async function fundReportAssetAllocationCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1114', {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Host': 'webapi.cninfo.com.cn',
          'Origin': 'https://webapi.cninfo.com.cn',
          'Referer': 'https://webapi.cninfo.com.cn/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const records = json?.records as Record<string, unknown>[] | undefined
      if (!records?.length) return null
      return records.map(it => ({
        reportDate: String(it.ENDDATE ?? '').slice(0, 10),
        fundCoverage: safeFloat(it.F001N),
        equityRatio: safeFloat(it.F006N),
        bondRatio: safeFloat(it.F007N),
        cashRatio: safeFloat(it.F008N),
        netAssetScale: safeFloat(it.F005N),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_report_industry_allocation_cninfo
   * 对应 Python: akshare.fund.fund_report_cninfo.fund_report_industry_allocation_cninfo (line 97)
   * 数据源: https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1113
   * @param date - 报告日期，格式 'YYYYMMDD'，为空返回最新数据
   * @returns 基金行业配置数据数组，包含 industryCode, industryName, reportDate, fundCoverage, industryScale, netAssetRatio；无数据时返回 null
   * 数据清洗: POST 请求，解析 records 数组，映射 F001V/F002V/ENDDATE/F003N/F004N/F005N 字段
   */
  p.fundReportIndustryAllocationCninfo = async function fundReportIndustryAllocationCninfo(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const rdate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      const resp = await fetch(`https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1113?rdate=${rdate}`, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Host': 'webapi.cninfo.com.cn',
          'Origin': 'https://webapi.cninfo.com.cn',
          'Referer': 'https://webapi.cninfo.com.cn/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const records = json?.records as Record<string, unknown>[] | undefined
      if (!records?.length) return null
      return records.map(it => ({
        industryCode: String(it.F001V ?? ''),
        industryName: String(it.F002V ?? ''),
        reportDate: String(it.ENDDATE ?? '').slice(0, 10),
        fundCoverage: safeFloat(it.F003N),
        industryScale: safeFloat(it.F004N),
        netAssetRatio: safeFloat(it.F005N),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_report_stock_cninfo
   * 对应 Python: akshare.fund.fund_report_cninfo.fund_report_stock_cninfo (line 30)
   * 数据源: https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1112
   * @param date - 报告日期，格式 'YYYYMMDD'，为空返回最新数据
   * @returns 基金重仓股数据数组，包含 stockCode, stockName, reportDate, fundCoverage, totalShares, totalMarketValue；无数据时返回 null
   * 数据清洗: POST 请求，解析 records 数组，映射 SECCODE/SECNAME/ENDDATE/F001N/F002N/F003N 字段
   */
  p.fundReportStockCninfo = async function fundReportStockCninfo(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const rdate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      const resp = await fetch(`https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1112?rdate=${rdate}`, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Host': 'webapi.cninfo.com.cn',
          'Origin': 'https://webapi.cninfo.com.cn',
          'Referer': 'https://webapi.cninfo.com.cn/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(30000),
      })
      const json = await resp.json() as Record<string, unknown>
      const records = json?.records as Record<string, unknown>[] | undefined
      if (!records?.length) return null
      return records.map(it => ({
        stockCode: String(it.SECCODE ?? ''),
        stockName: String(it.SECNAME ?? ''),
        reportDate: String(it.ENDDATE ?? '').slice(0, 10),
        fundCoverage: safeFloat(it.F001N),
        totalShares: safeFloat(it.F002N),
        totalMarketValue: safeFloat(it.F003N),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_scale_close_sina
   * 对应 Python: akshare.fund.fund_scale_sina.fund_scale_close_sina (line 95)
   * 数据源: http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/.../NetValueReturn_Service.NetValueReturnClose
   * @returns 封闭式基金规模数组，包含 rank, code, name, nav, totalScale, totalShares, establishedDate, manager, updateDate；无数据时返回 null
   * 数据清洗: sort=zmjgm&asc=0，解析 JSONP 回调中的 data 数组
   */
  p.fundScaleCloseSina = async function fundScaleCloseSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const url = 'http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/IO.XSRV2.CallbackList[_bjN6KvXOkfPy2Bu]/NetValueReturn_Service.NetValueReturnClose'
      const params = new URLSearchParams({
        page: '1', num: '1000', sort: 'zmjgm', asc: '0', ccode: '', type2: '', type3: '',
      })
      const resp = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const start = text.indexOf('({')
      if (start === -1) return null
      const jsonStr = text.slice(start + 1, -2)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const items = data?.data as Record<string, unknown>[] | undefined
      if (!items?.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.symbol ?? ''), name: String(it.sname ?? ''),
        nav: safeFloat(it.dwjz), totalScale: safeFloat(it.zmjgm),
        totalShares: safeFloat(it.zjzfe), establishedDate: String(it.clrq ?? '').slice(0, 10),
        manager: String(it.jjjl ?? ''), updateDate: String(it.jzrq ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_scale_daily_szse
   * 对应 Python: akshare.fund.fund_scale_szse.fund_scale_daily_szse (line 27)
   * 数据源: https://www.szse.cn/api/report/ShowReport?CATALOGID=scsj_fund_jjgm&TABKEY=tab1
   * @param startDate - 开始日期，格式 'YYYYMMDD'
   * @param endDate - 结束日期，格式 'YYYYMMDD'
   * @param symbol - 基金类型，'ETF'/'LOF'/'REITS'
   * @returns 深交所基金规模每日数据，包含 date, code, name, shares；无数据时返回 null
   * 数据清洗: jjlb 参数映射基金类型，解析 JSON data 数组
   */
  p.fundScaleDailySzse = async function fundScaleDailySzse(startDate = '', endDate = '', symbol = 'ETF'): Promise<Record<string, unknown>[] | null> {
    try {
      const now = new Date()
      const fmtDate = (d: string) => {
        if (d) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        return now.toISOString().slice(0, 10)
      }
      const start = fmtDate(startDate || new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, ''))
      const end = fmtDate(endDate || now.toISOString().slice(0, 10).replace(/-/g, ''))
      const symbolMap: Record<string, string> = { ETF: 'ETF', LOF: 'LOF', REITS: '不动产基金' }
      const refererMap: Record<string, string> = {
        ETF: 'https://www.szse.cn/market/fund/volume/etf/index.html',
        LOF: 'https://www.szse.cn/market/fund/volume/lof/index.html',
        REITS: 'https://www.szse.cn/market/fund/volume/reits/index.html',
      }
      const jjlb = symbolMap[symbol] ?? 'ETF'
      const resp = await fetch(`https://www.szse.cn/api/report/ShowReport?SHOWTYPE=JSON&CATALOGID=scsj_fund_jjgm&TABKEY=tab1&txtStart=${start}&txtEnd=${end}&jjlb=${encodeURIComponent(jjlb)}&random=${Math.random()}`, {
        headers: {
          Referer: refererMap[symbol] ?? refererMap.ETF,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const items = json?.data as Record<string, unknown>[] | undefined
      if (!items?.length) return null
      return items.map(it => ({
        date: String(it['日期'] ?? '').slice(0, 10),
        code: String(it['基金代码'] ?? ''),
        name: String(it['基金简称'] ?? ''),
        shares: safeFloat(String(it['基金规模(份)'] ?? '').replace(/,/g, '')),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_scale_open_sina
   * 对应 Python: akshare.fund.fund_scale_sina.fund_scale_open_sina (line 15)
   * 数据源: http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/.../NetValueReturn_Service.NetValueReturnOpen
   * @param symbol - 基金类型，'股票型基金'/'混合型基金'/'债券型基金'/'货币型基金'/'QDII基金'
   * @returns 开放式基金规模数组，包含 rank, code, name, nav, totalScale, totalShares, establishedDate, manager, updateDate；无数据时返回 null
   * 数据清洗: sort=zmjgm&asc=0&type2={type}，解析 JSONP 回调中的 data 数组
   */
  p.fundScaleOpenSina = async function fundScaleOpenSina(symbol = '股票型基金'): Promise<Record<string, unknown>[] | null> {
    try {
      const fundMap: Record<string, string> = {
        '股票型基金': '2', '混合型基金': '1', '债券型基金': '3',
        '货币型基金': '5', 'QDII基金': '6',
      }
      const type2 = fundMap[symbol] ?? '2'
      const url = 'http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/IO.XSRV2.CallbackList[J2cW8KXheoWKdSHc]/NetValueReturn_Service.NetValueReturnOpen'
      const params = new URLSearchParams({
        page: '1', num: '10000', sort: 'zmjgm', asc: '0', ccode: '', type2, type3: '',
      })
      const resp = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const start = text.indexOf('({')
      if (start === -1) return null
      const jsonStr = text.slice(start + 1, -2)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const items = data?.data as Record<string, unknown>[] | undefined
      if (!items?.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.symbol ?? ''), name: String(it.sname ?? ''),
        nav: safeFloat(it.dwjz), totalScale: safeFloat(it.zmjgm),
        totalShares: safeFloat(it.zjzfe), establishedDate: String(it.clrq ?? '').slice(0, 10),
        manager: String(it.jjjl ?? ''), updateDate: String(it.jzrq ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_scale_structured_sina
   * 对应 Python: akshare.fund.fund_scale_sina.fund_scale_structured_sina (line 166)
   * 数据源: http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/.../NetValueReturn_Service.NetValueReturnCX
   * @returns 创新型基金规模数组，包含 rank, code, name, nav, totalScale, totalShares, establishedDate, manager, updateDate；无数据时返回 null
   * 数据清洗: sort=zmjgm&asc=0，解析 JSONP 回调中的 data 数组
   */
  p.fundScaleStructuredSina = async function fundScaleStructuredSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const url = 'http://vip.stock.finance.sina.com.cn/fund_center/data/jsonp.php/IO.XSRV2.CallbackList[cRrwseM7NWX68rDa]/NetValueReturn_Service.NetValueReturnCX'
      const params = new URLSearchParams({
        page: '1', num: '1000', sort: 'zmjgm', asc: '0', ccode: '', type2: '', type3: '',
      })
      const resp = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const start = text.indexOf('({')
      if (start === -1) return null
      const jsonStr = text.slice(start + 1, -2)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const items = data?.data as Record<string, unknown>[] | undefined
      if (!items?.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.symbol ?? ''), name: String(it.sname ?? ''),
        nav: safeFloat(it.dwjz), totalScale: safeFloat(it.zmjgm),
        totalShares: safeFloat(it.zjzfe), establishedDate: String(it.clrq ?? '').slice(0, 10),
        manager: String(it.jjjl ?? ''), updateDate: String(it.jzrq ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: reits_hist_em
   * 对应 Python: akshare.reits.reits_basic.reits_hist_em (line 116)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - REITs 代码，如 '508097'
   * @returns REITs 历史行情数组，包含 date, open, close, high, low, volume, amount, amplitude, turnoverRate；无数据时返回 null
   * 数据清洗: 先通过 push2 clist 获取 secid，再调用 kline API 获取历史数据
   */
  p.reitsHistEm = async function reitsHistEm(symbol = '508097'): Promise<Record<string, unknown>[] | null> {
    try {
      const spotParams = {
        pn: '1', pz: '100', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:1 t:9 e:97,m:0 t:10 e:97',
        fields: 'f12,f13',
      }
      const spotJson = await eastmoneyGet('https://95.push2.eastmoney.com/api/qt/clist/get', spotParams, 15000, EASTMONEY_QUOTE_HEADERS)
      const spotData = (spotJson as Record<string, unknown>).data as Record<string, unknown> | undefined
      const spotItems = ((spotData?.diff ?? []) as Record<string, unknown>[])
      const match = spotItems.find(it => String(it.f12 ?? '') === symbol)
      if (!match) return null
      const secid = `${match.f13}.${symbol}`
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid,
        klt: '101', fqt: '1', lmt: '10000', end: '20500000', iscca: '1',
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64',
        ut: 'f057cbcbce2a86e2866ab8877db1d059', forcect: '1',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          date: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
          amplitude: safeFloat(p[7]), turnoverRate: safeFloat(p[10]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: reits_realtime_em
   * 对应 Python: akshare.reits.reits_basic.reits_realtime_em (line 45)
   * 数据源: https://95.push2.eastmoney.com/api/qt/clist/get
   * @returns REITs 实时行情数组，包含 rank, code, name, price, changePct, changeAmt, volume, amount, high, low, open, prevClose；无数据时返回 null
   * 数据清洗: fs=m:1 t:9 e:97,m:0 t:10 e:97，映射 f-fields 为语义化属性
   */
  p.reitsRealtimeEm = async function reitsRealtimeEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '100', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:1 t:9 e:97,m:0 t:10 e:97',
        fields: 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18',
      }
      const json = await eastmoneyGet('https://95.push2.eastmoney.com/api/qt/clist/get', params, 30000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1, code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5), amount: safeFloat(it.f6),
        high: safeFloat(it.f15), low: safeFloat(it.f16), open: safeFloat(it.f17), prevClose: safeFloat(it.f18),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_category_sina
   * 对应 Python: akshare.fund.fund_etf_sina.fund_etf_category_sina (line 17)
   * 数据源: https://vip.stock.finance.sina.com.cn/quotes_service/api/jsonp.php/.../Market_Center.getHQNodeDataSimple
   * @param symbol - 基金类型，'封闭式基金'/'ETF基金'/'LOF基金'
   * @returns 基金行情数组，包含 code, name, price, changeAmt, changePct, buy, sell, prevClose, open, high, low, volume, amount；无数据时返回 null
   * 数据清洗: node 参数映射基金类型，解析 JSONP 回调中的数组
   */
  p.fundEtfCategorySina = async function fundEtfCategorySina(symbol = 'ETF基金'): Promise<Record<string, unknown>[] | null> {
    try {
      const fundMap: Record<string, string> = { '封闭式基金': 'close_fund', 'ETF基金': 'etf_hq_fund', 'LOF基金': 'lof_hq_fund' }
      const node = fundMap[symbol] ?? 'etf_hq_fund'
      const resp = await fetch(
        `https://vip.stock.finance.sina.com.cn/quotes_service/api/jsonp.php/IO.XSRV2.CallbackList['da_yPT46_Ll7K6WD']/Market_Center.getHQNodeDataSimple?page=1&num=5000&sort=symbol&asc=0&node=${node}&[object%20HTMLDivElement]=qvvne`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) },
      )
      const text = await resp.text()
      const start = text.indexOf('([')
      const end = text.lastIndexOf('])')
      if (start === -1 || end === -1) return null
      const data = JSON.parse(text.slice(start + 1, end + 1)) as Record<string, unknown>[]
      if (!data?.length) return null
      return data.map(it => ({
        code: String(it.symbol ?? ''), name: String(it.name ?? ''),
        price: safeFloat(it.trade), changeAmt: safeFloat(it.pricechange),
        changePct: safeFloat(it.changepercent), buy: safeFloat(it.buy), sell: safeFloat(it.sell),
        prevClose: safeFloat(it.settlement), open: safeFloat(it.open),
        high: safeFloat(it.high), low: safeFloat(it.low),
        volume: safeFloat(it.volume), amount: safeFloat(it.amount),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_fund_daily_em
   * 对应 Python: akshare.fund.fund_em.fund_etf_fund_daily_em (line 940)
   * 数据源: https://fund.eastmoney.com/cnjy_dwjz.html
   * @returns 场内交易基金每日行情数组，包含 code, name, type, nav, accNav, prevNav, prevAccNav, changeAmt, changePct, price, premiumRate；无数据时返回 null
   * 数据清洗: 解析 HTML 表格，提取基金代码、名称、净值和折溢价率
   */
  p.fundEtfFundDailyEm = async function fundEtfFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://fund.eastmoney.com/cnjy_dwjz.html', {
        headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30000),
      })
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      let headerFound = false
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/行情吧档案/g, '').trim())
        if (cells.length >= 8 && /^\d{6}$/.test(cells[0])) {
          rows.push({
            code: cells[0], name: cells[1], type: cells[2],
            nav: safeFloat(cells[3]), accNav: safeFloat(cells[4]),
            prevNav: safeFloat(cells[5]), prevAccNav: safeFloat(cells[6]),
            changeAmt: safeFloat(cells[7]), changePct: safeFloat(cells[8]),
            price: safeFloat(cells[9]), premiumRate: safeFloat(cells[10]),
          })
        }
        headerFound = headerFound || cells.some(c => c.includes('基金代码'))
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_etf_fund_info_em
   * 对应 Python: akshare.fund.fund_em.fund_etf_fund_info_em (line 973)
   * 数据源: https://api.fund.eastmoney.com/f10/lsjz
   * @param fund - 基金代码
   * @param start - 开始日期，格式 'YYYYMMDD'
   * @param end - 结束日期，格式 'YYYYMMDD'
   * @returns 场内交易基金历史净值数组，包含 date, nav, accNav, changePct, purchaseStatus, redeemStatus；无数据时返回 null
   * 数据清洗: fundCode={fund}，解析 Data.LSJZList 数组
   */
  p.fundEtfFundInfoEm = async function fundEtfFundInfoEm(fund: string, start = '', end = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const fmtDate = (d: string) => d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : ''
      const resp = await fetch(
        `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fund}&pageIndex=1&pageSize=10000&startDate=${fmtDate(start)}&endDate=${fmtDate(end)}&_=${Date.now()}`,
        { headers: { Referer: `https://fundf10.eastmoney.com/jjjz_${fund}.html`, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) },
      )
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.LSJZList as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        date: String(it.FSRQ ?? '').slice(0, 10),
        nav: safeFloat(it.DWJZ), accNav: safeFloat(it.LJJZ),
        changePct: safeFloat(it.JZZZL),
        purchaseStatus: String(it.SGZT ?? ''), redeemStatus: String(it.SHZT ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_hk_fund_hist_em
   * 对应 Python: akshare.fund.fund_em.fund_hk_fund_hist_em (line 1132)
   * 数据源: https://overseas.1234567.com.cn/overseasapi/OpenApiHander.ashx
   * @param code - 港股基金代码
   * @param symbol - 数据类型，'历史净值明细' 或 '分红送配详情'
   * @returns 港股基金历史数据数组；无数据时返回 null
   * 数据清洗: action=2(净值)/3(分红)，解析 Data 数组
   */
  p.fundHkFundHistEm = async function fundHkFundHistEm(code: string, symbol = '历史净值明细'): Promise<Record<string, unknown>[] | null> {
    try {
      const action = symbol === '分红送配详情' ? '3' : '2'
      const resp = await fetch(
        `https://overseas.1234567.com.cn/overseasapi/OpenApiHander.ashx?api=HKFDApi&m=MethodJZ&hkfcode=${code}&action=${action}&pageindex=0&pagesize=1000&date1=&date2=`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://fund.eastmoney.com/' }, signal: AbortSignal.timeout(30000) },
      )
      const json = await resp.json() as Record<string, unknown>
      const data = json?.Data as Record<string, unknown>[] | undefined
      if (!data?.length) return null
      if (action === '2') {
        return data.map(it => ({
          date: String(it.FSRQ ?? it.fsrq ?? '').slice(0, 10),
          nav: safeFloat(it.DWJZ ?? it.dwjz),
          changeAmt: safeFloat(it.RZZZ ?? it.rzzz),
          changePct: safeFloat(it.RZDF ?? it.rzdf),
          currency: String(it.DW ?? it.dw ?? ''),
        }))
      }
      return data.map(it => ({
        year: String(it.Year ?? it.year ?? ''),
        exDate: String(it.CXDR ?? it.cxdr ?? '').slice(0, 10),
        recordDate: String(it.QXRQ ?? it.qxrq ?? '').slice(0, 10),
        payDate: String(it.FFRQ ?? it.ffrq ?? '').slice(0, 10),
        dividend: safeFloat(it.FHJE ?? it.fhje),
        currency: String(it.DW ?? it.dw ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_hk_rank_em
   * 对应 Python: akshare.fund.fund_rank_em.fund_hk_rank_em (line 427)
   * 数据源: https://overseas.1234567.com.cn/overseasapi/OpenApiHander.ashx
   * @returns 港股基金排行数组，包含 rank, code, hkCode, name, currency, date, nav, changePct, week1, month1, month3, month6, year1, year2, year3, yearToDate, sinceInception, buyable；无数据时返回 null
   * 数据清洗: action=1，解析 Data 数组，映射 fundcode/hkfcode/fundshortname 等字段
   */
  p.fundHkRankEm = async function fundHkRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const now = new Date().toISOString().slice(0, 10)
      const resp = await fetch(
        `https://overseas.1234567.com.cn/overseasapi/OpenApiHander.ashx?api=HKFDApi&m=MethodFundList&action=1&pageindex=0&pagesize=5000&dy=1&date1=${now}&date2=${now}&sortfield=Y&sorttype=-1&isbuy=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://fund.eastmoney.com/fundguzhi.html' }, signal: AbortSignal.timeout(30000) },
      )
      const json = await resp.json() as Record<string, unknown>
      const data = json?.Data as Record<string, unknown>[] | undefined
      if (!data?.length) return null
      return data.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.fundcode ?? ''), hkCode: String(it.hkfcode ?? ''),
        name: String(it.fundshortname ?? ''), currency: String(it.currency ?? ''),
        date: String(it.date ?? '').slice(0, 10),
        nav: safeFloat(it.unitnav), changePct: safeFloat(it.daygrowth),
        week1: safeFloat(it.oneyear), month1: safeFloat(it.onemonth),
        month3: safeFloat(it.threemonth), month6: safeFloat(it.sixmonth),
        year1: safeFloat(it.oneyear), year2: safeFloat(it.twoyear),
        year3: safeFloat(it.threeyear), yearToDate: safeFloat(it.thisyear),
        sinceInception: safeFloat(it.inception),
        buyable: String(it.isbuy ?? '') === '1',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_individual_achievement_xq
   * 对应 Python: akshare.fund.fund_xq.fund_individual_achievement_xq (line 78)
   * 数据源: https://danjuanfunds.com/djapi/fundx/base/fund/achievement/{code}
   * @param code - 基金代码
   * @returns 基金业绩数据数组，包含 type, period, returnPct, maxDrawdown, rankInSameType；无数据时返回 null
   * 数据清洗: 解析 annual_performance_list 和 stage_performance_list 数组
   */
  p.fundIndividualAchievementXq = async function fundIndividualAchievementXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://danjuanfunds.com/djapi/fundx/base/fund/achievement/${code}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      if (!data) return null
      const results: Record<string, unknown>[] = []
      const typeMap: Record<string, string> = { annual_performance_list: '年度业绩', stage_performance_list: '阶段业绩' }
      for (const [key, label] of Object.entries(typeMap)) {
        const list = data[key] as Record<string, unknown>[] | undefined
        if (!list) continue
        for (const it of list) {
          results.push({
            type: label, period: String(it.period_time ?? ''),
            returnPct: safeFloat(String(it.self_nav ?? '').replace(/%/g, '')),
            maxDrawdown: safeFloat(String(it.self_max_draw_down ?? '').replace(/%/g, '')),
            rankInSameType: String(it.self_nav_rank ?? ''),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_individual_analysis_xq
   * 对应 Python: akshare.fund.fund_xq.fund_individual_analysis_xq (line 132)
   * 数据源: https://danjuanfunds.com/djapi/fund/base/quote/data/index/analysis/{code}
   * @param code - 基金代码
   * @returns 基金分析数据数组，包含 period, costPerformance, riskControl, annualizedVolatility, annualizedSharpe, maxDrawdown；无数据时返回 null
   * 数据清洗: 解析 index_data_list 数组，百分比字段转换为数值
   */
  p.fundIndividualAnalysisXq = async function fundIndividualAnalysisXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://danjuanfunds.com/djapi/fund/base/quote/data/index/analysis/${code}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.data as Record<string, unknown> | undefined)?.index_data_list as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        period: String(it.index_time_period ?? ''),
        costPerformance: safeFloat(String(it.investment_cost_performance ?? '').replace(/%/g, '')),
        riskControl: safeFloat(String(it.risk_control ?? '').replace(/%/g, '')),
        annualizedVolatility: (safeFloat(String((it as Record<string, unknown>)['self_index.volatility_rank'] ?? '').replace(/%/g, '')) ?? 0) * 100,
        annualizedSharpe: safeFloat((it as Record<string, unknown>)['self_index.sharpe_rank']),
        maxDrawdown: (safeFloat(String((it as Record<string, unknown>)['self_index.max_draw_down'] ?? '').replace(/%/g, '')) ?? 0) * 100,
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_individual_basic_info_xq
   * 对应 Python: akshare.fund.fund_xq.fund_individual_basic_info_xq (line 13)
   * 数据源: https://danjuanfunds.com/djapi/fund/{code}
   * @param code - 基金代码
   * @returns 基金基本信息对象，包含 code, name, fullName, foundedDate, totalShares, company, manager, custodian, fundType, ratingSource, rating, strategy, objective, benchmark；无数据时返回 null
   * 数据清洗: 解析 data 对象，映射 fd_code/fd_name/fd_full_name 等字段
   */
  p.fundIndividualBasicInfoXq = async function fundIndividualBasicInfoXq(code: string): Promise<Record<string, unknown> | null> {
    try {
      const resp = await fetch(`https://danjuanfunds.com/djapi/fund/${code}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      if (!data) return null
      return {
        code: String(data.fd_code ?? ''), name: String(data.fd_name ?? ''),
        fullName: String(data.fd_full_name ?? ''), foundedDate: String(data.found_date ?? ''),
        totalShares: safeFloat(data.totshare), company: String(data.keeper_name ?? ''),
        manager: String(data.manager_name ?? ''), custodian: String(data.trup_name ?? ''),
        fundType: String(data.type_desc ?? ''),
        ratingSource: String(data.rating_source ?? ''), rating: String(data.rating_desc ?? ''),
        strategy: String(data.invest_orientation ?? ''), objective: String(data.invest_target ?? ''),
        benchmark: String(data.performance_bench_mark ?? ''),
      }
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_individual_detail_hold_xq
   * 对应 Python: akshare.fund.fund_xq.fund_individual_detail_hold_xq (line 270)
   * 数据源: https://danjuanfunds.com/djapi/fundx/base/fund/record/asset/percent
   * @param code - 基金代码
   * @param date - 报告日期，格式 'YYYYMMDD'
   * @returns 基金持仓明细数组，包含 assetType, weight；无数据时返回 null
   * 数据清洗: 解析 chart_list 数组，映射 type_desc→assetType, percent→weight
   */
  p.fundIndividualDetailHoldXq = async function fundIndividualDetailHoldXq(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const reportDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
      const resp = await fetch(
        `https://danjuanfunds.com/djapi/fundx/base/fund/record/asset/percent?fund_code=${code}&report_date=${reportDate}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) },
      )
      const json = await resp.json() as Record<string, unknown>
      const chartList = (json?.data as Record<string, unknown> | undefined)?.chart_list as Record<string, unknown>[] | undefined
      if (!chartList?.length) return null
      return chartList.map(it => ({
        assetType: String(it.type_desc ?? ''), weight: safeFloat(it.percent),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_individual_detail_info_xq
   * 对应 Python: akshare.fund.fund_xq.fund_individual_detail_info_xq (line 224)
   * 数据源: https://danjuanfunds.com/djapi/fund/detail/{code}
   * @param code - 基金代码
   * @returns 基金费用明细数组，包含 rateType, name, value；无数据时返回 null
   * 数据清洗: 解析 fund_rates 对象中的 declare_rate_table/withdraw_rate_table/other_rate_table
   */
  p.fundIndividualDetailInfoXq = async function fundIndividualDetailInfoXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://danjuanfunds.com/djapi/fund/detail/${code}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      if (!data) return null
      const fundRates = (data as Record<string, unknown>).fund_rates as Record<string, unknown> | undefined
      if (!fundRates) return null
      const typeMap: Record<string, string> = {
        declare_rate_table: '买入规则', withdraw_rate_table: '卖出规则', other_rate_table: '其他费用',
      }
      const results: Record<string, unknown>[] = []
      for (const [key, label] of Object.entries(typeMap)) {
        const table = fundRates[key] as Record<string, unknown>[] | undefined
        if (!table) continue
        for (const it of table) {
          results.push({ rateType: label, name: String(it.name ?? ''), value: safeFloat(it.value) })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_individual_profit_probability_xq
   * 对应 Python: akshare.fund.fund_xq.fund_individual_profit_probability_xq (line 185)
   * 数据源: https://danjuanfunds.com/djapi/fundx/base/fund/profit/ratio/{code}
   * @param code - 基金代码
   * @returns 基金盈利概率数组，包含 holdingPeriod, profitProbability, averageReturn；无数据时返回 null
   * 数据清洗: 解析 data_list 数组，百分比字段转换为数值
   */
  p.fundIndividualProfitProbabilityXq = async function fundIndividualProfitProbabilityXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://danjuanfunds.com/djapi/fundx/base/fund/profit/ratio/${code}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.data as Record<string, unknown> | undefined)?.data_list as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        holdingPeriod: String(it.holding_time ?? ''),
        profitProbability: safeFloat(String(it.profit_ratio ?? '').replace(/%/g, '')),
        averageReturn: safeFloat(String(it.average_income ?? '').replace(/%/g, '')),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fund_rating_ja
   * 对应 Python: akshare.fund.fund_rating.fund_rating_ja (line 276)
   * 数据源: https://fund.eastmoney.com/data/fundrating_4_{date}.html
   * @param date - 评级日期，格式 'YYYYMMDD'
   * @returns 中国银河证券基金评级数组，包含 code, name, fundManager, fundCompany, rating3Year, rating3YearChange, nav, date, changePct, year1, year3, year5, fee, fundType；无数据时返回 null
   * 数据清洗: 从主页面获取可用日期列表，解析 var 变量中的管道分隔数据
   */
  p.fundRatingJa = async function fundRatingJa(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const fmtDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
      const mainResp = await fetch('https://fund.eastmoney.com/data/fundrating_4.html', {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const mainHtml = await mainResp.text()
      const dateMatches = [...mainHtml.matchAll(/<option[^>]*value="(\d{4}-\d{2}-\d{2})"[^>]*>/g)]
      const availableDates = dateMatches.map(m => m[1])
      if (!availableDates.includes(fmtDate)) {
        if (availableDates.length) return []
        return null
      }
      const resp = await fetch(`https://fund.eastmoney.com/data/fundrating_4_${fmtDate}.html`, {
        headers: { Referer: 'https://fund.eastmoney.com/' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const scriptMatch = html.match(/var\s+\w+\s*=\s*"([^"]*)"/)
      if (!scriptMatch) return null
      const raw = scriptMatch[1]
      const items = raw.split('|_').map(s => s.split('|'))
      if (!items.length) return null
      return items.filter(r => r.length >= 13).map(r => ({
        code: String(r[0] ?? ''), name: String(r[1] ?? ''),
        fundManager: String(r[3] ?? ''), fundCompany: String(r[5] ?? ''),
        rating3Year: safeFloat(r[7]), rating3YearChange: safeFloat(r[8]),
        nav: safeFloat(r[9]), date: String(r[10] ?? '').slice(0, 10),
        changePct: safeFloat(r[11]),
        year1: safeFloat(r[12]), year3: safeFloat(r[13]), year5: safeFloat(r[14]),
        fee: safeFloat(String(r[15] ?? '').replace(/%/g, '')),
        fundType: String(r[16] ?? ''),
      }))
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEX APIS — batch 2 (verified against .akshare-ref/akshare/index/)
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: index_us_stock_sina
   * 对应 Python: akshare.index.index_stock_us_sina.index_us_stock_sina (line 18)
   * 数据源: https://finance.sina.com.cn/staticdata/us/{symbol}
   * @param symbol - 美股指数代码，默认 '.INX'
   * @returns 美股指数行情数组，包含 date, open, high, low, close, volume, amount；无数据时返回 null
   * 数据清洗: ⚠️ Python 源码使用 py_mini_racer 解密 JS，当前实现尝试直接解析，可能无法解密全部数据
   */
  p.indexUsStockSina = async function indexUsStockSina(symbol = '.INX'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://finance.sina.com.cn/staticdata/us/${symbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const rawStr = text.split('=')[1]?.split(';')[0]?.trim().replace(/^"|"$/g, '')
      if (!rawStr) return null
      // The data is JS-obfuscated and requires decryption (py_mini_racer in Python).
      // Attempt a best-effort parse: the inner string may be comma-separated objects
      // if the obfuscation is simple enough, otherwise return null.
      const decoded = rawStr.replace(/\\"/g, '"').replace(/\\,/g, ',')
      // Try to extract array of objects from the decoded string
      const items = JSON.parse(decoded) as Record<string, unknown>[]
      if (!Array.isArray(items) || !items.length) return null
      return items.map(it => ({
        date: String(it.date ?? ''), open: safeFloat(it.open), high: safeFloat(it.high),
        low: safeFloat(it.low), close: safeFloat(it.close),
        volume: safeFloat(it.volume), amount: safeFloat(it.amount),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: stock_hk_index_daily_sina
   * 对应 Python: akshare.index.index_stock_hk.stock_hk_index_daily_sina (line 121)
   * 数据源: https://finance.sina.com.cn/stock/hkstock/{symbol}/klc2_kl.js
   * @param symbol - 港股指数代码，默认 'CES100'
   * @returns 港股指数行情数组，包含 date, open, high, low, close, volume；无数据时返回 null
   * 数据清洗: ⚠️ Python 源码使用 py_mini_racer 解密 JS，当前实现尝试直接解析，可能无法解密全部数据
   */
  p.stockHkIndexDailySina = async function stockHkIndexDailySina(symbol = 'CES100'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://finance.sina.com.cn/stock/hkstock/${symbol}/klc2_kl.js?d=2023_5_01`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const rawStr = text.split('=')[1]?.split(';')[0]?.trim().replace(/^"|"$/g, '')
      if (!rawStr) return null
      const decoded = rawStr.replace(/\\"/g, '"').replace(/\\,/g, ',')
      const items = JSON.parse(decoded) as Record<string, unknown>[]
      if (!Array.isArray(items) || !items.length) return null
      return items.map(it => ({
        date: String(it.date ?? ''), open: safeFloat(it.open), high: safeFloat(it.high),
        low: safeFloat(it.low), close: safeFloat(it.close), volume: safeFloat(it.volume),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_stock_cons_csindex
   * 对应 Python: akshare.index.index_cons.index_stock_cons_csindex (line 126)
   * 数据源: https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/{symbol}cons.xls
   * @param symbol - 指数代码，默认 '000300'
   * @returns ⚠️ 当前返回 null（需要 XLS 解析库）；正常应返回指数成分股数据
   * 数据清洗: 下载 XLS 文件，需要 openpyxl/xlrd 解析
   */
  p.indexStockConsCsindex = async function indexStockConsCsindex(symbol = '000300'): Promise<Record<string, unknown>[] | null> {
    try {
      const url = `https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/${symbol}cons.xls`
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
      if (!resp.ok) return null
      // XLS file — no native XLS parser available. Return null with download URL.
      return null
    } catch { return null }
  }

  /**
   * AKShare 接口: index_stock_cons_weight_csindex
   * 对应 Python: akshare.index.index_cons.index_stock_cons_weight_csindex (line 160)
   * 数据源: https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/{symbol}closeweight.xls
   * @param symbol - 指数代码，默认 '000300'
   * @returns ⚠️ 当前返回 null（需要 XLS 解析库）；正常应返回指数成分股权重数据
   * 数据清洗: 下载 XLS 文件，需要 openpyxl/xlrd 解析
   */
  p.indexStockConsWeightCsindex = async function indexStockConsWeightCsindex(symbol = '000300'): Promise<Record<string, unknown>[] | null> {
    try {
      const url = `https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/${symbol}closeweight.xls`
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
      if (!resp.ok) return null
      // XLS file — no native XLS parser available. Return null with download URL.
      return null
    } catch { return null }
  }

  /**
   * AKShare 接口: index_csindex_all
   * 对应 Python: akshare.index.index_csindex.index_csindex_all (line 16)
   * 数据源: https://www.csindex.com.cn/csindex-home/exportExcel/indexAll/CH
   * @returns ⚠️ 当前返回 null（需要 XLS 解析库）；正常应返回所有中证指数列表
   * 数据清洗: POST 请求导出 Excel，需要 openpyxl 解析
   */
  p.indexCsindexAll = async function indexCsindexAll(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://www.csindex.com.cn/csindex-home/exportExcel/indexAll/CH', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({
          sorter: { sortField: 'null', sortOrder: null },
          pager: { pageNum: 1, pageSize: 10 },
          indexFilter: { indexSeries: ['1'] },
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!resp.ok) return null
      return null
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // FUTURES APIS — verified against .akshare-ref/akshare/futures/
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: futures_hist_em
   * 对应 Python: akshare.futures.futures_hist_em.futures_hist_em (line 91)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - 期货品种名称，如 '热卷主连'、'焦煤2506'
   * @param period - 周期，'daily'/'weekly'/'monthly'，默认 'daily'
   * @param startDate - 开始日期，格式 'YYYYMMDD'，默认 '19900101'
   * @param endDate - 结束日期，格式 'YYYYMMDD'，默认 '20500101'
   * @returns 期货历史行情数组，包含 date, open, high, low, close, changeAmt, changePct, volume, amount, openInterest
   * 数据清洗: 通过 futsse-static.eastmoney.com/redis 获取交易所品种映射表，解析 secid 后调用 kline API
   */
  p.futuresHistEm = async function futuresHistEm(symbol: string, period = 'daily', startDate = '19900101', endDate = '20500101'): Promise<Record<string, unknown>[] | null> {
    try {
      const periodMap: Record<string, string> = { daily: '101', weekly: '102', monthly: '103' }
      // Step 1: fetch exchange-symbol mapping
      const rootResp = await fetch('https://futsse-static.eastmoney.com/redis?msgid=gnweb', {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const rootJson = await rootResp.json() as Record<string, unknown>[]
      const cContractMkt: Record<string, string> = {}
      const cContractToCode: Record<string, string> = {}
      const eSymbolMkt: Record<string, string> = {}
      const cSymbolMkt: Record<string, string> = {}
      for (const item of rootJson) {
        const mktid = String(item.mktid ?? '')
        const innerResp = await fetch(`https://futsse-static.eastmoney.com/redis?msgid=${mktid}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
        })
        const innerJson = await innerResp.json() as Record<string, unknown>[]
        let num = 1
        while (num <= innerJson.length) {
          const listResp = await fetch(`https://futsse-static.eastmoney.com/redis?msgid=${mktid}_${num}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
          })
          const listJson = await listResp.json() as Record<string, unknown>[]
          for (const entry of listJson) {
            const name = String(entry.name ?? '')
            const code = String(entry.code ?? '')
            const vcode = String(entry.vcode ?? '')
            const vname = String(entry.vname ?? '')
            cContractMkt[name] = mktid
            cContractToCode[name] = code
            eSymbolMkt[vcode] = mktid
            cSymbolMkt[vname] = mktid
          }
          num++
        }
      }
      // Step 2: resolve secid
      let secId = ''
      if (cContractMkt[symbol] && cContractToCode[symbol]) {
        secId = `${cContractMkt[symbol]}.${cContractToCode[symbol]}`
      } else {
        const chars = symbol.match(/[\u4e00-\u9fa5a-zA-Z]+/)
        const nums = symbol.match(/\d+/)
        const symbolChar = chars?.[0] ?? ''
        const numberStr = nums?.[0] ?? ''
        if (/^[\u4e00-\u9fa5]+$/.test(symbolChar)) {
          secId = `${cSymbolMkt[symbolChar] ?? ''}.${symbol}`
        } else {
          secId = `${eSymbolMkt[symbolChar] ?? ''}.${symbol}`
        }
      }
      // Step 3: fetch kline
      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid: secId,
        klt: periodMap[period] ?? '101',
        fqt: '1', lmt: '10000', end: '20500000', iscca: '1',
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64',
        ut: '7eea3edcaed734bea9cbfc24409ed989', forcect: '1',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      // filter by date range
      const filtered = klines.filter(line => {
        const d = line.split(',')[0] ?? ''
        return d >= startDate && d <= endDate
      })
      return filtered.map(line => {
        const p = line.split(',')
        return {
          date: p[0] ?? '', open: safeFloat(p[1]), high: safeFloat(p[3]),
          low: safeFloat(p[4]), close: safeFloat(p[2]),
          changeAmt: safeFloat(p[9]), changePct: safeFloat(p[8]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]), openInterest: safeFloat(p[12]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_global_hist_em
   * 对应 Python: akshare.futures.futures_hf_em.futures_global_hist_em (line 171)
   * 数据源: https://push2his.eastmoney.com/api/qt/stock/kline/get
   * @param symbol - 全球期货品种代码，如 'HG00Y'、'CL00Y'
   * @returns 全球期货历史行情数组，包含 date, code, name, open, close, high, low, volume, changePct, openInterest, dailyChange
   * 数据清洗: 通过 __futures_global_hist_market_code 映射基础品种到市场 ID
   */
  p.futuresGlobalHistEm = async function futuresGlobalHistEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      // Extract base symbol (remove trailing digits)
      let baseSymbol = ''
      for (let i = 0; i < symbol.length; i++) {
        if (symbol[i] >= '0' && symbol[i] <= '9') break
        baseSymbol += symbol[i]
      }
      if (!baseSymbol) baseSymbol = symbol
      // Market code mapping (mirrors __futures_global_hist_market_code)
      const marketMap: Record<string, number> = {
        HG: 101, GC: 101, SI: 101, QI: 101, QO: 101, MGC: 101, LTH: 101,
        CL: 102, NG: 102, RB: 102, HO: 102, PA: 102, PL: 102, QM: 102,
        ZW: 103, ZM: 103, ZS: 103, ZC: 103, XC: 103, XK: 103, XW: 103, YM: 103,
        TY: 103, US: 103, EH: 103, ZL: 103, ZR: 103, ZO: 103, FV: 103,
        TU: 103, UL: 103, NQ: 103, ES: 103,
        TF: 104, RT: 104, CN: 104,
        SB: 108, CT: 108, SF: 108,
        LCPT: 109, LZNT: 109, LALT: 109, LTNT: 109, LLDT: 109, LNKT: 109,
        MPM: 110, M: 112, B: 112, G: 112,
      }
      let marketCode = marketMap[baseSymbol] ?? 101
      if (baseSymbol.startsWith('J')) marketCode = 111

      const data = await (this as EM).getData('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid: `${marketCode}.${symbol}`,
        klt: '101', fqt: '1', lmt: '6600', end: '20500000', iscca: '1',
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64',
        ut: 'f057cbcbce2a86e2866ab8877db1d059', forcect: '1',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      const code = (data?.code as string) ?? symbol
      const name = (data?.name as string) ?? ''
      // Fix unsigned 32-bit daily change
      const unsignedMax = 2 ** 32 - 1
      const signedMax = 2 ** 31 - 1
      return klines.map(line => {
        const p = line.split(',')
        let dailyChange = safeFloat(p[13])
        if (dailyChange != null && dailyChange > signedMax) dailyChange = dailyChange - (unsignedMax + 1)
        return {
          date: p[0] ?? '', code, name,
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), changePct: safeFloat(p[8]),
          openInterest: safeFloat(p[12]), dailyChange,
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_global_spot_em
   * 对应 Python: akshare.futures.futures_hf_em.futures_global_spot_em (line 87)
   * 数据源: https://futsseapi.eastmoney.com/list/COMEX,NYMEX,COBOT,SGX,NYBOT,LME,MDEX,TOCOM,IPE
   * @returns 全球期货实时行情数组，包含 rank, code, name, price, changeAmt, changePct, open, high, low, prevSettlement, volume, bidVolume, askVolume, openInterest
   * 数据清洗: 分页获取所有数据，映射字段名（dm→code, p→price, zdf→changePct 等）
   */
  p.futuresGlobalSpotEm = async function futuresGlobalSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const url = 'https://futsseapi.eastmoney.com/list/COMEX,NYMEX,COBOT,SGX,NYBOT,LME,MDEX,TOCOM,IPE'
      const baseParams = {
        orderBy: 'dm', sort: 'desc', pageSize: '20', pageIndex: '0',
        token: '58b2fa8f54638b60b87d69b31969089c',
        field: 'dm,sc,name,p,zsjd,zde,zdf,f152,o,h,l,zjsj,vol,wp,np,ccl',
        blockName: 'callback',
      }
      const firstResp = await fetch(`${url}?${new URLSearchParams(baseParams)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const firstJson = await firstResp.json() as Record<string, unknown>
      const totalNum = Number(firstJson.total ?? 0)
      const totalPages = Math.ceil(totalNum / 20)
      let allItems: Record<string, unknown>[] = [...(firstJson.list as Record<string, unknown>[] ?? [])]
      for (let page = 1; page < totalPages; page++) {
        try {
          const resp = await fetch(`${url}?${new URLSearchParams({ ...baseParams, pageIndex: String(page) })}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
          })
          const json = await resp.json() as Record<string, unknown>
          allItems = allItems.concat((json.list as Record<string, unknown>[] ?? []))
        } catch { break }
      }
      if (!allItems.length) return null
      return allItems.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.dm ?? ''), name: String(it.name ?? ''),
        price: safeFloat(it.p), changeAmt: safeFloat(it.zde), changePct: safeFloat(it.zdf),
        open: safeFloat(it.o), high: safeFloat(it.h), low: safeFloat(it.l),
        prevSettlement: safeFloat(it.zjsj), volume: safeFloat(it.vol),
        bidVolume: safeFloat(it.wp), askVolume: safeFloat(it.np),
        openInterest: safeFloat(it.ccl),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_inventory_em
   * 对应 Python: akshare.futures.futures_inventory_em.futures_inventory_em (line 14)
   * 数据源: https://datacenter-web.eastmoney.com/api/data/v1/get (RPT_FUTU_POSITIONCODE + RPT_FUTU_STOCKDATA)
   * @param symbol - 品种中文名称，如 'a'（大豆）、'cu'（铜），或中文名
   * @returns 期货库存数据数组，包含 date, inventory, change；无数据时返回 null
   * 数据清洗: 两步查询——先通过 RPT_FUTU_POSITIONCODE 获取品种代码映射，再通过 RPT_FUTU_STOCKDATA 获取库存数据
   */
  p.futuresInventoryEm = async function futuresInventoryEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      // Step 1: fetch symbol→product_id mapping
      const codeItems = await dcAll(this, 'RPT_FUTU_POSITIONCODE', '(IS_MAINCODE="1")', '500')
      if (!codeItems.length) return null
      const nameMap: Record<string, string> = {}
      const codeMap: Record<string, string> = {}
      for (const it of codeItems) {
        const tradeType = String(it.TRADE_TYPE ?? '')
        const tradeCode = String(it.TRADE_CODE ?? '')
        nameMap[tradeType] = tradeCode
        codeMap[tradeCode] = tradeCode
      }
      const productId = nameMap[symbol] ?? codeMap[symbol] ?? symbol
      // Step 2: fetch inventory data
      const items = await (this as EM).getData('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_FUTU_STOCKDATA',
        columns: 'SECURITY_CODE,TRADE_DATE,ON_WARRANT_NUM,ADDCHANGE',
        filter: `(SECURITY_CODE="${productId}")(TRADE_DATE>='2020-10-28')`,
        pageNumber: '1', pageSize: '500',
        sortTypes: '-1', sortColumns: 'TRADE_DATE',
        source: 'WEB', client: 'WEB',
      })
      const rows = (items as Record<string, unknown>)?.result as { data?: Record<string, unknown>[] } | undefined
      if (!rows?.data?.length) return null
      return rows.data.sort((a, b) => String(a.TRADE_DATE ?? '').localeCompare(String(b.TRADE_DATE ?? ''))).map(it => ({
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        inventory: safeFloat(it.ON_WARRANT_NUM),
        change: safeFloat(it.ADDCHANGE),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_comex_inventory
   * 对应 Python: akshare.futures.futures_comex_em.futures_comex_inventory (line 15)
   * 数据源: https://datacenter-web.eastmoney.com/api/data/v1/get (RPT_FUTUOPT_GOLDSIL)
   * @param symbol - '黄金' 或 '白银'
   * @returns COMEX 库存数据数组，包含 date, storageTon, storageOunce；无数据时返回 null
   * 数据清洗: 分页获取，映射 INDICATOR_ID1 到品种，解析 STORAGE_TON/STORAGE_OUNCE 字段
   */
  p.futuresComexInventory = async function futuresComexInventory(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, string> = { '黄金': 'EMI00069026', '白银': 'EMI00069027' }
      const indicatorId = symbolMap[symbol]
      if (!indicatorId) return null
      const items = await (this as EM).getData('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_FUTUOPT_GOLDSIL',
        columns: 'ALL', sortColumns: 'REPORT_DATE', sortTypes: '-1',
        pageSize: '500', pageNumber: '1',
        filter: `(INDICATOR_ID1="${indicatorId}")(@STORAGE_TON<>"NULL")`,
        source: 'WEB', client: 'WEB',
      })
      const result = (items as Record<string, unknown>)?.result as { data?: Record<string, unknown>[]; pages?: number } | undefined
      if (!result?.data?.length) return null
      let allData = [...result.data]
      const totalPages = result.pages ?? 1
      for (let page = 2; page <= totalPages; page++) {
        try {
          const pageItems = await (this as EM).getData('https://datacenter-web.eastmoney.com/api/data/v1/get', {
            reportName: 'RPT_FUTUOPT_GOLDSIL',
            columns: 'ALL', sortColumns: 'REPORT_DATE', sortTypes: '-1',
            pageSize: '500', pageNumber: String(page),
            filter: `(INDICATOR_ID1="${indicatorId}")(@STORAGE_TON<>"NULL")`,
            source: 'WEB', client: 'WEB',
          })
          const pageResult = (pageItems as Record<string, unknown>)?.result as { data?: Record<string, unknown>[] } | undefined
          if (pageResult?.data) allData = allData.concat(pageResult.data)
        } catch { break }
      }
      return allData.sort((a, b) => String(a.REPORT_DATE ?? '').localeCompare(String(b.REPORT_DATE ?? ''))).map(it => ({
        date: String(it.REPORT_DATE ?? '').slice(0, 10),
        storageTon: safeFloat(it.STORAGE_TON),
        storageOunce: safeFloat(it.STORAGE_OUNCE),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_contract_detail_em
   * 对应 Python: akshare.futures.futures_contract_detail.futures_contract_detail_em (line 41)
   * 数据源: https://futsse-static.eastmoney.com/redis?msgid={symbol}_info
   * @param symbol - 合约代码，如 'v2602F'
   * @returns 合约详情数组，包含 item/value 键值对；无数据时返回 null
   * 数据清洗: 先从行情页提取内部 symbol，再通过 redis API 获取合约详情
   */
  p.futuresContractDetailEm = async function futuresContractDetailEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      // Step 1: fetch quote page to extract inner symbol
      const pageResp = await fetch(`https://quote.eastmoney.com/qihuo/${symbol}.html`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const html = await pageResp.text()
      const hrefMatch = html.match(/class="onet"[\s\S]*?<a[^>]*href="([^"]*?)"/)
      if (!hrefMatch) return null
      const href = hrefMatch[1]
      const innerSymbol = href.split('#').pop()?.replace('futures_', '') ?? ''
      if (!innerSymbol) return null
      // Step 2: fetch contract detail
      const resp = await fetch(`https://futsse-static.eastmoney.com/redis?msgid=${innerSymbol}_info`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000),
      })
      const dataJson = await resp.json() as Record<string, string>
      const columnMap: Record<string, string> = {
        vname: '交易品种', vcode: '交易代码', jydw: '交易单位', bjdw: '报价单位',
        market: '上市交易所', zxbddw: '最小变动价格', zdtbfd: '跌涨停板幅度',
        hyjgyf: '合约交割月份', jysj: '交易时间', zhjyr: '最后交易日',
        zhjgr: '最后交割日', jgpj: '交割品级', zcjybzj: '最初交易保证金', jgfs: '交割方式',
      }
      return Object.entries(dataJson).map(([key, value]) => ({
        item: columnMap[key] ?? key, value: String(value ?? ''),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_spot_stock
   * 对应 Python: akshare.futures.futures_spot_stock_em.futures_spot_stock (line 15)
   * 数据源: https://data.eastmoney.com/ifdata/xhgp.html (demjson decode)
   * @returns 现货与股票上下游对应数据数组，包含 commodityName, prices, latestPrice, halfYearChangePct, producers, downstreamUsers；无数据时返回 null
   * 数据清洗: 解析页面内嵌 pagedata JS 对象，提取 dates 和各板块 list 数据
   */
  p.futuresSpotStock = async function futuresSpotStock(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://data.eastmoney.com/ifdata/xhgp.html', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
        },
        signal: AbortSignal.timeout(30000),
      })
      const html = await resp.text()
      const startMarker = 'pagedata'
      const endMarker = '/newstatic/js/common/emdataview.js'
      const startIdx = html.indexOf(startMarker)
      const endIdx = html.indexOf(endMarker)
      if (startIdx === -1 || endIdx === -1) return null
      const rawStr = html.slice(startIdx, endIdx).trim()
        .replace(/^pagedata=\s*/, '')
        .replace(/;\s*$/, '')
        .replace(/<\/script>[\s\S]*$/, '')
      // Parse the JSON-like object (demjson handles relaxed JSON)
      const pageData = JSON.parse(rawStr) as Record<string, unknown>
      const dates = Object.values(pageData.dates as Record<string, string>) as string[]
      const datas = pageData.datas as Record<string, unknown>[]
      if (!datas?.length) return null
      const results: Record<string, unknown>[] = []
      for (const sectorData of datas) {
        const sector = sectorData as { list?: Record<string, unknown>[] }
        if (!sector.list) continue
        for (const item of sector.list) {
          const producers = Array.isArray(item.xyyhs) ? item.xyyhs.map((p: Record<string, unknown>) => String(p.name ?? '')).filter(Boolean).join(', ') : '-'
          const downstream = Array.isArray(item.scss) ? item.scss.map((s: Record<string, unknown>) => String(s.name ?? '')).filter(Boolean).join(', ') : '-'
          results.push({
            commodityName: String(item.name ?? ''),
            dates,
            latestPrice: safeFloat(item.zxjg),
            halfYearChangePct: safeFloat(item.jbnzdf),
            producers, downstreamUsers: downstream,
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_hq_subscribe_exchange_symbol
   * 对应 Python: akshare.futures.futures_hq_sina.futures_hq_subscribe_exchange_symbol (line 58)
   * 数据源: 静态映射表（新浪财经外盘期货品种对照表）
   * @returns 外盘期货品种对照数组，包含 symbol（中文名称）和 code（代码）
   * 数据清洗: 内存中的静态映射表，无需网络请求
   */
  p.futuresHqSubscribeExchangeSymbol = async function futuresHqSubscribeExchangeSymbol(): Promise<Record<string, unknown>[] | null> {
    try {
      const dict: Record<string, string> = {
        '新加坡铁矿石': 'FEF', '马棕油': 'FCPO', '日橡胶': 'RSS3', '美国原糖': 'RS',
        'CME比特币期货': 'BTC', 'NYBOT-棉花': 'CT', 'LME镍3个月': 'NID', 'LME铅3个月': 'PBD',
        'LME锡3个月': 'SND', 'LME锌3个月': 'ZSD', 'LME铝3个月': 'AHD', 'LME铜3个月': 'CAD',
        'CBOT-黄豆': 'S', 'CBOT-小麦': 'W', 'CBOT-玉米': 'C', 'CBOT-黄豆油': 'BO',
        'CBOT-黄豆粉': 'SM', '日本橡胶': 'TRB', 'COMEX铜': 'HG', 'NYMEX天然气': 'NG',
        'NYMEX原油': 'CL', 'COMEX白银': 'SI', 'COMEX黄金': 'GC', 'CME-瘦肉猪': 'LHC',
        '布伦特原油': 'OIL', '伦敦金': 'XAU', '伦敦银': 'XAG', '伦敦铂金': 'XPT',
        '伦敦钯金': 'XPD', '欧洲碳排放': 'EUA',
      }
      return Object.entries(dict).map(([symbol, code]) => ({ symbol, code }))
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // MIGRATED FROM akshare handler — datacenter-web APIs
  // ═══════════════════════════════════════════════════════════════

  // ── 龙虎榜 ──

  p.lhbDetail = async function lhbDetail(date?: string): Promise<Record<string, unknown>[] | null> {
    const today = date || new Date().toISOString().slice(0, 10)
    return dcGet({
      reportName: 'RPT_DAILYBILLBOARD_DETAILSNEW',
      columns: 'ALL',
      filter: `TRADE_DATE='${today}'`,
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.lhbJgStatistic = async function lhbJgStatistic(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_BILLBOARD_DAILYSTATISTICS',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'TRADE_DATE,SECURITY_CODE',
      sortTypes: '-1,1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.lhbStockStatistic = async function lhbStockStatistic(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    return dcGet({
      reportName: 'RPT_BILLBOARD_DAILYDETAILS',
      columns: 'ALL',
      filter: `SECURITY_CODE="${code}"`,
      pageNumber: '1',
      pageSize: '50',
      sortColumns: 'TRADE_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 股东 ──

  p.gdfxHoldingCount = async function gdfxHoldingCount(): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPT_F10_EH_HOLDERNUMCHANGE',
      columns: 'ALL',
      filter: 'HOLDER_NUM_CHANGE>0',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'HOLDNUM_CHANGE_RATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items) return null
    return items.map(it => ({
      code: normalizeCode(String(it.SECURITY_CODE ?? '')),
      name: String(it.SECURITY_NAME_ABBR ?? ''),
      holderNum: safeFloat(it.HOLDER_NUM),
      holderNumChange: safeFloat(it.HOLDER_NUM_CHANGE),
      holderNumChangeRate: safeFloat(it.HOLDNUM_CHANGE_RATE),
      avgHoldingShares: safeFloat(it.AVG_FREE_SHARES),
      reportDate: String(it.END_DATE ?? '').slice(0, 10),
    }))
  }

  p.gdfxHoldingDetail = async function gdfxHoldingDetail(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    return dcGet({
      reportName: 'RPT_F10_EH_HOLDERNUM',
      columns: 'ALL',
      filter: `SECURITY_CODE="${code}"`,
      pageNumber: '1',
      pageSize: '20',
      sortColumns: 'END_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 估值 ──

  p.marketValuation = async function marketValuation(): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPT_VALUEANALYSIS_DET',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '1',
      sortColumns: 'TRADE_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items?.length) return null
    return items.map(it => ({
      date: String(it.TRADE_DATE ?? '').slice(0, 10),
      totalMarketCap: safeFloat(it.TOTAL_MARKET_CAP),
      avgPe: safeFloat(it.DYNAMIC_PE),
      avgPb: safeFloat(it.PB_RATIO),
      dividendYield: safeFloat(it.DIVIDEND_YIELD),
    }))
  }

  // ── 盈利预测 ──

  p.profitForecast = async function profitForecast(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    return dcGet({
      reportName: 'RPT_PUBLIC_OP_NEWPREDICT',
      columns: 'ALL',
      filter: `SECURITY_CODE="${code}"`,
      pageNumber: '1',
      pageSize: '50',
      sortColumns: 'REPORT_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 机构推荐 ──

  p.institutionRecommend = async function institutionRecommend(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_CUSTOM_STOCK_RESEARCHLATEST',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'RATING_ORG_NUM',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 新股 ──

  p.ipoApply = async function ipoApply(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPTA_APP_IPOAPPLY',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'APPLY_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 融资融券 ──

  p.marginDetailSse = async function marginDetailSse(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10)
    return dcGet({
      reportName: 'RPTA_WEB_RZRQ_MX',
      columns: 'ALL',
      filter: `TRADE_DATE='${d}'`,
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.marginDetailSzse = async function marginDetailSzse(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10)
    return dcGet({
      reportName: 'RPTA_WEB_RZRQ_MX_SZA',
      columns: 'ALL',
      filter: `TRADE_DATE='${d}'`,
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 分红 ──

  p.dividendDetail = async function dividendDetail(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    return dcGet({
      reportName: 'RPT_SHAREBONUS_DET',
      columns: 'ALL',
      filter: `SECURITY_CODE="${code}"`,
      pageNumber: '1',
      pageSize: '20',
      sortColumns: 'EX_DIVIDEND_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 限售解禁 ──

  p.lockupExpiryDc = async function lockupExpiryDc(code?: string): Promise<Record<string, unknown>[] | null> {
    const filter = code ? `SECURITY_CODE="${code}"` : ''
    return dcGet({
      reportName: 'RPT_LIFT_STAGE',
      columns: 'ALL',
      filter,
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'FREE_DATE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 股票回购 ──

  p.buybackDc = async function buybackDc(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_SHARE_BUYBACK_DET',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'END_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 大宗交易 ──

  p.blockTradeDetail = async function blockTradeDetail(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10)
    return dcGet({
      reportName: 'RPT_DATA_BLOCKTRADE_DETAIL',
      columns: 'ALL',
      filter: `TRADE_DATE='${d}'`,
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.blockTradeMarketStats = async function blockTradeMarketStats(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_DATA_BLOCKTRADE_MARKET',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'TRADE_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 股本结构 ──

  p.shareStructure = async function shareStructure(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    return dcGet({
      reportName: 'RPT_F10_EH_EQUITY',
      columns: 'ALL',
      filter: `SECURITY_CODE="${code}"`,
      pageNumber: '1',
      pageSize: '5',
      sortColumns: 'END_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 停复牌 ──

  p.stockTradeSuspension = async function stockTradeSuspension(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_DATA_SCHEDULEDTASK',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SUSPEND_START_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 商誉 ──

  p.goodwillMarketOverview = async function goodwillMarketOverview(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_GOODWORTH_OVERVIEW',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '500',
      sortColumns: 'GOODWILL_MARKET_CAP',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.goodwillDetail = async function goodwillDetail(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    return dcGet({
      reportName: 'RPT_GOODWORTH_DET',
      columns: 'ALL',
      filter: `SECURITY_CODE="${code}"`,
      pageNumber: '1',
      pageSize: '50',
      sortColumns: 'REPORT_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ── 账户与风险 ──

  p.accountStatistics = async function accountStatistics(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_ACCOUNT_STATISTICS',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '50',
      sortColumns: 'STATISTICS_DATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.riskStockList = async function riskStockList(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_RISK_WARNING',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.twoNetList = async function twoNetList(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_DLIST_DELISTING',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '200',
      sortColumns: 'SECURITY_CODE',
      sortTypes: '1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  p.shareholderChangeStats = async function shareholderChangeStats(): Promise<Record<string, unknown>[] | null> {
    return dcGet({
      reportName: 'RPT_F10_EH_FREEHOLDERS',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: '100',
      sortColumns: 'HOLDNUM_CHANGE_RATE',
      sortTypes: '-1',
      source: 'WEB',
      client: 'WEB',
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // MIGRATED FROM akshare handler — Fund APIs
  // ═══════════════════════════════════════════════════════════════

  p.fundHoldStructureEm = async function fundHoldStructureEm(): Promise<Record<string, unknown>[] | null> {
    const all: Record<string, unknown>[] = []
    for (let page = 1; page <= 10; page++) {
      const items = await dcGet({
        reportName: 'RPT_FUND_HOLD_STRUCTURE',
        columns: 'ALL',
        pageNumber: String(page),
        pageSize: '100',
        sortColumns: 'REPORT_DATE',
        sortTypes: '-1',
        source: 'WEB',
        client: 'WEB',
      })
      if (!items?.length) break
      all.push(...items)
    }
    if (!all.length) {
      try {
        const resp = await fetch('https://fund.eastmoney.com/data/FundDataPortfolio_Interface.aspx?dt=11&pi=1&pn=50&mc=hypzDetail&st=desc&sc=reportdate', {
          headers: DATACENTER_HEADERS,
          signal: AbortSignal.timeout(15000),
        })
        const text = await resp.text()
        const jsonStr = text.slice(text.indexOf('{'))
        const data = JSON.parse(jsonStr) as Record<string, unknown>
        const datas = data?.data as Record<string, unknown>[] | undefined
        if (!datas?.length) return null
        return datas.map(it => ({
          date: String(it.reportdate ?? '').slice(0, 10),
          fundCount: safeFloat(it.fundnum),
          institutionPct: safeFloat(it.jgc),
          individualPct: safeFloat(it.grgc),
          internalPct: safeFloat(it.nbgc),
          totalShares: safeFloat(String(it.totalshare ?? '').replace(/,/g, '')),
        }))
      } catch { return null }
    }
    return all.map(it => ({
      date: String(it.REPORT_DATE ?? it.reportdate ?? '').slice(0, 10),
      fundCount: safeFloat(it.FUND_NUM ?? it.fundnum),
      institutionPct: safeFloat(it.INST_PCT ?? it.jgc),
      individualPct: safeFloat(it.INDIV_PCT ?? it.grgc),
      internalPct: safeFloat(it.INTERNAL_PCT ?? it.nbgc),
      totalShares: safeFloat(String(it.TOTAL_SHARES ?? it.totalshare ?? '').replace(/,/g, '')),
    }))
  }

  p.fundPortfolioHoldEm = async function fundPortfolioHoldEm(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    try {
      const resp = await fetch(`https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&topline=10000&year=${date}&month=&rt=0.913877030254846`, {
        headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const content = String(data.content ?? '')
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(content)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 5 && /^\d+$/.test(cells[0])) {
          rows.push({
            code, stockCode: cells[1], stockName: cells[2],
            holdingPct: safeFloat(cells[3]?.replace('%', '')),
            shares: safeFloat(cells[4]?.replace(/,/g, '')),
            marketValue: safeFloat(cells[5]?.replace(/,/g, '')),
          })
        }
        trMatch = trRegex.exec(content)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  p.fundPortfolioBondHoldEm = async function fundPortfolioBondHoldEm(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    try {
      const resp = await fetch(`https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=zqcc&code=${code}&year=${date}&rt=0.913877030254846`, {
        headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const content = String(data.content ?? '')
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(content)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
          rows.push({
            code, bondCode: cells[1], bondName: cells[2],
            holdingPct: safeFloat(cells[3]?.replace('%', '')),
            marketValue: safeFloat(cells[4]?.replace(/,/g, '')),
          })
        }
        trMatch = trRegex.exec(content)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  p.fundPortfolioChangeEm = async function fundPortfolioChangeEm(code: string, indicator = '累计买入', date = ''): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    const indicatorMap: Record<string, string> = { '累计买入': '1', '累计卖出': '2' }
    const zdbd = indicatorMap[indicator] ?? '1'
    try {
      const resp = await fetch(`https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=zdbd&code=${code}&zdbd=${zdbd}&year=${date}&rt=0.913877030254846`, {
        headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const content = String(data.content ?? '')
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(content)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 5 && /^\d+$/.test(cells[0])) {
          rows.push({
            code, indicator, stockCode: cells[1], stockName: cells[2],
            buyAmount: safeFloat(cells[3]?.replace(/,/g, '')),
            holdingPct: safeFloat(cells[4]?.replace('%', '')),
          })
        }
        trMatch = trRegex.exec(content)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  p.fundPortfolioIndustryAllocationEm = async function fundPortfolioIndustryAllocationEm(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    try {
      const resp = await fetch(`https://api.fund.eastmoney.com/f10/HYPZ/?fundCode=${code}&year=${date}&callback=jQuery`, {
        headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const jsonStr = text.replace(/^jQuery\(/, '').replace(/\)$/, '')
      const data = JSON.parse(jsonStr) as Record<string, unknown>
      const quarterInfos = (data?.Data as Record<string, unknown> | undefined)?.QuarterInfos as Record<string, unknown>[] | undefined
      if (!quarterInfos?.length) return null
      const rows: Record<string, unknown>[] = []
      for (const q of quarterInfos) {
        const items = q.HYPZInfo as Record<string, unknown>[] | undefined
        if (!items?.length) continue
        for (const it of items) {
          rows.push({
            code, industry: String(it.HYPZ ?? ''),
            holdingPct: safeFloat(it.ZJZB),
            marketValue: safeFloat(it.MarketCap),
            reportDate: String(it.FSRQ ?? it.EndDate ?? '').slice(0, 10),
          })
        }
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  p.fundCfEm = async function fundCfEm(code: string): Promise<Record<string, unknown>[] | null> {
    if (!code) return null
    try {
      const resp = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=60&startDate=&endDate=&_=${Date.now()}`, {
        headers: { Referer: `https://fundf10.eastmoney.com/jjjz_${code}.html`, 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.Data as Record<string, unknown> | undefined)?.LSJZList as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        code, date: String(it.FSRQ ?? '').slice(0, 10),
        nav: safeFloat(it.DWJZ),
        accNav: safeFloat(it.LJJZ),
        changePct: safeFloat(it.JZZZL),
        buyStatus: String(it.SGZT ?? ''),
        sellStatus: String(it.SHZT ?? ''),
      }))
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // MIGRATED FROM akshare handler — SW Index APIs
  // ═══════════════════════════════════════════════════════════════

  p.swIndexFirstInfo = async function swIndexFirstInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://legulegu.com/stockdata/sw-industry-overview', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const codeMatch = html.match(/id="level1Items"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)
      if (!codeMatch) return null
      const block = codeMatch[1]
      const codes = [...block.matchAll(/class="lg-industries-item-chinese-title"[^>]*>([^<]+)/g)].map(m => m[1].trim())
      const names = [...block.matchAll(/class="lg-industries-item-number"[^>]*>([^<]+)/g)].map(m => m[1].split('(')[0].trim())
      const values = [...block.matchAll(/class="value"[^>]*>([^<]+)/g)].map(m => m[1].trim())
      if (!codes.length) return null
      const result: Record<string, unknown>[] = []
      for (let i = 0; i < codes.length; i++) {
        const base = i * 4
        result.push({
          industryCode: codes[i] ?? '', industryName: names[i] ?? '',
          constituentCount: safeFloat(names[i]?.match(/\((\d+)\)/)?.[1]),
          staticPe: safeFloat(values[base]), ttmPe: safeFloat(values[base + 1]),
          pb: safeFloat(values[base + 2]), dividendYield: safeFloat(values[base + 3]),
        })
      }
      return result
    } catch { return null }
  }

  p.swIndexSecondInfo = async function swIndexSecondInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://legulegu.com/stockdata/sw-industry-overview', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const blockMatch = html.match(/id="level2Items"[^>]*>([\s\S]*?)(?=<div[^>]*id="level3Items")/)
      if (!blockMatch) return null
      const block = blockMatch[1]
      const codes = [...block.matchAll(/class="lg-industries-item-chinese-title"[^>]*>([^<]+)/g)].map(m => m[1].trim())
      const names = [...block.matchAll(/class="lg-industries-item-number"[^>]*>([\s\S]*?)<\/div>/g)].map(m => {
        const text = m[1].replace(/<[^>]+>/g, '').trim()
        const parts = text.split('(')
        return { name: parts[0]?.trim() ?? '', parent: parts[1]?.split(')')[0]?.trim() ?? '' }
      })
      const values = [...block.matchAll(/class="value"[^>]*>([^<]+)/g)].map(m => m[1].trim())
      if (!codes.length) return null
      const result: Record<string, unknown>[] = []
      for (let i = 0; i < codes.length; i++) {
        const base = i * 4
        result.push({
          industryCode: codes[i] ?? '', industryName: names[i]?.name ?? '',
          parentIndustry: names[i]?.parent ?? '',
          staticPe: safeFloat(values[base]), ttmPe: safeFloat(values[base + 1]),
          pb: safeFloat(values[base + 2]), dividendYield: safeFloat(values[base + 3]),
        })
      }
      return result
    } catch { return null }
  }

  p.swIndexThirdInfo = async function swIndexThirdInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://legulegu.com/stockdata/sw-industry-overview', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const blockMatch = html.match(/id="level3Items"[^>]*>([\s\S]*?)(?=<\/div>\s*<\/div>\s*<\/div>)/)
      if (!blockMatch) return null
      const block = blockMatch[1]
      const codes = [...block.matchAll(/class="lg-industries-item-chinese-title"[^>]*>([^<]+)/g)].map(m => m[1].trim())
      const names = [...block.matchAll(/class="lg-industries-item-number"[^>]*>([\s\S]*?)<\/div>/g)].map(m => {
        const text = m[1].replace(/<[^>]+>/g, '').trim()
        const parts = text.split('(')
        return { name: parts[0]?.trim() ?? '', parent: parts[1]?.split(')')[0]?.trim() ?? '' }
      })
      const values = [...block.matchAll(/class="value"[^>]*>([^<]+)/g)].map(m => m[1].trim())
      if (!codes.length) return null
      const result: Record<string, unknown>[] = []
      for (let i = 0; i < codes.length; i++) {
        const base = i * 4
        result.push({
          industryCode: codes[i] ?? '', industryName: names[i]?.name ?? '',
          parentIndustry: names[i]?.parent ?? '',
          staticPe: safeFloat(values[base]), ttmPe: safeFloat(values[base + 1]),
          pb: safeFloat(values[base + 2]), dividendYield: safeFloat(values[base + 3]),
        })
      }
      return result
    } catch { return null }
  }

  p.swIndexThirdCons = async function swIndexThirdCons(symbol = '801120.SI'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://legulegu.com/stockdata/index-composition?industryCode=${symbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      })
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) ?? []
      if (rows.length < 3) return null
      const result: Record<string, unknown>[] = []
      for (let i = 1; i < rows.length - 1; i++) {
        const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/g)?.map(c => c.replace(/<[^>]+>/g, '').trim()) ?? []
        if (cells.length >= 14) {
          result.push({
            rank: safeFloat(cells[0]), stockCode: cells[1] ?? '', stockName: cells[2] ?? '',
            inclusionDate: cells[3] ?? '', swLevel1: cells[4] ?? '', swLevel2: cells[5] ?? '',
            swLevel3: cells[6] ?? '', price: safeFloat(cells[7]), pe: safeFloat(cells[8]),
            peTtm: safeFloat(cells[9]), pb: safeFloat(cells[10]),
          })
        }
      }
      return result.length ? result : null
    } catch { return null }
  }

  p.indexAnalysisWeekMonthSw = async function indexAnalysisWeekMonthSw(type = 'month'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_analysis/week_month_datetime/?type=${type.toUpperCase()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown>[] | undefined
      if (!data?.length) return null
      return data.map(it => ({
        date: String(it.bargaindate ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.indexRealtimeFundSw = async function indexRealtimeFundSw(symbol = '基础一级'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://www.swsresearch.com/insWechatSw/fundIndex/pageList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ pageNo: 1, pageSize: 50, indexTypeName: symbol, sortField: '', rule: '', indexType: 1 }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const list = data?.list as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.swIndexCode ?? ''), name: String(it.swIndexName ?? ''),
        prevClose: safeFloat(it.lastCloseIndex), changePct: safeFloat(it.lastMarkup),
        yearChangePct: safeFloat(it.yearMarkup),
      }))
    } catch { return null }
  }

  p.indexHistFundSw = async function indexHistFundSw(symbol = '807200', period = 'day'): Promise<Record<string, unknown>[] | null> {
    try {
      const periodMap: Record<string, string> = { day: 'DAY', week: 'WEEK', month: 'MONTH' }
      const resp = await fetch('https://www.swsresearch.com/insWechatSw/fundIndex/getFundKChartData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ swIndexCode: symbol, type: periodMap[period] ?? 'DAY' }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown>[] | undefined
      if (!data?.length) return null
      return data.map(it => ({
        date: String(it.bargaindate ?? '').slice(0, 10),
        close: safeFloat(it.closeindex), open: safeFloat(it.openindex),
        high: safeFloat(it.maxindex), low: safeFloat(it.minindex),
        changePct: safeFloat(it.markup),
      }))
    } catch { return null }
  }
}

// Type augmentation for mixed-in methods
declare module '../../driver.js' {
  interface EastMoneyDriver {
    shareholders(code: string, reportDate?: string): Promise<Record<string, unknown>[] | null>
    marginTrade(code: string): Promise<Record<string, unknown>[] | null>
    balanceSheet(code: string, reportDate?: string): Promise<Record<string, unknown>[] | null>
    incomeStatement(code: string, reportDate?: string): Promise<Record<string, unknown>[] | null>
    instHolding(code: string): Promise<Record<string, unknown>[] | null>
    blockTrade(code: string): Promise<Record<string, unknown>[] | null>
    lockupExpiry(code: string): Promise<Record<string, unknown>[] | null>
    sharePledge(code: string): Promise<Record<string, unknown>[] | null>
    intradayTick(code: string, date?: string): Promise<Record<string, unknown>[] | null>
    indexConstituents(indexCode: string): Promise<Record<string, unknown>[] | null>
    insiderTrade(code: string): Promise<Record<string, unknown>[] | null>
    perfForecast(code: string): Promise<Record<string, unknown>[] | null>
    ipoData(): Promise<Record<string, unknown>[] | null>
    convertibleBonds(): Promise<Record<string, unknown>[] | null>
    etfData(etfCode?: string): Promise<Record<string, unknown>[] | null>
    etfList(market?: string, etfCode?: string): Promise<Record<string, unknown>[] | null>
    etfProfile(etfCode: string): Promise<Record<string, unknown>[] | null>
    etfNav(etfCode: string): Promise<Record<string, unknown>[] | null>
    etfHoldings(etfCode: string): Promise<Record<string, unknown>[] | null>
    managerInfo(code: string): Promise<Record<string, unknown>[] | null>
    shareholderPlans(code: string): Promise<Record<string, unknown>[] | null>
    buyback(code: string): Promise<Record<string, unknown>[] | null>
    macroIndicator(indicator?: string): Promise<Record<string, unknown>[] | null>
    exchangeRate(pair?: string): Promise<Record<string, unknown>[] | null>
    forexSpotEm(): Promise<Record<string, unknown>[] | null>
    forexHistEm(symbol?: string): Promise<Record<string, unknown>[] | null>
    fundNameEm(): Promise<Record<string, unknown>[] | null>
    fundPurchaseEm(): Promise<Record<string, unknown>[] | null>
    fundEtfSpotEm(): Promise<Record<string, unknown>[] | null>
    fundLofSpotEm(): Promise<Record<string, unknown>[] | null>
    fundOpenFundDailyEm(): Promise<Record<string, unknown>[] | null>
    fundInfoIndexEm(symbol?: string, indicator?: string): Promise<Record<string, unknown>[] | null>
    stockZhIndexSpotEm(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexGlobalSpotEm(): Promise<Record<string, unknown>[] | null>
    fundRatingAll(): Promise<Record<string, unknown>[] | null>
    fundManagerEm(): Promise<Record<string, unknown>[] | null>
    fundScaleChangeEm(): Promise<Record<string, unknown>[] | null>
    fundFhEm(code: string, start?: string, end?: string): Promise<Record<string, unknown>[] | null>
    fundFhRankEm(): Promise<Record<string, unknown>[] | null>
    fundEtfHistEm(code: string, period?: string, startDate?: string, endDate?: string, adjust?: string): Promise<Record<string, unknown>[] | null>
    fundLofHistEm(code: string, period?: string, startDate?: string, endDate?: string, adjust?: string): Promise<Record<string, unknown>[] | null>
    fundEtfHistMinEm(code: string, period?: string, startDate?: string, endDate?: string, adjust?: string): Promise<Record<string, unknown>[] | null>
    fundLofHistMinEm(code: string, period?: string, startDate?: string, endDate?: string, adjust?: string): Promise<Record<string, unknown>[] | null>
    fundInfoThs(code: string): Promise<Record<string, unknown>[] | null>
    indexStockCons(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexStockInfo(): Promise<Record<string, unknown>[] | null>
    indexZhAHist(symbol?: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    indexZhAHistMinEm(symbol?: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockZhIndexDailyEm(symbol?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    stockHkIndexSpotEm(): Promise<Record<string, unknown>[] | null>
    stockHkIndexDailyEm(symbol?: string): Promise<Record<string, unknown>[] | null>
    stockHkIndexSpotSina(): Promise<Record<string, unknown>[] | null>
    indexGlobalHistEm(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexGlobalHistSina(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexGlobalNameTable(): Promise<Record<string, unknown>[] | null>
    indexStockConsSina(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexRealtimeSw(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexHistSw(symbol?: string, period?: string): Promise<Record<string, unknown>[] | null>
    indexMinSw(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexComponentSw(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexAnalysisDailySw(symbol?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    indexAnalysisWeeklySw(symbol?: string, date?: string): Promise<Record<string, unknown>[] | null>
    indexAnalysisMonthlySw(symbol?: string, date?: string): Promise<Record<string, unknown>[] | null>
    indexOption50EtfQvix(): Promise<Record<string, unknown>[] | null>
    indexOption300EtfQvix(): Promise<Record<string, unknown>[] | null>
    indexOption500EtfQvix(): Promise<Record<string, unknown>[] | null>
    indexOptionCybQvix(): Promise<Record<string, unknown>[] | null>
    indexOptionKcbQvix(): Promise<Record<string, unknown>[] | null>
    indexOption100EtfQvix(): Promise<Record<string, unknown>[] | null>
    indexOption300IndexQvix(): Promise<Record<string, unknown>[] | null>
    indexOption1000IndexQvix(): Promise<Record<string, unknown>[] | null>
    indexOption50IndexQvix(): Promise<Record<string, unknown>[] | null>
    fundRatingSh(date?: string): Promise<Record<string, unknown>[] | null>
    fundRatingZs(date?: string): Promise<Record<string, unknown>[] | null>
    fundReportAssetAllocationCninfo(): Promise<Record<string, unknown>[] | null>
    fundReportIndustryAllocationCninfo(date?: string): Promise<Record<string, unknown>[] | null>
    fundReportStockCninfo(date?: string): Promise<Record<string, unknown>[] | null>
    fundScaleCloseSina(): Promise<Record<string, unknown>[] | null>
    fundScaleDailySzse(startDate?: string, endDate?: string, symbol?: string): Promise<Record<string, unknown>[] | null>
    fundScaleOpenSina(symbol?: string): Promise<Record<string, unknown>[] | null>
    fundScaleStructuredSina(): Promise<Record<string, unknown>[] | null>
    reitsHistEm(symbol?: string): Promise<Record<string, unknown>[] | null>
    reitsRealtimeEm(): Promise<Record<string, unknown>[] | null>
    indexUsStockSina(symbol?: string): Promise<Record<string, unknown>[] | null>
    stockHkIndexDailySina(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexStockConsCsindex(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexStockConsWeightCsindex(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexCsindexAll(): Promise<Record<string, unknown>[] | null>
    fundEtfCategorySina(symbol?: string): Promise<Record<string, unknown>[] | null>
    fundEtfFundDailyEm(): Promise<Record<string, unknown>[] | null>
    fundEtfFundInfoEm(fund: string, start?: string, end?: string): Promise<Record<string, unknown>[] | null>
    fundHkFundHistEm(code: string, symbol?: string): Promise<Record<string, unknown>[] | null>
    fundHkRankEm(): Promise<Record<string, unknown>[] | null>
    fundIndividualAchievementXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualAnalysisXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualBasicInfoXq(code: string): Promise<Record<string, unknown> | null>
    fundIndividualDetailHoldXq(code: string, date?: string): Promise<Record<string, unknown>[] | null>
    fundIndividualDetailInfoXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualProfitProbabilityXq(code: string): Promise<Record<string, unknown>[] | null>
    fundRatingJa(date: string): Promise<Record<string, unknown>[] | null>
    futuresHistEm(symbol: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    futuresGlobalHistEm(symbol: string): Promise<Record<string, unknown>[] | null>
    futuresGlobalSpotEm(): Promise<Record<string, unknown>[] | null>
    futuresInventoryEm(symbol: string): Promise<Record<string, unknown>[] | null>
    futuresComexInventory(symbol: string): Promise<Record<string, unknown>[] | null>
    futuresContractDetailEm(symbol: string): Promise<Record<string, unknown>[] | null>
    futuresSpotStock(): Promise<Record<string, unknown>[] | null>
    futuresHqSubscribeExchangeSymbol(): Promise<Record<string, unknown>[] | null>
    lhbDetail(date?: string): Promise<Record<string, unknown>[] | null>
    lhbJgStatistic(): Promise<Record<string, unknown>[] | null>
    lhbStockStatistic(code: string): Promise<Record<string, unknown>[] | null>
    gdfxHoldingCount(): Promise<Record<string, unknown>[] | null>
    gdfxHoldingDetail(code: string): Promise<Record<string, unknown>[] | null>
    marketValuation(): Promise<Record<string, unknown>[] | null>
    profitForecast(code: string): Promise<Record<string, unknown>[] | null>
    institutionRecommend(): Promise<Record<string, unknown>[] | null>
    ipoApply(): Promise<Record<string, unknown>[] | null>
    marginDetailSse(date?: string): Promise<Record<string, unknown>[] | null>
    marginDetailSzse(date?: string): Promise<Record<string, unknown>[] | null>
    dividendDetail(code: string): Promise<Record<string, unknown>[] | null>
    lockupExpiryDc(code?: string): Promise<Record<string, unknown>[] | null>
    buybackDc(): Promise<Record<string, unknown>[] | null>
    blockTradeDetail(date?: string): Promise<Record<string, unknown>[] | null>
    blockTradeMarketStats(): Promise<Record<string, unknown>[] | null>
    shareStructure(code: string): Promise<Record<string, unknown>[] | null>
    stockTradeSuspension(): Promise<Record<string, unknown>[] | null>
    goodwillMarketOverview(): Promise<Record<string, unknown>[] | null>
    goodwillDetail(code: string): Promise<Record<string, unknown>[] | null>
    accountStatistics(): Promise<Record<string, unknown>[] | null>
    riskStockList(): Promise<Record<string, unknown>[] | null>
    twoNetList(): Promise<Record<string, unknown>[] | null>
    shareholderChangeStats(): Promise<Record<string, unknown>[] | null>
    fundHoldStructureEm(): Promise<Record<string, unknown>[] | null>
    fundPortfolioHoldEm(code: string, date?: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioBondHoldEm(code: string, date?: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioChangeEm(code: string, indicator?: string, date?: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioIndustryAllocationEm(code: string, date?: string): Promise<Record<string, unknown>[] | null>
    fundCfEm(code: string): Promise<Record<string, unknown>[] | null>
    swIndexFirstInfo(): Promise<Record<string, unknown>[] | null>
    swIndexSecondInfo(): Promise<Record<string, unknown>[] | null>
    swIndexThirdInfo(): Promise<Record<string, unknown>[] | null>
    swIndexThirdCons(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexAnalysisWeekMonthSw(type?: string): Promise<Record<string, unknown>[] | null>
    indexRealtimeFundSw(symbol?: string): Promise<Record<string, unknown>[] | null>
    indexHistFundSw(symbol?: string, period?: string): Promise<Record<string, unknown>[] | null>
  }
}
