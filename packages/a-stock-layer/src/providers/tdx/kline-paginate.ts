import type { IndexKline, StockKline } from '../../core/schema.js'

const TDX_KLINE_PAGE = 800

/** Paginate TDX kline requests when count > 800 (Engine previously inlined this). */
export async function fetchTdxKlinePaginated<T extends StockKline | IndexKline>(
  count: number,
  startOffset: number,
  fetchPage: (pageSize: number, offset: number) => Promise<T[] | null>,
): Promise<T[] | null> {
  const want = Math.max(1, count)
  if (want <= TDX_KLINE_PAGE) {
    return fetchPage(want, startOffset)
  }

  const chunks: T[] = []
  let remaining = want
  let offset = startOffset
  while (remaining > 0) {
    const n = Math.min(TDX_KLINE_PAGE, remaining)
    const part = await fetchPage(n, offset)
    if (!part?.length) break
    chunks.unshift(...part)
    remaining -= part.length
    offset += part.length
    if (part.length < n) break
  }
  if (!chunks.length) return null
  chunks.sort((a, b) => a.date.localeCompare(b.date))
  return chunks.slice(-want)
}
