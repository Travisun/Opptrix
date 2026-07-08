export interface AnnouncementContent {
  url: string
  title?: string
  contentType: 'pdf' | 'html'
  pdfUrl?: string
  text: string
  charCount: number
  truncated: boolean
  source: string
}

export type AnnouncementFetchPlan =
  | { kind: 'sina_bulletin'; code: string; bulletinId: string; url: string }
  | { kind: 'sina_memord'; code: string; noticeId: string; url: string }
  | { kind: 'tencent_notice'; code: string; noticeId: string; url: string }
  | { kind: 'pdf'; pdfUrl: string; url: string }
  | { kind: 'html'; pageUrl: string; url: string }
