import type { StockListItem } from '../../../../core/schema.js'
import { assertCnPublicFundCode } from '../../../../core/fund-instrument.js'
import { normalizeCode } from '../../../../utils/helpers.js'
import {
  mapTushareFundBasicToListItem,
  mapTushareFundBasicToProfileRow,
  mapTushareFundNavRows,
  mapTushareFundPortfolioRows,
  mapTushareFundQuoteRow,
  FUND_BASIC_FIELDS,
  FUND_NAV_FIELDS,
  FUND_PORTFOLIO_FIELDS,
} from '../../normalize/fund.js'
import { fundTsCode, fundTsCodeCandidates } from '../../codes.js'
import type { TushareClient, TushareRow } from '../../api/client.js'

type FundHandler = Record<string, unknown> & {
  client(): TushareClient | null
}

function parseFundListKeyword(raw: string): { market?: 'E' | 'O' | 'ALL'; keyword: string } {
  const s = String(raw ?? '').trim()
  if (/^(E|场内)[:：]/i.test(s)) {
    return { market: 'E', keyword: s.replace(/^(E|场内)[:：]/i, '').trim() }
  }
  if (/^(O|场外)[:：]/i.test(s)) {
    return { market: 'O', keyword: s.replace(/^(O|场外)[:：]/i, '').trim() }
  }
  return { keyword: s }
}

async function queryFundBasicByTsCode(
  client: TushareClient,
  tsCode: string,
): Promise<TushareRow | null> {
  const rows = await client.query('fund_basic', { ts_code: tsCode }, FUND_BASIC_FIELDS)
  return rows[0] ?? null
}

async function resolveFundBasic(
  client: TushareClient,
  bare: string,
): Promise<{ tsCode: string; basic: TushareRow } | null> {
  for (const tsCode of fundTsCodeCandidates(bare)) {
    const basic = await queryFundBasicByTsCode(client, tsCode)
    if (basic) {
      return { tsCode: String(basic.ts_code ?? tsCode), basic }
    }
  }
  return null
}

async function latestFundNavRow(
  client: TushareClient,
  tsCode: string,
): Promise<TushareRow | null> {
  const rows = await client.queryAll(
    'fund_nav',
    { ts_code: tsCode },
    FUND_NAV_FIELDS,
    200,
  )
  if (!rows.length) return null
  return rows.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

async function queryFundNavRows(client: TushareClient, bare: string): Promise<TushareRow[]> {
  for (const tsCode of fundTsCodeCandidates(bare)) {
    const rows = await client.queryAll('fund_nav', { ts_code: tsCode }, FUND_NAV_FIELDS)
    if (rows.length) return rows
  }
  return []
}

async function queryFundPortfolioRows(client: TushareClient, bare: string): Promise<TushareRow[]> {
  for (const tsCode of fundTsCodeCandidates(bare)) {
    const rows = await client.queryAll('fund_portfolio', { ts_code: tsCode }, FUND_PORTFOLIO_FIELDS)
    if (rows.length) return rows
  }
  return []
}

/** 挂载 Tushare 公募基金标准 Capability（E 场内 + O 场外） */
export function mixTushareFund(Driver: { prototype: object }) {
  const p = Driver.prototype as FundHandler

  p.fundList = async function fundList(
    _market = 'CN',
    keyword = '',
    pageSize = 30,
  ): Promise<StockListItem[] | null> {
    const client = this.client()
    if (!client) return null
    const { market, keyword: kw } = parseFundListKeyword(String(keyword ?? ''))
    const limit = Math.min(Math.max(Number(pageSize) || 30, 1), 500)

    try {
      if (kw) {
        const bare = normalizeCode(kw)
        if (!bare) return null
        const resolved = await resolveFundBasic(client, bare)
        if (!resolved) return null
        const item = mapTushareFundBasicToListItem(resolved.basic)
        return item ? [item] : null
      }

      const markets: Array<'E' | 'O'> =
        market === 'E' ? ['E'] : market === 'O' ? ['O'] : ['O', 'E']
      const items: StockListItem[] = []
      for (const m of markets) {
        const rows = await client.queryAll(
          'fund_basic',
          { market: m, status: 'L' },
          FUND_BASIC_FIELDS,
          Math.min(limit, 15000),
        )
        for (const row of rows) {
          const item = mapTushareFundBasicToListItem(row)
          if (item) items.push(item)
          if (items.length >= limit) break
        }
        if (items.length >= limit) break
      }
      return items.length ? items.slice(0, limit) : null
    } catch {
      return null
    }
  }

  p.fundProfile = async function fundProfile(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const client = this.client()
    if (!client) return null
    try {
      const resolved = await resolveFundBasic(client, bare)
      if (!resolved) return null
      const navRow = await latestFundNavRow(client, resolved.tsCode)
      const row = mapTushareFundBasicToProfileRow(bare, resolved.basic, navRow)
      return [row]
    } catch {
      return null
    }
  }

  p.fundNav = async function fundNav(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const client = this.client()
    if (!client) return null
    try {
      const rows = await queryFundNavRows(client, bare)
      const mapped = mapTushareFundNavRows(bare, rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  p.fundQuote = async function fundQuote(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const client = this.client()
    if (!client) return null
    try {
      const resolved = await resolveFundBasic(client, bare)
      if (!resolved) return null
      const navRow = await latestFundNavRow(client, resolved.tsCode)
      const row = mapTushareFundQuoteRow(bare, navRow, resolved.basic)
      return row ? [row] : null
    } catch {
      return null
    }
  }

  p.fundHoldings = async function fundHoldings(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const client = this.client()
    if (!client) return null
    try {
      const rows = await queryFundPortfolioRows(client, bare)
      const mapped = mapTushareFundPortfolioRows(bare, rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }
}

/** Provider registry 门禁 — CN 公募基金 Ref */
export function tushareFundGate(ref: unknown): boolean {
  if (!ref || typeof ref !== 'object') return false
  const r = ref as { market?: string; assetClass?: string }
  return r.market === 'CN' && r.assetClass === 'FUND'
}
