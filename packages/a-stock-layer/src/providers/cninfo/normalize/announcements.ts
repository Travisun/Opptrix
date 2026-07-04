import type { NewsItem } from '../../../core/schema.js'
import { cninfoPdfUrl } from '../api/query.js'

export function mapCninfoAnnouncement(
  item: Record<string, unknown>,
  code: string,
  orgId: string,
  formatTime: (raw: unknown) => string,
  stripHtml: (raw: string) => string,
  detailUrl: (orgId: string, id: string, time: string) => string,
): NewsItem {
  const announcementId = String(item.announcementId ?? '')
  const announcementTime = formatTime(item.announcementTime ?? item.announcementDate)
  const pdfUrl = cninfoPdfUrl(item.adjunctUrl)
  return {
    code,
    date: announcementTime,
    title: stripHtml(String(item.announcementTitle ?? item.title ?? '')),
    url: announcementId
      ? detailUrl(orgId, announcementId, announcementTime)
      : `https://www.cninfo.com.cn/new/disclosure/stock?stockCode=${code}`,
    pdfUrl,
    source: '巨潮资讯网',
    type: String(item.announcementTypeName ?? 'announcement'),
    category: String(item.announcementType ?? ''),
  }
}
