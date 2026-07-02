export type FeedSourceKind = 'rss' | 'atom' | 'rsshub'

export interface FeedGroup {
  id: string
  title: string
  sort_order: number
  created_at: string
}

export interface FeedSubscription {
  id: string
  title: string
  url: string
  resolved_url: string
  kind: FeedSourceKind
  enabled: boolean
  /** 自定义分组；空为未分组 */
  group_id?: string | null
  created_at: string
  last_fetched_at?: string
  last_error?: string
}

export interface FeedArticle {
  id: string
  subscription_id: string
  /** RSS guid / atom id / link used for source-level dedupe */
  guid?: string
  title: string
  link: string
  pub_date: string
  summary?: string
  content_html?: string
  source_title: string
}

export type TranslationServiceMode = 'offline' | 'remote'

export interface NewsTranslationSettings {
  /** 离线优先：本地模型可用时用本地，否则回退远程 */
  service_mode: TranslationServiceMode
  /** `__auto__` = 自动匹配 HY-MT；或指定已安装 GGUF 文件名 */
  offline_model: string
  remote_provider_id: string | null
  remote_model: string | null
}

export interface NewsSettings {
  refresh_interval_min: number
  /** 保留文章的最长年数；0 = 不按时间裁剪 */
  retention_years: number
  /** 全局文章数量上限；null = 不限制数量 */
  max_articles: number | null
  translation: NewsTranslationSettings
}

export interface SubscriptionFetchMeta {
  etag?: string
  last_modified?: string
  last_fetched_at?: string
  last_error?: string
}

export interface NewsFeedIndex {
  refreshed_at: string | null
  subscription_meta: Record<string, SubscriptionFetchMeta>
  /** 文章 id，按 pub_date 降序 */
  article_order: string[]
  /** 已合并同订阅下 Twitter 状态重复文章（旧 guid/link 哈希 id） */
  twitter_dedupe_v1?: boolean
}

export interface FeedPageQuery {
  limit?: number
  cursor?: string | null
  subscription_id?: string | null
  group_id?: string | null
  /** 按本地日历日筛选，格式 YYYY-MM-DD */
  date?: string | null
}

export interface FeedPageResult {
  articles: FeedArticle[]
  next_cursor: string | null
  has_more: boolean
  total: number
}

export interface ValidateFeedResult {
  ok: boolean
  title: string
  item_count: number
  kind: FeedSourceKind
  resolved_url: string
  error?: string
}

export const DEFAULT_TRANSLATION_SETTINGS: NewsTranslationSettings = {
  service_mode: 'offline',
  offline_model: '__auto__',
  remote_provider_id: null,
  remote_model: null,
}

export const DEFAULT_NEWS_SETTINGS: NewsSettings = {
  refresh_interval_min: 15,
  retention_years: 3,
  max_articles: null,
  translation: DEFAULT_TRANSLATION_SETTINGS,
}

export const FEED_PAGE_SIZE = 20
export const FEED_PRELOAD_THRESHOLD = 3
