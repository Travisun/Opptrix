import { Capability } from '../../../../core/capabilities.js'
import type { NewsItem } from '../../../../core/schema.js'
import { httpGetText, httpPostForm } from '../../../../utils/http.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'

const HEADERS = {
  Referer: 'https://www.cninfo.com.cn/new/commonUrl?url=disclosure/list/notice',
  Accept: 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
}

export class CninfoMarketHandler extends MarketHandlerShell {

  private stripHtml(s: string) {
    return s.replace(/<[^>]+>/g, '').trim()
  }

  private async searchOrgId(code: string): Promise<string | null> {
    try {
      const c = this.normCode(code)
      const url = `https://www.cninfo.com.cn/new/information/topInfo/topInfoStock?stockCode=${c}`
      const text = await httpGetText(url, HEADERS, 8000)
      const data = JSON.parse(text) as Record<string, unknown> | unknown[]
      const items = Array.isArray(data)
        ? data
        : (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).stockList
      if (Array.isArray(items) && items.length) {
        return String((items[0] as Record<string, unknown>).orgId ?? '') || null
      }
    } catch { /* ignore */ }
    return null
  }

  async news(code: string, page = 1, pageSize = 10, _newsType = 'all') {
    try {
      const c = this.normCode(code)
      const orgId = await this.searchOrgId(c)
      const payload: Record<string, string> = {
        pageNum: String(page),
        pageSize: String(pageSize),
        tabid: 'fulltext',
        seDate: '',
        searchkey: '',
        isHLtitle: 'true',
        stock: orgId ? `${c},${orgId}` : c,
      }
      const result = await httpPostForm(
        'https://www.cninfo.com.cn/new/hisAnnouncement/query',
        payload,
        HEADERS,
        10000,
      )
      const announcements = (result.announcements ?? []) as Record<string, unknown>[]
      if (!announcements.length) return null

      return announcements.map(item => ({
        code: c,
        date: String(item.announcementDate ?? '').slice(0, 10),
        title: this.stripHtml(String(item.announcementTitle ?? item.title ?? '')),
        url: `https://www.cninfo.com.cn/new/disclosure/detail?orgId=${orgId ?? ''}&announcementId=${item.announcementId ?? ''}&announcementTime=${item.announcementDate ?? ''}`,
        source: '巨潮资讯网',
        type: 'announcement',
      })) satisfies NewsItem[]
    } catch {
      return null
    }
  }

}
