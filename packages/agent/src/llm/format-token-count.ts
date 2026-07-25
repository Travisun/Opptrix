/**
 * 自适应数量单位：<1000 整数；≥1k → 1.2k；≥1M → 1.1M
 */
export function formatTokenCount(n: number): string {
  const value = Math.max(0, Math.round(n))
  if (value < 1000) return String(value)
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    const rounded = Math.round(m * 10) / 10
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}M`
  }
  const k = value / 1000
  const rounded = Math.round(k * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`
}

/** 助手消息本轮用量文案，如「本轮约 1.2k」 */
export function formatTurnUsageLabel(usage: { totalTokens: number; estimated?: boolean }): string {
  const count = formatTokenCount(usage.totalTokens)
  return usage.estimated ? `本轮约 ${count}` : `本轮 ${count}`
}
