/**
 * Misc data handler — non-eastmoney APIs from AKShare documentation.
 * Temporary provider until these APIs are migrated to appropriate providers.
 */

import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'

const CURRENCYSOOP_API_KEY = process.env.OPPTRIX_CURRENCYSOOP_API_KEY ?? process.env.CURRENCYSOOP_API_KEY ?? ''
const CURRENCYSOOP_BASE = 'https://api.currencyscoop.com/v1'

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

async function httpGet(url: string, params?: Record<string, string>, timeoutMs = 15000, extraHeaders?: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const fullUrl = params && Object.keys(params).length ? `${url}?${new URLSearchParams(params)}` : url
    const resp = await fetch(fullUrl, {
      headers: extraHeaders ?? HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
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

  /**
   * AKShare 接口: stock_lhb_detail_em
   * 对应 Python: akshare.stock_feature.stock_lhb_em.stock_lhb_detail_em
   * 数据源: https://data.eastmoney.com/stock/tradedetail.html
   * @param date - 交易日期，格式 "YYYY-MM-DD"；为空则取当天
   * @returns 龙虎榜详情列表，每项含 SECURITY_CODE(代码)、SECURITY_NAME_ABBR(名称)、
   *          TRADE_DATE(上榜日)、EXPLAIN(解读)、CLOSE_PRICE(收盘价)、CHANGE_RATE(涨跌幅)、
   *          BILLBOARD_NET_AMT(龙虎榜净买额)、BILLBOARD_BUY_AMT(龙虎榜买入额)、
   *          BILLBOARD_SELL_AMT(龙虎榜卖出额)、BILLBOARD_DEAL_AMT(龙虎榜成交额)、
   *          ACCUM_AMOUNT(市场总成交额)、DEAL_NET_RATIO(净买额占总成交比)、
   *          DEAL_AMOUNT_RATIO(成交额占总成交比)、TURNOVERRATE(换手率)、
   *          FREE_MARKET_CAP(流通市值)、EXPLANATION(上榜原因)、
   *          D1~D10_CLOSE_ADJCHRATE(上榜后1~10日涨跌幅)
   * 数据清洗: 通过 datacenter-web.eastmoney.com API 获取，pageSize=200，按 SECURITY_CODE 升序；
   *           Python 版本支持日期范围筛选+分页，此实现仅查单日
   */
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

  /**
   * AKShare 接口: stock_lhb_jgmmtj_em
   * 对应 Python: akshare.stock_feature.stock_lhb_em.stock_lhb_jgmmtj_em
   * 数据源: https://data.eastmoney.com/stock/tradedetail.html
   * @returns 龙虎榜机构席位统计列表，每项含 TRADE_DATE(交易日期)、SECURITY_CODE(代码)、
   *          SECURITY_NAME_ABBR(名称)、CHANGE_RATE(涨跌幅)、BILLBOARD_NET_AMT(龙虎榜净买额)、
   *          BUY总额/次数、SELL总额/次数 等机构买卖统计
   * 数据清洗: reportName=RPT_BILLBOARD_DAILYSTATISTICS，pageSize=100，
   *           按 TRADE_DATE 降序、SECURITY_CODE 升序排列
   */
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

  /**
   * AKShare 接口: stock_lhb_stock_statistic_em
   * 对应 Python: akshare.stock_feature.stock_lhb_em.stock_lhb_stock_statistic_em
   * 数据源: https://data.eastmoney.com/stock/tradedetail.html
   * @param code - 股票代码，如 "000001"
   * @returns 个股龙虎榜统计列表，每项含 SECURITY_CODE、SECURITY_NAME_ABBR、TRADE_DATE、
   *          BUY_AMT(买入额)、SELL_AMT(卖出额)、NET_AMT(净买额) 等字段
   * 数据清洗: reportName=RPT_BILLBOARD_DAILYDETAILS，按 TRADE_DATE 降序，pageSize=50；
   *           空 code 返回 null
   */
  async lhbStockStatistic(code: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_gdfx_free_holding_statistics_em
   * 对应 Python: akshare.stock_feature.stock_gdfx_em.stock_gdfx_free_holding_statistics_em
   * 数据源: https://data.eastmoney.com/gdfx/HoldingAnalyse.html
   * @returns 股东户数变动 Top100 列表，每项含 code(股票代码，normalizeCode 处理)、
   *          name(股票简称)、holderNum(股东户数)、holderNumChange(户数变动)、
   *          holderNumChangeRate(户数变动率)、avgHoldingShares(户均持股)、
   *          reportDate(报告日期)
   * 数据清洗: reportName=RPT_F10_EH_HOLDERNUMCHANGE，筛选 HOLDER_NUM_CHANGE>0，
   *           按 HOLDNUM_CHANGE_RATE 降序取 Top100；
   *           字段通过 normalizeCode/safeFloat 进行清洗转换
   */
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

  /**
   * AKShare 接口: stock_gdfx_holding_detail_em
   * 对应 Python: akshare.stock_feature.stock_gdfx_em.stock_gdfx_holding_detail_em
   * 数据源: https://data.eastmoney.com/gdfx/HoldingAnalyse.html
   * @param code - 股票代码，如 "000001"
   * @returns 个股股东户数详情列表，每项含 SECURITY_CODE、HOLDER_NUM(股东户数)、
   *          HOLDER_NUM_CHANGE(户数变动)、AVG_FREE_SHARES(户均持股)、END_DATE(截止日期) 等
   * 数据清洗: reportName=RPT_F10_EH_HOLDERNUM，按 END_DATE 降序，pageSize=20；
   *           空 code 返回 null
   */
  async gdfxHoldingDetail(code: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_value_em (市场总貌)
   * 对应 Python: akshare.stock_feature.stock_value_em.stock_value_em
   * 数据源: https://data.eastmoney.com/gzfx/detail/300766.html
   * @returns 全市场估值指标，每项含 date(交易日期)、totalMarketCap(总市值)、
   *          avgPe(动态市盈率)、avgPb(市净率)、dividendYield(股息率)
   * 数据清洗: reportName=RPT_VALUEANALYSIS_DET，取最新一条(TRADE_DATE 降序，pageSize=1)，
   *           字段通过 safeFloat 转为数值
   */
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

  /**
   * AKShare 接口: stock_a_pe_lg (乐咕乐股)
   * 对应 Python: akshare.stock_feature.stock_a_pe_lg.stock_a_pe_lg (通过 legulegu.com)
   * 数据源: https://legulegu.com/api/stockdata/market-pe
   * @returns A股 PE 历史数据数组，每项含日期、PE值等字段（原始 API 结构）
   * 数据清洗: 直接返回 json.data，未做额外转换
   */
  async stockALgPe(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-pe')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: stock_a_pb_lg (乐咕乐股)
   * 对应 Python: akshare.stock_feature.stock_a_pb_lg.stock_a_pb_lg (通过 legulegu.com)
   * 数据源: https://legulegu.com/api/stockdata/market-pb
   * @returns A股 PB 历史数据数组，每项含日期、PB值等字段（原始 API 结构）
   * 数据清洗: 直接返回 json.data，未做额外转换
   */
  async stockALgPb(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-pb')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: stock_buffett_index_lg (乐咕乐股)
   * 对应 Python: akshare.stock_feature.stock_a_lg_indicator.stock_buffett_index_lg (通过 legulegu.com)
   * 数据源: https://legulegu.com/api/stockdata/market-cap-gdp
   * @returns 巴菲特指标历史数据数组，每项含日期、总市值/GDP比值等字段
   * 数据清洗: 直接返回 json.data，未做额外转换
   */
  async stockBuffettIndex(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://legulegu.com/api/stockdata/market-cap-gdp')
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  // ── 市场总貌 ──

  /**
   * AKShare 接口: stock_sse_summary
   * 对应 Python: akshare.stock.stock_summary.stock_sse_summary
   * 数据源: https://www.sse.com.cn/market/stockdata/statistic/
   * @returns 上交所市场总貌数据，每项含项目(指标名)、股票/主板/科创板(数值)；
   *          指标包括：流通股本、总市值、平均市盈率、上市公司数、上市股票数、流通市值、总股本等
   * 数据清洗: query.sse.com.cn 返回 JSONP 格式，需解析 cb(...) 包装；
   *           Python 版本使用 sqlId=COMMON_SSE_SJ_GPSJ_GPSJZM_TJSJ_L，
   *           此实现使用不同的 sqlId (COMMON_SSE_SCSJ_XXPL_TJSJ_L)
   */
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

  /**
   * AKShare 接口: stock_szse_summary
   * 对应 Python: akshare.stock.stock_summary.stock_szse_summary
   * 数据源: https://www.szse.cn/market/overview/index.html
   * @param date - 交易日期，格式 "YYYYMMDD"；为空则取当天
   * @returns 深交所证券类别统计数据（原始 JSON 格式），含证券类别、数量、成交金额、总市值、流通市值
   * 数据清洗: Python 版本使用 CATALOGID=1803_sczm + Excel 解析，此实现使用
   *           CATALOGID=1110x + JSON 格式（不同的 API 端点）
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
   * 对应 Python: akshare.stock.stock_summary.stock_sse_deal_daily
   * 数据源: https://www.sse.com.cn/market/stockdata/overview/day/
   * @param date - 交易日期，格式 "YYYYMMDD"；为空则取当天
   * @returns 上交所每日股票成交概况，每项含单日情况(指标名)、主板A/主板B/科创板/股票/股票回购(数值)；
   *          指标包括：挂牌数、市价总值、流通市值、成交金额、成交量、平均市盈率、换手率、流通换手率
   * 数据清洗: query.sse.com.cn 返回 JSONP 格式，解析 cb(...) 后取 result 数组；
   *           Python 版本使用 sqlId=COMMON_SSE_SJ_GPSJ_CJGK_MRGK_C，
   *           此实现使用 sqlId=COMMON_SSE_SCSJ_XXPL_MXGK_L
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

  // ── 盈利预测 ──

  /**
   * AKShare 接口: stock_profit_forecast_em
   * 对应 Python: akshare.stock_fundamental.stock_profit_forecast_em.stock_profit_forecast_em
   * 数据源: https://data.eastmoney.com/report/profitforecast.jshtml
   * @param code - 股票代码，如 "000001"
   * @returns 个股盈利预测列表，每项含 SECURITY_CODE、REPORT_DATE、YEAR1~YEAR4 预测每股收益等
   * 数据清洗: reportName=RPT_PUBLIC_OP_NEWPREDICT，按 REPORT_DATE 降序，pageSize=50；
   *           空 code 返回 null；Python 版本使用 RPT_WEB_RESPREDICT 报表(行业级别)，
   *           此实现使用 RPT_PUBLIC_OP_NEWPREDICT 报表(个股级别)
   */
  async profitForecast(code: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_institute_recommend (东方财富版)
   * 对应 Python: akshare.stock_fundamental.stock_recommend.stock_institute_recommend (新浪财经版)
   * 数据源: https://data.eastmoney.com/report/profitforecast.jshtml
   * @returns 机构推荐汇总列表，每项含 RATING_ORG_NUM(评级机构数)、SECURITY_CODE、
   *          SECURITY_NAME_ABBR 等字段
   * 数据清洗: reportName=RPT_CUSTOM_STOCK_RESEARCHLATEST，按 RATING_ORG_NUM 降序，
   *           pageSize=100；Python 版本使用新浪财经接口，此实现使用东方财富数据中心接口
   */
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

  /**
   * AKShare 接口: stock_dxsyl_em (打新收益率)
   * 对应 Python: akshare.stock_feature.stock_dxsyl_em.stock_dxsyl_em
   * 数据源: https://data.eastmoney.com/xg/xg/dxsyl.html
   * @returns 新股申购与中签数据列表，每项含 SECURITY_CODE(股票代码)、ISSUE_PRICE(发行价)、
   *          ONLINE_ISSUE_LWR(网上中签率)、ISSUE_NUM(发行数量)、LD_OPEN_PREMIUM(开盘溢价)、
   *          LD_CLOSE_CHANGE(首日涨幅)、LISTING_DATE(上市日期) 等
   * 数据清洗: reportName=RPTA_APP_IPOAPPLY，按 APPLY_DATE 降序，pageSize=100；
   *           Python 版本支持分页遍历全部数据，此实现仅取第一页
   */
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

  /**
   * AKShare 接口: stock_margin_detail_sse
   * 对应 Python: akshare.stock_feature.stock_margin_sse.stock_margin_detail_sse
   * 数据源: https://www.sse.com.cn/market/othersdata/margin/sum/
   * @param date - 交易日期，格式 "YYYY-MM-DD"；为空则取当天
   * @returns 沪市融资融券明细列表，每项含 SECURITY_CODE(证券代码)、SECURITY_NAME_ABBR(名称)、
   *          RZYE(融资余额)、RQYE(融券余额)、RZMRE(融资买入额) 等
   * 数据清洗: reportName=RPTA_WEB_RZRQ_MX，按 SECURITY_CODE 升序，pageSize=200；
   *           Python 版本使用 sse.com.cn 的专有接口，此实现使用东方财富数据中心接口
   */
  async marginDetailSse(date?: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_fhps_em
   * 对应 Python: akshare.stock_feature.stock_fhps_em.stock_fhps_em
   * 数据源: https://data.eastmoney.com/yjfp/
   * @param code - 股票代码，如 "000001"
   * @returns 分红配送详情列表，每项含 SECURITY_CODE、REPORT_DATE(报告期)、
   *          PLAN_NOTICE_DATE(预案公告日)、EX_DIVIDEND_DATE(除权除息日)、
   *          BONUS_IT_RATIO(送转比例)、PRETAX_BONUS_RMB(现金分红比例) 等
   * 数据清洗: reportName=RPT_SHAREBONUS_DET，按 EX_DIVIDEND_DATE 降序，pageSize=20；
   *           空 code 返回 null；Python 版本按 REPORT_DATE 筛选，此实现按 SECURITY_CODE 筛选
   */
  async dividendDetail(code: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_restricted_release_detail_em
   * 对应 Python: akshare.stock_fundamental.stock_restricted_em.stock_restricted_release_detail_em
   * 数据源: https://data.eastmoney.com/dxf/detail.html
   * @param code - 股票代码（可选），为空则返回全部限售解禁数据
   * @returns 限售解禁列表，每项含 SECURITY_CODE(代码)、SECURITY_NAME_ABBR(名称)、
   *          FREE_DATE(解禁日期)、FREE_NUM(解禁数量)、FREE_MARKET_CAP(解禁市值) 等
   * 数据清洗: reportName=RPT_LIFT_STAGE，按 FREE_DATE 升序，pageSize=100；
   *           Python 版本使用 RPT_LIFTDAY_STA 报表+日期范围筛选+分页，
   *           此实现使用 RPT_LIFT_STAGE 报表，支持可选的股票代码筛选
   */
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

  /**
   * AKShare 接口: stock_repurchase_em
   * 对应 Python: akshare.stock.stock_repurchase_em.stock_repurchase_em
   * 数据源: https://data.eastmoney.com/gphg/hglist.html
   * @returns 股票回购数据列表，每项含 SECURITY_CODE(股票代码)、SECURITYSHORTNAME(简称)、
   *          REPURPRICECAP(回购价格区间)、REPURNUMLOWER/REPURNUMCAP(回购数量区间)、
   *          REPURAMOUNT(已回购金额)、REPURPROGRESS(实施进度) 等
   * 数据清洗: reportName=RPTA_WEB_GETHGLIST_NEW，按 END_DATE 降序，pageSize=100；
   *           Python 版本使用 reportName=RPTA_WEB_GETHGLIST_NEW 但参数略有不同，
   *           且支持分页遍历全部数据
   */
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

  /**
   * AKShare 接口: stock_dzjy_mrmx
   * 对应 Python: akshare.stock.stock_dzjy_em.stock_dzjy_mrmx
   * 数据源: https://data.eastmoney.com/dzjy/dzjy_mrmx.html
   * @param date - 交易日期，格式 "YYYY-MM-DD"；为空则取当天
   * @returns 大宗交易每日明细列表，每项含 TRADE_DATE(交易日期)、SECURITY_CODE(代码)、
   *          SECURITY_NAME_ABBR(名称)、CHANGE_RATE(涨跌幅)、CLOSE_PRICE(收盘价)、
   *          DEAL_PRICE(成交价)、DEAL_VOLUME(成交量)、DEAL_AMT(成交额)、
   *          PREMIUM_RATIO(溢价率) 等
   * 数据清洗: reportName=RPT_DATA_BLOCKTRADE_DETAIL，按 SECURITY_CODE 升序，pageSize=200；
   *           Python 版本使用 reportName=RPT_DATA_BLOCKTRADE + symbol 筛选(A股/B股/基金/债券)，
   *           此实现使用 RPT_DATA_BLOCKTRADE_DETAIL 且不区分标的类型
   */
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

  /**
   * AKShare 接口: stock_zh_a_gbjg_em
   * 对应 Python: akshare.stock_fundamental.stock_gbjg_em.stock_zh_a_gbjg_em
   * 数据源: https://emweb.securities.eastmoney.com/pc_hsf10/pages/index.html#/gbjg
   * @param code - 股票代码，如 "603392.SH"
   * @returns 股本结构列表，每项含 END_DATE(变更日期)、TOTAL_SHARES(总股本)、
   *          LISTED_A_SHARES(已上市流通A股)、FREE_SHARES(已流通股份)、
   *          LIMITED_A_SHARES(流通受限股份)、CHANGE_REASON(变动原因) 等
   * 数据清洗: reportName=RPT_F10_EH_EQUITY，按 END_DATE 降序，pageSize=5；
   *           空 code 返回 null；source=WEB/client=WEB（Python 版本用 HSF10/PC）
   */
  async shareStructure(code: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_szse_sector_summary
   * 对应 Python: akshare.stock.stock_summary.stock_szse_sector_summary
   * 数据源: https://www.szse.cn/market/periodical/month/index.html
   * @returns 深交所行业成交数据（原始 JSON 格式），含行业名称、成交金额、成交股数等
   * 数据清洗: 使用 www.szse.cn/api/report/ShowReport/data?CATALOGID=1110x&TABKEY=tab2 获取 JSON；
   *           Python 版本通过 HTML 解析获取 Excel 文件再解析，此实现直接使用 JSON 端点
   */
  async szseSectorSummary(): Promise<Record<string, unknown>[] | null> {
    const json = await httpGet('https://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1110x&TABKEY=tab2&PAGENO=1', {
      random: String(Math.random()),
    })
    if (!json?.data) return null
    return json.data as Record<string, unknown>[]
  }

  /**
   * AKShare 接口: stock_margin_detail_szse
   * 对应 Python: akshare.stock_feature.stock_margin_szse.stock_margin_detail_szse
   * 数据源: https://www.szse.cn/disclosure/margin/object/index.html
   * @param date - 交易日期，格式 "YYYY-MM-DD"；为空则取当天
   * @returns 深市融资融券明细列表，每项含 SECURITY_CODE(证券代码)、SECURITY_NAME_ABBR(名称)、
   *          RZYE(融资余额)、RQYE(融券余额) 等
   * 数据清洗: reportName=RPTA_WEB_RZRQ_MX_SZA，按 SECURITY_CODE 升序，pageSize=200；
   *           Python 版本使用 szse.cn 专有接口(CATALOGID=1837_xxpl)，此实现使用东方财富数据中心接口
   */
  async marginDetailSzse(date?: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_tfp_em
   * 对应 Python: akshare.stock_feature.stock_tfp_em.stock_tfp_em
   * 数据源: https://data.eastmoney.com/tfpxx/
   * @returns 停复牌信息列表，每项含 SECURITY_CODE(代码)、SECURITY_NAME_ABBR(名称)、
   *          SUSPEND_START_DATE(停牌开始日期)、SUSPEND_END_DATE(停牌截止日期)、
   *          SUSPEND_TYPE(停牌期限)、SUSPEND_REASON(停牌原因)、MARKET(所属市场)、
   *          RESUMP_TRADE_DATE(预计复牌时间) 等
   * 数据清洗: reportName=RPT_DATA_SCHEDULEDTASK（与 Python 版本的
   *           RPT_CUSTOM_SUSPEND_DATA_INTERFACE 不同），按 SUSPEND_START_DATE 降序，pageSize=200
   */
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

  /**
   * AKShare 接口: stock_sy_profile_em
   * 对应 Python: akshare.stock_feature.stock_sy_em.stock_sy_profile_em
   * 数据源: https://data.eastmoney.com/sy/scgk.html
   * @returns A股商誉市场概况列表，每项含 REPORT_DATE(报告期)、TOTAL_GOODWILL(商誉)、
   *          GOODWILL_IMPAIRMENT(商誉减值)、NET_ASSETS(净资产)、
   *          GOODWILL_NET_ASSETS_RATIO(商誉占净资产比例)、
   *          IMPAIRMENT_NET_ASSETS_RATIO(商誉减值占净资产比例)、
   *          NET_PROFIT(净利润规模)、IMPAIRMENT_NET_PROFIT_RATIO(商誉减值占净利润比例) 等
   * 数据清洗: reportName=RPT_GOODWILL_OVERVIEW，按 GOODWILL_MARKET_CAP 降序，pageSize=500；
   *           Python 版本使用 reportName=RPT_GOODWILL_MARKETSTATISTICS + 特定筛选条件
   */
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

  /**
   * AKShare 接口: stock_sy_detail_em
   * 对应 Python: akshare.stock_feature.stock_sy_em.stock_sy_detail_em
   * 数据源: https://data.eastmoney.com/sy/list.html
   * @param code - 股票代码，如 "000001"
   * @returns 个股商誉明细列表，每项含 SECURITY_CODE、REPORT_DATE(报告期)、
   *          GOODWILL(商誉)、IMPAIRMENT(减值)、ACQ_PRICE(收购对价) 等
   * 数据清洗: reportName=RPT_GOODWORTH_DET，按 REPORT_DATE 降序，pageSize=50；
   *           空 code 返回 null
   */
  async goodwillDetail(code: string): Promise<Record<string,unknown>[] | null> {
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

  /**
   * AKShare 接口: stock_account_statistics_em
   * 对应 Python: akshare.stock_feature.stock_account_em.stock_account_statistics_em
   * 数据源: https://data.eastmoney.com/cjsj/gpkhsj.html
   * @returns 股票账户统计数据列表，每项含 STATISTICS_DATE(数据日期)、
   *          NEW_INVESTOR_NUM(新增投资者数量)、NEW_INVESTOR_RATIO_MOM(环比)、
   *          NEW_INVESTOR_RATIO_YOY(同比)、TOTAL_INVESTOR_NUM(期末投资者总量)、
   *          A_STOCK_ACCOUNT(A股账户)、B_STOCK_ACCOUNT(B股账户) 等
   * 数据清洗: reportName=RPT_ACCOUNT_STATISTICS（与 Python 版本的 RPT_STOCK_OPEN_DATA 不同），
   *           按 STATISTICS_DATE 降序，pageSize=50
   */
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

  /**
   * AKShare 接口: stock_zh_a_st_em
   * 对应 Python: akshare.stock.stock_zh_a_special.stock_zh_a_st_em
   * 数据源: https://quote.eastmoney.com/center/gridlist.html#st_board
   * @returns 风险警示板（ST 股票）列表，每项含 SECURITY_CODE(代码)、
   *          SECURITY_NAME_ABBR(名称)、CHANGE_RATE(涨跌幅)、CLOSE(最新价) 等
   * 数据清洗: reportName=RPT_RISK_WARNING，按 SECURITY_CODE 升序，pageSize=200；
   *           Python 版本使用 push2.eastmoney.com 行情接口 + 分页，
   *           此实现使用东方财富数据中心接口
   */
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

  /**
   * AKShare 接口: stock_dlist_em (两网及退市)
   * 对应 Python: 无直接对应（AKShare 中未找到完全匹配的函数）
   * 数据源: https://data.eastmoney.com/dxf/detail.html
   * @returns 两网及退市股票列表，每项含 SECURITY_CODE(代码)、SECURITY_NAME_ABBR(名称) 等
   * 数据清洗: reportName=RPT_DLIST_DELISTING，按 SECURITY_CODE 升序，pageSize=200
   */
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

  /**
   * AKShare 接口: stock_dzjy_sctj
   * 对应 Python: akshare.stock.stock_dzjy_em.stock_dzjy_sctj
   * 数据源: https://data.eastmoney.com/dzjy/dzjy_sctj.html
   * @returns 大宗交易市场统计列表，每项含 TRADE_DATE(交易日期)、
   *          SZ_INDEX(上证指数)、SZ_CHANGE_RATE(上证指数涨跌幅)、
   *          BLOCKTRADE_DEAL_AMT(大宗交易成交总额)、
   *          PREMIUM_DEAL_AMT(溢价成交总额)、PREMIUM_RATIO(溢价占比)、
   *          DISCOUNT_DEAL_AMT(折价成交总额)、DISCOUNT_RATIO(折价占比) 等
   * 数据清洗: reportName=RPT_DATA_BLOCKTRADE_MARKET（与 Python 版本的
   *           PRT_BLOCKTRADE_MARKET_STA 不同），按 TRADE_DATE 降序，pageSize=100
   */
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

  /**
   * AKShare 接口: stock_gdfx_free_holding_statistics_em (股东变动)
   * 对应 Python: akshare.stock_feature.stock_gdfx_em.stock_gdfx_free_holding_statistics_em
   * 数据源: https://data.eastmoney.com/gdfx/HoldingAnalyse.html
   * @returns 股东变动统计列表，每项含 SECURITY_CODE、HOLDER_NAME(股东名称)、
   *          HOLDER_TYPE(股东类型)、STATISTICS_TIMES(统计次数)、
   *          10/30/60 交易日后涨幅统计(平均/最大/最小) 等
   * 数据清洗: reportName=RPT_F10_EH_FREEHOLDERS，按 HOLDNUM_CHANGE_RATE 降序，pageSize=100；
   *           Python 版本使用 reportName=RPT_COOPFREEHOLDERS_ANALYSIS + 日期筛选
   */
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

  // ── 申万指数分类 ──

  /**
   * AKShare 接口: sw_index_first_info
   * 对应 Python: akshare.index.index_sw.sw_index_first_info
   * 数据源: https://legulegu.com/stockdata/sw-industry-overview
   * @returns 申万一级行业分类列表，每项含 industryCode(行业代码)、industryName(行业名称)、
   *          constituentCount(成份个数)、staticPe(静态市盈率)、ttmPe(TTM市盈率)、
   *          pb(市净率)、dividendYield(静态股息率)
   * 数据清洗: 从 legulegu.com HTML 页面解析，提取 id="level1Items" 区块内的
   *           lg-industries-item-chinese-title(代码)、lg-industries-item-number(名称+个数)、
   *           value(PE/PB/股息率)；Python 版本使用 BeautifulSoup，此实现使用正则表达式
   */
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

  /**
   * AKShare 接口: sw_index_second_info
   * 对应 Python: akshare.index.index_sw.sw_index_second_info
   * 数据源: https://legulegu.com/stockdata/sw-industry-overview
   * @returns 申万二级行业分类列表，每项含 industryCode(行业代码)、industryName(行业名称)、
   *          parentIndustry(上级行业)、staticPe(静态市盈率)、ttmPe(TTM市盈率)、
   *          pb(市净率)、dividendYield(静态股息率)
   * 数据清洗: 从 legulegu.com HTML 页面解析，提取 id="level2Items" 区块；
   *           Python 版本使用 BeautifulSoup，此实现使用正则表达式
   */
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

  /**
   * AKShare 接口: sw_index_third_info
   * 对应 Python: akshare.index.index_sw.sw_index_third_info
   * 数据源: https://legulegu.com/stockdata/sw-industry-overview
   * @returns 申万三级行业分类列表，每项含 industryCode(行业代码)、industryName(行业名称)、
   *          parentIndustry(上级行业)、staticPe(静态市盈率)、ttmPe(TTM市盈率)、
   *          pb(市净率)、dividendYield(静态股息率)
   * 数据清洗: 从 legulegu.com HTML 页面解析，提取 id="level3Items" 区块；
   *           Python 版本使用 BeautifulSoup，此实现使用正则表达式
   */
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

  /**
   * AKShare 接口: sw_index_third_cons
   * 对应 Python: akshare.index.index_sw.sw_index_third_cons
   * 数据源: https://legulegu.com/stockdata/index-composition
   * @param symbol - 申万三级行业代码，格式 "801120.SI"，默认 "801120.SI"
   * @returns 申万三级行业成份股列表，每项含 rank(排名)、stockCode(股票代码)、
   *          stockName(股票名称)、inclusionDate(纳入日期)、swLevel1/2/3(行业分类)、
   *          price(价格)、pe(市盈率)、peTtm(TTM市盈率)、pb(市净率)
   * 数据清洗: 从 legulegu.com HTML 表格解析，提取 <tr>/<td> 元素；
   *           Python 版本使用 BeautifulSoup，此实现使用正则表达式
   */
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

  /**
   * AKShare 接口: index_analysis_week_month_sw
   * 对应 Python: akshare.index.index_research_sw.index_analysis_week_month_sw
   * 数据源: https://www.swsresearch.com/institute-sw/api/index_analysis/week_month_datetime/
   * @param type - 报表类型，"month"(月报) 或 "week"(周报)，默认 "month"
   * @returns 申万指数分析日期序列，每项含 date(报表日期，格式 "YYYY-MM-DD")
   * 数据清洗: 从 swsresearch.com API 获取 JSON，映射 bargaindate→date，
   *           截取前10位日期字符
   */
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

  /**
   * AKShare 接口: index_realtime_fund_sw
   * 对应 Python: akshare.index.index_research_fund_sw.index_realtime_fund_sw
   * 数据源: https://www.swsresearch.com/insWechatSw/fundIndex/pageList
   * @param symbol - 基金指数类型，"基础一级"/"基础二级"/"基础三级"/"特色指数"，默认 "基础一级"
   * @returns 申万基金指数实时行情列表，每项含 code(指数代码)、name(指数名称)、
   *          prevClose(昨收盘)、changePct(日涨跌幅)、yearChangePct(年涨跌幅)
   * 数据清洗: POST 请求 fundIndex/pageList，映射 swIndexCode→code、swIndexName→name、
   *           lastCloseIndex→prevClose、lastMarkup→changePct、yearMarkup→yearChangePct；
   *           字段通过 safeFloat 转为数值
   */
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

  /**
   * AKShare 接口: index_hist_fund_sw
   * 对应 Python: akshare.index.index_research_fund_sw.index_hist_fund_sw
   * 数据源: https://www.swsresearch.com/insWechatSw/fundIndex/getFundKChartData
   * @param symbol - 基金指数代码，默认 "807200"
   * @param period - 周期，"day"/"week"/"month"，默认 "day"
   * @returns 申万基金指数历史行情列表，每项含 date(日期)、close(收盘)、open(开盘)、
   *          high(最高)、low(最低)、changePct(涨跌幅)
   * 数据清洗: POST 请求 getFundKChartData，映射 bargaindate→date、closeindex→close、
   *           openindex→open、maxindex→high、minindex→low、markup→changePct
   */
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
   * AKShare: bond_spot_quote
   * ChinaMoney interbank bond market maker quotes.
   * Data: https://www.chinamoney.com.cn/chinese/mkdatabond/
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
   * AKShare: bond_spot_deal
   * ChinaMoney interbank bond spot market deals.
   * Data: https://www.chinamoney.com.cn/chinese/mkdatabond/
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
   * AKShare: bond_info_cm
   * ChinaMoney bond information query.
   * Data: https://www.chinamoney.com.cn/chinese/scsjzqxx/
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
   * AKShare: bond_china_yield
   * ChinaBond yield curve data.
   * Data: https://yield.chinabond.com.cn/
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
   * AKShare: bond_zh_hs_spot
   * Sina bond spot realtime quotes (SSE/SZSE).
   * Data: https://vip.stock.finance.sina.com.cn/mkt/#hs_z
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
   * AKShare: bond_zh_hs_daily
   * Sina bond daily historical data.
   * Data: https://money.finance.sina.com.cn/bond/quotes/
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
   * AKShare: bond_zh_hs_cov_spot
   * Sina convertible bond realtime quotes.
   * Data: https://vip.stock.finance.sina.com.cn/mkt/#hskzz_z
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
   * AKShare: bond_zh_hs_cov_daily
   * Sina convertible bond daily historical data.
   * Data: https://money.finance.sina.com.cn/bond/quotes/
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
   * AKShare: bond_zh_cov
   * EastMoney convertible bond list.
   * Data: https://data.eastmoney.com/kzz/default.html
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
   * AKShare: bond_cov_comparison
   * EastMoney convertible bond comparison table.
   * Data: https://quote.eastmoney.com/center/fullscreenlist.html#convertible_comparison
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
   * AKShare: bond_zh_cov_value_analysis
   * EastMoney convertible bond value analysis.
   * Data: https://data.eastmoney.com/kzz/detail/
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
   * AKShare: bond_cb_profile_sina
   * Sina convertible bond profile details.
   * Data: https://money.finance.sina.com.cn/bond/info/
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
   * AKShare: bond_cb_summary_sina
   * Sina convertible bond summary.
   * Data: https://money.finance.sina.com.cn/bond/quotes/
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
   * AKShare: bond_debt_nafmii
   * NAFMII interbank bond issuance data.
   * Data: http://zhuce.nafmii.org.cn/fans/publicQuery/manager
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
   * AKShare: bond_buy_back_hist_em
   * EastMoney bond buy-back historical data.
   * Data: https://data.eastmoney.com/
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
   * AKShare: bond_zh_us_rate
   * China and US bond yield comparison.
   * Data: https://data.eastmoney.com/
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
        cn1Y: safeFloat(it.CHINA_1Y),
        cn10Y: safeFloat(it.CHINA_10Y),
        us1Y: safeFloat(it.US_1Y),
        us10Y: safeFloat(it.US_10Y),
        spread10Y: safeFloat(it.SPREAD_10Y),
        source: 'EastMoney',
      }))
    } catch { return null }
  }
}
