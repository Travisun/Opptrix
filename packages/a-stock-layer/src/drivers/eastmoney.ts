import { Capability } from '../core/capabilities.js'
import type {
  Dividend, DragonTiger, FinancialSummary, LimitUpDown, MoneyFlow,
  NewsItem, SectorMoneyFlow, StockKline, StockListItem, StockProfile,
  StockRealtime, SentimentData,
} from '../core/schema.js'
import { httpGet } from '../utils/http.js'
import {
  normalizeChangePct, normalizeCode, normalizePrice, resolveSecId, safeFloat,
} from '../utils/helpers.js'
import { BaseDriver } from './base.js'

const BASE_URL = 'https://push2.eastmoney.com/api/qt/stock/get'
const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const LIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const FLOW_URL = 'https://push2.eastmoney.com/api/qt/stock/fflow/day/get'
const SECTOR_FLOW_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const FIN_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const PERIOD_MAP: Record<string, string> = {
  daily: '101', weekly: '102', monthly: '103', '60m': '60', '30m': '30', '5m': '5', '1m': '1',
}

export class EastMoneyDriver extends BaseDriver {
  get name() { return 'eastmoney' }
  get priority() { return 100 }

  capabilities() {
    return [
      Capability.STOCK_REALTIME, Capability.STOCK_KLINE, Capability.STOCK_MONEY_FLOW,
      Capability.INDEX_REALTIME, Capability.INDEX_KLINE, Capability.MARKET_MONEY_FLOW,
      Capability.SECTOR_MONEY_FLOW, Capability.STOCK_PROFILE, Capability.SHAREHOLDER,
      Capability.FINANCIAL_SUMMARY, Capability.NEWS, Capability.SENTIMENT,
      Capability.DRAGON_TIGER, Capability.MARGIN_TRADE, Capability.DIVIDEND,
      Capability.BALANCE_SHEET, Capability.INCOME_STMT, Capability.CASH_FLOW,
      Capability.INST_HOLDING, Capability.BLOCK_TRADE, Capability.LOCKUP_EXPIRY,
      Capability.SHARE_PLEDGE, Capability.INTRADAY_TICK, Capability.STOCK_LIST,
      Capability.INDEX_CONST, Capability.INSIDER_TRADE, Capability.PERF_FORECAST,
      Capability.TRADE_CALENDAR, Capability.LIMIT_UPDOWN, Capability.MARKET_BREADTH,
      Capability.IPO_DATA, Capability.CONVERTIBLE_BOND, Capability.ETF_DATA,
      Capability.MANAGER_INFO, Capability.SHAREHOLDER_PLAN, Capability.BUYBACK,
      Capability.GLOBAL_INDEX, Capability.EXCHANGE_RATE, Capability.MACRO_INDICATOR,
      Capability.MAIN_BUSINESS, Capability.TOP_CUSTOMER, Capability.ACTUAL_CONTROLLER,
      Capability.SUBSIDIARY, Capability.RELATED_PARTY, Capability.RD_INVESTMENT,
      Capability.MERGER_ACQUISITION, Capability.EMPLOYEE_COMP, Capability.INSTITUTIONAL_VISIT,
      Capability.PEER_COMPANY,
    ]
  }

  protected async getData(url: string, params: Record<string, string>) {
    const json = await httpGet(url, params)
    return (json?.data as Record<string, unknown>) ?? null
  }

  protected async dcFetch(reportName: string, columns: string, filter: string, pageSize = '20') {
    const json = await httpGet(FIN_URL, {
      reportName, columns, filter,
      pageNumber: '1', pageSize, sortTypes: '-1', sortColumns: 'REPORT_DATE',
    })
    return (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
  }

  async realtime(code: string) {
    try {
      const data = await this.getData(BASE_URL, {
        secid: resolveSecId(code),
        fields: 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f116,f115,f170,f162,f167,f168,f169',
      })
      if (!data) return null
      return [{
        code: normalizeCode(code),
        name: String(data.f58 ?? ''),
        price: normalizePrice(data.f43),
        open: safeFloat(data.f44),
        high: safeFloat(data.f45),
        low: safeFloat(data.f46),
        preClose: safeFloat(data.f47),
        volume: safeFloat(data.f48),
        changePct: normalizeChangePct(data.f170),
        pe: safeFloat(data.f162),
        pb: safeFloat(data.f167),
        turnoverRate: safeFloat(data.f168),
        marketCap: safeFloat(data.f116),
      }]
    } catch { return null }
  }

  async batchRealtime(codes: string[]) {
    const results: StockRealtime[] = []
    for (const c of codes) {
      const r = await this.realtime(c)
      if (r) results.push(...r)
    }
    return results.length ? results : null
  }

  async indexRealtime(code: string) { return this.realtime(code) }

  private parseKlines(klines: string[], code: string): StockKline[] {
    const rows: StockKline[] = []
    for (const line of klines) {
      const p = line.split(',')
      if (p.length < 7) continue
      rows.push({
        code: normalizeCode(code), date: p[0],
        open: Number(p[1]), close: Number(p[2]), high: Number(p[3]), low: Number(p[4]),
        volume: Number(p[5]), amount: Number(p[6]),
        changePct: p[8] != null ? Number(p[8]) : null,
        turnoverRate: p[10] != null ? Number(p[10]) : null,
      })
    }
    return rows
  }

  async kline(code: string, period = 'daily', start = '', end = '', count = 1000) {
    try {
      const params: Record<string, string> = {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: PERIOD_MAP[period] ?? '101', fqt: '1', lmt: String(count),
      }
      if (start) params.beg = start.replace(/-/g, '')
      if (end) params.end = end.replace(/-/g, '')
      const data = await this.getData(KLINE_URL, params)
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return this.parseKlines(klines, code)
    } catch { return null }
  }

  async indexKline(code: string, period = 'daily', start = '', end = '') {
    return this.kline(code, period, start, end)
  }

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

  async financials(code: string, _reportDate = '', reportType = 'annual') {
    try {
      const c = normalizeCode(code)
      const json = await httpGet(FIN_URL, {
        reportName: 'RPT_LICO_FN_CPD',
        columns: 'SECURITY_CODE,REPORT_DATE,BASIC_EPS,WEIGHTAVG_ROE,OPERATE_INCOME,OPERATE_INCOME_YOY,NET_PROFIT_PARENT_YOY,TOTAL_PROFIT_PARENT,GROSS_PROFIT_MARGIN,DEBT_RATIO,OPERATE_CASH_FLOW,TOTAL_ASSETS,TOTAL_LIABILITIES',
        filter: reportType === 'quarter'
          ? `(SECURITY_CODE="${c}")`
          : `(SECURITY_CODE="${c}")(REPORT_DATE_TYPE="1")`,
        pageNumber: '1', pageSize: reportType === 'quarter' ? '12' : '8',
        sortTypes: '-1', sortColumns: 'REPORT_DATE',
      })
      const items = (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
      if (!items.length) return null
      return items.map(item => ({
        code: c,
        reportDate: String(item.REPORT_DATE ?? '').slice(0, 10),
        revenue: safeFloat(item.OPERATE_INCOME),
        revenueYoy: safeFloat(item.OPERATE_INCOME_YOY),
        netProfit: safeFloat(item.TOTAL_PROFIT_PARENT),
        netProfitYoy: safeFloat(item.NET_PROFIT_PARENT_YOY),
        eps: safeFloat(item.BASIC_EPS),
        roe: safeFloat(item.WEIGHTAVG_ROE),
        grossMargin: safeFloat(item.GROSS_PROFIT_MARGIN),
        debtRatio: safeFloat(item.DEBT_RATIO),
        operatingCashFlow: safeFloat(item.OPERATE_CASH_FLOW),
        totalAssets: safeFloat(item.TOTAL_ASSETS),
        totalLiabilities: safeFloat(item.TOTAL_LIABILITIES),
      } satisfies FinancialSummary))
    } catch { return null }
  }

  async profile(code: string) {
    try {
      const c = normalizeCode(code)
      const data1 = await this.getData(BASE_URL, {
        secid: resolveSecId(code),
        fields: 'f58,f84,f85,f116,f117',
      })
      if (!data1) return null
      let industry = String(data1.f84 ?? data1.f85 ?? '')
      if (/^\d/.test(industry)) industry = ''
      const items = await this.dcFetch(
        'RPT_DMSK_FNCOMPANY',
        'SECURITY_CODE,SECURITY_NAME_ABBR,INDUSTRY,PROVINCE,CITY,MAIN_BUSINESS,LISTING_DATE,WEBSITE,EMPLOYEES',
        `(SECURITY_CODE="${c}")`, '1',
      )
      const item = items[0]
      return [{
        code: c,
        name: String(data1.f58 ?? item?.SECURITY_NAME_ABBR ?? ''),
        industry: String(item?.INDUSTRY ?? industry),
        province: String(item?.PROVINCE ?? ''),
        city: String(item?.CITY ?? ''),
        mainBusiness: String(item?.MAIN_BUSINESS ?? ''),
        listingDate: String(item?.LISTING_DATE ?? '').slice(0, 10),
        website: String(item?.WEBSITE ?? ''),
        employees: item?.EMPLOYEES ? Number(item.EMPLOYEES) : null,
        totalMarketCap: safeFloat(data1.f116),
        circulatingMarketCap: safeFloat(data1.f117),
      } satisfies StockProfile]
    } catch { return null }
  }

  async news(code: string, page = 1, pageSize = 20) {
    try {
      const c = normalizeCode(code)
      const json = await httpGet('https://np-anotice-stock.eastmoney.com/api/security/ann', {
        sr: '-1', page_size: String(pageSize), page_index: String(page),
        ann_type: 'A', client_source: 'web', stock_list: c,
      })
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

  async dividend(code: string) {
    try {
      const c = normalizeCode(code)
      const items = await this.dcFetch(
        'RPT_F10_DIVIDEND',
        'SECURITY_CODE,SECURITY_NAME_ABBR,EX_DIVIDEND_DATE,CASH_DIVIDEND_RATIO,IMPL_PLAN_PROFILE',
        `(SECURITY_CODE="${c}")`, '10',
      )
      if (!items.length) return null
      return items.map(it => ({
        code: c,
        year: String(it.EX_DIVIDEND_DATE ?? '').slice(0, 4),
        cashBonus: safeFloat(it.CASH_DIVIDEND_RATIO),
        exDate: String(it.EX_DIVIDEND_DATE ?? '').slice(0, 10),
      } satisfies Dividend))
    } catch { return null }
  }

  async dragonTiger(date = '') {
    try {
      const d = date || new Date().toISOString().slice(0, 10)
      const items = await this.dcFetch(
        'RPT_DAILYBILLBOARD',
        'SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,EXPLAIN,BILLBOARD_NET_AMT,CHANGE_RATE',
        `(TRADE_DATE='${d}')`, '50',
      )
      if (!items.length) return null
      return items.map(it => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? ''),
        date: d,
        reason: String(it.EXPLAIN ?? ''),
        netAmount: safeFloat(it.BILLBOARD_NET_AMT),
        changePct: safeFloat(it.CHANGE_RATE),
      } satisfies DragonTiger))
    } catch { return null }
  }

  async stockList(_market = 'all') {
    try {
      const json = await httpGet(LIST_URL, {
        pn: '1', pz: '6000', po: '1', np: '1',
        fields: 'f12,f14,f100',
        fltt: '2', invt: '2',
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048',
      })
      const raw = (json?.data as { diff?: Record<string, unknown> | Record<string, unknown>[] })?.diff
      const diff: Record<string, unknown>[] = raw
        ? (Array.isArray(raw) ? raw : Object.values(raw) as Record<string, unknown>[])
        : []
      const data = diff.map(item => {
        const c = String(item.f12 ?? '')
        return {
          code: c, name: String(item.f14 ?? ''), industry: String(item.f100 ?? ''),
          market: c.startsWith('6') || c.startsWith('9') ? 'SH' : 'SZ',
        } satisfies StockListItem
      })
      return data.length ? data : null
    } catch { return null }
  }

  async limitUpdown(date = '') {
    try {
      const json = await httpGet(LIST_URL, {
        pn: '1', pz: '200', po: '1', np: '1',
        fields: 'f12,f14,f3,f128',
        fltt: '2', invt: '2',
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
        fid: 'f3',
      })
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

  async sectorMoneyFlow(sectorType = 'industry') {
    try {
      const fs = sectorType === 'concept'
        ? 'm:90+t:3'
        : 'm:90+t:2'
      const json = await httpGet(SECTOR_FLOW_URL, {
        pn: '1', pz: '50', po: '1', np: '1',
        fields: 'f12,f14,f3,f62', fltt: '2', invt: '2', fs, fid: 'f62',
      })
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

  async marketMoneyFlow(direction = 'north') {
    try {
      const items = await this.dcFetch(
        'RPT_MUTUAL_NETINFLOW',
        'TRADE_DATE,NET_INFLOW,HNET_INFLOW,SNET_INFLOW',
        `(MUTUAL_TYPE="${direction === 'north' ? '001' : '002'}")`, '10',
      )
      if (!items.length) return null
      return items.map(it => ({
        direction,
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        netAmount: safeFloat(it.NET_INFLOW) ?? 0,
        shNet: safeFloat(it.HNET_INFLOW),
        szNet: safeFloat(it.SNET_INFLOW),
      }))
    } catch { return null }
  }

  async marketBreadth(_date = '') {
    const list = await this.stockList()
    if (!list?.length) return null
    let up = 0, down = 0, flat = 0
    for (const s of list.slice(0, 500)) {
      const r = await this.realtime(s.code)
      const pct = r?.[0]?.changePct
      if (pct == null) continue
      if (pct > 0) up++
      else if (pct < 0) down++
      else flat++
    }
    return [{ date: new Date().toISOString().slice(0, 10), up, down, flat, total: up + down + flat }]
  }

  async tradeCalendar(year = 0) {
    const y = year || new Date().getFullYear()
    try {
      const items = await this.dcFetch(
        'RPT_CALENDAR',
        'CALENDAR_DATE,IS_TRADE_DAY',
        `(YEAR="${y}")`, '400',
      )
      return items.length ? items.map(it => ({
        date: String(it.CALENDAR_DATE ?? '').slice(0, 10),
        isTradeDay: it.IS_TRADE_DAY === '1' || it.IS_TRADE_DAY === 1,
      })) : null
    } catch { return null }
  }

  async cashFlow(code: string, reportDate = '') {
    try {
      const cc = normalizeCode(code)
      let filter = `(SECURITY_CODE="${cc}")`
      if (reportDate) filter += `(REPORT_DATE>="${reportDate}")`
      const items = await this.dcFetch('RPT_CASHFLOW', 'ALL', filter, '8')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        operatingNetCash: safeFloat(it.OPERATE_NET_CASH),
        investingNetCash: safeFloat(it.INVEST_NET_CASH),
        financingNetCash: safeFloat(it.FINANCE_NET_CASH),
        freeCashFlow: safeFloat(it.FREE_CASH_FLOW),
      }))
    } catch { return null }
  }

  async globalIndex(_code = '') {
    const indices = [
      { code: '000001', name: '上证指数' }, { code: '399001', name: '深证成指' },
      { code: '399006', name: '创业板指' }, { code: '000300', name: '沪深300' },
    ]
    const results = []
    for (const idx of indices) {
      const r = await this.indexRealtime(idx.code)
      if (r?.[0]) results.push({
        code: idx.code, name: idx.name, price: r[0].price, changePct: r[0].changePct, market: 'CN',
      })
    }
    return results.length ? results : null
  }
}
