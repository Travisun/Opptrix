import type { AssetClass, InstrumentRef, Market, StockListItem } from '@opptrix/shared'
import {
  parseOpptrixInstrumentId,
  type OpptrixInstrumentIdParts,
  canonicalSymbolForMarket,
  instrumentHubCode,
  instrumentRefLabel,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
  parseCanonicalInstrumentInput,
} from '@opptrix/shared'

export { parseOpptrixInstrumentId, type OpptrixInstrumentIdParts } from '@opptrix/shared'
import { safeFloat } from '../../utils/helpers.js'
import type {
  OpptrixFundLatestNavItem,
  OpptrixFundMetrics,
  OpptrixInstrument,
  OpptrixNavRow,
  StockIndexItem,
} from './api/client.js'
import type {
  StandardFundNavRow,
  StandardFundProfileRow,
  StandardFundQuoteRow,
} from '../common/standard-fund.js'

const SOURCE = 'stockindex'

function cnExchangeFromInstrumentId(instrumentId: string): 'SH' | 'SZ' | 'BJ' | 'PF' | undefined {
  if (/^CN:(?:PF|OF)\./i.test(instrumentId)) return 'PF'
  const m = instrumentId.match(/^CN:(SH|SZ|BJ)\./i)
  const ex = m?.[1]
  return ex ? ex.toUpperCase() as 'SH' | 'SZ' | 'BJ' : undefined
}

/** 上游 venue（SSE/SZSE/BJSE/HKEX/NASDAQ...）→ 应用内交易所标识 */
export function venueToExchange(venue: string | null | undefined): string | undefined {
  const v = String(venue ?? '').trim().toUpperCase()
  switch (v) {
    case 'SSE': return 'SH'
    case 'SZSE': return 'SZ'
    case 'BJSE': return 'BJ'
    case 'HKEX': return 'HK'
    default: return v || undefined
  }
}

/** OpptrixQuant Instrument → 旧 StockIndex 行形态（供 normalize / market-data 复用） */
export function opptrixInstrumentToStockIndexItem(
  instrument: OpptrixInstrument,
): StockIndexItem {
  return {
    instrumentId: instrument.instrument_id,
    market: instrument.market,
    code: instrument.instrument_id || instrument.symbol,
    symbol: instrument.symbol,
    nameCn: instrument.name ?? null,
    industryName: instrument.sub_type ?? null,
    sub_type: instrument.sub_type ?? null,
    exchange: venueToExchange(instrument.venue),
    assetType: instrument.class_token,
  }
}

function assetClassFromOpptrixToken(assetType?: string): AssetClass | null {
  const at = String(assetType ?? '').trim().toLowerCase()
  if (at === 'stock' || at === 'equity') return 'EQUITY'
  if (at === 'ind' || at === 'index') return 'INDEX'
  if (at === 'otc' || at === 'of' || at === 'fund') return 'FUND'
  if (at === 'etf') return 'ETF'
  if (at === 'lof') return 'LOF'
  if (at === 'reit') return 'REIT'
  return null
}

export function stockIndexItemToInstrumentRef(item: StockIndexItem): InstrumentRef | null {
  const market = String(item.market ?? '').toUpperCase() as Market
  const code = String(item.code ?? '').trim()
  if (!code) return null

  const instrumentIdStr = String(item.instrumentId ?? '').trim()
  // 优先 OpptrixQuant 冒号格式（CN:of:xxxx / US:stock:AAPL），再试旧点号兼容（CN:OF.xxxx / HK:HK.00002）
  const fromOpptrix = instrumentIdStr ? parseOpptrixInstrumentId(instrumentIdStr) : null
  const fromLegacy = instrumentIdStr
    ? (parseInstrumentNamespace(instrumentIdStr) ?? parseCanonicalInstrumentInput(instrumentIdStr))
    : null
  const fromId = fromOpptrix ?? fromLegacy

  const exchange = fromOpptrix?.exchange
    ?? venueToExchange(item.exchange)
    ?? fromLegacy?.exchange
    ?? cnExchangeFromInstrumentId(instrumentIdStr)

  if (market === 'CN') {
    if (fromId) return normalizeInstrumentRef(fromId)
    const fromToken = assetClassFromOpptrixToken(item.assetType)
    if (fromToken) {
      return normalizeInstrumentRef({
        market: 'CN',
        assetClass: fromToken,
        symbol: code,
        exchange: exchange as InstrumentRef['exchange'],
      })
    }
    return null
  }

  if (market === 'US' || market === 'HK') {
    const codeSym = canonicalSymbolForMarket(market, code)
    if (fromId && canonicalSymbolForMarket(market, fromId.symbol) === codeSym) {
      return normalizeInstrumentRef(fromId)
    }
    return normalizeInstrumentRef({
      market,
      assetClass: 'EQUITY',
      symbol: codeSym,
      exchange: exchange ?? (market === 'HK' ? 'HK' : undefined),
    })
  }

  return null
}

export function refLabelFromInstrument(ref: InstrumentRef): string {
  return instrumentRefLabel(ref)
}

export function stockIndexItemToListRow(item: StockIndexItem): StockListItem | null {
  const ref = stockIndexItemToInstrumentRef(item)
  if (!ref) return null
  const isFund = ref.assetClass === 'FUND'
  const industry = isFund
    ? 'FUND'
    : (item.industryName ?? item.sub_type ?? '')
  return {
    code: instrumentHubCode(ref),
    name: item.nameCn ?? item.code,
    industry,
    market: isFund ? 'PF' : (ref.exchange ?? ref.market),
  }
}

export function stockIndexItemsToListRows(items: StockIndexItem[]): StockListItem[] {
  const out: StockListItem[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const row = stockIndexItemToListRow(item)
    if (!row) continue
    const key = `${row.market}:${row.code}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

export function parseStockIndexMarket(raw: string | undefined): Market | undefined {
  const m = String(raw ?? '').trim().toUpperCase()
  if (m === 'CN' || m === 'US' || m === 'HK') return m
  return undefined
}

/** 基金净值历史 → 标准净值行（date 升序算 changePct，返回倒序） */
export function opptrixNavToStandardRows(rows: OpptrixNavRow[]): StandardFundNavRow[] {
  const sorted = [...rows].sort((a, b) =>
    String(a.as_of_date ?? '').localeCompare(String(b.as_of_date ?? '')),
  )
  const mapped: StandardFundNavRow[] = []
  for (const row of sorted) {
    const code = String(row.product_code ?? '').trim()
    const date = String(row.as_of_date ?? '').slice(0, 10)
    if (!code || !date) continue
    mapped.push({
      code,
      date,
      nav: safeFloat(row.nav_unit),
      accNav: safeFloat(row.nav_cumulative),
      changePct: null,
      source: SOURCE,
      per10kGain: safeFloat(row.per_10k_gain),
      annualized7d: safeFloat(row.annualized_7d),
      fundAssets: safeFloat(row.fund_assets),
    })
  }

  for (let i = 1; i < mapped.length; i++) {
    const row = mapped[i]
    const prev = mapped[i - 1]?.nav
    if (!row) continue
    if (prev != null && row.nav != null && prev > 0) {
      row.changePct = ((row.nav - prev) / prev) * 100
    }
  }

  return mapped.sort((a, b) => b.date.localeCompare(a.date))
}

/** 批量最新净值项 → 标准行情行 */
export function opptrixLatestNavToQuoteRow(
  item: OpptrixFundLatestNavItem,
): StandardFundQuoteRow | null {
  const code = String(item.product_code ?? '').trim()
  if (!code) return null
  return {
    code,
    name: item.product_name ?? undefined,
    unitNav: safeFloat(item.nav_unit),
    accNav: safeFloat(item.nav_cumulative),
    changePct: null,
    navDate: item.as_of_date ? String(item.as_of_date).slice(0, 10) : undefined,
    source: SOURCE,
    fundAssets: safeFloat(item.fund_assets),
    per10kGain: safeFloat(item.per_10k_gain),
    annualized7d: safeFloat(item.annualized_7d),
  }
}

/** 标的详情 → 标准基金档案行（profile 稀疏可接受） */
export function opptrixInstrumentToProfileRow(
  instrument: OpptrixInstrument,
): StandardFundProfileRow | null {
  const code = String(instrument.symbol ?? '').trim()
  if (!code) return null
  return {
    code,
    name: instrument.name ?? undefined,
    fullName: instrument.name ?? undefined,
    fundType: instrument.sub_type ?? undefined,
    source: SOURCE,
    instrumentId: instrument.instrument_id,
    market: instrument.market,
    venue: instrument.venue ?? undefined,
    currency: instrument.currency ?? undefined,
    status: instrument.status ?? undefined,
  }
}

/** 基金绩效指标 → 数值化记录行（自定义方法 fundMetrics 输出） */
export function opptrixMetricsToRow(metrics: OpptrixFundMetrics): Record<string, unknown> | null {
  const code = String(metrics.product_code ?? '').trim()
  if (!code) return null
  const date = (raw?: string | null) => (raw ? String(raw).slice(0, 10) : undefined)
  return {
    code,
    name: metrics.product_name ?? undefined,
    asOfDate: date(metrics.as_of_date),
    startDate: date(metrics.start_date),
    endDate: date(metrics.end_date),
    totalReturn: safeFloat(metrics.total_return),
    annualReturn: safeFloat(metrics.annual_return),
    winRate: safeFloat(metrics.win_rate),
    maxDrawdown: safeFloat(metrics.max_drawdown),
    annualVol: safeFloat(metrics.annual_vol),
    downsideVol: safeFloat(metrics.downside_vol),
    sharpe: safeFloat(metrics.sharpe),
    sortino: safeFloat(metrics.sortino),
    calmar: safeFloat(metrics.calmar),
    days: metrics.days != null ? Number(metrics.days) : null,
    source: SOURCE,
  }
}
