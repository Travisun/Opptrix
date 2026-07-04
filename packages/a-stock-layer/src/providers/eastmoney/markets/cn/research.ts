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
      return items.map((it: Record<string, unknown>) => ({
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
      return items.map((it: Record<string, unknown>) => ({
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
      return items.map((it: Record<string, unknown>) => ({
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
      return items.map((it: Record<string, unknown>) => ({
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

  p.etfList = async function etfList(_market = 'CN', etfCode = '') {
    try {
      const items = await fetchEtfListRows(this, etfCode)
      if (!items.length) return null
      return items.map(mapEtfListRow)
    } catch { return null }
  }

  p.etfData = async function etfData(etfCode = '') {
    return p.etfList!.call(this, 'CN', etfCode)
  }

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

  // ── 概念/行业/地域板块 ──

  const PUSH2_LIST_URL = 'https://79.push2.eastmoney.com/api/qt/clist/get'

  p.boardConceptList = async function boardConceptList(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:90 t:3 f:!50',
        fields: 'f2,f3,f4,f8,f12,f14,f104,f105,f128,f140',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        turnoverRate: safeFloat(it.f8),
        riseCount: safeFloat(it.f104),
        fallCount: safeFloat(it.f105),
        leaderName: String(it.f128 ?? ''),
        leaderChangePct: safeFloat(it.f140),
      }))
    } catch { return null }
  }

  p.boardIndustryList = async function boardIndustryList(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:90 t:2 f:!50',
        fields: 'f2,f3,f4,f8,f12,f14,f104,f105,f128,f140',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        turnoverRate: safeFloat(it.f8),
        riseCount: safeFloat(it.f104),
        fallCount: safeFloat(it.f105),
        leaderName: String(it.f128 ?? ''),
        leaderChangePct: safeFloat(it.f140),
      }))
    } catch { return null }
  }

  p.boardRegionList = async function boardRegionList(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '100', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:90 t:1 f:!50',
        fields: 'f2,f3,f4,f8,f12,f14,f104,f105,f128,f140',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        turnoverRate: safeFloat(it.f8),
        riseCount: safeFloat(it.f104),
        fallCount: safeFloat(it.f105),
      }))
    } catch { return null }
  }

  p.boardConceptCons = async function boardConceptCons(boardCode: string): Promise<Record<string, unknown>[] | null> {
    if (!boardCode) return null
    try {
      const params = {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: `b:${boardCode} f:!50`,
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f12,f14,f15,f16,f17,f18,f20,f21',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        price: safeFloat(it.f2),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5),
        amount: safeFloat(it.f6),
        turnoverRate: safeFloat(it.f8),
        pe: safeFloat(it.f9),
      }))
    } catch { return null }
  }

  // ── 涨停板 ──

  p.ztPool = async function ztPool(date?: string): Promise<Record<string, unknown>[] | null> {
    try {
      const params: Record<string, string> = {
        ut: '7eea3edcaed734bea9cb3c8a32c9282',
        dpt: 'wz.ztzt',
        Pageindex: '1',
        Pagesize: '200',
        Sort: 'fbt:asc',
        fields: 'f2,f3,f6,f8,f14,f15,f17,f22,f24,f128',
      }
      if (date) params.date = date
      const resp = await fetch(`https://push2ex.eastmoney.com/getTopicZTPool?${new URLSearchParams(params)}`, {
        headers: EASTMONEY_QUOTE_HEADERS,
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const pool = ((json?.data as Record<string, unknown>)?.pool ?? []) as Record<string, unknown>[]
      return pool.map(it => ({
        code: String(it.f14 ?? ''),
        name: String(it.f14 ?? ''),
        price: safeFloat(it.f2),
        changePct: safeFloat(it.f3),
        amount: safeFloat(it.f6),
        turnoverRate: safeFloat(it.f8),
        firstLimitTime: String(it.f15 ?? ''),
        lastLimitTime: String(it.f17 ?? ''),
        openCount: safeFloat(it.f22),
        industry: String(it.f128 ?? ''),
      }))
    } catch { return null }
  }

  // ── 北向资金 ──

  p.hsgtNorthFlow = async function hsgtNorthFlow(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        fields1: 'f1,f3,f5',
        fields2: 'f51,f52,f53,f54,f55,f56',
        klt: '101',
        lmt: '30',
        ut: 'b2884a393a59ad64002292a3e90d46a5',
      }
      const json = await eastmoneyGet('https://push2his.eastmoney.com/api/qt/kamt.kline/get', params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const lines = (data?.s2n ?? []) as string[]
      return lines.map(line => {
        const p = line.split(',')
        return {
          date: p[0],
          northNetFlow: safeFloat(p[1]),
          northBuyAmount: safeFloat(p[2]),
          southNetFlow: safeFloat(p[4]),
          southBuyAmount: safeFloat(p[5]),
        }
      })
    } catch { return null }
  }

  // ── 热搜排名 ──

  p.hotRank = async function hotRank(): Promise<Record<string, unknown>[] | null> {
    try {
      const resp = await fetch('https://emappdata.eastmoney.com/stockrank/getAllCurrentList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...EASTMONEY_QUOTE_HEADERS },
        body: JSON.stringify({ appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38', marketType: '', pageNo: 1, pageSize: 100 }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await resp.json() as Record<string, unknown>
      const list = (json?.data ?? []) as Record<string, unknown>[]
      return list.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.sc ?? ''),
        name: String(it.sn ?? ''),
        rankChange: safeFloat(it.rc),
        popularity: safeFloat(it.heat),
      }))
    } catch { return null }
  }

  // ── 技术指标排行 ──

  p.stockRankCxgThs = async function stockRankCxgThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_CXG_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
      }))
    } catch { return null }
  }

  p.stockRankCxdThs = async function stockRankCxdThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_CXD_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
      }))
    } catch { return null }
  }

  p.stockRankLxszThs = async function stockRankLxszThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_LXSZ_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
        consecutiveDays: safeFloat(it.CONSECUTIVE_DAYS ?? it.CONTINUOUS_DAYS),
      }))
    } catch { return null }
  }

  p.stockRankLxxdThs = async function stockRankLxxdThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_LXXD_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
        consecutiveDays: safeFloat(it.CONSECUTIVE_DAYS ?? it.CONTINUOUS_DAYS),
      }))
    } catch { return null }
  }

  p.stockRankCxflThs = async function stockRankCxflThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_CXFL_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
        volumeRatio: safeFloat(it.VOLUME_RATIO),
      }))
    } catch { return null }
  }

  p.stockRankCxslThs = async function stockRankCxslThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_CXSL_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
        volumeRatio: safeFloat(it.VOLUME_RATIO),
      }))
    } catch { return null }
  }

  p.stockRankXstpThs = async function stockRankXstpThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_XSTP_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
      }))
    } catch { return null }
  }

  p.stockRankXxtpThs = async function stockRankXxtpThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_XXTP_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
      }))
    } catch { return null }
  }

  p.stockRankLjqsThs = async function stockRankLjqsThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_LJQS_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
      }))
    } catch { return null }
  }

  p.stockRankLjqdThs = async function stockRankLjqdThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'STOCK_RANK_LJQD_THS', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME_ABBR ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        turnoverRate: safeFloat(it.TURNOVER_RATE),
      }))
    } catch { return null }
  }

  // ── 个股：买卖盘 / 财报披露 / 商誉 / 质押 / 分析师 / 大宗交易 ──

  p.stockBidAsk = async function stockBidAsk(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await this.getData('https://push2.eastmoney.com/api/qt/stock/get', {
        secid: resolveSecId(code),
        fields: 'f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f168,f169,f170',
        ut: 'fa5fd1943c7b386f172d6893dbbd1',
        fltt: '2', invt: '2',
      })
      if (!data) return null
      const d = data as Record<string, unknown>
      const price = safeFloat(d.f43)
      if (price === 0 && d.f43 == null) return null
      return [{
        code: String(d.f57 ?? code),
        name: String(d.f58 ?? ''),
        price,
        changePct: safeFloat(d.f170),
        changeAmt: safeFloat(d.f169),
        open: safeFloat(d.f46),
        high: safeFloat(d.f44),
        low: safeFloat(d.f45),
        prevClose: safeFloat(d.f60),
        volume: safeFloat(d.f47),
        amount: safeFloat(d.f48),
        bid1Price: safeFloat(d.f116),
        bid1Volume: safeFloat(d.f117),
        ask1Price: safeFloat(d.f162),
        ask1Volume: safeFloat(d.f168),
        pe: safeFloat(d.f55),
        totalMarketCap: safeFloat(d.f50),
        floatMarketCap: safeFloat(d.f52),
      }]
    } catch { return null }
  }

  p.stockFinancialReportDisclosure = async function stockFinancialReportDisclosure(code?: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_F10_REPORT_DISCLOSURE', filter, '20', 'DISCLOSURE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? ''),
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        disclosureDate: String(it.DISCLOSURE_DATE ?? '').slice(0, 10),
        reportType: String(it.REPORT_TYPE ?? ''),
        status: String(it.STATUS ?? ''),
      }))
    } catch { return null }
  }

  p.stockGoodwillDetail = async function stockGoodwillDetail(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_GOODWILL_DETAIL', `(SECURITY_CODE="${cc}")`, '30', 'REPORT_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        reportDate: String(it.REPORT_DATE ?? '').slice(0, 10),
        goodwill: safeFloat(it.GOODWILL),
        totalAssets: safeFloat(it.TOTAL_ASSETS),
        goodwillPct: safeFloat(it.GOODWILL_RATIO),
        impairment: safeFloat(it.IMPAIRMENT),
      }))
    } catch { return null }
  }

  p.stockGoodwillIndustry = async function stockGoodwillIndustry(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_GOODWILL_INDUSTRY', '', '50', 'GOODWILL_RATIO')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        industry: String(it.INDUSTRY_NAME ?? ''),
        goodwill: safeFloat(it.GOODWILL),
        totalAssets: safeFloat(it.TOTAL_ASSETS),
        goodwillPct: safeFloat(it.GOODWILL_RATIO),
        companyCount: safeFloat(it.COMPANY_COUNT),
      }))
    } catch { return null }
  }

  p.stockPledgeStats = async function stockPledgeStats(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_SHARE_PLEDGE_STAT', '', '10', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        totalPledgeShares: safeFloat(it.TOTAL_PLEDGE_SHARES),
        totalMarketValue: safeFloat(it.TOTAL_MARKET_VALUE),
        pledgeRatio: safeFloat(it.PLEDGE_RATIO),
        pledgeCount: safeFloat(it.PLEDGE_COUNT),
      }))
    } catch { return null }
  }

  p.stockPledgeCompanyStats = async function stockPledgeCompanyStats(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_SHARE_PLEDGE_COMPANY', '', '50', 'PLEDGE_RATIO')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? ''),
        pledgeRatio: safeFloat(it.PLEDGE_RATIO),
        pledgeShares: safeFloat(it.PLEDGE_SHARES),
        totalShares: safeFloat(it.TOTAL_SHARES),
        marketValue: safeFloat(it.MARKET_VALUE),
      }))
    } catch { return null }
  }

  p.stockAnalystRank = async function stockAnalystRank(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_ANALYST_RANK', '', '30', 'RANK')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        rank: safeFloat(it.RANK),
        analystName: String(it.ANALYST_NAME ?? ''),
        orgName: String(it.ORG_NAME ?? ''),
        accuracy: safeFloat(it.ACCURACY),
        successRate: safeFloat(it.SUCCESS_RATE),
        avgReturn: safeFloat(it.AVG_RETURN),
        coverageCount: safeFloat(it.COVERAGE_COUNT),
      }))
    } catch { return null }
  }

  p.blockTradeActiveStats = async function blockTradeActiveStats(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_BLOCK_TRADE_ACTIVE', '', '30', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        brokerage: String(it.BROKERAGE_NAME ?? ''),
        tradeCount: safeFloat(it.TRADE_COUNT),
        totalAmount: safeFloat(it.TOTAL_AMOUNT),
        buyAmount: safeFloat(it.BUY_AMOUNT),
        sellAmount: safeFloat(it.SELL_AMOUNT),
        netAmount: safeFloat(it.NET_AMOUNT),
      }))
    } catch { return null }
  }

  p.blockTradeBranchRank = async function blockTradeBranchRank(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_BLOCK_TRADE_BRANCH_RANK', '', '30', 'RANK')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        rank: safeFloat(it.RANK),
        branchName: String(it.BRANCH_NAME ?? ''),
        brokerage: String(it.BROKERAGE_NAME ?? ''),
        tradeCount: safeFloat(it.TRADE_COUNT),
        totalAmount: safeFloat(it.TOTAL_AMOUNT),
        netAmount: safeFloat(it.NET_AMOUNT),
      }))
    } catch { return null }
  }

  // ── 跨市场 / 特殊数据 ──

  p.stockAhList = async function stockAhList(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_AH_LIST', '', '200', 'SECURITY_CODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? it.SECURITY_NAME ?? ''),
        aPrice: safeFloat(it.A_PRICE),
        hPrice: safeFloat(it.H_PRICE),
        ahPremiumRatio: safeFloat(it.AH_PREMIUM_RATIO),
        hCode: String(it.HSECURITY_CODE ?? ''),
      }))
    } catch { return null }
  }

  p.stockBShareList = async function stockBShareList(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_B_SHARE', '', '200', 'SECURITY_CODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? it.SECURITY_NAME ?? ''),
        price: safeFloat(it.CLOSE_PRICE),
        changePct: safeFloat(it.CHANGE_RATE),
        currency: String(it.CURRENCY ?? ''),
      }))
    } catch { return null }
  }

  p.hkConnectHoldings = async function hkConnectHoldings(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_HSGT_HOLD_DETAIL', `(SECURITY_CODE="${cc}")`, '30', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        heldShares: safeFloat(it.HOLD_SHARES),
        sharePct: safeFloat(it.HOLD_SHARES_RATIO),
        marketValue: safeFloat(it.HOLD_MARKET_CAP),
      }))
    } catch { return null }
  }

  p.hkConnectTop10 = async function hkConnectTop10(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = date ? `(TRADE_DATE="${date}")` : ''
      const items = await dcAll(this, 'RPT_HSGT_TOP10', filter, '10', 'HOLD_SHARES')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''),
        name: String(it.SECURITY_NAME_ABBR ?? it.SECURITY_NAME ?? ''),
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        heldShares: safeFloat(it.HOLD_SHARES),
        marketValue: safeFloat(it.HOLD_MARKET_CAP),
      }))
    } catch { return null }
  }

  p.marginTradeSz = async function marginTradeSz(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_MARGIN_TRADE_DETAIL', `(SECURITY_CODE="${cc}" AND EXCHANGE="S")`, '60', 'TRADE_DATE')
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

  // ── 指数数据 ──

  const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
  const TRENDS2_URL = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get'

  const INDEX_SERIES_FS: Record<string, string> = {
    '1': 'm:1+t:2',   // 上证系列
    '0': 'm:0+t:6',   // 深证系列
    '2': 'm:2+t:2',   // 中证系列
  }

  const PERIOD_KLT: Record<string, string> = {
    daily: '101', weekly: '102', monthly: '103',
    '60m': '60', '30m': '30', '15m': '15', '5m': '5', '1m': '1',
  }

  /** 指数实时行情 — 按上证/深证/中证系列分 fs 查询 */
  p.stockZhIndexSpotEm = async function stockZhIndexSpotEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const fs = INDEX_SERIES_FS[symbol] ?? `m:${symbol}:t:2`
      const params = {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs,
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        price: safeFloat(it.f2),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5),
        amount: safeFloat(it.f6),
        amplitude: safeFloat(it.f7),
        turnoverRate: safeFloat(it.f8),
        pe: safeFloat(it.f9),
        volumeRatio: safeFloat(it.f10),
        high: safeFloat(it.f15),
        low: safeFloat(it.f16),
        open: safeFloat(it.f17),
        prevClose: safeFloat(it.f18),
        totalMarketCap: safeFloat(it.f20),
        floatMarketCap: safeFloat(it.f21),
      }))
    } catch { return null }
  }

  /** 指数日线 — Sina API 原始数据 */
  p.stockZhIndexDaily = async function stockZhIndexDaily(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const fullCode = `sh${c(symbol)}`
      const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${fullCode}&scale=240&ma=no&datalen=1023`
      const resp = await fetch(url, {
        headers: { Referer: 'https://finance.sina.com.cn/', Accept: '*/*' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await resp.text()
      const arr = JSON.parse(text) as Record<string, unknown>[]
      if (!arr?.length) return null
      return arr.map(it => ({
        code: symbol,
        date: String(it.day ?? ''),
        open: safeFloat(it.open),
        high: safeFloat(it.high),
        low: safeFloat(it.low),
        close: safeFloat(it.close),
        volume: safeFloat(it.volume),
      }))
    } catch { return null }
  }

  /** 指数日线 — 东方财富 */
  p.stockZhIndexDailyEm = async function stockZhIndexDailyEm(
    symbol: string, startDate = '', endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: resolveSecId(symbol),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: startDate ? startDate.replace(/-/g, '') : '19000101',
        end: endDate ? endDate.replace(/-/g, '') : '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  /** 指数历史行情 — 东方财富 K线（支持周期） */
  p.indexZhAShist = async function indexZhAShist(
    symbol: string, period = 'daily', startDate = '', endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: resolveSecId(symbol),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: PERIOD_KLT[period] ?? '101',
        fqt: '1',
        beg: startDate ? startDate.replace(/-/g, '') : '19000101',
        end: endDate ? endDate.replace(/-/g, '') : '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
          changePct: p[8] != null ? safeFloat(p[8]) : null,
        }
      })
    } catch { return null }
  }

  /** 指数分钟线 — 东方财富 trends2 */
  p.indexZhAHistMinEm = async function indexZhAHistMinEm(
    symbol: string, period = '5', startDate = '', endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const klt = PERIOD_KLT[period] ?? period
      const data = await (this as EM).getData(TRENDS2_URL, {
        secid: resolveSecId(symbol),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt,
        iscr: '0',
        ndays: '5',
        iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      return trends.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  /** 港股指数实时行情 */
  p.stockHkIndexSpotEm = async function stockHkIndexSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:128+t:1,m:128+t:2',
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        price: safeFloat(it.f2),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5),
        amount: safeFloat(it.f6),
        amplitude: safeFloat(it.f7),
        turnoverRate: safeFloat(it.f8),
        high: safeFloat(it.f15),
        low: safeFloat(it.f16),
        open: safeFloat(it.f17),
        prevClose: safeFloat(it.f18),
        totalMarketCap: safeFloat(it.f20),
        floatMarketCap: safeFloat(it.f21),
      }))
    } catch { return null }
  }

  /** 港股指数日线 — 东方财富 */
  p.stockHkIndexDailyEm = async function stockHkIndexDailyEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: `128.${c(symbol)}`,
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: '19000101', end: '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  /** 全球指数实时行情 */
  p.indexGlobalSpotEm = async function indexGlobalSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const params = {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'm:100+t:1',
        fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21',
      }
      const json = await eastmoneyGet(PUSH2_LIST_URL, params, 15000, EASTMONEY_QUOTE_HEADERS)
      const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined
      const items = (data?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it, idx) => ({
        rank: idx + 1,
        code: String(it.f12 ?? ''),
        name: String(it.f14 ?? ''),
        price: safeFloat(it.f2),
        changePct: safeFloat(it.f3),
        changeAmt: safeFloat(it.f4),
        volume: safeFloat(it.f5),
        amount: safeFloat(it.f6),
        amplitude: safeFloat(it.f7),
        turnoverRate: safeFloat(it.f8),
        high: safeFloat(it.f15),
        low: safeFloat(it.f16),
        open: safeFloat(it.f17),
        prevClose: safeFloat(it.f18),
        totalMarketCap: safeFloat(it.f20),
        floatMarketCap: safeFloat(it.f21),
      }))
    } catch { return null }
  }

  /** 全球指数历史 — 东方财富 K线 */
  p.indexGlobalHistEm = async function indexGlobalHistEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: `100.${c(symbol)}`,
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: '19000101', end: '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  /** 指数成分股 — dcAll */
  p.indexStockCons = async function indexStockCons(indexCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_INDEX_COMPONENT', `(INDEX_CODE="${c(indexCode)}")`, '500', 'INDEX_CODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        indexCode,
        stockCode: String(it.SECURITY_CODE ?? ''),
        stockName: String(it.SECURITY_NAME_ABBR ?? it.SECURITY_NAME ?? ''),
        weight: safeFloat(it.INDEX_WEIGHT ?? it.WEIGHT),
        industry: String(it.INDUSTRY_NAME ?? ''),
      }))
    } catch { return null }
  }

  /** 指数信息列表 — dcAll */
  p.indexStockInfo = async function indexStockInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_INDEX_INFO', '', '200', 'INDEX_CODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        indexCode: String(it.INDEX_CODE ?? ''),
        indexName: String(it.INDEX_NAME_ABBR ?? it.INDEX_NAME ?? ''),
        publisher: String(it.PUBLISHER ?? ''),
        baseDate: String(it.BASE_DATE ?? '').slice(0, 10),
        basePoint: safeFloat(it.BASE_POINT),
        indexType: String(it.INDEX_TYPE ?? ''),
      }))
    } catch { return null }
  }

  /** 指数PE估值 — dcAll */
  p.indexStockPeLg = async function indexStockPeLg(indexCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_INDEX_PE', `(INDEX_CODE="${c(indexCode)}")`, '120', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        indexCode,
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        pe: safeFloat(it.PE),
        peTtm: safeFloat(it.PE_TTM),
        pb: safeFloat(it.PB),
        dividendYield: safeFloat(it.DIVIDEND_YIELD),
      }))
    } catch { return null }
  }

  /** 指数PB估值 — dcAll */
  p.indexStockPbLg = async function indexStockPbLg(indexCode: string): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_INDEX_PB', `(INDEX_CODE="${c(indexCode)}")`, '120', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        indexCode,
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        pb: safeFloat(it.PB),
        pbMrq: safeFloat(it.PB_MRQ),
        pe: safeFloat(it.PE),
        dividendYield: safeFloat(it.DIVIDEND_YIELD),
      }))
    } catch { return null }
  }

  // ── 公募基金 ──

  p.fundNameEm = async function fundNameEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_NAME', '', '500', 'FCODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), name: String(it.SHORT_NAME ?? ''),
        fullName: String(it.FULL_NAME ?? ''), fundType: String(it.FUND_TYPE ?? ''),
        establishDate: String(it.ESTABLISH_DATE ?? '').slice(0, 10),
        manager: String(it.MANAGER ?? ''), custodian: String(it.CUSTODIAN ?? ''),
      }))
    } catch { return null }
  }

  p.fundPurchaseEm = async function fundPurchaseEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_PURCHASE', '', '500', 'FCODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), name: String(it.SHORT_NAME ?? ''),
        purchaseStatus: String(it.PURCHASE_STATUS ?? ''),
        purchaseFee: safeFloat(it.PURCHASE_FEE),
        minPurchase: safeFloat(it.MIN_PURCHASE),
      }))
    } catch { return null }
  }

  p.fundEtfSpotEm = async function fundEtfSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await this.getData(PUSH2_LIST_URL, {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'b:MK0021',
        fields: 'f2,f3,f4,f12,f14',
      })
      const items = ((data as Record<string, unknown>)?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it) => ({
        code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
      }))
    } catch { return null }
  }

  p.fundLofSpotEm = async function fundLofSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await this.getData(PUSH2_LIST_URL, {
        pn: '1', pz: '500', po: '1', np: '1',
        ut: 'bd1d9ddb04089700cf9c27f6f7426281',
        fltt: '2', invt: '2', fid: 'f3',
        fs: 'b:MK0022',
        fields: 'f2,f3,f4,f12,f14',
      })
      const items = ((data as Record<string, unknown>)?.diff ?? []) as Record<string, unknown>[]
      if (!items.length) return null
      return items.map((it) => ({
        code: String(it.f12 ?? ''), name: String(it.f14 ?? ''),
        price: safeFloat(it.f2), changePct: safeFloat(it.f3), changeAmt: safeFloat(it.f4),
      }))
    } catch { return null }
  }

  function fundHistFilter(code: string, period: string, startDate: string, endDate: string, adjust: string) {
    let filter = `(SECURITY_CODE="${normalizeCode(code)}")`
    if (startDate) filter += ` AND TRADE_DATE>="${startDate}"`
    if (endDate) filter += ` AND TRADE_DATE<="${endDate}"`
    if (period) filter += ` AND FREQUENCY="${period}"`
    if (adjust) filter += ` AND ADJUST_TYPE="${adjust}"`
    return filter
  }

  p.fundEtfHistEm = async function fundEtfHistEm(code: string, period = '', startDate = '', endDate = '', adjust = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = fundHistFilter(code, period, startDate, endDate, adjust)
      const items = await dcAll(this, 'RPT_FUND_DAILY_HIST', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: normalizeCode(code),
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        open: safeFloat(it.OPEN_PRICE), high: safeFloat(it.HIGH_PRICE),
        low: safeFloat(it.LOW_PRICE), close: safeFloat(it.CLOSE_PRICE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        changePct: safeFloat(it.CHANGE_RATE),
      }))
    } catch { return null }
  }

  p.fundLofHistEm = async function fundLofHistEm(code: string, period = '', startDate = '', endDate = '', adjust = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = fundHistFilter(code, period, startDate, endDate, adjust)
      const items = await dcAll(this, 'RPT_FUND_DAILY_HIST', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: normalizeCode(code),
        date: String(it.TRADE_DATE ?? '').slice(0, 10),
        open: safeFloat(it.OPEN_PRICE), high: safeFloat(it.HIGH_PRICE),
        low: safeFloat(it.LOW_PRICE), close: safeFloat(it.CLOSE_PRICE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        changePct: safeFloat(it.CHANGE_RATE),
      }))
    } catch { return null }
  }

  function fundMinPeriodKlt(period: string): string {
    const map: Record<string, string> = { '1': '1', '5': '5', '15': '15', '30': '30', '60': '60' }
    return map[period] ?? '5'
  }

  p.fundEtfHistMinEm = async function fundEtfHistMinEm(code: string, period = '5', startDate = '', endDate = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const klt = fundMinPeriodKlt(period)
      const data = await this.getData('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt,
        iscr: '0', ndays: '1', iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      const cc = normalizeCode(code)
      let lines = trends.map(line => {
        const bar = parseTrend2IntradayLine(line)
        if (!bar) return null
        return { code: cc, time: bar.time, price: bar.price, volume: bar.volume, amount: bar.amount }
      }).filter(Boolean) as Record<string, unknown>[]
      if (startDate) lines = lines.filter(l => String(l.time) >= startDate)
      if (endDate) lines = lines.filter(l => String(l.time) <= endDate)
      return lines.length ? lines : null
    } catch { return null }
  }

  p.fundLofHistMinEm = async function fundLofHistMinEm(code: string, period = '5', startDate = '', endDate = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const klt = fundMinPeriodKlt(period)
      const data = await this.getData('https://push2his.eastmoney.com/api/qt/stock/trends2/get', {
        secid: resolveSecId(code),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt,
        iscr: '0', ndays: '1', iscca: '0',
      })
      const trends = data?.trends as string[] | undefined
      if (!trends?.length) return null
      const cc = normalizeCode(code)
      let lines = trends.map(line => {
        const bar = parseTrend2IntradayLine(line)
        if (!bar) return null
        return { code: cc, time: bar.time, price: bar.price, volume: bar.volume, amount: bar.amount }
      }).filter(Boolean) as Record<string, unknown>[]
      if (startDate) lines = lines.filter(l => String(l.time) >= startDate)
      if (endDate) lines = lines.filter(l => String(l.time) <= endDate)
      return lines.length ? lines : null
    } catch { return null }
  }

  p.fundInfoIndexEm = async function fundInfoIndexEm(symbol = '', indicator = ''): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = ''
      if (symbol) filter = `(INDEX_CODE="${symbol}")`
      if (indicator) filter += filter ? ` AND INDICATOR="${indicator}"` : `(INDICATOR="${indicator}")`
      const items = await dcAll(this, 'RPT_FUND_INDEX', filter, '500')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), name: String(it.SHORT_NAME ?? ''),
        indexCode: String(it.INDEX_CODE ?? ''), indexName: String(it.INDEX_NAME ?? ''),
        trackingError: safeFloat(it.TRACKING_ERROR),
        infoRatio: safeFloat(it.INFO_RATIO),
      }))
    } catch { return null }
  }

  p.fundNavEm = async function fundNavEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = normalizeCode(code)
      const items = await dcAll(this, 'RPT_FUND_NAV', `(FCODE="${cc}")`, '120', 'END_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: cc,
        date: String(it.END_DATE ?? '').slice(0, 10),
        nav: safeFloat(it.NAV ?? it.DWJZ),
        accNav: safeFloat(it.ACC_NAV ?? it.LJJZ),
        changePct: safeFloat(it.NAV_GR ?? it.RZDF),
      }))
    } catch { return null }
  }

  p.fundOpenFundDayEm = async function fundOpenFundDayEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = normalizeCode(code)
      const items = await dcAll(this, 'RPT_FUND.openday', '', '100')
      if (!items.length) return null
      let result = items
      if (cc) result = result.filter((it: Record<string, unknown>) => String(it.FCODE ?? '') === cc)
      if (!result.length) return null
      return result.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), name: String(it.SHORT_NAME ?? ''),
        openDate: String(it.OPEN_DATE ?? it.TRADE_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.fundOpenFundDailyEm = async function fundOpenFundDailyEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = normalizeCode(code)
      const filter = cc ? `(FCODE="${cc}")` : ''
      const items = await dcAll(this, 'RPT_FUND_DAILY', filter, '500', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), date: String(it.TRADE_DATE ?? '').slice(0, 10),
        nav: safeFloat(it.NAV), accNav: safeFloat(it.ACC_NAV),
        changePct: safeFloat(it.CHANGE_RATE),
      }))
    } catch { return null }
  }

  p.fundDividendEm = async function fundDividendEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = normalizeCode(code)
      const filter = cc ? `(FCODE="${cc}")` : ''
      const items = await dcAll(this, 'RPT_FUND_DIVIDEND', filter, '200', 'ASSIGN_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), name: String(it.SHORT_NAME ?? ''),
        assignDate: String(it.ASSIGN_DATE ?? '').slice(0, 10),
        dividendPerUnit: safeFloat(it.DIVIDEND_PER_UNIT),
        recordDate: String(it.RECORD_DATE ?? '').slice(0, 10),
        payDate: String(it.PAY_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.fundManagerEm = async function fundManagerEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = normalizeCode(code)
      const filter = cc ? `(FCODE="${cc}")` : ''
      const items = await dcAll(this, 'RPT_FUND_MANAGER', filter, '200', 'START_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.FCODE ?? ''), managerName: String(it.MANAGER_NAME ?? ''),
        position: String(it.POSITION ?? ''),
        startDate: String(it.START_DATE ?? '').slice(0, 10),
        endDate: String(it.END_DATE ?? '').slice(0, 10),
      }))
    } catch { return null }
  }

  p.fundEtfCategoryThs = async function fundEtfCategoryThs(symbol = '', date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = ''
      if (symbol) filter = `(INDEX_CODE="${symbol}")`
      if (date) filter += filter ? ` AND TRADE_DATE="${date}"` : `(TRADE_DATE="${date}")`
      const items = await dcAll(this, 'RPT_FUND_ETF_THS', filter, '500', 'TRADE_DATE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? ''),
        category: String(it.CATEGORY ?? ''),
        changePct: safeFloat(it.CHANGE_RATE),
      }))
    } catch { return null }
  }

  p.fundEtfSpotThs = async function fundEtfSpotThs(date = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = date ? `(TRADE_DATE="${date}")` : ''
      const items = await dcAll(this, 'RPT_FUND_ETF_SPOT_THS', filter, '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? ''),
        price: safeFloat(it.CLOSE_PRICE), changePct: safeFloat(it.CHANGE_RATE),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
      }))
    } catch { return null }
  }

  // ── 基金/指数补充数据源 ──

  p.fundInfoThs = async function fundInfoThs(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(symbol)
      const items = await dcAll(this, 'RPT_FUND_INFO_THS', `(SECURITY_CODE="${cc}")`, '1')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? it.SECURITY_NAME_ABBR ?? ''),
        fundType: String(it.FUND_TYPE ?? ''),
        establishDate: String(it.ESTABLISH_DATE ?? '').slice(0, 10),
        manager: String(it.MANAGER ?? ''), custodian: String(it.CUSTODIAN ?? ''),
        totalAssets: safeFloat(it.TOTAL_ASSETS),
      }))
    } catch { return null }
  }

  p.fundIndividualBasicInfoXq = async function fundIndividualBasicInfoXq(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(symbol)
      const items = await dcAll(this, 'RPT_FUND_XQ_INFO', `(SECURITY_CODE="${cc}")`, '1')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? it.SECURITY_NAME_ABBR ?? ''),
        fundType: String(it.FUND_TYPE ?? ''),
        manager: String(it.MANAGER ?? ''),
        establishDate: String(it.ESTABLISH_DATE ?? '').slice(0, 10),
        scale: safeFloat(it.TOTAL_ASSETS ?? it.FUND_SIZE),
      }))
    } catch { return null }
  }

  p.fundEtfCategorySina = async function fundEtfCategorySina(symbol = ''): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = symbol ? `(SECURITY_CODE="${c(symbol)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_ETF_SINA', filter, '500')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? ''), name: String(it.SECURITY_NAME ?? ''),
        category: String(it.CATEGORY ?? it.ETF_TYPE ?? ''),
        changePct: safeFloat(it.CHANGE_RATE),
      }))
    } catch { return null }
  }

  p.stockZhIndexSpotSina = async function stockZhIndexSpotSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_INDEX_SINA_SPOT', '', '500')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? it.INDEX_CODE ?? ''),
        name: String(it.SECURITY_NAME ?? it.INDEX_NAME ?? ''),
        price: safeFloat(it.CLOSE_PRICE ?? it.PRICE),
        changePct: safeFloat(it.CHANGE_RATE ?? it.CHANGE_PCT),
        changeAmt: safeFloat(it.CHANGE_AMOUNT),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        open: safeFloat(it.OPEN_PRICE), prevClose: safeFloat(it.PREV_CLOSE),
      }))
    } catch { return null }
  }

  p.stockZhIndexDailyTx = async function stockZhIndexDailyTx(
    symbol: string, startDate = '', endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: resolveSecId(symbol),
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: startDate ? startDate.replace(/-/g, '') : '19000101',
        end: endDate ? endDate.replace(/-/g, '') : '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  p.stockHkIndexSpotSina = async function stockHkIndexSpotSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_HK_INDEX_SINA', '', '100')
      if (!items.length) return null
      return items.map((it: Record<string, unknown>) => ({
        code: String(it.SECURITY_CODE ?? it.INDEX_CODE ?? ''),
        name: String(it.SECURITY_NAME ?? it.INDEX_NAME ?? ''),
        price: safeFloat(it.CLOSE_PRICE ?? it.PRICE),
        changePct: safeFloat(it.CHANGE_RATE ?? it.CHANGE_PCT),
        changeAmt: safeFloat(it.CHANGE_AMOUNT),
        volume: safeFloat(it.VOLUME), amount: safeFloat(it.AMOUNT),
        high: safeFloat(it.HIGH_PRICE), low: safeFloat(it.LOW_PRICE),
        open: safeFloat(it.OPEN_PRICE), prevClose: safeFloat(it.PREV_CLOSE),
      }))
    } catch { return null }
  }

  p.stockHkIndexDailySina = async function stockHkIndexDailySina(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: `128.${c(symbol)}`,
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: '19000101', end: '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  p.indexUsStockSina = async function indexUsStockSina(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: `105.${c(symbol)}`,
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: '19000101', end: '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  p.indexGlobalHistSina = async function indexGlobalHistSina(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const data = await (this as EM).getData(KLINE_URL, {
        secid: `100.${c(symbol)}`,
        fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt: '101', fqt: '1',
        beg: '19000101', end: '20500101',
      })
      const klines = data?.klines as string[] | undefined
      if (!klines?.length) return null
      return klines.map(line => {
        const p = line.split(',')
        return {
          code: symbol, date: p[0] ?? '',
          open: safeFloat(p[1]), close: safeFloat(p[2]),
          high: safeFloat(p[3]), low: safeFloat(p[4]),
          volume: safeFloat(p[5]), amount: safeFloat(p[6]),
        }
      })
    } catch { return null }
  }

  // ── 公募基金：规模/概览/持仓/排行/评级/分红/费率 ──

  p.fundAumEm = async function fundAumEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_AUM', '', '500', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundAumHistEm = async function fundAumHistEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_AUM_HIST', filter, '120', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundAumTrendEm = async function fundAumTrendEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_AUM_TREND', filter, '120', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundOverviewEm = async function fundOverviewEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_OVERVIEW', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundOpenFundInfoEm = async function fundOpenFundInfoEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_OPEN_INFO', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundOpenFundRankEm = async function fundOpenFundRankEm(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = symbol ? `(FCODE="${c(symbol)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_OPEN_RANK', filter, '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundCfEm = async function fundCfEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_CF', filter, '120', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundBalancePositionLg = async function fundBalancePositionLg(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_BALANCE_POSITION', filter, '120', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundStockPositionLg = async function fundStockPositionLg(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_STOCK_POSITION', filter, '120', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundLinghuoPositionLg = async function fundLinghuoPositionLg(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_LINGHUO_POSITION', filter, '120', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundPortfolioHoldEm = async function fundPortfolioHoldEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_PORTFOLIO_HOLD', filter, '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundPortfolioBondHoldEm = async function fundPortfolioBondHoldEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_PORTFOLIO_BOND', filter, '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundPortfolioChangeEm = async function fundPortfolioChangeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_PORTFOLIO_CHANGE', filter, '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundPortfolioIndustryAllocationEm = async function fundPortfolioIndustryAllocationEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_PORTFOLIO_INDUSTRY', filter, '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundHoldStructureEm = async function fundHoldStructureEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_HOLD_STRUCTURE', filter, '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundExchangeRankEm = async function fundExchangeRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_EXCHANGE_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundFhRankEm = async function fundFhRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_FH_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundLcxRankEm = async function fundLcxRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_LCX_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundMoneyRankEm = async function fundMoneyRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_MONEY_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundRatingAll = async function fundRatingAll(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_RATING_ALL', '', '100', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundRatingSh = async function fundRatingSh(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_RATING_SH', '', '100', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundRatingZs = async function fundRatingZs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_RATING_ZS', '', '100', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundRatingJa = async function fundRatingJa(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_RATING_JA', '', '100', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundFeeEm = async function fundFeeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_FEE', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundFhEm = async function fundFhEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_FH', filter, '100', 'ASSIGN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundDividendSina = async function fundDividendSina(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_DIVIDEND_SINA', filter, '100', 'ASSIGN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundScaleChangeEm = async function fundScaleChangeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_SCALE_CHANGE', filter, '120', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundScaleOpenSina = async function fundScaleOpenSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_SCALE_OPEN_SINA', '', '500', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundScaleCloseSina = async function fundScaleCloseSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_SCALE_CLOSE_SINA', '', '500', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundScaleDailySzse = async function fundScaleDailySzse(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_SCALE_DAILY_SZSE', '', '120', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundScaleStructuredSina = async function fundScaleStructuredSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_SCALE_STRUCTURED_SINA', '', '500', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundEtfScaleSse = async function fundEtfScaleSse(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_ETF_SCALE_SSE', '', '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundEtfScaleSzse = async function fundEtfScaleSzse(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_ETF_SCALE_SZSE', '', '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundValueEstimationEm = async function fundValueEstimationEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_VALUE_ESTIMATION', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundEtfDividendSina = async function fundEtfDividendSina(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_ETF_DIVIDEND_SINA', filter, '100', 'ASSIGN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundEtfHistSina = async function fundEtfHistSina(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_ETF_HIST_SINA', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundMoneyFundDailyEm = async function fundMoneyFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_MONEY_DAILY', '', '500', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundMoneyFundInfoEm = async function fundMoneyFundInfoEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_MONEY_INFO', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundFinancialFundDailyEm = async function fundFinancialFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_FINANCIAL_DAILY', '', '500', 'FCODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundFinancialFundInfoEm = async function fundFinancialFundInfoEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_FINANCIAL_INFO', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundGradedFundDailyEm = async function fundGradedFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_GRADED_DAILY', '', '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundGradedFundInfoEm = async function fundGradedFundInfoEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_GRADED_INFO', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundEtfFundDailyEm = async function fundEtfFundDailyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_ETF_DAILY', '', '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundEtfFundInfoEm = async function fundEtfFundInfoEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_ETF_INFO', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundHkFundHistEm = async function fundHkFundHistEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_HK_HIST', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundHkRankEm = async function fundHkRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_HK_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundIndividualAchievementXq = async function fundIndividualAchievementXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_XQ_ACHIEVEMENT', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundIndividualAnalysisXq = async function fundIndividualAnalysisXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_XQ_ANALYSIS', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundIndividualDetailHoldXq = async function fundIndividualDetailHoldXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_XQ_DETAIL_HOLD', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundIndividualDetailInfoXq = async function fundIndividualDetailInfoXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_XQ_DETAIL_INFO', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundIndividualProfitProbabilityXq = async function fundIndividualProfitProbabilityXq(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(FCODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_FUND_XQ_PROFIT', filter, '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundReportAssetAllocationCninfo = async function fundReportAssetAllocationCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_REPORT_ASSET', '', '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundReportIndustryAllocationCninfo = async function fundReportIndustryAllocationCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_REPORT_INDUSTRY', '', '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundReportStockCninfo = async function fundReportStockCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_REPORT_STOCK', '', '100', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundNewFoundEm = async function fundNewFoundEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_NEW_FOUND', '', '100', 'ESTABLISH_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.fundNewFoundThs = async function fundNewFoundThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_FUND_NEW_FOUND_THS', '', '100', 'ESTABLISH_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.reitsHistEm = async function reitsHistEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_REITS_HIST', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.reitsRealtimeEm = async function reitsRealtimeEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_REITS_REALTIME', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 财务报表 ──

  p.stockFinancialReportSina = async function stockFinancialReportSina(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_SINA', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialAbstract = async function stockFinancialAbstract(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_ABSTRACT', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialAbstractNewThs = async function stockFinancialAbstractNewThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_ABSTRACT_THS', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialAnalysisIndicator = async function stockFinancialAnalysisIndicator(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_INDICATOR', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialAnalysisIndicatorEm = async function stockFinancialAnalysisIndicatorEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_INDICATOR_EM', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialBenefitNewThs = async function stockFinancialBenefitNewThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_BENEFIT_THS', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialCashNewThs = async function stockFinancialCashNewThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_CASH_THS', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialDebtNewThs = async function stockFinancialDebtNewThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_DEBT_THS', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialHkReportEm = async function stockFinancialHkReportEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_HK_REPORT', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialHkAnalysisIndicatorEm = async function stockFinancialHkAnalysisIndicatorEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_HK_INDICATOR', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialUsReportEm = async function stockFinancialUsReportEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_US_REPORT', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFinancialUsAnalysisIndicatorEm = async function stockFinancialUsAnalysisIndicatorEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_FINANCIAL_US_INDICATOR', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLrbEm = async function stockLrbEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_LRB', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockXjllEm = async function stockXjllEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_XJLL', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZcfzEm = async function stockZcfzEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_ZCFZ', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZcfzBjEm = async function stockZcfzBjEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_ZCFZ_BJ', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockReportDisclosure = async function stockReportDisclosure(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_REPORT_DISCLOSURE', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockReportFundHold = async function stockReportFundHold(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_REPORT_FUND_HOLD', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockReportFundHoldDetail = async function stockReportFundHoldDetail(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_REPORT_FUND_HOLD_DETAIL', `(SECURITY_CODE="${cc}")`, '20', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 板块/行业 ──

  p.stockBoardConceptNameEm = async function stockBoardConceptNameEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_NAME', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardConceptSpotEm = async function stockBoardConceptSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_SPOT', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardConceptConsEm = async function stockBoardConceptConsEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_CONS', `(BOARD_CODE="${cc}")`, '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardConceptHistEm = async function stockBoardConceptHistEm(
    code: string, period = 'daily', startDate = '', endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = `(BOARD_CODE="${c(code)}")`
      if (startDate) filter += ` AND TRADE_DATE>="${startDate}"`
      if (endDate) filter += ` AND TRADE_DATE<="${endDate}"`
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_HIST', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardConceptHistMinEm = async function stockBoardConceptHistMinEm(
    code: string, period = '5',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = `(BOARD_CODE="${c(code)}") AND FREQUENCY="${period}"`
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_MIN', filter, '500', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardConceptIndexThs = async function stockBoardConceptIndexThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_INDEX_THS', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardConceptInfoThs = async function stockBoardConceptInfoThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CONCEPT_INFO_THS', `(BOARD_CODE="${cc}")`, '1')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustryNameEm = async function stockBoardIndustryNameEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_NAME', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustrySpotEm = async function stockBoardIndustrySpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_SPOT', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustryConsEm = async function stockBoardIndustryConsEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_CONS', `(BOARD_CODE="${cc}")`, '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustryHistEm = async function stockBoardIndustryHistEm(
    code: string, period = 'daily', startDate = '', endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = `(BOARD_CODE="${c(code)}")`
      if (startDate) filter += ` AND TRADE_DATE>="${startDate}"`
      if (endDate) filter += ` AND TRADE_DATE<="${endDate}"`
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_HIST', filter, '250', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustryHistMinEm = async function stockBoardIndustryHistMinEm(
    code: string, period = '5',
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = `(BOARD_CODE="${c(code)}") AND FREQUENCY="${period}"`
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_MIN', filter, '500', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustryIndexThs = async function stockBoardIndustryIndexThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_INDEX_THS', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardIndustrySummaryThs = async function stockBoardIndustrySummaryThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_INDUSTRY_SUMMARY_THS', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockBoardChangeEm = async function stockBoardChangeEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BOARD_CHANGE', '', '500', 'BOARD_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSectorDetail = async function stockSectorDetail(indicator: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = indicator ? `(INDICATOR="${indicator}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SECTOR_DETAIL', filter, '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSectorSpot = async function stockSectorSpot(indicator: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = indicator ? `(INDICATOR="${indicator}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SECTOR_SPOT', filter, '500', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 热搜/排行 ──

  p.stockHotRankEm = async function stockHotRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotRankDetailEm = async function stockHotRankDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_HOT_RANK_DETAIL', `(SECURITY_CODE="${cc}")`, '30', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotRankDetailRealtimeEm = async function stockHotRankDetailRealtimeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_HOT_RANK_REALTIME', `(SECURITY_CODE="${cc}")`, '1')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotRankLatestEm = async function stockHotRankLatestEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_RANK_LATEST', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotRankRelateEm = async function stockHotRankRelateEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_HOT_RANK_RELATE', `(SECURITY_CODE="${cc}")`, '20', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotKeywordEm = async function stockHotKeywordEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_KEYWORD', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotUpEm = async function stockHotUpEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_UP', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotSearchBaidu = async function stockHotSearchBaidu(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_SEARCH_BAIDU', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotDealXq = async function stockHotDealXq(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_DEAL_XQ', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotFollowXq = async function stockHotFollowXq(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_FOLLOW_XQ', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHotTweetXq = async function stockHotTweetXq(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HOT_TWEET_XQ', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkHotRankEm = async function stockHkHotRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_HOT_RANK', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkHotRankDetailEm = async function stockHkHotRankDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_HK_HOT_DETAIL', `(SECURITY_CODE="${cc}")`, '30', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkHotRankDetailRealtimeEm = async function stockHkHotRankDetailRealtimeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_HK_HOT_REALTIME', `(SECURITY_CODE="${cc}")`, '1')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkHotRankLatestEm = async function stockHkHotRankLatestEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_HOT_LATEST', '', '100', 'RANK')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 估值数据 ──

  p.stockAMarketPeLg = async function stockAMarketPeLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_PE_MARKET', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAMarketPbLg = async function stockAMarketPbLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_PB_MARKET', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAHighLowStatistics = async function stockAHighLowStatistics(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HIGH_LOW', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockABelowNetAssetStatistics = async function stockABelowNetAssetStatistics(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BELOW_NAV', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockATtmLyr = async function stockATtmLyr(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_PE_TTM', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAAllPb = async function stockAAllPb(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ALL_PB', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAStockPositionLg = async function stockAStockPositionLg(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_POSITION', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockABuffettIndexLg = async function stockABuffettIndexLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_BUFFETT', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockACongestionLg = async function stockACongestionLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_CONGESTION', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAGxlLg = async function stockAGxlLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GXL', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAHkGxlLg = async function stockAHkGxlLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_GXL', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkValuationBaidu = async function stockHkValuationBaidu(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_VALUATION', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkValuationComparisonEm = async function stockHkValuationComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_VALUATION_CMP', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZhValuationBaidu = async function stockZhValuationBaidu(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_ZH_VALUATION', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZhValuationComparisonEm = async function stockZhValuationComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_ZH_VALUATION_CMP', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZhAbComparisonEm = async function stockZhAbComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_AB_CMP', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZhGrowthComparisonEm = async function stockZhGrowthComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GROWTH_CMP', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZhScaleComparisonEm = async function stockZhScaleComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SCALE_CMP', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZhDupontComparisonEm = async function stockZhDupontComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_DUPONT_CMP', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockValueEm = async function stockValueEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_VALUE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarketActivityLegu = async function stockMarketActivityLegu(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARKET_ACTIVITY', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarketPeLg = async function stockMarketPeLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARKET_PE', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarketPbLg = async function stockMarketPbLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARKET_PB', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 资金流向 ──

  p.stockFundFlowIndividual = async function stockFundFlowIndividual(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_FUND_FLOW_INDIVIDUAL', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFundFlowIndustry = async function stockFundFlowIndustry(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_FUND_FLOW_INDUSTRY', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFundFlowConcept = async function stockFundFlowConcept(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_FUND_FLOW_CONCEPT', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFundFlowBigDeal = async function stockFundFlowBigDeal(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_FUND_FLOW_BIG', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMainFundFlow = async function stockMainFundFlow(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MAIN_FUND_FLOW', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarketFundFlow = async function stockMarketFundFlow(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARKET_FLOW', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSectorFundFlowRank = async function stockSectorFundFlowRank(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SECTOR_FLOW_RANK', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSectorFundFlowSummary = async function stockSectorFundFlowSummary(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SECTOR_FLOW_SUM', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSectorFundFlowHist = async function stockSectorFundFlowHist(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SECTOR_FLOW_HIST', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockConceptFundFlowHist = async function stockConceptFundFlowHist(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_CONCEPT_FLOW_HIST', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 评论/评级 ──

  p.stockCommentEm = async function stockCommentEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_COMMENT', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCommentDetailZlkpJgcydEm = async function stockCommentDetailZlkpJgcydEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_COMMENT_CONTROL', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCommentDetailScrdFocusEm = async function stockCommentDetailScrdFocusEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_COMMENT_FOCUS', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCommentDetailScrdDesireEm = async function stockCommentDetailScrdDesireEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_COMMENT_DESIRE', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCommentDetailZhpjLspfEm = async function stockCommentDetailZhpjLspfEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_COMMENT_RATING', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 持股结构 ──

  p.stockCirculateStockHolder = async function stockCirculateStockHolder(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_CIRCULATE_HOLDER', filter, '50', 'END_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMainStockHolder = async function stockMainStockHolder(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_MAIN_HOLDER', filter, '50', 'END_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockFundStockHolder = async function stockFundStockHolder(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_FUND_HOLDER', filter, '50', 'END_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 股东持股分析 ──

  p.stockGdfxHoldingAnalyseEm = async function stockGdfxHoldingAnalyseEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_ANALYSE', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxHoldingChangeEm = async function stockGdfxHoldingChangeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_CHANGE', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxHoldingTeamworkEm = async function stockGdfxHoldingTeamworkEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_TEAMWORK', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxHoldingStatisticsEm = async function stockGdfxHoldingStatisticsEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_STATISTICS', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxFreeHoldingAnalyseEm = async function stockGdfxFreeHoldingAnalyseEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_FREE_ANALYSE', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxFreeHoldingChangeEm = async function stockGdfxFreeHoldingChangeEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_FREE_CHANGE', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxFreeHoldingTeamworkEm = async function stockGdfxFreeHoldingTeamworkEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_FREE_TEAMWORK', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxFreeHoldingStatisticsEm = async function stockGdfxFreeHoldingStatisticsEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_FREE_STATISTICS', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxTop10Em = async function stockGdfxTop10Em(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_TOP10', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGdfxFreeTop10Em = async function stockGdfxFreeTop10Em(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GDFX_FREE_TOP10', filter, '50', 'REPORT_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 股权质押/担保 ──

  p.stockGpzyProfileEm = async function stockGpzyProfileEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GPZY_PROFILE', '', '100', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGpzyPledgeRatioEm = async function stockGpzyPledgeRatioEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GPZY_RATIO', '', '100', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGpzyPledgeRatioDetailEm = async function stockGpzyPledgeRatioDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GPZY_DETAIL', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGpzyIndustryDataEm = async function stockGpzyIndustryDataEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GPZY_INDUSTRY', '', '100', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGpzyDistributeStatisticsCompanyEm = async function stockGpzyDistributeStatisticsCompanyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GPZY_COMPANY', '', '100', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGpzyDistributeStatisticsBankEm = async function stockGpzyDistributeStatisticsBankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GPZY_BANK', '', '100', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGpzyIndividualPledgeRatioDetailEm = async function stockGpzyIndividualPledgeRatioDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_GPZY_INDIVIDUAL', filter, '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCgEquityMortgageCninfo = async function stockCgEquityMortgageCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_CG_MORTGAGE', filter, '50', 'ANN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCgGuaranteeCninfo = async function stockCgGuaranteeCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_CG_GUARANTEE', filter, '50', 'ANN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockCgLawsuitCninfo = async function stockCgLawsuitCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_CG_LAWSUIT', filter, '50', 'ANN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── IPO/新股 ──

  p.stockIpoInfo = async function stockIpoInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_INFO', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoBenefitThs = async function stockIpoBenefitThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_BENEFIT', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoDeclareEm = async function stockIpoDeclareEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_DECLARE', '', '100', 'DECLARE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoReviewEm = async function stockIpoReviewEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_REVIEW', '', '100', 'REVIEW_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoTutorEm = async function stockIpoTutorEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_TUTOR', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoThs = async function stockIpoThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_THS', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoHkThs = async function stockIpoHkThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_HK_THS', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIpoSummaryCninfo = async function stockIpoSummaryCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_IPO_SUMMARY', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockNewIpoCninfo = async function stockNewIpoCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_NEW_IPO', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockNewGhCninfo = async function stockNewGhCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_NEW_GH', '', '100', 'LISTING_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockNewASpotEm = async function stockNewASpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_NEW_A_SPOT', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterAllEm = async function stockRegisterAllEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_ALL', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterSh = async function stockRegisterSh(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_SH', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterSz = async function stockRegisterSz(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_SZ', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterCyb = async function stockRegisterCyb(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_CYB', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterKcb = async function stockRegisterKcb(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_KCB', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterBj = async function stockRegisterBj(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_BJ', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRegisterDb = async function stockRegisterDb(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REGISTER_DB', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockDxsylEm = async function stockDxsylEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DXSYL', '', '100', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 融资融券 ──

  p.stockMarginSse = async function stockMarginSse(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARGIN_SSE', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarginSzse = async function stockMarginSzse(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARGIN_SZSE', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarginAccountInfo = async function stockMarginAccountInfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARGIN_ACCOUNT', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarginRatioPa = async function stockMarginRatioPa(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARGIN_RATIO', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockMarginUnderlyingInfoSzse = async function stockMarginUnderlyingInfoSzse(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_MARGIN_UNDERLYING', '', '200', 'SECURITY_CODE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 大宗交易 (DZJY) ──

  p.stockDzjySctj = async function stockDzjySctj(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DZJY_SCTJ', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockDzjyMrmx = async function stockDzjyMrmx(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DZJY_MRMX', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockDzjyMrtj = async function stockDzjyMrtj(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DZJY_MRTJ', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockDzjyHygtj = async function stockDzjyHygtj(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DZJY_HYGTJ', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockDzjyHyyybtj = async function stockDzjyHyyybtj(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DZJY_HYYYB', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockDzjyYybph = async function stockDzjyYybph(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_DZJY_YYBPH', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 龙虎榜 (LHB) ──

  p.stockLhbDetailEm = async function stockLhbDetailEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_DETAIL', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbDetailDailySina = async function stockLhbDetailDailySina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_DETAIL_SINA', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbJgstatisticEm = async function stockLhbJgstatisticEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_JGSTAT', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbStockStatisticEm = async function stockLhbStockStatisticEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_STOCK_STAT', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbStockDetailEm = async function stockLhbStockDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_LHB_STOCK_DETAIL', `(SECURITY_CODE="${cc}")`, '30', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbYybDetailEm = async function stockLhbYybDetailEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_YYB_DETAIL', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbYybphEm = async function stockLhbYybphEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_YYBPH', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbYytjSina = async function stockLhbYytjSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_YYTJ_SINA', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbJgmxSina = async function stockLhbJgmxSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_JGMX_SINA', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbJgzzSina = async function stockLhbJgzzSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_JGZZ_SINA', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbGgtjSina = async function stockLhbGgtjSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_GGTJ_SINA', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbTraderstatisticEm = async function stockLhbTraderstatisticEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_TRADER', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbJgmmtjEm = async function stockLhbJgmmtjEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_JGMMTJ', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockLhbHyyybEm = async function stockLhbHyyybEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_LHB_HYYYB', '', '50', 'TRADE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 新闻/公告 ──

  p.stockNewsEm = async function stockNewsEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_NEWS', `(SECURITY_CODE="${cc}")`, '30', 'PUBLISH_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockNewsMainCx = async function stockNewsMainCx(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_NEWS_CX', '', '50', 'PUBLISH_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockNoticeReport = async function stockNoticeReport(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_NOTICE', `(SECURITY_CODE="${cc}")`, '30', 'NOTICE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIndividualNoticeReport = async function stockIndividualNoticeReport(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_INDIVIDUAL_NOTICE', `(SECURITY_CODE="${cc}")`, '30', 'NOTICE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockResearchReportEm = async function stockResearchReportEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_RESEARCH', `(SECURITY_CODE="${cc}")`, '30', 'PUBLISH_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── 限售/回购 ──

  p.stockRestrictedReleaseQueueEm = async function stockRestrictedReleaseQueueEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_RESTRICTED_QUEUE', '', '50', 'FREE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRestrictedReleaseQueueSina = async function stockRestrictedReleaseQueueSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_RESTRICTED_SINA', '', '50', 'FREE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRestrictedReleaseDetailEm = async function stockRestrictedReleaseDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_RESTRICTED_DETAIL', `(SECURITY_CODE="${cc}")`, '30', 'FREE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRestrictedReleaseStockholderEm = async function stockRestrictedReleaseStockholderEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const cc = c(code)
      const items = await dcAll(this, 'RPT_STOCK_RESTRICTED_HOLDER', `(SECURITY_CODE="${cc}")`, '30', 'FREE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRestrictedReleaseSummaryEm = async function stockRestrictedReleaseSummaryEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_RESTRICTED_SUMMARY', '', '50', 'FREE_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRepurchaseEm = async function stockRepurchaseEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_REPURCHASE', '', '50', 'ANN_DATE')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── Group 1: Technical/Screening ──

  p.stockRankXzjpThs = async function stockRankXzjpThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_RANK_XZJP', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockChangesEm = async function stockChangesEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_CHANGES', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSyEm = async function stockSyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SY', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSyHyEm = async function stockSyHyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SY_HY', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSyJzEm = async function stockSyJzEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SY_JZ', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSyProfileEm = async function stockSyProfileEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SY_PROFILE', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockSyYqEm = async function stockSyYqEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_SY_YQ', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockPgEm = async function stockPgEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_PG', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockXgsglbEm = async function stockXgsglbEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_XGSGLB', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockXgsrThs = async function stockXgsrThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_XGSR_THS', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZdhtmxEm = async function stockZdhtmxEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ZDHTMX', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockQsjyEm = async function stockQsjyEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_QSJY', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockQbzfEm = async function stockQbzfEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_QBZF', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockYzxdrEm = async function stockYzxdrEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_YZXDR', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGddhEm = async function stockGddhEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GDDH', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockGgcgEm = async function stockGgcgEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_GGCG', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZygcEm = async function stockZygcEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ZYGC', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockZyjsThs = async function stockZyjsThs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ZYJS_THS', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockEbsLg = async function stockEbsLg(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_EBS', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockPriceJs = async function stockPriceJs(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_PRICE_JS', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── Group 2: HSGT ──

  p.stockHsgtHistEm = async function stockHsgtHistEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_HIST', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtFundFlowSummaryEm = async function stockHsgtFundFlowSummaryEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_FLOW', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtFundMinEm = async function stockHsgtFundMinEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_MIN', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtStockStatisticsEm = async function stockHsgtStockStatisticsEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_STOCK', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtInstitutionStatisticsEm = async function stockHsgtInstitutionStatisticsEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_INST', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtBoardRankEm = async function stockHsgtBoardRankEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_BOARD', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtShHkSpotEm = async function stockHsgtShHkSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HSGT_SH_HK', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtHoldStockEm = async function stockHsgtHoldStockEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HSGT_HOLD', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtIndividualEm = async function stockHsgtIndividualEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HSGT_INDIVIDUAL', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHsgtIndividualDetailEm = async function stockHsgtIndividualDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HSGT_DETAIL', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── Group 3: HK Stock ──

  p.stockHkSpot = async function stockHkSpot(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_SPOT', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkSpotEm = async function stockHkSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_SPOT_EM', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkHist = async function stockHkHist(code: string, period = 'daily'): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      if (period) filter += filter ? ` AND FREQUENCY="${period}"` : `(FREQUENCY="${period}")`
      const items = await dcAll(this, 'RPT_STOCK_HK_HIST', filter, '250')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkHistMinEm = async function stockHkHistMinEm(code: string, period = '5'): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      if (period) filter += filter ? ` AND FREQUENCY="${period}"` : `(FREQUENCY="${period}")`
      const items = await dcAll(this, 'RPT_STOCK_HK_MIN', filter, '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkDaily = async function stockHkDaily(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = symbol ? `(SECURITY_CODE="${c(symbol)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_DAILY', filter, '250')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkFamousSpotEm = async function stockHkFamousSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_FAMOUS', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkMainBoardSpotEm = async function stockHkMainBoardSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_MAIN_BOARD', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkCompanyProfileEm = async function stockHkCompanyProfileEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_COMPANY', filter, '1')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkSecurityProfileEm = async function stockHkSecurityProfileEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_SECURITY', filter, '1')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkFinancialIndicatorEm = async function stockHkFinancialIndicatorEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_FINANCIAL', filter, '20')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkDividendPayoutEm = async function stockHkDividendPayoutEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_DIVIDEND', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkGgtComponentsEm = async function stockHkGgtComponentsEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_HK_GGT', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkIndicatorEniu = async function stockHkIndicatorEniu(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_INDICATOR', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkScaleComparisonEm = async function stockHkScaleComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_SCALE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkGrowthComparisonEm = async function stockHkGrowthComparisonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_GROWTH', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkProfitForecastEt = async function stockHkProfitForecastEt(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_PROFIT', filter, '20')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkFhpxDetailThs = async function stockHkFhpxDetailThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_FHPX', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHkValuationBaidu = async function stockHkValuationBaidu(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HK_VALUATION_BAIDU', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── Group 4: US Stock ──

  p.stockUsSpot = async function stockUsSpot(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_US_SPOT', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsSpotEm = async function stockUsSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_US_SPOT_EM', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsHist = async function stockUsHist(code: string, period = 'daily'): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      if (period) filter += filter ? ` AND FREQUENCY="${period}"` : `(FREQUENCY="${period}")`
      const items = await dcAll(this, 'RPT_STOCK_US_HIST', filter, '250')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsHistMinEm = async function stockUsHistMinEm(code: string, period = '5'): Promise<Record<string, unknown>[] | null> {
    try {
      let filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      if (period) filter += filter ? ` AND FREQUENCY="${period}"` : `(FREQUENCY="${period}")`
      const items = await dcAll(this, 'RPT_STOCK_US_MIN', filter, '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsDaily = async function stockUsDaily(symbol: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = symbol ? `(SECURITY_CODE="${c(symbol)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_US_DAILY', filter, '250')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsFamousSpotEm = async function stockUsFamousSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_US_FAMOUS', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsPinkSpotEm = async function stockUsPinkSpotEm(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_US_PINK', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockUsValuationBaidu = async function stockUsValuationBaidu(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_US_VALUATION', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── Group 5: Info/Changes ──

  p.stockInfoACodeName = async function stockInfoACodeName(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_A', '', '5000')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoShNameCode = async function stockInfoShNameCode(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_SH', '', '5000')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoSzNameCode = async function stockInfoSzNameCode(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_SZ', '', '5000')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoBjNameCode = async function stockInfoBjNameCode(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_BJ', '', '5000')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoShDelist = async function stockInfoShDelist(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_SH_DELIST', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoSzDelist = async function stockInfoSzDelist(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_SZ_DELIST', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoChangeName = async function stockInfoChangeName(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_CHANGE', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockInfoSzChangeName = async function stockInfoSzChangeName(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INFO_SZ_CHANGE', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockStaqNetStop = async function stockStaqNetStop(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_STAQ_STOP', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockShareChangeCninfo = async function stockShareChangeCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SHARE_CHANGE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockShareHoldChangeSse = async function stockShareHoldChangeSse(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SHARE_HOLD_SH', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockShareHoldChangeSzse = async function stockShareHoldChangeSzse(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SHARE_HOLD_SZ', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockShareHoldChangeBse = async function stockShareHoldChangeBse(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SHARE_HOLD_BJ', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockShareholderChangeThs = async function stockShareholderChangeThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_SHAREHOLDER_THS', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHoldChangeCninfo = async function stockHoldChangeCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HOLD_CHANGE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHoldControlCninfo = async function stockHoldControlCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HOLD_CONTROL', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHoldNumCninfo = async function stockHoldNumCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HOLD_NUM', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHoldManagementDetailCninfo = async function stockHoldManagementDetailCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HOLD_MGMT_DETAIL', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHoldManagementDetailEm = async function stockHoldManagementDetailEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HOLD_MGMT_EM', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockHoldManagementPersonEm = async function stockHoldManagementPersonEm(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_HOLD_MGMT_PERSON', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIndustryCategoryCninfo = async function stockIndustryCategoryCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_INDUSTRY_CATEGORY', '', '500')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIndustryChangeCninfo = async function stockIndustryChangeCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_INDUSTRY_CHANGE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockIndustryPeRatioCninfo = async function stockIndustryPeRatioCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_INDUSTRY_PE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockProfileCninfo = async function stockProfileCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_PROFILE_CNINFO', filter, '1')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAddStock = async function stockAddStock(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_ADD', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockAllotmentCninfo = async function stockAllotmentCninfo(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_ALLOTMENT', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockManagementChangeThs = async function stockManagementChangeThs(code: string): Promise<Record<string, unknown>[] | null> {
    try {
      const filter = code ? `(SECURITY_CODE="${c(code)}")` : ''
      const items = await dcAll(this, 'RPT_STOCK_MGMT_CHANGE', filter, '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockRankForecastCninfo = async function stockRankForecastCninfo(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_RANK_FORECAST', '', '50')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  // ── Group 6: ESG/News ──

  p.stockEsgHzSina = async function stockEsgHzSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ESG_HZ', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockEsgMsciSina = async function stockEsgMsciSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ESG_MSCI', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockEsgRateSina = async function stockEsgRateSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ESG_RATE', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockEsgRftSina = async function stockEsgRftSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ESG_RFT', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockEsgZdSina = async function stockEsgZdSina(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_ESG_ZD', '', '100')
      if (!items.length) return null
      return items
    } catch { return null }
  }

  p.stockNewsMainCx = async function stockNewsMainCx(): Promise<Record<string, unknown>[] | null> {
    try {
      const items = await dcAll(this, 'RPT_STOCK_NEWS_CX_MAIN', '', '50')
      if (!items.length) return null
      return items
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
    boardConceptList(): Promise<Record<string, unknown>[] | null>
    boardIndustryList(): Promise<Record<string, unknown>[] | null>
    boardRegionList(): Promise<Record<string, unknown>[] | null>
    boardConceptCons(boardCode: string): Promise<Record<string, unknown>[] | null>
    ztPool(date?: string): Promise<Record<string, unknown>[] | null>
    hsgtNorthFlow(): Promise<Record<string, unknown>[] | null>
    hotRank(): Promise<Record<string, unknown>[] | null>
    stockRankCxgThs(): Promise<Record<string, unknown>[] | null>
    stockRankCxdThs(): Promise<Record<string, unknown>[] | null>
    stockRankLxszThs(): Promise<Record<string, unknown>[] | null>
    stockRankLxxdThs(): Promise<Record<string, unknown>[] | null>
    stockRankCxflThs(): Promise<Record<string, unknown>[] | null>
    stockRankCxslThs(): Promise<Record<string, unknown>[] | null>
    stockRankXstpThs(): Promise<Record<string, unknown>[] | null>
    stockRankXxtpThs(): Promise<Record<string, unknown>[] | null>
    stockRankLjqsThs(): Promise<Record<string, unknown>[] | null>
    stockRankLjqdThs(): Promise<Record<string, unknown>[] | null>
    stockBidAsk(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialReportDisclosure(code?: string): Promise<Record<string, unknown>[] | null>
    stockGoodwillDetail(code: string): Promise<Record<string, unknown>[] | null>
    stockGoodwillIndustry(): Promise<Record<string, unknown>[] | null>
    stockPledgeStats(): Promise<Record<string, unknown>[] | null>
    stockPledgeCompanyStats(): Promise<Record<string, unknown>[] | null>
    stockAnalystRank(): Promise<Record<string, unknown>[] | null>
    blockTradeActiveStats(): Promise<Record<string, unknown>[] | null>
    blockTradeBranchRank(): Promise<Record<string, unknown>[] | null>
    stockAhList(): Promise<Record<string, unknown>[] | null>
    stockBShareList(): Promise<Record<string, unknown>[] | null>
    hkConnectHoldings(code: string): Promise<Record<string, unknown>[] | null>
    hkConnectTop10(date?: string): Promise<Record<string, unknown>[] | null>
    marginTradeSz(code: string): Promise<Record<string, unknown>[] | null>
    stockZhIndexSpotEm(symbol: string): Promise<Record<string, unknown>[] | null>
    stockZhIndexDaily(symbol: string): Promise<Record<string, unknown>[] | null>
    stockZhIndexDailyEm(symbol: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    indexZhAShist(symbol: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    indexZhAHistMinEm(symbol: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    stockHkIndexSpotEm(): Promise<Record<string, unknown>[] | null>
    stockHkIndexDailyEm(symbol: string): Promise<Record<string, unknown>[] | null>
    indexGlobalSpotEm(): Promise<Record<string, unknown>[] | null>
    indexGlobalHistEm(symbol: string): Promise<Record<string, unknown>[] | null>
    indexStockCons(indexCode: string): Promise<Record<string, unknown>[] | null>
    indexStockInfo(): Promise<Record<string, unknown>[] | null>
    indexStockPeLg(indexCode: string): Promise<Record<string, unknown>[] | null>
    indexStockPbLg(indexCode: string): Promise<Record<string, unknown>[] | null>
    fundNameEm(): Promise<Record<string, unknown>[] | null>
    fundPurchaseEm(): Promise<Record<string, unknown>[] | null>
    fundEtfSpotEm(): Promise<Record<string, unknown>[] | null>
    fundLofSpotEm(): Promise<Record<string, unknown>[] | null>
    fundEtfHistEm(code: string, period?: string, startDate?: string, endDate?: string, adjust?: string): Promise<Record<string, unknown>[] | null>
    fundLofHistEm(code: string, period?: string, startDate?: string, endDate?: string, adjust?: string): Promise<Record<string, unknown>[] | null>
    fundEtfHistMinEm(code: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    fundLofHistMinEm(code: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    fundInfoIndexEm(symbol?: string, indicator?: string): Promise<Record<string, unknown>[] | null>
    fundNavEm(code: string): Promise<Record<string, unknown>[] | null>
    fundOpenFundDayEm(code: string): Promise<Record<string, unknown>[] | null>
    fundOpenFundDailyEm(code: string): Promise<Record<string, unknown>[] | null>
    fundDividendEm(code: string): Promise<Record<string, unknown>[] | null>
    fundManagerEm(code: string): Promise<Record<string, unknown>[] | null>
    fundEtfCategoryThs(symbol?: string, date?: string): Promise<Record<string, unknown>[] | null>
    fundEtfSpotThs(date?: string): Promise<Record<string, unknown>[] | null>
    fundInfoThs(symbol: string): Promise<Record<string, unknown>[] | null>
    fundIndividualBasicInfoXq(symbol: string): Promise<Record<string, unknown>[] | null>
    fundEtfCategorySina(symbol?: string): Promise<Record<string, unknown>[] | null>
    stockZhIndexSpotSina(): Promise<Record<string, unknown>[] | null>
    stockZhIndexDailyTx(symbol: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    stockHkIndexSpotSina(): Promise<Record<string, unknown>[] | null>
    stockHkIndexDailySina(symbol: string): Promise<Record<string, unknown>[] | null>
    indexUsStockSina(symbol: string): Promise<Record<string, unknown>[] | null>
    indexGlobalHistSina(symbol: string): Promise<Record<string, unknown>[] | null>
    fundAumEm(): Promise<Record<string, unknown>[] | null>
    fundAumHistEm(code: string): Promise<Record<string, unknown>[] | null>
    fundAumTrendEm(code: string): Promise<Record<string, unknown>[] | null>
    fundOverviewEm(code: string): Promise<Record<string, unknown>[] | null>
    fundOpenFundInfoEm(code: string): Promise<Record<string, unknown>[] | null>
    fundOpenFundRankEm(symbol: string): Promise<Record<string, unknown>[] | null>
    fundCfEm(code: string): Promise<Record<string, unknown>[] | null>
    fundBalancePositionLg(code: string): Promise<Record<string, unknown>[] | null>
    fundStockPositionLg(code: string): Promise<Record<string, unknown>[] | null>
    fundLinghuoPositionLg(code: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioHoldEm(code: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioBondHoldEm(code: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioChangeEm(code: string): Promise<Record<string, unknown>[] | null>
    fundPortfolioIndustryAllocationEm(code: string): Promise<Record<string, unknown>[] | null>
    fundHoldStructureEm(code: string): Promise<Record<string, unknown>[] | null>
    fundExchangeRankEm(): Promise<Record<string, unknown>[] | null>
    fundFhRankEm(): Promise<Record<string, unknown>[] | null>
    fundLcxRankEm(): Promise<Record<string, unknown>[] | null>
    fundMoneyRankEm(): Promise<Record<string, unknown>[] | null>
    fundRatingAll(): Promise<Record<string, unknown>[] | null>
    fundRatingSh(): Promise<Record<string, unknown>[] | null>
    fundRatingZs(): Promise<Record<string, unknown>[] | null>
    fundRatingJa(): Promise<Record<string, unknown>[] | null>
    fundFeeEm(code: string): Promise<Record<string, unknown>[] | null>
    fundFhEm(code: string): Promise<Record<string, unknown>[] | null>
    fundDividendSina(code: string): Promise<Record<string, unknown>[] | null>
    fundScaleChangeEm(code: string): Promise<Record<string, unknown>[] | null>
    fundScaleOpenSina(): Promise<Record<string, unknown>[] | null>
    fundScaleCloseSina(): Promise<Record<string, unknown>[] | null>
    fundScaleDailySzse(): Promise<Record<string, unknown>[] | null>
    fundScaleStructuredSina(): Promise<Record<string, unknown>[] | null>
    fundEtfScaleSse(): Promise<Record<string, unknown>[] | null>
    fundEtfScaleSzse(): Promise<Record<string, unknown>[] | null>
    fundValueEstimationEm(code: string): Promise<Record<string, unknown>[] | null>
    fundEtfDividendSina(code: string): Promise<Record<string, unknown>[] | null>
    fundEtfHistSina(code: string): Promise<Record<string, unknown>[] | null>
    fundMoneyFundDailyEm(): Promise<Record<string, unknown>[] | null>
    fundMoneyFundInfoEm(code: string): Promise<Record<string, unknown>[] | null>
    fundFinancialFundDailyEm(): Promise<Record<string, unknown>[] | null>
    fundFinancialFundInfoEm(code: string): Promise<Record<string, unknown>[] | null>
    fundGradedFundDailyEm(): Promise<Record<string, unknown>[] | null>
    fundGradedFundInfoEm(code: string): Promise<Record<string, unknown>[] | null>
    fundEtfFundDailyEm(): Promise<Record<string, unknown>[] | null>
    fundEtfFundInfoEm(code: string): Promise<Record<string, unknown>[] | null>
    fundHkFundHistEm(code: string): Promise<Record<string, unknown>[] | null>
    fundHkRankEm(): Promise<Record<string, unknown>[] | null>
    fundIndividualAchievementXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualAnalysisXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualDetailHoldXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualDetailInfoXq(code: string): Promise<Record<string, unknown>[] | null>
    fundIndividualProfitProbabilityXq(code: string): Promise<Record<string, unknown>[] | null>
    fundReportAssetAllocationCninfo(): Promise<Record<string, unknown>[] | null>
    fundReportIndustryAllocationCninfo(): Promise<Record<string, unknown>[] | null>
    fundReportStockCninfo(): Promise<Record<string, unknown>[] | null>
    fundNewFoundEm(): Promise<Record<string, unknown>[] | null>
    fundNewFoundThs(): Promise<Record<string, unknown>[] | null>
    reitsHistEm(code: string): Promise<Record<string, unknown>[] | null>
    reitsRealtimeEm(): Promise<Record<string, unknown>[] | null>
    stockFinancialReportSina(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialAbstract(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialAbstractNewThs(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialAnalysisIndicator(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialAnalysisIndicatorEm(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialBenefitNewThs(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialCashNewThs(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialDebtNewThs(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialHkReportEm(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialHkAnalysisIndicatorEm(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialUsReportEm(code: string): Promise<Record<string, unknown>[] | null>
    stockFinancialUsAnalysisIndicatorEm(code: string): Promise<Record<string, unknown>[] | null>
    stockLrbEm(code: string): Promise<Record<string, unknown>[] | null>
    stockXjllEm(code: string): Promise<Record<string, unknown>[] | null>
    stockZcfzEm(code: string): Promise<Record<string, unknown>[] | null>
    stockZcfzBjEm(code: string): Promise<Record<string, unknown>[] | null>
    stockReportDisclosure(code: string): Promise<Record<string, unknown>[] | null>
    stockReportFundHold(code: string): Promise<Record<string, unknown>[] | null>
    stockReportFundHoldDetail(code: string): Promise<Record<string, unknown>[] | null>
    stockBoardConceptNameEm(): Promise<Record<string, unknown>[] | null>
    stockBoardConceptSpotEm(): Promise<Record<string, unknown>[] | null>
    stockBoardConceptConsEm(code: string): Promise<Record<string, unknown>[] | null>
    stockBoardConceptHistEm(code: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    stockBoardConceptHistMinEm(code: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockBoardConceptIndexThs(): Promise<Record<string, unknown>[] | null>
    stockBoardConceptInfoThs(code: string): Promise<Record<string, unknown>[] | null>
    stockBoardIndustryNameEm(): Promise<Record<string, unknown>[] | null>
    stockBoardIndustrySpotEm(): Promise<Record<string, unknown>[] | null>
    stockBoardIndustryConsEm(code: string): Promise<Record<string, unknown>[] | null>
    stockBoardIndustryHistEm(code: string, period?: string, startDate?: string, endDate?: string): Promise<Record<string, unknown>[] | null>
    stockBoardIndustryHistMinEm(code: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockBoardIndustryIndexThs(): Promise<Record<string, unknown>[] | null>
    stockBoardIndustrySummaryThs(): Promise<Record<string, unknown>[] | null>
    stockBoardChangeEm(): Promise<Record<string, unknown>[] | null>
    stockSectorDetail(indicator: string): Promise<Record<string, unknown>[] | null>
    stockSectorSpot(indicator: string): Promise<Record<string, unknown>[] | null>
    stockHotRankEm(): Promise<Record<string, unknown>[] | null>
    stockHotRankDetailEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHotRankDetailRealtimeEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHotRankLatestEm(): Promise<Record<string, unknown>[] | null>
    stockHotRankRelateEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHotKeywordEm(): Promise<Record<string, unknown>[] | null>
    stockHotUpEm(): Promise<Record<string, unknown>[] | null>
    stockHotSearchBaidu(): Promise<Record<string, unknown>[] | null>
    stockHotDealXq(): Promise<Record<string, unknown>[] | null>
    stockHotFollowXq(): Promise<Record<string, unknown>[] | null>
    stockHotTweetXq(): Promise<Record<string, unknown>[] | null>
    stockHkHotRankEm(): Promise<Record<string, unknown>[] | null>
    stockHkHotRankDetailEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkHotRankDetailRealtimeEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkHotRankLatestEm(): Promise<Record<string, unknown>[] | null>
    stockFundStockHolder(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxHoldingAnalyseEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxHoldingChangeEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxHoldingTeamworkEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxHoldingStatisticsEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxFreeHoldingAnalyseEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxFreeHoldingChangeEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxFreeHoldingTeamworkEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxFreeHoldingStatisticsEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxTop10Em(code: string): Promise<Record<string, unknown>[] | null>
    stockGdfxFreeTop10Em(code: string): Promise<Record<string, unknown>[] | null>
    stockGpzyProfileEm(): Promise<Record<string, unknown>[] | null>
    stockGpzyPledgeRatioEm(): Promise<Record<string, unknown>[] | null>
    stockGpzyPledgeRatioDetailEm(code: string): Promise<Record<string, unknown>[] | null>
    stockGpzyIndustryDataEm(): Promise<Record<string, unknown>[] | null>
    stockGpzyDistributeStatisticsCompanyEm(): Promise<Record<string, unknown>[] | null>
    stockGpzyDistributeStatisticsBankEm(): Promise<Record<string, unknown>[] | null>
    stockGpzyIndividualPledgeRatioDetailEm(code: string): Promise<Record<string, unknown>[] | null>
    stockCgEquityMortgageCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockCgGuaranteeCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockCgLawsuitCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockIpoInfo(): Promise<Record<string, unknown>[] | null>
    stockIpoBenefitThs(): Promise<Record<string, unknown>[] | null>
    stockIpoDeclareEm(): Promise<Record<string, unknown>[] | null>
    stockIpoReviewEm(): Promise<Record<string, unknown>[] | null>
    stockIpoTutorEm(): Promise<Record<string, unknown>[] | null>
    stockIpoThs(): Promise<Record<string, unknown>[] | null>
    stockIpoHkThs(): Promise<Record<string, unknown>[] | null>
    stockIpoSummaryCninfo(): Promise<Record<string, unknown>[] | null>
    stockNewIpoCninfo(): Promise<Record<string, unknown>[] | null>
    stockNewGhCninfo(): Promise<Record<string, unknown>[] | null>
    stockNewASpotEm(): Promise<Record<string, unknown>[] | null>
    stockRegisterAllEm(): Promise<Record<string, unknown>[] | null>
    stockRegisterSh(): Promise<Record<string, unknown>[] | null>
    stockRegisterSz(): Promise<Record<string, unknown>[] | null>
    stockRegisterCyb(): Promise<Record<string, unknown>[] | null>
    stockRegisterKcb(): Promise<Record<string, unknown>[] | null>
    stockRegisterBj(): Promise<Record<string, unknown>[] | null>
    stockRegisterDb(): Promise<Record<string, unknown>[] | null>
    stockDxsylEm(): Promise<Record<string, unknown>[] | null>
    stockRankXzjpThs(): Promise<Record<string, unknown>[] | null>
    stockChangesEm(): Promise<Record<string, unknown>[] | null>
    stockSyEm(): Promise<Record<string, unknown>[] | null>
    stockSyHyEm(): Promise<Record<string, unknown>[] | null>
    stockSyJzEm(): Promise<Record<string, unknown>[] | null>
    stockSyProfileEm(): Promise<Record<string, unknown>[] | null>
    stockSyYqEm(): Promise<Record<string, unknown>[] | null>
    stockPgEm(): Promise<Record<string, unknown>[] | null>
    stockXgsglbEm(): Promise<Record<string, unknown>[] | null>
    stockXgsrThs(): Promise<Record<string, unknown>[] | null>
    stockZdhtmxEm(): Promise<Record<string, unknown>[] | null>
    stockQsjyEm(): Promise<Record<string, unknown>[] | null>
    stockQbzfEm(): Promise<Record<string, unknown>[] | null>
    stockYzxdrEm(): Promise<Record<string, unknown>[] | null>
    stockGddhEm(): Promise<Record<string, unknown>[] | null>
    stockGgcgEm(): Promise<Record<string, unknown>[] | null>
    stockZygcEm(): Promise<Record<string, unknown>[] | null>
    stockZyjsThs(): Promise<Record<string, unknown>[] | null>
    stockEbsLg(): Promise<Record<string, unknown>[] | null>
    stockPriceJs(): Promise<Record<string, unknown>[] | null>
    stockHsgtHistEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtFundFlowSummaryEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtFundMinEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtStockStatisticsEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtInstitutionStatisticsEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtBoardRankEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtShHkSpotEm(): Promise<Record<string, unknown>[] | null>
    stockHsgtHoldStockEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHsgtIndividualEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHsgtIndividualDetailEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkSpot(): Promise<Record<string, unknown>[] | null>
    stockHkSpotEm(): Promise<Record<string, unknown>[] | null>
    stockHkHist(code: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockHkHistMinEm(code: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockHkDaily(symbol: string): Promise<Record<string, unknown>[] | null>
    stockHkFamousSpotEm(): Promise<Record<string, unknown>[] | null>
    stockHkMainBoardSpotEm(): Promise<Record<string, unknown>[] | null>
    stockHkCompanyProfileEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkSecurityProfileEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkFinancialIndicatorEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkDividendPayoutEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkGgtComponentsEm(): Promise<Record<string, unknown>[] | null>
    stockHkIndicatorEniu(code: string): Promise<Record<string, unknown>[] | null>
    stockHkScaleComparisonEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkGrowthComparisonEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHkProfitForecastEt(code: string): Promise<Record<string, unknown>[] | null>
    stockHkFhpxDetailThs(code: string): Promise<Record<string, unknown>[] | null>
    stockHkValuationBaidu(code: string): Promise<Record<string, unknown>[] | null>
    stockUsSpot(): Promise<Record<string, unknown>[] | null>
    stockUsSpotEm(): Promise<Record<string, unknown>[] | null>
    stockUsHist(code: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockUsHistMinEm(code: string, period?: string): Promise<Record<string, unknown>[] | null>
    stockUsDaily(symbol: string): Promise<Record<string, unknown>[] | null>
    stockUsFamousSpotEm(): Promise<Record<string, unknown>[] | null>
    stockUsPinkSpotEm(): Promise<Record<string, unknown>[] | null>
    stockUsValuationBaidu(code: string): Promise<Record<string, unknown>[] | null>
    stockInfoACodeName(): Promise<Record<string, unknown>[] | null>
    stockInfoShNameCode(): Promise<Record<string, unknown>[] | null>
    stockInfoSzNameCode(): Promise<Record<string, unknown>[] | null>
    stockInfoBjNameCode(): Promise<Record<string, unknown>[] | null>
    stockInfoShDelist(): Promise<Record<string, unknown>[] | null>
    stockInfoSzDelist(): Promise<Record<string, unknown>[] | null>
    stockInfoChangeName(): Promise<Record<string, unknown>[] | null>
    stockInfoSzChangeName(): Promise<Record<string, unknown>[] | null>
    stockStaqNetStop(): Promise<Record<string, unknown>[] | null>
    stockShareChangeCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockShareHoldChangeSse(code: string): Promise<Record<string, unknown>[] | null>
    stockShareHoldChangeSzse(code: string): Promise<Record<string, unknown>[] | null>
    stockShareHoldChangeBse(code: string): Promise<Record<string, unknown>[] | null>
    stockShareholderChangeThs(code: string): Promise<Record<string, unknown>[] | null>
    stockHoldChangeCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockHoldControlCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockHoldNumCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockHoldManagementDetailCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockHoldManagementDetailEm(code: string): Promise<Record<string, unknown>[] | null>
    stockHoldManagementPersonEm(code: string): Promise<Record<string, unknown>[] | null>
    stockIndustryCategoryCninfo(): Promise<Record<string, unknown>[] | null>
    stockIndustryChangeCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockIndustryPeRatioCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockProfileCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockAddStock(code: string): Promise<Record<string, unknown>[] | null>
    stockAllotmentCninfo(code: string): Promise<Record<string, unknown>[] | null>
    stockManagementChangeThs(code: string): Promise<Record<string, unknown>[] | null>
    stockRankForecastCninfo(): Promise<Record<string, unknown>[] | null>
    stockEsgHzSina(): Promise<Record<string, unknown>[] | null>
    stockEsgMsciSina(): Promise<Record<string, unknown>[] | null>
    stockEsgRateSina(): Promise<Record<string, unknown>[] | null>
    stockEsgRftSina(): Promise<Record<string, unknown>[] | null>
    stockEsgZdSina(): Promise<Record<string, unknown>[] | null>
  }
}
