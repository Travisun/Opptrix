import type { MarketDynamicsSection, MarketIndexQuote } from '../../types/schemas'
import { pctTone } from '../../market/format'
import { indexChartCodeFromQuote } from './cnIndexChartStorage'

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
  const spotlight = sections.find(sec => sec.id === 'spotlight')?.items ?? []
  if (spotlight.length >= 4) return spotlight.slice(0, STRIP_LIMIT)

  const merged: MarketIndexQuote[] = []
  const seen = new Set<string>()
  const push = (items: MarketIndexQuote[]) => {
    for (const item of items) {
      const key = item.qt_code || item.code || item.name
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(item)
      if (merged.length >= STRIP_LIMIT) return
    }
  }

  push(spotlight)
  push(sections.find(sec => sec.id === 'cn_major')?.items ?? [])
  push(sections.find(sec => sec.id === 'america')?.items ?? [])
  push(sections.find(sec => sec.id === 'asia')?.items ?? [])

  return merged.slice(0, STRIP_LIMIT)
}

export function isCnChartableIndex(
  item: MarketIndexQuote,
  cnIndices: MarketIndexQuote[],
): boolean {
  if (!cnIndices.length) return false
  const code = indexChartCodeFromQuote(item)
  if (!/^\d{6}$/.test(code)) return false
  return cnIndices.some(row => indexChartCodeFromQuote(row) === code)
}

export function chartCodeFromIndex(
  item: MarketIndexQuote,
  cnIndices: MarketIndexQuote[],
): string | null {
  if (!isCnChartableIndex(item, cnIndices)) return null
  return indexChartCodeFromQuote(item)
}

export function indexKey(item: MarketIndexQuote): string {
  return item.qt_code || item.code || item.name
}
