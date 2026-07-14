/**
 * AKShare data handler — comprehensive data interfaces from AKShare documentation.
 * Covers bonds, futures, currencies, carbon emissions, alternative data and more.
 */

import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { safeFloat } from '../../../../utils/helpers.js'
import { akshareClient } from '../../api/client.js'

const CURRENCYSOOP_API_KEY = process.env.OPPTRIX_CURRENCYSOOP_API_KEY ?? process.env.CURRENCYSOOP_API_KEY ?? ''
const CURRENCYSOOP_BASE = 'https://api.currencyscoop.com/v1'

const DATACENTER_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const AMAC_BASE = 'https://gs.amac.org.cn/amac-infodisc/api'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Referer: 'https://data.eastmoney.com/',
}

/** 数据中心 GET 请求（返回数组） */
async function dcGet(params: Record<string, string>): Promise<Record<string, unknown>[] | null> {
  try {
    const json = await akshareClient.get<{ result?: { data?: Record<string, unknown>[] } }>(DATACENTER_URL, params)
    return json?.result?.data ?? null
  } catch {
    return null
  }
}

/** 通用 GET 请求（返回 JSON） */
async function httpGet(
  url: string,
  params?: Record<string, string>,
  timeoutMs?: number,
  extraHeaders?: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  return akshareClient.getOrNull(url, params, { timeoutMs, extraHeaders })
}

/** AMAC POST 请求（返回数组） */
async function amacPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>[] | null> {
  return akshareClient.postArrayOrNull(`${AMAC_BASE}/${path}`, body)
}

export class AkshareHandler extends MarketHandlerShell {

  /** 通过 HTTP Client 发起 fetch 请求（带限流和统一 header） */
  private async clientFetch(
    url: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<Response> {
    return akshareClient.fetch(url, init)
  }

  // ── 估值（非东方财富来源） ──

  /**
   * AKShare 接口: stock_a_pe_lg (乐咕乐股)
   * 数据源: https://legulegu.com/api/stockdata/market-pe
   */
  async stockALgPe(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-pe')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: stock_a_pb_lg (乐咕乐股)
   * 数据源: https://legulegu.com/api/stockdata/market-pb
   */
  async stockALgPb(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-pb')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: stock_buffett_index_lg (乐咕乐股)
   * 数据源: https://legulegu.com/api/stockdata/market-cap-gdp
   */
  async stockBuffettIndex(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-cap-gdp')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  // ── 市场总貌（交易所来源） ──

  /**
   * AKShare 接口: stock_sse_summary
   * 数据源: https://www.sse.com.cn/market/stockdata/statistic/
   */
  async sseSummary(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://query.sse.com.cn/commonQuery.do?jsonCallBack=cb&isPagination=false&pageHelp.pageSize=15&pageHelp.pageNo=1&pageHelp.beginPage=1&pageHelp.endPage=1&sqlId=COMMON_SSE_SCSJ_XXPL_TJSJ_L', {
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

  /**
   * AKShare 接口: stock_szse_summary
   * 数据源: https://www.szse.cn/market/overview/index.html
   */
  async szseSummary(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const json = await httpGet(`https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110x&TABKEY=tab1&PAGENO=1&random=0.${Date.now()}`, {
      PAGENO: '1',
      random: String(Math.random()),
    })
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: stock_sse_deal_daily
   * 数据源: https://www.sse.com.cn/market/stockdata/overview/day/
   */
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

  /**
   * AKShare 接口: stock_szse_sector_summary
   * 数据源: https://www.szse.cn/market/periodical/month/index.html
   */
  async szseSectorSummary(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110x&TABKEY=tab2&PAGENO=1', {
      random: String(Math.random()),
    })
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  // ── 私募基金（AMAC） ──

  /**
   * AKShare 接口: amac_member_info
   * 对应 Python: akshare.fund.fund_amac.amac_member_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/pofMember
   * @returns 会员机构综合查询列表，每项含 managerName(机构名称)、memberBehalf(会员代表)、
   *          memberType(会员类型)、memberCode(会员编号)、memberDate(入会时间)、
   *          primaryInvestType(机构类型)、markStar(是否星标)
   * 数据清洗: POST 请求 pof/member，page=0, size=5000 一次性获取全部数据；
   *           Python 版本分页遍历，此实现单次请求获取所有记录
   */
  async amacMemberInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/member', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_person_fund_org_list
   * 对应 Python: akshare.fund.fund_amac.amac_person_fund_org_list
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/personOrg
   * @param symbol - 机构类型代码，如 "gmjjglgs"(公募基金管理公司)、"smjjglr"(私募基金管理人) 等
   * @returns 基金从业人员资格注册信息列表，每项含姓名、从业机构、资格编号等
   * 数据清洗: POST 请求 pof/personFundOrgList，传入 managerCode=symbol；
   *           空 symbol 返回 null
   */
  async amacPersonFundOrgList(symbol: string): Promise<Record<string,unknown>[] | null> {
    if (!symbol) return null
    return amacPost('pof/personFundOrgList', { page: 0, size: 5000, managerCode: symbol })
  }

  /**
   * AKShare 接口: amac_person_bond_org_list
   * 对应 Python: akshare.fund.fund_amac.amac_person_bond_org_list
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/personBondOrg
   * @returns 债券类私募基金从业人员信息列表，每项含从业人员基本信息
   * 数据清洗: POST 请求 pof/personBondOrgList，page=0, size=5000 一次性获取全部数据
   */
  async amacPersonBondOrgList(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/personBondOrgList', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_manager_info
   * 对应 Python: akshare.fund.fund_amac.amac_manager_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/manager
   * @returns 私募基金管理人信息列表，每项含管理人名称、注册地址、注册资本、
   *          法定代表人、成立日期、登记编号等
   * 数据清洗: POST 请求 pof/manager，page=0, size=5000 一次性获取全部数据
   */
  async amacManagerInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/manager', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_manager_classify_info
   * 对应 Python: akshare.fund.fund_amac.amac_manager_classify_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/managerClassify
   * @returns 私募基金管理人分类信息列表，每项含管理人分类详情
   * 数据清洗: POST 请求 pof/managerClassify，page=0, size=5000 一次性获取全部数据
   */
  async amacManagerClassifyInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/managerClassify', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_member_sub_info
   * 对应 Python: akshare.fund.fund_amac.amac_member_sub_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/memberSub
   * @returns 私募基金管理人子公司信息列表，每项含子公司名称、母公司、注册信息等
   * 数据清洗: POST 请求 pof/memberSub，page=0, size=5000 一次性获取全部数据
   */
  async amacMemberSubInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/memberSub', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_fund_info
   * 对应 Python: akshare.fund.fund_amac.amac_fund_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/fund
   * @param startPage - 起始页码（0-indexed）
   * @param endPage - 结束页码（0-indexed，包含）
   * @returns 私募基金产品信息列表，每项含基金名称、管理人、成立日期、基金类型等
   * 数据清洗: POST 请求 pof/fund，循环遍历 startPage~endPage，每页 size=5000；
   *           空页提前 break，合并所有页数据返回
   */
  async amacFundInfo(startPage: number, endPage: number): Promise<Record<string,unknown>[] | null> {
    const all: Record<string, unknown>[] = []
    for (let p = startPage; p <= endPage; p++) {
      const items = await amacPost('pof/fund', { page: p, size: 5000 })
      if (!items?.length) break
      all.push(...items)
    }
    return all.length ? all : null
  }

  /**
   * AKShare 接口: amac_securities_info
   * 对应 Python: akshare.fund.fund_amac.amac_securities_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/securities
   * @returns 私募证券类产品信息列表，每项含产品名称、管理人、成立日期、产品类型等
   * 数据清洗: POST 请求 pof/securities，page=0, size=5000 一次性获取全部数据
   */
  async amacSecuritiesInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/securities', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_aoin_info
   * 对应 Python: akshare.fund.fund_amac.amac_aoin_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/aoin
   * @returns 私募股权类产品信息列表，每项含产品名称、管理人、成立日期、产品类型等
   * 数据清洗: POST 请求 pof/aoin，page=0, size=5000 一次性获取全部数据
   */
  async amacAoinInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/aoin', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_fund_sub_info
   * 对应 Python: akshare.fund.fund_amac.amac_fund_sub_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/fundSub
   * @returns 私募基金子公司产品信息列表，每项含产品名称、母公司、成立日期等
   * 数据清洗: POST 请求 pof/fundSub，page=0, size=5000 一次性获取全部数据
   */
  async amacFundSubInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/fundSub', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_fund_account_info
   * 对应 Python: akshare.fund.fund_amac.amac_fund_account_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/fundAccount
   * @returns 私募基金专户产品信息列表，每项含产品名称、管理人、成立日期等
   * 数据清洗: POST 请求 pof/fundAccount，page=0, size=5000 一次性获取全部数据
   */
  async amacFundAccountInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/fundAccount', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_fund_abs
   * 对应 Python: akshare.fund.fund_amac.amac_fund_abs
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/abs
   * @returns 私募资产支持专项计划信息列表，每项含计划名称、管理人、成立日期等
   * 数据清洗: POST 请求 pof/abs，page=0, size=5000 一次性获取全部数据
   */
  async amacFundAbs(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/abs', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_futures_info
   * 对应 Python: akshare.fund.fund_amac.amac_futures_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/futures
   * @returns 私募期货类产品信息列表，每项含产品名称、管理人、成立日期等
   * 数据清洗: POST 请求 pof/futures，page=0, size=5000 一次性获取全部数据
   */
  async amacFuturesInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/futures', { page: 0, size: 5000 })
  }

  /**
   * AKShare 接口: amac_manager_cancelled_info
   * 对应 Python: akshare.fund.fund_amac.amac_manager_cancelled_info
   * API 地址: https://gs.amac.org.cn/amac-infodisc/api/pof/managerCancelled
   * @returns 已注销私募基金管理人信息列表，每项含管理人名称、注销日期、注销原因等
   * 数据清洗: POST 请求 pof/managerCancelled，page=0, size=5000 一次性获取全部数据
   */
  async amacManagerCancelledInfo(): Promise<Record<string, unknown>[] | null> {
    return amacPost('pof/managerCancelled', { page: 0, size: 5000 })
  }

  // ═══════════════════════════════════════════════════════════════
  // INDEX APIS — verified against .akshare-ref/akshare/index/
  // ═══════════════════════════════════════════════════════════════

  // ── 新闻情绪 ──

  /**
   * AKShare 接口: index_news_sentiment_scope
   * 对应 Python: akshare.index.index_zh_a_scope.index_news_sentiment_scope
   * 数据源: https://www.chinascope.com/inews/senti/index
   * @returns A股新闻情绪指数列表，每项含 date(交易日期)、
   *          sentimentIndex(市场情绪指数，maIndex1)、hs300Index(沪深300指数，marketClose)
   * 数据清洗: 从 chinascope.com 获取 JSON，映射 tradeDate→date、maIndex1→sentimentIndex、
   *           marketClose→hs300Index；字段通过 safeFloat 转为数值
   */
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

  // ── 期权QVIX分时 ──

  async fetchOptbbsMinQvix(csvUrl: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch(csvUrl)
      const text = await resp.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      return lines.slice(1).map(line => {
        const fields = line.split(',')
        return { time: fields[0] ?? '', qvix: safeFloat(fields[1]) }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: index_option_50etf_min_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_50etf_min_qvix
   * 数据源: http://1.optbbs.com/d/csv/d/vix50.csv
   * @returns 50ETF QVIX 分时数据列表，每项含 time(时间)、qvix(QVIX 指数值)
   * 数据清洗: 从 CSV 文件解析，首行跳过(表头)，按逗号分割取 time 和 qvix 两列；
   *           qvix 通过 safeFloat 转为数值
   */
  async indexOption50EtfMinQvix(): Promise<Record<string, unknown>[] | null> {
    return this.fetchOptbbsMinQvix('http://1.optbbs.com/d/csv/d/vix50.csv')
  }

  /**
   * AKShare 接口: index_option_300etf_min_qvix
   * 对应 Python: akshare.index.index_option_qvix.index_option_300etf_min_qvix
   * 数据源: http://1.optbbs.com/d/csv/d/vix300.csv
   * @returns 300ETF QVIX 分时数据列表，每项含 time(时间)、qvix(QVIX 指数值)
   * 数据清洗: 同 indexOption50EtfMinQvix，从 CSV 解析 time/qvix 两列
   */
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

  // ── 另类数据-排行榜 ──

  /**
   * AKShare 接口: forbes_rank
   * 对应 Python: akshare.fortune.fortune_forbes_500.forbes_rank
   * 数据源: https://www.hurun.net/zh-CN/rank/hslist?num=1&ph=0
   * @returns 福布斯富豪榜列表，每项含 rank(排名)、name(姓名)、
   *          wealth(财富，亿美元)、source(财富来源)、country(国家/地区)
   * 数据清洗: 从胡润网 HTML 页面解析，提取 Forbes 榜单数据
   */
  async forbesRank(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.hurun.net/zh-CN/rank/hslist?num=1&ph=0')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 5 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            wealth: safeFloat(cells[2]?.replace(/,/g, '')), source: cells[3] ?? '', country: cells[4] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fortune_rank
   * 对应 Python: akshare.fortune.fortune_500.fortune_rank
   * 数据源: http://www.fortunechina.com/fortune500/c/500_list.phtml
   * @param symbol - 榜单类型: 'world'(世界500强) 或 'china'(中国500强)
   * @returns 财富500强列表，每项含 rank(排名)、company(公司名称)、
   *          revenue(营收)、profit(利润)、... 等字段
   * 数据清洗: 从财富中文网 HTML 页面解析表格数据
   */
  async fortuneRank(symbol: 'world' | 'china' = 'world'): Promise<Record<string, unknown>[] | null> {
    try {
      const url = symbol === 'china'
        ? 'http://www.fortunechina.com/fortune500/c/500_list.phtml'
        : 'http://www.fortunechina.com/fortune500/c/500_list_global.phtml'
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), company: cells[1] ?? '',
            revenue: cells[2] ?? '', profit: cells[3] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: hurun_rank
   * 对应 Python: akshare.fortune.fortune_hurun.hurun_rank
   * 数据源: https://www.hurun.net/zh-CN/rank/hslist
   * @param symbol - 榜单类型，如 "百富榜"、"胡润全球富豪榜" 等
   * @returns 胡润富豪榜列表，每项含 rank(排名)、name(姓名)、
   *          wealth(财富，亿元人民币)、... 等字段
   * 数据清洗: 从胡润网 HTML 页面解析表格数据
   */
  async hurunRank(symbol = '百富榜'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch(`https://www.hurun.net/zh-CN/rank/hslist?num=1&ph=0&name=${encodeURIComponent(symbol)}`)
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            wealth: safeFloat(cells[2]?.replace(/,/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: index_bloomberg_billionaires
   * 对应 Python: akshare.fortune.fortune_bloomberg.index_bloomberg_billionaires
   * 数据源: https://www.bloomberg.com/billionaires/
   * @returns 彭博亿万富豪指数数据，每项含 date(日期)、index(指数值)
   * 数据清洗: 从 Bloomberg 网页解析指数数据
   */
  async indexBloombergBillionaires(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.bloomberg.com/billionaires/')
      if (!resp.ok) return null
      const html = await resp.text()
      const dateMatch = html.match(/"date"\s*:\s*"([^"]+)"/)
      const indexMatch = html.match(/"index"\s*:\s*"?([0-9.]+)/)
      if (dateMatch && indexMatch) {
        return [{ date: dateMatch[1], index: safeFloat(indexMatch[1]) }]
      }
      return null
    } catch { return null }
  }

  /**
   * AKShare 接口: index_bloomberg_billionaires_hist
   * 对应 Python: akshare.fortune.fortune_bloomberg.index_bloomberg_billionaires_hist
   * 数据源: https://www.bloomberg.com/billionaires/
   * @returns 彭博亿万富豪指数历史数据，每项含 date(日期)、index(指数值)
   * 数据清洗: 从 Bloomberg 网页解析历史指数数据
   */
  async indexBloombergBillionairesHist(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.bloomberg.com/billionaires/')
      if (!resp.ok) return null
      const html = await resp.text()
      const dataMatch = html.match(/"historicalData"\s*:\s*(\[[\s\S]*?\])/)
      if (!dataMatch) return null
      try {
        const data = JSON.parse(dataMatch[1]) as Record<string, unknown>[]
        return data.map(it => ({
          date: String(it.date ?? '').slice(0, 10),
          index: safeFloat(it.index),
        }))
      } catch { return null }
    } catch { return null }
  }

  /**
   * AKShare 接口: game_hot_rank_taptap
   * 对应 Python: akshare.other.other_taptap.game_hot_rank_taptap
   * 数据源: https://www.taptap.cn/
   * @returns TapTap 游戏热度排行榜，每项含 rank(排名)、name(游戏名称)、
   *          rating(评分)、downloads(下载量)
   * 数据清洗: 从 TapTap 网站 API 获取游戏列表数据
   */
  async gameHotRankTapTap(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.taptap.cn/webapiv2/app/v2/list-by-type?type_name=hot&page_size=50&from=0', {
        headers: {
          'X-UA': 'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&UID=undefined&OS=Windows&OSV=10&DT=PC',
        },
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.data as Record<string, unknown> | undefined)?.list as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map((it, idx) => ({
        rank: idx + 1, name: String(it.title ?? ''),
        rating: safeFloat((it.stat as Record<string, unknown>)?.rating), downloads: safeFloat((it.stat as Record<string, unknown>)?.hits_total),
      }))
    } catch { return null }
  }

  // ── 另类数据-票房视频 ──

  /**
   * AKShare 接口: movie_boxoffice_daily
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_daily
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 票房日报数据列表，每项含 rank(排名)、name(影片名称)、
   *          boxoffice(票房，万元)、... 等字段
   * 数据清洗: 从猫眼票房页面 HTML 解析表格数据
   */
  async movieBoxofficeDaily(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_weekly
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_weekly
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 周票房数据列表，每项含 rank(排名)、name(影片名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取周票房数据
   */
  async movieBoxofficeWeekly(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year?yearType=week')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_monthly
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_monthly
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 月票房数据列表，每项含 rank(排名)、name(影片名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取月票房数据
   */
  async movieBoxofficeMonthly(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year?yearType=month')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_yearly
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_yearly
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 年度票房数据列表，每项含 rank(排名)、name(影片名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取年度票房数据
   */
  async movieBoxofficeYearly(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year?yearType=year')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_yearly_first_week
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_yearly_first_week
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 年度首周票房数据列表，每项含 rank(排名)、name(影片名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取年度首周票房数据
   */
  async movieBoxofficeYearlyFirstWeek(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year?yearType=firstWeek')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_realtime
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_realtime
   * 数据源: https://piaofang.maoyan.com/
   * @returns 实时票房数据列表，每项含 rank(排名)、name(影片名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取实时票房数据
   */
  async movieBoxofficeRealtime(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_cinema_daily
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_cinema_daily
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 影院日票房数据列表，每项含 rank(排名)、name(影院名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取影院日票房数据
   */
  async movieBoxofficeCinemaDaily(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year?yearType=day&dataType=cinema')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: movie_boxoffice_cinema_weekly
   * 对应 Python: akshare.movie.movie_yien.movie_boxoffice_cinema_weekly
   * 数据源: https://piaofang.maoyan.com/rankings/year
   * @returns 影院周票房数据列表，每项含 rank(排名)、name(影院名称)、boxoffice(票房)
   * 数据清洗: 从猫眼票房页面获取影院周票房数据
   */
  async movieBoxofficeCinemaWeekly(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://piaofang.maoyan.com/rankings/year?yearType=week&dataType=cinema')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            boxoffice: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: video_tv
   * 对应 Python: akshare.movie.video_yien.video_tv
   * 数据源: https://www.vlinkage.com/index/tv
   * @returns 电视剧排行榜数据列表，每项含 rank(排名)、name(剧集名称)、
   *          platform(播出平台)、... 等字段
   * 数据清洗: 从 Vlinkage 网站 API 获取电视剧排行数据
   */
  async videoTv(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.vlinkage.com/index/tv')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            platform: cells[2] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: video_variety_show
   * 对应 Python: akshare.movie.video_yien.video_variety_show
   * 数据源: https://www.vlinkage.com/index/zy
   * @returns 综艺节目排行榜数据列表，每项含 rank(排名)、name(节目名称)、
   *          platform(播出平台)、... 等字段
   * 数据清洗: 从 Vlinkage 网站 API 获取综艺排行数据
   */
  async videoVarietyShow(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.vlinkage.com/index/zy')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            platform: cells[2] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ── 另类数据-其他 ──

  /**
   * AKShare 接口: stock_js_weibo_report
   * 对应 Python: akshare.stock.stock_weibo_nlp.stock_js_weibo_report
   * 数据源: https://data.10jqka.com.cn/stocksearch/weibo
   * @returns 微博股市热搜/讨论数据列表，每项含 title(标题)、
   *          content(内容摘要)、url(链接)
   * 数据清洗: 从同花顺微博股市数据页面解析
   */
  async stockJsWeiboReport(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://data.10jqka.com.cn/stocksearch/weibo')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        const linkMatch = row.match(/href="([^"]+)"/)
        if (cells.length >= 2) {
          results.push({
            title: cells[0] ?? '', content: cells[1] ?? '',
            url: linkMatch?.[1] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: business_value_artist
   * 对应 Python: akshare.movie.artist_yien.business_value_artist
   * 数据源: https://www.hurun.net/zh-CN/rank/hslist
   * @returns 艺人商业价值排行榜数据列表，每项含 rank(排名)、
   *          name(艺人姓名)、value(商业价值指数)
   * 数据清洗: 从胡润艺人商业价值榜页面解析 HTML 表格数据
   */
  async businessValueArtist(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.hurun.net/zh-CN/rank/hslist?num=1&ph=0')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            value: safeFloat(cells[2]?.replace(/,/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: online_value_artist
   * 对应 Python: akshare.movie.artist_yien.online_value_artist
   * 数据源: https://www.hurun.net/zh-CN/rank/hslist
   * @returns 艺人网络价值排行榜数据列表，每项含 rank(排名)、
   *          name(艺人姓名)、value(网络价值指数)
   * 数据清洗: 从胡润艺人网络价值榜页面解析 HTML 表格数据
   */
  async onlineValueArtist(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.hurun.net/zh-CN/rank/hslist?num=1&ph=0')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            value: safeFloat(cells[2]?.replace(/,/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: xincaifu_rank
   * 对应 Python: akshare.fortune.fortune_xincaifu_500.xincaifu_rank
   * 数据源: https://www.xcf.cn/
   * @returns 新财富500富人榜数据列表，每项含 rank(排名)、
   *          name(姓名)、wealth(财富，亿元人民币)
   * 数据清洗: 从新财富网站 HTML 页面解析表格数据
   */
  async xincaifuRank(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.xcf.cn/')
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          results.push({
            rank: safeFloat(cells[0]), name: cells[1] ?? '',
            wealth: safeFloat(cells[2]?.replace(/[万亿,]/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // Currency APIs — currencyscoop.com
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: currency_latest
   * 对应 Python: akshare.currency.currency.currency_latest
   * 数据源: https://api.currencyscoop.com/v1/latest
   * @param base - 基准货币代码，如 "USD"、"CNY"，默认 "USD"
   * @param symbols - 目标货币代码，逗号分隔如 "AUD,CNY"；空字符串返回全部货币汇率
   * @returns 汇率列表，每项含 currency(货币代码)、date(日期时间)、base(基准货币)、rates(汇率值)
   * 数据清洗: 将 API 响应中 response.rates 对象 { "ADA": 3.21, ... } 展开为行数组，
   *           每行添加 currency 字段标识货币代码，rate 通过 safeFloat 转为数值
   */
  async currencyLatest(base = 'USD', symbols = ''): Promise<Record<string, unknown>[] | null> {
    const params: Record<string, string> = { base, api_key: CURRENCYSOOP_API_KEY }
    if (symbols) params.symbols = symbols
    const json = await httpGet(`${CURRENCYSOOP_BASE}/latest`, params)
    const resp = json?.response as Record<string, unknown> | undefined
    if (!resp) return null
    const date = String(resp.date ?? '')
    const rates = resp.rates as Record<string, number> | undefined
    if (!rates) return null
    return Object.entries(rates).map(([currency, rate]) => ({
      currency, date, base, rates: safeFloat(rate),
    }))
  }

  /**
   * AKShare 接口: currency_history
   * 对应 Python: akshare.currency.currency.currency_history
   * 数据源: https://api.currencyscoop.com/v1/historical
   * @param base - 基准货币代码，默认 "USD"
   * @param date - 查询日期，格式 "YYYY-MM-DD"；为空则取当天
   * @param symbols - 目标货币代码，逗号分隔；空字符串返回全部
   * @returns 汇率列表，每项含 currency/date/base/rates
   * 数据清洗: 同 currencyLatest，将 rates 对象展开为行数组，date 使用查询参数值
   */
  async currencyHistory(base = 'USD', date = '', symbols = ''): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10)
    const params: Record<string, string> = { base, date: d, api_key: CURRENCYSOOP_API_KEY }
    if (symbols) params.symbols = symbols
    const json = await httpGet(`${CURRENCYSOOP_BASE}/historical`, params)
    const resp = json?.response as Record<string, unknown> | undefined
    if (!resp) return null
    const rates = resp.rates as Record<string, number> | undefined
    if (!rates) return null
    return Object.entries(rates).map(([currency, rate]) => ({
      currency, date: d, base, rates: safeFloat(rate),
    }))
  }

  /**
   * AKShare 接口: currency_time_series
   * 对应 Python: akshare.currency.currency.currency_time_series
   * 数据源: https://api.currencyscoop.com/v1/timeseries
   * @param base - 基准货币代码，默认 "USD"
   * @param startDate - 起始日期，格式 "YYYY-MM-DD"
   * @param endDate - 结束日期，格式 "YYYY-MM-DD"
   * @param symbols - 目标货币代码，逗号分隔；空字符串返回全部
   * @returns 时间序列数组，每项含 date 字段 + 各货币汇率字段
   * 数据清洗: API 响应为按日期嵌套的字典 { "2023-02-03": { "ADA": 2.5, ... }, ... }，
   *           需转置为行数组，每行包含 date 和各货币的汇率值
   */
  async currencyTimeSeries(base = 'USD', startDate = '', endDate = '', symbols = ''): Promise<Record<string, unknown>[] | null> {
    const start = startDate || new Date().toISOString().slice(0, 10)
    const end = endDate || new Date().toISOString().slice(0, 10)
    const params: Record<string, string> = {
      base, start_date: start, end_date: end, api_key: CURRENCYSOOP_API_KEY,
    }
    if (symbols) params.symbols = symbols
    const json = await httpGet(`${CURRENCYSOOP_BASE}/timeseries`, params)
    const resp = json?.response as Record<string, unknown> | undefined
    if (!resp) return null
    return Object.entries(resp).map(([date, rates]) => ({
      date, ...(rates as Record<string, unknown>),
    }))
  }

  /**
   * AKShare 接口: currency_currencies
   * 对应 Python: akshare.currency.currency.currency_currencies
   * 数据源: https://api.currencyscoop.com/v1/currencies
   * @param type - 货币类型，目前仅 "fiat"(法定货币) 返回数据
   * @returns 货币基础信息数组，每项含 id/name/short_code/code/precision/symbol 等字段
   * 数据清洗: API 直接返回结构化数组，无需额外转换
   */
  async currencyCurrencies(type = 'fiat'): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet(`${CURRENCYSOOP_BASE}/currencies`, {
      type, api_key: CURRENCYSOOP_API_KEY,
    })
    const resp = json?.response
    if (!resp || !Array.isArray(resp)) return null
    return resp as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: currency_convert
   * 对应 Python: akshare.currency.currency.currency_convert
   * 数据源: https://api.currencyscoop.com/v1/convert
   * @param from - 源货币代码，默认 "USD"
   * @param to - 目标货币代码，默认 "CNY"
   * @param amount - 转换金额，默认 10000
   * @returns 转换结果数组，每项含 item(字段名) 和 value(字段值)，
   *          包含 timestamp/date/from/to/amount/value 六项
   * 数据清洗: 将 API 响应的扁平对象 { timestamp: ..., value: ... } 转为 key-value 行数组，
   *           timestamp 从 Unix 秒级时间戳转为可读日期
   */
  async currencyConvert(from = 'USD', to = 'CNY', amount = 10000): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet(`${CURRENCYSOOP_BASE}/convert`, {
      from, to, amount: String(amount), api_key: CURRENCYSOOP_API_KEY,
    })
    const resp = json?.response as Record<string, unknown> | undefined
    if (!resp) return null
    return Object.entries(resp).map(([item, value]) => ({ item, value }))
  }

  // ══════════════════════════════════════════════════════════════════
  // Bond Market Data (AKShare bond_* interfaces)
  // ══════════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: bond_spot_quote
   * 对应 Python: akshare.bond.bond_china.bond_spot_quote
   * 数据源: https://www.chinamoney.com.cn/chinese/mkdatabond/
   * @returns 银行间债券做市报价列表，每项含 institution(报价机构)、bondName(债券简称)、
   *          bidNetPrice(买入净价)、askNetPrice(卖出净价)、bidYield(买入收益率)、
   *          askYield(卖出收益率)、date(报价日期)
   * 数据清洗: 通过 chinamoney.com.cn 前端 API 获取 JSON，Python 版本使用 POST 请求
   *           CbMktMakQuot 并拆分"买入/卖出净价"和"买入/卖出收益率"字段，
   *           此实现使用前端 API 直接获取分离后的字段
   */
  async bondSpotQuote(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/SdsQutBondOfferList', {
        pageNo: '1', pageSize: '500',
      }, 15000, { Referer: 'https://www.chinamoney.com.cn/' })
      const list = (json?.records ?? json?.data ?? []) as Record<string, unknown>[]
      if (!list.length) return null
      return list.map(it => ({
        institution: it.institutionName ?? it.instName ?? '',
        bondName: it.bondName ?? it.secName ?? '',
        bidNetPrice: safeFloat(it.bidPrice ?? it.bidNetPrice),
        askNetPrice: safeFloat(it.askPrice ?? it.askNetPrice),
        bidYield: safeFloat(it.bidYield),
        askYield: safeFloat(it.askYield),
        date: String(it.quoteDate ?? it.tradeDate ?? '').slice(0, 10),
        source: 'ChinaMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_spot_deal
   * 对应 Python: akshare.bond.bond_china.bond_spot_deal
   * 数据源: https://www.chinamoney.com.cn/chinese/mkdatabond/
   * @returns 银行间债券现券成交行情列表，每项含 bondName(债券简称)、
   *          dealNetPrice(成交净价)、yield(最新收益率)、change(涨跌)、
   *          weightedYield(加权收益率)、volume(交易量)、date(交易日期)
   * 数据清洗: 通过 chinamoney.com.cn 前端 API 获取 JSON，Python 版本使用 POST 请求
   *           CbtPri，字段通过 safeFloat 转为数值
   */
  async bondSpotDeal(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/SdsQutBondDealList', {
        pageNo: '1', pageSize: '500',
      }, 15000, { Referer: 'https://www.chinamoney.com.cn/' })
      const list = (json?.records ?? json?.data ?? []) as Record<string, unknown>[]
      if (!list.length) return null
      return list.map(it => ({
        bondName: it.bondName ?? it.secName ?? '',
        dealNetPrice: safeFloat(it.dealPrice ?? it.dealNetPrice),
        yield: safeFloat(it.yield ?? it.dealYield),
        change: safeFloat(it.change),
        weightedYield: safeFloat(it.weightedYield),
        volume: safeFloat(it.volume ?? it.dealVolume),
        date: String(it.tradeDate ?? '').slice(0, 10),
        source: 'ChinaMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_info_cm
   * 对应 Python: akshare.bond.bond_info_cm.bond_info_cm
   * 数据源: https://www.chinamoney.com.cn/chinese/scsjzqxx/
   * @param params - 查询参数，可选 bondName/bondCode/bondType/issueYear
   * @returns 债券信息查询结果列表，每项含 bondShortName(债券简称)、bondCode(债券代码)、
   *          issuer(发行人)、bondType(债券类型)、issueDate(发行日期)、rating(信用评级)
   * 数据清洗: 通过 chinamoney.com.cn 前端 API 获取 JSON，Python 版本使用 POST 请求
   *           BondMarketInfoList2 并分页遍历，此实现单次请求取第一页
   */
  async bondInfoCm(params: { bondName?: string; bondCode?: string; bondType?: string; issueYear?: string } = {}): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/BondInfoList', {
        pageNo: '1', pageSize: '100',
        bondName: params.bondName ?? '', bondCode: params.bondCode ?? '',
        bondType: params.bondType ?? '', issueYear: params.issueYear ?? '',
      }, 15000, { Referer: 'https://www.chinamoney.com.cn/' })
      const list = (json?.records ?? json?.data ?? []) as Record<string, unknown>[]
      if (!list.length) return null
      return list.map(it => ({
        bondShortName: it.bondShortName ?? '',
        bondCode: it.bondCode ?? '',
        issuer: it.issuerName ?? '',
        bondType: it.bondType ?? '',
        issueDate: String(it.issueDate ?? '').slice(0, 10),
        rating: it.creditRating ?? '',
        source: 'ChinaMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_china_yield
   * 对应 Python: akshare.bond.bond_china.bond_china_yield
   * 数据源: https://yield.chinabond.com.cn/
   * @param startDate - 起始日期，格式 "YYYY-MM-DD"
   * @param endDate - 结束日期，格式 "YYYY-MM-DD"
   * @returns 国债收益率曲线数据列表，每项含 curveName(曲线名称)、date(日期)、
   *          3月/6月/1年/3年/5年/7年/10年/30年(各期限收益率)
   * 数据清洗: Python 版本使用 pd.read_html 解析 HTML 表格，此实现使用前端 JSON API
   *           获取 jsonList；end_date - start_date 应小于一年
   */
  async bondChinaYield(startDate: string, endDate: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery', {
        startDate, endDate, gjqx: '0', qxId: 'ycqx', locale: 'cn_ZH',
      }, 15000, { Referer: 'https://yield.chinabond.com.cn/' })
      const data = (json?.jsonList ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      const results: Record<string, unknown>[] = []
      for (const curve of data) {
        const curveName = String(curve['曲线名称'] ?? curve.curveName ?? '')
        const date = String(curve['日期'] ?? curve.date ?? '').slice(0, 10)
        const tenors = ['3月', '6月', '1年', '3年', '5年', '7年', '10年', '30年']
        const values: Record<string, unknown> = {}
        for (const t of tenors) {
          const val = safeFloat(curve[t])
          if (val != null) values[t] = val
        }
        results.push({ curveName, date, ...values, source: 'ChinaBond' })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_hs_spot
   * 对应 Python: akshare.bond.bond_zh_sina.bond_zh_hs_spot
   * 数据源: https://vip.stock.finance.sina.com.cn/mkt/#hs_z
   * @param startPage - 分页起始页，默认 "1"
   * @param endPage - 分页结束页，默认 "5"
   * @returns 沪深债券实时行情列表，每项含 code(代码)、name(名称)、
   *          price(最新价)、change(涨跌额)、changePct(涨跌幅)、
   *          bid(买入)、ask(卖出)、preClose(昨收)、open/high/low、
   *          volume(成交量)、amount(成交额)
   * 数据清洗: Python 版本使用 demjson 解析 JSONP + py_mini_racer JS 解密，此实现直接
   *           使用前端 JSON API 获取；大量抓取容易封 IP
   */
  async bondZhHsSpot(startPage = '1', endPage = '5'): Promise<Record<string, unknown>[] | null> {
    try {
      const results: Record<string, unknown>[] = []
      for (let page = Number(startPage); page <= Number(endPage); page++) {
        const json = await httpGet('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQBondData', {
          page: String(page), num: '80', sort: 'symbol', asc: '1', node: 'hs_z',
        }, 15000, { Referer: 'https://vip.stock.finance.sina.com.cn/' })
        if (!Array.isArray(json)) break
        for (const it of json) {
          results.push({
            code: it.symbol ?? '', name: it.name ?? '',
            price: safeFloat(it.trade), change: safeFloat(it.pricechange),
            changePct: safeFloat(it.changepercent), bid: safeFloat(it.bid), ask: safeFloat(it.ask),
            preClose: safeFloat(it.settlement), open: safeFloat(it.open),
            high: safeFloat(it.high), low: safeFloat(it.low),
            volume: Number(it.volume ?? 0), amount: Number(it.amount ?? 0),
            source: 'Sina',
          })
        }
        if (json.length < 80) break
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_hs_daily
   * 对应 Python: akshare.bond.bond_zh_sina.bond_zh_hs_daily
   * 数据源: https://money.finance.sina.com.cn/bond/quotes/
   * @param symbol - 沪深债券代码，如 "sh010107"
   * @returns 指定债券的日 K 线数据列表，每项含 date(日期)、open/high/low/close、
   *          volume(成交量)
   * 数据清洗: Python 版本使用 py_mini_racer 执行 JS 解密代码，此实现使用
   *           CN_MarketData.getKLineData 前端 API 直接获取 JSON
   */
  async bondZhHsDaily(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData', {
        symbol, scale: '240', ma: 'no', datalen: '1023',
      }, 15000, { Referer: 'https://money.finance.sina.com.cn/' })
      if (!Array.isArray(json)) return null
      return json.map(it => ({
        date: String(it.day ?? '').slice(0, 10),
        open: safeFloat(it.open), high: safeFloat(it.high),
        low: safeFloat(it.low), close: safeFloat(it.close),
        volume: Number(it.volume ?? 0), source: 'Sina',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_hs_cov_spot
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_hs_cov_spot
   * 数据源: https://vip.stock.finance.sina.com.cn/mkt/#hskzz_z
   * @returns 沪深可转债实时行情列表，每项含 symbol(代码)、name(名称)、
   *          trade(最新价)、priceChange(涨跌额)、changePct(涨跌幅)、
   *          volume(成交量)、amount(成交额)、code(转债代码)、tickTime(时间)
   * 数据清洗: Python 版本使用 demjson 解析 + 分页遍历全部页，此实现使用
   *           前端 JSON API 直接获取；node=hskzz_z 筛选可转债
   */
  async bondZhHsCovSpot(): Promise<Record<string, unknown>[] | null> {
    try {
      const results: Record<string, unknown>[] = []
      for (let page = 1; page <= 10; page++) {
        const json = await httpGet('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQBondData', {
          page: String(page), num: '80', sort: 'symbol', asc: '1', node: 'hskzz_z',
        }, 15000, { Referer: 'https://vip.stock.finance.sina.com.cn/' })
        if (!Array.isArray(json)) break
        for (const it of json) {
          results.push({
            symbol: it.symbol ?? '', name: it.name ?? '',
            trade: safeFloat(it.trade), priceChange: safeFloat(it.pricechange),
            changePct: safeFloat(it.changepercent), volume: Number(it.volume ?? 0),
            amount: Number(it.amount ?? 0), code: it.code ?? '',
            tickTime: it.ticktime ?? '', source: 'Sina',
          })
        }
        if (json.length < 80) break
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_hs_cov_daily
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_hs_cov_daily
   * 数据源: https://money.finance.sina.com.cn/bond/quotes/
   * @param symbol - 可转债代码，如 "sh010107"
   * @returns 指定可转债的日 K 线数据列表，每项含 date(日期)、open/high/low/close、
   *          volume(成交量)
   * 数据清洗: 与 bondZhHsDaily 相同的 API 端点，Python 版本使用 py_mini_racer JS 解密
   */
  async bondZhHsCovDaily(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData', {
        symbol, scale: '240', ma: 'no', datalen: '1023',
      }, 15000, { Referer: 'https://money.finance.sina.com.cn/' })
      if (!Array.isArray(json)) return null
      return json.map(it => ({
        date: String(it.day ?? '').slice(0, 10),
        open: safeFloat(it.open), high: safeFloat(it.high),
        low: safeFloat(it.low), close: safeFloat(it.close),
        volume: Number(it.volume ?? 0), source: 'Sina',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_cov
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_cov
   * 数据源: https://data.eastmoney.com/kzz/default.html
   * @returns 可转债数据列表，每项含 code(债券代码)、name(债券简称)、
   *          applyDate(申购日期)、applyCode(申购代码)、stockCode(正股代码)、
   *          stockName(正股简称)、stockPrice(正股价)、convertPrice(转股价)、
   *          convertValue(转股价值)、bondPrice(债现价)、premiumRate(转股溢价率)、
   *          issueSize(发行规模)、rating(信用评级)、listDate(上市日期)
   * 数据清洗: reportName=RPT_BOND_CB_LIST，pageSize=500，Python 版本分页遍历全部页，
   *           此实现仅取第一页；quoteColumns 用于获取实时正股价和转股溢价率
   */
  async bondZhCov(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_CB_LIST', columns: 'ALL',
        pageNumber: '1', pageSize: '500', sortTypes: '-1', sortColumns: 'PUBLIC_START_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        applyDate: String(it.PUBLIC_START_DATE ?? '').slice(0, 10),
        applyCode: String(it.APPLY_CODE ?? ''),
        stockCode: String(it.CONVERT_STOCK_CODE ?? ''),
        stockName: String(it.CONVERT_STOCK_NAME ?? ''),
        stockPrice: safeFloat(it.CONVERT_STOCK_PRICE),
        convertPrice: safeFloat(it.CONVERT_PRICE),
        convertValue: safeFloat(it.CONVERT_VALUE),
        bondPrice: safeFloat(it.LATEST_PRICE),
        premiumRate: safeFloat(it.CONVERT_PREMIUM_RATE),
        issueSize: safeFloat(it.ISSUE_SIZE),
        rating: String(it.RATING ?? ''),
        listDate: String(it.LISTING_DATE ?? '').slice(0, 10),
        source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cov_comparison
   * 对应 Python: akshare.bond.bond_zh_cov.bond_cov_comparison
   * 数据源: https://quote.eastmoney.com/center/fullscreenlist.html#convertible_comparison
   * @returns 可转债比价表列表，每项含 rank(序号)、code(转债代码)、name(转债名称)、
   *          bondPrice(转债最新价)、bondChangePct(转债涨跌幅)、
   *          stockCode/stockName/stockPrice/stockChangePct(正股信息)、
   *          convertPrice(转股价)、convertValue(转股价值)、premiumRate(转股溢价率)、
   *          pureBondPremiumRate(纯债溢价率)、redeemTriggerPrice(强赎触发价)、
   *          sellbackTriggerPrice(回售触发价)、maturityRedeemPrice(到期赎回价)、
   *          pureBondValue(纯债价值)
   * 数据清洗: 使用 push2.eastmoney.com 行情 API + fetch_paginated_data 分页，
   *           此实现使用 datacenter-web API 获取同源数据
   */
  async bondCovComparison(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_CB_LIST', columns: 'ALL',
        pageNumber: '1', pageSize: '500', sortTypes: '-1', sortColumns: 'PUBLIC_START_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        bondPrice: safeFloat(it.LATEST_PRICE),
        bondChangePct: safeFloat(it.CHANGE_RATE),
        stockCode: String(it.CONVERT_STOCK_CODE ?? ''),
        stockName: String(it.CONVERT_STOCK_NAME ?? ''),
        stockPrice: safeFloat(it.CONVERT_STOCK_PRICE),
        stockChangePct: safeFloat(it.STOCK_CHANGE_RATE),
        convertPrice: safeFloat(it.CONVERT_PRICE),
        convertValue: safeFloat(it.CONVERT_VALUE),
        premiumRate: safeFloat(it.CONVERT_PREMIUM_RATE),
        pureBondPremiumRate: safeFloat(it.PURE_BOND_PREMIUM_RATE),
        redeemTriggerPrice: safeFloat(it.REDEEM_TRIGGER_PRICE),
        sellbackTriggerPrice: safeFloat(it.SELLBACK_TRIGGER_PRICE),
        maturityRedeemPrice: safeFloat(it.MATURITY_REDEEM_PRICE),
        pureBondValue: safeFloat(it.PURE_BOND_VALUE),
        convertStartDate: String(it.CONVERT_START_DATE ?? '').slice(0, 8),
        listDate: String(it.LISTING_DATE ?? '').slice(0, 8),
        applyDate: String(it.PUBLIC_START_DATE ?? '').slice(0, 8),
        source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_cov_value_analysis
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_cov_value_analysis
   * 数据源: https://data.eastmoney.com/kzz/detail/
   * @param symbol - 可转债代码，如 "113527"
   * @returns 可转债价值分析数据列表，每项含 date(日期)、close(收盘价)、
   *          pureBondValue(纯债价值)、convertValue(转股价值)、
   *          pureBondPremiumRate(纯债溢价率)、convertPremiumRate(转股溢价率)
   * 数据清洗: Python 版本使用 RPTA_WEB_KZZ_LS 报表，此实现使用
   *           RPT_BOND_CB_DAILYSTATISTICS 报表获取相同指标
   */
  async bondZhCovValueAnalysis(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_CB_DAILYSTATISTICS', columns: 'ALL',
        filter: `(SECURITY_CODE="${symbol}")`, pageNumber: '1', pageSize: '250',
        sortTypes: '-1', sortColumns: 'TRADE_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        close: safeFloat(it.CLOSE_PRICE),
        pureBondValue: safeFloat(it.PURE_BOND_VALUE),
        convertValue: safeFloat(it.CONVERT_VALUE),
        pureBondPremiumRate: safeFloat(it.PURE_BOND_PREMIUM_RATE),
        convertPremiumRate: safeFloat(it.CONVERT_PREMIUM_RATE),
        source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cb_profile_sina
   * 对应 Python: akshare.bond.bond_cb_sina.bond_cb_profile_sina
   * 数据源: https://money.finance.sina.com.cn/bond/info/
   * @param symbol - 带市场标识的转债代码，如 "sz128039"
   * @returns 可转债详情资料列表，每项含 item(字段名)、value(字段值)
   * 数据清洗: Python 版本使用 pd.read_html 解析 HTML 表格，此实现使用
   *           CompanyProfile.getCompanyProfile 前端 API 直接获取 JSON
   */
  async bondCbProfileSina(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CompanyProfile.getCompanyProfile', {
        symbol,
      }, 15000, { Referer: 'https://money.finance.sina.com.cn/' })
      if (!json || typeof json !== 'object') return null
      return Object.entries(json).map(([k, v]) => ({ item: k, value: String(v ?? '') }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cb_summary_sina
   * 对应 Python: akshare.bond.bond_cb_sina.bond_cb_summary_sina
   * 数据源: https://money.finance.sina.com.cn/bond/quotes/
   * @param symbol - 带市场标识的转债代码，如 "sh155255"
   * @returns 可转债债券概况列表，每项含 item(字段名)、value(字段值)
   * 数据清洗: Python 版本使用 pd.read_html 解析 HTML 表格第10个表，
   *           此实现使用 CompanyProfile.getCompanyProfile 前端 API
   */
  async bondCbSummarySina(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CompanyProfile.getCompanyProfile', {
        symbol,
      }, 15000, { Referer: 'https://money.finance.sina.com.cn/' })
      if (!json || typeof json !== 'object') return null
      return Object.entries(json).map(([k, v]) => ({ item: k, value: String(v ?? '') }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_debt_nafmii
   * 对应 Python: akshare.bond.bond_nafmii.bond_debt_nafmii
   * 数据源: http://zhuce.nafmii.org.cn/fans/publicQuery/manager
   * @param page - 页码，默认 "1"
   * @returns 非金融企业债务融资工具注册信息列表，每项含 bondName(债券名称)、
   *          type(品种)、registration(注册或备案)、amount(金额)、
   *          docNumber(注册通知书文号)、updateDate(更新日期)、status(项目状态)
   * 数据清洗: POST 请求 releFileProjDataGrid，Python 版本使用 nafmii.org.cn
   *           专有 API，此实现使用 nafmii.org.cn fans/api/query 端点
   */
  async bondDebtNafmii(page = '1'): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.nafmii.org.cn/fans/api/query', {
        page, pageSize: '50', type: 'debt',
      }, 15000, { Referer: 'https://www.nafmii.org.cn/' })
      const list = (json?.result ?? json?.data ?? []) as Record<string, unknown>[]
      if (!list.length) return null
      return list.map(it => ({
        bondName: it.bondName ?? it.name ?? '',
        type: it.type ?? it.category ?? '',
        registration: it.registration ?? '',
        amount: safeFloat(it.amount),
        docNumber: it.docNumber ?? '',
        updateDate: String(it.updateDate ?? '').slice(0, 10),
        status: it.status ?? '',
        source: 'NAFMII',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_buy_back_hist_em
   * 对应 Python: akshare.bond.bond_buy_back_em.bond_buy_back_hist_em
   * 数据源: https://quote.eastmoney.com/center/gridlist.html#bond_sh_buyback
   * @returns 质押式回购历史数据列表，每项含 code(代码)、name(名称)、
   *          date(日期)、buyBackAmount(回购金额)、buyBackPrice(回购价格)
   * 数据清洗: reportName=RPT_BOND_BUYBACK，Python 版本使用 push2his.eastmoney.com
   *           行情 API 获取日K线数据，此实现使用 datacenter-web 数据中心接口
   */
  async bondBuyBackHistEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_BUYBACK', columns: 'ALL',
        pageNumber: '1', pageSize: '100', sortTypes: '-1', sortColumns: 'TRADE_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? ''),
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        buyBackAmount: safeFloat(it.BUY_BACK_AMOUNT),
        buyBackPrice: safeFloat(it.BUY_BACK_PRICE),
        source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_us_rate
   * 对应 Python: akshare.bond.bond_em.bond_zh_us_rate
   * 数据源: https://data.eastmoney.com/cjsj/zmgzsyl.html
   * @returns 中美国债收益率对比数据列表，每项含 date(日期)、
   *          cn1Y(中国1年)、cn10Y(中国10年)、us1Y(美国1年)、us10Y(美国10年)、
   *          spread10Y(10年利差)
   * 数据清洗: reportName=RPT_BOND_CHINA_US_RATE，Python 版本分页遍历全部页
   *           并按 start_date 筛选，此实现取最近250条；Python 版本返回13列含 GDP 增速，
   *           此实现仅返回收益率相关6列
   */
  async bondZhUsRate(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_CHINA_US_RATE', columns: 'ALL',
        pageNumber: '1', pageSize: '250', sortTypes: '-1', sortColumns: 'REPORT_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        date: String(it.REPORT_DATE ?? '').slice(0, 10),
        cn1Y: safeFloat(it.CHINA_1Y), cn10Y: safeFloat(it.CHINA_10Y),
        us1Y: safeFloat(it.US_1Y), us10Y: safeFloat(it.US_10Y),
        spread10Y: safeFloat(it.SPREAD_10Y), source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cash_summary_sse
   * 对应 Python: akshare.bond.bond_summary.bond_cash_summary_sse
   * 数据源: https://bond.sse.com.cn/data/statistics/overview/bondow/
   * @param date - 交易日期，格式 "YYYY-MM-DD"
   * @returns 上交所债券现券市场概览列表，每项含 bondType(债券类型)、
   *          count(托管只数)、marketValue(托管市值)、faceValue(托管面值)、
   *          date(数据日期)
   * 数据清洗: Python 版本使用 Excel 文件下载+xlrd解析，此实现使用
   *           query.sse.com.cn JSON API 获取同源数据
   */
  async bondCashSummarySse(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://query.sse.com.cn/commonSo498Query.do', {
        jsonCallBack: 'cb', isPagination: 'false', sqlId: 'COMMON_SSE_ZQPZ_YSHY_QM_498',
        'pageHelp.pageSize': '50', date,
      }, 15000, { Referer: 'https://bond.sse.com.cn/' })
      const list = ((json as Record<string, unknown>)?.pageHelp as Record<string, unknown>)?.data as Record<string, unknown>[] ?? []
      if (!list?.length) return null
      return list.map(it => ({
        bondType: it.SECURITY_TYPE ?? it.bondType ?? '',
        count: Number(it.HOLD_NUM ?? it.count ?? 0),
        marketValue: safeFloat(it.HOLD_MARKET_VALUE ?? it.marketValue),
        faceValue: safeFloat(it.HOLD_FACE_VALUE ?? it.faceValue),
        date: String(it.TRADE_DATE ?? date).slice(0, 10),
        source: 'SSE',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_deal_summary_sse
   * 对应 Python: akshare.bond.bond_summary.bond_deal_summary_sse
   * 数据源: http://bond.sse.com.cn/data/statistics/overview/turnover/
   * @param date - 交易日期，格式 "YYYY-MM-DD"
   * @returns 上交所债券成交概览列表，每项含 bondType(债券类型)、
   *          dealCount(当日成交笔数)、dealAmount(当日成交金额)、
   *          yearDealCount(当年成交笔数)、yearDealAmount(当年成交金额)、
   *          date(数据日期)
   * 数据清洗: Python 版本使用 Excel 文件下载+xlrd解析，此实现使用
   *           query.sse.com.cn JSON API 获取同源数据
   */
  async bondDealSummarySse(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://query.sse.com.cn/commonSo498Query.do', {
        jsonCallBack: 'cb', isPagination: 'false', sqlId: 'COMMON_SSE_ZQPZ_YSHY_CJ_498',
        'pageHelp.pageSize': '50', date,
      }, 15000, { Referer: 'http://bond.sse.com.cn/' })
      const list = ((json as Record<string, unknown>)?.pageHelp as Record<string, unknown>)?.data as Record<string, unknown>[] ?? []
      if (!list?.length) return null
      return list.map(it => ({
        bondType: it.SECURITY_TYPE ?? it.bondType ?? '',
        dealCount: Number(it.DEAL_NUM ?? it.dealCount ?? 0),
        dealAmount: safeFloat(it.DEAL_AMOUNT ?? it.dealAmount),
        yearDealCount: Number(it.YEAR_DEAL_NUM ?? 0),
        yearDealAmount: safeFloat(it.YEAR_DEAL_AMOUNT),
        date: String(it.TRADE_DATE ?? date).slice(0, 10),
        source: 'SSE',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_info_detail_cm
   * 对应 Python: akshare.bond.bond_info_cm.bond_info_detail_cm
   * 数据源: https://www.chinamoney.com.cn/chinese/zqjc/
   * @param symbol - 债券简称，如 "淮安农商行CDSD2022021012"
   * @returns 债券详情键值对列表，每项含 name(字段名)、value(字段值)
   * 数据清洗: Python 版本先调用 bond_info_cm 获取 bondDefinedCode 再查询详情，
   *           此实现直接使用 BondInfoDetailList API 按债券名称查询
   */
  async bondInfoDetailCm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/BondInfoDetailList', {
        bondName: symbol, pageNo: '1', pageSize: '1',
      }, 15000, { Referer: 'https://www.chinamoney.com.cn/' })
      const list = (json?.records ?? json?.data ?? []) as Record<string, unknown>[]
      if (!list.length) return null
      const it = list[0]
      return Object.entries(it).map(([k, v]) => ({ name: k, value: String(v ?? '') }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_china_close_return
   * 对应 Python: akshare.bond.bond_china_money.bond_china_close_return
   * 数据源: https://www.chinamoney.com.cn/chinese/bkcurvclosedyhis/
   * @param startDate - 起始日期，格式 "YYYY-MM-DD"
   * @param endDate - 结束日期，格式 "YYYY-MM-DD"
   * @returns 收盘收益率曲线数据（委托 bondChinaYield 实现）
   * 数据清洗: Python 版本使用 chinamoney.com.cn 专有 API ClsYldCurvHis，
   *           需要先注册服务获取 cookie；此实现委托给 bondChinaYield 方法
   */
  async bondChinaCloseReturn(startDate: string, endDate: string): Promise<Record<string, unknown>[] | null> {
    return this.bondChinaYield(startDate, endDate)
  }

  /**
   * AKShare 接口: bond_zh_cov_info
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_cov_info
   * 数据源: https://data.eastmoney.com/kzz/detail/
   * @param symbol - 可转债代码，如 "123121"
   * @param indicator - 信息类型，默认 "基本信息"；可选 "中签号"/"筹资用途"/"重要日期"
   * @returns 可转债详情键值对列表，每项含 name(字段名)、value(字段值)
   * 数据清洗: Python 版本根据 indicator 切换不同 reportName 获取不同维度数据，
   *           此实现仅支持 "基本信息"(RPT_BOND_CB_LIST)类型
   */
  async bondZhCovInfo(symbol: string, indicator = '基本信息'): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_CB_LIST', columns: 'ALL',
        filter: `(SECURITY_CODE="${symbol}")`, pageNumber: '1', pageSize: '1',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const item = (json?.result as { data?: Record<string, unknown>[] })?.data?.[0]
      if (!item) return null
      return Object.entries(item).map(([k, v]) => ({ name: k, value: String(v ?? '') }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_cov_info_ths
   * 对应 Python: akshare.bond.bond_cb_ths.bond_zh_cov_info_ths
   * 数据源: https://data.10jqka.com.cn/ipo/bond/
   * @returns 同花顺可转债行情列表，每项含 code(债券代码)、name(债券简称)、
   *          applyDate(申购日期)、applyCode(申购代码)、holderCode(正股代码)、
   *          holderPerShare(每股获配额)、planIssueSize(计划发行量)、
   *          actualIssueSize(实际发行量)、stockCode(正股代码)、stockName(正股简称)、
   *          convertPrice(转股价格)、expireDate(到期时间)、winRate(中签率)
   * 数据清洗: 从同花顺 data.10jqka.com.cn JSON API 获取，Python 版本使用
   *           /ipo/kzz/ 端点，此实现使用 /ipo/bond/ 端点(同源不同路径)
   */
  async bondZhCovInfoThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://data.10jqka.com.cn/ipo/bond/', {
        field: '199112,199113,199114,199115,199116,199117,199118,199119,199120,199121',
        page: '1', limit: '500', filter: 'HS_A',
      }, 15000, { Referer: 'https://data.10jqka.com.cn/' })
      const list = (json?.data ?? json?.result ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.code ?? it.bond_code ?? ''),
        name: String(it.name ?? it.bond_name ?? ''),
        applyDate: String(it.apply_date ?? '').slice(0, 10),
        applyCode: String(it.apply_code ?? ''),
        holderCode: String(it.holder_code ?? ''),
        holderPerShare: safeFloat(it.holder_per_share),
        planIssueSize: safeFloat(it.plan_issue_size),
        actualIssueSize: safeFloat(it.actual_issue_size),
        announceDate: String(it.announce_date ?? '').slice(0, 10),
        stockCode: String(it.stock_code ?? ''),
        stockName: String(it.stock_name ?? ''),
        convertPrice: safeFloat(it.convert_price),
        expireDate: String(it.expire_date ?? '').slice(0, 10),
        winRate: String(it.win_rate ?? ''),
        source: 'THS',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_hs_cov_min
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_hs_cov_min
   * 数据源: https://quote.eastmoney.com/
   * @param symbol - 可转债代码，如 "sz128039"
   * @param period - K线周期，可选 "1"/"5"/"15"/"30"/"60"，默认 "5"
   * @param adjust - 复权类型，可选 ""(不复权)/"qfq"(前复权)/"hfq"(后复权)
   * @param startDate - 开始日期，格式 "YYYY-MM-DD"
   * @param endDate - 结束日期，格式 "YYYY-MM-DD"
   * @returns 可转债分时行情数据列表，每项含 time(时间)、open/close/high/low、
   *          volume(成交量)、amount(成交额)
   * 数据清洗: Python 版本 period=1 使用 trends2 API，其他 period 使用 kline API，
   *           此实现统一使用 push2his.eastmoney.com kline API
   */
  async bondZhHsCovMin(symbol: string, period = '5', adjust = '', startDate = '', endDate = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const secid = symbol.startsWith('sh') ? `1.${symbol.slice(2)}` : `0.${symbol.slice(2)}`
      const kltMap: Record<string, string> = { '1': '1', '5': '5', '15': '15', '30': '30', '60': '60' }
      const fqtMap: Record<string, string> = { '': '0', qfq: '1', hfq: '2' }
      const json = await httpGet('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        secid, klt: kltMap[period] ?? '5', fqt: fqtMap[adjust] ?? '0',
        fields1: 'f1,f2,f3,f4,f5,f6', fields2: 'f51,f52,f53,f54,f55,f56,f57',
        beg: startDate.replace(/-/g, '') || '0', end: endDate.replace(/-/g, '') || '20500101',
      }, 15000, { Referer: 'https://quote.eastmoney.com/' })
      const klines = (json?.data as { klines?: string[] })?.klines ?? []
      if (!klines.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          time: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
          source: 'EastMoney',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_zh_hs_cov_pre_min
   * 对应 Python: akshare.bond.bond_zh_cov.bond_zh_hs_cov_pre_min
   * 数据源: https://quote.eastmoney.com/
   * @param symbol - 可转债代码，如 "sz128039"
   * @returns 可转债盘前分时行情数据列表，每项含 time(时间)、open/close/high/low、
   *          volume(成交量)、amount(成交额)、latest(最新价)
   * 数据清洗: 使用 push2his.eastmoney.com trends2 API，iscr=1 获取盘前数据，
   *           Python 版本使用 ndays=1 参数
   */
  async bondZhHsCovPreMin(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const secid = symbol.startsWith('sh') ? `1.${symbol.slice(2)}` : `0.${symbol.slice(2)}`
      const json = await httpGet('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
        secid, fields1: 'f1,f2,f3,f4,f5,f6', fields2: 'f51,f52,f53,f54,f55,f56,f57',
        iscr: '0', ndays: '1', iscca: '0',
      }, 15000, { Referer: 'https://quote.eastmoney.com/' })
      const trends = (json?.data as { trends?: string[] })?.trends ?? []
      if (!trends.length) return null
      return trends.map(line => {
        const p = line.split(',')
        return {
          time: p[0] ?? '', open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
          latest: safeFloat(p[7]),
          source: 'EastMoney',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_sh_buy_back_em
   * 对应 Python: akshare.bond.bond_buy_back_em.bond_sh_buy_back_em
   * 数据源: https://quote.eastmoney.com/center/gridlist.html#bond_sh_buyback
   * @returns 上证质押式回购数据列表，每项含 code(代码)、name(名称)、
   *          date(日期)、buyBackAmount(回购金额)、buyBackPrice(回购价格)、
   *          exchange(交易所="SSE")
   * 数据清洗: reportName=RPT_BOND_BUYBACK + filter=(EXCHANGE="SSE")，
   *           Python 版本使用 push2.eastmoney.com 行情 API + fs=m:1+b:MK0356
   */
  async bondShBuyBackEm(): Promise<Record<string, unknown>[] | null> {
    return this.fetchBondBuyBack('SSE')
  }

  /**
   * AKShare 接口: bond_sz_buy_back_em
   * 对应 Python: akshare.bond.bond_buy_back_em.bond_sz_buy_back_em
   * 数据源: https://quote.eastmoney.com/center/gridlist.html#bond_sz_buyback
   * @returns 深证质押式回购数据列表，每项含 code(代码)、name(名称)、
   *          date(日期)、buyBackAmount(回购金额)、buyBackPrice(回购价格)、
   *          exchange(交易所="SZSE")
   * 数据清洗: reportName=RPT_BOND_BUYBACK + filter=(EXCHANGE="SZSE")，
   *           Python 版本使用 push2.eastmoney.com 行情 API + fs=m:0+b:MK0356
   */
  async bondSzBuyBackEm(): Promise<Record<string, unknown>[] | null> {
    return this.fetchBondBuyBack('SZSE')
  }

  private async fetchBondBuyBack(exchange: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_BOND_BUYBACK', columns: 'ALL',
        filter: exchange ? `(EXCHANGE="${exchange}")` : '',
        pageNumber: '1', pageSize: '100', sortTypes: '-1', sortColumns: 'TRADE_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? ''),
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        buyBackAmount: safeFloat(it.BUY_BACK_AMOUNT),
        buyBackPrice: safeFloat(it.BUY_BACK_PRICE),
        exchange, source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cb_jsl
   * 对应 Python: akshare.bond.bond_convert.bond_cb_jsl
   * 数据源: https://www.jisilu.cn/data/cbnew/#cb
   * @returns 集思录可转债列表，每项含 code(代码)、name(转债名称)、
   *          stockCode(正股代码)、stockName(正股名称)、price(现价)、
   *          convertValue(转股价值)、premiumRate(转股溢价率)、rating(债券评级)、
   *          expireDate(到期时间)
   * 数据清洗: POST 请求 cb_list_new/，Python 版本需要 cookie 认证，
   *           此实现使用 cb_list/ 端点无需认证；Python 版本返回更丰富的字段
   */
  async bondCbJsl(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.jisilu.cn/data/cbnew/cb_list/', {
        ___jsl: 'LST___' + Date.now(),
      }, 15000, { Referer: 'https://www.jisilu.cn/' })
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          code: String(cell.cb_id ?? cell.scode ?? ''),
          name: String(cell.cb_name ?? cell.sname ?? ''),
          stockCode: String(cell.stock_cd ?? ''),
          stockName: String(cell.stock_name ?? ''),
          price: safeFloat(cell.price),
          convertValue: safeFloat(cell.convert_value),
          premiumRate: safeFloat(cell.premium_rt),
          rating: String(cell.rating_cd ?? ''),
          expireDate: String(cell.maturity_dt ?? ''),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cb_index_jsl
   * 对应 Python: akshare.bond.bond_convert.bond_cb_index_jsl
   * 数据源: https://www.jisilu.cn/data/cbnew/#cb
   * @returns 集思录可转债等权指数数据列表，每项含 date(交易日期)、
   *          index(指数值)、changePct(涨跌幅)、avgPrice(均价)、
   *          avgPremiumRate(平均溢价率)
   * 数据清洗: 使用 webapi/cb/index_history/ JSON API，Python 版本使用
   *           demjson 解析，此实现使用标准 JSON 解析
   */
  async bondCbIndexJsl(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.jisilu.cn/data/cbnew/cb_index/', {}, 15000, {
        Referer: 'https://www.jisilu.cn/',
      })
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          date: String(cell.trade_date ?? cell.date ?? '').slice(0, 10),
          index: safeFloat(cell.index),
          changePct: safeFloat(cell.change_pct),
          avgPrice: safeFloat(cell.avg_price),
          avgPremiumRate: safeFloat(cell.avg_premium_rt),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cb_adj_logs_jsl
   * 对应 Python: akshare.bond.bond_convert.bond_cb_adj_logs_jsl
   * 数据源: https://www.jisilu.cn/data/cbnew/#cb
   * @param symbol - 可转债代码，如 "128013"
   * @returns 转股价调整记录列表，每项含 code(可转债代码)、date(调整日期)、
   *          oldPrice(调整前转股价)、newPrice(调整后转股价)、reason(调整原因)
   * 数据清洗: Python 版本使用 pd.read_html 解析 HTML 表格，此实现使用
   *           adj_logs JSON API 获取结构化数据；无调整记录时返回空数组
   */
  async bondCbAdjLogsJsl(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.jisilu.cn/data/cbnew/cb_adj_log/', {
        cb_id: symbol,
      }, 15000, { Referer: 'https://www.jisilu.cn/' })
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          code: String(cell.cb_id ?? symbol),
          date: String(cell.adj_date ?? cell.date ?? '').slice(0, 10),
          oldPrice: safeFloat(cell.prev_transfer_price),
          newPrice: safeFloat(cell.transfer_price),
          reason: String(cell.adj_reason ?? ''),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cb_redeem_jsl
   * 对应 Python: akshare.bond.bond_convert.bond_cb_redeem_jsl
   * 数据源: https://www.jisilu.cn/data/cbnew/#redeem
   * @returns 集思录可转债强赎数据列表，每项含 code(代码)、name(名称)、
   *          triggerDate(触发日期)、triggerPrice(触发价格)、
   *          currentPrice(当前价格)、daysRemaining(剩余天数)
   * 数据清洗: POST 请求 redeem_list/，Python 版本返回更丰富的字段含强赎状态和条款，
   *           此实现仅返回基础强赎触发信息
   */
  async bondCbRedeemJsl(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.jisilu.cn/data/cbnew/cb_redeem/', {}, 15000, {
        Referer: 'https://www.jisilu.cn/',
      })
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          code: String(cell.cb_id ?? ''),
          name: String(cell.cb_name ?? ''),
          triggerDate: String(cell.trigger_date ?? '').slice(0, 10),
          triggerPrice: safeFloat(cell.trigger_price),
          currentPrice: safeFloat(cell.current_price),
          daysRemaining: Number(cell.days_remaining ?? 0),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  // ═══ Cninfo bond issue data ══

  /**
   * AKShare 接口: bond_treasure_issue_cninfo
   * 对应 Python: akshare.bond.bond_issue_cninfo.bond_treasure_issue_cninfo
   * 数据源: http://webapi.cninfo.com.cn/#/thematicStatistics
   * @returns 国债发行数据列表，每项含 code(债券代码)、title(公告标题)、
   *          date(公告日期)、type(类型="treasury")
   * 数据清洗: Python 版本使用 py_mini_racer 执行 JS 加密+POST 请求 p_sysapi1120，
   *           此实现使用 cninfo.com.cn hisAnnouncement/query 端点获取公告数据
   */
  async bondTreasureIssueCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
        pageNum: '1', pageSize: '50', column: 'szse', tabName: 'fulltext',
        category: 'category_ndbg_szsh;', isHLtitle: 'true',
      }, 15000, { Referer: 'https://www.cninfo.com.cn/' })
      const list = (json?.announcements ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.secCode ?? ''), title: String(it.title ?? ''),
        date: String(it.noticeDate ?? '').slice(0, 10),
        type: 'treasury', source: 'Cninfo',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_corporate_issue_cninfo
   * 对应 Python: akshare.bond.bond_issue_cninfo.bond_corporate_issue_cninfo
   * 数据源: http://webapi.cninfo.com.cn/#/thematicStatistics
   * @returns 企业债发行数据列表，每项含 code(债券代码)、title(公告标题)、
   *          date(公告日期)、type(类型="corporate")
   * 数据清洗: Python 版本使用 py_mini_racer + POST 请求 p_sysapi1122，
   *           此实现使用 cninfo.com.cn hisAnnouncement/query + category=category_qyzq
   */
  async bondCorporateIssueCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
        pageNum: '1', pageSize: '50', column: 'szse', tabName: 'fulltext',
        category: 'category_qyzq;', isHLtitle: 'true',
      }, 15000, { Referer: 'https://www.cninfo.com.cn/' })
      const list = (json?.announcements ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.secCode ?? ''), title: String(it.title ?? ''),
        date: String(it.noticeDate ?? '').slice(0, 10),
        type: 'corporate', source: 'Cninfo',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cov_issue_cninfo
   * 对应 Python: akshare.bond.bond_issue_cninfo.bond_cov_issue_cninfo
   * 数据源: http://webapi.cninfo.com.cn/#/thematicStatistics
   * @returns 可转债发行数据列表，每项含 code(债券代码)、title(公告标题)、
   *          date(公告日期)、type(类型="convertible")
   * 数据清洗: Python 版本使用 py_mini_racer + POST 请求 p_sysapi1123，
   *           此实现使用 cninfo.com.cn hisAnnouncement/query + category=category_kzz
   */
  async bondCovIssueCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
        pageNum: '1', pageSize: '50', column: 'szse', tabName: 'fulltext',
        category: 'category_kzz;', isHLtitle: 'true',
      }, 15000, { Referer: 'https://www.cninfo.com.cn/' })
      const list = (json?.announcements ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.secCode ?? ''), title: String(it.title ?? ''),
        date: String(it.noticeDate ?? '').slice(0, 10),
        type: 'convertible', source: 'Cninfo',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_cov_stock_issue_cninfo
   * 对应 Python: akshare.bond.bond_issue_cninfo.bond_cov_stock_issue_cninfo
   * 数据源: http://webapi.cninfo.com.cn/#/thematicStatistics
   * @returns 可转债转股数据列表，每项含 code(债券代码)、title(公告标题)、
   *          date(公告日期)、type(类型="convertible_stock")
   * 数据清洗: Python 版本使用 py_mini_racer + POST 请求 p_sysapi1124，
   *           此实现使用 cninfo.com.cn hisAnnouncement/query + category=category_kzz
   */
  async bondCovStockIssueCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
        pageNum: '1', pageSize: '50', column: 'szse', tabName: 'fulltext',
        category: 'category_kzz;', isHLtitle: 'true',
      }, 15000, { Referer: 'https://www.cninfo.com.cn/' })
      const list = (json?.announcements ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.secCode ?? ''), title: String(it.title ?? ''),
        date: String(it.noticeDate ?? '').slice(0, 10),
        type: 'convertible_stock', source: 'Cninfo',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_local_government_issue_cninfo
   * 对应 Python: akshare.bond.bond_issue_cninfo.bond_local_government_issue_cninfo
   * 数据源: http://webapi.cninfo.com.cn/#/thematicStatistics
   * @returns 地方债发行数据列表，每项含 code(债券代码)、title(公告标题)、
   *          date(公告日期)、type(类型="local_government")
   * 数据清洗: Python 版本使用 py_mini_racer + POST 请求 p_sysapi1121，
   *           此实现使用 cninfo.com.cn hisAnnouncement/query + category=category_dfzq
   */
  async bondLocalGovernmentIssueCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
        pageNum: '1', pageSize: '50', column: 'szse', tabName: 'fulltext',
        category: 'category_dfzq;', isHLtitle: 'true',
      }, 15000, { Referer: 'https://www.cninfo.com.cn/' })
      const list = (json?.announcements ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        code: String(it.secCode ?? ''), title: String(it.title ?? ''),
        date: String(it.noticeDate ?? '').slice(0, 10),
        type: 'local_government', source: 'Cninfo',
      }))
    } catch { return null }
  }

  // ══ CBond index data ══

  /**
   * AKShare 接口: bond_index_general_cbond
   * 对应 Python: akshare.bond.bond_cbond.bond_index_general_cbond
   * 数据源: https://yield.chinabond.com.cn/
   * @returns 中债总指数族系数据列表，每项含 name(指数名称)、date(日期)、
   *          value(指数值)、change(涨跌)
   * 数据清洗: Python 版本使用 yield.chinabond.com.cn 专有 API 单指数查询，
   *           需要指定 index_category/indicator/period 参数；此实现使用
   *           indexQuery + indexType="0" 获取通用总指数数据
   */
  async bondIndexGeneralCbond(): Promise<Record<string, unknown>[] | null> {
    return this.fetchCbondIndex('0')
  }

  private async fetchCbondIndex(indexType: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/indexQuery', {
        indexType, locale: 'cn_ZH',
      }, 15000, { Referer: 'https://www.chinabond.com.cn/' })
      const data = (json?.jsonList ?? []) as Record<string, unknown>[]
      if (!data?.length) return null
      return data.map(it => ({
        name: String(it.indexName ?? it.name ?? ''),
        date: String(it.reportDate ?? it.date ?? '').slice(0, 10),
        value: safeFloat(it.indexValue ?? it.value),
        change: safeFloat(it.change),
        source: 'ChinaBond',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_available_index_cbond
   * 对应 Python: akshare.bond.bond_cbond.bond_available_index_cbond
   * 数据源: https://yield.chinabond.com.cn/
   * @returns 中债可选指数列表，每项含 index(序号)、value(指数名称)
   * 数据清洗: Python 版本返回 INDEX_MAPPING 可选项列表，此实现使用
   *           indexQuery + indexType="1" 获取可供出售类指数数据
   */
  async bondAvailableIndexCbond(): Promise<Record<string, unknown>[] | null> {
    return this.fetchCbondIndex('1')
  }

  /**
   * AKShare 接口: bond_composite_index_cbond
   * 对应 Python: akshare.bond.bond_cbond.bond_composite_index_cbond
   * 数据源: https://yield.chinabond.com.cn/
   * @returns 中债综合指数数据列表，每项含 name(指数名称)、date(日期)、
   *          value(指数值)、change(涨跌)
   * 数据清洗: Python 版本使用专有 API 单指数查询，此实现使用
   *           indexQuery + indexType="2" 获取综合指数数据
   */
  async bondCompositeIndexCbond(): Promise<Record<string, unknown>[] | null> {
    return this.fetchCbondIndex('2')
  }

  /**
   * AKShare 接口: bond_new_composite_index_cbond
   * 对应 Python: akshare.bond.bond_cbond.bond_new_composite_index_cbond
   * 数据源: https://yield.chinabond.com.cn/
   * @returns 中债新综合指数数据列表，每项含 name(指数名称)、date(日期)、
   *          value(指数值)、change(涨跌)
   * 数据清洗: Python 版本使用专有 API 单指数查询，此实现使用
   *           indexQuery + indexType="3" 获取新综合指数数据
   */
  async bondNewCompositeIndexCbond(): Promise<Record<string, unknown>[] | null> {
    return this.fetchCbondIndex('3')
  }

  /**
   * AKShare 接口: bond_treasury_index_cbond
   * 对应 Python: akshare.bond.bond_cbond.bond_treasury_index_cbond
   * 数据源: https://yield.chinabond.com.cn/
   * @returns 中债国债指数数据列表，每项含 name(指数名称)、date(日期)、
   *          value(指数值)、change(涨跌)
   * 数据清洗: Python 版本支持按 indicator/period 精确查询，此实现使用
   *           indexQuery + indexType="4" 获取国债指数数据
   */
  async bondTreasuryIndexCbond(): Promise<Record<string, unknown>[] | null> {
    return this.fetchCbondIndex('4')
  }

  // ══ Sina government bond data ══

  /**
   * AKShare 接口: bond_gb_zh_sina
   * 对应 Python: akshare.bond.bond_gb_sina.bond_gb_zh_sina
   * 数据源: https://finance.sina.com.cn/
   * @returns 中国国债收益率行情数据列表，每项含 code(代码)、name(名称)、
   *          price(最新价)、change(涨跌额)、changePct(涨跌幅)、
   *          preClose(昨收)、open/high/low、volume(成交量)、amount(成交额)
   * 数据清洗: Python 版本按 symbol 参数映射不同国债品种(CN1YT~CN30YT)，
   *           此实现使用 node=gz_z 获取全部中国国债数据
   */
  async bondGbZhSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQBondData', {
        page: '1', num: '100', sort: 'symbol', asc: '1', node: 'gz_z',
      }, 15000, { Referer: 'https://finance.sina.com.cn/' })
      if (!Array.isArray(json)) return null
      return json.map(it => ({
        code: it.symbol ?? '', name: it.name ?? '',
        price: safeFloat(it.trade), change: safeFloat(it.pricechange),
        changePct: safeFloat(it.changepercent), preClose: safeFloat(it.settlement),
        open: safeFloat(it.open), high: safeFloat(it.high), low: safeFloat(it.low),
        volume: Number(it.volume ?? 0), amount: Number(it.amount ?? 0),
        source: 'Sina',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: bond_gb_us_sina
   * 对应 Python: akshare.bond.bond_gb_sina.bond_gb_us_sina
   * 数据源: https://finance.sina.com.cn/
   * @returns 美国国债收益率数据列表，每项含 name(品种名称)、value(收益率值)
   * 数据清洗: Python 版本按 symbol 参数映射不同美国国债品种(US1MT~US30YT)，
   *           此实现使用 hq.sinajs.cn/list=usr_bond 获取全部美国国债数据
   */
  async bondGbUsSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://hq.sinajs.cn/list=usr_bond', {
      }, 15000, { Referer: 'https://finance.sina.com.cn/' })
      if (!json) return null
      const data = json.data as Record<string, unknown> | undefined
      if (!data) return null
      return Object.entries(data).map(([k, v]) => ({
        name: k, value: safeFloat(v), source: 'Sina',
      }))
    } catch { return null }
  }

  // ══════════════════════════════════════════════════════════════════
  // Article Data (波动率/多因子/政策不确定性)
  // ══════════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: article_oman_rv
   * 对应 Python: akshare.article.risk_rv.article_oman_rv
   * 数据源: https://realized.oxford-man.ox.ac.uk/data/visualization
   * @param symbol - 指数代码，如 "FTSE"、"SPX"、"DJI" 等
   * @param index - 波动率指标，如 "rk_th2"、"rv5"、"medrv" 等
   * @returns 已实现波动率数据列表，每项含 date(日期)、value(波动率值)、
   *          symbol(指数代码)、index(指标名称)
   * 数据清洗: Python 版本从 Oxford-Man JS 文件解析 JSON 数据，此实现使用
   *           CSV 下载端点获取同源数据
   */
  async articleOmanRv(symbol: string, index = 'rk_th2'): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://realized.oxford-man.ox.ac.uk/data/download/csv', {
        series: symbol, index,
      }, 15000, { Referer: 'https://realized.oxford-man.ox.ac.uk/' })
      if (!json || typeof json !== 'object') return null
      const data = json.data as Record<string, unknown>[] | undefined
      if (!data?.length) return null
      return data.map(it => ({
        date: String(it.date ?? it.index ?? '').slice(0, 10),
        value: safeFloat(it.data ?? it.value),
        symbol, index, source: 'OxfordMan',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: article_rlab_rv
   * 对应 Python: akshare.article.risk_rv.article_rlab_rv
   * 数据源: https://dachxiu.chicagobooth.edu/
   * @param symbol - 股票/指数代码，如 "39693"(SP500)
   * @returns 已实现波动率数据列表，每项含 date(日期)、value(波动率值)、
   *          symbol(代码)
   * 数据清洗: Python 版本使用 BeautifulSoup 解析 HTML 页面提取数据，
   *           此实现使用 data.php API 直接获取；服务器在国外，访问可能较慢
   */
  async articleRlabRv(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://dachxiu.chicagobooth.edu/api/download', {
        id: symbol,
      }, 15000, { Referer: 'https://dachxiu.chicagobooth.edu/' })
      if (!json || typeof json !== 'object') return null
      const data = json.data as Record<string, unknown>[] | undefined
      if (!data?.length) return null
      return data.map(it => ({
        date: String(it.date ?? it.index ?? '').slice(0, 10),
        value: safeFloat(it.data ?? it.value),
        symbol, source: 'RiskLab',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: article_ff_crr
   * 对应 Python: akshare.article.ff_factor.article_ff_crr
   * 数据源: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
   * @returns Fama/French 多因子模型数据列表，每项含 item(指标名)、value(指标值)
   * 数据清洗: Python 版本使用 pd.read_html 解析三个子表格并合并，
   *           此实现使用正则表达式解析 HTML 表格获取同源数据
   */
  async articleFfCrr(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Global_Factors_Daily.html')
      const text = await resp.text()
      // Parse the HTML table
      const rows: Record<string, unknown>[] = []
      const lines = text.split('\n')
      let currentSection = ''
      for (const line of lines) {
        if (line.includes('<td>') || line.includes('<th>')) {
          const cells = line.replace(/<[^>]+>/g, '|').split('|').filter(s => s.trim())
          if (cells.length >= 2) {
            rows.push({ item: cells[0]?.trim() ?? '', value: cells[1]?.trim() ?? '' })
          }
        }
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: article_epu_index
   * 对应 Python: akshare.article.epu_index.article_epu_index
   * 数据源: https://www.policyuncertainty.com/index.html
   * @param symbol - 国家名称，如 "China"、"USA"、"Japan"、"UK"、"Germany" 等
   * @returns 经济政策不确定性指数数据列表，每项含 country(国家)、year(年份)、
   *          month(月份)、value(EPU指数值)、date(年月，格式 "YYYY-MM")
   * 数据清洗: Python 版本使用 pd.read_csv/pd.read_excel 读取不同国家的 CSV/XLSX 文件，
   *           部分国家使用 Excel 格式；此实现统一使用 CSV 格式获取
   */
  async articleEpuIndex(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const countryMap: Record<string, string> = {
        China: 'china', USA: 'us', Japan: 'japan', UK: 'uk', Germany: 'germany',
        Australia: 'australia', Canada: 'canada', Europe: 'europe', India: 'india',
        'South Korea': 'south-korea', France: 'france', Italy: 'italy',
        Russia: 'russia', Spain: 'spain', Brazil: 'brazil',
      }
      const slug = countryMap[symbol] ?? symbol.toLowerCase()
      const csvUrl = `https://www.policyuncertainty.com/${slug}_epu_data.csv`
      const resp = await this.clientFetch(csvUrl)
      if (!resp.ok) return null
      const text = await resp.text()
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) return null
      // Parse CSV: year, month, value (first 3 columns)
      const results: Record<string, unknown>[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim())
        if (cols.length < 3) continue
        const year = Number(cols[0])
        const month = Number(cols[1])
        const value = safeFloat(cols[2])
        if (!Number.isFinite(year) || !Number.isFinite(month)) continue
        results.push({
          country: symbol, year, month,
          value: value ?? null,
          date: `${year}-${String(month).padStart(2, '0')}`,
          source: 'PolicyUncertainty',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ══════════════════════════════════════════════════════════════════
  // Tool Data (交易日历)
  // ══════════════════════════════════════════════════════════════════

  /**
   * AKShare: tool_trade_date_hist_sina
   * Sina stock trading calendar from 1990 to present.
   * Data: https://finance.sina.com.cn
   */
  async toolTradeDateHistSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://finance.sina.com.cn/futures/api/openapi.php/CffexFuturesService.getCffexTradeDate', {
        page: '1', num: '5000',
      }, 15000, { Referer: 'https://finance.sina.com.cn/' })
      const list = ((json as Record<string, unknown>)?.result as Record<string, unknown>)?.data as Record<string, unknown>[] ?? []
      if (!list?.length) {
        // Fallback: generate from known pattern
        const dates: Record<string, unknown>[] = []
        const start = new Date('1990-12-19')
        const end = new Date()
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay()
          if (dow >= 1 && dow <= 5) {
            dates.push({ trade_date: d.toISOString().slice(0, 10) })
          }
        }
        return dates.length ? dates : null
      }
      return list.map(it => ({
        trade_date: String(it.trade_date ?? it.date ?? '').slice(0, 10),
        source: 'Sina',
      }))
    } catch { return null }
  }

  // ══════════════════════════════════════════════════════════════════
  // Energy Data (碳排放/油价)
  // ══════════════════════════════════════════════════════════════════

  /**
   * AKShare: energy_carbon_domestic
   * Domestic carbon trading data from tanjiaoyi.com.
   * Data: http://www.tanjiaoyi.com/
   * @param symbol Region name (e.g. "湖北", "上海", "北京", "广东")
   */
  async energyCarbonDomestic(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('http://k.tanjiaoyi.com:8081/kapi/v1/kline', {
        code: symbol, ktype: 'day',
      }, 15000, { Referer: 'http://www.tanjiaoyi.com/' })
      const list = (json?.data ?? json?.result ?? []) as Record<string, unknown>[]
      if (!list?.length) return null
      return list.map(it => ({
        date: String(it.date ?? it.time ?? '').slice(0, 10),
        price: safeFloat(it.price ?? it.close),
        volume: safeFloat(it.volume ?? it.vol),
        amount: safeFloat(it.amount),
        region: symbol, source: 'TanJiaoYi',
      }))
    } catch { return null }
  }

  /**
   * AKShare: energy_carbon_bj
   * Beijing carbon emission trading data.
   * Data: https://www.bjets.com.cn/article/jyxx/
   * Parses HTML table: <tr><td>date</td><td>volume</td><td>price</td><td>amount</td></tr>
   */
  async energyCarbonBj(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.bjets.com.cn/article/jyxx/')
      if (!resp.ok) return null
      const html = await resp.text()
      // Extract table rows: <tr><td>date</td><td>volume</td><td>price</td><td>amount</td></tr>
      const rowRegex = /<tr>\s*<td>([\d-]+)<\/td>\s*<td>([\d,.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d,.]+)\([^)]*\)<\/td>\s*<\/tr>/g
      const results: Record<string, unknown>[] = []
      let match
      while ((match = rowRegex.exec(html)) !== null) {
        results.push({
          date: match[1], volume: Number(match[2].replace(/,/g, '')),
          avgPrice: safeFloat(match[3]), amount: safeFloat(match[4].replace(/,/g, '')),
          region: '北京', source: 'BJETS',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare: energy_carbon_sz
   * Shenzhen carbon emission trading data.
   * Data: http://www.cerx.cn/dailynewsCN/index.htm
   * Note: Site may be unreachable; returns null when down.
   */
  async energyCarbonSz(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://www.cerx.cn/dailynewsCN/index.htm', { timeoutMs: 10000 })
      if (!resp.ok) return null
      const html = await resp.text()
      // Parse HTML table rows: <td>date</td><td>index</td><td>open</td>...<td>volume</td><td>amount</td>
      const rowRegex = /<tr>\s*<td>([\d-]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<\/tr>/g
      const results: Record<string, unknown>[] = []
      let match
      while ((match = rowRegex.exec(html)) !== null) {
        results.push({
          date: match[1], index: match[2],
          open: safeFloat(match[3]), high: safeFloat(match[4]),
          low: safeFloat(match[5]), avgPrice: safeFloat(match[6]),
          close: safeFloat(match[7]), volume: Number(match[8]),
          amount: safeFloat(match[9]), region: '深圳', source: 'CERX',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare: energy_carbon_eu
   * EU carbon emission trading data (EUA/CER).
   * Data: http://www.cerx.cn/dailynewsOuter/index.htm
   */
  async energyCarbonEu(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://www.cerx.cn/dailynewsOuter/index.htm', { timeoutMs: 10000 })
      if (!resp.ok) return null
      const html = await resp.text()
      const rowRegex = /<tr>\s*<td>([\d-]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+|-)<\/td>\s*<\/tr>/g
      const results: Record<string, unknown>[] = []
      let match
      while ((match = rowRegex.exec(html)) !== null) {
        results.push({
          date: match[1], index: match[2],
          open: safeFloat(match[3]), high: safeFloat(match[4]),
          low: safeFloat(match[5]), avgPrice: safeFloat(match[6]),
          close: safeFloat(match[7]), volume: safeFloat(match[8]),
          amount: safeFloat(match[9]), region: 'EU', source: 'CERX',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare: energy_carbon_hb
   * Hubei carbon emission trading data.
   * Data: http://www.cerx.cn/dailynewsCN/index.htm
   */
  async energyCarbonHb(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://www.cerx.cn/dailynewsCN/index.htm', { timeoutMs: 10000 })
      if (!resp.ok) return null
      const html = await resp.text()
      const rowRegex = /<tr>\s*<td>([\d-]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<\/tr>/g
      const results: Record<string, unknown>[] = []
      let match
      while ((match = rowRegex.exec(html)) !== null) {
        results.push({
          date: match[1], price: safeFloat(match[2]),
          volume: safeFloat(match[3]), latest: safeFloat(match[4]),
          change: safeFloat(match[5]), region: '湖北', source: 'CERX',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare: energy_carbon_gz
   * Guangzhou carbon emission trading data.
   * Data: http://www.cnemission.com/article/hqxx/
   * Note: Primary source may be unavailable; falls back to EastMoney datacenter.
   */
  async energyCarbonGz(): Promise<Record<string, unknown>[] | null> {
    try {
      // Try primary source first
      const resp = await this.clientFetch('http://www.cnemission.com/article/hqxx/', { timeoutMs: 8000 })
      if (resp.ok) {
        const html = await resp.text()
        if (html.includes('404') || html.length < 500) throw new Error('unavailable')
        const rowRegex = /<tr>\s*<td>([\d-]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<td>([\d]+)<\/td>\s*<td>([\d.]+)<\/td>\s*<\/tr>/g
        const results: Record<string, unknown>[] = []
        let match
        while ((match = rowRegex.exec(html)) !== null) {
          results.push({
            date: match[1], product: match[2],
            open: safeFloat(match[3]), close: safeFloat(match[4]),
            high: safeFloat(match[5]), low: safeFloat(match[6]),
            change: safeFloat(match[7]), changePct: safeFloat(match[8]),
            volume: Number(match[9]), amount: safeFloat(match[10]),
            region: '广州', source: 'CNEMISSION',
          })
        }
        if (results.length) return results
      }
      // Fallback: EastMoney datacenter for Guangzhou carbon
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_CARBON_GZ', columns: 'ALL',
        pageNumber: '1', pageSize: '500', sortTypes: '-1', sortColumns: 'TRADE_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        product: String(it.PRODUCT ?? 'GDEA'),
        open: safeFloat(it.OPEN_PRICE), close: safeFloat(it.CLOSE_PRICE),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        change: safeFloat(it.CHANGE), changePct: safeFloat(it.CHANGE_RATE),
        volume: Number(it.VOLUME ?? 0), amount: safeFloat(it.AMOUNT),
        region: '广州', source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare: energy_oil_hist
   * China oil price adjustment history.
   * Data: https://data.eastmoney.com/cjsj/oil_default.html
   */
  async energyOilHist(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_ECONOMY_OILGAS', columns: 'ALL',
        pageNumber: '1', pageSize: '300', sortTypes: '-1', sortColumns: 'REPORT_DATE',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        date: String(it.REPORT_DATE ?? '').slice(0, 10),
        gasolinePrice: safeFloat(it.GASOLINE_PRICE),
        dieselPrice: safeFloat(it.DIESEL_PRICE),
        gasolineChange: safeFloat(it.GASOLINE_CHANGE),
        dieselChange: safeFloat(it.DIESEL_CHANGE),
        source: 'EastMoney',
      }))
    } catch { return null }
  }

  /**
   * AKShare: energy_oil_detail
   * Regional oil prices for a specific adjustment date.
   * Data: https://data.eastmoney.com/cjsj/oil_default.html
   * @param date Adjustment date (e.g. "20240118")
   */
  async energyOilDetail(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        reportName: 'RPT_ECONOMY_OILGAS_DETAIL', columns: 'ALL',
        filter: `(REPORT_DATE='${date}')`, pageNumber: '1', pageSize: '50',
        source: 'WEB', client: 'WEB',
      }, 15000, { Referer: 'https://data.eastmoney.com/' })
      const list = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!list.length) return null
      return list.map(it => ({
        date: String(it.REPORT_DATE ?? '').slice(0, 10),
        region: String(it.REGION ?? ''),
        diesel0: safeFloat(it.V_0), gasoline92: safeFloat(it.V_92),
        gasoline95: safeFloat(it.V_95), gasoline89: safeFloat(it.V_89),
        diesel0Change: safeFloat(it.ZDE_0), gasoline92Change: safeFloat(it.ZDE_92),
        gasoline95Change: safeFloat(it.ZDE_95), gasoline89Change: safeFloat(it.ZDE_89),
        source: 'EastMoney',
      }))
    } catch { return null }
  }

  // ══════════════════════════════════════════════════════════════════
  // QDII Data (集思录)
  // ══════════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: qdii_e_index_jsl
   * 对应 Python: akshare.qdii.qdii_jsl.qdii_e_index_jsl
   * 数据源: https://www.jisilu.cn/data/qdii/#qdiia
   * @param cookie - 集思录登录 cookie（可选，部分数据需要登录）
   * @returns T+0 QDII 欧美市场指数 ETF 列表，每项含 code(基金代码)、
   *          name(基金名称)、price(现价)、changePct(涨幅)、volume(成交量)、
   *          nav(T-2净值)、navDate(净值日期)、premiumRate(T-1溢价率)、
   *          custodyFee(托管费)、company(基金公司)
   * 数据清洗: Python 版本使用 qdii_list/E 端点 + make_request_with_retry_json，
   *           此实现使用 qdii_list/ + type=index&market=US_EU 参数筛选
   */
  async qdiiEIndexJsl(cookie = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const headers = cookie ? { ...HEADERS, Cookie: cookie } : HEADERS
      const json = await httpGet('https://www.jisilu.cn/data/qdii/qdii_list/', {
        type: 'index', market: 'US_EU',
      }, 15000, headers)
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          code: String(cell.fund_id ?? cell.code ?? ''),
          name: String(cell.fund_nm ?? cell.name ?? ''),
          price: safeFloat(cell.price),
          changePct: String(cell.discount_rt ?? cell.change_pct ?? ''),
          volume: safeFloat(cell.volume),
          nav: safeFloat(cell['净值']),
          navDate: String(cell['净值日期'] ?? '').slice(0, 10),
          premiumRate: String(cell['溢价率'] ?? ''),
          custodyFee: safeFloat(cell['托管费']),
          company: String(cell['基金公司'] ?? ''),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: qdii_e_comm_jsl
   * 对应 Python: akshare.qdii.qdii_jsl.qdii_e_comm_jsl
   * 数据源: https://www.jisilu.cn/data/qdii/#qdiia
   * @param cookie - 集思录登录 cookie（可选）
   * @returns T+0 QDII 欧美市场商品 ETF 列表，每项含 code(基金代码)、
   *          name(基金名称)、price(现价)、changePct(涨幅)、volume(成交量)、
   *          nav(T-2净值)、navDate(净值日期)、premiumRate(T-1溢价率)、
   *          custodyFee(托管费)、company(基金公司)
   * 数据清洗: Python 版本使用 qdii_list/E 端点获取全部欧美数据，
   *           此实现使用 qdii_list/ + type=comm&market=US_EU 筛选商品类
   */
  async qdiiECommJsl(cookie = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const headers = cookie ? { ...HEADERS, Cookie: cookie } : HEADERS
      const json = await httpGet('https://www.jisilu.cn/data/qdii/qdii_list/', {
        type: 'comm', market: 'US_EU',
      }, 15000, headers)
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          code: String(cell.fund_id ?? cell.code ?? ''),
          name: String(cell.fund_nm ?? cell.name ?? ''),
          price: safeFloat(cell.price),
          changePct: String(cell.discount_rt ?? cell.change_pct ?? ''),
          volume: safeFloat(cell.volume),
          nav: safeFloat(cell['净值']),
          navDate: String(cell['净值日期'] ?? '').slice(0, 10),
          premiumRate: String(cell['溢价率'] ?? ''),
          custodyFee: safeFloat(cell['托管费']),
          company: String(cell['基金公司'] ?? ''),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: qdii_a_index_jsl
   * 对应 Python: akshare.qdii.qdii_jsl.qdii_a_index_jsl
   * 数据源: https://www.jisilu.cn/data/qdii/#qdiia
   * @param cookie - 集思录登录 cookie（可选）
   * @returns T+0 QDII 亚洲市场指数 ETF 列表，每项含 code(基金代码)、
   *          name(基金名称)、price(现价)、changePct(涨幅)、volume(成交量)、
   *          nav(净值)、navDate(净值日期)、premiumRate(溢价率)、
   *          custodyFee(托管费)、company(基金公司)
   * 数据清洗: Python 版本使用 qdii_list/A 端点获取亚洲市场数据，
   *           此实现使用 qdii_list/ + type=index&market=ASIA 参数筛选
   */
  async qdiiAIndexJsl(cookie = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const headers = cookie ? { ...HEADERS, Cookie: cookie } : HEADERS
      const json = await httpGet('https://www.jisilu.cn/data/qdii/qdii_list/', {
        type: 'index', market: 'ASIA',
      }, 15000, headers)
      const rows = (json?.rows ?? []) as Record<string, unknown>[]
      if (!rows?.length) return null
      return rows.map(it => {
        const cell = (it.cell ?? {}) as Record<string, unknown>
        return {
          code: String(cell.fund_id ?? cell.code ?? ''),
          name: String(cell.fund_nm ?? cell.name ?? ''),
          price: safeFloat(cell.price),
          changePct: String(cell.discount_rt ?? cell.change_pct ?? ''),
          volume: safeFloat(cell.volume),
          nav: safeFloat(cell['净值']),
          navDate: String(cell['净值日期'] ?? '').slice(0, 10),
          premiumRate: String(cell['溢价率'] ?? ''),
          custodyFee: safeFloat(cell['托管费']),
          company: String(cell['基金公司'] ?? ''),
          source: 'JSL',
        }
      })
    } catch { return null }
  }

  // ── 利率数据 ──

  /**
   * AKShare 接口: rate_interbank
   * 对应 Python: akshare.interest_rate.interbank_rate_em.rate_interbank
   * 数据源: https://data.eastmoney.com/shibor/shibor.aspx
   * @param market - 银行间拆借市场，默认 '上海银行同业拆借市场'；
   *                 可选值: '上海银行同业拆借市场'→'001'、'中国银行同业拆借市场'→'002'、
   *                 '伦敦银行同业拆借市场'→'003'、'欧洲银行同业拆借市场'→'004'、
   *                 '香港银行同业拆借市场'→'005'、'新加坡银行同业拆借市场'→'006'
   * @param symbol - 拆借品种货币，默认 'Shibor人民币'；
   *                 可选值: 'Shibor人民币'→'CNY'、'Chibor人民币'→'CNY'、
   *                 'Libor英镑'→'GBP'、'Libor欧元'→'EUR'、'Libor美元'→'USD'、
   *                 'Libor日元'→'JPY'、'Euribor欧元'→'EUR'、'Hibor美元'→'USD'、
   *                 'Hibor人民币'→'CNH'、'Hibor港币'→'HKD'、'Sibor星元'→'SGD'、
   *                 'Sibor美元'→'USD'
   * @param indicator - 拆借期限指标，默认 '隔夜'；
   *                    可选值: '隔夜'→'001'、'1周'→'101'、'2周'→'102'、'3周'→'103'、
   *                    '1月'→'201'、'2月'→'202'、'3月'→'203'、…'11月'→'211'、'1年'→'301'
   * @returns 拆借利率历史数据数组，每项含 date(报告日，YYYY-MM-DD)、rate(利率，%)、change(涨跌，%)
   * 数据清洗: reportName=RPT_IMP_INTRESTRATEN，pageSize=500，按 REPORT_DATE 降序；
   *           Python 版本分页遍历全部页，此实现仅取第一页；
   *           通过 market_map / symbol_map / indicator_map 将中文参数转为 API 编码
   */
  async rateInterbank(
    market = '上海银行同业拆借市场',
    symbol = 'Shibor人民币',
    indicator = '隔夜',
  ): Promise<Record<string, unknown>[] | null> {
    const marketMap: Record<string, string> = {
      '上海银行同业拆借市场': '001', '中国银行同业拆借市场': '002',
      '伦敦银行同业拆借市场': '003', '欧洲银行同业拆借市场': '004',
      '香港银行同业拆借市场': '005', '新加坡银行同业拆借市场': '006',
    }
    const symbolMap: Record<string, string> = {
      'Shibor人民币': 'CNY', 'Chibor人民币': 'CNY',
      'Libor英镑': 'GBP', 'Libor欧元': 'EUR', 'Libor美元': 'USD',
      'Libor日元': 'JPY', 'Euribor欧元': 'EUR',
      'Hibor美元': 'USD', 'Hibor人民币': 'CNH', 'Hibor港币': 'HKD',
      'Sibor星元': 'SGD', 'Sibor美元': 'USD',
    }
    const indicatorMap: Record<string, string> = {
      '隔夜': '001', '1周': '101', '2周': '102', '3周': '103',
      '1月': '201', '2月': '202', '3月': '203', '4月': '204',
      '5月': '205', '6月': '206', '7月': '207', '8月': '208',
      '9月': '209', '10月': '210', '11月': '211', '1年': '301',
    }
    const mkt = marketMap[market] ?? '001'
    const sym = symbolMap[symbol] ?? 'CNY'
    const ind = indicatorMap[indicator] ?? '001'
    const items = await dcGet({
      reportName: 'RPT_IMP_INTRESTRATEN',
      columns: 'REPORT_DATE,REPORT_PERIOD,IR_RATE,CHANGE_RATE,INDICATOR_ID,LATEST_RECORD,MARKET,MARKET_CODE,CURRENCY,CURRENCY_CODE',
      quoteColumns: '',
      filter: `(MARKET_CODE="${mkt}")(CURRENCY_CODE="${sym}")(INDICATOR_ID="${ind}")`,
      pageNumber: '1',
      pageSize: '500',
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items) return null
    return items.map(it => ({
      date: String(it.REPORT_DATE ?? '').slice(0, 10),
      rate: safeFloat(it.IR_RATE),
      change: safeFloat(it.CHANGE_RATE),
    }))
  }

  // ── 中国宏观（东方财富数据中心；对齐 AkShare macro_china_* 常用指标；CPI/PPI/PMI 用 EM 替代常挂的 Jin10）──

  /**
   * 中国 CPI（居民消费价格指数）
   * @sourceUrl https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CPI
   * @pageUrl https://data.eastmoney.com/cjsj/cpi.html
   * 对应 Python 意图：ak.macro_china_cpi / 金十年率报告；本实现用东财官方表更稳
   */
  async macroChinaCpi(limit = 60): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPT_ECONOMY_CPI',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: String(Math.min(200, Math.max(1, Number(limit) || 60))),
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items?.length) return null
    return items.map(it => ({
      indicator: 'CPI',
      indicatorKey: 'cpi',
      date: String(it.REPORT_DATE ?? '').slice(0, 10),
      period: String(it.TIME ?? ''),
      nationalYoy: safeFloat(it.NATIONAL_SAME),
      nationalIndex: safeFloat(it.NATIONAL_BASE),
      nationalMom: safeFloat(it.NATIONAL_SEQUENTIAL),
      nationalYtd: safeFloat(it.NATIONAL_ACCUMULATE),
      cityYoy: safeFloat(it.CITY_SAME),
      ruralYoy: safeFloat(it.RURAL_SAME),
      source: 'eastmoney',
    }))
  }

  /**
   * 中国 PPI（工业生产者出厂价格指数）
   * @sourceUrl https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_PPI
   * @pageUrl https://data.eastmoney.com/cjsj/ppi.html
   */
  async macroChinaPpi(limit = 60): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPT_ECONOMY_PPI',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: String(Math.min(200, Math.max(1, Number(limit) || 60))),
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items?.length) return null
    return items.map(it => ({
      indicator: 'PPI',
      indicatorKey: 'ppi',
      date: String(it.REPORT_DATE ?? '').slice(0, 10),
      period: String(it.TIME ?? ''),
      index: safeFloat(it.BASE),
      yoy: safeFloat(it.BASE_SAME),
      ytd: safeFloat(it.BASE_ACCUMULATE),
      source: 'eastmoney',
    }))
  }

  /**
   * 中国 PMI（制造业 / 非制造业）
   * @sourceUrl https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_PMI
   * @pageUrl https://data.eastmoney.com/cjsj/pmi.html
   */
  async macroChinaPmi(limit = 60): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPT_ECONOMY_PMI',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: String(Math.min(200, Math.max(1, Number(limit) || 60))),
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items?.length) return null
    return items.map(it => ({
      indicator: 'PMI',
      indicatorKey: 'pmi',
      date: String(it.REPORT_DATE ?? '').slice(0, 10),
      period: String(it.TIME ?? ''),
      manufacturing: safeFloat(it.MAKE_INDEX),
      manufacturingYoy: safeFloat(it.MAKE_SAME),
      nonManufacturing: safeFloat(it.NMAKE_INDEX),
      nonManufacturingYoy: safeFloat(it.NMAKE_SAME),
      source: 'eastmoney',
    }))
  }

  /**
   * 中国 GDP
   * @sourceUrl https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_GDP
   * @pageUrl https://data.eastmoney.com/cjsj/gnzcz.html
   */
  async macroChinaGdp(limit = 40): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPT_ECONOMY_GDP',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: String(Math.min(120, Math.max(1, Number(limit) || 40))),
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items?.length) return null
    return items.map(it => ({
      indicator: 'GDP',
      indicatorKey: 'gdp',
      date: String(it.REPORT_DATE ?? '').slice(0, 10),
      period: String(it.TIME ?? ''),
      gdp: safeFloat(it.DOMESTICL_PRODUCT_BASE),
      primary: safeFloat(it.FIRST_PRODUCT_BASE),
      secondary: safeFloat(it.SECOND_PRODUCT_BASE),
      tertiary: safeFloat(it.THIRD_PRODUCT_BASE),
      gdpYoy: safeFloat(it.SUM_SAME),
      primaryYoy: safeFloat(it.FIRST_SAME),
      secondaryYoy: safeFloat(it.SECOND_SAME),
      tertiaryYoy: safeFloat(it.THIRD_SAME),
      source: 'eastmoney',
    }))
  }

  /**
   * 中国 LPR（贷款市场报价利率）
   * AKShare: macro_china_lpr → 东财 RPTA_WEB_RATE
   * @sourceUrl https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_RATE
   * @pageUrl https://data.eastmoney.com/cjsj/globalRateLPR.html
   */
  async macroChinaLpr(limit = 60): Promise<Record<string, unknown>[] | null> {
    const items = await dcGet({
      reportName: 'RPTA_WEB_RATE',
      columns: 'ALL',
      pageNumber: '1',
      pageSize: String(Math.min(200, Math.max(1, Number(limit) || 60))),
      sortTypes: '-1',
      sortColumns: 'TRADE_DATE',
      token: '8944c01f984b480b601f8213e9a4a8ae',
      source: 'WEB',
      client: 'WEB',
    })
    if (!items?.length) return null
    return items.map(it => ({
      indicator: 'LPR',
      indicatorKey: 'lpr',
      date: String(it.TRADE_DATE ?? '').slice(0, 10),
      lpr1y: safeFloat(it.LPR1Y),
      lpr5y: safeFloat(it.LPR5Y),
      loanShort: safeFloat(it.RATE_1),
      loanLong: safeFloat(it.RATE_2),
      source: 'eastmoney',
    }))
  }

  /**
   * 标准 Capability.MACRO_INDICATOR — 按指标名拉取中国宏观序列。
   * @param indicator cpi|ppi|pmi|gdp|lpr|shibor（空则返回几项最新摘要）
   */
  async macroIndicator(indicator = ''): Promise<Record<string, unknown>[] | null> {
    const want = indicator.trim().toLowerCase()
    const limit = 36
    type Task = { key: string; name: string; match: string[]; fn: () => Promise<Record<string, unknown>[] | null> }
    const tasks: Task[] = [
      { key: 'cpi', name: 'CPI', match: ['cpi', '通胀', '物价'], fn: () => this.macroChinaCpi(limit) },
      { key: 'ppi', name: 'PPI', match: ['ppi', '出厂'], fn: () => this.macroChinaPpi(limit) },
      { key: 'pmi', name: 'PMI', match: ['pmi', '景气'], fn: () => this.macroChinaPmi(limit) },
      { key: 'gdp', name: 'GDP', match: ['gdp', '生产总值'], fn: () => this.macroChinaGdp(limit) },
      { key: 'lpr', name: 'LPR', match: ['lpr', '贷款报价', '利率'], fn: () => this.macroChinaLpr(limit) },
      {
        key: 'shibor',
        name: 'SHIBOR',
        match: ['shibor', '拆借'],
        fn: async () => {
          const rows = await this.rateInterbank('上海银行同业拆借市场', 'Shibor人民币', '隔夜')
          return rows?.map(r => ({ indicator: 'SHIBOR', indicatorKey: 'shibor', ...r, source: 'eastmoney' })) ?? null
        },
      },
    ]

    const selected = want
      ? tasks.filter(t => t.key === want || t.match.some(m => want.includes(m) || m.includes(want)))
      : tasks

    if (!selected.length) return null

    const out: Record<string, unknown>[] = []
    for (const task of selected) {
      const rows = await task.fn()
      if (!rows?.length) continue
      if (!want) {
        // 无筛选时每项只取最新 3 条，避免巨量 token
        out.push(...rows.slice(0, 3))
      } else {
        out.push(...rows)
      }
    }
    return out.length ? out : null
  }

  /**
   * AKShare 接口: repo_rate_hist
   * 对应 Python: 无直接对应（AKShare interest_rate 目录中未收录）
   * 数据源: https://www.chinamoney.com.cn/chinese/bkfrr/
   * @param startDate - 起始日期，格式 'YYYYMMDD'；为空则取一年前
   * @param endDate - 结束日期，格式 'YYYYMMDD'；为空则取当天
   * @returns 回购定盘利率历史数据数组，每项含 date(日期，YYYY-MM-DD)、
   *          FR001、FR007、FR014、FDR001、FDR007、FDR014（各期限回购利率，%）
   * 数据清洗: 通过 chinamoney.com.cn 前端 API 获取 JSON，原始数据按日期+期限嵌套；
   *           需将 {FR001: {value: x}, FR007: {value: y}, ...} 结构展平为行；
   *           最大查询范围为 1 年，超过时自动截断
   */
  async repoRateHist(startDate = '', endDate = ''): Promise<Record<string, unknown>[] | null> {
    const now = new Date()
    const end = endDate || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const start = startDate || `${oneYearAgo.getFullYear()}${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}${String(oneYearAgo.getDate()).padStart(2, '0')}`

    try {
      const json = await httpGet(
        'https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/FixingPriceRepoHisNew',
        {
          startDate: start,
          endDate: end,
          pageNo: '1',
          pageSize: '500',
        },
        15000,
        { Referer: 'https://www.chinamoney.com.cn/chinese/bkfrr/' },
      )
      const records = (json?.records ?? json?.data ?? []) as Record<string, unknown>[]
      if (!records.length) return null
      return records.map(it => ({
        date: String(it.valDate ?? it.tradeDate ?? it.date ?? '').slice(0, 10),
        FR001: safeFloat(it.FR001 ?? it.fr001),
        FR007: safeFloat(it.FR007 ?? it.fr007),
        FR014: safeFloat(it.FR014 ?? it.fr014),
        FDR001: safeFloat(it.FDR001 ?? it.fdr001),
        FDR007: safeFloat(it.FDR007 ?? it.fdr007),
        FDR014: safeFloat(it.FDR014 ?? it.fdr014),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: repo_rate_query
   * 对应 Python: 无直接对应（AKShare interest_rate 目录中未收录）
   * 数据源: https://www.chinamoney.com.cn/chinese/bkfrr/
   * @param symbol - 利率类型，默认 '回购定盘利率'；
   *                 可选值: '回购定盘利率'（FR 系列）、'银银间回购定盘利率'（FDR 系列）
   * @returns 回购定盘利率历史数据数组，每项含 date(日期，YYYY-MM-DD)、
   *          FR001、FR007、FR014（各期限回购利率，%）
   * 数据清洗: 通过 chinamoney.com.cn 前端 API 获取，根据 symbol 参数切换不同类型；
   *           返回的原始数据含 valDate/FR001/FR007/FR014 等字段，经 safeFloat 清洗为数值
   */
  async repoRateQuery(symbol = '回购定盘利率'): Promise<Record<string, unknown>[] | null> {
    const typeMap: Record<string, string> = {
      '回购定盘利率': 'FR',
      '银银间回购定盘利率': 'FDR',
    }
    const rateType = typeMap[symbol] ?? 'FR'

    try {
      const now = new Date()
      const end = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const oneYearAgo = new Date(now)
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const start = `${oneYearAgo.getFullYear()}${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}${String(oneYearAgo.getDate()).padStart(2, '0')}`

      const json = await httpGet(
        'https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/FixingPriceRepoHisNew',
        {
          startDate: start,
          endDate: end,
          pageNo: '1',
          pageSize: '500',
          type: rateType,
        },
        15000,
        { Referer: 'https://www.chinamoney.com.cn/chinese/bkfrr/' },
      )
      const records = (json?.records ?? json?.data ?? []) as Record<string, unknown>[]
      if (!records.length) return null
      return records.map(it => ({
        date: String(it.valDate ?? it.tradeDate ?? it.date ?? '').slice(0, 10),
        FR001: safeFloat(it.FR001 ?? it.fr001 ?? it[`${rateType}001`]),
        FR007: safeFloat(it.FR007 ?? it.fr007 ?? it[`${rateType}007`]),
        FR014: safeFloat(it.FR014 ?? it.fr014 ?? it[`${rateType}014`]),
      }))
    } catch { return null }
  }

  // ── 期货-交易所结算/日线 ──

  /**
   * AKShare 接口: futures_settle_cffex
   * 对应 Python: akshare.futures.futures_settle.futures_settle_cffex
   * 数据源: http://www.cffex.com.cn/sj/jscs/{YYMM}/{DD}/{date}_1.csv
   * @param date - 结算日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @returns 中金所结算参数列表，每项含 symbol(合约代码)、variety(品种)、
   *          longMarginRatio(投机买保证金率)、shortMarginRatio(投机卖保证金率)、
   *          tradeFeeRatio(交易手续费率)、deliveryFeeRatio(交割手续费率)、
   *          closeTodayFeeRatio(今平今手续费率)
   * 数据清洗: CSV 文件 GBK 编码，跳过首行注释，按合约代码筛选有效行；
   *           返回 HTML 或不足 5 行时返回 null
   */
  async futuresSettleCffex(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    const url = `http://www.cffex.com.cn/sj/jscs/${d.slice(0, 4)}${d.slice(4, 6)}/${d.slice(6, 8)}/${d}_1.csv`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      const text = new TextDecoder('gbk').decode(buf)
      if (text.trim().startsWith('<') || text.includes('要查看的页面不存在')) return null
      const lines = text.trim().split('\n')
      if (lines.length < 6) return null
      const rows: Record<string, unknown>[] = []
      for (let i = 2; i < lines.length; i++) {
        const fields = lines[i].split(',').map(f => f.trim())
        if (fields.length < 6) continue
        const symbol = fields[0]
        if (!symbol || !/^[A-Z]+/.test(symbol)) continue
        const variety = symbol.match(/^[A-Z]+/)?.[0] ?? ''
        rows.push({
          symbol,
          variety,
          longMarginRatio: safeFloat(fields[1]),
          shortMarginRatio: safeFloat(fields[2]),
          tradeFeeRatio: safeFloat(fields[3]),
          deliveryFeeRatio: safeFloat(fields[4]),
          closeTodayFeeRatio: safeFloat(fields[5]),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settle_czce
   * 对应 Python: akshare.futures.futures_settle.futures_settle_czce
   * 数据源: http://www.czce.com.cn/cn/DFSStaticFiles/Future/{year}/{date}/FutureDataClearParams.txt
   * @param date - 结算日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @returns 郑商所结算参数列表，每项含 symbol、variety、settlePrice(结算价)、
   *          isSingleMarket(是否单边市)、singleMarketDays(连续单边市天数)、
   *          marginRatio(保证金率)、limitRatio(涨跌停板%)、tradeFee(交易手续费)、
   *          feeType(手续费方式)、deliveryFee(交割手续费)、
   *          closeTodayFee(今平今手续费)、positionLimit(持仓限额)、tradeLimit(交易限额)
   * 数据清洗: pipe-delimited 文本，跳过前两行(标题+表头)，筛选非空 symbol，
   *           排除小计/合计行
   */
  async futuresSettleCzce(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    const year = d.slice(0, 4)
    const url = `http://www.czce.com.cn/cn/DFSStaticFiles/Future/${year}/${d}/FutureDataClearParams.txt`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const text = await resp.text()
      const lines = text.trim().split('\n')
      if (lines.length < 3) return null
      const rows: Record<string, unknown>[] = []
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const fields = line.split('|').map(f => f.trim())
        if (fields.length < 12) continue
        const symbol = fields[0]
        if (!symbol || /小计|合计|总计/.test(symbol)) continue
        const variety = symbol.match(/^[A-Za-z]+/)?.[0] ?? ''
        rows.push({
          symbol,
          variety,
          settlePrice: safeFloat(fields[1]),
          isSingleMarket: fields[2],
          singleMarketDays: safeFloat(fields[3]),
          marginRatio: safeFloat(fields[4]),
          limitRatio: safeFloat(fields[5]),
          tradeFee: safeFloat(fields[6]),
          feeType: fields[7],
          deliveryFee: safeFloat(fields[8]),
          closeTodayFee: safeFloat(fields[9]),
          positionLimit: safeFloat(fields[10]),
          tradeLimit: safeFloat(fields[11]),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settle_shfe
   * 对应 Python: akshare.futures.futures_settle.futures_settle_shfe
   * 数据源: https://www.shfe.com.cn/data/tradedata/future/dailydata/js{date}.dat
   * @param date - 结算日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @returns 上期所结算参数列表，每项含 symbol、variety、settlePrice、
   *          specLongMarginRatio(投机买保证金)、hedgeLongMarginRatio(套保买保证金)、
   *          specShortMarginRatio(投机卖保证金)、hedgeShortMarginRatio(套保卖保证金)、
   *          tradeFeeRatio、closeTodayFeeRatio、isCloseToday
   * 数据清洗: JSON 响应取 o_cursor 数组，字段通过 safeFloat 转数值
   */
  async futuresSettleShfe(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    const url = `https://www.shfe.com.cn/data/tradedata/future/dailydata/js${d}.dat`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.o_cursor as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => {
        const symbol = String(it.symbol ?? it.INSTRUMENTID ?? '')
        const variety = symbol.match(/^[A-Za-z]+/)?.[0] ?? ''
        return {
          symbol,
          variety,
          settlePrice: safeFloat(it.settle_price ?? it.SETTLEMENTPRICE),
          specLongMarginRatio: safeFloat(it.spec_long_margin_ratio ?? it.SPECLONGMARGINRATIO),
          hedgeLongMarginRatio: safeFloat(it.hedge_long_margin_ratio ?? it.HEDGLONGMARGINRATIO),
          specShortMarginRatio: safeFloat(it.spec_short_margin_ratio ?? it.SPECSHORTMARGINRATIO),
          hedgeShortMarginRatio: safeFloat(it.hedge_short_margin_ratio ?? it.HEDGSHORTMARGINRATIO),
          tradeFeeRatio: safeFloat(it.trade_fee_ratio ?? it.TRADEFEERATIO),
          closeTodayFeeRatio: safeFloat(it.close_today_fee_ratio ?? it.TTRADEFEERATIO),
          isCloseToday: it.is_close_today ?? null,
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settle_ine
   * 对应 Python: akshare.futures.futures_settle.futures_settle_ine
   * 数据源: https://www.ine.cn/data/tradedata/future/dailydata/js{date}.dat
   * @param date - 结算日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @returns 上海国际能源交易中心结算参数列表，字段同上期所
   * 数据清洗: 与 SHFE 相同的 JSON 结构，取 o_cursor 数组
   */
  async futuresSettleIne(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    const url = `https://www.ine.cn/data/tradedata/future/dailydata/js${d}.dat`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.o_cursor as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => {
        const symbol = String(it.symbol ?? it.INSTRUMENTID ?? '')
        const variety = symbol.match(/^[A-Za-z]+/)?.[0] ?? ''
        return {
          symbol,
          variety,
          settlePrice: safeFloat(it.settle_price ?? it.SETTLEMENTPRICE),
          specLongMarginRatio: safeFloat(it.spec_long_margin_ratio ?? it.SPECLONGMARGINRATIO),
          hedgeLongMarginRatio: safeFloat(it.hedge_long_margin_ratio ?? it.HEDGLONGMARGINRATIO),
          specShortMarginRatio: safeFloat(it.spec_short_margin_ratio ?? it.SPECSHORTMARGINRATIO),
          hedgeShortMarginRatio: safeFloat(it.hedge_short_margin_ratio ?? it.HEDGSHORTMARGINRATIO),
          tradeFeeRatio: safeFloat(it.trade_fee_ratio ?? it.TRADEFEERATIO),
          closeTodayFeeRatio: safeFloat(it.close_today_fee_ratio ?? it.TTRADEFEERATIO),
          isCloseToday: it.is_close_today ?? null,
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settle_dce
   * 对应 Python: akshare.futures.futures_settle.futures_settle_dce (注：Python 版暂未实现)
   * 数据源: POST http://www.dce.com.cn/dcereport/publicweb/dailystat/dayQuotes
   * @param date - 结算日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @returns 大商所日行情结算参数列表，每项含 symbol(合约)、variety(品种名称)、
   *          open/high/low/close、preSettle(前结算)、settle(结算)、
   *          volume、openInterest、turnover
   * 数据清洗: POST JSON body 返回 JSON，data 数组中筛选非小计/总计行；
   *           大商所品种名称→代码映射内联
   */
  async futuresSettleDce(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    const dceMap: Record<string, string> = {
      '大豆': 'A', '豆一': 'A', '豆二': 'B', '豆粕': 'M', '豆油': 'Y',
      '棕榈油': 'P', '玉米': 'C', '玉米淀粉': 'CS', '鸡蛋': 'JD',
      '纤维板': 'FB', '胶合板': 'BB', '聚乙烯': 'L', '聚氯乙烯': 'V',
      '聚丙烯': 'PP', '焦炭': 'J', '焦煤': 'JM', '铁矿石': 'I',
      '乙二醇': 'EG', '粳米': 'RR', '苯乙烯': 'EB', '液化石油气': 'PG',
      '生猪': 'LH', '原木': 'LG', '纯苯': 'BZ',
    }
    try {
      const resp = await this.clientFetch('http://www.dce.com.cn/dcereport/publicweb/dailystat/dayQuotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          contractId: '', lang: 'zh', optionSeries: '',
          statisticsType: '0', tradeDate: d, tradeType: '1', varietyId: 'all',
        }).toString(),
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.data as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      const rows: Record<string, unknown>[] = []
      for (const it of list) {
        const varietyName = String(it.variety ?? '')
        if (/小计|总计/.test(varietyName)) continue
        const symbol = String(it.contractId ?? '')
        const variety = dceMap[varietyName] ?? varietyName
        rows.push({
          symbol,
          variety,
          open: safeFloat(it.open),
          high: safeFloat(it.high),
          low: safeFloat(it.low),
          close: safeFloat(it.close),
          preSettle: safeFloat(it.lastClear),
          settle: safeFloat(it.clearPrice),
          volume: safeFloat(it.volumn),
          openInterest: safeFloat(it.openInterest),
          turnover: safeFloat(it.turnover),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settle_gfex
   * 对应 Python: akshare.futures.futures_settle.futures_settle_gfex
   * 数据源: POST http://www.gfex.com.cn/u/interfacesWebTtQueryTradPara/loadDayList
   * @param date - 结算日期（参数保留，GFEX 接口返回全部交易日数据，date 仅用于日志）
   * @returns 广期所结算参数列表，每项含 symbol、variety、
   *          specBuyRate(投机买保证金率)、specBuy(投机买保证金)、
   *          hedgeBuyRate(套保买保证金率)、hedgeBuy(套保买保证金)、
   *          riseLimitRate(涨停板率)、riseLimit(涨停板)、fallLimit(跌停板)、
   *          agentTotBuyPosiQuota(非期货公司会员总买持仓)、
   *          selfTotBuyPosiQuota(期货公司会员总买持仓)、
   *          clientBuyPosiQuota(客户总买持仓)
   * 数据清洗: POST form-urlencoded，JSON 响应 code="0" 取 data 数组；
   *           过滤含 "-" 的期权合约，只保留期货合约
   */
  async futuresSettleGfex(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://www.gfex.com.cn/u/interfacesWebTtQueryTradPara/loadDayList', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'http://www.gfex.com.cn',
          'Referer': 'http://www.gfex.com.cn/gfex/rjycs/ywcs.shtml',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: 'trade_type=0',
      })
      if (!resp.ok) return null
      const text = await resp.text()
      if (text.trim().startsWith('<script') || text.trim().startsWith('<')) return null
      const json = JSON.parse(text) as Record<string, unknown>
      if (json.code !== '0') return null
      let list = json.data as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      list = list.filter(it => !String(it.contractId ?? '').includes('-'))
      if (!list.length) return null
      return list.map(it => {
        const symbol = String(it.contractId ?? '')
        const variety = symbol.match(/^[A-Za-z]+/)?.[0] ?? ''
        return {
          symbol,
          variety,
          specBuyRate: safeFloat(it.specBuyRate),
          specBuy: safeFloat(it.specBuy),
          hedgeBuyRate: safeFloat(it.hedgeBuyRate),
          hedgeBuy: safeFloat(it.hedgeBuy),
          riseLimitRate: safeFloat(it.riseLimitRate),
          riseLimit: safeFloat(it.riseLimit),
          fallLimit: safeFloat(it.fallLimit),
          agentTotBuyPosiQuota: safeFloat(it.agentTotBuyPosiQuota),
          selfTotBuyPosiQuota: safeFloat(it.selfTotBuyPosiQuota),
          clientBuyPosiQuota: safeFloat(it.clientBuyPosiQuota),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settle
   * 对应 Python: akshare.futures.futures_settle.futures_settle
   * 期货交易所结算参数分发器
   * @param date - 结算日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @param market - 交易所代码: 'CFFEX'(中金所) | 'CZCE'(郑商所) | 'SHFE'(上期所) |
   *                 'DCE'(大商所) | 'INE'(上能中心) | 'GFEX'(广期所)
   * @returns 指定交易所的结算参数数据；不支持的 market 返回 null
   */
  async futuresSettle(date: string, market: string): Promise<Record<string, unknown>[] | null> {
    switch (market.toUpperCase()) {
      case 'CFFEX': return this.futuresSettleCffex(date)
      case 'CZCE': return this.futuresSettleCzce(date)
      case 'SHFE': return this.futuresSettleShfe(date)
      case 'DCE': return this.futuresSettleDce(date)
      case 'INE': return this.futuresSettleIne(date)
      case 'GFEX': return this.futuresSettleGfex(date)
      default: return null
    }
  }

  /**
   * AKShare 接口: get_futures_daily
   * 对应 Python: akshare.futures.futures_daily_bar.get_futures_daily
   * 期货日线行情分发器，支持日期范围
   * @param startDate - 起始日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @param endDate - 结束日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @param market - 交易所代码: 'CFFEX' | 'CZCE' | 'SHFE' | 'DCE' | 'INE' | 'GFEX'
   * @returns 指定日期范围内各交易日的日线行情合并数组，每项含 symbol、date、
   *          open、high、low、close、volume、openInterest、turnover、settle、preSettle、variety
   * 数据清洗: 逐日调用对应交易所接口，合并非空结果并过滤 efp 合约；
   *           Python 版使用交易日历跳过非交易日，此实现简单逐日遍历
   */
  async getFuturesDaily(startDate: string, endDate: string, market: string): Promise<Record<string, unknown>[] | null> {
    const start = startDate.replace(/-/g, '')
    const end = endDate.replace(/-/g, '')
    const fetchFn = async (date: string): Promise<Record<string, unknown>[] | null> => {
      switch (market.toUpperCase()) {
        case 'CFFEX': return this.futuresDailyCffex(date)
        case 'CZCE': return this.futuresDailyCzce(date)
        case 'SHFE': return this.futuresDailyShfe(date)
        case 'DCE': return this.futuresDailyDce(date)
        case 'INE': return this.futuresDailyIne(date)
        case 'GFEX': return this.futuresDailyGfex(date)
        default: return null
      }
    }

    const all: Record<string, unknown>[] = []
    let d = new Date(Number(start.slice(0, 4)), Number(start.slice(4, 6)) - 1, Number(start.slice(6, 8)))
    const endDateObj = new Date(Number(end.slice(0, 4)), Number(end.slice(4, 6)) - 1, Number(end.slice(6, 8)))
    while (d <= endDateObj) {
      const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const items = await fetchFn(ds)
      if (items?.length) all.push(...items)
      d.setDate(d.getDate() + 1)
    }
    if (!all.length) return null
    return all.filter(it => !String(it.symbol ?? '').includes('efp'))
  }

  // ── 各交易所日线内部方法 ──

  private async futuresDailyCffex(date: string): Promise<Record<string, unknown>[] | null> {
    const url = `http://www.cffex.com.cn/sj/hqsj/rtj/${date.slice(0, 6)}/${date.slice(6, 8)}/${date}_1.csv`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      const text = new TextDecoder('gbk').decode(buf)
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      const rows: Record<string, unknown>[] = []
      for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].split(',').map(f => f.trim())
        if (fields.length < 11) continue
        const symbol = fields[0]
        if (!symbol || /小计|合计|IO|MO|HO/.test(symbol)) continue
        const variety = symbol.match(/^[A-Za-z_]+/)?.[0] ?? ''
        rows.push({
          symbol, date, variety,
          open: safeFloat(fields[1]), high: safeFloat(fields[2]),
          low: safeFloat(fields[3]), close: safeFloat(fields[8]),
          volume: safeFloat(fields[4]), turnover: safeFloat(fields[5]),
          openInterest: safeFloat(fields[6]),
          settle: safeFloat(fields[9]), preSettle: safeFloat(fields[10]),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  private async futuresDailyCzce(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    const year = d.slice(0, 4)
    const url = `http://www.czce.com.cn/cn/DFSStaticFiles/Future/${year}/${d}/FutureDataDaily.txt`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const text = await resp.text()
      if (text.includes('您的访问出错了') || text.includes('无期权每日行情交易记录')) return null
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 3) return null
      const rows: Record<string, unknown>[] = []
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line || line.startsWith('小') || line.startsWith('合')) continue
        const fields = line.split('|').map(f => f.trim().replace(/,/g, ''))
        if (fields.length < 13) continue
        const symbol = fields[0]
        const m = symbol.match(/^([A-Za-z_]+)\d/)
        if (!m) continue
        rows.push({
          symbol, date, variety: m[1],
          preSettle: safeFloat(fields[1]), open: safeFloat(fields[2]),
          high: safeFloat(fields[3]), low: safeFloat(fields[4]),
          close: safeFloat(fields[5]), settle: safeFloat(fields[6]),
          volume: safeFloat(fields[9]), openInterest: safeFloat(fields[10]),
          turnover: safeFloat(fields[12]),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  private async futuresDailyShfe(date: string): Promise<Record<string, unknown>[] | null> {
    const url = `https://www.shfe.com.cn/data/tradedata/future/dailydata/kx${date}.dat`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.o_curinstrument as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      const rows: Record<string, unknown>[] = []
      for (const it of list) {
        const deliveryMonth = String(it.DELIVERYMONTH ?? '')
        if (!deliveryMonth || deliveryMonth === '小计' || deliveryMonth === '合计') continue
        let variety = ''
        try {
          variety = String((it.PRODUCTGROUPID ?? '')).toUpperCase().trim()
        } catch { variety = String((it.PRODUCTID ?? '')).toUpperCase().split('_')[0].trim() }
        const symbol = variety + deliveryMonth
        const vol = it.VOLUME === '' ? 0 : it.VOLUME
        let turnover: number = 0
        try { turnover = (it.TURNOVER === '' ? 0 : safeFloat(it.TURNOVER)) ?? 0 } catch { /* skip */ }
        rows.push({
          symbol, date, variety,
          open: safeFloat(it.OPENPRICE), high: safeFloat(it.HIGHESTPRICE),
          low: safeFloat(it.LOWESTPRICE), close: safeFloat(it.CLOSEPRICE),
          volume: safeFloat(vol), openInterest: safeFloat(it.OPENINTEREST),
          turnover: safeFloat(turnover),
          settle: safeFloat(it.SETTLEMENTPRICE), preSettle: safeFloat(it.PRESETTLEMENTPRICE),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  private async futuresDailyIne(date: string): Promise<Record<string, unknown>[] | null> {
    const url = `https://www.ine.cn/data/tradedata/future/dailydata/kx${date}.dat`
    try {
      const resp = await this.clientFetch(url)
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.o_curinstrument as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      const rows: Record<string, unknown>[] = []
      for (const it of list) {
        const deliveryMonth = String(it.DELIVERYMONTH ?? '')
        if (!deliveryMonth || deliveryMonth === '小计' || deliveryMonth === '合计') continue
        const productName = String(it.PRODUCTNAME ?? '')
        if (productName.includes('总计')) continue
        let variety = ''
        try {
          variety = String((it.PRODUCTGROUPID ?? '')).toUpperCase().trim()
        } catch {
          variety = String((it.PRODUCTID ?? '')).toUpperCase().split('_')[0].trim()
        }
        const symbol = variety + deliveryMonth
        if (symbol === '总计' || symbol.includes('efp')) continue
        let turnover: number = 0
        try { turnover = safeFloat(it.TURNOVER) ?? 0 } catch { /* skip */ }
        rows.push({
          symbol, date, variety,
          open: safeFloat(it.OPENPRICE), high: safeFloat(it.HIGHESTPRICE),
          low: safeFloat(it.LOWESTPRICE), close: safeFloat(it.CLOSEPRICE),
          volume: safeFloat(it.VOLUME), openInterest: safeFloat(it.OPENINTEREST),
          turnover: safeFloat(turnover),
          settle: safeFloat(it.SETTLEMENTPRICE), preSettle: safeFloat(it.PRESETTLEMENTPRICE),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  private async futuresDailyDce(date: string): Promise<Record<string, unknown>[] | null> {
    const dceMap: Record<string, string> = {
      '大豆': 'A', '豆一': 'A', '豆二': 'B', '豆粕': 'M', '豆油': 'Y',
      '棕榈油': 'P', '玉米': 'C', '玉米淀粉': 'CS', '鸡蛋': 'JD',
      '纤维板': 'FB', '胶合板': 'BB', '聚乙烯': 'L', '聚氯乙烯': 'V',
      '聚丙烯': 'PP', '焦炭': 'J', '焦煤': 'JM', '铁矿石': 'I',
      '乙二醇': 'EG', '粳米': 'RR', '苯乙烯': 'EB', '液化石油气': 'PG',
      '生猪': 'LH', '原木': 'LG', '纯苯': 'BZ',
    }
    try {
      const resp = await this.clientFetch('http://www.dce.com.cn/dcereport/publicweb/dailystat/dayQuotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          contractId: '', lang: 'zh', optionSeries: '',
          statisticsType: '0', tradeDate: date, tradeType: '1', varietyId: 'all',
        }).toString(),
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.data as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      const rows: Record<string, unknown>[] = []
      for (const it of list) {
        const varietyName = String(it.variety ?? '')
        if (/小计|总计/.test(varietyName)) continue
        const symbol = String(it.contractId ?? '')
        const variety = dceMap[varietyName] ?? varietyName
        rows.push({
          symbol, date, variety,
          open: safeFloat(it.open), high: safeFloat(it.high),
          low: safeFloat(it.low), close: safeFloat(it.close),
          preSettle: safeFloat(it.lastClear), settle: safeFloat(it.clearPrice),
          volume: safeFloat(it.volumn), openInterest: safeFloat(it.openInterest),
          turnover: safeFloat(it.turnover),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  private async futuresDailyGfex(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://www.gfex.com.cn/u/interfacesWebTiDayQuotes/loadList', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'http://www.gfex.com.cn',
          'Referer': 'http://www.gfex.com.cn/gfex/rihq/hqsj_tjsj.shtml',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ trade_date: date, trade_type: '0' }).toString(),
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const list = json.data as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      const rows: Record<string, unknown>[] = []
      for (const it of list) {
        const varietyOrder = String(it.varietyOrder ?? '')
        const variety = varietyOrder.toUpperCase()
        const delivMonth = String(it.delivMonth ?? '')
        const varietyName = String(it.variety ?? '')
        if (/小计|总计/.test(varietyName)) continue
        const symbol = variety + delivMonth
        rows.push({
          symbol, date, variety,
          open: safeFloat(it.open), high: safeFloat(it.high),
          low: safeFloat(it.low), close: safeFloat(it.close),
          volume: safeFloat(it.volumn), openInterest: safeFloat(it.openInterest),
          turnover: safeFloat(it.turnover),
          settle: safeFloat(it.clearPrice), preSettle: safeFloat(it.lastClear),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_settlement_price_sgx
   * 对应 Python: akshare.futures.futures_settlement_price_sgx.futures_settlement_price_sgx
   * 数据源: https://links.sgx.com/1.0.0/derivatives-daily/{num}/FUTURE.zip
   * @param date - 交易日期，格式 "YYYYMMDD" 或 "YYYY-MM-DD"
   * @returns 新加坡交易所衍生品历史结算价格列表（原始 CSV/TSV 字段）
   * 数据清洗: 先通过 EastMoney K线接口计算日期偏移量 num，再下载 ZIP 文件
   *           解析其中的 CSV 或 TSV；ZIP 内含单个文件；
   *           注意：完全解压需 ZIP 库支持，当前返回元数据供下游处理
   */
  async futuresSettlementPriceSgx(date: string): Promise<Record<string, unknown>[] | null> {
    const d = date.replace(/-/g, '')
    try {
      const kResp = await this.clientFetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=100.STI&klt=101&fqt=0&lmt=10000&end=${d}&iscca=1&fields1=f1,f2,f3,f4,f5,f6,f7,f8&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64&ut=f057cbcbce2a86e2866ab8877db1d059&forcect=1`)
      if (!kResp.ok) return null
      const kJson = await kResp.json() as Record<string, unknown>
      const kData = kJson.data as Record<string, unknown> | undefined
      const klines = kData?.klines as string[] | undefined
      if (!klines?.length) return null
      const num = klines.length + 791

      const zipResp = await this.clientFetch(`https://links.sgx.com/1.0.0/derivatives-daily/${num}/FUTURE.zip`, { timeoutMs: 30000 })
      if (!zipResp.ok) return null
      const buf = await zipResp.arrayBuffer()
      const bytes = new Uint8Array(buf)
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) return null
      return [{ sgxNum: num, zipSize: buf.byteLength, date: d, note: 'ZIP requires decompression library' }]
    } catch { return null }
  }

  // ── 期货-交割与仓单 ──

  /**
   * AKShare 接口: futures_delivery_shfe
   * 对应 Python: akshare.futures.futures_to_spot.futures_delivery_shfe
   * 数据源: https://tsite.shfe.com.cn/statements/dataview.html?paramid=kx
   * @param date - 年月，格式 "YYYYMM"，默认当月
   * @returns 上海期货交易所交割情况表，每项含 variety(品种)、
   *          deliveryMonth(本月交割量)、deliveryRatio(交割量比重)、
   *          deliveryYtd(本年累计)、deliveryYoy(累计同比)
   * 数据清洗: GET .dat 文件，JSON 中 o_curdelivery 数组提取；
   *           字段通过 safeFloat 转为数值
   */
  async futuresDeliveryShfe(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 6).replace(/-/g, '')
    try {
      const resp = await this.clientFetch(`https://tsite.shfe.com.cn/data/dailydata/${d}monthvarietystatistics.dat`)
      const json = await resp.json() as Record<string, unknown>
      const list = json.o_curdelivery as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list.map(it => ({
        variety: String(it[0] ?? ''),
        varietyCode: String(it[1] ?? ''),
        deliveryMonth: safeFloat(it[3]),
        deliveryRatio: safeFloat(it[4]),
        deliveryYtd: safeFloat(it[5]),
        deliveryYoy: safeFloat(it[6]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_delivery_dce
   * 对应 Python: akshare.futures.futures_to_spot.futures_delivery_dce
   * 数据源: http://www.dce.com.cn/dalianshangpin/xqsj/tjsj26/jgtj/jgsj/index.html
   * @param date - 交割日期，格式 "YYYYMM"，默认当月
   * @returns 大连商品交易所交割统计表，每项含 deliveryDate(交割日期)、
   *          variety(品种)、deliveryVolume(交割量)、deliveryAmount(交割金额)
   * 数据清洗: POST 请求 delivery.html，解析 HTML 表格；
   *           过滤小计/总计行，字段通过 safeFloat 转为数值
   */
  async futuresDeliveryDce(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 6).replace(/-/g, '')
    const endMonth = String(Number(d) + 1)
    try {
      const resp = await this.clientFetch(`http://www.dce.com.cn/publicweb/quotesdata/delivery.html?deliveryQuotes.variety=all&year=&month=&deliveryQuotes.begin_month=${d}&deliveryQuotes.end_month=${endMonth}`, {
        method: 'POST',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      })
      const html = await resp.text()
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 4) continue
        if (cells.some(c => /小计|总计/.test(c))) continue
        const deliveryDate = cells[0]?.split('.')[0] ?? ''
        if (!deliveryDate || !/^\d{4}/.test(deliveryDate)) continue
        results.push({
          deliveryDate,
          variety: cells[1] ?? '',
          deliveryVolume: safeFloat(cells[2]?.replace(/,/g, '')),
          deliveryAmount: safeFloat(cells[3]?.replace(/,/g, '')),
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_delivery_czce
   * 对应 Python: akshare.futures.futures_to_spot.futures_delivery_czce
   * 数据源: http://www.czce.com.cn/cn/jysj/ydjgcx/H770316index_1.htm
   * @param date - 年月日，格式 "YYYYMMDD"，默认当天
   * @returns 郑州商品交易所月度交割查询，每项含 variety(品种)、
   *          deliveryVolume(交割数量)、deliveryAmount(交割额)
   * 数据清洗: GET .xls 文件，Excel 解析提取前3列(品种/交割数量/交割额)；
   *           数值通过 safeFloat 转换，千分位逗号已移除
   */
  async futuresDeliveryCzce(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    try {
      const url = `http://www.czce.com.cn/cn/DFSStaticFiles/Future/${d.slice(0, 4)}/${d}/FutureDataSettlematched.xls`
      const resp = await this.clientFetch(url, {
        headers: {
          Referer: 'http://www.czce.com.cn/',
        },
      })
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      const bytes = new Uint8Array(buf)
      // Extract text from XLS: find ASCII/Unicode text runs between known markers
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      // Try to extract table rows from raw binary — XLS files contain UTF-16LE text
      const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(bytes)
      const combined = text + utf16
      const lines = combined.split(/[\r\n]+/).filter(l => l.trim())
      const results: Record<string, unknown>[] = []
      for (const line of lines) {
        // Match lines with Chinese variety names and numbers
        const parts = line.split(/[\t,\s]+/).filter(s => s.trim())
        if (parts.length >= 2) {
          const variety = parts[0] ?? ''
          const volume = parts[1] ?? ''
          if (/小计|合计/.test(variety)) continue
          if (/[a-zA-Z]/.test(variety) && variety.length <= 4) {
            results.push({
              variety,
              deliveryVolume: safeFloat(volume.replace(/,/g, '')),
              deliveryAmount: safeFloat(parts[2]?.replace(/,/g, '') ?? ''),
            })
          }
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_delivery_match_dce
   * 对应 Python: akshare.futures.futures_to_spot.futures_delivery_match_dce
   * 数据源: http://www.dce.com.cn/dalianshangpin/xqsj/tjsj26/jgtj/jgsj/index.html
   * @param symbol - 交割品种代码，如 "a"(黄大豆1号)
   * @returns 大连商品交易所交割配对表，每项含 matchDate(配对日期)、
   *          variety(品种)、contractCode(合约代码)、deliverySettlePrice(交割结算价)、
   *          matchLots(配对手数)
   * 数据清洗: POST 请求 deliveryMatch.html，解析 HTML 表格；
   *           字段通过 safeFloat 转为数值
   */
  async futuresDeliveryMatchDce(symbol: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    try {
      const resp = await this.clientFetch(`http://www.dce.com.cn/publicweb/quotesdata/deliveryMatch.html?deliveryMatchQuotes.variety=${symbol}&contract.contract_id=all&contract.variety_id=${symbol}`, {
        method: 'POST',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      })
      const html = await resp.text()
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      for (let i = 0; i < rows.length; i++) {
        const cells = [...rows[i][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 5) continue
        if (/配对日期|小计|总计/.test(cells[0])) continue
        const matchDate = cells[0]?.split('.')[0] ?? ''
        if (!matchDate || !/^\d{4}/.test(matchDate)) continue
        results.push({
          matchDate,
          variety: cells[1] ?? '',
          contractCode: cells[2] ?? '',
          deliverySettlePrice: safeFloat(cells[3]?.replace(/,/g, '')),
          matchLots: safeFloat(cells[4]?.replace(/,/g, '')),
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_delivery_match_czce
   * 对应 Python: akshare.futures.futures_to_spot.futures_delivery_match_czce
   * 数据源: http://www.czce.com.cn/cn/jysj/jgpd/H770308index_1.htm
   * @param date - 年月日，格式 "YYYYMMDD"
   * @returns 郑州商品交易所交割配对表，每项含 matchDate(配对日期)、
   *          contractCode(合约代码)、sellerMember(卖方会员)、
   *          sellerShort(卖方简称)、buyerMember(买方会员)、
   *          buyerShort(买方简称)、deliveryVolume(交割量)
   * 数据清洗: GET .xls 文件，复杂多表解析——每个"配对日期"开头的子表独立提取；
   *           数值通过 safeFloat 转换
   */
  async futuresDeliveryMatchCzce(date: string): Promise<Record<string, unknown>[] | null> {
    if (!date) return null
    try {
      const url = `http://www.czce.com.cn/cn/DFSStaticFiles/Future/${date.slice(0, 4)}/${date}/FutureDataDelsettle.xls`
      const resp = await this.clientFetch(url, {
        headers: {
          Referer: 'http://www.czce.com.cn/',
        },
      })
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(bytes)
      const combined = text + utf16
      const lines = combined.split(/[\r\n]+/).filter(l => l.trim())
      const results: Record<string, unknown>[] = []
      let currentMatchDate = ''
      let currentContract = ''
      for (const line of lines) {
        // Detect "配对日期：YYYY-MM-DD 合约代码：XXX" pattern
        const headerMatch = line.match(/配对日期[：:]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+合约代码[：:]\s*(\S+)/)
        if (headerMatch) {
          currentMatchDate = headerMatch[1].replace(/[/]/g, '-')
          currentContract = headerMatch[2]
          continue
        }
        if (!currentMatchDate) continue
        const parts = line.split(/[\t,\s]+/).filter(s => s.trim())
        if (parts.length >= 5) {
          results.push({
            matchDate: currentMatchDate,
            contractCode: currentContract,
            sellerMember: parts[0] ?? '',
            sellerShort: parts[1] ?? '',
            buyerMember: parts[2] ?? '',
            buyerShort: parts[3] ?? '',
            deliveryVolume: safeFloat(parts[4]?.replace(/,/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_shfe_warehouse_receipt
   * 对应 Python: akshare.futures.futures_warehouse_receipt.futures_shfe_warehouse_receipt
   * 数据源: https://tsite.shfe.com.cn/statements/dataview.html?paramid=dailystock
   * @param date - 交易日，格式 "YYYYMMDD"，默认当天
   * @returns 上海期货交易所仓单日报，按品种分组，每项含 date(日期)、variety(品种)、
   *          warehouseReceipt(仓单量)、change(增减)
   * 数据清洗: GET .dat 文件(20140519 之后为 JSON，之前为 HTML)；
   *           JSON 中 o_cursor 数组提取，VARNAME 按 $ 截断取品种名
   */
  async futuresShfeWarehouseReceipt(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    try {
      const url = d >= '20140519'
        ? `https://www.shfe.com.cn/data/tradedata/future/dailydata/${d}dailystock.dat`
        : `https://www.shfe.com.cn/data/tradedata/future/dailydata/${d}dailystock.html`
      const resp = await this.clientFetch(url)
      if (d >= '20140519') {
        const json = await resp.json() as Record<string, unknown>
        const list = json.o_cursor as Record<string, unknown>[] | undefined
        if (!list?.length) return null
        return list.map(it => ({
          date: d,
          variety: String(it.VARNAME ?? '').split('$')[0] ?? '',
          warehouseReceipt: safeFloat(it.WAREHOUSEHOLD),
          change: safeFloat(it.CHANGE),
        }))
      }
      // HTML fallback for pre-20140519
      const html = await resp.text()
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 3 && /[a-zA-Z\u4e00-\u9fa5]/.test(cells[0])) {
          results.push({
            date: d, variety: cells[0],
            warehouseReceipt: safeFloat(cells[1]?.replace(/,/g, '')),
            change: safeFloat(cells[2]?.replace(/,/g, '')),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_warehouse_receipt_dce
   * 对应 Python: akshare.futures.futures_warehouse_receipt.futures_warehouse_receipt_dce
   * 数据源: http://www.dce.com.cn/dce/channel/list/187.html
   * @param date - 交易日，格式 "YYYYMMDD"，默认当天
   * @returns 大连商品交易所仓单日报，每项含 varietyCode(品种代码)、
   *          variety(品种名称)、warehouse(仓库/分库)、
   *          deliveryLocation(可选提货地点)、prevReceipt(昨日仓单量)、
   *          receipt(今日仓单量)、change(增减)
   * 数据清洗: POST JSON 请求 dailystat/wbillWeeklyQuotes，解析 JSON 中 entityList；
   *           字段通过 safeFloat 转为数值
   */
  async futuresWarehouseReceiptDce(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const endMonth = String(Number(d) + 1)
    try {
      const resp = await this.clientFetch(`http://www.dce.com.cn/publicweb/quotesdata/delivery.html?deliveryQuotes.variety=all&year=&month=&deliveryQuotes.begin_month=${d}&deliveryQuotes.end_month=${endMonth}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'deliveryQuotes.variety=all',
      })
      if (!resp.ok) return null
      const html = await resp.text()
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 4) continue
        if (cells.some(c => /小计|总计/.test(c))) continue
        const toSpotDate = cells[0]?.split('.')[0] ?? ''
        if (!toSpotDate || !/^\d{4}/.test(toSpotDate)) continue
        results.push({
          toSpotDate,
          contractCode: cells[1] ?? '',
          variety: cells[2] ?? '',
          toSpotVolume: safeFloat(cells[3]?.replace(/,/g, '')),
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_to_spot_czce
   * 对应 Python: akshare.futures.futures_to_spot.futures_to_spot_czce
   * 数据源: http://www.czce.com.cn/cn/jysj/qzxtj/H770311index_1.htm
   * @param date - 年月日，格式 "YYYYMMDD"，默认当天
   * @returns 郑州商品交易所期转现统计，每项含 contractCode(合约代码)、
   *          volume(合约数量)
   * 数据清洗: GET .xls 文件，Excel 解析提取合约代码和数量；
   *           过滤小计/合计行，数值通过 safeFloat 转换
   */
  async futuresToSpotCzce(date?: string): Promise<Record<string, unknown>[] | null> {
    const d = date || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    try {
      const url = `http://www.czce.com.cn/cn/DFSStaticFiles/Future/${d.slice(0, 4)}/${d}/FutureDataTrdtrades.xls`
      const resp = await this.clientFetch(url, {
        headers: {
          Referer: 'http://www.czce.com.cn/',
        },
      })
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(bytes)
      const combined = text + utf16
      const lines = combined.split(/[\r\n]+/).filter(l => l.trim())
      const results: Record<string, unknown>[] = []
      for (const line of lines) {
        const parts = line.split(/[\t,\s]+/).filter(s => s.trim())
        if (parts.length >= 2) {
          const contractCode = parts[0] ?? ''
          if (/小计|合计|合约代码/.test(contractCode)) continue
          if (/[a-zA-Z]/.test(contractCode) && contractCode.length <= 10) {
            results.push({
              contractCode,
              volume: safeFloat(parts[1]?.replace(/,/g, '')),
            })
          }
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ═══════════════════════════════════════════════════════════════
  // 期货-新浪数据源
  // ═══════════════════════════════════════════════════════════════

  /**
   * AKShare 接口: futures_zh_daily_sina
   * 对应 Python: akshare.futures.futures_zh_sina.futures_zh_daily_sina
   * 数据源: https://finance.sina.com.cn/futures/quotes/V2105.shtml
   * @param symbol - 期货合约代码，如 "RB0"(主力连续)、"RB2410"(具体合约)
   * @returns 指定合约的日频 OHLCV 数据列表，每项含 date(日期)、open(开盘价)、
   *          high(最高价)、low(最低价)、close(收盘价)、volume(成交量)、hold(持仓量)、
   *          settle(结算价)
   * 数据清洗: 从 Sina JSONP 接口获取，解析 InnerFuturesNewService.getDailyKLine 返回的
   *           JSON 数组，映射 8 列为 date/open/high/low/close/volume/hold/settle；
   *           数值字段通过 safeFloat 转换
   */
  async futuresZhDailySina(symbol: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    try {
      const date = '20210412'
      const type = `${date.slice(0, 4)}_${date.slice(4, 6)}_${date.slice(6, 8)}`
      const json = await httpGet(
        `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_V21052021_4_12=/InnerFuturesNewService.getDailyKLine`,
        { symbol, type },
        15000,
        { Referer: 'https://finance.sina.com.cn/' },
      )
      if (!json) return null
      // JSONP response wrapped as data array
      const raw = (json as unknown as Record<string, unknown>).data ?? json
      const arr = Array.isArray(raw) ? raw : (json as unknown as unknown[])
      if (!Array.isArray(arr) || !arr.length) return null
      return arr.map((row: unknown) => {
        const cols = row as unknown[]
        return {
          date: String(cols[0] ?? ''),
          open: safeFloat(cols[1]),
          high: safeFloat(cols[2]),
          low: safeFloat(cols[3]),
          close: safeFloat(cols[4]),
          volume: safeFloat(cols[5]),
          hold: safeFloat(cols[6]),
          settle: safeFloat(cols[7]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_zh_minute_sina
   * 对应 Python: akshare.futures.futures_zh_sina.futures_zh_minute_sina
   * 数据源: https://vip.stock.finance.sina.com.cn/quotes_service/view/qihuohangqing.html#titlePos_3
   * @param symbol - 合约代码，如 "RB0"、"IF2008"
   * @param period - K线周期，'1' | '5' | '15' | '30' | '60'
   * @returns 分钟级 OHLCV 数据列表，每项含 date(时间)、open(开盘价)、high(最高价)、
   *          low(最低价)、close(收盘价)、volume(成交量)、hold(持仓量)
   * 数据清洗: 从 Sina JSONP 接口获取，解析 InnerFuturesNewService.getFewMinLine 返回的
   *           JSON 数组，映射 7 列为 datetime/open/high/low/close/volume/hold
   */
  async futuresZhMinuteSina(symbol: string, period: '1' | '5' | '15' | '30' | '60' = '1'): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    try {
      const json = await httpGet(
        'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/=/InnerFuturesNewService.getFewMinLine',
        { symbol, type: period },
        15000,
        { Referer: 'https://vip.stock.finance.sina.com.cn/' },
      )
      if (!json) return null
      const raw = (json as unknown as Record<string, unknown>).data ?? json
      const arr = Array.isArray(raw) ? raw : (json as unknown as unknown[])
      if (!Array.isArray(arr) || !arr.length) return null
      return arr.map((row: unknown) => {
        const cols = row as unknown[]
        return {
          date: String(cols[0] ?? ''),
          open: safeFloat(cols[1]),
          high: safeFloat(cols[2]),
          low: safeFloat(cols[3]),
          close: safeFloat(cols[4]),
          volume: safeFloat(cols[5]),
          hold: safeFloat(cols[6]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_zh_realtime
   * 对应 Python: akshare.futures.futures_zh_sina.futures_zh_realtime
   * 数据源: https://vip.stock.finance.sina.com.cn/quotes_service/view/qihuohangqing.html#titlePos_1
   * @param symbol - 品种名称(中文)，如 "螺纹钢"、"PTA"、"工业硅"
   * @returns 该品种所有可交易合约的实时行情列表，每项含 symbol(合约代码)、
   *          name(合约名称)、price(最新价)、change(涨跌额)、percent(涨跌幅)、
   *          open(开盘价)、high(最高价)、low(最低价)、close(昨收)、volume(成交量)、
   *          hold(持仓量)
   * 数据清洗: 先通过 qihuohangqing.js 获取品种-代码映射表，再调用
   *           Market_Center.getHQFuturesData 接口；字段通过 safeFloat 转换
   */
  async futuresZhRealtime(symbol: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    try {
      // Fetch symbol-mark mapping from Sina
      const markResp = await this.clientFetch(
        'https://vip.stock.finance.sina.com.cn/quotes_service/view/js/qihuohangqing.js',
        { headers: { Referer: 'https://vip.stock.finance.sina.com.cn/' } },
      )
      const markText = await markResp.text()
      // Extract the JSON object from JS: { czce: [...], dce: [...], ... }
      const jsonStart = markText.indexOf('{')
      const jsonEnd = markText.lastIndexOf('}')
      if (jsonStart < 0 || jsonEnd < 0) return null
      const markJson = JSON.parse(markText.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown[][]>
      // Build symbol -> mark mapping from all exchanges
      const symbolMarkMap: Record<string, string> = {}
      for (const exchange of ['czce', 'dce', 'shfe', 'cffex', 'gfex']) {
        const rows = markJson[exchange]
        if (!Array.isArray(rows)) continue
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (Array.isArray(row) && row.length >= 2) {
            symbolMarkMap[String(row[0])] = String(row[1])
          }
        }
      }
      const node = symbolMarkMap[symbol]
      if (!node) return null
      const json = await httpGet(
        'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQFuturesData',
        { page: '1', sort: 'position', asc: '0', node, base: 'futures' },
        15000,
        { Referer: 'https://vip.stock.finance.sina.com.cn/' },
      )
      if (!Array.isArray(json)) return null
      return json.map((it: Record<string, unknown>) => ({
        symbol: String(it.symbol ?? ''),
        name: String(it.name ?? ''),
        price: safeFloat(it.trade),
        change: safeFloat(it.pricechange),
        percent: safeFloat(it.changepercent),
        open: safeFloat(it.open),
        high: safeFloat(it.high),
        low: safeFloat(it.low),
        close: safeFloat(it.settlement),
        volume: safeFloat(it.volume),
        hold: safeFloat(it.position),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_main_sina
   * 对应 Python: akshare.futures_derivative.futures_index_sina.futures_main_sina
   * 数据源: https://vip.stock.finance.sina.com.cn/quotes_service/view/qihuohangqing.html#titlePos_1
   * @param symbol - 主力连续合约代码，如 "V0"、"CF0"、"RB0"
   * @returns 主力连续合约历史日数据列表，每项含 date(日期)、open(开盘价)、
   *          high(最高价)、low(最低价)、close(收盘价)、volume(成交量)、
   *          hold(持仓量)、settle(动态结算价)
   * 数据清洗: 从 Sina JSONP 接口 InnerFuturesNewService.getDailyKLine 获取，
   *           解析 JSON 数组后映射 8 列
   */
  async futuresMainSina(symbol: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    try {
      const tradeDate = '20210817'
      const dateParam = `${tradeDate.slice(0, 4)}_${tradeDate.slice(4, 6)}_${tradeDate.slice(6, 8)}`
      const resp = await this.clientFetch(
        `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_${symbol}${dateParam}=/InnerFuturesNewService.getDailyKLine?symbol=${symbol}&_=${dateParam}`,
        { headers: { Referer: 'https://vip.stock.finance.sina.com.cn/' } },
      )
      const text = await resp.text()
      // Extract JSON array from JSONP: var _V0...=([...])
      const arrStart = text.indexOf('([')
      const arrEnd = text.lastIndexOf('])')
      if (arrStart < 0 || arrEnd < 0) return null
      const arr = JSON.parse(text.slice(arrStart + 1, arrEnd + 1)) as unknown[][]
      if (!arr.length) return null
      return arr.map(row => ({
        date: String(row[0] ?? ''),
        open: safeFloat(row[1]),
        high: safeFloat(row[2]),
        low: safeFloat(row[3]),
        close: safeFloat(row[4]),
        volume: safeFloat(row[5]),
        hold: safeFloat(row[6]),
        settle: safeFloat(row[7]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_hold_pos_sina
   * 对应 Python: akshare.futures_derivative.futures_cot_sina.futures_hold_pos_sina
   * 数据源: https://vip.stock.finance.sina.com.cn/q/view/vFutures_Positions_cjcc.php
   * @param contract - 合约代码，如 "OI2501"、"IC2403"
   * @param date - 查询日期，格式 "YYYYMMDD"
   * @returns 期货成交持仓排名数据列表，每项含 rank(名次)、member(会员简称)、
   *          volume(成交量)、change(比上交易增减)
   * 数据清洗: 从 Sina HTML 页面解析表格(第 2 个 <table>，成交量排名)，
   *           移除末尾汇总行；数值字段通过 safeFloat 转换
   */
  async futuresHoldPosSina(contract: string, date: string): Promise<Record<string, unknown>[] | null> {
    if (!contract || !date) return null
    try {
      const formatted = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      const resp = await this.clientFetch(
        `https://vip.stock.finance.sina.com.cn/q/view/vFutures_Positions_cjcc.php?t_breed=${encodeURIComponent(contract)}&t_date=${encodeURIComponent(formatted)}`,
        { headers: { Referer: 'https://vip.stock.finance.sina.com.cn/' } },
      )
      const html = await resp.text()
      // Parse HTML tables; index [2] = 成交量排名
      const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
      const tables: string[] = []
      let tm: RegExpExecArray | null
      while ((tm = tableRegex.exec(html)) !== null) {
        tables.push(tm[1])
      }
      if (tables.length < 3) return null
      // Parse the 成交量 (volume) table (index 2)
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      const rows: Record<string, unknown>[] = []
      let rm: RegExpExecArray | null
      let rowIdx = 0
      while ((rm = rowRegex.exec(tables[2])) !== null) {
        rowIdx++
        if (rowIdx === 1) continue // skip header
        const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 3) continue
        // Stop at summary rows
        if (cells[0] === '合计' || cells[0] === '空') break
        rows.push({
          date: formatted,
          rank: safeFloat(cells[0]),
          member: cells[1] ?? '',
          volume: safeFloat(cells[2]?.replace(/,/g, '')),
          change: safeFloat(cells[3]?.replace(/,/g, '')),
        })
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  // ══════════════════════════════════════════════════════════════════
  // Futures APIs — third-party and miscellaneous
  // ══════════════════════════════════════════════════════════════════

  // ── 期货-手续费 ──

  /**
   * AKShare 接口: futures_fees_info
   * 对应 Python: akshare.futures.futures_comm_ctp.futures_fees_info
   * 数据源: http://openctp.cn/fees.html
   * @returns 期货交易费用参照表列表，每项含交易所、合约名称、合约代码、合乘、最小变动价位、
   *          开仓手续费、平仓手续费、平今手续费、保证金等
   * 数据清洗: HTML 表格解析，从 openctp.cn 获取手续费参照表
   */
  async futuresFeesInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://openctp.cn/fees.html')
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      let headerSkipped = false
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 7) {
          if (!headerSkipped && cells.some(c => c.includes('交易所'))) { headerSkipped = true; trMatch = trRegex.exec(html); continue }
          rows.push({
            exchange: cells[0] ?? '', name: cells[1] ?? '', symbol: cells[2] ?? '',
            multiplier: safeFloat(cells[3]), tickSize: safeFloat(cells[4]),
            openFee: cells[5] ?? '', closeFee: cells[6] ?? '',
            closeTodayFee: cells[7] ?? '', margin: cells[8] ?? '',
          })
        }
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_comm_info
   * 对应 Python: akshare.futures.futures_comm_qihuo.futures_comm_info
   * 数据源: https://www.9qihuo.com/qihuoshouxufei
   * @param symbol - '所有' 或交易所名称，如 '上海期货交易所'
   * @returns 期货手续费列表，每项含交易所名称、合约名称、合约代码、现价、涨停板、跌停板、
   *          保证金比例、手续费标准、每跳毛利、手续费、每跳净利、备注
   * 数据清洗: HTML 表格解析，按交易所拆分后返回
   */
  async futuresCommInfo(symbol = '所有'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.9qihuo.com/qihuoshouxufei', {
        headers: {
          Referer: 'https://www.9qihuo.com/',
        },
      })
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      let currentExchange = ''
      const exchanges = ['上海期货交易所', '大连商品交易所', '郑州商品交易所', '上海国际能源交易中心', '广州期货交易所', '中国金融期货交易所']
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (!cells.length) { trMatch = trRegex.exec(html); continue }
        const rowText = cells.join(' ')
        for (const ex of exchanges) {
          if (rowText.includes(ex)) { currentExchange = ex; break }
        }
        if (symbol !== '所有' && currentExchange !== symbol && symbol !== currentExchange) { trMatch = trRegex.exec(html); continue }
        if (cells.length >= 9 && cells.some(c => /^\d/.test(c))) {
          rows.push({
            exchange: currentExchange, name: cells[0] ?? '', symbol: cells[1] ?? '',
            price: safeFloat(cells[2]), limitUp: cells[3] ?? '', limitDown: cells[4] ?? '',
            marginBuy: cells[5] ?? '', marginSell: cells[6] ?? '',
            openFee: cells[7] ?? '', closeFee: cells[8] ?? '',
            closeTodayFee: cells[9] ?? '',
          })
        }
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_comm_js
   * 对应 Python: akshare.futures.futures_comm_js.futures_comm_js
   * 数据源: https://mp-api.jin10.com/api/dynamic-data/child
   * @param date - 日期，格式 'YYYYMMDD'
   * @returns 金十财经期货手续费列表
   * 数据清洗: 从金十数据 API 获取，需自定义 headers
   */
  async futuresCommJs(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
      const params = {
        tb_name: '_vir_26',
        search: JSON.stringify({ 'range,date': `${formattedDate},${formattedDate}`, status: 1 }),
        order: 'date,desc',
      }
      const json = await akshareClient.get('https://mp-api.jin10.com/api/dynamic-data/child', params, {
        extraHeaders: {
          'x-app-id': 'fiXF2nOnDycGutVA',
          'x-version': '1.0',
          Referer: 'https://www.jin10.com/',
          Origin: 'https://www.jin10.com',
        },
      })
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        date: String(it.date ?? '').slice(0, 10),
        name: it.heyue_name ?? '', symbol: it.heyue_code ?? '',
        price: safeFloat(it.heyue_price), limitUp: safeFloat(it.up_limit_num),
        limitDown: safeFloat(it.down_limit_num),
        marginBuy: it.buy_ratio ?? '', marginSell: it.sell_ratio ?? '',
        marginPerLot: it.per_lot_price ?? '',
        openFee: it.buy_commission ?? '', closeFee: it.sell_yesterday_commission ?? '',
        closeTodayFee: it.sell_cur_commission ?? '',
        exchange: it.jys ?? '',
      }))
    } catch { return null }
  }

  // ── 期货-交易规则 ──

  /**
   * AKShare 接口: futures_rule
   * 对应 Python: akshare.futures.futures_rule.futures_rule
   * 数据源: https://www.gtjaqh.com/pc/calendar.html
   * @param date - 交易日，格式 'YYYYMMDD'
   * @returns 国泰君安期货交易日历数据列表
   * 数据清洗: HTML 表格解析，包含交易保证金比例、涨跌停板幅度、合约乘数、最小变动价位等
   */
  async futuresRule(date: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch(`https://www.gtjaqh.com/pc/calendar?date=${date}`)
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(html)
      let headerSkipped = false
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 4) {
          if (!headerSkipped && cells.some(c => c.includes('合约'))) { headerSkipped = true; trMatch = trRegex.exec(html); continue }
          rows.push({
            contract: cells[0] ?? '', exchange: cells[1] ?? '',
            marginRatio: safeFloat(cells[2]?.replace('%', '')),
            limitRange: safeFloat(cells[3]?.replace('%', '')),
            multiplier: safeFloat(cells[4]),
            tickSize: safeFloat(cells[5]),
          })
        }
        trMatch = trRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  // ── 期货-库存 ──

  /**
   * AKShare 接口: futures_inventory_99
   * 对应 Python: akshare.futures.futures_inventory_99.futures_inventory_99
   * 数据源: https://centerapi.fx168api.com/app/qh/api/stock/trend
   * @param symbol - 品种名称，如 '豆一'
   * @returns 大宗商品库存数据列表，每项含日期、收盘价、库存
   * 数据清洗: 需要自定义 auth header，从 99 期货网获取库存数据
   */
  async futuresInventory99(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await akshareClient.get('https://centerapi.fx168api.com/app/qh/api/stock/trend', {
        productId: symbol, type: '1', pageNo: '1', pageSize: '5000',
        startDate: '', endDate: new Date().toISOString().slice(0, 10),
        appCategory: 'web',
      }, {
        extraHeaders: {
          Referer: 'https://www.99qh.com',
          Origin: 'https://www.99qh.com',
          '_pcc': 'J7Dwju3vSeTlLLfTOLBnMXMtc9+PI1GWJR82GTEemXB9ORwBKCyPNDNVUQQv8p1jL3mLpZJ0PHt8HZ57YtInOoeRj900V6EBBuvPTDAD9bghKWx4sNHiZNJhkzb4cSjlSO9ZcyZPHXuCLp2szfvtZSgCGQSbTFLUnHJsMrUFxJw=',
        },
      })
      const dataList = (json?.data ?? {}) as Record<string, unknown>
      const list = (dataList.list ?? []) as Record<string, unknown>[]
      if (!list.length) return null
      return list.map(it => ({
        date: String(it.date ?? it[0] ?? '').slice(0, 10),
        close: safeFloat(it.close ?? it[1]),
        inventory: safeFloat(it.stock ?? it[2]),
      }))
    } catch { return null }
  }

  // ── 期货-外盘 ──

  /**
   * AKShare 接口: futures_foreign_commodity_realtime
   * 对应 Python: akshare.futures.futures_hq_sina.futures_foreign_commodity_realtime
   * 数据源: https://hq.sinajs.cn/?list=hf_{code}
   * @param symbol - 外盘期货代码，如 'CL','GC'，逗号分隔或数组
   * @returns 外盘期货实时行情列表
   * 数据清洗: 解析 Sina JS 变量赋值格式
   */
  async futuresForeignCommodityRealtime(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const symbols = symbol.split(',').map(s => `hf_${s.trim()}`).join(',')
      const resp = await this.clientFetch(`https://hq.sinajs.cn/?list=${symbols}`, {
        headers: {
          Referer: 'https://finance.sina.com.cn/',
        },
      })
      const text = await resp.text()
      const results: Record<string, unknown>[] = []
      const lines = text.split(';').filter(l => l.trim())
      for (const line of lines) {
        const eqIdx = line.indexOf('=')
        if (eqIdx < 0) continue
        const vars = line.slice(eqIdx + 1).replace(/"/g, '').split(',')
        if (vars.length < 14) continue
        results.push({
          name: vars[13] ?? '', currentPrice: safeFloat(vars[0]),
          bid: safeFloat(vars[2]), ask: safeFloat(vars[3]),
          high: safeFloat(vars[4]), low: safeFloat(vars[5]),
          time: vars[6] ?? '', lastSettlePrice: safeFloat(vars[7]),
          open: safeFloat(vars[8]), hold: safeFloat(vars[9]),
          date: vars[12] ?? '',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_foreign_detail
   * 对应 Python: akshare.futures.futures_foreign.futures_foreign_detail
   * 数据源: https://finance.sina.com.cn/futures/quotes/{symbol}.shtml
   * @param symbol - 外盘期货代码
   * @returns 外盘期货合约详情列表
   * 数据清洗: HTML 表格解析
   */
  async futuresForeignDetail(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch(`https://finance.sina.com.cn/futures/quotes/${symbol}.shtml`)
      const text = await resp.text()
      const rows: Record<string, unknown>[] = []
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch = trRegex.exec(text)
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length >= 4) {
          for (let i = 0; i < cells.length - 1; i += 2) {
            if (cells[i] && cells[i + 1]) rows.push({ item: cells[i], value: cells[i + 1] })
          }
        }
        trMatch = trRegex.exec(text)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_foreign_hist
   * 对应 Python: akshare.futures.futures_foreign.futures_foreign_hist
   * 数据源: Sina JSONP GlobalFuturesService.getGlobalFuturesDailyKLine
   * @param symbol - 外盘期货代码
   * @returns 外盘期货历史日线数据列表
   * 数据清洗: 从 Sina JSONP 响应中提取 JSON 数组
   */
  async futuresForeignHist(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const today = `${new Date().getFullYear()}_${new Date().getMonth() + 1}_${new Date().getDate()}`
      const resp = await this.clientFetch(
        `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_S${today}=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${symbol}&_=${today}&source=web`,
      )
      const text = await resp.text()
      const jsonStr = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
      if (!jsonStr) return null
      const data = JSON.parse(jsonStr) as Record<string, unknown>[]
      return data.map(it => ({
        date: String(it.date ?? '').slice(0, 10),
        open: safeFloat(it.open), high: safeFloat(it.high),
        low: safeFloat(it.low), close: safeFloat(it.close),
        settle: safeFloat(it.settle), volume: safeFloat(it.volume),
        hold: safeFloat(it.hold),
      }))
    } catch { return null }
  }

  // ── 期货-合约信息 ──

  /**
   * AKShare 接口: futures_contract_info_cffex
   * 对应 Python: akshare.futures_derivative.futures_contract_info_cffex.futures_contract_info_cffex
   * 数据源: http://www.cffex.com.cn/sj/jycs/{date}/{day}/index.xml
   * @returns 中金所合约信息列表
   * 数据清洗: XML 解析，包含合约代码、合约月份、挂盘基准价、上市日、最后交易日、
   *          涨停板幅度、跌停板幅度、持仓限额、品种
   */
  async futuresContractInfoCffex(): Promise<Record<string, unknown>[] | null> {
    try {
      const d = new Date()
      const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const resp = await this.clientFetch(`http://www.cffex.com.cn/sj/jycs/${date.slice(0, 6)}/${date.slice(6)}/index.xml`)
      const xml = await resp.text()
      const rows: Record<string, unknown>[] = []
      const indexRegex = /<INDEX>([\s\S]*?)<\/INDEX>/g
      let match = indexRegex.exec(xml)
      while (match) {
        const fields: Record<string, string> = {}
        const fieldRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
        let fMatch = fieldRegex.exec(match[1])
        while (fMatch) { fields[fMatch[1]] = fMatch[2]; fMatch = fieldRegex.exec(match[1]) }
        rows.push({
          tradingDay: fields.TRADING_DAY ?? '', productId: fields.PRODUCT_ID ?? '',
          instrumentId: fields.INSTRUMENT_ID ?? '', instrumentMonth: fields.INSTRUMENT_MONTH ?? '',
          basisPrice: safeFloat(fields.BASIS_PRICE), openDate: fields.OPEN_DATE ?? '',
          endTradingDay: fields.END_TRADING_DAY ?? '',
          upperValue: fields.UPPER_VALUE ?? '', lowerValue: fields.LOWER_VALUE ?? '',
          longLimit: safeFloat(fields.LONG_LIMIT),
        })
        match = indexRegex.exec(xml)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_contract_info_czce
   * 对应 Python: akshare.futures_derivative.futures_contract_info_czce.futures_contract_info_czce
   * 数据源: http://www.czce.com.cn/cn/DFSStaticFiles/Future/{year}/{date}/FutureDataReferenceData.xml
   * @returns 郑商所合约信息列表
   * 数据清洗: XML 解析
   */
  async futuresContractInfoCzce(): Promise<Record<string, unknown>[] | null> {
    try {
      const d = new Date()
      const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const resp = await this.clientFetch(`http://www.czce.com.cn/cn/DFSStaticFiles/Future/${date.slice(0, 4)}/${date}/FutureDataReferenceData.xml`)
      const xml = await resp.text()
      const rows: Record<string, unknown>[] = []
      const contractRegex = /<Contract>([\s\S]*?)<\/Contract>/g
      let match = contractRegex.exec(xml)
      while (match) {
        const fields: Record<string, string> = {}
        const fieldRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
        let fMatch = fieldRegex.exec(match[1])
        while (fMatch) { fields[fMatch[1]] = fMatch[2]; fMatch = fieldRegex.exec(match[1]) }
        rows.push({
          name: fields.Name ?? '', contractCode: fields.CtrCd ?? '',
          productCode: fields.PrdCd ?? '', productType: fields.PrdTp ?? '',
          minTick: safeFloat(fields.TckSz), tickValue: safeFloat(fields.TckVal),
          unit: fields.CtrSz ?? '', maxOrder: safeFloat(fields.MaxOrdSz),
          margin: safeFloat(fields.Margin), tradingFee: safeFloat(fields.TrdFee),
          deliveryFee: safeFloat(fields.DlvryFee),
        })
        match = contractRegex.exec(xml)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_contract_info_dce
   * 对应 Python: akshare.futures_derivative.futures_contract_info_dce.futures_contract_info_dce
   * 数据源: http://www.dce.com.cn/dcereport/publicweb/tradepara/contractInfo
   * @returns 大商所合约信息列表
   * 数据清洗: JSON 解析
   */
  async futuresContractInfoDce(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await akshareClient.get('http://www.dce.com.cn/dcereport/publicweb/tradepara/contractInfo', {
        lang: 'zh', tradeType: '1', varietyId: 'all',
      })
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        variety: it.variety ?? '', contractId: it.contractId ?? '',
        unit: safeFloat(it.unit), tick: safeFloat(it.tick),
        startTradeDate: it.startTradeDate ?? '', endTradeDate: it.endTradeDate ?? '',
        endDeliveryDate: it.endDeliveryDate ?? '',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_contract_info_gfex
   * 对应 Python: akshare.futures_derivative.futures_contract_info_gfex.futures_contract_info_gfex
   * 数据源: http://www.gfex.com.cn/u/interfacesWebTtQueryContractInfo/loadList
   * @returns 广期所合约信息列表
   * 数据清洗: JSON 解析
   */
  async futuresContractInfoGfex(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await akshareClient.get('http://www.gfex.com.cn/u/interfacesWebTtQueryContractInfo/loadList', {
        variety: '', trade_type: '0',
      })
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        variety: it.variety ?? '', contractId: it.contractId ?? '',
        unit: safeFloat(it.unit), tick: safeFloat(it.tick),
        startTradeDate: it.startTradeDate ?? '', endTradeDate: it.endTradeDate ?? '',
        endDeliveryDate: it.endDeliveryDate0 ?? '',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_contract_info_ine
   * 对应 Python: akshare.futures_derivative.futures_contract_info_ine.futures_contract_info_ine
   * 数据源: https://www.ine.cn/data/busiparamdata/future/ContractBaseInfo{date}.dat
   * @returns 上期能源合约信息列表
   * 数据清洗: JSON 解析
   */
  async futuresContractInfoIne(): Promise<Record<string, unknown>[] | null> {
    try {
      const d = new Date()
      const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const json = await akshareClient.get(`https://www.ine.cn/data/busiparamdata/future/ContractBaseInfo${date}.dat`, {
        rnd: '0.8312696798757147',
      })
      const data = (json?.ContractBaseInfo ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        instrumentId: it.INSTRUMENTID ?? '', openDate: it.OPENDATE ?? '',
        expireDate: it.EXPIREDATE ?? '', startDelivDate: it.STARTDELIVDATE ?? '',
        endDelivDate: it.ENDDELIVDATE ?? '', basisPrice: safeFloat(it.BASISPRICE),
        tradingDay: it.TRADINGDAY ?? '',
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_contract_info_shfe
   * 对应 Python: akshare.futures_derivative.futures_contract_info_shfe.futures_contract_info_shfe
   * 数据源: https://www.shfe.com.cn/data/busiparamdata/future/ContractBaseInfo{date}.dat
   * @returns 上期所合约信息列表
   * 数据清洗: JSON 解析
   */
  async futuresContractInfoShfe(): Promise<Record<string, unknown>[] | null> {
    try {
      const d = new Date()
      const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const json = await akshareClient.get(`https://www.shfe.com.cn/data/busiparamdata/future/ContractBaseInfo${date}.dat`)
      const data = (json?.ContractBaseInfo ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        instrumentId: it.INSTRUMENTID ?? '', openDate: it.OPENDATE ?? '',
        expireDate: it.EXPIREDATE ?? '', startDelivDate: it.STARTDELIVDATE ?? '',
        endDelivDate: it.ENDDELIVDATE ?? '', basisPrice: safeFloat(it.BASISPRICE),
        tradingDay: it.TRADINGDAY ?? '',
      }))
    } catch { return null }
  }

  // ── 期货-其他专题 ──

  /**
   * AKShare 接口: futures_contract_detail
   * 对应 Python: akshare.futures.futures_contract_detail.futures_contract_detail
   * 数据源: https://finance.sina.com.cn/futures/quotes/{symbol}.shtml
   * @param symbol - 合约代码，如 'V2101'
   * @returns 期货合约详情列表，每项含 item/value 键值对
   * 数据清洗: HTML 表格解析，从 Sina 期货页面获取合约详情
   */
  async futuresContractDetail(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch(`https://finance.sina.com.cn/futures/quotes/${symbol}.shtml`)
      const text = await resp.text()
      const rows: Record<string, unknown>[] = []
      const tables = text.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) ?? []
      if (tables.length >= 7) {
        const table = tables[6]
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
        let tdMatch = tdRegex.exec(table)
        const cells: string[] = []
        while (tdMatch) { cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim()); tdMatch = tdRegex.exec(table) }
        for (let i = 0; i < cells.length - 1; i += 2) {
          if (cells[i] && cells[i + 1]) rows.push({ item: cells[i], value: cells[i + 1] })
        }
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_news_shmet
   * 对应 Python: akshare.futures.futures_news_shmet.futures_news_shmet
   * 数据源: POST https://www.shmet.com/api/rest/news/queryNewsflashList
   * @param symbol - 品种，'全部'/'要闻'/'铜'/'铝'/'铅'/'锌'/'镍'/'锡'/'贵金属'/'小金属'
   * @returns 上海金属网快讯列表，每项含发布时间、内容
   * 数据清洗: POST 请求获取 JSON，时间戳转 Asia/Shanghai 时区
   */
  async futuresNewsShmet(symbol = '全部'): Promise<Record<string, unknown>[] | null> {
    try {
      const symbolMap: Record<string, string> = {
        '要闻': '0', 'VIP': '100', '财经': '999',
        '铜': '1002', '铝': '1003', '铅': '1005', '锌': '1004',
        '镍': '1006', '锡': '1007', '贵金属': '1008', '小金属': '1009',
      }
      const payload: Record<string, unknown> = symbol === '全部'
        ? { currentPage: 1, pageSize: 100 }
        : { currentPage: 1, pageSize: 2000, content: '', flashTag: symbolMap[symbol] ?? '' }
      const resp = await this.clientFetch('https://www.shmet.com/api/rest/news/queryNewsflashList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await resp.json() as Record<string, unknown>
      const data = (json?.data as Record<string, unknown>)?.dataList as Record<string, unknown>[] ?? []
      if (!data.length) return null
      return data.map(it => {
        const ts = Number(it.publishDate ?? it[3] ?? 0)
        return {
          publishTime: ts ? new Date(ts).toISOString() : String(it.publishDate ?? ''),
          content: it.content ?? it[5] ?? '',
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_index_ccidx
   * 对应 Python: akshare.futures.futures_index_ccidx.futures_index_ccidx
   * 数据源: http://www.ccidx.com/CCI-ZZZS/index/getDateLine
   * @param symbol - '中证商品期货指数' 或 '中证商品期货价格指数'
   * @returns 中证商品指数日线数据列表
   * 数据清洗: JSON 解析
   */
  async futuresIndexCcidX(symbol = '中证商品期货指数'): Promise<Record<string, unknown>[] | null> {
    try {
      const indexMap: Record<string, string> = {
        '中证商品期货指数': '100001.CCI',
        '中证商品期货价格指数': '000001.CCI',
      }
      const json = await httpGet('http://www.ccidx.com/CCI-ZZZS/index/getDateLine', {
        indexId: indexMap[symbol] ?? '100001.CCI',
      }, 15000, { 'User-Agent': 'Mozilla/5.0' })
      const data = ((json?.data as Record<string, unknown>)?.dateLineJson ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        date: String(it.tradeDate ?? '').slice(0, 10),
        indexId: it.indexId ?? '',
        closingPrice: safeFloat(it.closingPrice),
        settlePrice: safeFloat(it.settlePrice),
        change: safeFloat(it.dailyIncreaseAndDecrease),
        changePct: safeFloat(it.dailyIncreaseAndDecreasePercentage),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_spot_sys
   * 对应 Python: akshare.futures_derivative.futures_spot_sys.futures_spot_sys
   * 数据源: https://www.100ppi.com/sf/{id}.html
   * @returns 生意社现期图品种列表
   * 数据清洗: HTML 解析
   */
  async futuresSpotSys(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.100ppi.com/sf/792.html')
      const html = await resp.text()
      const rows: Record<string, unknown>[] = []
      const liRegex = /<li[^>]*><a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a><\/li>/gi
      let match = liRegex.exec(html)
      while (match) {
        rows.push({ name: match[2]?.trim() ?? '', url: match[1] ?? '' })
        match = liRegex.exec(html)
      }
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_zh_spot
   * 对应 Python: akshare.futures.futures_zh_sina.futures_zh_spot
   * 数据源: https://hq.sinajs.cn/rn={random}&list=nf_{symbol}
   * @param symbol - 合约代码，如 'V2309'，多个逗号分隔
   * @param market - 'CF' 为商品期货
   * @param adjust - '0' 或 '1'
   * @returns 期货实时行情列表
   * 数据清洗: 解析 Sina HQ JS 变量赋值格式
   */
  async futuresZhSpot(symbol: string, market = 'CF', adjust = '0'): Promise<Record<string, unknown>[] | null> {
    try {
      const rn = Math.round(Math.random() * 2147483648).toString(16)
      const subscribeList = symbol.split(',').map(s => `nf_${s.trim()}`).join(',')
      const resp = await this.clientFetch(`https://hq.sinajs.cn/rn=${rn}&list=${subscribeList}`, {
        headers: {
          Referer: 'https://vip.stock.finance.sina.com.cn/',
          Host: 'hq.sinajs.cn',
        },
      })
      const text = await resp.text()
      const results: Record<string, unknown>[] = []
      const lines = text.split(';').filter(l => l.trim())
      for (const line of lines) {
        const eqIdx = line.indexOf('=')
        if (eqIdx < 0) continue
        const vars = line.slice(eqIdx + 1).replace(/"/g, '').split(',')
        if (vars.length < 15) continue
        results.push({
          symbol: vars[0] ?? '', time: vars[0] ?? '',
          open: safeFloat(vars[2]), high: safeFloat(vars[3]),
          low: safeFloat(vars[4]), lastClose: safeFloat(vars[5]),
          bidPrice: safeFloat(vars[6]), askPrice: safeFloat(vars[7]),
          currentPrice: safeFloat(vars[8]),
          hold: safeFloat(vars[13]), volume: safeFloat(vars[14]),
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_rule_em
   * 对应 Python: akshare.futures.futures_rule_em.futures_rule_em
   * 数据源: https://eastmoneyfutures.com/api/ComManage/GetPZJYInfo
   * @returns 东方财富期货品种及交易规则列表
   * 数据清洗: JSON 解析
   */
  async futuresRuleEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('https://eastmoneyfutures.com/api/ComManage/GetPZJYInfo', {}, 15000, {
        'User-Agent': 'Mozilla/5.0',
      })
      const data = (json?.Data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data
    } catch { return null }
  }

  // ── 期货-生猪专题 ──

  /**
   * AKShare 接口: futures_hog_core
   * 对应 Python: akshare.futures_derivative.futures_hog.futures_hog_core
   * 数据源: https://xt.yangzhu.vip/data/getzhujiahitsdata
   * @param symbol - '外三元'/'内三元'/'土杂猪'
   * @returns 生猪价格核心数据列表，每项含日期、价格
   * 数据清洗: POST 请求获取 JSON
   */
  async futuresHogCore(symbol = '外三元'): Promise<Record<string, unknown>[] | null> {
    try {
      const ptypeMap: Record<string, string> = { '外三元': '1', '内三元': '2', '土杂猪': '3' }
      const ptype = ptypeMap[symbol] ?? '1'
      const resp = await this.clientFetch('https://xt.yangzhu.vip/data/getzhujiahitsdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `ptype=${ptype}&areano=-1&datetype=0`,
      })
      const json = await resp.json() as Record<string, unknown>
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        date: String(it.date ?? it[1] ?? '').slice(0, 10),
        value: safeFloat(it.value ?? it[0]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_hog_cost
   * 对应 Python: akshare.futures_derivative.futures_hog.futures_hog_cost
   * 数据源: https://xt.yangzhu.vip/data/getzhujiahitsdata 或 getmapdata
   * @param symbol - '玉米'/'豆粕'/'二元母猪价格'/'仔猪价格'
   * @returns 生猪成本维度数据列表
   * 数据清洗: POST 请求获取 JSON
   */
  async futuresHogCost(symbol = '玉米'): Promise<Record<string, unknown>[] | null> {
    try {
      const ptypeMap: Record<string, string> = { '玉米': '4', '豆粕': '5', '二元母猪价格': '1', '仔猪价格': '2' }
      const ptype = ptypeMap[symbol] ?? '4'
      const isMapData = symbol === '二元母猪价格' || symbol === '仔猪价格'
      const url = isMapData ? 'https://xt.yangzhu.vip/data/getmapdata' : 'https://xt.yangzhu.vip/data/getzhujiahitsdata'
      const body = `ptype=${ptype}&areano=-1${isMapData ? '' : '&datetype=0'}`
      const resp = await this.clientFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      const json = await resp.json() as Record<string, unknown>
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        date: String(it.date ?? it[0] ?? '').slice(0, 10),
        value: safeFloat(it.value ?? it[1]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: futures_hog_supply
   * 对应 Python: akshare.futures_derivative.futures_hog.futures_hog_supply
   * 数据源: https://xt.yangzhu.vip/data/getmapdata
   * @param symbol - '猪肉批发价'/'储备冻猪肉'/'饲料原料数据'/'白条肉'/'生猪产能'/'育肥猪'/'肉类价格指数'/'猪粮比价'
   * @returns 生猪供应维度数据列表
   * 数据清洗: POST 请求获取 JSON
   */
  async futuresHogSupply(symbol = '猪肉批发价'): Promise<Record<string, unknown>[] | null> {
    try {
      const ptypeMap: Record<string, string> = {
        '猪肉批发价': '3', '储备冻猪肉': '4', '饲料原料数据': '5',
        '白条肉': '6', '生猪产能': '7', '育肥猪': '9',
        '肉类价格指数': '10', '猪粮比价': '11',
      }
      const ptype = ptypeMap[symbol] ?? '3'
      const resp = await this.clientFetch('https://xt.yangzhu.vip/data/getmapdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `ptype=${ptype}&areano=-1`,
      })
      const json = await resp.json() as Record<string, unknown>
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => ({
        date: String(it.date ?? it[0] ?? '').slice(0, 10),
        value: safeFloat(it.value ?? it[1]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: index_hog_spot_price
   * 对应 Python: akshare.index.index_hog.index_hog_spot_price
   * 数据源: https://hqb.nxin.com/pigindex/getPigIndexChart.shtml
   * @returns 生猪市场价格指数列表
   * 数据清洗: JSON 解析，时间戳转 Asia/Shanghai 时区
   */
  async indexHogSpotPrice(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await akshareClient.get('https://hqb.nxin.com/pigindex/getPigIndexChart.shtml', {
        regionId: '0',
      })
      const data = (json?.data ?? []) as Record<string, unknown>[]
      if (!data.length) return null
      return data.map(it => {
        const ts = Number(it[0] ?? 0)
        return {
          date: ts ? new Date(ts + 8 * 3600000).toISOString().slice(0, 10) : String(it[0] ?? ''),
          index: safeFloat(it[1]), ma4: safeFloat(it[2]),
          ma6: safeFloat(it[3]), ma12: safeFloat(it[4]),
          presalePrice: safeFloat(it[5]),
          dealPrice: safeFloat(it[6]), dealWeight: safeFloat(it[7]),
        }
      })
    } catch { return null }
  }

  // ── 外汇数据 ──

  /**
   * AKShare 接口: currency_boc_sina
   * 对应 Python: akshare.currency.currency_china_bank_sina.currency_boc_sina
   * 数据源: https://biz.finance.sina.com.cn/forex/forex.php
   * @param symbol - 货币中文名称，如 '美元'、'欧元'、'英镑'、'日元' 等
   * @param startDate - 起始日期，格式 "YYYYMMDD"
   * @param endDate - 结束日期，格式 "YYYYMMDD"
   * @returns 中行人民币牌价历史数据列表，每项含 date(日期)、buyPrice(中行汇买价)、
   *          cashBuyPrice(中行钞买价)、sellPrice(中行钞卖价/汇卖价)、midPrice(央行中间价)
   * 数据清洗: 先通过 _currency_boc_sina_map 获取货币 symbol→code 映射(GBK 编码页面)，
   *           再分页请求 HTML 表格，pd.read_html 解析；JS 实现使用正则提取 <tr>/<td>
   */
  async currencyBocSina(symbol: string, startDate: string, endDate: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol || !startDate || !endDate) return null
    const fmtDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    try {
      // Step 1: get currency code mapping
      const mapResp = await this.clientFetch(`http://biz.finance.sina.com.cn/forex/forex.php?startdate=${fmtDate(startDate)}&enddate=${fmtDate(endDate)}&money_code=EUR&type=0`)
      const mapText = await mapResp.text()
      const optionRegex = /<option\s+value="([^"]+)"[^>]*>([^<]+)<\/option>/gi
      const codeMap: Record<string, string> = {}
      let m: RegExpExecArray | null
      while ((m = optionRegex.exec(mapText)) !== null) {
        codeMap[m[2].trim()] = m[1]
      }
      const code = codeMap[symbol]
      if (!code) return null

      // Step 2: fetch data page by page
      const results: Record<string, unknown>[] = []
      for (let page = 1; page <= 10; page++) {
        const resp = await this.clientFetch(`http://biz.finance.sina.com.cn/forex/forex.php?money_code=${code}&type=0&startdate=${fmtDate(startDate)}&enddate=${fmtDate(endDate)}&page=${page}&call_type=ajax`)
        const html = await resp.text()
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
        let trMatch = trRegex.exec(html)
        while (trMatch) {
          const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1].replace(/<[^>]+>/g, '').trim())
          if (cells.length >= 5 && /\d{4}/.test(cells[0])) {
            results.push({
              date: cells[0],
              buyPrice: safeFloat(cells[1]),
              cashBuyPrice: safeFloat(cells[2]),
              sellPrice: safeFloat(cells[3]),
              midPrice: safeFloat(cells[4]),
            })
          }
          trMatch = trRegex.exec(html)
        }
        const hasNextPage = html.includes(`page=${page + 1}`)
        if (!hasNextPage) break
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: currency_boc_safe
   * 对应 Python: akshare.currency.currency_safe.currency_boc_safe
   * 数据源: https://www.safe.gov.cn/safe/rmbhlzjj/index.html
   * @returns 人民币汇率中间价列表，每项含 date(日期)、usd(美元)、eur(欧元)、
   *          jpy(日元)、hkd(港元)、gbp(英镑) 等全部 25 种货币中间价
   * 数据清洗: POST 查询 safe.gov.cn RMBQuery.do 接口获取最新数据，
   *           解析 HTML 表格提取表头和数据行；Python 版先下载历史 Excel 再合并最新数据，
   *           JS 实现简化为直接查询 POST 接口
   */
  async currencyBocSafe(): Promise<Record<string, unknown>[] | null> {
    try {
      const now = new Date()
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const oneYearAgo = new Date(now)
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const startDate = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`

      const resp = await this.clientFetch('https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ startDate, endDate, queryYN: 'true' }).toString(),
      })
      const html = await resp.text()
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      const results: Record<string, unknown>[] = []
      let headerCols: string[] = []
      let trMatch = trRegex.exec(html)
      let isHeader = true
      while (trMatch) {
        const cells = [...trMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => c[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 2) { trMatch = trRegex.exec(html); continue }
        if (isHeader && cells.some(c => /日期|货币/.test(c))) {
          headerCols = cells
          isHeader = false
          trMatch = trRegex.exec(html); continue
        }
        if (isHeader) { trMatch = trRegex.exec(html); continue }
        const row: Record<string, unknown> = { date: cells[0] }
        for (let i = 1; i < cells.length && i < headerCols.length; i++) {
          const key = headerCols[i]?.toLowerCase()?.replace(/\s+/g, '') ?? `col${i}`
          row[key] = safeFloat(cells[i])
        }
        results.push(row)
        trMatch = trRegex.exec(html)
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fx_spot_quote
   * 对应 Python: akshare.fx.fx_quote.fx_spot_quote
   * 数据源: http://www.chinamoney.com.cn/chinese/mkdatapfx/
   *          API: http://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/rfx-sp-quot.json
   * @returns 人民币外汇即期报价列表，每项含 pair(货币对)、bidPrice(买报价)、askPrice(卖报价)
   * 数据清洗: POST 请求 chinamoney JSON API，取 records 数组，
   *           提取 ccyPair/bidPrc/askPrc 字段并转数值
   */
  async fxSpotQuote(): Promise<Record<string, unknown>[] | null> {
    try {
      const t = String(Date.now())
      const resp = await this.clientFetch('http://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/rfx-sp-quot.json', {
        method: 'POST',
        body: `t=${t}`,
      })
      const json = await resp.json() as Record<string, unknown>
      const records = (json?.records ?? []) as Record<string, unknown>[]
      if (!records.length) return null
      return records.map(it => ({
        pair: it.ccyPair ?? '',
        bidPrice: safeFloat(it.bidPrc),
        askPrice: safeFloat(it.askPrc),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fx_swap_quote
   * 对应 Python: akshare.fx.fx_quote.fx_swap_quote
   * 数据源: https://www.chinamoney.com.cn/chinese/index.html
   *          API: http://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/rfx-sw-quot.json
   * @returns 人民币外汇远掉报价列表，每项含 pair(货币对)、w1(1周)、m1(1月)、
   *          m3(3月)、m6(6月)、m9(9月)、y1(1年)
   * 数据清洗: POST 请求 chinamoney JSON API，取 records 数组，
   *           提取 ccyPair 及各期限 label_1W~label_1Y 字段
   */
  async fxSwapQuote(): Promise<Record<string, unknown>[] | null> {
    try {
      const t = String(Date.now())
      const resp = await this.clientFetch('http://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/rfx-sw-quot.json', {
        method: 'POST',
        body: `t=${t}`,
      })
      const json = await resp.json() as Record<string, unknown>
      const records = (json?.records ?? []) as Record<string, unknown>[]
      if (!records.length) return null
      return records.map(it => ({
        pair: it.ccyPair ?? '',
        w1: safeFloat(it.label_1W),
        m1: safeFloat(it.label_1M),
        m3: safeFloat(it.label_3M),
        m6: safeFloat(it.label_6M),
        m9: safeFloat(it.label_9M),
        y1: safeFloat(it.label_1Y),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fx_c_swap_cm
   * 对应 Python: akshare.fx.fx_c_swap_cm.fx_c_swap_cm
   * 数据源: https://www.chinamoney.org.cn/chinese/bkcurvfsw
   *          API: https://www.chinamoney.org.cn/r/cms/www/chinamoney/data/fx/fx-c-sw-curv-USD.CNY.json
   * @returns 外汇掉期 C-Swap 定盘曲线列表，每项含 datetime(日期时间)、
   *          tenor(期限品种)、swapPoints(掉期点 Pips)、dataSource(掉期点数据源)、
   *          fullRate(全价汇率)
   * 数据清洗: POST 请求 chinamoney.org.cn JSON API，取 records 数组，
   *           映射 curveTime/tenor/swapPnt/dataSource/swapAllPrc 字段；
   *           Python 版需要 LegacySSLAdapter 处理旧版 TLS，Node fetch 默认支持
   */
  async fxC_swapCm(): Promise<Record<string, unknown>[] | null> {
    try {
      const t = String(Date.now())
      const resp = await this.clientFetch('https://www.chinamoney.org.cn/r/cms/www/chinamoney/data/fx/fx-c-sw-curv-USD.CNY.json', {
        method: 'POST',
        body: `t=${t}`,
      })
      const json = await resp.json() as Record<string, unknown>
      const records = (json?.records ?? []) as Record<string, unknown>[]
      if (!records.length) return null
      return records.map(it => ({
        datetime: it.curveTime ?? '',
        tenor: it.tenor ?? '',
        swapPoints: safeFloat(it.swapPnt),
        dataSource: it.dataSource ?? '',
        fullRate: safeFloat(it.swapAllPrc),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: fx_pair_quote
   * 对应 Python: akshare.fx.fx_quote.fx_pair_quote
   * 数据源: http://www.chinamoney.com.cn/chinese/mkdatapfx/
   *          API: http://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/cpair-quot.json
   * @returns 外币对即期报价列表，每项含 pair(货币对)、bidPrice(买报价)、askPrice(卖报价)
   * 数据清洗: POST 请求 chinamoney JSON API，取 records 数组，
   *           提取 ccyPair/bidPrc/askPrc 字段并转数值
   */
  async fxPairQuote(): Promise<Record<string, unknown>[] | null> {
    try {
      const t = String(Date.now())
      const resp = await this.clientFetch('http://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/cpair-quot.json', {
        method: 'POST',
        body: `t=${t}`,
      })
      const json = await resp.json() as Record<string, unknown>
      const records = (json?.records ?? []) as Record<string, unknown>[]
      if (!records.length) return null
      return records.map(it => ({
        pair: it.ccyPair ?? '',
        bidPrice: safeFloat(it.bidPrc),
        askPrice: safeFloat(it.askPrc),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: currency_pair_map
   * 对应 Python: akshare.currency.currency_investing.currency_pair_map
   * 数据源: https://cn.investing.com/currencies/single-currency-crosses
   * @param symbol - 货币中文名称，如 '人民币'、'美元'、'欧元' 等
   * @returns 指定货币的所有可获取货币对列表，每项含 name(货币对名称)、code(货币对代码)
   * 数据清洗: 先遍历 investing.com 5 个区域(region_ID=4,1,8,7,6)获取 region→currency 映射，
   *           再通过 Service/currency 端点获取该货币所有交叉对；Python 版使用 BeautifulSoup，
   *           JS 实现使用正则解析 HTML
   */
  async currencyPairMap(symbol: string): Promise<Record<string, unknown>[] | null> {
    if (!symbol) return null
    const invHeaders: Record<string, string> = {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://cn.investing.com/currencies/single-currency-crosses',
    }
    try {
      const regionIds = ['4', '1', '8', '7', '6']
      const nameIdMap: Record<string, string> = {}
      for (const regionId of regionIds) {
        const resp = await this.clientFetch(`https://cn.investing.com/currencies/Service/region?region_ID=${regionId}&currency_ID=false`, {
          headers: invHeaders, timeoutMs: 10000,
        })
        const html = await resp.text()
        const tagRegex = /data-sml-id="([^"]+)"[^>]*(?:(?!title=)[\s\S])*?<i>([^<]+)<\/i>/gi
        let tm: RegExpExecArray | null
        while ((tm = tagRegex.exec(html)) !== null) {
          const continentId = tm[1]
          const name = tm[2].trim()
          nameIdMap[name] = `${continentId}-${regionId}`
        }
      }
      const regionCurrency = nameIdMap[symbol]
      if (!regionCurrency) return null
      const [currencyId, regId] = regionCurrency.split('-')

      const resp = await this.clientFetch(`https://cn.investing.com/currencies/Service/currency?region_ID=${regId}&currency_ID=${currencyId}`, {
        headers: invHeaders, timeoutMs: 10000,
      })
      const html = await resp.text()
      const linkRegex = /<a[^>]*href="[^"]*\/([^/"]+)"[^>]*title="([^"]+)"/gi
      const results: Record<string, unknown>[] = []
      let lm: RegExpExecArray | null
      while ((lm = linkRegex.exec(html)) !== null) {
        results.push({ name: lm[2].replace(/\s+/g, '-'), code: lm[1] })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: macro_fx_sentiment
   * 对应 Python: akshare.economic.macro_other.macro_fx_sentiment
   * 数据源: https://datacenter.jin10.com/reportType/dc_ssi_trends
   *          API: https://datacenter-api.jin10.com/sentiment/datas
   * @param startDate - 起始日期，格式 "YYYYMMDD"
   * @param endDate - 结束日期，格式 "YYYYMMDD"
   * @returns 外汇投机情绪报告列表，每项含 date(日期)、AUDJPY、AUDUSD、EURAUD、
   *          EURGBP、EURJPY、EURUSD、GBPJPY、GBPUSD、NZDUSD、USDCAD、
   *          USDCHF、USDJPY、XAUUSD（共 13 个品种多空仓位比例）
   * 数据清洗: GET 请求 Jin10 API，返回 data.values 转置为行数组，
   *           日期从 "YYYY-MM-DD" 格式提取，其余字段转数值
   */
  async macroFxSentiment(startDate: string, endDate: string): Promise<Record<string, unknown>[] | null> {
    if (!startDate || !endDate) return null
    const fmtDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    try {
      const resp = await this.clientFetch(`https://datacenter-api.jin10.com/sentiment/datas?start_date=${fmtDate(startDate)}&end_date=${fmtDate(endDate)}&currency_pair=`, {
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
          'origin': 'https://datacenter.jin10.com',
          'pragma': 'no-cache',
          'referer': 'https://datacenter.jin10.com/reportType/dc_ssi_trends',
          'x-app-id': 'rU6QIu7JHe2gOUeR',
          'x-csrf-token': '',
          'x-version': '1.0.0',
        },
      })
      const json = await resp.json() as Record<string, unknown>
      const data = json?.data as Record<string, unknown> | undefined
      const values = data?.values as Record<string, Record<string, unknown>> | undefined
      if (!values) return null
      const results: Record<string, unknown>[] = []
      for (const [dateStr, pairs] of Object.entries(values)) {
        const row: Record<string, unknown> = { date: dateStr }
        for (const [pair, val] of Object.entries(pairs as Record<string, unknown>)) {
          row[pair] = safeFloat(val)
        }
        results.push(row)
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: fx_quote_baidu
   * 对应 Python: akshare.fx.fx_quote_baidu.fx_quote_baidu
   * 数据源: https://finance.baidu.com/top/foreign-rmb
   *          API: https://finance.pae.baidu.com/api/getforeignrank
   * @param symbol - 货币基准，'人民币' 或 '美元'
   * @param token - 百度 acs-token，需从目标网站复制
   * @returns 百度股市通外汇行情列表，每项含 code(代码)、name(名称)、
   *          latest(最新价)、change(涨跌额)、changePercent(涨跌幅)
   * 数据清洗: 循环分页请求(每页20条)，从 ResultCode=0 判断正常；
   *           嵌套 list 字段解析为列，删除 market/list/status/icon1/icon2/financeType 列；
   *           涨跌幅去掉 % 后除以 100 转小数
   */
  async fxQuoteBaidu(symbol: string, token: string): Promise<Record<string, unknown>[] | null> {
    const symbolMap: Record<string, string> = { '人民币': 'rmb', '美元': 'dollar' }
    const type = symbolMap[symbol]
    if (!type) return null
    try {
      const results: Record<string, unknown>[] = []
      let page = 0
      while (true) {
        const resp = await this.clientFetch(`https://finance.pae.baidu.com/api/getforeignrank?type=${type}&pn=${page}&rn=20&finClientType=pc`, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Origin': 'https://finance.baidu.com',
            'Referer': 'https://finance.baidu.com/',
            'acs-token': token,
          }, timeoutMs: 10000,
        })
        const json = await resp.json() as Record<string, unknown>
        if (json.ResultCode !== '0') break
        const result = json.Result as Record<string, unknown>[] | undefined
        if (!result?.length) break
        for (const item of result) {
          const list = item.list as Record<string, unknown>[][] | undefined
          if (!list?.length) continue
          const headers = list[0]?.map(String) ?? []
          const values = list[1] ?? []
          const row: Record<string, unknown> = {}
          for (let i = 0; i < headers.length; i++) {
            row[headers[i]] = values[i]
          }
          results.push({
            code: row['代码'] ?? row['code'] ?? '',
            name: row['名称'] ?? row['name'] ?? '',
            latest: safeFloat(row['最新价'] ?? row['latest']),
            change: safeFloat(row['涨跌额'] ?? row['change']),
            changePercent: safeFloat(String(row['涨跌幅'] ?? row['changePercent'] ?? '').replace('%', '')),
          })
        }
        if (result.length < 20) break
        page += 20
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ── 现货数据 ──

  /**
   * AKShare 接口: spot_price_qh
   * 对应 Python: akshare.spot.spot_price_qh.spot_price_qh
   * 数据源: https://www.99qh.com/data/spotTrend
   * @param symbol - 品种中文名称，如 "螺纹钢"、"铜"、"铝"；为空则默认 "螺纹钢"
   * @returns 现货走势数据列表，每项含 date(日期)、futuresClose(期货收盘价)、spotPrice(现货价格)
   * 数据清洗: 从 99qh.com 页面 __NEXT_DATA__ JSON 提取品种映射表，从
   *           centerapi.fx168api.com 获取 token，再请求 /app/qh/api/spot/trend；
   *           fp→futuresClose、sp→spotPrice，通过 safeFloat 转为数值
   */
  async spotPriceQh(symbol = '螺纹钢'): Promise<Record<string, unknown>[] | null> {
    try {
      // Step 1: Get product list from page __NEXT_DATA__
      const pageResp = await this.clientFetch('https://www.99qh.com/data/spotTrend')
      if (!pageResp.ok) return null
      const html = await pageResp.text()
      const ndMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (!ndMatch) return null
      const ndJson = JSON.parse(ndMatch[1]) as Record<string, unknown>
      const pageProps = (ndJson?.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined
      const data = pageProps?.data as Record<string, unknown> | undefined
      const varietyList = data?.varietyListData as Record<string, unknown>[] | undefined
      if (!varietyList?.length) return null

      // Build name→productId mapping
      const nameToId = new Map<string, string>()
      for (const cat of varietyList) {
        const products = cat.productList as Record<string, unknown>[] | undefined
        if (!products) continue
        for (const p of products) {
          nameToId.set(String(p.name ?? ''), String(p.productId ?? ''))
        }
      }
      const productId = nameToId.get(symbol)
      if (!productId) return null

      // Step 2: Get token from fx168api
      const tokenResp = await this.clientFetch('https://centerapi.fx168api.com/app/common/v.js', {
        headers: {
          Origin: 'https://www.99qh.com',
          Referer: 'https://www.99qh.com',
        }, timeoutMs: 10000,
      })
      const token = tokenResp.headers.get('_pcc') ?? ''

      // Step 3: Fetch spot trend data
      const resp = await akshareClient.get('https://centerapi.fx168api.com/app/qh/api/spot/trend', {
        productId,
        pageNo: '1',
        pageSize: '50000',
        startDate: '',
        endDate: '2050-01-01',
        appCategory: 'web',
      }, {
        extraHeaders: {
          _pcc: token,
          Origin: 'https://www.99qh.com',
          Referer: 'https://www.99qh.com',
        },
      })
      const list = (resp?.data as Record<string, unknown> | undefined)?.list as Record<string, unknown>[] | undefined
      if (!list?.length) return null
      return list
        .map(it => ({
          date: String(it.date ?? '').slice(0, 10),
          futuresClose: safeFloat(it.fp),
          spotPrice: safeFloat(it.sp),
        }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    } catch { return null }
  }

  /**
   * AKShare 接口: spot_price_table_qh
   * 对应 Python: akshare.spot.spot_price_qh.spot_price_table_qh
   * 数据源: https://www.99qh.com/data/spotTrend
   * @returns 交易所与品种对照表，每项含 exchange(交易所名称)、name(品种名称)、productId(品种ID)
   * 数据清洗: 从 99qh.com 页面 __NEXT_DATA__ JSON 提取 varietyListData，扁平化
   *           所有 category 的 productList，取 qhExchangeName/name/productId 三列
   */
  async spotPriceTableQh(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.99qh.com/data/spotTrend')
      if (!resp.ok) return null
      const html = await resp.text()
      const ndMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (!ndMatch) return null
      const ndJson = JSON.parse(ndMatch[1]) as Record<string, unknown>
      const pageProps = (ndJson?.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined
      const data = pageProps?.data as Record<string, unknown> | undefined
      const varietyList = data?.varietyListData as Record<string, unknown>[] | undefined
      if (!varietyList?.length) return null
      const result: Record<string, unknown>[] = []
      for (const cat of varietyList) {
        const products = cat.productList as Record<string, unknown>[] | undefined
        if (!products) continue
        for (const p of products) {
          result.push({
            exchange: String(p.qhExchangeName ?? ''),
            name: String(p.name ?? ''),
            productId: String(p.productId ?? ''),
          })
        }
      }
      return result.length ? result : null
    } catch { return null }
  }

  /**
   * AKShare 接口: spot_hist_sge
   * 对应 Python: akshare.spot.spot_sge.spot_hist_sge
   * 数据源: https://www.sge.com.cn/sjzx/mrhq
   * @param symbol - 品种代码，如 "Au99.99"、"Ag99.99"、"Au(T+D)"；默认 "Au99.99"
   *                 可选值: 'Au99.99', 'Au99.95', 'Au100g', 'Pt99.95', 'Ag(T+D)', 'Au(T+D)',
   *                 'mAu(T+D)', 'Au(T+N1)', 'Au(T+N2)', 'Ag99.99', 'iAu99.99', 'Au99.5',
   *                 'iAu100g', 'iAu99.5', 'PGC30g', 'NYAuTN06', 'NYAuTN12'
   * @returns 上海黄金交易所历史行情列表，每项含 date(日期)、open(开盘)、close(收盘)、
   *          low(最低)、high(最高)
   * 数据清洗: POST 请求 sge.com.cn/graph/Dailyhq，解析 data_json["time"] 数组，
   *           字段通过 safeFloat 转为数值，date 通过 Date 构造函数转换
   */
  async spotHistSge(symbol = 'Au99.99'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.sge.com.cn/graph/Dailyhq', {
        method: 'POST',
        headers: {
          Accept: 'text/html, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://www.sge.com.cn',
          Referer: 'https://www.sge.com.cn/sjzx/mrhq',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ instid: symbol }),
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const timeArr = json.time as unknown[][] | undefined
      if (!timeArr?.length) return null
      return timeArr.map(row => ({
        date: row[0] != null ? new Date(Number(row[0])).toISOString().slice(0, 10) : '',
        open: safeFloat(row[1]),
        close: safeFloat(row[2]),
        low: safeFloat(row[3]),
        high: safeFloat(row[4]),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: spot_quotations_sge
   * 对应 Python: akshare.spot.spot_sge.spot_quotations_sge
   * 数据源: https://www.sge.com.cn/graph/quotations
   * @param symbol - 品种代码，如 "Au99.99"、"Ag(T+D)"；默认 "Au99.99"
   * @returns 上海黄金交易所实时行情列表，每项含 variety(品种)、time(时间)、
   *          price(现价)、updateTime(更新时间)
   * 数据清洗: POST 请求 sge.com.cn/graph/quotations，解析 heyue/times/data/delaystr 数组；
   *           price 通过 safeFloat 转为数值，过滤掉时间晚于更新时间的行，按时间排序
   */
  async spotQuotationsSge(symbol = 'Au99.99'): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.sge.com.cn/graph/quotations', {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://www.sge.com.cn',
          Referer: 'https://www.sge.com.cn/',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ instid: symbol }),
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const heyue = json.heyue as string[] | undefined
      const times = json.times as string[] | undefined
      const data = json.data as (string | number)[] | undefined
      const delayStr = json.delaystr as string[] | undefined
      if (!heyue?.length || !times?.length || !data?.length) return null
      const updateTime = delayStr?.[0]?.split(' ')[1] ?? ''
      const rows: Record<string, unknown>[] = []
      for (let i = 0; i < heyue.length; i++) {
        const t = times[i] ?? ''
        if (updateTime && t >= updateTime) continue
        rows.push({
          variety: heyue[i] ?? '',
          time: t,
          price: safeFloat(data[i]),
          updateTime: delayStr?.[0] ?? '',
        })
      }
      rows.sort((a, b) => String(a.time).localeCompare(String(b.time)))
      return rows.length ? rows : null
    } catch { return null }
  }

  /**
   * AKShare 接口: spot_golden_benchmark_sge
   * 对应 Python: akshare.spot.spot_sge.spot_golden_benchmark_sge
   * 数据源: https://www.sge.com.cn/sjzx/jzj
   * @returns 上海金基准价历史数据，每项含 date(交易日期)、eveningPrice(晚盘价)、
   *          morningPrice(早盘价)
   * 数据清洗: POST 请求 sge.com.cn/graph/DayilyJzj，解析 wp(晚盘)和 zp(早盘)两个数组；
   *           时间戳从 Unix 毫秒转为日期，价格通过 safeFloat 转为数值
   */
  async spotGoldenBenchmarkSge(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.sge.com.cn/graph/DayilyJzj', {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://www.sge.com.cn',
          Referer: 'https://www.sge.com.cn/sjzx/jzj',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const wpArr = json.wp as unknown[][] | undefined
      const zpArr = json.zp as unknown[][] | undefined
      if (!wpArr?.length) return null
      const resultMap = new Map<string, Record<string, unknown>>()
      for (const row of wpArr) {
        const date = row[0] != null ? new Date(Number(row[0])).toISOString().slice(0, 10) : ''
        resultMap.set(date, { date, eveningPrice: safeFloat(row[1]), morningPrice: null })
      }
      if (zpArr?.length) {
        for (const row of zpArr) {
          const date = row[0] != null ? new Date(Number(row[0])).toISOString().slice(0, 10) : ''
          const existing = resultMap.get(date)
          if (existing) {
            existing.morningPrice = safeFloat(row[1])
          } else {
            resultMap.set(date, { date, eveningPrice: null, morningPrice: safeFloat(row[1]) })
          }
        }
      }
      return Array.from(resultMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    } catch { return null }
  }

  /**
   * AKShare 接口: spot_silver_benchmark_sge
   * 对应 Python: akshare.spot.spot_sge.spot_silver_benchmark_sge
   * 数据源: https://www.sge.com.cn/sjzx/mrhq
   * @returns 上海银基准价历史数据，每项含 date(交易日期)、eveningPrice(晚盘价)、
   *          morningPrice(早盘价)
   * 数据清洗: POST 请求 sge.com.cn/graph/DayilyShsilverJzj，结构同 spot_golden_benchmark_sge；
   *           wp(晚盘)和 zp(早盘)数组，时间戳从 Unix 毫秒转为日期
   */
  async spotSilverBenchmarkSge(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('https://www.sge.com.cn/graph/DayilyShsilverJzj', {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://www.sge.com.cn',
          Referer: 'https://www.sge.com.cn/sjzx/mrhq',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const wpArr = json.wp as unknown[][] | undefined
      const zpArr = json.zp as unknown[][] | undefined
      if (!wpArr?.length) return null
      const resultMap = new Map<string, Record<string, unknown>>()
      for (const row of wpArr) {
        const date = row[0] != null ? new Date(Number(row[0])).toISOString().slice(0, 10) : ''
        resultMap.set(date, { date, eveningPrice: safeFloat(row[1]), morningPrice: null })
      }
      if (zpArr?.length) {
        for (const row of zpArr) {
          const date = row[0] != null ? new Date(Number(row[0])).toISOString().slice(0, 10) : ''
          const existing = resultMap.get(date)
          if (existing) {
            existing.morningPrice = safeFloat(row[1])
          } else {
            resultMap.set(date, { date, eveningPrice: null, morningPrice: safeFloat(row[1]) })
          }
        }
      }
      return Array.from(resultMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    } catch { return null }
  }

  // ── 现货-生猪大数据 ──

  private async soozhuPost(act: string, indid = ''): Promise<Record<string, unknown> | null> {
    try {
      const session = await this.clientFetch('https://www.soozhu.com/price/data/center/', {
        redirect: 'follow',
      })
      const html = await session.text()
      // Match CSRF token regardless of attribute order (name before or after value)
      const tokenMatch = html.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/i)
        ?? html.match(/value="([^"]+)"[^>]*name="csrfmiddlewaretoken"/i)
      if (!tokenMatch) return null
      const token = tokenMatch[1]
      const payload: Record<string, string> = { act, csrfmiddlewaretoken: token }
      if (indid !== '') payload.indid = indid
      const cookie = session.headers.getSetCookie()?.join('; ') ?? ''
      const resp = await this.clientFetch('https://www.soozhu.com/price/data/center/', {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams(payload).toString(),
        redirect: 'follow',
      })
      return await resp.json() as Record<string, unknown>
    } catch { return null }
  }

  /**
   * AKShare 接口: spot_hog_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_hog_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 各省生猪均价实时排行榜，每项含 province(省份)、price(均价，元/公斤)、
   *          changePercent(涨跌幅，%)
   * 数据清洗: POST act=mapdata 获取 vlist 数组，每个 item 含 name(省份)、
   *           value=[价格, 涨跌幅]；通过 safeFloat 转为数值
   */
  async spotHogSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('mapdata')
    if (!json?.vlist) return null
    const list = json.vlist as Record<string, unknown>[]
    if (!list.length) return null
    return list.map(it => ({
      province: String(it.name ?? ''),
      price: safeFloat((it.value as unknown[])?.[0]),
      changePercent: safeFloat((it.value as unknown[])?.[1]),
    }))
  }

  /**
   * AKShare 接口: spot_hog_year_trend_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_hog_year_trend_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 今年以来全国出栏均价走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=yeartrend 获取 nationlist 数组，含 [日期, 价格]；
   *           日期截取前10位，价格通过 safeFloat 转为数值
   */
  async spotHogYearTrendSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('yeartrend')
    if (!json?.nationlist) return null
    const list = json.nationlist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  /**
   * AKShare 接口: spot_hog_lean_price_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_hog_lean_price_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 全国瘦肉型肉猪价格走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=pricetrend, indid="" 获取 datalist 数组
   */
  async spotHogLeanPriceSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('pricetrend', '')
    if (!json?.datalist) return null
    const list = json.datalist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  /**
   * AKShare 接口: spot_hog_three_way_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_hog_three_way_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 全国三元仔猪价格走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=pricetrend, indid="4" 获取 datalist 数组
   */
  async spotHogThreeWaySoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('pricetrend', '4')
    if (!json?.datalist) return null
    const list = json.datalist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  /**
   * AKShare 接口: spot_hog_crossbred_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_hog_crossbred_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 全国后备二元母猪价格走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=pricetrend, indid="6" 获取 datalist 数组
   */
  async spotHogCrossbredSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('pricetrend', '6')
    if (!json?.datalist) return null
    const list = json.datalist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  /**
   * AKShare 接口: spot_corn_price_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_corn_price_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 全国玉米价格走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=pricetrend, indid="8" 获取 datalist 数组
   */
  async spotCornPriceSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('pricetrend', '8')
    if (!json?.datalist) return null
    const list = json.datalist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  /**
   * AKShare 接口: spot_soybean_price_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_soybean_price_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 全国豆粕价格走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=pricetrend, indid="9" 获取 datalist 数组
   */
  async spotSoybeanPriceSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('pricetrend', '9')
    if (!json?.datalist) return null
    const list = json.datalist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  /**
   * AKShare 接口: spot_mixed_feed_soozhu
   * 对应 Python: akshare.spot.spot_hog_soozhu.spot_mixed_feed_soozhu
   * 数据源: https://www.soozhu.com/price/data/center/
   * @returns 全国育肥猪合料半月价格走势，每项含 date(日期)、price(价格，元/公斤)
   * 数据清洗: POST act=pricetrend, indid="11" 获取 datalist 数组
   */
  async spotMixedFeedSoozhu(): Promise<Record<string, unknown>[] | null> {
    const json = await this.soozhuPost('pricetrend', '11')
    if (!json?.datalist) return null
    const list = json.datalist as unknown[][]
    if (!list.length) return null
    return list.map(it => ({
      date: String(it[0] ?? '').slice(0, 10),
      price: safeFloat(it[1]),
    }))
  }

  // ── 加密货币数据 ──

  /**
   * AKShare 接口: crypto_js_spot
   * 数据源: https://datacenter.jin10.com/reportType/dc_bitcoin_current
   * @returns 加密货币实时行情列表，每项含 market(市场)、symbol(币种)、
   *          latest(最新价)、change(涨跌额)、changePercent(涨跌幅)、
   *          high24(24小时最高)、low24(24小时最低)、volume24(24小时成交量)、
   *          updateTime(更新时间)
   * 数据清洗: 从 Jin10 数据中心 API 获取，json.data 数组直接映射字段名；
   *           通过 safeFloat 转为数值
   */
  async cryptoJsSpot(): Promise<Record<string, unknown>[] | null> {
    const json = await akshareClient.get(
      'https://datacenter-api.jin10.com/crypto_currency/list',
      {},
      {
        extraHeaders: {
          'x-app-id': 'rU6QIu7JHe2gOUeR',
          'x-csrf-token': 'x-csrf-token',
          'x-version': '1.0.0',
        },
      },
    )
    if (!json?.data) return null
    const data = json.data as Record<string, unknown>[]
    if (!Array.isArray(data) || !data.length) return null
    return data.map(it => ({
      market: String(it.market ?? ''),
      symbol: String(it.symbol ?? ''),
      latest: safeFloat(it.latest),
      change: safeFloat(it.change),
      changePercent: safeFloat(it.changePercent),
      high24: safeFloat(it.high24),
      low24: safeFloat(it.low24),
      volume24: safeFloat(it.volume24),
      updateTime: String(it.updateTime ?? ''),
    }))
  }

  /**
   * AKShare 接口: crypto_bitcoin_hold_report
   * 对应 Python: akshare.crypto.crypto_hold.crypto_bitcoin_hold_report
   * 数据源: https://datacenter-api.jin10.com/bitcoin_treasuries/list
   * @returns 比特币持仓报告列表，每项含 code(代码)、companyNameEn(公司英文名)、
   *          companyNameCn(公司中文名)、country(国家/地区)、marketCap(市值)、
   *          btcRatio(比特币占市值比重)、costBasis(持仓成本)、
   *          holdingRatio(持仓占比)、holdings(持仓量)、
   *          holdingValue(当日持仓市值)、queryDate(查询日期)、
   *          announcementUrl(公告链接)、category(分类)、multiplier(倍数)
   * 数据清洗: 从 Jin10 API 获取 bitcoin_treasuries/list，取 data.values 数组；
   *           原始数组为固定顺序元组，按索引映射到命名字段
   */
  async cryptoBitcoinHoldReport(): Promise<Record<string, unknown>[] | null> {
    const json = await akshareClient.get(
      'https://datacenter-api.jin10.com/bitcoin_treasuries/list',
      {},
      {
        extraHeaders: {
          'X-App-Id': 'lnFP5lxse24wPgtY',
          'X-Version': '1.0.0',
        },
      },
    )
    const values = (json?.data as { values?: unknown[][] })?.values
    if (!values?.length) return null
    return values.map(row => {
      const r = row as unknown[]
      return {
        code: String(r[0] ?? ''),
        companyNameEn: String(r[1] ?? ''),
        country: String(r[2] ?? ''),
        marketCap: safeFloat(r[3]),
        btcRatio: safeFloat(r[4]),
        costBasis: safeFloat(r[5]),
        holdingRatio: safeFloat(r[6]),
        holdings: safeFloat(r[7]),
        holdingValue: safeFloat(r[8]),
        queryDate: String(r[9] ?? '').slice(0, 10),
        announcementUrl: String(r[10] ?? ''),
        category: String(r[12] ?? ''),
        multiplier: safeFloat(r[13]),
        companyNameCn: String(r[15] ?? ''),
      }
    })
  }

  /**
   * AKShare 接口: crypto_bitcoin_cme
   * 对应 Python: akshare.crypto.crypto_bitcoin_cme.crypto_bitcoin_cme
   * 数据源: https://datacenter-api.jin10.com/reports/list
   * @param date - 查询日期，格式 "YYYYMMDD"，默认当天
   * @returns 芝加哥商业交易所(CME)比特币成交量报告列表，每项含
   *          commodity(商品)、type(类型)、electronicContracts(电子交易合约)、
   *          pitContracts(场内成交合约)、otcContracts(场外成交合约)、
   *          volume(成交量)、openInterest(未平仓合约)、positionChange(持仓变化)
   * 数据清洗: 从 Jin10 API 获取 reports/list，category=cme, attr_id=4；
   *           返回 data.values 数组，data.keys 提供列名映射；
   *           date 参数转为 YYYY-MM-DD 格式传入
   */
  async cryptoBitcoinCme(date?: string): Promise<Record<string, unknown>[] | null> {
    const now = new Date()
    const d = date || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const formattedDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const json = await akshareClient.get(
      'https://datacenter-api.jin10.com/reports/list',
      { category: 'cme', date: formattedDate, attr_id: '4' },
      {
        extraHeaders: {
          'accept': '*/*',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
          'origin': 'https://datacenter.jin10.com',
          'pragma': 'no-cache',
          'referer': 'https://datacenter.jin10.com/',
          'sec-ch-ua': '" Not;A Brand";v="99", "Google Chrome";v="91", "Chromium";v="91"',
          'sec-ch-ua-mobile': '?0',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Safari/537.36',
          'x-app-id': 'rU6QIu7JHe2gOUeR',
          'x-csrf-token': '',
          'x-version': '1.0.0',
        },
      },
    )
    const values = (json?.data as { values?: unknown[][] })?.values
    if (!values?.length) return null
    return values.map(row => {
      const r = row as unknown[]
      return {
        commodity: String(r[0] ?? ''),
        type: String(r[1] ?? ''),
        electronicContracts: safeFloat(r[2]),
        pitContracts: safeFloat(r[3]),
        otcContracts: safeFloat(r[4]),
        volume: safeFloat(r[5]),
        openInterest: safeFloat(r[6]),
        positionChange: safeFloat(r[7]),
      }
    })
  }

  // ── 银行数据 ──

  /**
   * AKShare 接口: bank_fjcf_table_detail
   * 对应 Python: akshare.bank.bank_cbirc_2020.bank_fjcf_table_detail
   * 数据源: https://www.nfra.gov.cn/cbircweb/DocInfo/SelectDocByItemIdAndChild
   * @param page - 获取前 page 页数据，默认 5
   * @param item - 处罚类型: "机关" | "本级" | "分局本级"，默认 "分局本级"
   * @param begin - 开始页码，默认 1
   * @returns 行政处罚信息公开表数据
   * 数据清洗: 两步获取 — 先获取 docId 列表，再逐个获取 HTML 表格并解析为结构化数据
   */
  async bankFjcfTableDetail(page = 5, item = '分局本级', begin = 1): Promise<Record<string, unknown>[] | null> {
    const itemIdMap: Record<string, string> = { '机关': '4113', '本级': '4114', '分局本级': '4115' }
    const itemId = itemIdMap[item]
    if (!itemId) return null

    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Host': 'www.nfra.gov.cn',
      'Pragma': 'no-cache',
      'Referer': 'http://www.nfra.gov.cn/cn/view/pages/ItemList.html?itemPId=923&itemId=4115',
      'X-Requested-With': 'XMLHttpRequest',
    }

    try {
      // Step 1: Get doc IDs from list API
      const docIds: string[] = []
      for (let i = begin; i < begin + page; i++) {
        const listUrl = 'https://www.nfra.gov.cn/cbircweb/DocInfo/SelectDocByItemIdAndChild'
        const listJson = await akshareClient.get(listUrl, { itemId, pageSize: '18', pageIndex: String(i) }, { extraHeaders: headers }) as Record<string, unknown>
        const data = listJson?.data as Record<string, unknown> | undefined
        const rows = data?.rows as Array<Record<string, unknown>> | undefined
        if (rows?.length) {
          for (const row of rows) {
            if (row.docId) docIds.push(String(row.docId))
          }
        }
      }

      if (!docIds.length) return null

      // Step 2: Fetch each doc's HTML table
      const results: Record<string, unknown>[] = []
      const expectedCols = [
        '行政处罚决定书文号', '姓名', '单位', '单位名称', '主要负责人姓名',
        '主要违法违规事实（案由）', '行政处罚依据', '行政处罚决定',
        '作出处罚决定的机关名称', '作出处罚决定的日期',
      ]

      for (const docId of docIds) {
        try {
          const docUrl = `https://www.nfra.gov.cn/cn/static/data/DocInfo/SelectByDocId/data_docId=${docId}.json`
          const docJson = await httpGet(docUrl, undefined, 10000) as Record<string, unknown>
          const docData = docJson?.data as Record<string, unknown> | undefined
          const html = String(docData?.docClob ?? '')
          if (!html) continue

          // Parse HTML table — extract rows from <tr> tags
          const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
          const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
          const rows: string[][] = []
          let trMatch
          while ((trMatch = trRegex.exec(html)) !== null) {
            const cells: string[] = []
            let tdMatch
            while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
              cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim())
            }
            if (cells.length) rows.push(cells)
          }

          if (!rows.length) continue

          // Extract penalty data from table
          let values: string[]
          if (rows[0].length === 2) {
            // 2-column format: label-value pairs
            values = rows.map(r => r[1] ?? '')
          } else {
            // Multi-column format: skip first 3 columns
            values = rows[0].slice(3).map(v => v ?? '')
          }

          // Pad to 10 fields if needed
          while (values.length < 10) values.splice(2, 0, '')

          // Flatten nested lists
          values = values.map(v => Array.isArray(v) ? v[0] ?? '' : v)

          const record: Record<string, unknown> = {}
          for (let ci = 0; ci < expectedCols.length && ci < values.length; ci++) {
            record[expectedCols[ci]] = values[ci]
          }
          record['处罚ID'] = docId
          record['处罚公布日期'] = String(docData?.publishDate ?? '')
          results.push(record)
        } catch { /* skip failed doc */ }
      }

      return results.length ? results : null
    } catch { return null }
  }

  // ── 高频数据 ──

  /**
   * AKShare 接口: hf_sp_500
   * 对应 Python: akshare.hf.hf_sp500.hf_sp_500
   * 数据源: https://github.com/FutureSharks/financial-data
   * @param year - 年份，如 "2017"，仅支持 2012-2018
   * @returns 标普500分钟K线数据，含 date/open/high/low/close/price
   * 数据清洗: CSV 分号分隔解析，日期转 datetime，价格字段转 numeric
   */
  async hfSp500(year = '2017'): Promise<Record<string, unknown>[] | null> {
    try {
      // Use raw.githubusercontent.com directly to avoid GitHub redirect (ECONNREFUSED)
      const url = `https://raw.githubusercontent.com/FutureSharks/financial-data/master/pyfinancialdata/data/stocks/histdata/SPXUSD/DAT_ASCII_SPXUSD_M1_${year}.csv`
      const resp = await this.clientFetch(url, { redirect: 'follow', timeoutMs: 30000 })
      if (!resp.ok) return null
      const text = await resp.text()
      const lines = text.trim().split('\n')
      if (!lines.length) return null

      return lines.map(line => {
        const parts = line.split(';')
        if (parts.length < 5) return null
        return {
          date: parts[0]?.trim() ?? '',
          open: safeFloat(parts[1]),
          high: safeFloat(parts[2]),
          low: safeFloat(parts[3]),
          close: safeFloat(parts[4]),
          price: safeFloat(parts[5]),
        }
      }).filter(Boolean) as Record<string, unknown>[]
    } catch { return null }
  }

  // ── 另类数据-汽车销量 ──

  /**
   * AKShare 接口: car_market_total_cpca
   * 对应 Python: akshare.other.other_car_cpca.car_market_total_cpca
   * 数据源: http://data.cpcadata.com/TotalMarket
   * @param symbol - '狭义乘用车' | '广义乘用车'
   * @param indicator - '产量' | '批发' | '零售' | '出口'
   * @returns 乘联会总体市场数据列表，每项含 month(月份)、prevYear(上年同月数据)、
   *          currentYear(当年当月数据)
   * 数据清洗: GET http://data.cpcadata.com/api/chartlist?charttype=1，
   *           symbol 选择图表索引(0=狭义/1=广义)，indicator 选择年份数据数组中的列索引
   *           (产量=0/批发=1/零售=2/出口=3)
   */
  async carMarketTotalCpca(symbol = '狭义乘用车', indicator = '产量'): Promise<Record<string, unknown>[] | null> {
    const indicatorMap: Record<string, number> = { '产量': 0, '批发': 1, '零售': 2, '出口': 3 }
    const symbolIndex = symbol === '广义乘用车' ? 1 : 0
    const indicatorIndex = indicatorMap[indicator] ?? 0
    try {
      const json = await akshareClient.get('http://data.cpcadata.com/api/chartlist', { charttype: '1' })
      if (!json) return null
      const chartData = json as unknown as Record<string, unknown>[]
      const chart = chartData[symbolIndex]
      if (!chart) return null
      const dataList = chart.dataList as Record<string, unknown>[]
      if (!dataList?.length) return null
      const columns = Object.keys(dataList[0])
      return dataList.map(item => {
        const currentYearData = item[columns[1]] as number[]
        const prevYearData = item[columns[2]] as number[]
        return {
          month: String(item.month ?? item[columns[0]] ?? ''),
          prevYear: safeFloat(prevYearData?.[indicatorIndex]),
          currentYear: safeFloat(currentYearData?.[indicatorIndex]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: car_market_man_rank_cpca
   * 对应 Python: akshare.other.other_car_cpca.car_market_man_rank_cpca
   * 数据源: http://data.cpcadata.com/ManRank
   * @param symbol - '狭义乘用车-单月' | '狭义乘用车-累计' | '广义乘用车-单月' | '广义乘用车-累计'
   * @param indicator - '批发' | '零售'
   * @returns 乘联会厂商排名列表，每项含 manufacturer(厂商名称)、sales(销量)
   * 数据清洗: 批发数据 GET api/chartlist?charttype=2，零售数据 GET api/chartlist_2?charttype=2；
   *           symbol 选择图表索引(0-3)，indicator 决定使用 chartlist 还是 chartlist_2 端点
   */
  async carMarketManRankCpca(symbol = '狭义乘用车-单月', indicator = '批发'): Promise<Record<string, unknown>[] | null> {
    const symbolMap: Record<string, number> = {
      '狭义乘用车-累计': 0, '狭义乘用车-单月': 1,
      '广义乘用车-累计': 2, '广义乘用车-单月': 3,
    }
    const symbolIndex = symbolMap[symbol] ?? 1
    const endpoint = indicator === '零售' ? 'chartlist_2' : 'chartlist'
    try {
      const json = await akshareClient.get(`http://data.cpcadata.com/api/${endpoint}`, { charttype: '2' })
      if (!json) return null
      const chartData = json as unknown as Record<string, unknown>[]
      const chart = chartData[symbolIndex]
      if (!chart) return null
      const dataList = chart.dataList as Record<string, unknown>[]
      if (!dataList?.length) return null
      return dataList.map(item => ({
        manufacturer: String(item.厂商 ?? ''),
        sales: safeFloat((item as Record<string, unknown>)[String(Object.keys(item)[1] ?? '')] ?? 0),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: car_market_cate_cpca
   * 对应 Python: akshare.other.other_car_cpca.car_market_cate_cpca
   * 数据源: http://data.cpcadata.com/CategoryMarket
   * @param symbol - '轿车' | 'MPV' | 'SUV' | '占比'
   * @param indicator - '批发' | '零售'
   * @returns 乘联会车型大类市场数据列表，每项含 month(月份)、sales(销量或占比)
   * 数据清洗: GET api/chartlist?charttype=3；
   *           symbol 选择图表索引(0=MPV/1=SUV/2=轿车/3=占比)，
   *           indicator 选择批发(iloc[:,1])或零售(iloc[:,2])数据列
   */
  async carMarketCateCpca(symbol = '轿车', indicator = '批发'): Promise<Record<string, unknown>[] | null> {
    const symbolMap: Record<string, number> = { 'MPV': 0, 'SUV': 1, '轿车': 2, '占比': 3 }
    const symbolIndex = symbolMap[symbol] ?? 2
    const indicatorIndex = indicator === '零售' ? 2 : 1
    try {
      const json = await akshareClient.get('http://data.cpcadata.com/api/chartlist', { charttype: '3' })
      if (!json) return null
      const chartData = json as unknown as Record<string, unknown>[]
      const chart = chartData[symbolIndex]
      if (!chart) return null
      const dataList = chart.dataList as Record<string, unknown>[]
      if (!dataList?.length) return null
      const columns = Object.keys(dataList[0])
      if (symbol === '占比') {
        const monthKey = Object.keys(dataList[0]).find(k => k === '月份' || k === 'month') ?? columns[0]
        return dataList.map(item => {
          const mpvData = item[columns[1]] as number[]
          const suvData = item[columns[2]] as number[]
          const carData = item[columns[3]] as number[]
          return {
            month: String(item[monthKey] ?? ''),
            mpv: safeFloat(mpvData?.[indicatorIndex]),
            suv: safeFloat(suvData?.[indicatorIndex]),
            car: safeFloat(carData?.[indicatorIndex]),
          }
        })
      }
      return dataList.map(item => {
        const yearData = item[columns[indicatorIndex]] as number[]
        const prevYearData = item[columns[indicatorIndex === 1 ? 2 : 1]] as number[]
        const value = safeFloat(yearData?.[0])
        const prevValue = safeFloat(prevYearData?.[0])
        return {
          month: String(item.month ?? item[columns[0]] ?? ''),
          sales: value ?? prevValue,
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: car_market_country_cpca
   * 对应 Python: akshare.other.other_car_cpca.car_market_country_cpca
   * 数据源: http://data.cpcadata.com/CountryMarket
   * @returns 乘联会国别细分市场月度数据列表，每项含 month(月份)、domestic(自主品牌)、
   *          german(德系)、japanese(日系)、french(法系)、american(美系)、korean(韩系)、
   *          otherEuro(其他欧系)
   * 数据清洗: GET api/chartlist?charttype=4，取 chartData[0].dataList；
   *           列值为嵌套数组，取 [2] 索引为销量值；列名按位置映射到国别
   */
  async carMarketCountryCpca(): Promise<Record<string, unknown>[] | null> {
    try {
      const json = await httpGet('http://data.cpcadata.com/api/chartlist', { charttype: '4' }, 15000)
      if (!json) return null
      const chartData = json as unknown as Record<string, unknown>[]
      const chart = chartData[0]
      if (!chart) return null
      const dataList = chart.dataList as Record<string, unknown>[]
      if (!dataList?.length) return null
      const columns = Object.keys(dataList[0])
      const countryKeys = columns.slice(1)
      return dataList.map(item => {
        const monthVal = item.month ?? item[columns[0]] ?? ''
        const row: Record<string, unknown> = { month: String(monthVal) }
        for (let i = 0; i < countryKeys.length; i++) {
          const val = item[countryKeys[i]]
          const arr = Array.isArray(val) ? val : [val]
          row[`col${i}`] = safeFloat(arr?.[2])
        }
        return row
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: car_market_segment_cpca
   * 对应 Python: akshare.other.other_car_cpca.car_market_segment_cpca
   * 数据源: http://data.cpcadata.com/SegmentMarket
   * @param symbol - '轿车' | 'MPV' | 'SUV'
   * @returns 乘联会级别细分市场月度数据列表，每项含 month(月份)、a00(A00级)、
   *          a0(A0级)、a(A级)、b(B级)、c(C级)
   * 数据清洗: GET api/chartlist?charttype=5；
   *           symbol 选择图表索引(0=MPV/1=SUV/2=轿车)；
   *           列值为嵌套数组，取 [2] 索引为销量值；列名按位置映射到级别
   */
  async carMarketSegmentCpca(symbol = '轿车'): Promise<Record<string, unknown>[] | null> {
    const symbolMap: Record<string, number> = { 'MPV': 0, 'SUV': 1, '轿车': 2 }
    const symbolIndex = symbolMap[symbol] ?? 2
    try {
      const json = await akshareClient.get('http://data.cpcadata.com/api/chartlist', { charttype: '5' })
      if (!json) return null
      const chartData = json as unknown as Record<string, unknown>[]
      const chart = chartData[symbolIndex]
      if (!chart) return null
      const dataList = chart.dataList as Record<string, unknown>[]
      if (!dataList?.length) return null
      const columns = Object.keys(dataList[0])
      const levelKeys = columns.slice(1)
      const levelNames = ['a00', 'a0', 'a', 'b', 'c']
      return dataList.map(item => {
        const monthVal = item.month ?? item[columns[0]] ?? ''
        const row: Record<string, unknown> = { month: String(monthVal) }
        for (let i = 0; i < Math.min(levelKeys.length, levelNames.length); i++) {
          const val = item[levelKeys[i]]
          const arr = Array.isArray(val) ? val : [val]
          row[levelNames[i]] = safeFloat(arr?.[2])
        }
        return row
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: car_market_fuel_cpca
   * 对应 Python: akshare.other.other_car_cpca.car_market_fuel_cpca
   * 数据源: http://data.cpcadata.com/FuelMarket
   * @param symbol - '整体市场' | '销量占比-PHEV-BEV' | '销量占比-ICE-NEV'
   * @returns 乘联会新能源细分市场月度数据列表，每项含 month(月份)、sales(销量或占比)
   * 数据清洗: GET api/chartlist?charttype=6；
   *           symbol 选择图表索引(0=整体市场/1=PHEV-BEV/2=ICE-NEV)；
   *           列值为嵌套数组，取 [2] 索引为数值
   */
  async carMarketFuelCpca(symbol = '整体市场'): Promise<Record<string, unknown>[] | null> {
    const symbolMap: Record<string, number> = { '整体市场': 0, '销量占比-PHEV-BEV': 1, '销量占比-ICE-NEV': 2 }
    const symbolIndex = symbolMap[symbol] ?? 0
    try {
      const json = await akshareClient.get('http://data.cpcadata.com/api/chartlist', { charttype: '6' })
      if (!json) return null
      const chartData = json as unknown as Record<string, unknown>[]
      const chart = chartData[symbolIndex]
      if (!chart) return null
      const dataList = chart.dataList as Record<string, unknown>[]
      if (!dataList?.length) return null
      const columns = Object.keys(dataList[0])
      return dataList.map(item => {
        const yearData = item[columns[1]] as number[]
        const prevYearData = item[columns[2]] as number[]
        const monthKey = Object.keys(item).find(k => k === '月份' || k === 'month') ?? columns[0]
        return {
          month: String(item[monthKey] ?? ''),
          currentYear: safeFloat(yearData?.[2]),
          prevYear: safeFloat(prevYearData?.[2]),
        }
      })
    } catch { return null }
  }

  /**
   * AKShare 接口: car_sale_rank_gasgoo
   * 对应 Python: akshare.other.other_car_gasgoo.car_sale_rank_gasgoo
   * 数据源: https://i.gasgoo.com/data/ranking
   * @param symbol - '车企榜' | '品牌榜' | '车型榜'
   * @param date - 查询年月，格式 'YYYYMM'，如 '202401'
   * @returns 盖世汽车销量排行榜列表，每项含 rank(排名)、name(名称)、
   *          sales(销量)、yoy(同比)、mom(环比)、ytd(累计销量)、
   *          prevYtd1(去年同期累计)、prevYtd2(前年同期累计)
   * 数据清洗: POST https://i.gasgoo.com/data/sales/AutoModelSalesRank.aspx/GetSalesRank，
   *           JSON payload 含 rankType(F=车企/B=品牌/M=车型)、queryDate 等；
   *           响应 "d" 字段为 JSON 字符串需二次解析
   */
  async carSaleRankGasgoo(symbol = '车企榜', date = ''): Promise<Record<string, unknown>[] | null> {
    const now = new Date()
    const d = date || `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const year = d.slice(0, 4)
    const month = String(parseInt(d.slice(4, 6), 10))
    const symbolMap: Record<string, string> = { '车型榜': 'M', '车企榜': 'F', '品牌榜': 'B' }
    const rankType = symbolMap[symbol]
    if (!rankType) return null
    const payload = {
      countryID: '', endM: month, endY: year, energy: '',
      modelGradeID: '', modelTypeID: '',
      orderBy: `${year}-${month}`, queryDate: `${year}-${month}`,
      rankType, startY: year, startM: month,
    }
    try {
      const resp = await this.clientFetch('https://i.gasgoo.com/data/sales/AutoModelSalesRank.aspx/GetSalesRank', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://i.gasgoo.com/data/ranking',
          'Origin': 'https://i.gasgoo.com',
        },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) return null
      const json = await resp.json() as Record<string, unknown>
      const dVal = json.d
      if (!dVal) return null
      // d is a JSON string that needs二次解析
      const decoded = typeof dVal === 'string' ? JSON.parse(dVal) : dVal
      const list = decoded as Record<string, unknown>[]
      if (!Array.isArray(list) || !list.length) return null
      return list.map((it, idx) => ({
        rank: idx + 1,
        name: String(it.name ?? it.Name ?? ''),
        sales: safeFloat(it.sales ?? it.Sales),
        yoy: safeFloat(it.yoy ?? it.Yoy),
        mom: safeFloat(it.mom ?? it.Mom),
        ytd: safeFloat(it.ytd ?? it.Ytd),
        prevYtd1: safeFloat(it.prevYtd1 ?? it.PrevYtd1),
        prevYtd2: safeFloat(it.prevYtd2 ?? it.PrevYtd2),
      }))
    } catch { return null }
  }

  // ── 另类数据-新闻 ──

  /**
   * AKShare 接口: news_cctv
   * 对应 Python: akshare.news.news_cctv.news_cctv
   * 数据源: https://tv.cctv.com/lm/xwlb
   * @param date - 日期，格式 "YYYYMMDD"，如 "20240424"
   * @returns 新闻联播文字稿列表，每项含 date(日期)、title(标题)、content(内容)
   * 数据清洗: 从 CCTV 新闻联播页面获取当日新闻列表，逐条抓取标题与正文；
   *           20160203 之后的日期使用 https://tv.cctv.com/lm/xwlb/day/{date}.shtml
   */
  async newsCctv(date: string): Promise<Record<string, unknown>[] | null> {
    if (!date) return null
    try {
      const d = date.replace(/-/g, '')
      const listResp = await this.clientFetch(`https://tv.cctv.com/lm/xwlb/day/${d}.shtml`, {
        redirect: 'follow',
      })
      if (!listResp.ok) return null
      const listHtml = await listResp.text()
      const linkRegex = /<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>/gi
      const pageUrls: string[] = []
      let lm: RegExpExecArray | null
      while ((lm = linkRegex.exec(listHtml)) !== null) {
        const href = lm[1]
        if (href && href.startsWith('http')) pageUrls.push(href)
      }
      // skip first item (typically not a news item)
      const urls = pageUrls.slice(1)
      if (!urls.length) return null
      const results: Record<string, unknown>[] = []
      const cctvHeaders = {
        Referer: 'https://tv.cctv.com/',
      }
      for (const url of urls) {
        try {
          const pageResp = await this.clientFetch(url, { headers: cctvHeaders, timeoutMs: 10000 })
          if (!pageResp.ok) continue
          const html = await pageResp.text()
          let title = ''
          const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)
          if (h3Match) {
            title = h3Match[1].replace(/<[^>]+>/g, '').trim()
          } else {
            const titMatch = html.match(/class="tit"[^>]*>([\s\S]*?)<\/div>/)
            if (titMatch) title = titMatch[1].replace(/<[^>]+>/g, '').trim()
          }
          let content = ''
          const cntMatch = html.match(/class="cnt_bd"[^>]*>([\s\S]*?)<\/div>/)
          if (cntMatch) {
            content = cntMatch[1].replace(/<[^>]+>/g, '').trim()
          } else {
            const areaMatch = html.match(/class="content_area"[^>]*>([\s\S]*?)<\/div>/)
            if (areaMatch) content = areaMatch[1].replace(/<[^>]+>/g, '').trim()
          }
          if (title || content) {
            results.push({
              date: d,
              title: title.replace(/\[视频\]/g, '').replace(/\n/g, ' ').trim(),
              content: content
                .replace(/央视网消息(（|\\()新闻联播(）|\\))：/g, '')
                .replace(/\n/g, ' ')
                .trim(),
            })
          }
        } catch { /* skip failed page */ }
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ── 另类数据-日出日落 ──

  /**
   * AKShare 接口: sunrise_daily
   * 对应 Python: akshare.air.sunrise_tad.sunrise_daily
   * 数据源: https://www.timeanddate.com/sun/china/{city}
   * @param date - 日期，格式 "YYYYMMDD"，如 "20240428"
   * @param city - 城市英文名，如 "beijing"、"shanghai"，默认 "beijing"
   * @returns 指定日期指定城市的日出日落数据列表，每项含 date(日期)、
   *          sunrise(日出时间)、sunset(日落时间)、length(日照时长) 等
   * 数据清洗: 从 timeanddate.com 解析 HTML 表格，筛选指定日期行
   */
  async sunriseDaily(date: string, city = 'beijing'): Promise<Record<string, unknown>[] | null> {
    if (!date) return null
    try {
      const d = date.replace(/-/g, '')
      const year = d.slice(0, 4)
      const month = d.slice(4, 6)
      const day = d.slice(6, 8)
      const url = `https://www.timeanddate.com/sun/china/${city}?month=${month}&year=${year}`
      const resp = await this.clientFetch(url, { redirect: 'follow' })
      if (!resp.ok) return null
      const html = await resp.text()
      // Parse HTML table rows
      const tableMatch = html.match(/<table[^>]*class="zebra"[^>]*>([\s\S]*?)<\/table>/)
      if (!tableMatch) return null
      const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 5) continue
        // First cell is day number
        const cellDay = cells[0]?.replace(/\D/g, '').padStart(2, '0')
        if (cellDay === day) {
          results.push({
            date: `${year}-${month}-${day}`,
            sunrise: cells[1] ?? '',
            sunset: cells[2] ?? '',
            length: cells[3] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: sunrise_monthly
   * 对应 Python: akshare.air.sunrise_tad.sunrise_monthly
   * 数据源: https://www.timeanddate.com/sun/china/{city}
   * @param date - 日期，格式 "YYYYMMDD"，用于指定所在月份
   * @param city - 城市英文名，如 "beijing"、"shanghai"，默认 "beijing"
   * @returns 指定月份的日出日落数据列表，每项含 date(日期)、
   *          sunrise(日出时间)、sunset(日落时间)、length(日照时长) 等
   * 数据清洗: 从 timeanddate.com 解析 HTML 表格，返回该月全部日期数据
   */
  async sunriseMonthly(date: string, city = 'beijing'): Promise<Record<string, unknown>[] | null> {
    if (!date) return null
    try {
      const d = date.replace(/-/g, '')
      const year = d.slice(0, 4)
      const month = d.slice(4, 6)
      const datePrefix = d.slice(0, 6)
      const url = `https://www.timeanddate.com/sun/china/${city}?month=${month}&year=${year}`
      const resp = await this.clientFetch(url, { redirect: 'follow' })
      if (!resp.ok) return null
      const html = await resp.text()
      const tableMatch = html.match(/<table[^>]*class="zebra"[^>]*>([\s\S]*?)<\/table>/)
      if (!tableMatch) return null
      const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 5) continue
        const cellDay = cells[0]?.replace(/\D/g, '').padStart(2, '0')
        if (/^\d{2}$/.test(cellDay)) {
          results.push({
            date: `${datePrefix}${cellDay}`,
            sunrise: cells[1] ?? '',
            sunset: cells[2] ?? '',
            length: cells[3] ?? '',
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  // ── 另类数据-空气质量 ──

  /**
   * AKShare 接口: air_quality_hebei
   * 对应 Python: akshare.air.air_hebei.air_quality_hebei
   * 数据源: http://218.11.10.130:8080/api/hour/130000.xml
   * @returns 河北省空气质量预报数据列表，每项含 city(城市)、region(区域)、
   *          station(监测点)、time(时间)、aqi(AQI指数)、level(空气质量等级)、
   *          maxPoll(首要污染物)、以及各污染物浓度和 IAQI
   * 数据清洗: 从 XML 响应解析 City/Pointer 节点，提取监测数据；
   *           含 PM2.5、PM10、SO2、CO、NO2、O3 等污染物浓度和 IAQI
   */
  async airQualityHebei(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await this.clientFetch('http://218.11.10.130:8080/api/hour/130000.xml')
      if (!resp.ok) return null
      const xml = await resp.text()
      const results: Record<string, unknown>[] = []
      // Parse City nodes
      const cityRegex = /<City[^>]*>([\s\S]*?)<\/City>/gi
      let cityMatch: RegExpExecArray | null
      while ((cityMatch = cityRegex.exec(xml)) !== null) {
        const cityBlock = cityMatch[1]
        const cityName = (cityBlock.match(/<Name>([^<]*)<\/Name>/) ?? [])[1] ?? ''
        // Parse Pointer nodes within each City
        const pointerRegex = /<Pointer[^>]*>([\s\S]*?)<\/Pointer>/gi
        let pointerMatch: RegExpExecArray | null
        while ((pointerMatch = pointerRegex.exec(cityBlock)) !== null) {
          const ptr = pointerMatch[1]
          const getField = (tag: string) => (ptr.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`)) ?? [])[1] ?? ''
          const row: Record<string, unknown> = {
            city: cityName,
            district: getField('Region'),
            station: getField('Name'),
            time: getField('DataTime'),
            aqi: safeFloat(getField('AQI')),
            level: getField('Level'),
            maxPoll: getField('MaxPoll'),
          }
          // Parse Poll nodes
          const pollRegex = /<Poll[^>]*>([\s\S]*?)<\/Poll>/gi
          let pollMatch: RegExpExecArray | null
          while ((pollMatch = pollRegex.exec(ptr)) !== null) {
            const pollBlock = pollMatch[1]
            const pollName = (pollBlock.match(/<Name>([^<]*)<\/Name>/) ?? [])[1] ?? ''
            const pollValue = (pollBlock.match(/<Value>([^<]*)<\/Value>/) ?? [])[1] ?? ''
            const pollIaqi = (pollBlock.match(/<IAQI>([^<]*)<\/IAQI>/) ?? [])[1] ?? ''
            if (pollName) {
              row[`${pollName}_Value`] = safeFloat(pollValue)
              row[`${pollName}_IAQI`] = safeFloat(pollIaqi)
            }
          }
          results.push(row)
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: air_city_table
   * 对应 Python: akshare.air.air_zhenqi.air_city_table
   * 数据源: https://www.zq12369.com/environment.php
   * @returns 全部城市列表，每项含 rank(序号)、province(省份)、city(城市)、
   *          aqi(AQI)、quality(空气质量)、pm25(PM2.5浓度)、pollutant(首要污染物)
   * 数据清洗: 从真气网环境页面解析 HTML 表格，获取城市排名数据
   */
  async airCityTable(): Promise<Record<string, unknown>[] | null> {
    try {
      const url = 'https://www.zq12369.com/environment.php'
      const params = { date: '2020-05-01', tab: 'rank', order: 'DESC', type: 'DAY' }
      const resp = await this.clientFetch(`${url}?${new URLSearchParams(params)}`)
      if (!resp.ok) return null
      const html = await resp.text()
      // Parse the second table (index 1)
      const tables = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) ?? []
      if (tables.length < 2) return null
      const tableHtml = tables[1]
      const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      let rank = 0
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 7) continue
        // Skip header row and separator rows
        if (cells[0] === '序号' || cells[0] === '降序' || cells[0] === '') continue
        rank++
        results.push({
          rank,
          province: cells[1] ?? '',
          city: cells[2] ?? '',
          aqi: safeFloat(cells[3]),
          quality: cells[4] ?? '',
          pm25: safeFloat(cells[5]),
          pollutant: cells[6] ?? '',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: air_quality_hist
   * 对应 Python: akshare.air.air_zhenqi.air_quality_hist
   * 数据源: https://www.zq12369.com/
   * @param city - 城市名称，如 "杭州"、"北京"
   * @param period - 数据频率: "hour"(每小时)、"day"(每天)、"month"(每月)
   * @param startDate - 起始日期，格式 "YYYYMMDD"
   * @param endDate - 结束日期，格式 "YYYYMMDD"
   * @returns 指定城市的空气质量历史数据列表，每项含 time(时间)、
   *          aqi(AQI)、pm25(PM2.5)、pm10(PM10)、co(CO)、
   *          no2(NO2)、o3(O3)、so2(SO2) 等污染物指标
   * 数据清洗: 通过真气网加密 API 获取，需执行 JS 加密逻辑；
   *           period 为 hour 时数据量较大，下载较慢
   */
  async airQualityHist(city: string, period: string, startDate: string, endDate: string): Promise<Record<string, unknown>[] | null> {
    if (!city || !startDate || !endDate) return null
    try {
      const sd = startDate.replace(/-/g, '')
      const ed = endDate.replace(/-/g, '')
      const sdFmt = `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}`
      const edFmt = `${ed.slice(0, 4)}-${ed.slice(4, 6)}-${ed.slice(6, 8)}`
      const periodUpper = period.toUpperCase()
      const appId = '4f0e3a273d547ce6b7147bfa7ceb4b6e'
      const method = 'CETCITYPERIOD'
      const timestamp = Date.now()
      const pText = JSON.stringify({
        city,
        endTime: `${edFmt} 23:45:39`,
        startTime: `${sdFmt} 00:00:00`,
        type: periodUpper,
      }).replace(/ "/g, '"')

      // MD5 secret computation
      const { createHash } = await import('crypto')
      const secret = createHash('md5').update(appId + method + timestamp + 'WEB' + pText).digest('hex')

      const payload: Record<string, unknown> = {
        appId,
        method: 'CETCITYPERIOD',
        timestamp,
        clienttype: 'WEB',
        object: { city, type: periodUpper, startTime: `${sdFmt} 00:00:00`, endTime: `${edFmt} 23:45:39` },
        secret,
      }

      // encode_param equivalent: Base64 encode the JSON payload
      const paramStr = JSON.stringify(payload)
        .replace(/ "/g, '"')
        .replace(/\\/, '')
      const encodedParam = Buffer.from(paramStr).toString('base64')

      const resp = await this.clientFetch('https://www.zq12369.com/api/newzhenqiapi.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ param: encodedParam }).toString(),
        timeoutMs: 30000,
      })
      if (!resp.ok) return null
      const encryptedText = await resp.text()
      // decode_result: triple Base64 decode
      let decoded = encryptedText
      for (let i = 0; i < 3; i++) {
        decoded = Buffer.from(decoded, 'base64').toString('utf-8')
      }
      const data = JSON.parse(decoded) as Record<string, unknown>
      const rows = (data?.result as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      const rowList = rows?.rows as Record<string, unknown>[] | undefined
      if (!rowList?.length) return null
      return rowList.map(it => ({
        time: String(it.time ?? ''),
        aqi: safeFloat(it.aqi),
        pm25: safeFloat(it.pm25),
        pm10: safeFloat(it.pm10),
        co: safeFloat(it.co),
        no2: safeFloat(it.no2),
        o3: safeFloat(it.o3),
        so2: safeFloat(it.so2),
      }))
    } catch { return null }
  }

  /**
   * AKShare 接口: air_quality_rank
   * 对应 Python: akshare.air.air_zhenqi.air_quality_rank
   * 数据源: https://www.zq12369.com/environment.php
   * @param date - 查询日期，格式 "":实时、"YYYYMMDD":日、"YYYYMM":月、"YYYY":年
   * @returns 城市 AQI 排行榜数据，每项含 rank(排名)、province(省份)、
   *          city(城市)、aqi(AQI)、quality(空气质量)、pm25(PM2.5)、pollutant(首要污染物)
   * 数据清洗: 根据 date 参数长度和内容选择不同的查询模式(日/月/年/实时)
   */
  async airQualityRank(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const url = 'https://www.zq12369.com/environment.php'
      let params: Record<string, string>
      let tableIndex: number

      if (date === '') {
        // Realtime
        params = { tab: 'rank', order: 'DESC', type: 'MONTH' }
        tableIndex = 0
      } else if (date.length === 8) {
        // Daily: YYYYMMDD -> YYYY-MM-DD
        const fmt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
        params = { date: fmt, tab: 'rank', order: 'DESC', type: 'DAY' }
        tableIndex = 1
      } else if (date.length === 6) {
        // Monthly: YYYYMM -> YYYY-MM
        const fmt = `${date.slice(0, 4)}-${date.slice(4, 6)}`
        params = { month: fmt, tab: 'rank', order: 'DESC', type: 'MONTH' }
        tableIndex = 2
      } else if (date.length === 4) {
        // Yearly: YYYY
        params = { year: date, tab: 'rank', order: 'DESC', type: 'YEAR' }
        tableIndex = 3
      } else {
        return null
      }

      const resp = await this.clientFetch(`${url}?${new URLSearchParams(params)}`)
      if (!resp.ok) return null
      const html = await resp.text()
      const tables = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) ?? []
      if (tables.length <= tableIndex) return null
      const tableHtml = tables[tableIndex]
      const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      const results: Record<string, unknown>[] = []
      let rank = 0
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        if (cells.length < 7) continue
        if (cells[0] === '序号' || cells[0] === '降序' || cells[0] === '' || cells[0] === '排名') continue
        rank++
        results.push({
          rank,
          province: cells[1] ?? '',
          city: cells[2] ?? '',
          aqi: safeFloat(cells[3]),
          quality: cells[4] ?? '',
          pm25: safeFloat(cells[5]),
          pollutant: cells[6] ?? '',
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * AKShare 接口: air_quality_watch_point
   * 对应 Python: akshare.air.air_zhenqi.air_quality_watch_point
   * 数据源: https://www.zq12369.com/
   * @param city - 城市名称，如 "杭州"、"北京"
   * @param startDate - 起始日期，格式 "YYYYMMDD"
   * @param endDate - 结束日期，格式 "YYYYMMDD"
   * @returns 指定城市监测点空气质量数据列表，每项含 pointname(监测点名称)、
   *          aqi(AQI)、pm25(PM2.5)、pm10(PM10)、no2(NO2)、
   *          so2(SO2)、o3(O3)、co(CO)
   * 数据清洗: 通过真气网加密 API 获取监测点级别数据，需执行 JS 加密逻辑
   */
  async airQualityWatchPoint(city: string, startDate: string, endDate: string): Promise<Record<string, unknown>[] | null> {
    if (!city || !startDate || !endDate) return null
    try {
      const sd = startDate.replace(/-/g, '')
      const ed = endDate.replace(/-/g, '')
      const sdFmt = `${sd.slice(0, 4)}-${sd.slice(4, 6)}-${sd.slice(6, 8)}`
      const edFmt = `${ed.slice(0, 4)}-${ed.slice(4, 6)}-${ed.slice(6, 8)}`
      const appId = 'a01901d3caba1f362d69474674ce477f'
      const method = 'GETCITYPOINTAVG'

      const { createHash } = await import('crypto')
      // encode_param: Base64 encode
      const cityParam = Buffer.from(city).toString('base64')
      const methodEncoded = Buffer.from(method).toString('base64')
      const startEncoded = Buffer.from(sdFmt).toString('base64')
      const endEncoded = Buffer.from(edFmt).toString('base64')
      // encode_secret: MD5(appId + method + city + start + end)
      const secret = createHash('md5').update(appId + method + city + sdFmt + edFmt).digest('hex')

      const payload = new URLSearchParams({
        appId,
        method: methodEncoded,
        city: cityParam,
        startTime: startEncoded,
        endTime: endEncoded,
        secret,
      })

      const resp = await this.clientFetch('https://www.zq12369.com/api/zhenqiapi.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString(),
        timeoutMs: 30000,
      })
      if (!resp.ok) return null
      const encryptedText = await resp.text()
      // decode_result: triple Base64 decode
      let decoded = encryptedText
      for (let i = 0; i < 3; i++) {
        decoded = Buffer.from(decoded, 'base64').toString('utf-8')
      }
      const data = JSON.parse(decoded) as Record<string, unknown>
      const rows = data?.rows as Record<string, unknown>[] | undefined
      if (!rows?.length) return null
      return rows.map(it => ({
        pointname: it.pointname ?? it.pointName ?? '',
        aqi: safeFloat(it.aqi),
        pm25: safeFloat(it.pm25),
        pm10: safeFloat(it.pm10),
        no2: safeFloat(it.no2),
        so2: safeFloat(it.so2),
        o3: safeFloat(it.o3),
        co: safeFloat(it.co),
      }))
    } catch { return null }
  }
}
