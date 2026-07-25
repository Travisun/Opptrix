/** 自适应数量单位：<1000 整数；≥1k → 1.2k；≥1M → 1.1M */
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

export function formatTurnUsageLabel(totalTokens: number, estimated?: boolean): string {
  const count = formatTokenCount(totalTokens)
  return estimated ? `本轮约 ${count}` : `本轮 ${count}`
}

export function formatContextUsageLabel(used: number, limit: number, estimated = true): string {
  const usedLabel = formatTokenCount(used)
  const limitLabel = formatTokenCount(limit)
  return estimated ? `已用约 ${usedLabel} / ${limitLabel}` : `已用 ${usedLabel} / ${limitLabel}`
}
