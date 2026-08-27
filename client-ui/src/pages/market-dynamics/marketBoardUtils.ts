import type { MarketDynamicsSection, MarketIndexQuote } from '../../types/schemas'
import { pctTone } from '../../market/format'

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

export function indexKey(item: MarketIndexQuote): string {
  return item.qt_code || item.code || item.name
}
