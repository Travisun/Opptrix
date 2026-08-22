import type { StockListItem } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import type {
  StandardFundHoldingRow,
  StandardFundNavRow,
  StandardFundProfileRow,
  StandardFundQuoteRow,
} from '../../common/standard-fund.js'
import type { TushareRow } from '../api/client.js'
import { fromFundTsCode, fundListMarketFromTsCode, fundMarketFromTsCode, isListedFundCodePattern } from '../codes.js'

const SOURCE = 'tushare'

export const FUND_BASIC_FIELDS =
  'ts_code,name,management,custodian,fund_type,found_date,due_date,list_date,issue_date,delist_date,issue_amount,m_fee,c_fee,duration_year,p_value,min_amount,exp_return,benchmark,status,invest_type,type,trustee,purc_startdate,redm_startdate,market'

export const FUND_NAV_FIELDS =
  'ts_code,ann_date,end_date,unit_nav,accum_nav,accum_div,net_asset,total_netasset,adj_nav'

export const FUND_PORTFOLIO_FIELDS =
  'ts_code,ann_date,end_date,symbol,mkv,amount,stk_mkv_ratio,stk_float_ratio'

function ymdToIso(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s.slice(0, 10)
}

export function mapTushareFundBasicToListItem(row: TushareRow): StockListItem | null {
  const tsCode = String(row.ts_code ?? '').trim()
  const code = fromFundTsCode(tsCode)
  if (!code) return null
  const marketTag = String(row.market ?? fundMarketFromTsCode(tsCode) ?? 'O')
  if (marketTag === 'O' && isListedFundCodePattern(code)) return null
  return {
    code,
    name: String(row.name ?? '').trim(),
    industry: 'FUND',
    market: fundListMarketFromTsCode(tsCode),
  }
}

export function mapTushareFundBasicToProfileRow(
  code: string,
  row: TushareRow,
  navRow?: TushareRow | null,
): StandardFundProfileRow {
  const c = fromFundTsCode(String(row.ts_code ?? code))
  const fundType = [
    row.fund_type,
    row.invest_type,
    row.type,
  ].map(v => String(v ?? '').trim()).filter(Boolean).join(' / ') || '公募基金'

  return {
    code: c,
    name: String(row.name ?? '').trim() || undefined,
    fullName: String(row.name ?? '').trim() || undefined,
    fundType,
    company: String(row.management ?? '').trim() || undefined,
    custodian: String(row.custodian ?? '').trim() || undefined,
    benchmark: String(row.benchmark ?? '').trim() || undefined,
    establishDate: ymdToIso(row.found_date),
    scale: safeFloat(row.issue_amount),
    expenseRatio: safeFloat(row.m_fee),
    unitNav: safeFloat(navRow?.unit_nav),
    accNav: safeFloat(navRow?.accum_nav),
    navDate: ymdToIso(navRow?.end_date),
    source: SOURCE,
    tsCode: String(row.ts_code ?? ''),
    market: String(row.market ?? fundMarketFromTsCode(String(row.ts_code ?? '')) ?? ''),
    status: String(row.status ?? ''),
    trustee: String(row.trustee ?? '').trim() || undefined,
    purcStartDate: ymdToIso(row.purc_startdate),
    redmStartDate: ymdToIso(row.redm_startdate),
    custodianFee: safeFloat(row.c_fee),
    minAmount: safeFloat(row.min_amount),
    expReturn: safeFloat(row.exp_return),
  }
}

export function mapTushareFundNavRows(code: string, rows: TushareRow[]): StandardFundNavRow[] {
  const c = normalizeCode(code)
  const sorted = [...rows].sort((a, b) =>
    String(a.end_date ?? '').localeCompare(String(b.end_date ?? '')),
  )
  const mapped: StandardFundNavRow[] = sorted.map(row => ({
    code: c,
    date: ymdToIso(row.end_date) ?? '',
    nav: safeFloat(row.unit_nav),
    accNav: safeFloat(row.accum_nav),
    changePct: null,
    source: SOURCE,
    adjNav: safeFloat(row.adj_nav),
    annDate: ymdToIso(row.ann_date),
  })).filter(r => r.date)

  for (let i = 1; i < mapped.length; i++) {
    const prev = mapped[i - 1].nav
    const cur = mapped[i].nav
    if (prev != null && cur != null && prev > 0) {
      mapped[i].changePct = ((cur - prev) / prev) * 100
    }
  }

  return mapped.sort((a, b) => b.date.localeCompare(a.date))
}

export function mapTushareFundQuoteRow(
  code: string,
  navRow: TushareRow | null,
  basicRow?: TushareRow | null,
): StandardFundQuoteRow | null {
  if (!navRow) return null
  const c = normalizeCode(code)
  return {
    code: c,
    name: basicRow?.name != null ? String(basicRow.name) : undefined,
    unitNav: safeFloat(navRow.unit_nav),
    accNav: safeFloat(navRow.accum_nav),
    changePct: null,
    navDate: ymdToIso(navRow.end_date),
    source: SOURCE,
  }
}

export function mapTushareFundPortfolioRows(
  fundCode: string,
  rows: TushareRow[],
): StandardFundHoldingRow[] {
  const bare = normalizeCode(fundCode)
  return rows
    .map(row => {
      const symbol = normalizeCode(String(row.symbol ?? '').replace(/^(sh|sz|bj)/i, ''))
      const reportDate = ymdToIso(row.end_date) ?? ymdToIso(row.ann_date) ?? ''
      if (!reportDate) return null
      return {
        reportDate,
        holdingSymbol: symbol,
        holdingName: null,
        weight: safeFloat(row.stk_mkv_ratio),
        shares: safeFloat(row.amount),
        marketValue: safeFloat(row.mkv),
        assetType: 'stock',
        source: SOURCE,
      } as StandardFundHoldingRow
    })
    .filter((r): r is StandardFundHoldingRow => r != null && (r.holdingSymbol.length > 0 || r.weight != null))
}

export function mapTushareFundDivRows(fundCode: string, rows: TushareRow[]): Record<string, unknown>[] {
  const code = normalizeCode(fundCode)
  return rows.map(row => ({
    code,
    tsCode: String(row.ts_code ?? ''),
    annDate: ymdToIso(row.ann_date),
    exDate: ymdToIso(row.ex_date),
    payDate: ymdToIso(row.pay_date),
    divCash: safeFloat(row.div_cash),
    divProc: String(row.div_proc ?? ''),
    recordDate: ymdToIso(row.record_date),
    impAnndate: ymdToIso(row.imp_anndate),
    source: SOURCE,
  }))
}

export function mapTushareFundDailyRows(fundCode: string, rows: TushareRow[]): Record<string, unknown>[] {
  const code = fromFundTsCode(fundCode)
  return rows.map(row => ({
    code,
    tsCode: String(row.ts_code ?? ''),
    date: ymdToIso(row.trade_date),
    open: safeFloat(row.open),
    high: safeFloat(row.high),
    low: safeFloat(row.low),
    close: safeFloat(row.close),
    preClose: safeFloat(row.pre_close),
    change: safeFloat(row.change),
    changePct: safeFloat(row.pct_chg),
    volume: safeFloat(row.vol),
    amount: safeFloat(row.amount),
    source: SOURCE,
  })).filter(r => r.date)
}

export function mapTushareFundAdjRows(fundCode: string, rows: TushareRow[]): Record<string, unknown>[] {
  const code = fromFundTsCode(fundCode)
  return rows.map(row => ({
    code,
    tsCode: String(row.ts_code ?? ''),
    tradeDate: ymdToIso(row.trade_date),
    adjFactor: safeFloat(row.adj_factor),
    source: SOURCE,
  })).filter(r => r.tradeDate)
}

export function mapTushareFundCompanyRows(rows: TushareRow[]): Record<string, unknown>[] {
  return rows.map(row => ({
    name: String(row.name ?? ''),
    shortName: String(row.shortname ?? ''),
    province: String(row.province ?? ''),
    city: String(row.city ?? ''),
    website: String(row.website ?? ''),
    chairman: String(row.chairman ?? ''),
    manager: String(row.manager ?? ''),
    regCapital: safeFloat(row.reg_capital),
    setupDate: ymdToIso(row.setup_date),
    employees: safeFloat(row.employees),
    mainBusiness: String(row.main_business ?? ''),
    orgCode: String(row.org_code ?? ''),
    creditCode: String(row.credit_code ?? ''),
    source: SOURCE,
  }))
}
