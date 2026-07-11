import type { WatchlistItem } from '../types/market'
import { displayCodeFromInstrument, normalizeWatchlistItem, resolveWatchlistInstrument, watchlistItemKey } from '../market/instrument'

/** 发送时将输入框标签 + 正文合成为 Agent 可读消息 */
export function composeComposerMessage(text: string, refs: WatchlistItem[]): string {
  const body = text.trim()
  if (!refs.length) return body

  const subject = refs
    .map(r => {
      const item = normalizeWatchlistItem(r)
      const ref = resolveWatchlistInstrument(item)
      const label = displayCodeFromInstrument(ref)
      return `${item.name}(${label})`
    })
    .join('、')

  if (!body) return `请分析${subject}`
  return `关于${subject}：${body}`
}

export function stockRefKey(item: WatchlistItem): string {
  return watchlistItemKey(normalizeWatchlistItem(item))
}

export function mergeStockRef(existing: WatchlistItem[], item: WatchlistItem): WatchlistItem[] {
  const row = normalizeWatchlistItem(item)
  const key = watchlistItemKey(row)
  if (existing.some(r => watchlistItemKey(normalizeWatchlistItem(r)) === key)) return existing
  return [...existing, row]
}
