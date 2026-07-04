/**
 * Misc data handler — non-eastmoney APIs from AKShare documentation.
 * Temporary provider until these APIs are migrated to appropriate providers.
 */

import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'

const DATACENTER_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://data.eastmoney.com/',
}

async function dcGet(params: Record<string, string>): Promise<Record<string, unknown>[] | null> {
  try {
    const resp = await fetch(`${DATACENTER_URL}?${new URLSearchParams(params)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    })
    const json = await resp.json() as Record<string, unknown>
    const result = json?.result as Record<string, unknown> | undefined
    return (result?.data ?? []) as Record<string, unknown>[]
  } catch {
    return null
  }
}

async function httpGet(url: string, params?: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const fullUrl = params ? `${url}?${new URLSearchParams(params)}` : url
    const resp = await fetch(fullUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(15000),
    })
    return await resp.json() as Record<string, unknown>
  } catch {
    return null
  }
}

const AMAC_BASE = 'https://gs.amac.org.cn/amac-infodisc/api'

async function amacPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>[] | null> {
  try {
    const resp = await fetch(`${AMAC_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    const json = await resp.json() as Record<string, unknown>
    return (json?.datas ?? []) as Record<string, unknown>[]
  } catch {
    return null
  }
}

export class MiscDataHandler extends MarketHandlerShell {

  // ── 龙虎榜 ──

  /** 龙虎榜详情 */
  async lhbDetail(date?: string): Promise<Record<string, unknown>[] | null> {
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

  /** 龙虎榜机构席位统计 */
  async lhbJgStatistic(): Promise<Record<string, unknown>[] | null> {
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

  /** 个股龙虎榜统计 */
  async lhbStockStatistic(code: string): Promise<Record<string, unknown>[] | null> {
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

  /** 股东户数变动 Top100 */
  async gdfxHoldingCount(): Promise<Record<string, unknown>[] | null> {
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

  /** 股东户数详情（个股） */
  async gdfxHoldingDetail(code: string): Promise<Record<string, unknown>[] | null> {
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

  /** 全市场估值指标 */
  async marketValuation(): Promise<Record<string, unknown>[] | null> {
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

  /** A股PE历史（乐咕） */
  async stockALgPe(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-pe')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /** A股PB历史（乐咕） */
  async stockALgPb(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-pb')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /** 巴菲特指标（乐咕） */
  async stockBuffettIndex(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-cap-gdp')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  // ── 市场总貌 ──

  /** 上交所市场总貌 */
  async sseSummary(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://query.sse.com.cn/commonQuery.do?jsonCallBack=cb&isPagination=false&pageHelp.pageSize=15&pageHelp.pageNo=1&pageHelp.beginPage=1&pageHelp.endPage=1&sqlId=COMMON_SSE_SCSJ_XXPL_TJSJ_L', {
      _: String(Date.now()),
    })
    if (!json) return null
    // Parse JSONP
    const str = JSON.stringify(json)
    const match = str.match(/cb\((.*)\)/s)
    if (match) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>
        return data.result as Record<string, unknown>[]
      } catch { return null }
    }
    return null
  }

  /** 深交所市场总貌 */
  async szseSummary(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const json = await httpGet(`https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110x&TABKEY=tab1&PAGENO=1&random=0.${Date.now()}`, {
      PAGENO: '1',
      random: String(Math.random()),
    })
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /** 上交所每日概况 */
  async sseDealDaily(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const json = await httpGet(`https://query.sse.com.cn/commonQuery.do?jsonCallBack=cb&isPagination=false&pageHelp.pageSize=15&pageHelp.pageNo=1&pageHelp.beginPage=1&pageHelp.endPage=1&sqlId=COMMON_SSE_SCSJ_XXPL_MXGK_L&TRADE_DATE=${d}`, {
      _: String(Date.now()),
    })
    if (!json) return null
    const str = JSON.stringify(json)
    const match = str.match(/cb\((.*)\)/s)
    if (match) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>
        return data.result as Record<string, unknown>[]
      } catch { return null }
    }
    return null
  }

  // ── 盈利预测 ──

  /** 个股盈利预测 */
  async profitForecast(code: string): Promise<Record<string, unknown>[] | null> {
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

  /** 机构推荐汇总 */
  async institutionRecommend(): Promise<Record<string, unknown>[] | null> {
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

  /** 新股申购与中签 */
  async ipoApply(): Promise<Record<string, unknown>[] | null> {
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

  /** 沪市融资融券明细 */
  async marginDetailSse(date?: string): Promise<Record<string, unknown>[] | null> {
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

  // ── 分红 ──

  /** 分红配送 */
  async dividendDetail(code: string): Promise<Record<string, unknown>[] | null> {
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

  /** 限售解禁 */
  async lockupExpiry(code?: string): Promise<Record<string, unknown>[] | null> {
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

  /** 股票回购数据 */
  async buyback(): Promise<Record<string, unknown>[] | null> {
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

  /** 大宗交易每日明细 */
  async blockTradeDetail(date?: string): Promise<Record<string, unknown>[] | null> {
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

  // ── 股本结构 ──

  /** 股本结构 */
  async shareStructure(code: string): Promise<Record<string, unknown>[] | null> {
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

  // ── 交易所专题 ──

  /** 深交所行业成交 */
  async szseSectorSummary(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110x&TABKEY=tab2&PAGENO=1', {
      random: String(Math.random()),
    })
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /** 深市融资融券 */
  async marginDetailSzse(date?: string): Promise<Record<string, unknown>[] | null> {
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

  /** 停复牌 */
  async stockTradeSuspension(): Promise<Record<string, unknown>[] | null> {
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

  /** 商誉概况 */
  async goodwillMarketOverview(): Promise<Record<string, unknown>[] | null> {
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

  /** 商誉明细（个股） */
  async goodwillDetail(code: string): Promise<Record<string, unknown>[] | null> {
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

  /** 账户统计 */
  async accountStatistics(): Promise<Record<string, unknown>[] | null> {
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

  /** 风险警示 */
  async riskStockList(): Promise<Record<string, unknown>[] | null> {
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

  /** 两网退市 */
  async twoNetList(): Promise<Record<string, unknown>[] | null> {
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

  // ── 大宗交易与股东 ──

  /** 大宗交易统计 */
  async blockTradeMarketStats(): Promise<Record<string, unknown>[] | null> {
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

  /** 股东变动统计 */
  async shareholderChangeStats(): Promise<Record<string, unknown>[] | null> {
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

  // ── 私募基金（AMAC） ──

  /** 私募基金管理人基本信息 */
  async amacMemberInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/member', { page: 0, size: 5000 })
  }

  /** 私募基金从业人员信息 */
  async amacPersonFundOrgList(symbol: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    return amacPost('pof/personFundOrgList', { page: 0, size: 5000, managerCode: symbol })
  }

  /** 私募基金从业人员（债券类） */
  async amacPersonBondOrgList(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/personBondOrgList', { page: 0, size: 5000 })
  }

  /** 私募基金管理人信息 */
  async amacManagerInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/manager', { page: 0, size: 5000 })
  }

  /** 私募基金管理人分类信息 */
  async amacManagerClassifyInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/managerClassify', { page: 0, size: 5000 })
  }

  /** 私募基金管理人子公司信息 */
  async amacMemberSubInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/memberSub', { page: 0, size: 5000 })
  }

  /** 私募基金产品信息（分页） */
  async amacFundInfo(startPage: number, endPage: number): Promise<Record<string, unknown>[] | null> {
    const all: Record<string, unknown>[] = []
    for (let p = startPage; p <= endPage; p++) {
      const items = await amacPost('pof/fund', { page: p, size: 5000 })
      if (!items?.length) break
      all.push(...items)
    }
    return all.length ? all : null
  }

  /** 私募证券类产品信息 */
  async amacSecuritiesInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/securities', { page: 0, size: 5000 })
  }

  /** 私募股权类产品信息 */
  async amacAoinInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/aoin', { page: 0, size: 5000 })
  }

  /** 私募基金子公司产品信息 */
  async amacFundSubInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/fundSub', { page: 0, size: 5000 })
  }

  /** 私募基金专户产品信息 */
  async amacFundAccountInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/fundAccount', { page: 0, size: 5000 })
  }

  /** 私募资产支持专项计划信息 */
  async amacFundAbs(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/abs', { page: 0, size: 5000 })
  }

  /** 私募期货类产品信息 */
  async amacFuturesInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/futures', { page: 0, size: 5000 })
  }

  /** 已注销私募基金管理人 */
  async amacManagerCancelledInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/managerCancelled', { page: 0, size: 5000 })
  }
}
