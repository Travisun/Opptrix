import { Capability } from '../core/capabilities.js'
import type {
  Dividend, DragonTiger, FinancialSummary, LimitUpDown, MoneyFlow,
  NewsItem, SectorMoneyFlow, StockKline, StockListItem, StockProfile,
  StockRealtime, SentimentData,
} from '../core/schema.js'
import { httpGet } from '../utils/http.js'
import {
  normalizeChangePct, normalizeCode, normalizeKlineDateTime, normalizePrice, resolveMarket, resolveSecId, safeFloat,
} from '../utils/helpers.js'
import { computeChipDistribution, computeLatestChipProfile } from '../utils/cyq.js'
import { BaseDriver } from './base.js'
import {
  fetchDataCenterReport,
  fetchDragonTigerDetails,
  fetchF10Dividends,
  fetchF10Financials,
  fetchF10Profile,
  fetchF10Shareholders,
  fetchNorthMoneyFlowSnapshot,
  fetchTradeCalendar,
} from './eastmoney-f10.js'

const BASE_URL = 'https://push2.eastmoney.com/api/qt/stock/get'
const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const TRENDS2_URL = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'
const LIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const FLOW_URL = 'https://push2.eastmoney.com/api/qt/stock/fflow/day/get'
const SECTOR_FLOW_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const PERIOD_MAP: Record<string, string> = {
  daily: '101', weekly: '102', monthly: '103', '60m': '60', '30m': '30', '15m': '15', '5m': '5', '1m': '1',
}

/** EastMoney push2 qt/stock/get — prices and deltas are ×100. */
function emQuotePrice(v: unknown): number | null {
  const f = safeFloat(v)
  return f == null ? null : f / 100
}

function emQuoteDelta(v: unknown): number | null {
  const f = safeFloat(v)
  if (f == null) return null
  return Math.abs(f) > 50 ? f / 100 : f
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
      Capability.PEER_COMPANY, Capability.CHIP_DISTRIBUTION,
    ]
  }

  protected async getData(url: string, params: Record<string, string>) {
    const json = await httpGet(url, params)
    return (json?.data as Record<string, unknown>) ?? null
  }

  protected async dcFetch(reportName: string, columns: string, filter: string, pageSize = '20') {
    return fetchDataCenterReport(reportName, filter, pageSize, 'REPORT_DATE', columns)
  }

  async realtime(code: string) {
    try {
      const data = await this.getData(BASE_URL, {
        secid: resolveSecId(code),
        fields: 'f43,f44,f45,f46,f47,f48,f50,f51,f57,f58,f116,f115,f170,f162,f167,f168,f169',
      })
      if (!data) return null
      const amount = safeFloat(data.f48)
      const volume = safeFloat(data.f51)
      return [{
        code: normalizeCode(code),
        name: String(data.f58 ?? ''),
        price: emQuotePrice(data.f43),
        open: emQuotePrice(data.f44),
        high: emQuotePrice(data.f45),
        low: emQuotePrice(data.f46),
        preClose: emQuotePrice(data.f47),
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
        code: normalizeCode(code), date: normalizeKlineDateTime(p[0]),
        open: Number(p[1]), close: Number(p[2]), high: Number(p[3]), low: Number(p[4]),
        volume: Number(p[5]), amount: Number(p[6]),
        changePct: p[8] != null ? Number(p[8]) : null,
        turnoverRate: p[10] != null ? Number(p[10]) : null,
      })
    }
    return rows
  }

  /** trends2 字段与 kline 不同：p[5] 为分笔量，p[10] 为累计量；09:30 为竞价快照非标准 1m K。 */
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

  /** 1m multi-day bars via trends2 (kline API only returns latest session). ndays: 1–5. */
  async minuteTrendKline(code: string, ndays = 1, count = 0) {
    try {
      const safeDays = Math.max(1, Math.min(Math.floor(ndays), 5))
      const data = await this.getData(TRENDS2_URL, {
        secid: resolveSecId(code),
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

  async kline(code: string, period = 'daily', start = '', end = '', count = 1000) {
    try {
      const params: Record<string, string> = {
        secid: resolveSecId(code),
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

  async indexKline(code: string, period = 'daily', start = '', end = '') {
    return this.kline(code, period, start, end)
  }

  /** CYQ 筹码分布 — 210 日 K + 换手率，算法与东财/AKShare 一致。 */
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

  async financials(code: string, _reportDate = '', reportType: 'annual' | 'quarter' | 'all' = 'annual') {
    try {
      const rows = await fetchF10Financials(code, reportType)
      return rows?.length ? rows : null
    } catch { return null }
  }

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
      return await fetchF10Dividends(code)
    } catch { return null }
  }

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

  async stockList(_market = 'all') {
    try {
      const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'
      const pageSize = 100
      const data: StockListItem[] = []
      let page = 1
      let total = Number.POSITIVE_INFINITY

      while (data.length < total) {
        const json = await httpGet(LIST_URL, {
          pn: String(page), pz: String(pageSize), po: '1', np: '1',
          fields: 'f12,f14,f100',
          fltt: '2', invt: '2',
          fs,
        })
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
      if (direction !== 'north') return null
      const rows = await fetchNorthMoneyFlowSnapshot()
      return rows?.length ? rows : null
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
    try {
      const rows = await fetchTradeCalendar(year || new Date().getFullYear())
      return rows?.length ? rows : null
    } catch { return null }
  }

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
