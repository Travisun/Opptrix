import { httpGetText, httpPostForm } from '../../../utils/http.js'
import { cninfoThrottle } from './rate-limit.js'

const CNINFO_ORIGIN = 'https://www.cninfo.com.cn'

/** Same Referer / XHR shape as the disclosure list page — User-Agent stays the shared default. */
const BROWSE_HEADERS = {
  Referer: `${CNINFO_ORIGIN}/new/commonUrl?url=disclosure/list/notice`,
  Accept: 'application/json, text/plain, */*',
  'X-Requested-With': 'XMLHttpRequest',
}

export class CninfoBrowseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CninfoBrowseError'
  }
}

export class CninfoClient {
  async getJson(
    path: string,
    params: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    return cninfoThrottle(async () => {
      const qs = new URLSearchParams(params)
      const suffix = qs.toString() ? `?${qs}` : ''
      const url = `${CNINFO_ORIGIN}${path.startsWith('/') ? path : `/${path}`}${suffix}`
      let text: string
      try {
        text = await httpGetText(url, BROWSE_HEADERS, 15000)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new CninfoBrowseError(
          msg.includes('HTTP')
            ? `暂时无法访问巨潮资讯（${msg}），请稍后在浏览器打开查看`
            : msg,
        )
      }
      try {
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        throw new CninfoBrowseError('巨潮返回异常内容，请稍后在浏览器打开巨潮资讯查看')
      }
    })
  }

  async postForm(path: string, data: Record<string, string>): Promise<Record<string, unknown>> {
    return cninfoThrottle(async () => {
      const url = `${CNINFO_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
      try {
        return await httpPostForm(url, data, BROWSE_HEADERS, 15000)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new CninfoBrowseError(
          msg.includes('HTTP')
            ? `暂时无法访问巨潮资讯（${msg}），请稍后在浏览器打开查看`
            : msg,
        )
      }
    })
  }

  queryAnnouncements(payload: Record<string, string>) {
    return this.postForm('/new/hisAnnouncement/query', payload)
  }

  /** Public code→orgId table served by the disclosure site (same as in-browser lookup). */
  fetchStockIndex() {
    return this.getJson('/new/data/szse_stock.json')
  }
}

let sharedClient: CninfoClient | null = null

export function getCninfoClient(): CninfoClient {
  if (!sharedClient) sharedClient = new CninfoClient()
  return sharedClient
}

export async function testCninfoConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await getCninfoClient().queryAnnouncements({
      pageNum: '1',
      pageSize: '1',
      tabid: 'fulltext',
      seDate: '',
      searchkey: '',
      isHLtitle: 'true',
      stock: '002851,9900023251',
    })
    const total = Number(data.totalAnnouncement ?? 0)
    if (total > 0) {
      return { ok: true, message: `巨潮资讯可访问 · 示例标的共 ${total} 条公告` }
    }
    return { ok: false, message: '巨潮返回空列表，请稍后再试或在浏览器打开巨潮资讯' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
