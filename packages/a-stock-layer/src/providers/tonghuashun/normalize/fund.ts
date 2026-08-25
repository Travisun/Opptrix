import type { StockKline, StockListItem } from '../../../core/schema.js'
import { isCnEtfCode } from '../../../core/instrument.js'
import { normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'
import { fromThsCode } from '../api/symbols.js'
import type {
  StandardEtfHoldingRow,
  StandardEtfNavRow,
  StandardEtfProfileRow,
} from '../../common/standard-etf.js'
import type {
  StandardFundHoldingRow,
  StandardFundNavRow,
  StandardFundProfileRow,
} from '../../common/standard-fund.js'
import { mapSnapshotToStockRealtime } from './index.js'

export const FUYAO_EXCHANGE_FUND_TYPE = 'exchange' as const

function msToYmd(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 折溢价率 — 与 sinafinance 一致，百分数原值 */
export function computeEtfPremiumRate(
  lastPrice: number | null | undefined,
  unitNav: number | null | undefined,
): number | null {
  const price = safeFloat(lastPrice)
  const nav = safeFloat(unitNav)
  if (price == null || nav == null || nav <= 0) return null
  return ((price - nav) / nav) * 100
}

export function pickFundHolderRow(items: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!items.length) return null
  const latest = (scope: string) => items
    .filter(i => String(i.merge_scope ?? '') === scope)
    .sort((a, b) => Number(b.report_date_ms) - Number(a.report_date_ms))[0]
  return latest('separate') ?? latest('merged') ?? items[0] ?? null
}

export function mapFundHoldersToProfileFields(
  items: Record<string, unknown>[],
): {
  holderAmount?: number | null
  avgHolderShare?: number | null
  instHolderRatio?: number | null
  indivHolderRatio?: number | null
  holderReportDate?: string
} | undefined {
  const row = pickFundHolderRow(items)
  if (!row) return undefined
  const fields = {
    holderAmount: safeFloat(row.holder_amount),
    avgHolderShare: safeFloat(row.avg_holder_share),
    instHolderRatio: safeFloat(row.ins_position),
    indivHolderRatio: safeFloat(row.psnl_rate),
    holderReportDate: msToYmd(row.report_date_ms) || undefined,
  }
  const hasValue = fields.holderAmount != null
    || fields.avgHolderShare != null
    || fields.instHolderRatio != null
    || fields.indivHolderRatio != null
  return hasValue ? fields : undefined
}

export function mapFundReturnsToPerformance(
  row: Record<string, unknown> | null | undefined,
): Record<string, number | null> | undefined {
  if (!row || typeof row !== 'object') return undefined
  const perf = {
    w1: safeFloat(row.return_week),
    w4: safeFloat(row.return_month),
    w13: safeFloat(row.return_tmonth),
    w26: safeFloat(row.return_hyear),
    w52: safeFloat(row.return_year),
    year: safeFloat(row.return_nowyear),
    year2: safeFloat(row.return_twoyear),
    year3: safeFloat(row.return_tyear),
    year5: safeFloat(row.return_fyear),
    total: safeFloat(row.return_now),
  }
  const hasValue = Object.values(perf).some(v => v != null)
  return hasValue ? perf : undefined
}

const PERF_RANK_KEYS: Array<{ key: keyof NonNullable<ReturnType<typeof mapFundReturnsToPerformance>>; rank: string; total: string }> = [
  { key: 'w1', rank: 'rank_week', total: 'count_week' },
  { key: 'w4', rank: 'rank_month', total: 'count_month' },
  { key: 'w13', rank: 'rank_tmonth', total: 'count_tmonth' },
  { key: 'w26', rank: 'rank_hyear', total: 'count_hyear' },
  { key: 'w52', rank: 'rank_year', total: 'count_year' },
  { key: 'year', rank: 'rank_nowyear', total: 'count_nowyear' },
  { key: 'year2', rank: 'rank_twoyear', total: 'count_twoyear' },
  { key: 'year3', rank: 'rank_tyear', total: 'count_tyear' },
  { key: 'year5', rank: 'rank_fyear', total: 'count_fyear' },
  { key: 'total', rank: 'rank_now', total: 'count_now' },
]

export function mapFundReturnsToRanks(
  row: Record<string, unknown> | null | undefined,
): Record<string, { rank?: number | null; total?: number | null }> | undefined {
  if (!row || typeof row !== 'object') return undefined
  const ranks: Record<string, { rank?: number | null; total?: number | null }> = {}
  for (const { key, rank, total } of PERF_RANK_KEYS) {
    const r = safeFloat(row[rank] ?? row[`similar_${rank}`])
    const t = safeFloat(row[total] ?? row.similar_count ?? row.rank_count)
    if (r == null && t == null) continue
    ranks[key] = { rank: r, total: t }
  }
  return Object.keys(ranks).length ? ranks : undefined
}

export function mapFundReturnsToPeerAvg(
  row: Record<string, unknown> | null | undefined,
): Record<string, number | null> | undefined {
  if (!row || typeof row !== 'object') return undefined
  return mapFundReturnsToPerformance({
    return_week: row.avg_return_week ?? row.similar_avg_week,
    return_month: row.avg_return_month ?? row.similar_avg_month,
    return_tmonth: row.avg_return_tmonth ?? row.similar_avg_tmonth,
    return_hyear: row.avg_return_hyear ?? row.similar_avg_hyear,
    return_year: row.avg_return_year ?? row.similar_avg_year,
    return_nowyear: row.avg_return_nowyear ?? row.similar_avg_nowyear,
    return_twoyear: row.avg_return_twoyear ?? row.similar_avg_twoyear,
    return_tyear: row.avg_return_tyear ?? row.similar_avg_tyear,
    return_fyear: row.avg_return_fyear ?? row.similar_avg_fyear,
    return_now: row.avg_return_now ?? row.similar_avg_now,
  })
}

export function mapFundReturnsDetail(
  code: string,
  row: Record<string, unknown>,
): import('../../common/standard-fund.js').StandardFundReturnsRow {
  return {
    code: normalizeCode(code),
    performance: mapFundReturnsToPerformance(row),
    ranks: mapFundReturnsToRanks(row),
    peerAvg: mapFundReturnsToPeerAvg(row),
    source: 'tonghuashun',
  }
}

const DRAWDOWN_PERIODS: Array<{ period: string; label: string; keys: string[] }> = [
  { period: 'w1', label: '近 1 周', keys: ['drawdown_week', 'max_drawdown_week'] },
  { period: 'w4', label: '近 1 月', keys: ['drawdown_month', 'max_drawdown_month'] },
  { period: 'w13', label: '近 3 月', keys: ['drawdown_tmonth', 'max_drawdown_tmonth'] },
  { period: 'w26', label: '近半年', keys: ['drawdown_hyear', 'max_drawdown_hyear'] },
  { period: 'w52', label: '近 1 年', keys: ['drawdown_year', 'max_drawdown_year'] },
  { period: 'year2', label: '近 2 年', keys: ['drawdown_twoyear', 'max_drawdown_twoyear'] },
  { period: 'year3', label: '近 3 年', keys: ['drawdown_tyear', 'max_drawdown_tyear'] },
  { period: 'year5', label: '近 5 年', keys: ['drawdown_fyear', 'max_drawdown_fyear'] },
  { period: 'year', label: '今年以来', keys: ['drawdown_nowyear', 'max_drawdown_nowyear'] },
  { period: 'total', label: '成立以来', keys: ['drawdown_now', 'max_drawdown_now'] },
]

function pickFirstFloat(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = safeFloat(row[key])
    if (v != null) return v
  }
  return null
}

export function mapFundDrawdownRows(
  code: string,
  items: Record<string, unknown>[],
): import('../../common/standard-fund.js').StandardFundDrawdownRow[] {
  const c = normalizeCode(code)
  if (!items.length) return []
  const asIntervals = items.filter(row =>
    typeof row.period === 'string' || typeof row.range === 'string' || typeof row.label === 'string',
  )
  if (asIntervals.length) {
    return asIntervals.map(row => {
      const period = String(row.period ?? row.range ?? '')
      const matched = DRAWDOWN_PERIODS.find(p => p.period === period || p.keys.includes(period))
      return {
        code: c,
        period: matched?.period ?? period,
        label: String(row.label ?? matched?.label ?? period),
        value: pickFirstFloat(row, ['value', 'max_drawdown', 'drawdown', 'drawdown_pct']),
        source: 'tonghuashun',
      }
    }).filter(r => r.value != null)
  }
  const blob = items[0] ?? {}
  return DRAWDOWN_PERIODS.map(({ period, label, keys }) => ({
    code: c,
    period,
    label,
    value: pickFirstFloat(blob, keys),
    source: 'tonghuashun',
  })).filter(r => r.value != null)
}

const ASSET_NAME_KEYS: Array<{ keys: string[]; name: string }> = [
  { keys: ['stock_ratio', 'equity_ratio', 'stock_position', 'equity_position'], name: '股票' },
  { keys: ['bond_ratio', 'bond_position'], name: '债券' },
  { keys: ['cash_ratio', 'deposit_ratio', 'monetary_ratio'], name: '现金及存款' },
  { keys: ['fund_ratio', 'other_fund_ratio'], name: '基金' },
  { keys: ['other_ratio', 'other_position'], name: '其他' },
]

function mapAllocItemsFromObject(row: Record<string, unknown>): import('../../common/standard-fund.js').StandardFundAllocItem[] {
  const named = String(row.asset_name ?? row.asset_type ?? row.industry_name ?? row.sw_industry_name ?? row.name ?? '').trim()
  const ratio = pickFirstFloat(row, ['ratio', 'hold_ratio', 'weight', 'position_ratio', 'asset_ratio'])
  if (named) return [{ name: named, ratio }]
  const out: import('../../common/standard-fund.js').StandardFundAllocItem[] = []
  for (const { keys, name } of ASSET_NAME_KEYS) {
    const v = pickFirstFloat(row, keys)
    if (v == null) continue
    out.push({ name, ratio: v })
  }
  return out
}

export function mapFundAllocationRow(
  code: string,
  assetItems: Record<string, unknown>[],
  industryItems: Record<string, unknown>[],
): import('../../common/standard-fund.js').StandardFundAllocationRow {
  const c = normalizeCode(code)
  const assets = assetItems.flatMap(mapAllocItemsFromObject).filter(i => i.name)
  const industries = industryItems.flatMap(row => {
    const name = String(row.industry_name ?? row.sw_industry_name ?? row.name ?? '').trim()
    const ratio = pickFirstFloat(row, ['ratio', 'hold_ratio', 'weight', 'position_ratio'])
    return name ? [{ name, ratio }] : []
  })
  const reportMs = assetItems[0]?.report_date_ms ?? industryItems[0]?.report_date_ms
    ?? assetItems[0]?.end_date_ms ?? industryItems[0]?.end_date_ms
  return {
    code: c,
    reportDate: msToYmd(reportMs) || undefined,
    assets,
    industries,
    source: 'tonghuashun',
  }
}

export function mapFundHoldersRow(
  code: string,
  detailItems: Record<string, unknown>[],
  topItems: Record<string, unknown>[],
): import('../../common/standard-fund.js').StandardFundHoldersRow | null {
  const structure = mapFundHoldersToProfileFields(detailItems)
  const top = topItems.map(row => ({
    name: String(row.holder_name ?? row.name ?? '').trim(),
    share: pickFirstFloat(row, ['hold_share', 'holder_share', 'share', 'hold_amount']),
    ratio: pickFirstFloat(row, ['hold_ratio', 'holder_ratio', 'ratio']),
  })).filter(r => r.name)
  if (!structure && !top.length) return null
  return {
    code: normalizeCode(code),
    ...structure,
    top,
    source: 'tonghuashun',
  }
}

export function mapFundDividendRows(
  code: string,
  items: Record<string, unknown>[],
): import('../../common/standard-fund.js').StandardFundDividendRow[] {
  const c = normalizeCode(code)
  return items.map(row => ({
    code: c,
    date: msToYmd(row.ex_date_ms ?? row.pay_date_ms ?? row.dividend_date_ms)
      || String(row.ex_date ?? row.pay_date ?? row.dividend_date ?? '').slice(0, 10),
    recordDate: msToYmd(row.record_date_ms) || String(row.record_date ?? '').slice(0, 10) || undefined,
    amount: pickFirstFloat(row, ['unit_dividend', 'dividend_per_unit', 'dividend_amount', 'bonus']),
    type: String(row.bonus_type ?? row.dividend_type ?? row.type ?? '').trim() || undefined,
    source: 'tonghuashun',
  })).filter(r => r.date)
}

export function mapFundProfileToEtfProfileRow(
  code: string,
  profile: Record<string, unknown>,
  opts?: {
    nav?: number | null
    premiumRate?: number | null
    returns?: Record<string, unknown> | null
    name?: string
    holders?: ReturnType<typeof mapFundHoldersToProfileFields>
  },
): StandardEtfProfileRow {
  const c = normalizeCode(code)
  const estab = msToYmd(profile.estab_date)
  const performance = mapFundReturnsToPerformance(opts?.returns ?? null)
  return {
    code: c,
    name: opts?.name ?? String(profile.fund_name ?? ''),
    fundType: 'ETF',
    manager: String(profile.manager_name ?? '').trim() || undefined,
    company: String(profile.mgmt_name ?? '').trim() || undefined,
    listingDate: estab || undefined,
    establishDate: estab || undefined,
    nav: opts?.nav ?? null,
    premiumRate: opts?.premiumRate ?? null,
    performance,
    ...opts?.holders,
    source: 'tonghuashun',
  }
}

export function mapFundNavRows(
  code: string,
  items: Record<string, unknown>[],
  latestPremiumRate?: number | null,
): StandardEtfNavRow[] {
  const c = normalizeCode(code)
  const sorted = [...items].sort((a, b) => Number(a.nav_date) - Number(b.nav_date))
  return sorted.map((row, i) => {
    const nav = safeFloat(row.unit_nav)
    const accNav = safeFloat(row.adj_nav)
    const prevNav = i > 0 ? safeFloat(sorted[i - 1]?.unit_nav) : null
    const changePct = nav != null && prevNav != null && prevNav > 0
      ? ((nav - prevNav) / prevNav) * 100
      : null
    return {
      code: c,
      date: msToYmd(row.nav_date),
      nav,
      accNav: accNav ?? nav,
      changePct,
      premiumRate: i === sorted.length - 1 ? (latestPremiumRate ?? null) : null,
      source: 'tonghuashun',
    }
  }).filter(r => r.date)
}

export function mapFundHoldingsToEtfRows(
  etfCode: string,
  items: Record<string, unknown>[],
  reportDate = '',
): StandardEtfHoldingRow[] {
  const date = reportDate || new Date().toISOString().slice(0, 10)
  return items.map(row => ({
    reportDate: date,
    holdingSymbol: fromThsCode(String(row.ticker ?? row.thscode ?? '')),
    holdingName: String(row.stock_name ?? '').trim() || null,
    weight: safeFloat(row.hold_ratio),
    source: 'tonghuashun',
    etfCode: normalizeCode(etfCode),
  })).filter(r => r.holdingSymbol)
}

/** 场内 ETF 行情快照 — 字段语义对齐 mapSnapshotToStockRealtime */
export function mapFundMarketSnapshotToStockRealtime(
  snap: Record<string, unknown>,
  name = '',
): ReturnType<typeof mapSnapshotToStockRealtime> {
  return {
    ...mapSnapshotToStockRealtime(snap, name),
    turnoverRate: safeFloat(snap.turnover_ratio_pct),
  }
}

export function mapFundHistoricalBarToKline(
  code: string,
  bar: Record<string, unknown>,
  prevClose?: number | null,
): StockKline {
  const close = safeFloat(bar.close_price)
  const changePct = prevClose != null && close != null && prevClose > 0
    ? ((close - prevClose) / prevClose) * 100
    : null
  return {
    code: normalizeCode(code),
    date: msToYmd(bar.date_ms),
    open: safeFloat(bar.open_price) ?? 0,
    close: close ?? 0,
    high: safeFloat(bar.high_price) ?? 0,
    low: safeFloat(bar.low_price) ?? 0,
    volume: safeFloat(bar.volume) ?? 0,
    amount: safeFloat(bar.turnover) ?? 0,
    changePct,
    turnoverRate: null,
  }
}

export function mapFundHistoricalBarsToKlines(
  code: string,
  bars: Record<string, unknown>[],
): StockKline[] {
  const sorted = [...bars].sort((a, b) => Number(a.date_ms) - Number(b.date_ms))
  let prevClose: number | null = null
  return sorted.map(bar => {
    const row = mapFundHistoricalBarToKline(code, bar, prevClose)
    prevClose = row.close
    return row
  }).filter(r => r.date)
}

export function mapFundTickerToListItem(row: Record<string, unknown>): StockListItem | null {
  const code = fromThsCode(String(row.thscode ?? row.ticker ?? ''))
  if (!isCnEtfCode(code)) return null
  return {
    code,
    name: String(row.name ?? ''),
    industry: 'ETF',
    market: String(row.exchange ?? resolveMarket(code)),
  }
}

export function latestUnitNavFromNavItems(items: Record<string, unknown>[]): number | null {
  if (!items.length) return null
  const sorted = [...items].sort((a, b) => Number(b.nav_date) - Number(a.nav_date))
  return safeFloat(sorted[0]?.unit_nav)
}

function scaleToYi(raw: unknown): number | null {
  const n = safeFloat(raw)
  if (n == null) return null
  if (n >= 1e6) return n / 1e8
  return n
}

function pickMgmtExpenseRate(rateInfo: unknown): number | null {
  if (!Array.isArray(rateInfo)) return null
  for (const entry of rateInfo) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const label = String(row.rate_type ?? row.rate_name ?? '').trim()
    if (label.includes('管理')) {
      const rate = safeFloat(row.standard_rate ?? row.rate)
      if (rate != null) return rate
    }
  }
  return null
}

/** CN:PF 公募基金档案 — 对齐 StandardFundProfileRow / FundDetailTab */
export function mapFundProfileToFundProfileRow(
  code: string,
  profile: Record<string, unknown>,
  opts?: {
    navItems?: Record<string, unknown>[]
    returns?: Record<string, unknown> | null
    holders?: ReturnType<typeof mapFundHoldersToProfileFields>
  },
): StandardFundProfileRow {
  const c = normalizeCode(code)
  const navItems = opts?.navItems ?? []
  const sortedNav = [...navItems].sort((a, b) => Number(b.nav_date) - Number(a.nav_date))
  const latestNav = sortedNav[0]
  const prevNavRow = sortedNav[1]
  const unitNav = safeFloat(latestNav?.unit_nav) ?? safeFloat(profile.unit_nav)
  // adj_nav = 复权净值（≠累计净值）；写入 accNav 为历史字段兼容
  const accNav = safeFloat(latestNav?.adj_nav)
  const navDate = msToYmd(latestNav?.nav_date)
  let changePct: number | null = null
  if (unitNav != null && prevNavRow) {
    const prev = safeFloat(prevNavRow.unit_nav)
    if (prev != null && prev > 0) changePct = ((unitNav - prev) / prev) * 100
  }
  const performance = mapFundReturnsToPerformance(opts?.returns)
  const expenseRatio = pickMgmtExpenseRate(profile.rate_info)
  return {
    code: c,
    name: String(profile.fund_name ?? '').trim() || undefined,
    fundType: String(profile.invest_type ?? profile.fund_type ?? '').trim() || undefined,
    manager: String(profile.manager_name ?? '').trim() || undefined,
    company: String(profile.mgmt_name ?? '').trim() || undefined,
    custodian: String(profile.custodian_name ?? profile.custodian ?? '').trim() || undefined,
    expenseRatio,
    scale: scaleToYi(profile.fund_scale),
    unitNav,
    accNav,
    navDate,
    changePct,
    benchmark: String(profile.benchmark ?? profile.benchmark_name ?? '').trim() || undefined,
    investTarget: String(profile.invest_target ?? '').trim() || undefined,
    investScope: String(profile.invest_scope ?? '').trim() || undefined,
    establishDate: msToYmd(profile.estab_date) || undefined,
    performance,
    return1y: performance?.w52 ?? null,
    source: 'tonghuashun',
    ...opts?.holders,
  }
}

export function mapFundNavRowsForFund(
  code: string,
  items: Record<string, unknown>[],
): StandardFundNavRow[] {
  const c = normalizeCode(code)
  const sorted = [...items].sort((a, b) => Number(a.nav_date) - Number(b.nav_date))
  return sorted.map((row, i) => {
    const nav = safeFloat(row.unit_nav)
    // adj_nav = 复权净值（≠累计净值）；写入 accNav 为历史字段兼容
    const accNav = safeFloat(row.adj_nav)
    const prev = i > 0 ? safeFloat(sorted[i - 1]?.unit_nav) : null
    const changePct = nav != null && prev != null && prev > 0
      ? ((nav - prev) / prev) * 100
      : null
    return {
      code: c,
      date: msToYmd(row.nav_date),
      nav,
      accNav,
      changePct,
      source: 'tonghuashun',
    }
  }).filter(r => r.date)
}

export function mapFundHoldingsToFundRows(
  fundCode: string,
  items: Record<string, unknown>[],
): StandardFundHoldingRow[] {
  const c = normalizeCode(fundCode)
  return items.map(row => ({
    reportDate: msToYmd(row.end_date_ms) || msToYmd(row.publish_date_ms) || new Date().toISOString().slice(0, 10),
    holdingSymbol: fromThsCode(String(row.ticker ?? row.thscode ?? '')),
    holdingName: String(row.stock_name ?? '').trim() || null,
    weight: safeFloat(row.hold_ratio ?? row.security_market_value_rate_pct),
    shares: safeFloat(row.position_count),
    marketValue: safeFloat(row.position_capital),
    assetType: String(row.asset_type ?? 'stock'),
    source: 'tonghuashun',
  })).filter(r => r.holdingSymbol.length > 0 || (r.holdingName && r.holdingName.length > 0))
}
