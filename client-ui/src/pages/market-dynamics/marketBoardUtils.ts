import type { MarketDynamicsSection, MarketIndexQuote } from '../../types/schemas'
import type { InstrumentRef } from '../../types/instrument'
import { resolveCnInstrumentIdentity } from '@opptrix/shared/instrument-symbol'
import { pctTone } from '../../market/format'
import { normalizeInstrumentRefLocal, tryParseInstrumentInput } from '../../market/instrument'

export function computeMarketMood(sections: MarketDynamicsSection[]) {
  const all = sections.flatMap(sec => sec.items)
  let up = 0
  let down = 0
  for (const item of all) {
    const tone = pctTone(item.change_pct)
    if (tone === 'up') up += 1
    else if (tone === 'down') down += 1
  }
  return {
    up,
    down,
    label: up > down ? '偏多' : down > up ? '偏空' : '震荡',
  }
}

const STRIP_LIMIT = 8

export function pickBoardStripIndices(sections: MarketDynamicsSection[]): MarketIndexQuote[] {
  const cnMajor = sections.find(sec => sec.id === 'cn_major')?.items ?? []
  return cnMajor.slice(0, STRIP_LIMIT)
}

/** 图表用代码：优先 chart_symbol（港/美代理），否则 6 位 A 股指数代码 */
export function indexChartCodeFromQuote(item: Pick<MarketIndexQuote, 'code' | 'qt_code' | 'chart_symbol'>): string {
  if (item.chart_symbol) return item.chart_symbol
  const raw = item.qt_code || item.code || ''
  const match = raw.match(/(\d{6})/)
  if (match) return match[1]!
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0').slice(-6)
}

export function isCnChartableIndex(
  item: MarketIndexQuote,
  cnIndices: MarketIndexQuote[],
): boolean {
  if (item.chart_symbol) return true
  const code = indexChartCodeFromQuote(item)
  if (!/^\d{6}$/.test(code)) return false
  return cnIndices.some(row => !row.chart_symbol && indexChartCodeFromQuote(row) === code)
}

export function chartCodeFromIndex(
  item: MarketIndexQuote,
  cnIndices: MarketIndexQuote[],
): string | null {
  if (item.chart_symbol) return item.chart_symbol
  if (!isCnChartableIndex(item, cnIndices)) return null
  return indexChartCodeFromQuote(item)
}

/** 指数图表用 InstrumentRef — 与右侧行情面板统一（INDEX + exchange 消歧） */
export function indexInstrumentFromQuote(
  item: MarketIndexQuote | null | undefined,
): InstrumentRef | undefined {
  if (!item) return undefined

  const mkt = (item.market ?? '').toUpperCase()
  const chartSym = item.chart_symbol?.trim()

  if (chartSym && (mkt === 'HK' || mkt === 'US')) {
    return { market: mkt as 'HK' | 'US', assetClass: 'ETF', symbol: chartSym }
  }

  const symbol = indexChartCodeFromQuote(item)
  if (!symbol) return undefined

  if (/^\d{6}$/.test(symbol)) {
    const exchange = mkt === 'SH' || mkt === 'SZ'
      ? mkt
      : symbol.startsWith('399')
        ? 'SZ'
        : 'SH'
    return normalizeInstrumentRefLocal(resolveCnInstrumentIdentity({
      market: 'CN',
      assetClass: 'INDEX',
      symbol,
      exchange,
    }))
  }

  if (chartSym) {
    return { market: 'US', assetClass: 'ETF', symbol: chartSym }
  }

  return undefined
}

/** 指数图表面板：优先行情行，回退 chartCode（禁止裸 6 位码当个股） */
export function resolveMarketIndexChartInstrument(
  item: MarketIndexQuote | null | undefined,
  chartCode: string | null | undefined,
): InstrumentRef | undefined {
  const fromQuote = indexInstrumentFromQuote(item)
  if (fromQuote) return fromQuote

  const code = (chartCode ?? '').trim()
  if (!code) return undefined

  const parsed = tryParseInstrumentInput(code)
  if (parsed?.assetClass === 'INDEX') return normalizeInstrumentRefLocal(parsed)

  const bare = code.match(/^(\d{6})$/)?.[1]
  if (bare) {
    return normalizeInstrumentRefLocal(resolveCnInstrumentIdentity({
      market: 'CN',
      assetClass: 'INDEX',
      symbol: bare,
      exchange: bare.startsWith('399') ? 'SZ' : 'SH',
    }))
  }

  return indexInstrumentFromQuote({
    code,
    chart_symbol: code,
    name: '',
    price: null,
    change_pct: null,
    market: code.startsWith('399') ? 'SZ' : 'SH',
  })
}

export function indexKey(item: MarketIndexQuote): string {
  return item.qt_code || item.code || item.name
}
