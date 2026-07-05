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

  // ═══════════════════════════════════════════════════════════════
  // INDEX APIS — verified against .akshare-ref/akshare/index/
  // ═══════════════════════════════════════════════════════════════

  // ── 新闻情绪 ──

  /** 数库-A股新闻情绪指数 (verified index_zh_a_scope.py:13) */
  async indexNewsSentimentScope(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://www.chinascope.com/inews/senti/index', { period: 'YEAR' })
    if (!json) return null
    const data = json as unknown as Record<string, unknown>[]
    if (!Array.isArray(data) || !data.length) return null
    return data.map(it => ({
      date: String(it.tradeDate ?? '').slice(0, 10),
      sentimentIndex: safeFloat(it.maIndex1),
      hs300Index: safeFloat(it.marketClose),
    }))
  }

  // ── 申万指数分类 ──

  /** 乐咕乐股-申万一级行业 (verified index_sw.py:19) */
  async swIndexFirstInfo(): Promise<Record<string, unknown>[] | null> {
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

  /** 乐咕乐股-申万二级行业 (verified index_sw.py:77) */
  async swIndexSecondInfo(): Promise<Record<string, unknown>[] | null> {
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

  /** 乐咕乐股-申万三级行业 (verified index_sw.py:139) */
  async swIndexThirdInfo(): Promise<Record<string, unknown>[] | null> {
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

  /** 乐咕乐股-申万三级行业成份 (verified index_sw.py:201) */
  async swIndexThirdCons(symbol = '801120.SI'): Promise<Record<string, unknown>[] | null> {
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

  // ── 申万指数分析日期 ──

  /** 申万周/月报表日期序列 (verified index_research_sw.py:363) */
  async indexAnalysisWeekMonthSw(type = 'month'): Promise<Record<string, unknown>[] | null> {
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

  // ── 申万基金指数 ──

  /** 申万基金指数-实时行情 (verified index_research_fund_sw.py:15) */
  async indexRealtimeFundSw(symbol = '基础一级'): Promise<Record<string, unknown>[] | null> {
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

  /** 申万基金指数-历史行情 (verified index_research_fund_sw.py:61) */
  async indexHistFundSw(symbol = '807200', period = 'day'): Promise<Record<string, unknown>[] | null> {
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

  // ── 期权QVIX分时 ──

  async fetchOptbbsMinQvix(csvUrl: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      return lines.slice(1).map(line => {
        const fields = line.split(',')
        return { time: fields[0] ?? '', qvix: safeFloat(fields[1]) }
      })
    } catch { return null }
  }

  /** 50ETF QVIX分时 (verified index_option_qvix.py:51) */
  async indexOption50EtfMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vix50.csv')
  }

  /** 300ETF QVIX分时 (verified index_option_qvix.py:91) */
  async indexOption300EtfMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vix300.csv')
  }

  /** 500ETF QVIX分时 (verified index_option_qvix.py:131) */
  async indexOption500EtfMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vix500.csv')
  }

  /** 创业板QVIX分时 (verified index_option_qvix.py:171) */
  async indexOptionCybMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vixcyb.csv')
  }

  /** 科创板QVIX分时 (verified index_option_qvix.py:211) */
  async indexOptionKcbMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vixkcb.csv')
  }

  /** 100ETF QVIX分时 (verified index_option_qvix.py:251) */
  async indexOption100EtfMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vix100.csv')
  }

  /** 300股指QVIX分时 (verified index_option_qvix.py:291) */
  async indexOption300IndexMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vixindex.csv')
  }

  /** 1000股指QVIX分时 (verified index_option_qvix.py:331) */
  async indexOption1000IndexMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vixindex1000.csv')
  }

  /** 上证50股指QVIX分时 (verified index_option_qvix.py:371) */
  async indexOption50IndexMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vix50index.csv')
  }

  // ── 中证指数 ──

  /** 中证指数历史行情 (verified index_stock_zh_csindex.py:13) */
  async stockZhIndexHistCsindex(symbol = '000928', startDate = '20180526', endDate = '20240604'): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://www.csindex.com.cn/csindex-home/perf/index-perf', {
      indexCode: symbol, startDate, endDate,
    })
    if (!json?.data) return null
    const data = json.data as Record<string, unknown>[]
    return data.map(it => ({
      date: String(it['日期'] ?? it.date ?? '').slice(0, 10),
      code: String(it['指数代码'] ?? it.indexCode ?? ''),
      open: safeFloat(it['开盘'] ?? it.open), high: safeFloat(it['最高'] ?? it.high),
      low: safeFloat(it['最低'] ?? it.low), close: safeFloat(it['收盘'] ?? it.close),
      change: safeFloat(it['涨跌'] ?? it.change), changePct: safeFloat(it['涨跌幅'] ?? it.changePct),
      volume: safeFloat(it['成交量'] ?? it.volume), amount: safeFloat(it['成交金额'] ?? it.amount),
      sampleCount: safeFloat(it['样本数量'] ?? it.sampleCount), pe: safeFloat(it['滚动市盈率'] ?? it.pe),
    }))
  }

  /** 中证指数估值 (verified index_stock_zh_csindex.py:72) — XLS-based, returns null until XLS parser available */
  async stockZhIndexValueCsindex(_symbol = 'H30374'): Promise<Record<string, unknown>[] | null> {
    // Requires XLS parsing - return null for now
    return null
  }

  // ── 基金投资组合 ──

  /** fund_hold_structure_em — fund.eastmoney.com/data/FundDataPortfolio_Interface.aspx (verified fund_scale_em.py:71) */
  async fundHoldStructureEm(): Promise<Record<string, unknown>[] | null> {
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
      // Fallback: fetch from fund.eastmoney.com
      try {
        const resp = await fetch('https://fund.eastmoney.com/data/FundDataPortfolio_Interface.aspx?dt=11&pi=1&pn=50&mc=hypzDetail&st=desc&sc=reportdate', {
          headers: HEADERS,
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

  /** fund_portfolio_hold_em — fundf10.eastmoney.com/FundArchivesDatas.aspx (verified fund_portfolio_em.py:18) */
  async fundPortfolioHoldEm(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
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

  /** fund_portfolio_bond_hold_em — fundf10.eastmoney.com/FundArchivesDatas.aspx (verified fund_portfolio_em.py:106) */
  async fundPortfolioBondHoldEm(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
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

  /** fund_portfolio_change_em — fundf10.eastmoney.com/FundArchivesDatas.aspx (verified fund_portfolio_em.py:234) */
  async fundPortfolioChangeEm(code: string, indicator = '累计买入', date = ''): Promise<Record<string, unknown>[] | null> {
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

  /** fund_portfolio_industry_allocation_em — api.fund.eastmoney.com/f10/HYPZ/ (verified fund_portfolio_em.py:161) */
  async fundPortfolioIndustryAllocationEm(code: string, date = ''): Promise<Record<string, unknown>[] | null> {
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

  /** fund_cf_em — fund.eastmoney.com (cash flow data) */
  async fundCfEm(code: string): Promise<Record<string, unknown>[] | null> {
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
  // 申万宏源研究-指数系列 (verified index_research_sw.py)
  // ═══════════════════════════════════════════════════════════════

  /** 申万指数-实时行情 (verified index_research_sw.py:221) */
  async indexRealtimeSw(symbol = '二级行业'): Promise<Record<string, unknown>[] | null> {
    const swHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    if (symbol === '大类风格指数' || symbol === '金创指数') {
      try {
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
      } catch { return null }
    }
    try {
      const resp = await fetch(`https://www.swsresearch.com/institute-sw/api/index_publish/current/?page=1&page_size=50&indextype=${encodeURIComponent(symbol)}`, {
        headers: swHeaders, signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const results = data?.results as Record<string, unknown>[] | undefined
      if (!results?.length) return null
      return results.map(it => {
        const vals = Object.values(it)
        return {
          code: String(vals[0] ?? ''), name: String(vals[1] ?? ''),
          prevClose: safeFloat(vals[2]), open: safeFloat(vals[3]),
          amount: safeFloat(vals[4]), high: safeFloat(vals[5]),
          low: safeFloat(vals[6]), price: safeFloat(vals[7]),
          volume: safeFloat(vals[8]),
        }
      })
    } catch { return null }
  }

  /** 申万指数-历史行情 (verified index_research_sw.py:17) */
  async indexHistSw(symbol = '801030', period = 'day'): Promise<Record<string, unknown>[] | null> {
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

  /** 申万指数-分时数据 (verified index_research_sw.py:81) */
  async indexMinSw(symbol = '801001'): Promise<Record<string, unknown>[] | null> {
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

  /** 申万指数-成分股 (verified index_research_sw.py:127) */
  async indexComponentSw(symbol = '801001'): Promise<Record<string, unknown>[] | null> {
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

  /** 申万指数分析-日报 (verified index_research_sw.py:285) */
  async indexAnalysisDailySw(symbol = '市场表征', startDate = '20240101', endDate = '20240131'): Promise<Record<string, unknown>[] | null> {
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

  /** 申万指数分析-周报 (verified index_research_sw.py:389) */
  async indexAnalysisWeeklySw(symbol = '市场表征', date = '20241025'): Promise<Record<string, unknown>[] | null> {
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

  /** 申万指数分析-月报 (verified index_research_sw.py:464) */
  async indexAnalysisMonthlySw(symbol = '市场表征', date = '20240930'): Promise<Record<string, unknown>[] | null> {
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
}
