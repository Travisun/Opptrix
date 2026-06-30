import { httpGet } from '../utils/http.js'
import { normalizeCode, resolveSecId, safeFloat } from '../utils/helpers.js'
import { parseTrend2IntradayLine } from '../utils/intraday-trends.js'
import { fetchF10Financials, fetchF10Profile, fetchF10Shareholders } from './eastmoney-f10.js'
import type { EastMoneyDriver } from './eastmoney.js'

type EM = EastMoneyDriver & {
  dcFetch(reportName: string, columns: string, filter: string, pageSize?: string): Promise<Record<string, unknown>[]>
  getData(url: string, params: Record<string, string>): Promise<Record<string, unknown> | null>
}

async function dcAll(
  em: EM, reportName: string, filter: string, pageSize = '20', sortColumns = 'REPORT_DATE',
) {
  return em.dcFetch(reportName, 'ALL', filter, pageSize)
}

function c(code: string) { return normalizeCode(code) }

export function mixEastMoneyResearch(Driver: { prototype: EastMoneyDriver }) {
  const p = Driver.prototype as EM

  p.shareholders = async function shareholders(code: string, _reportDate = '') {
    try {
      return await fetchF10Shareholders(code)
    } catch { return null }
  }

  p.marginTrade = async function marginTrade(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_MARGIN_TRADE_DETAIL', `(SECURITY_CODE="${cc}")`, '60', 'TRADE_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc,
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        marginBalance: safeFloat(it.MARGIN_BALANCE),
        marginBuy: safeFloat(it.MARGIN_BUY),
        marginNet: safeFloat(it.MARGIN_NET),
        shortBalance: safeFloat(it.SHORT_BALANCE),
      }))
    } catch { return null }
  }

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

  p.instHolding = async function instHolding(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_INST_HOLDING', `(SECURITY_CODE="${cc}")`, '30', 'END_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, reportDate: String(it.END_DATE ?? '').slice(0, 10),
        institutionType: String(it.INST_TYPE ?? it.HOLDER_TYPE ?? ''),
        sharesHeld: safeFloat(it.HOLD_SHARES ?? it.SHARES_HELD),
        sharePct: safeFloat(it.HOLD_SHARES_PCT ?? it.SHARE_PCT),
        marketValue: safeFloat(it.MARKET_VALUE),
      }))
    } catch { return null }
  }

  p.blockTrade = async function blockTrade(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_BLOCK_TRADE', `(SECURITY_CODE="${cc}")`, '30', 'TRADE_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, date: String(it.TRADE_DATE ?? '').slice(0, 10),
        price: safeFloat(it.TRADE_PRICE), volume: safeFloat(it.TRADE_VOLUME),
        amount: safeFloat(it.TRADE_AMOUNT), buyer: String(it.BUYER ?? ''), seller: String(it.SELLER ?? ''),
      }))
    } catch { return null }
  }

  p.lockupExpiry = async function lockupExpiry(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_LOCKUP_EXPIRY', `(SECURITY_CODE="${cc}")`, '20', 'UNLOCK_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, date: String(it.UNLOCK_DATE ?? '').slice(0, 10),
        sharesUnlock: safeFloat(it.UNLOCK_SHARES), sharePct: safeFloat(it.UNLOCK_SHARES_PCT ?? it.SHARE_PCT),
      }))
    } catch { return null }
  }

  p.sharePledge = async function sharePledge(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_SHARE_PLEDGE', `(SECURITY_CODE="${cc}")`, '20', 'PLEDGE_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, date: String(it.PLEDGE_DATE ?? '').slice(0, 10),
        pledger: String(it.PLEDGER ?? ''), pledgee: String(it.PLEDGEE ?? ''),
        sharesPledged: safeFloat(it.PLEDGE_SHARES), sharePct: safeFloat(it.PLEDGE_SHARES_PCT ?? it.SHARE_PCT),
      }))
    } catch { return null }
  }

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

  p.indexConstituents = async function indexConstituents(indexCode: string) {
    try {
      const json = await httpGet('https://push2.eastmoney.com/api/qt/slist/get', {
        fltt: '2', invt: '2', fields: 'f12,f14,f100,f3', type: '3', secids: resolveSecId(indexCode),
      })
      const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
      const items = (raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map(it => ({
        indexCode, stockCode: String(it.f12 ?? ''), stockName: String(it.f14 ?? ''),
        industry: String(it.f100 ?? ''), weight: safeFloat(it.f3),
      }))
    } catch { return null }
  }

  p.insiderTrade = async function insiderTrade(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_INSIDER_TRADE', `(SECURITY_CODE="${cc}")`, '30', 'CHANGE_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, date: String(it.CHANGE_DATE ?? '').slice(0, 10),
        name: String(it.PERSON_NAME ?? ''), position: String(it.POSITION ?? ''),
        changeType: String(it.CHANGE_TYPE ?? ''), sharesChanged: safeFloat(it.CHANGE_SHARES),
      }))
    } catch { return null }
  }

  p.perfForecast = async function perfForecast(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_PERFORMCE_FORECAST', `(SECURITY_CODE="${cc}")`, '10', 'ANN_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        forecastType: String(it.FORECAST_TYPE ?? ''), summary: String(it.SUMMARY ?? it.CHANGE_REASON ?? ''),
        profitLower: safeFloat(it.PROFIT_LOWER ?? it.NET_PROFIT_LOWER),
        profitUpper: safeFloat(it.PROFIT_UPPER ?? it.NET_PROFIT_UPPER),
      }))
    } catch { return null }
  }

  p.ipoData = async function ipoData() {
    try {
      const items = await dcAll(this, 'RPT_IPO_RECENTLY', '', '30', 'LISTING_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? it.SECURITY_NAME_ABBR ?? ''),
        listingDate: String(it.LISTING_DATE ?? '').slice(0, 10),
        issuePrice: safeFloat(it.ISSUE_PRICE), pe: safeFloat(it.PE_RATIO),
      }))
    } catch { return null }
  }

  p.convertibleBonds = async function convertibleBonds() {
    try {
      const items = await dcAll(this, 'RPT_BOND_CB_LIST', '', '50', 'PUBLIC_START_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: String(it.BOND_CODE ?? ''), name: String(it.BOND_NAME ?? ''),
        stockCode: String(it.CONVERT_STOCK_CODE ?? ''), convertPrice: safeFloat(it.CONVERT_PRICE),
      }))
    } catch { return null }
  }

  p.etfData = async function etfData(etfCode = '') {
    try {
      const filter = etfCode ? `(SECURITY_CODE="${c(etfCode)}")` : ''
      const items = await dcAll(this, 'RPT_ETF_LIST', filter, '50', 'SECURITY_CODE')
      if (!items.length) return null
      return items.map(it => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? it.SECURITY_NAME_ABBR ?? ''),
        nav: safeFloat(it.NAV), changePct: safeFloat(it.CHANGE_RATE),
      }))
    } catch { return null }
  }

  p.managerInfo = async function managerInfo(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_MANAGER_INFO', `(SECURITY_CODE="${cc}")`, '20', 'START_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, name: String(it.PERSON_NAME ?? ''), position: String(it.POSITION ?? ''),
        startDate: String(it.START_DATE ?? '').slice(0, 10), endDate: String(it.END_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.shareholderPlans = async function shareholderPlans(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_SHAREHOLDER_PLAN', `(SECURITY_CODE="${cc}")`, '20', 'ANN_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, date: String(it.ANN_DATE ?? '').slice(0, 10),
        planType: String(it.PLAN_TYPE ?? ''), summary: String(it.PLAN_SUMMARY ?? ''),
      }))
    } catch { return null }
  }

  p.buyback = async function buyback(code: string) {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_SHARE_BUYBACK', `(SECURITY_CODE="${cc}")`, '20', 'ANN_DATE')
      if (!items.length) return null
      return items.map(it => ({
        code: cc, date: String(it.ANN_DATE ?? '').slice(0, 10),
        amount: safeFloat(it.BUYBACK_AMOUNT), shares: safeFloat(it.BUYBACK_SHARES),
      }))
    } catch { return null }
  }

  p.macroIndicator = async function macroIndicator(indicator = '') {
    try {
      const map: Record<string, string> = {
        GDP: 'RPT_ECONOMY_GDP', CPI: 'RPT_ECONOMY_CPI', PPI: 'RPT_ECONOMY_PPI',
        PMI: 'RPT_ECONOMY_PMI', M2: 'RPT_ECONOMY_M2',
      }
      const keys = indicator ? [indicator.toUpperCase()] : Object.keys(map)
      const results = []
      for (const k of keys) {
        const report = map[k]
        if (!report) continue
        const items = await dcAll(this, report, '', '24', 'REPORT_DATE')
        for (const it of items) {
          results.push({
            indicator: k, date: String(it.REPORT_DATE ?? it.END_DATE ?? '').slice(0, 10),
            value: safeFloat(it.VALUE ?? it.INDEX_VALUE ?? it.M2_VALUE),
          })
        }
      }
      return results.length ? results : null
    } catch { return null }
  }

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
}

// Type augmentation for mixed-in methods
declare module './eastmoney.js' {
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
    managerInfo(code: string): Promise<Record<string, unknown>[] | null>
    shareholderPlans(code: string): Promise<Record<string, unknown>[] | null>
    buyback(code: string): Promise<Record<string, unknown>[] | null>
    macroIndicator(indicator?: string): Promise<Record<string, unknown>[] | null>
    exchangeRate(pair?: string): Promise<Record<string, unknown>[] | null>
  }
}
