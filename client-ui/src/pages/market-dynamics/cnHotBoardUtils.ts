import type { MarketHotItem } from '../../types/schemas'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function bareCode(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const dot = trimmed.indexOf('.')
  return dot >= 0 ? trimmed.slice(0, dot) : trimmed
}

function numField(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function strField(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Map Hub cn_market_special / market_dynamics raw rows → UI hot items. */
export function mapCnHotBoardItems(raw: unknown): MarketHotItem[] {
  const rows = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  const out: MarketHotItem[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const code = bareCode(String(row.thscode ?? row.ticker ?? row.code ?? ''))
    if (!code) continue
    const name = strField(row, 'name', 'stock_name') || code
    const heatRaw = row.heat ?? row.hot_value ?? row.hot_score ?? row.score
    const heat = typeof heatRaw === 'number' && Number.isFinite(heatRaw)
      ? heatRaw
      : typeof heatRaw === 'string' && heatRaw.trim()
        ? Number(heatRaw.trim()) || null
        : null
    out.push({
      code,
      name,
      rank: numField(row, 'rank', 'hot_rank', 'order'),
      heat,
      rank_change: numField(row, 'rank_change', 'rankChange', 'rank_delta', 'change_rank'),
      price: numField(row, 'price'),
      change_pct: numField(row, 'change_pct', 'changePct', 'price_change_ratio_pct'),
      change_amt: numField(row, 'change_amt', 'changeAmt'),
    })
  }
  return out
}

export function formatHotRank(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return '—'
  return `#${Math.round(rank)}`
}

export function formatHotHeat(heat: number | null | undefined): string {
  if (heat == null || !Number.isFinite(heat)) return ''
  if (heat >= 10000) return `${(heat / 10000).toFixed(1)}万`
  return String(Math.round(heat))
}

export function hotBoardRowMeta(item: MarketHotItem): string {
  const parts: string[] = [item.code]
  if (item.rank != null) parts.push(`#${Math.round(item.rank)}`)
  const heatLabel = formatHotHeat(item.heat ?? null)
  if (heatLabel) parts.push(`热度 ${heatLabel}`)
  if (item.rank_change != null && item.rank_change !== 0) {
    parts.push(item.rank_change > 0 ? `升 ${item.rank_change}` : `降 ${Math.abs(item.rank_change)}`)
  }
  return parts.join(' · ')
}
