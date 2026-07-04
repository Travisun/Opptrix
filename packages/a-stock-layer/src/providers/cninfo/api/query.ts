import { isBseCode, normalizeCode, resolveMarket } from '../../../utils/helpers.js'

export type CninfoAnnouncementTab = 'fulltext' | 'relation' | 'industry'

/** Maps engine newsType tokens → cninfo category filter (disclosure site taxonomy). */
const NEWS_TYPE_CATEGORY: Record<string, string> = {
  all: '',
  annual: 'category_ndbg_szsh;',
  semi: 'category_bndbg_szsh;',
  quarter: 'category_jdbg_szsh;',
  q1: 'category_yjdbg_szsh;',
  q3: 'category_sjdbg_szsh;',
  temp: 'category_yjpl_szsh;',
}

export interface CninfoAnnouncementQuery {
  code: string
  orgId: string
  page?: number
  pageSize?: number
  tab?: CninfoAnnouncementTab
  category?: string
  seDate?: string
  searchkey?: string
}

export function resolveCninfoPlate(code: string): string {
  const c = normalizeCode(code)
  if (isBseCode(c)) return 'bj'
  return resolveMarket(c) === 'SH' ? 'sse' : 'szse'
}

export function parseNewsTypeFilter(newsType = 'all'): {
  tab: CninfoAnnouncementTab
  category: string
  seDate: string
  searchkey: string
} {
  const raw = String(newsType ?? 'all').trim()
  if (!raw || raw === 'all') {
    return { tab: 'fulltext', category: '', seDate: '', searchkey: '' }
  }

  let tab: CninfoAnnouncementTab = 'fulltext'
  let category = ''
  let seDate = ''
  let searchkey = ''
  const parts = raw.split('|').map(p => p.trim()).filter(Boolean)

  for (const part of parts) {
    if (part.startsWith('tab:')) {
      const t = part.slice(4) as CninfoAnnouncementTab
      if (t === 'fulltext' || t === 'relation' || t === 'industry') tab = t
      continue
    }
    if (part.startsWith('range:')) {
      seDate = part.slice(6)
      continue
    }
    if (part.startsWith('search:')) {
      searchkey = part.slice(7)
      continue
    }
    if (part.startsWith('category:')) {
      category = part.slice(9)
      continue
    }
    if (NEWS_TYPE_CATEGORY[part] != null) {
      category = NEWS_TYPE_CATEGORY[part]
      continue
    }
    category = NEWS_TYPE_CATEGORY[part] ?? category
  }

  if (!parts.length && NEWS_TYPE_CATEGORY[raw]) {
    category = NEWS_TYPE_CATEGORY[raw]
  }

  return { tab, category, seDate, searchkey }
}

export function buildAnnouncementPayload(query: CninfoAnnouncementQuery): Record<string, string> {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 30)
  const plate = resolveCninfoPlate(query.code)
  return {
    pageNum: String(page),
    pageSize: String(pageSize),
    column: plate,
    plate,
    tabName: query.tab ?? 'fulltext',
    tabid: query.tab ?? 'fulltext',
    stock: `${normalizeCode(query.code)},${query.orgId}`,
    searchkey: query.searchkey ?? '',
    secid: '',
    category: query.category ?? '',
    trade: '',
    seDate: query.seDate ?? '',
    isHLtitle: 'true',
  }
}

export function cninfoPdfUrl(adjunctUrl: unknown): string | undefined {
  const path = String(adjunctUrl ?? '').trim()
  if (!path) return undefined
  if (path.startsWith('http')) return path
  return `https://static.cninfo.com.cn/${path.replace(/^\//, '')}`
}
