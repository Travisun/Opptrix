import { normalizeCode } from '../../../../utils/helpers.js'
import {
  mapTushareFundAdjRows,
  mapTushareFundCompanyRows,
  mapTushareFundDivRows,
  mapTushareFundDailyRows,
  FUND_NAV_FIELDS,
} from '../../normalize/fund.js'
import { fundTsCode, fundTsCodeCandidates } from '../../codes.js'
import type { TushareClient, TushareRow } from '../../api/client.js'

type FundExtHandler = Record<string, unknown> & {
  client(): TushareClient | null
}

function ymd(raw: unknown): string {
  return String(raw ?? '').replace(/-/g, '').slice(0, 8)
}

/** Tushare 公募基金扩展接口（fund_company / fund_div / fund_daily / fund_adj） */
export function mixTushareFundExt(Driver: { prototype: object }) {
  const p = Driver.prototype as FundExtHandler

  /**
   * 公募基金公司列表 — fund_company
   * @usage engine.invokeCustomMethod("tushare", "tushareFundCompany", [])
   */
  p.tushareFundCompany = async function tushareFundCompany(): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.queryAll(
        'fund_company',
        {},
        'name,shortname,province,city,address,phone,office,website,chairman,manager,reg_capital,setup_date,end_date,employees,main_business,org_code,credit_code',
      )
      const mapped = mapTushareFundCompanyRows(rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 公募基金分红 — fund_div
   * @usage engine.invokeCustomMethod("tushare", "tushareFundDiv", ["000001"])
   */
  p.tushareFundDiv = async function tushareFundDiv(
    fundCode = '',
    annDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const bare = normalizeCode(fundCode)
    try {
      const params: Record<string, string> = {}
      if (bare) params.ts_code = fundTsCode(bare)
      if (annDate) params.ann_date = ymd(annDate)
      const rows = await client.queryAll(
        'fund_div',
        params,
        'ts_code,ann_date,imp_anndate,base_date,div_proc,record_date,ex_date,pay_date,earpay_date,net_ex_date,div_cash,base_unit,ear_distr,ear_amount,account_date,base_year',
      )
      const mapped = bare
        ? mapTushareFundDivRows(bare, rows)
        : rows.map((r: TushareRow) => ({ ...r, source: 'tushare' }))
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 场内基金日线 — fund_daily（E 场内 ETF/LOF 等）
   * @usage engine.invokeCustomMethod("tushare", "tushareFundDaily", ["510330", "20250101", "20250618"])
   */
  p.tushareFundDaily = async function tushareFundDaily(
    fundCode: string,
    startDate = '',
    endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const bare = normalizeCode(fundCode)
    if (!bare) return null
    try {
      const params: Record<string, string> = { ts_code: fundTsCode(bare) }
      if (startDate) params.start_date = ymd(startDate)
      if (endDate) params.end_date = ymd(endDate)
      const rows = await client.queryAll(
        'fund_daily',
        params,
        'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount',
      )
      const mapped = mapTushareFundDailyRows(bare, rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 基金复权因子 — fund_adj
   * @usage engine.invokeCustomMethod("tushare", "tushareFundAdj", ["510330"])
   */
  p.tushareFundAdj = async function tushareFundAdj(
    fundCode: string,
    startDate = '',
    endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const bare = normalizeCode(fundCode)
    if (!bare) return null
    try {
      const params: Record<string, string> = { ts_code: fundTsCode(bare) }
      if (startDate) params.start_date = ymd(startDate)
      if (endDate) params.end_date = ymd(endDate)
      const rows = await client.queryAll(
        'fund_adj',
        params,
        'ts_code,trade_date,adj_factor',
      )
      const mapped = mapTushareFundAdjRows(bare, rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  /**
   * 按 ts_code 拉取 fund_basic 原始行（E/O 均可）
   * @usage engine.invokeCustomMethod("tushare", "tushareFundBasic", ["000001.OF"])
   */
  p.tushareFundBasic = async function tushareFundBasic(
    tsCodeOrCode = '',
    market = '',
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const raw = String(tsCodeOrCode ?? '').trim()
    if (!raw) return null
    try {
      const tsCode = raw.includes('.') ? raw.toUpperCase() : fundTsCode(raw, market === 'O' ? 'PF' : undefined)
      const params: Record<string, string> = { ts_code: tsCode }
      if (market === 'E' || market === 'O') params.market = market
      const rows = await client.query(
        'fund_basic',
        params,
        'ts_code,name,management,custodian,fund_type,found_date,benchmark,status,invest_type,type,market,m_fee,c_fee,issue_amount',
      )
      return rows.length ? rows.map((r: TushareRow) => ({ ...r, source: 'tushare' })) : null
    } catch {
      return null
    }
  }

  /**
   * 公募基金净值（原始 fund_nav 行）
   * @usage engine.invokeCustomMethod("tushare", "tushareFundNavRaw", ["000001"])
   */
  p.tushareFundNavRaw = async function tushareFundNavRaw(
    fundCode: string,
    endDate = '',
  ): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    const bare = normalizeCode(fundCode)
    if (!bare) return null
    try {
      for (const tsCode of fundTsCodeCandidates(bare)) {
        const params: Record<string, string> = { ts_code: tsCode }
        if (endDate) params.end_date = ymd(endDate)
        const rows = await client.queryAll('fund_nav', params, FUND_NAV_FIELDS)
        if (rows.length) return rows.map((r: TushareRow) => ({ ...r, source: 'tushare' }))
      }
      return null
    } catch {
      return null
    }
  }
}
