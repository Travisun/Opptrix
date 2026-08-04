/** Reciprocal Rank Fusion — 融合多路检索排名 */

export interface RankedId {
  chunk_id: string
}

/**
 * RRF: score(d) = Σ 1/(k + rank_i(d))，rank 从 1 起。
 * @returns 按融合分降序的 chunk_id 列表（截断至 limit）
 */
export function rrfFuse(lists: RankedId[][], opts: { k?: number; limit?: number } = {}): string[] {
  const k = opts.k ?? 60
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)
  const scores = new Map<string, number>()

  for (const list of lists) {
    list.forEach((item, idx) => {
      const id = item.chunk_id
      if (!id) return
      const rank = idx + 1
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank))
    })
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}
