import type { WatchlistItem } from '../types/market'
import { normalizeCode } from '../market/format'

/** 发送时将输入框标签 + 正文合成为 Agent 可读消息 */
export function composeComposerMessage(text: string, refs: WatchlistItem[]): string {
  const body = text.trim()
  if (!refs.length) return body

  const subject = refs
    .map(r => `${r.name}(${normalizeCode(r.code)})`)
    .join('、')

  if (!body) return `请分析${subject}`
  return `关于${subject}：${body}`
}

export function stockRefKey(item: WatchlistItem): string {
  return normalizeCode(item.code)
}

export function mergeStockRef(existing: WatchlistItem[], item: WatchlistItem): WatchlistItem[] {
  const key = stockRefKey(item)
  if (existing.some(r => stockRefKey(r) === key)) return existing
  return [...existing, item]
}
