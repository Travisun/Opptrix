import type { NewsItem } from '../../../../core/schema.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { getCninfoClient } from '../../api/client.js'
import { buildAnnouncementPayload, parseNewsTypeFilter } from '../../api/query.js'
import { mapCninfoAnnouncement } from '../../normalize/announcements.js'
import { resolveCninfoOrgId } from '../../api/symbols.js'

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, '').trim()
}

function formatAnnouncementTime(raw: unknown): string {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString().slice(0, 10)
  }
  const text = String(raw).trim()
  if (/^\d{13}$/.test(text)) {
    return new Date(Number(text)).toISOString().slice(0, 10)
  }
  return text.slice(0, 10)
}

function disclosureDetailUrl(
  orgId: string,
  announcementId: string,
  announcementTime: string,
): string {
  const qs = new URLSearchParams({
    orgId,
    announcementId,
    announcementTime,
  })
  return `https://www.cninfo.com.cn/new/disclosure/detail?${qs}`
}

export class CninfoMarketHandler extends MarketHandlerShell {

  async news(code: string, page = 1, pageSize = 10, newsType = 'all') {
    try {
      const c = this.normCode(code)
      const orgId = await resolveCninfoOrgId(c)
      if (!orgId) return null

      const filter = parseNewsTypeFilter(newsType)
      const result = await getCninfoClient().queryAnnouncements(
        buildAnnouncementPayload({
          code: c,
          orgId,
          page,
          pageSize,
          tab: filter.tab,
          category: filter.category,
          seDate: filter.seDate,
          searchkey: filter.searchkey,
        }),
      )

      const announcements = (result.announcements ?? []) as Record<string, unknown>[]
      if (!announcements.length) return null

      return announcements.map(item => mapCninfoAnnouncement(
        item,
        c,
        orgId,
        formatAnnouncementTime,
        stripHtml,
        disclosureDetailUrl,
      )) satisfies NewsItem[]
    } catch {
      return null
    }
  }

}
