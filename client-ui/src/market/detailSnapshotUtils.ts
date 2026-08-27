/** 详情页快照 — 刷新成功但 quote 为空时保留上一份，避免基本行情闪没 */
export function mergeDetailPreserveQuote<T extends { quote?: unknown | null }>(
  prev: T | null,
  next: T,
): T {
  if (next.quote != null) return next
  if (prev?.quote == null) return next
  return { ...next, quote: prev.quote }
}

/** @deprecated 与 mergeDetailPreserveQuote 相同，供跨市场详情等沿用旧名 */
export const mergeSnapshotPreserveQuote = mergeDetailPreserveQuote
