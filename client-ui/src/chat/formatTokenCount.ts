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

/** Composer 底栏：上下文约 N%；整理后追加「已整理」 */
export function formatContextUsageLabel(usagePercent: number, compacted?: boolean): string {
  const pct = Math.min(100, Math.max(0, Math.round(usagePercent)))
  const base = `上下文约 ${pct}%`
  return compacted ? `${base} · 已整理` : base
}

/** 兼容旧字段：无 usagePercent 时由 used/limit 推算 */
export function resolveContextUsagePercent(usage: {
  usagePercent?: number
  usedTokens: number
  limitTokens: number
}): number {
  if (typeof usage.usagePercent === 'number' && Number.isFinite(usage.usagePercent)) {
    return Math.min(100, Math.max(0, Math.round(usage.usagePercent)))
  }
  if (!(usage.limitTokens > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((usage.usedTokens / usage.limitTokens) * 100)))
}
