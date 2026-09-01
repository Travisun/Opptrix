import type { MarketDynamicsData, MarketIndexQuote } from '../types/schemas'
import { resolveIndexDisplayName } from '../pages/market-dynamics/cnIndexFormat'

export type WelcomePulseItem = {
  id: string
  name: string
  price: number | null
  changePct: number | null
  kind: 'index' | 'sector'
}

/** 宽基指数展示顺序（与 A 股用户心智一致） */
const INDEX_CODE_ORDER = [
  '000001',
  '399001',
  '399006',
  '000688',
  '000300',
  '000905',
  '000016',
  '899050',
] as const

/** 欢迎区轮播每页 3 列；板块池随机抽取上限 */
const WELCOME_PULSE_SECTOR_LIMIT = 15

export const WELCOME_PULSE_PAGE_SIZE = 3
export const WELCOME_PULSE_PAGE_SIZE_MOBILE = 2
export const WELCOME_PULSE_INTERVAL_MS = 4_500
export const WELCOME_PULSE_TRANSITION_MS = 480
export const WELCOME_PULSE_ROW_HEIGHT_PX = 44

function indexSortKey(item: MarketIndexQuote): number {
  const code = (item.qt_code || item.code || '').trim()
  const idx = INDEX_CODE_ORDER.indexOf(code as (typeof INDEX_CODE_ORDER)[number])
  return idx >= 0 ? idx : INDEX_CODE_ORDER.length + 1
}

function hashSeed(input: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 1_677_761_9)
  }
  return h >>> 0
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  if (items.length <= 1) return [...items]
  const out = [...items]
  let state = seed || 1
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    const j = state % (i + 1)
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

function toPulseItem(item: MarketIndexQuote, kind: 'index' | 'sector'): WelcomePulseItem {
  const code = (item.qt_code || item.code || '').trim()
  return {
    id: `${kind}:${code || item.name}`,
    name: resolveIndexDisplayName(item),
    price: item.price ?? null,
    changePct: item.change_pct ?? null,
    kind,
  }
}

function sectionItems(data: MarketDynamicsData | null | undefined, id: string): MarketIndexQuote[] {
  return data?.sections?.find(sec => sec.id === id)?.items ?? []
}

export function extractWelcomePulseItems(
  data: MarketDynamicsData | null | undefined,
  opts?: { shuffleEpoch?: number },
): WelcomePulseItem[] {
  if (!data) return []

  const indices = sectionItems(data, 'cn_major')
  const sectors = sectionItems(data, 'cn_sectors')

  const sortedIndices = [...indices].sort((a, b) => indexSortKey(a) - indexSortKey(b))
  const shuffleSeed = hashSeed(data.refreshed_at ?? '') ^ (opts?.shuffleEpoch ?? 0)
  const shuffledSectors = shuffleWithSeed(
    sectors.filter(item => item.name?.trim()),
    shuffleSeed,
  ).slice(0, WELCOME_PULSE_SECTOR_LIMIT)

  return [
    ...sortedIndices.map(item => toPulseItem(item, 'index')),
    ...shuffledSectors.map(item => toPulseItem(item, 'sector')),
  ]
}

export function resolveWelcomePulsePageSize(isMobile: boolean): number {
  return isMobile ? WELCOME_PULSE_PAGE_SIZE_MOBILE : WELCOME_PULSE_PAGE_SIZE
}

export function chunkWelcomePulsePages(
  items: WelcomePulseItem[],
  pageSize = WELCOME_PULSE_PAGE_SIZE,
): WelcomePulseItem[][] {
  if (!items.length) return []
  const pages: WelcomePulseItem[][] = []
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize))
  }
  return pages
}
