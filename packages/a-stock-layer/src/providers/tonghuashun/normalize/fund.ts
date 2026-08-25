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

/** 官方 drawdowns 字段为 week/month/…；旧别名 drawdown_* / max_drawdown_* 仍兼容 */
const DRAWDOWN_PERIODS: Array<{ period: string; label: string; keys: string[] }> = [
  { period: 'w1', label: '近 1 周', keys: ['week', 'drawdown_week', 'max_drawdown_week'] },
  { period: 'w4', label: '近 1 月', keys: ['month', 'drawdown_month', 'max_drawdown_month'] },
  { period: 'w13', label: '近 3 月', keys: ['tmonth', 'drawdown_tmonth', 'max_drawdown_tmonth'] },
  { period: 'w26', label: '近半年', keys: ['hyear', 'drawdown_hyear', 'max_drawdown_hyear'] },
  { period: 'w52', label: '近 1 年', keys: ['year', 'drawdown_year', 'max_drawdown_year'] },
  { period: 'year2', label: '近 2 年', keys: ['twoyear', 'drawdown_twoyear', 'max_drawdown_twoyear'] },
  { period: 'year3', label: '近 3 年', keys: ['tyear', 'drawdown_tyear', 'max_drawdown_tyear'] },
  { period: 'year5', label: '近 5 年', keys: ['fyear', 'drawdown_fyear', 'max_drawdown_fyear'] },
  { period: 'year', label: '今年以来', keys: ['nowyear', 'drawdown_nowyear', 'max_drawdown_nowyear'] },
  { period: 'total', label: '成立以来', keys: ['now', 'drawdown_now', 'max_drawdown_now'] },
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
  {
    keys: ['stock_ratio_pct', 'stock_ratio', 'equity_ratio', 'stock_position', 'equity_position'],
    name: '股票',
  },
  { keys: ['bond_ratio_pct', 'bond_ratio', 'bond_position'], name: '债券' },
  {
    keys: ['deposit_ratio_pct', 'cash_ratio', 'deposit_ratio', 'monetary_ratio'],
    name: '现金及存款',
  },
  { keys: ['fund_ratio', 'other_fund_ratio'], name: '基金' },
  { keys: ['other_ratio_pct', 'other_ratio', 'other_position'], name: '其他' },
]

const ALLOC_RATIO_KEYS = [
  'ratio_pct', 'hold_ratio_pct', 'weight_pct',
  'ratio', 'hold_ratio', 'weight', 'position_ratio', 'asset_ratio',
]

function mapAllocItemsFromObject(row: Record<string, unknown>): import('../../common/standard-fund.js').StandardFundAllocItem[] {
  const named = String(row.asset_name ?? row.asset_type ?? row.industry_name ?? row.sw_industry_name ?? row.name ?? '').trim()
  const ratio = pickFirstFloat(row, ALLOC_RATIO_KEYS)
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
    const ratio = pickFirstFloat(row, ALLOC_RATIO_KEYS)
    return name ? [{ name, ratio }] : []
  })
  const reportMs = assetItems[0]?.report_date_ms ?? industryItems[0]?.report_date_ms
    ?? assetItems[0]?.end_date_ms ?? industryItems[0]?.end_date_ms
    ?? assetItems[0]?.report_date ?? industryItems[0]?.report_date
  const reportPeriod = (() => {
    for (const row of [...assetItems, ...industryItems]) {
      const p = row.report_period
      if (typeof p === 'string' && p.trim()) return p.trim()
    }
    return undefined
  })()
  return {
    code: c,
    reportDate: msToYmd(reportMs) || reportPeriod || undefined,
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

/** 仅接受标量；拒绝 object/array，避免 String(obj) → "[object Object]" */
function pickStr(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = row[key]
    if (raw == null) continue
    const t = typeof raw
    if (t !== 'string' && t !== 'number' && t !== 'boolean') continue
    const v = String(raw).trim()
    if (v) return v
  }
  return undefined
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function scalarDisplay(v: unknown): string | undefined {
  if (v == null) return undefined
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') {
    const s = String(v).trim()
    return s || undefined
  }
  return undefined
}

/** 将嵌套 object/array 展平为可读中文摘要（取 name/title/desc 等字符串字段） */
function flattenNestedText(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined
  const scalar = scalarDisplay(value)
  if (scalar) return scalar
  if (Array.isArray(value)) {
    const parts = value
      .map(item => flattenNestedText(item, depth + 1))
      .filter((s): s is string => Boolean(s))
    return parts.length ? parts.slice(0, 12).join('；') : undefined
  }
  if (!isPlainRecord(value)) return undefined
  const keys = Object.keys(value)
  if (!keys.length) return undefined
  const preferred = pickStr(value, [
    'name', 'title', 'label', 'desc', 'description', 'text', 'summary',
    'fund_name', 'stock_name', 'award_name', 'period', 'content', 'value_str',
  ])
  if (preferred) {
    const extra = pickStr(value, ['period', 'start_date', 'end_date', 'date'])
    return extra && extra !== preferred ? `${preferred}（${extra}）` : preferred
  }
  const bits: string[] = []
  for (const [k, v] of Object.entries(value)) {
    const nested = flattenNestedText(v, depth + 1)
    if (!nested) continue
    bits.push(`${k}：${nested}`)
    if (bits.length >= 8) break
  }
  return bits.length ? bits.join('；') : undefined
}

function flattenIndustryPreferences(prefs: unknown): string | undefined {
  if (!prefs) return undefined
  if (typeof prefs === 'string') return prefs.trim() || undefined
  if (Array.isArray(prefs)) {
    const names = prefs.map(item => {
      if (typeof item === 'string') return item.trim()
      if (isPlainRecord(item)) {
        return pickStr(item, ['industry_name', 'name', 'label', 'title']) ?? ''
      }
      return ''
    }).filter(Boolean)
    return names.length ? names.slice(0, 8).join('、') : undefined
  }
  if (!isPlainRecord(prefs)) return undefined
  const entries = Object.entries(prefs)
  if (!entries.length) return undefined
  const parts = entries.map(([k, v]) => {
    const ratio = safeFloat(v)
    if (ratio != null) return `${k} ${ratio}%`
    const text = flattenNestedText(v)
    return text ? `${k}：${text}` : k
  })
  return parts.slice(0, 8).join('、')
}

function extractScoreLike(row: Record<string, unknown>): number | null {
  return pickFirstFloat(row, ['score', 'value', 'rating', 'resilience_score', 'toughness'])
}

function extractLabelLike(row: Record<string, unknown>): string | undefined {
  return pickStr(row, [
    'label', 'tag', 'level', 'grade', 'rank_label', 'display', 'text', 'name',
  ])
}

function formatResilienceDisplay(raw: unknown): string | number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' || typeof raw === 'boolean') {
    const s = String(raw).trim()
    return s || null
  }
  if (Array.isArray(raw)) {
    const text = flattenNestedText(raw)
    return text ?? null
  }
  if (!isPlainRecord(raw)) return null
  if (!Object.keys(raw).length) return null
  const score = extractScoreLike(raw)
  const label = extractLabelLike(raw)
  if (score != null && label) return `${label} ${score}`
  if (score != null) return score
  if (label) return label
  return flattenNestedText(raw) ?? null
}

function pushDiagnosisDimension(
  out: import('../../common/standard-fund.js').StandardFundDiagnosisDimension[],
  name: string,
  row: Record<string, unknown>,
): void {
  const n = name.trim()
  if (!n) return
  const score = extractScoreLike(row)
  const label = extractLabelLike(row)
  const value = pickStr(row, ['display', 'text', 'desc', 'description', 'value_str'])
  const peerAvg = pickFirstFloat(row, ['peer_avg', 'avg_score', 'similar_avg', 'peerAvg'])
  const detail = pickStr(row, ['detail', 'desc', 'description'])
  if (score == null && !label && !value && peerAvg == null && !detail) return
  out.push({
    name: n,
    score,
    value: value ?? undefined,
    label: label ?? undefined,
    peerAvg,
    detail: detail ?? undefined,
  })
}

function flattenDiagnosisDimensions(
  raw: unknown,
): import('../../common/standard-fund.js').StandardFundDiagnosisDimension[] {
  const out: import('../../common/standard-fund.js').StandardFundDiagnosisDimension[] = []
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isPlainRecord(entry)) continue
      const name = String(entry.name ?? entry.label ?? entry.dimension ?? entry.key ?? '').trim()
      pushDiagnosisDimension(out, name, entry)
    }
    return out
  }
  if (!isPlainRecord(raw)) return out
  for (const [key, val] of Object.entries(raw)) {
    if (isPlainRecord(val) || Array.isArray(val)) {
      if (isPlainRecord(val)) {
        pushDiagnosisDimension(out, key, val)
      } else {
        const text = flattenNestedText(val)
        if (text) out.push({ name: key, value: text })
      }
    } else {
      const score = typeof val === 'number' ? val : safeFloat(val)
      const value = typeof val === 'string' ? val.trim() : undefined
      if (score == null && !value) continue
      out.push({ name: key, score: score ?? null, value })
    }
  }
  return out
}

function mergePeerDimensionAvgs(
  dims: import('../../common/standard-fund.js').StandardFundDiagnosisDimension[],
  peerRaw: unknown,
): void {
  const peerDims = flattenDiagnosisDimensions(peerRaw)
  if (!peerDims.length) return
  const byName = new Map(peerDims.map(d => [d.name, d]))
  for (const dim of dims) {
    if (dim.peerAvg != null) continue
    const peer = byName.get(dim.name)
    if (peer?.score != null) dim.peerAvg = peer.score
  }
}

function pickManagerIdFromProfile(profile: Record<string, unknown>): string {
  const top = pickStr(profile, ['manager_id', 'managerId'])
  if (top) return top
  const info = profile.manager_info
  if (!Array.isArray(info) || !info.length) return ''
  const first = info[0]
  if (!isPlainRecord(first)) return ''
  return pickStr(first, ['manager_id', 'managerId', 'id']) ?? ''
}

function mapTradeRules(tradeRule: unknown): string[] | undefined {
  if (!Array.isArray(tradeRule) || !tradeRule.length) return undefined
  const out: string[] = []
  for (const entry of tradeRule) {
    if (typeof entry === 'string') {
      const s = entry.trim()
      if (s) out.push(s)
      continue
    }
    if (!isPlainRecord(entry)) continue
    const title = pickStr(entry, ['title', 'name', 'label', 'rule_name', 'rule_title', 'content', 'desc'])
    if (!title) continue
    const when = msToYmd(entry.display_time_ms ?? entry.time_ms ?? entry.date_ms)
      || pickStr(entry, ['display_time', 'time', 'date'])
    out.push(when ? `${title}（${when}）` : title)
  }
  return out.length ? out : undefined
}

const FINANCIAL_LABEL_ZH: Record<string, string> = {
  distribution_profit: '可分配利润',
  current_profit: '本期利润',
  current_income: '本期收入',
  distribution_share_profit: '每份可分配利润',
  average_nav_profit_margin: '平均净值利润率',
  average_share_current_profit: '平均每份本期利润',
  share_nav: '单位净值',
  sum_share_nav: '累计单位净值',
  asset_nav: '基金资产净值',
  nav_rate: '净值增长率',
  sum_nav_rate: '累计净值增长率',
}

function pickMgmtExpenseRate(rateInfo: unknown): number | null {
  if (!Array.isArray(rateInfo)) return null
  for (const entry of rateInfo) {
    if (!isPlainRecord(entry)) continue
    const label = String(entry.rate_type ?? entry.rate_name ?? entry.label ?? '').trim()
    if (label.includes('管理')) {
      const rate = safeFloat(entry.standard_rate ?? entry.rate ?? entry.fee_rate)
      if (rate != null) return rate
    }
  }
  return null
}

/** 扶摇 profile.rate_info → 全量费率列表（管理费/托管费/销售服务费等） */
export function mapFundRateInfo(rateInfo: unknown): import('../../common/standard-fund.js').StandardFundRateInfoItem[] {
  if (!Array.isArray(rateInfo)) return []
  const out: import('../../common/standard-fund.js').StandardFundRateInfoItem[] = []
  for (const entry of rateInfo) {
    if (!isPlainRecord(entry)) continue
    const label = String(entry.rate_type ?? entry.rate_name ?? entry.label ?? entry.fee_name ?? '').trim()
    if (!label) continue
    const noteParts: string[] = []
    const baseNote = pickStr(entry, ['note', 'remark', 'desc', 'description', 'rate_desc'])
    if (baseNote) noteParts.push(baseNote)
    const chargeMode = pickStr(entry, ['charge_mode', 'chargeMode', 'fee_mode'])
    if (chargeMode) noteParts.push(`收费模式：${chargeMode}`)
    const condition = pickStr(entry, ['condition', 'rate_condition', 'fee_condition'])
    if (condition) noteParts.push(`条件：${condition}`)
    const preferential = pickFirstFloat(entry, ['preferential_rate', 'preferentialRate', 'discount_rate'])
      ?? pickStr(entry, ['preferential_rate', 'preferentialRate', 'discount_rate'])
    if (preferential != null && preferential !== '') {
      noteParts.push(`优惠费率：${typeof preferential === 'number' ? `${preferential}%` : preferential}`)
    }
    out.push({
      label,
      name: label,
      rate: safeFloat(entry.standard_rate ?? entry.rate ?? entry.fee_rate),
      note: noteParts.length ? noteParts.join('；') : undefined,
    })
  }
  return out
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
  const rateInfo = mapFundRateInfo(profile.rate_info)
  const expenseRatio = pickMgmtExpenseRate(profile.rate_info)
  const managerInfo0 = Array.isArray(profile.manager_info) && isPlainRecord(profile.manager_info[0])
    ? profile.manager_info[0]
    : null
  const managerId = pickManagerIdFromProfile(profile) || undefined
  const managerName = pickStr(profile, ['manager_name', 'manager'])
    ?? (managerInfo0 ? pickStr(managerInfo0, ['manager_name', 'name']) : undefined)
  const tradeRules = mapTradeRules(profile.trade_rule)
  return {
    code: c,
    name: String(profile.fund_name ?? '').trim() || undefined,
    fullName: pickStr(profile, ['full_name', 'fund_full_name', 'fund_name_full']),
    fundType: String(profile.invest_type ?? profile.fund_type ?? '').trim() || undefined,
    manager: managerName,
    managerId,
    company: String(profile.mgmt_name ?? '').trim() || undefined,
    companyId: pickStr(profile, ['mgmt_id', 'company_id', 'companyId', 'mgmtId']),
    custodian: String(profile.custodian_name ?? profile.custodian ?? '').trim() || undefined,
    expenseRatio,
    rateInfo: rateInfo.length ? rateInfo : undefined,
    purchaseFee: pickFirstFloat(profile, ['purchase_fee', 'subscribe_fee', 'buy_fee', '申购费率']),
    redeemFee: pickFirstFloat(profile, ['redeem_fee', 'redemption_fee', 'sell_fee', '赎回费率']),
    scale: scaleToYi(profile.fund_scale),
    totalShares: pickFirstFloat(profile, ['total_shares', 'fund_share', 'share', 'total_share']),
    unitNav,
    accNav,
    navDate,
    changePct,
    benchmark: String(profile.benchmark ?? profile.benchmark_name ?? '').trim() || undefined,
    investTarget: String(profile.invest_target ?? '').trim() || undefined,
    investScope: String(profile.invest_scope ?? '').trim() || undefined,
    investPhilosophy: pickStr(profile, ['invest_philosophy', 'investment_philosophy', 'philosophy']),
    investStrategy: pickStr(profile, ['invest_strategy', 'investment_strategy', 'strategy']),
    tradeRules,
    establishDate: msToYmd(profile.estab_date) || undefined,
    riskLevel: pickStr(profile, ['risk_level', 'risk_grade', 'riskLevel', 'risk']),
    performance,
    return1y: performance?.w52 ?? null,
    source: 'tonghuashun',
    ...opts?.holders,
  }
}

function collectFundNamesFromNested(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || out.length >= 8) return
  if (typeof value === 'string') {
    const s = value.trim()
    if (s) out.push(s)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFundNamesFromNested(item, out, depth + 1)
    return
  }
  if (!isPlainRecord(value)) return
  const name = pickStr(value, ['fund_name', 'representative_fund_name', 'name', 'title'])
  if (name) out.push(name)
  for (const v of Object.values(value)) {
    if (out.length >= 8) break
    if (typeof v === 'object' && v != null) collectFundNamesFromNested(v, out, depth + 1)
  }
}

export function mapFundManagerRow(
  code: string,
  managerId: string,
  parts: {
    detail?: Record<string, unknown> | null
    style?: Record<string, unknown> | Record<string, unknown>[] | null
    experience?: Record<string, unknown>[] | Record<string, unknown> | null
    performance?: Record<string, unknown> | Record<string, unknown>[] | null
    profile?: Record<string, unknown> | null
  },
): import('../../common/standard-fund.js').StandardFundManagerRow | null {
  const detail = parts.detail && typeof parts.detail === 'object' ? parts.detail : null
  const profile = parts.profile && typeof parts.profile === 'object' ? parts.profile : null
  const name = pickStr(detail ?? {}, ['manager_name', 'name', 'manager'])
    ?? pickStr(profile ?? {}, ['manager_name', 'manager'])
  const styleRaw = parts.style
  const styleObj = Array.isArray(styleRaw)
    ? (styleRaw[0] && typeof styleRaw[0] === 'object' ? styleRaw[0] as Record<string, unknown> : null)
    : (styleRaw && typeof styleRaw === 'object' ? styleRaw as Record<string, unknown> : null)

  const styleFromFields = styleObj
    ? pickStr(styleObj, ['style_name', 'invest_style', 'style', 'name', 'label'])
    : undefined
  const industryPrefText = styleObj
    ? flattenIndustryPreferences(styleObj.industry_preferences ?? styleObj.prefer_industry)
    : undefined
  const styleText = styleFromFields
    ?? (industryPrefText ? `行业偏好：${industryPrefText}` : undefined)
    ?? (styleObj ? pickStr(styleObj, ['investment_idea']) : undefined)

  const experienceRaw = parts.experience
  const experienceList: Record<string, unknown>[] = Array.isArray(experienceRaw)
    ? experienceRaw.filter(isPlainRecord)
    : (isPlainRecord(experienceRaw) ? [experienceRaw] : [])
  const experienceBlob = experienceList[0] ?? null

  const representFunds: string[] = []
  const repName = styleObj
    ? pickStr(styleObj, ['representative_fund_name', 'fund_name', 'name'])
    : undefined
  if (repName) representFunds.push(repName)
  for (const row of experienceList) {
    collectFundNamesFromNested(
      row.investment_history ?? row.fund_name ?? row.name ?? row,
      representFunds,
    )
  }
  const uniqueFunds = [...new Set(representFunds.map(s => s.trim()).filter(Boolean))].slice(0, 8)

  const performanceRaw = parts.performance
  let performancePoint: Record<string, unknown> | null = null
  if (Array.isArray(performanceRaw) && performanceRaw.length) {
    const sorted = [...performanceRaw]
      .filter(isPlainRecord)
      .sort((a, b) => Number(a.date_ms ?? 0) - Number(b.date_ms ?? 0))
    performancePoint = sorted[sorted.length - 1] ?? null
  } else if (isPlainRecord(performanceRaw)) {
    performancePoint = performanceRaw
  }

  const workYears = pickFirstFloat(detail ?? {}, ['work_years', 'career_years', 'manage_years', 'years'])
  const philosophy = pickStr(styleObj ?? {}, ['investment_idea', 'invest_idea', 'philosophy'])
    ?? pickStr(detail ?? {}, [
      'invest_philosophy', 'investment_philosophy', 'philosophy', 'invest_idea', 'investment_idea',
    ])
    ?? pickStr(profile ?? {}, ['invest_philosophy', 'investment_philosophy'])

  const resume = pickStr(detail ?? {}, ['resume', 'introduction', 'intro', 'profile', 'biography'])
  let nestedExperienceText: string | undefined
  if (experienceBlob) {
    const partsText: string[] = []
    const hist = flattenNestedText(experienceBlob.investment_history)
    if (hist) partsText.push(`从业经历：${hist}`)
    const awards = flattenNestedText(experienceBlob.awards)
    if (awards) partsText.push(`获奖：${awards}`)
    const heavy = flattenNestedText(experienceBlob.heavy_assets)
    if (heavy) partsText.push(`重仓资产：${heavy}`)
    if (partsText.length) {
      nestedExperienceText = partsText.join('\n')
    } else {
      // 兼容旧结构：fund_name + 起止日
      const legacy = experienceList.slice(0, 3).map(row => {
        const fund = pickStr(row, ['fund_name', 'name']) ?? ''
        const start = msToYmd(row.start_date_ms ?? row.start_date) || String(row.start_date ?? '').slice(0, 10)
        return [fund, start].filter(Boolean).join(' · ')
      }).filter(Boolean)
      if (legacy.length) nestedExperienceText = legacy.join('；')
    }
  }
  const experienceText = resume || nestedExperienceText
  // UI：履历用 resume；经历摘要优先嵌套展平（与 resume 不同时才展示）
  const experienceForUi = nestedExperienceText || (!resume ? experienceText : undefined)

  let performanceSummary: string | undefined
  const annual = pickFirstFloat(detail ?? {}, ['annual_return_pct', 'annual_return'])
  const maximum = pickFirstFloat(detail ?? {}, ['maximum_return_pct', 'max_return_pct', 'maximum_return'])
  const bits: string[] = []
  if (annual != null) bits.push(`年化收益 ${annual}%`)
  if (maximum != null) bits.push(`最大收益 ${maximum}%`)
  if (!bits.length && performancePoint) {
    const y1 = safeFloat(
      performancePoint.manager_return_pct
      ?? performancePoint.return_year
      ?? performancePoint.w52
      ?? performancePoint.year_return,
    )
    const total = safeFloat(performancePoint.return_now ?? performancePoint.total_return)
    if (y1 != null) bits.push(`近一年 ${y1}%`)
    if (total != null) bits.push(`任职回报 ${total}%`)
  }
  performanceSummary = bits.length ? bits.join('，') : undefined

  const scale = scaleToYi(
    styleObj?.total_fund_scale
    ?? detail?.manage_scale
    ?? detail?.management_scale
    ?? detail?.fund_scale
    ?? performancePoint?.manage_scale,
  )

  if (!name && !detail && !styleObj && !experienceList.length && !performancePoint) return null
  return {
    code: normalizeCode(code),
    managerId,
    name: name || undefined,
    gender: pickStr(detail ?? {}, ['sex', 'gender']),
    education: pickStr(detail ?? {}, ['degree', 'education', 'edu']),
    resume,
    startDate: msToYmd(detail?.start_date ?? detail?.start_date_ms ?? detail?.office_date)
      || pickStr(detail ?? {}, ['start_date', 'office_date'])
      || undefined,
    workYears,
    years: workYears,
    style: styleText,
    philosophy,
    experienceList,
    experience: experienceForUi || experienceText,
    representFunds: uniqueFunds.length ? uniqueFunds : undefined,
    scale,
    performance: performancePoint,
    performanceSummary,
    source: 'tonghuashun',
  }
}

export function mapFundDiagnosisRow(
  code: string,
  item: Record<string, unknown> | null | undefined,
): import('../../common/standard-fund.js').StandardFundDiagnosisRow | null {
  if (!item || typeof item !== 'object') return null
  const dimensions = flattenDiagnosisDimensions(
    item.dimensions ?? item.radar ?? item.scores ?? item.indicators,
  )
  mergePeerDimensionAvgs(dimensions, item.peer_dimensions ?? item.peerDimensions)

  const score = pickFirstFloat(item, ['score', 'total_score', 'diag_score', 'overall_score'])
  const grade = pickStr(item, ['grade', 'level', 'rating', 'diag_grade'])
  const summary = pickStr(item, ['summary', 'conclusion', 'comment', 'desc', 'description'])
  const resilience = formatResilienceDisplay(item.resilience)
    ?? formatResilienceDisplay(item.resilience_score)
    ?? formatResilienceDisplay(item.toughness)
    ?? pickFirstFloat(item, ['resilience_score'])
    ?? null

  if (score == null && !grade && !summary && resilience == null && !dimensions.length) return null
  return {
    code: normalizeCode(code),
    score,
    grade,
    summary,
    resilience,
    dimensions: dimensions.length ? dimensions : undefined,
    source: 'tonghuashun',
  }
}

export function mapFundNewsRows(
  code: string,
  items: Record<string, unknown>[],
): import('../../common/standard-fund.js').StandardFundNewsRow[] {
  const c = normalizeCode(code)
  const out: import('../../common/standard-fund.js').StandardFundNewsRow[] = []
  for (const row of items) {
    const title = String(row.title ?? row.article_title ?? row.news_title ?? row.name ?? '').trim()
    if (!title) continue
    const date = msToYmd(row.publish_time ?? row.publish_date_ms ?? row.date_ms ?? row.ctime)
      || String(row.publish_date ?? row.date ?? row.pub_time ?? '').slice(0, 10)
      || undefined
    out.push({
      code: c,
      title,
      date,
      url: pickStr(row, ['url', 'link', 'article_url', 'jump_url']),
      sourceName: pickStr(row, ['source', 'media', 'source_name', 'media_name']),
      summary: pickStr(row, ['summary', 'abstract', 'digest', 'content']),
      source: 'tonghuashun',
    })
  }
  return out
}

export function mapFundFinancialsRow(
  code: string,
  items: Record<string, unknown>[],
): import('../../common/standard-fund.js').StandardFundFinancialsRow | null {
  if (!items.length) return null
  const c = normalizeCode(code)
  // 上游可能返回「一行多指标」或「多行指标」；统一压成 indicators 列表
  const indicators: import('../../common/standard-fund.js').StandardFundFinancialIndicator[] = []
  let reportDate: string | undefined
  for (const row of items) {
    const rd = msToYmd(row.report_date_ms ?? row.end_date_ms ?? row.report_date)
      || String(row.report_date ?? row.end_date ?? '').slice(0, 10)
      || undefined
    if (rd && !reportDate) reportDate = rd

    const namedLabel = pickStr(row, ['indicator_name', 'name', 'label', 'metric_name', 'item_name'])
    if (namedLabel) {
      indicators.push({
        label: namedLabel,
        value: pickFirstFloat(row, ['value', 'indicator_value', 'amount', 'num'])
          ?? pickStr(row, ['value_str', 'display', 'text'])
          ?? null,
        unit: pickStr(row, ['unit', 'unit_name']),
      })
      continue
    }

    // 单行宽表：跳过日期/代码类字段，其余数值/字符串作指标
    const skip = new Set([
      'thscode', 'fund_type', 'ticker', 'code', 'report_date', 'report_date_ms',
      'end_date', 'end_date_ms', 'publish_date', 'publish_date_ms',
      'start_date', 'start_date_ms',
    ])
    for (const [key, val] of Object.entries(row)) {
      if (skip.has(key)) continue
      if (val == null || val === '') continue
      if (typeof val === 'object') continue
      indicators.push({
        label: FINANCIAL_LABEL_ZH[key] ?? key,
        value: typeof val === 'number' ? val : (safeFloat(val) ?? String(val)),
      })
    }
  }
  if (!indicators.length) return null

  const pickIndicator = (...aliases: string[]): number | null => {
    for (const ind of indicators) {
      const key = ind.label.toLowerCase()
      if (aliases.some(a => key === a.toLowerCase() || key.includes(a.toLowerCase()))) {
        return typeof ind.value === 'number' ? ind.value : safeFloat(ind.value)
      }
    }
    return null
  }

  return {
    code: c,
    reportDate,
    indicators,
    revenue: pickIndicator('营业收入', 'revenue', 'operating_revenue', 'income', '本期收入', 'current_income'),
    revenueYoy: pickIndicator('营收同比', 'revenue_yoy', 'income_yoy'),
    netProfit: pickIndicator('净利润', '本期利润', 'net_profit', 'netprofit', 'profit', 'current_profit'),
    netProfitYoy: pickIndicator('净利同比', 'net_profit_yoy', 'profit_yoy'),
    eps: pickIndicator('每股收益', 'eps'),
    roe: pickIndicator('净资产收益率', 'roe'),
    grossMargin: pickIndicator('毛利率', 'gross_margin'),
    debtRatio: pickIndicator('资产负债率', 'debt_ratio', 'asset_liability'),
    source: 'tonghuashun',
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
