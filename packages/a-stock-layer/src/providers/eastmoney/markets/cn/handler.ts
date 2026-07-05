import { Capability } from '../../../../core/capabilities.js'
import type {
  Dividend, DragonTiger, FinancialSummary, LimitUpDown, MoneyFlow,
  NewsItem, SectorMoneyFlow, StockKline, StockListItem, StockProfile,
  StockRealtime, SentimentData,
} from '../../../../core/schema.js'
import { EASTMONEY_QUOTE_HEADERS, eastmoneyGet } from '../../api/client.js'
import {
  normalizeChangePct, normalizeCode, normalizeKlineDateTime, normalizePrice, resolveMarket, resolveSecId, resolveStockSecId, safeFloat,
  type StockMarket,
} from '../../../../utils/helpers.js'
import { computeChipDistribution, computeLatestChipProfile } from '../../../../utils/cyq.js'
import {
  attachApiPreCloseToLatestSession,
  groupTrendsIntoSessions,
  type IntradayTrendFetchResult,
} from '../../../../utils/intraday-trends.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import {
  fetchDataCenterReport,
  fetchDragonTigerDetails,
  fetchF10Dividends,
  fetchF10Financials,
  fetchF10Profile,
  fetchF10Shareholders,
  fetchNorthMoneyFlowSnapshot,
  fetchTradeCalendar,
} from '../../api/f10.js'

const BASE_URL = 'https://push2.eastmoney.com/api/qt/stock/get'
const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const TRENDS2_URL = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'
const LIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const FLOW_URL = 'https://push2.eastmoney.com/api/qt/stock/fflow/day/get'
const SECTOR_FLOW_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const PERIOD_MAP: Record<string, string> = {
  daily: '101', weekly: '102', monthly: '103', '60m': '60', '30m': '30', '15m': '15', '5m': '5', '1m': '1',
}

/**
 * 将东财 push2 原始价格字段（×100）还原为实际价格
 * 数据源: push2 qt/stock/get（f43/f44/f45/f46 等字段在部分版本下 ×100 存储）
 * @param v - 东财原始字段值
 * @returns 还原后的价格，或 null
 */
function emQuotePrice(v: unknown): number | null {
  const f = safeFloat(v)
  return f == null ? null : f / 100
}

/**
 * 将东财涨跌额字段还原为实际值
 * 数据源: push2 qt/stock/get（f169 涨跌额，绝对值 >50 时需 /100 还原）
 * @param v - 东财原始涨跌额字段
 * @returns 还原后的涨跌额，或 null
 */
function emQuoteDelta(v: unknown): number | null {
  const f = safeFloat(v)
  if (f == null) return null
  return Math.abs(f) > 50 ? f / 100 : f
}

export class EastMoneyMarketHandler extends MarketHandlerShell {

  /**
   * 通用东财 push2 数据获取
   * 数据源: push2.eastmoney.com（15s 超时）
   * @param url - 东财 API 地址
   * @param params - 请求参数
   * @returns data 字段对象，或 null
   */
  protected async getData(url: string, params: Record<string, string>) {
    const json = await eastmoneyGet(url, params, 15000, EASTMONEY_QUOTE_HEADERS)
    return (json?.data as Record<string, unknown>) ?? null
  }

  /**
   * 东财 datacenter 报表数据获取
   * 数据源: datacenter.eastmoney.com/securities/api/data/v1/get
   * @param reportName - 报表名称（如 RPT_F10_FINANCE_MAINFINADATA）
   * @param columns - 返回字段列表
   * @param filter - 筛选条件
   * @param pageSize - 每页条数，默认 '20'
   * @returns 记录数组
   */
  protected async dcFetch(reportName: string, columns: string, filter: string, pageSize = '20') {
    return fetchDataCenterReport(reportName, filter, pageSize, 'REPORT_DATE', columns)
  }

  /**
   * 获取单只股票实时行情
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_spot_em（单股查询）
   * 数据源: push2.eastmoney.com/api/qt/stock/get
   * @param code - 6位股票代码
   * @param market - 可选市场标识（'SH' | 'SZ' | 'BJ'），未传时自动推断
   * @returns 包含 price/open/high/low/preClose/volume/amount/change/changePct/pe/pb/turnoverRate/marketCap/volumeRatio 的 StockRealtime 数组（单元素），或 null
   * 数据清洗: f43/f44/f45/f46/f46 等字段在部分 API 版本下 ×100 存储，通过 emQuotePrice/emQuoteDelta 还原；成交额 >1e6 时保留，否则置 null
   */
  async realtime(code: string, market?: StockMarket) {
    try {
      const data = await this.getData(BASE_URL, {
        secid: resolveStockSecId(code, market),
        fields: 'f43,f44,f45,f46,f47,f48,f50,f51,f57,f58,f116,f115,f170,f162,f167,f168,f169,f60,f71',
        fltt: '2',
        invt: '2',
      })
      if (!data) return null
      const amount = safeFloat(data.f48)
      const volume = safeFloat(data.f51)
      const price = safeFloat(data.f43)
      const preClose = safeFloat(data.f60) ?? emQuotePrice(data.f47)
      return [{
        code: normalizeCode(code),
        name: String(data.f58 ?? ''),
        price,
        open: safeFloat(data.f44) ?? emQuotePrice(data.f44),
        high: safeFloat(data.f45) ?? emQuotePrice(data.f45),
        low: safeFloat(data.f46) ?? emQuotePrice(data.f46),
        preClose,
        volume,
        amount: amount != null && amount > 1e6 ? amount : null,
        change: emQuoteDelta(data.f169),
        changePct: normalizeChangePct(data.f170),
        pe: safeFloat(data.f162),
        pb: safeFloat(data.f167),
        turnoverRate: safeFloat(data.f168),
        marketCap: safeFloat(data.f116),
        volumeRatio: safeFloat(data.f50),
      }]
    } catch { return null }
  }

  /**
   * 批量获取多只股票实时行情（串行调用 realtime）
   * 数据源: push2.eastmoney.com/api/qt/stock/get（逐个请求）
   * @param codes - 股票代码数组
   * @param markets - 可选的 code→market 映射
   * @returns StockRealtime 数组，全部失败时返回 null
   */
  async batchRealtime(codes: string[], markets?: Record<string, StockMarket | undefined>) {
    const results: StockRealtime[] = []
    for (const c of codes) {
      const normalized = normalizeCode(c)
      const r = await this.realtime(c, markets?.[normalized])
      if (r) results.push(...r)
    }
    return results.length ? results : null
  }

  /**
   * 获取指数实时行情
   * 数据源: push2.eastmoney.com/api/qt/stock/get（复用 realtime 方法）
   * @param code - 指数代码（如 '000001' 上证指数、'399001' 深证成指）
   * @returns StockRealtime 数组，或 null
   * 数据清洗: 根据代码前缀自动推断市场（399开头→SZ，其余→SH）
   */
  async indexRealtime(code: string) {
    const c = normalizeCode(code)
    const market: StockMarket = c.startsWith('399') ? 'SZ' : 'SH'
    return this.realtime(code, market)
  }

  /**
   * 解析东财 K 线 CSV 字符串数组为 StockKline 对象
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_hist 的 klines 解析逻辑
   * 数据源: push2his.eastmoney.com/api/qt/stock/kline/get（返回的逗号分隔字符串）
   * @param klines - K 线 CSV 字符串数组，每行格式: "日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率"
   * @param code - 股票代码
   * @returns StockKline 数组，跳过字段数不足 7 的行
   * 数据清洗: 日期通过 normalizeKlineDateTime 标准化；字段按位置映射到 StockKline 属性
   */
  private parseKlines(klines: string[], code: string): StockKline[] {
    const rows: StockKline[] = []
    for (const line of klines) {
      const p = line.split(',')
      if (p.length < 7) continue
      rows.push({
        code: normalizeCode(code), date: normalizeKlineDateTime(p[0]),
        open: Number(p[1]), close: Number(p[2]), high: Number(p[3]), low: Number(p[4]),
        volume: Number(p[5]), amount: Number(p[6]),
        changePct: p[8] != null ? Number(p[8]) : null,
        turnoverRate: p[10] != null ? Number(p[10]) : null,
      })
    }
    return rows
  }

  /**
   * 解析东财 trends2 分时 K 线数据
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_hist_min_em（period="1" 分支）
   * 数据源: push2his.eastmoney.com/api/qt/stock/trends2/get
   * @param trends - trends2 返回的逗号分隔字符串数组，格式: "时间,开盘,收盘,最高,最低,成交量,成交额,..."
   * @param code - 股票代码
   * @returns StockKline 数组（changePct/turnoverRate 均为 null，因 trends2 不提供）
   * 数据清洗: 跳过 09:30 竞价快照行（非标准 1 分钟 K 线）；p[5] 为分笔量而非累计量
   */
  private parseTrend2Klines(trends: string[], code: string): StockKline[] {
    const rows: StockKline[] = []
    for (const line of trends) {
      const p = line.split(',')
      if (p.length < 7) continue
      const date = normalizeKlineDateTime(p[0])
      if (date.includes(' 09:30')) continue
      rows.push({
        code: normalizeCode(code), date,
        open: Number(p[1]), close: Number(p[2]), high: Number(p[3]), low: Number(p[4]),
        volume: Number(p[5]), amount: Number(p[6]),
        changePct: null,
        turnoverRate: null,
      })
    }
    return rows
  }

  /**
   * 获取分时交易时段数据（最多 5 个交易日）
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_hist_min_em（period="1" + session 分组）
   * 数据源: push2his.eastmoney.com/api/qt/stock/trends2/get
   * @param code - 股票代码
   * @param ndays - 获取天数，1–5，默认 5
   * @param market - 可选市场标识
   * @returns IntradayTrendFetchResult（含 sessions 数组和 apiPreClose），或 null
   * 数据清洗: 将 trends2 原始分时数据按交易日分组为 session；附加 API 返回的昨收价
   */
  async fetchIntradaySessions(
    code: string,
    ndays = 5,
    market?: StockMarket,
  ): Promise<IntradayTrendFetchResult | null> {
    try {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const data = await this.getData(TRENDS2_URL, {
        secid: resolveStockSecId(code, market),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        iscr: '0',
        ndays: String(safeDays),
        iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      const apiPreClose = safeFloat(data?.preClose) ?? safeFloat(data?.prePrice)
      const sessions = groupTrendsIntoSessions(trends)
      attachApiPreCloseToLatestSession(sessions, apiPreClose)
      return sessions.length ? { sessions, apiPreClose } : null
    } catch { return null }
  }

  /**
   * 获取多日 1 分钟 K 线（trends2 API，kline API 仅返回最近一个交易日）
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_hist_min_em（period="1" 分支）
   * 数据源: push2his.eastmoney.com/api/qt/stock/trends2/get
   * @param code - 股票代码
   * @param ndays - 获取天数，1–5，默认 1
   * @param count - 最多返回条数，0 表示不限
   * @param market - 可选市场标识
   * @returns StockKline 数组，或 null
   * 数据清洗: 过滤 09:30 竞价快照行；可选截取最后 count 条
   */
  async minuteTrendKline(code: string, ndays = 1, count = 0, market?: StockMarket) {
    try {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const data = await this.getData(TRENDS2_URL, {
        secid: resolveStockSecId(code, market),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        iscr: '0',
        ndays: String(safeDays),
        iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      let rows = this.parseTrend2Klines(trends, code)
      if (count > 0 && rows.length > count) rows = rows.slice(-count)
      return rows
    } catch { return null }
  }

  /**
   * 获取股票 K 线历史数据
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_hist
   * 数据源: push2his.eastmoney.com/api/qt/stock/kline/get
   * @param code - 股票代码
   * @param period - K 线周期: 'daily' | 'weekly' | 'monthly' | '60m' | '30m' | '15m' | '5m' | '1m'，默认 'daily'
   * @param start - 开始日期（YYYY-MM-DD），默认 '19000101'
   * @param end - 结束日期（YYYY-MM-DD），默认 '20500101'
   * @param count - 最多返回条数，0 表示不限，默认 1000
   * @param market - 可选市场标识
   * @returns StockKline 数组，或 null
   * 数据清洗: 前复权模式（fqt=1）；日期去除连字符后传入 API；超过 count 条时截取最近数据
   */
  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count = 1000,
    market?: StockMarket,
  ) {
    try {
      const params: Record<string, string> = {
        secid: resolveStockSecId(code, market),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: PERIOD_MAP[period] ?? '101',
        fqt: '1',
        rtntype: '6',
        beg: start ? start.replace(/-/g, '') : '19000101',
        end: end ? end.replace(/-/g, '') : '20500101',
      }
      const data = await this.getData(KLINE_URL, params)
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      let rows = this.parseKlines(klines, code)
      if (count > 0 && rows.length > count) rows = rows.slice(-count)
      return rows
    } catch { return null }
  }

  /**
   * 获取指数 K 线历史数据（委托给 kline 方法）
   * 数据源: push2his.eastmoney.com/api/qt/stock/kline/get
   * @param code - 指数代码
   * @param period - K 线周期，默认 'daily'
   * @param start - 开始日期
   * @param end - 结束日期
   * @returns StockKline 数组，或 null
   */
  async indexKline(code: string, period = 'daily', start = '', end = '') {
    return this.kline(code, period, start, end)
  }

  /**
   * CYQ 筹码分布计算
   * 对应 Python: akshare.stock_feature.stock_cyq_em.stock_cyq_em
   * 数据源: push2his.eastmoney.com/api/qt/stock/kline/get（210 日日 K + 换手率）
   * @param code - 股票代码
   * @param adjust - 复权方式: ''(不复权) | 'qfq'(前复权) | 'hfq'(后复权)，默认 ''
   * @returns ChipDistribution 数组（获利比例/平均成本/90%/70% 集中度），或 null
   * 数据清洗: 获取最近 210 个交易日 K 线，通过 computeChipDistribution 算法（换手率衰减模型）计算筹码分布
   */
  async chipDistribution(code: string, adjust: '' | 'qfq' | 'hfq' = '') {
    try {
      const adjustMap: Record<string, string> = { qfq: '1', hfq: '2', '': '0' }
      const end = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const data = await this.getData(KLINE_URL, {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101',
        fqt: adjustMap[adjust] ?? '0',
        end,
        lmt: '210',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      const rows = this.parseKlines(klines, code)
      const cyq = computeChipDistribution(normalizeCode(code), rows, 90)
      return cyq.length ? cyq : null
    } catch { return null }
  }

  /**
   * CYQ 筹码分布完整画像（含价格-权重曲线）
   * 对应 Python: akshare.stock_feature.stock_cyq_em.stock_cyq_em
   * 数据源: push2his.eastmoney.com/api/qt/stock/kline/get（210 日日 K + 换手率）
   * @param code - 股票代码
   * @param adjust - 复权方式: ''(不复权) | 'qfq'(前复权) | 'hfq'(后复权)，默认 ''
   * @returns ChipDistributionProfile 数组（含 currentPrice 和 levels 价格权重曲线），或 null
   * 数据清洗: 获取最近 210 个交易日 K 线，通过 computeLatestChipProfile 计算完整筹码画像
   */
  async chipProfile(code: string, adjust: '' | 'qfq' | 'hfq' = '') {
    try {
      const adjustMap: Record<string, string> = { qfq: '1', hfq: '2', '': '0' }
      const end = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const data = await this.getData(KLINE_URL, {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101',
        fqt: adjustMap[adjust] ?? '0',
        end,
        lmt: '210',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      const rows = this.parseKlines(klines, code)
      const profile = computeLatestChipProfile(normalizeCode(code), rows)
      return profile ? [profile] : null
    } catch { return null }
  }

  /**
   * 获取个股资金流向（近 10 日）
   * 对应 Python: akshare 东方财富资金流向数据
   * 数据源: push2.eastmoney.com/api/qt/stock/fflow/day/get
   * @param code - 股票代码
   * @returns MoneyFlow 数组（含主力/超大单/大单/中单/小单净额及主力净额占比），或 null
   * 数据清洗: 逗号分隔 CSV 解析，取最近 10 条；p[1]–p[5] 为各类净额，p[6] 为主力净额占比，p[10]–p[11] 为涨跌幅和收盘价
   */
  async moneyFlow(code: string) {
    try {
      const data = await this.getData(FLOW_URL, {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      const results: MoneyFlow[] = []
      for (const line of klines.slice(-10)) {
        const p = line.split(',')
        if (p.length < 12) continue
        results.push({
          code: normalizeCode(code), date: p[0],
          mainNet: safeFloat(p[1]), superLargeNet: safeFloat(p[2]),
          largeNet: safeFloat(p[3]), mediumNet: safeFloat(p[4]), smallNet: safeFloat(p[5]),
          mainNetPct: safeFloat(p[6]), close: safeFloat(p[11]), changePct: safeFloat(p[10]),
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * 获取公司财务摘要数据
   * 数据源: 东财 F10 财务数据接口（通过 fetchF10Financials）
   * @param code - 股票代码
   * @param _reportDate - 报告期（预留，当前未使用过滤）
   * @param reportType - 报告类型: 'annual' | 'quarter' | 'all'，默认 'annual'
   * @returns FinancialSummary 数组，或 null
   * 数据清洗: 由 fetchF10Financials 统一处理数据映射和清洗
   */
  async financials(code: string, _reportDate = '', reportType: 'annual' | 'quarter' | 'all' = 'annual') {
    try {
      const rows = await fetchF10Financials(code, reportType)
      return rows?.length ? rows : null
    } catch { return null }
  }

  /**
   * 获取公司基本面资料
   * 对应 Python: akshare.stock.stock_profile_em（东财 F10 公司概况）
   * 数据源: push2.eastmoney.com/api/qt/stock/get（市值/行业）+ 东财 F10 profile 接口
   * @param code - 股票代码
   * @returns StockProfile 数组，或 null
   * 数据清洗: 优先使用 F10 profile 详细数据；若 F10 无数据则从 push2 返回的 f58(名称)/f84(行业)/f116(总市值)/f117(流通市值) 构建基础 profile；行业字段以数字开头时置空
   */
  async profile(code: string) {
    try {
      const c = normalizeCode(code)
      const data1 = await this.getData(BASE_URL, {
        secid: resolveSecId(code),
        fields: 'f58,f84,f85,f116,f117',
      })
      const marketCap = safeFloat(data1?.f116)
      const circulating = safeFloat(data1?.f117)
      const f10 = await fetchF10Profile(c, marketCap, circulating)
      if (f10?.length) return f10

      if (!data1) return null
      let industry = String(data1.f84 ?? data1.f85 ?? '')
      if (/^\d/.test(industry)) industry = ''
      return [{
        code: c,
        name: String(data1.f58 ?? ''),
        industry,
        totalMarketCap: marketCap,
        circulatingMarketCap: circulating,
      } satisfies StockProfile]
    } catch { return null }
  }

  /**
   * 获取个股公告列表
   * 数据源: np-anotice-stock.eastmoney.com/api/security/ann
   * @param code - 股票代码
   * @param page - 页码，默认 1
   * @param pageSize - 每页条数，默认 20
   * @returns NewsItem 数组（含 title/date/url/type='announcement'），或 null
   * 数据清洗: 解析 data.list 数组；url 基于 art_code 拼接东财公告详情页地址；date 截取前 10 位
   */
  async news(code: string, page = 1, pageSize = 20) {
    try {
      const c = normalizeCode(code)
      const json = await eastmoneyGet('https://np-anotice-stock.eastmoney.com/api/security/ann', {
        sr: '-1', page_size: String(pageSize), page_index: String(page),
        ann_type: 'A', client_source: 'web', stock_list: c,
      }, 15000, EASTMONEY_QUOTE_HEADERS)
      const list = (json?.data as { list?: Record<string, unknown>[] })?.list ?? []
      if (!list.length) return null
      return list.map(it => ({
        code: c,
        title: String(it.title ?? ''),
        date: String(it.notice_date ?? it.display_time ?? '').slice(0, 10),
        url: String(it.art_code ? `https://data.eastmoney.com/notices/detail/${c}/${it.art_code}.html` : ''),
        type: 'announcement',
      } satisfies NewsItem))
    } catch { return null }
  }

  /**
   * 基于公告标题生成简易情绪摘要
   * 数据源: 复用 news 方法获取最近 5 条公告
   * @param code - 股票代码
   * @returns SentimentData 数组（label 固定 'neutral'，summary 为标题拼接），或 null
   * 数据清洗: 将最近 5 条公告标题以 ' | ' 拼接，截断至 200 字符
   */
  async sentiment(code: string) {
    const news = await this.news(code, 1, 5)
    if (!news?.length) return null
    return [{
      code: normalizeCode(code),
      label: 'neutral',
      summary: news.map(n => n.title).join(' | ').slice(0, 200),
      timestamp: new Date().toISOString(),
    } satisfies SentimentData]
  }

  /**
   * 获取公司分红送配数据
   * 对应 Python: akshare.stock_feature.stock_fhps_em.stock_fhps_em（分红送配）
   * 数据源: 东财 F10 分红数据接口（通过 fetchF10Dividends）
   * @param code - 股票代码
   * @returns Dividend 数组，或 null
   * 数据清洗: 由 fetchF10Dividends 统一处理 datacenter-web 数据映射
   */
  async dividend(code: string) {
    try {
      return await fetchF10Dividends(code)
    } catch { return null }
  }

  /**
   * 获取龙虎榜详情数据
   * 对应 Python: akshare.stock_feature.stock_lhb_em.stock_lhb_detail_em
   * 数据源: datacenter-web.eastmoney.com/api/data/v1/get（reportName=RPT_DAILYBILLBOARD_DETAILSNEW）
   * @param date - 查询日期（YYYY-MM-DD），为空时返回最近数据
   * @returns DragonTiger 数组（含 code/name/date/reason/netAmount/changePct），或 null
   * 数据清洗: 解析 SECURITY_CODE/SECURITY_NAME_ABBR/EXPLANATION/BILLBOARD_NET_AMT/CHANGE_RATE 等字段
   */
  async dragonTiger(date = '') {
    try {
      const hit = await fetchDragonTigerDetails(date)
      if (!hit?.items.length) return null
      return hit.items.map(it => ({
        code: String(it.SECURITY_CODE ?? it.STOCK_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? it.SECURITY_NAME ?? ''),
        date: hit.date,
        reason: String(it.EXPLANATION ?? it.EXPLAIN ?? it.BILLBOARD_EXPLAIN ?? ''),
        netAmount: safeFloat(it.BILLBOARD_NET_AMT ?? it.NET_BUY_AMT),
        changePct: safeFloat(it.CHANGE_RATE ?? it.CLOSE_PRICE),
      } satisfies DragonTiger))
    } catch { return null }
  }

  /**
   * 获取沪深京 A 股全量股票列表
   * 对应 Python: akshare.stock_feature.stock_hist_em.stock_zh_a_spot_em（列表模式）
   * 数据源: push2.eastmoney.com/api/qt/clist/get
   * @param _market - 市场筛选（预留，当前固定查询沪深京全市场）
   * @returns StockListItem 数组（含 code/name/industry/market），或 null
   * 数据清洗: 分页获取（每页 100 条，最多 80 页）；fs 参数组合沪深主板+创业板+科创板+北交所；diff 可能为对象或数组格式
   */
  async stockList(_market = 'all') {
    try {
      const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'
      const pageSize = 100
      const data: StockListItem[] = []
      let page = 1
      let total = Number.POSITIVE_INFINITY

      while (data.length < total) {
        const json = await eastmoneyGet(LIST_URL, {
          pn: String(page), pz: String(pageSize), po: '1', np: '1',
          fields: 'f12,f14,f100',
          fltt: '2', invt: '2',
          fs,
        }, 15000, EASTMONEY_QUOTE_HEADERS)
        const block = json?.data as {
          diff?: Record<string, unknown> | Record<string, unknown>[]
          total?: number
        } | undefined
        const raw = block?.diff
        const diff: Record<string, unknown>[] = raw
          ? (Array.isArray(raw) ? raw : Object.values(raw) as Record<string, unknown>[])
          : []
        if (!diff.length) break

        total = Number(block?.total ?? data.length + diff.length)
        for (const item of diff) {
          const c = String(item.f12 ?? '')
          data.push({
            code: c, name: String(item.f14 ?? ''), industry: String(item.f100 ?? ''),
            market: resolveMarket(c),
          })
        }

        if (diff.length < pageSize || data.length >= total) break
        page += 1
        if (page > 80) break
      }

      return data.length ? data : null
    } catch { return null }
  }

  /**
   * 获取当日涨停/跌停股票列表
   * 对应 Python: akshare.stock_feature.stock_zt_em（涨停/跌停股池）
   * 数据源: push2.eastmoney.com/api/qt/clist/get
   * @param date - 日期（YYYY-MM-DD），为空时使用当天
   * @returns LimitUpDown 数组（type 为 'limit_up' 或 'limit_down'），或 null
   * 数据清洗: 通过涨跌幅 f3 判断：≥9.8% 为涨停，≤-9.8% 为跌停；取前 200 条按涨跌幅排序
   */
  async limitUpdown(date = '') {
    try {
      const json = await eastmoneyGet(LIST_URL, {
        pn: '1', pz: '200', po: '1', np: '1',
        fields: 'f12,f14,f3,f128',
        fltt: '2', invt: '2',
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
        fid: 'f3',
      }, 15000, EASTMONEY_QUOTE_HEADERS)
      const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
      const diff = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []
      const results: LimitUpDown[] = []
      for (const item of diff as Record<string, unknown>[]) {
        const pct = safeFloat(item.f3)
        if (pct == null) continue
        if (pct >= 9.8) {
          results.push({
            code: String(item.f12), name: String(item.f14), date: date || new Date().toISOString().slice(0, 10),
            type: 'limit_up', changePct: pct,
          })
        } else if (pct <= -9.8) {
          results.push({
            code: String(item.f12), name: String(item.f14), date: date || new Date().toISOString().slice(0, 10),
            type: 'limit_down', changePct: pct,
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * 获取板块资金流向排行
   * 对应 Python: akshare 东方财富板块资金流向数据
   * 数据源: push2.eastmoney.com/api/qt/clist/get（板块列表接口）
   * @param sectorType - 板块类型: 'industry'（行业板块，fs=m:90+t:2）| 'concept'（概念板块，fs=m:90+t:3），默认 'industry'
   * @returns SectorMoneyFlow 数组（含 sectorCode/sectorName/netAmount/changePct），或 null
   * 数据清洗: 按 f62（主力净流入）降序排序，取前 50 条；date 取当天
   */
  async sectorMoneyFlow(sectorType = 'industry') {
    try {
      const fs = sectorType === 'concept'
        ? 'm:90+t:3'
        : 'm:90+t:2'
      const json = await eastmoneyGet(SECTOR_FLOW_URL, {
        pn: '1', pz: '50', po: '1', np: '1',
        fields: 'f12,f14,f3,f62', fltt: '2', invt: '2', fs, fid: 'f62',
      }, 15000, EASTMONEY_QUOTE_HEADERS)
      const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
      const diff = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []
      const results: SectorMoneyFlow[] = (diff as Record<string, unknown>[]).map(it => ({
        sectorCode: String(it.f12 ?? ''),
        sectorName: String(it.f14 ?? ''),
        date: new Date().toISOString().slice(0, 10),
        netAmount: safeFloat(it.f62),
        changePct: safeFloat(it.f3),
      }))
      return results.length ? results : null
    } catch { return null }
  }

  /**
   * 获取市场资金流向（北向资金）
   * 对应 Python: akshare.stock_feature.stock_hsgt_em（沪深港通资金流向）
   * 数据源: 东财 datacenter API（通过 fetchNorthMoneyFlowSnapshot）
   * @param direction - 资金方向，当前仅支持 'north'（北向资金）
   * @returns MarketMoneyFlow 数组，或 null
   * 数据清洗: 由 fetchNorthMoneyFlowSnapshot 统一处理
   */
  async marketMoneyFlow(direction = 'north') {
    try {
      if (direction !== 'north') return null
      const rows = await fetchNorthMoneyFlowSnapshot()
      return rows?.length ? rows : null
    } catch { return null }
  }

  /**
   * 获取全市场涨跌家数（市场宽度）
   * 对应 Python: 无直接对应 AKShare 接口，东财原生实现
   * 数据源: push2.eastmoney.com/api/qt/clist/get（沪深京全 A 股涨跌幅列表）
   * @param _date - 日期（预留），为空时使用当天
   * @returns 包含 date/up/down/flat/total 的数组，或 null
   * 数据清洗: 分页获取全部 A 股涨跌幅 f3 字段；>0 计为上涨，<0 计为下跌，=0 计为平盘；最多 30 页 × 500 条
   */
  async marketBreadth(_date = '') {
    try {
      const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'
      let up = 0
      let down = 0
      let flat = 0
      let page = 1
      const pageSize = 500
      let total = Number.POSITIVE_INFINITY

      while ((page - 1) * pageSize < total && page <= 30) {
        const json = await eastmoneyGet(LIST_URL, {
          pn: String(page),
          pz: String(pageSize),
          po: '1',
          np: '1',
          fields: 'f3',
          fltt: '2',
          invt: '2',
          fs,
        }, 15000, EASTMONEY_QUOTE_HEADERS)
        const block = json?.data as {
          diff?: Record<string, unknown> | Record<string, unknown>[]
          total?: number
        } | undefined
        const raw = block?.diff
        const diff = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []
        if (typeof block?.total === 'number') total = block.total
        if (!diff.length) break
        for (const item of diff as Record<string, unknown>[]) {
          const pct = safeFloat(item.f3)
          if (pct == null) continue
          if (pct > 0) up += 1
          else if (pct < 0) down += 1
          else flat += 1
        }
        page += 1
      }

      const counted = up + down + flat
      if (!counted) return null
      return [{
        date: _date || new Date().toISOString().slice(0, 10),
        up,
        down,
        flat,
        total: counted,
      }]
    } catch { return null }
  }

  /**
   * 获取交易日历
   * 数据源: 东财交易日历接口（通过 fetchTradeCalendar）
   * @param year - 年份，默认当前年份
   * @returns 交易日历数组，或 null
   */
  async tradeCalendar(year = 0) {
    try {
      const rows = await fetchTradeCalendar(year || new Date().getFullYear())
      return rows?.length ? rows : null
    } catch { return null }
  }

  /**
   * 获取公司现金流量表数据
   * 数据源: 东财 F10 财务数据接口（通过 fetchF10Financials，reportType='all'）
   * @param code - 股票代码
   * @param reportDate - 起始报告期（YYYY-MM-DD），为空时返回最近 8 期
   * @returns 包含 code/reportDate/operatingNetCash 的数组（investingNetCash/financingNetCash/freeCashFlow 暂为 null），或 null
   * 数据清洗: 从全量财务数据中提取 operatingCashFlow 字段；可选按 reportDate 过滤；最多返回 8 条
   */
  async cashFlow(code: string, reportDate = '') {
    try {
      const cc = normalizeCode(code)
      const rows = await fetchF10Financials(cc, 'all')
      if (!rows?.length) return null
      const filtered = reportDate
        ? rows.filter(r => r.reportDate >= reportDate)
        : rows
      return filtered.slice(0, 8).map(r => ({
        code: cc,
        reportDate: r.reportDate,
        operatingNetCash: r.operatingCashFlow,
        investingNetCash: null,
        financingNetCash: null,
        freeCashFlow: null,
      }))
    } catch { return null }
  }

  /**
   * 获取全球主要指数行情
   * 对应 Python: 无直接对应 AKShare 接口，东财原生实现
   * 数据源: push2.eastmoney.com/api/qt/ulist.np/get
   * @param code - 指数代码筛选（如 'DJI'），为空时返回全部指数
   * @returns GlobalIndex 数组（含恒生/道琼斯/纳斯达克/标普500/日经225/上证/深证/创业板指），或 null
   * 数据清洗: 内置 8 个指数的 secid 编码目录；批量请求后按索引位置匹配元数据；价格/涨跌幅字段使用 fltt=2 格式
   */
  async globalIndex(code = '') {
    try {
      const catalog = [
        { secid: '100.HSI', code: 'HSI', name: '恒生指数', market: 'HK' },
        { secid: '100.DJI', code: 'DJI', name: '道琼斯工业', market: 'US' },
        { secid: '100.NDX', code: 'NDX', name: '纳斯达克', market: 'US' },
        { secid: '100.SPX', code: 'SPX', name: '标普500', market: 'US' },
        { secid: '100.N225', code: 'N225', name: '日经225', market: 'JP' },
        { secid: '1.000001', code: '000001', name: '上证指数', market: 'CN' },
        { secid: '0.399001', code: '399001', name: '深证成指', market: 'CN' },
        { secid: '0.399006', code: '399006', name: '创业板指', market: 'CN' },
      ]
      const wanted = String(code ?? '').trim().toUpperCase()
      const targets = wanted
        ? catalog.filter(item => item.code === wanted || item.code === normalizeCode(wanted))
        : catalog
      if (!targets.length) return null

      const json = await eastmoneyGet('https://push2.eastmoney.com/api/qt/ulist.np/get', {
        secids: targets.map(item => item.secid).join(','),
        fields: 'f12,f14,f2,f3,f4,f18,f20',
        fltt: '2',
        invt: '2',
      }, 15000, EASTMONEY_QUOTE_HEADERS)
      const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
      const rows = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []
      if (!rows.length) return null

      const results = []
      for (let i = 0; i < rows.length; i += 1) {
        const meta = targets[i]
        const row = rows[i] as Record<string, unknown>
        if (!meta || !row) continue
        results.push({
          code: meta.code,
          name: String(row.f14 ?? meta.name),
          price: safeFloat(row.f2),
          changePct: normalizeChangePct(row.f3),
          market: meta.market,
        })
      }
      return results.length ? results : null
    } catch { return null }
  }

}
