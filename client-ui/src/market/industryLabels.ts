/** Display label for industry bucket in lists (e.g. "-" → 其他). */
export function industryDisplayName(industry: string): string {
  const t = industry.trim()
  if (!t || t === '-' || t === '未分类') return '其他'
  return t
}

export function industryMatchesFilter(industry: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    industryDisplayName(industry).toLowerCase().includes(q)
    || industry.toLowerCase().includes(q)
  )
}

/** Query string for industry_mining API (e.g. "-" → 其他). */
export function industryMiningQuery(industry: string): string {
  const t = industry.trim()
  if (!t || t === '-' || t === '未分类') return '其他'
  return t
}
