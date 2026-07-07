import { secFullCode } from '../../../utils/helpers.js'
import { fetchJson } from './http.js'
import type {
  SinaNoticeEnvelope,
  SinaStockNewsEnvelope,
} from './types.js'
import { buildSinaStockReferer } from './types.js'

const STOCK_NEWS_URL = 'https://stocknews.cj.sina.cn/stocknews/api/news/get4pc'
const NOTICE_LIST_URL =
  'https://quotes.sina.com.cn/cn/api/openapi.php/CB_AllService.getMemordlistbysymbol'
const NOTICE_DETAIL_BASE =
  'https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllMemordDetail.php'

/** 公告详情页 URL */
export function buildSinaNoticeDetailUrl(stockId: string, noticeId: string): string {
  const code = String(stockId ?? '').replace(/^(sh|sz|bj)/i, '')
  return `${NOTICE_DETAIL_BASE}?stockid=${encodeURIComponent(code)}#_${encodeURIComponent(noticeId)}`
}

/** 个股资讯列表（PC 侧栏） */
export async function fetchSinaStockNews(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<SinaStockNewsEnvelope> {
  const symbol = secFullCode(opts.code)
  const params = new URLSearchParams({
    fr: 'pc',
    market: 'cn',
    symbol,
    page: String(Math.max(1, opts.page ?? 1)),
    num: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
  return fetchJson<SinaStockNewsEnvelope>(
    `${STOCK_NEWS_URL}?${params}`,
    buildSinaStockReferer(symbol),
  )
}

/** 公司公告列表 */
export async function fetchSinaNoticeList(opts: {
  code: string
  pageSize?: number
}): Promise<SinaNoticeEnvelope> {
  const paper = String(opts.code ?? '').replace(/^(sh|sz|bj)/i, '')
  const params = new URLSearchParams({
    PaperCode: paper,
    num: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
  return fetchJson<SinaNoticeEnvelope>(
    `${NOTICE_LIST_URL}?${params}`,
    buildSinaStockReferer(secFullCode(opts.code)),
  )
}
