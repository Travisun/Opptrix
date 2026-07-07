import type { NewsItem } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'
import { buildSinaNoticeDetailUrl } from '../api/content.js'
import type { SinaNoticeRow, SinaStockNewsRow } from '../api/types.js'

export type SinaNewsChannel = 'news' | 'notice'

/** `newsType` → 新浪频道 */
export function resolveSinaNewsChannel(newsType = 'all'): SinaNewsChannel {
  const t = String(newsType ?? '').trim().toLowerCase()
  if (t === 'notice' || t === 'announcement' || t === '公告') return 'notice'
  return 'news'
}

export function mapSinaStockNewsRows(
  code: string,
  rows: SinaStockNewsRow[],
): NewsItem[] {
  const bare = normalizeCode(code)
  const out: NewsItem[] = []
  for (const row of rows) {
    const title = String(row.title ?? '').trim()
    if (!title) continue
    const date = String(row.ctime_str ?? '').slice(0, 10)
      || (row.ctime ? new Date(row.ctime * 1000).toISOString().slice(0, 10) : '')
    out.push({
      code: bare,
      title,
      date,
      url: String(row.url ?? '').trim() || undefined,
      source: '新浪财经',
      type: '新闻',
    })
  }
  return out
}

export function mapSinaNoticeRows(
  code: string,
  rows: SinaNoticeRow[],
): NewsItem[] {
  const bare = normalizeCode(code)
  const out: NewsItem[] = []
  for (const row of rows) {
    const id = String(row.id ?? '').trim()
    const title = String(row.title ?? '').trim()
    if (!id || !title) continue
    out.push({
      code: bare,
      title,
      date: String(row.date ?? '').slice(0, 10),
      url: buildSinaNoticeDetailUrl(bare, id),
      source: '新浪财经',
      type: '公告',
    })
  }
  return out
}
