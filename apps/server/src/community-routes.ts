import type { FastifyInstance } from 'fastify'
import {
  isCommunityMetaTopic,
  isTopicVisibleInFeed,
  parseTopicTags,
  resolveTopicDisplayTitle,
} from './community-topic-utils.js'

const DEFAULT_COMMUNITY_BASE = 'https://opptrix.net'
const FETCH_TIMEOUT_MS = 8_000
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

export type CommunityCategoryFeedKind = 'research_strategy' | 'lounge'
export type CommunityFeedKind = 'latest' | 'hot' | CommunityCategoryFeedKind

const CATEGORY_FEED_SLUGS: Record<CommunityCategoryFeedKind, string> = {
  research_strategy: 'research-strategy',
  lounge: 'lounge',
}

export interface CommunityTopic {
  id: number
  title: string
  excerpt: string | null
  url: string
  categoryId: number | null
  categoryName: string | null
  categoryColor: string | null
  authorUsername: string | null
  postsCount: number
  replyCount: number
  likeCount: number
  views: number
  tags: string[]
  pinned: boolean
  lastPostedAt: string | null
  createdAt: string | null
}

export interface CommunityFeedPayload {
  success: boolean
  kind: CommunityFeedKind
  topics: CommunityTopic[]
  page: number
  perPage: number
  hasMore: boolean
  fetchedAt: string
  error?: string
}

type DiscourseUser = { id: number; username: string }
type DiscourseCategory = { id: number; name: string; slug: string; color?: string }
type DiscourseTopic = {
  id: number
  title: string
  slug: string
  excerpt?: string
  posts_count?: number
  reply_count?: number
  like_count?: number
  views?: number
  tags?: string[]
  pinned?: boolean
  last_posted_at?: string
  created_at?: string
  category_id?: number
  last_poster_username?: string
  posters?: { user_id: number; extras?: string }[]
  unicode_title?: string
}

function communityBaseUrl(): string {
  const raw = process.env.OPPTRIX_COMMUNITY_URL?.trim() || DEFAULT_COMMUNITY_BASE
  return raw.replace(/\/+$/, '')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function categorySlugForKind(kind: CommunityCategoryFeedKind): string {
  if (kind === 'research_strategy') {
    return process.env.OPPTRIX_COMMUNITY_STRATEGY_SLUG?.trim() || CATEGORY_FEED_SLUGS.research_strategy
  }
  return process.env.OPPTRIX_COMMUNITY_LOUNGE_SLUG?.trim() || CATEGORY_FEED_SLUGS.lounge
}

function isCategoryFeedKind(kind: CommunityFeedKind): kind is CommunityCategoryFeedKind {
  return kind === 'research_strategy' || kind === 'lounge'
}

function normalizeFeedKind(raw: string | undefined): CommunityFeedKind {
  const kind = raw?.trim().toLowerCase()
  if (kind === 'hot') return 'hot'
  if (kind === 'research_strategy' || kind === 'strategy') return 'research_strategy'
  if (kind === 'lounge' || kind === 'tea_lounge' || kind === 'chat') return 'lounge'
  return 'latest'
}

function feedPath(kind: CommunityFeedKind, page: number, category?: DiscourseCategory): string {
  const safePage = Number.isFinite(page) ? Math.max(0, Math.min(page, 10)) : 0
  if (kind === 'hot') {
    return `/top.json?period=weekly&page=${safePage}`
  }
  if (isCategoryFeedKind(kind) && category) {
    return `/c/${category.slug}/${category.id}/l/latest.json?page=${safePage}`
  }
  return `/latest.json?page=${safePage}`
}

function findCategoryBySlug(
  categories: Map<number, DiscourseCategory>,
  slug: string,
): DiscourseCategory | undefined {
  for (const category of categories.values()) {
    if (category.slug === slug) return category
  }
  return undefined
}

async function fetchDiscourseJson(path: string): Promise<unknown> {
  const base = communityBaseUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(`${base}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Opptrix-CommunityProxy/1.0',
      },
    })
    if (!resp.ok) {
      throw new Error(`community_upstream_${resp.status}`)
    }
    return await resp.json()
  } finally {
    clearTimeout(timer)
  }
}

function parseUsers(raw: unknown): Map<number, string> {
  const map = new Map<number, string>()
  if (!isRecord(raw) || !Array.isArray(raw.users)) return map
  for (const item of raw.users) {
    if (!isRecord(item)) continue
    const id = item.id
    const username = item.username
    if (typeof id === 'number' && typeof username === 'string' && username.trim()) {
      map.set(id, username.trim())
    }
  }
  return map
}

function parseCategories(raw: unknown): Map<number, DiscourseCategory> {
  const map = new Map<number, DiscourseCategory>()
  if (!isRecord(raw) || !isRecord(raw.category_list)) return map
  const categories = raw.category_list.categories
  if (!Array.isArray(categories)) return map
  for (const item of categories) {
    if (!isRecord(item)) continue
    const id = item.id
    const name = item.name
    if (typeof id === 'number' && typeof name === 'string' && name.trim()) {
      const slug = typeof item.slug === 'string' ? item.slug.trim() : ''
      map.set(id, {
        id,
        name: name.trim(),
        slug,
        color: typeof item.color === 'string' ? item.color : undefined,
      })
    }
  }
  return map
}

function resolveAuthorUsername(
  topic: DiscourseTopic,
  users: Map<number, string>,
): string | null {
  if (typeof topic.last_poster_username === 'string' && topic.last_poster_username.trim()) {
    return topic.last_poster_username.trim()
  }
  const poster = topic.posters?.find(p => p.extras?.includes('latest') || p.extras?.includes('single'))
    ?? topic.posters?.[0]
  if (poster && typeof poster.user_id === 'number') {
    return users.get(poster.user_id) ?? null
  }
  return null
}

function stripHtmlExcerpt(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

function parseTopics(
  raw: unknown,
  categories: Map<number, DiscourseCategory>,
): { topics: DiscourseTopic[]; users: Map<number, string> } {
  if (!isRecord(raw) || !isRecord(raw.topic_list)) {
    return { topics: [], users: new Map() }
  }
  const users = parseUsers(raw)
  const topicsRaw = raw.topic_list.topics
  if (!Array.isArray(topicsRaw)) {
    return { topics: [], users }
  }
  const topics: DiscourseTopic[] = []
  for (const item of topicsRaw) {
    if (!isRecord(item)) continue
    if (!isTopicVisibleInFeed(item)) continue
    const id = item.id
    const title = item.title
    const slug = item.slug
    if (typeof id !== 'number' || typeof title !== 'string' || typeof slug !== 'string') continue
    const displayTitle = resolveTopicDisplayTitle(
      title,
      typeof item.unicode_title === 'string' ? item.unicode_title : undefined,
    )
    if (isCommunityMetaTopic(displayTitle) || isCommunityMetaTopic(title)) continue
    topics.push({
      id,
      title: displayTitle,
      slug,
      excerpt: typeof item.excerpt === 'string' ? item.excerpt : undefined,
      posts_count: typeof item.posts_count === 'number' ? item.posts_count : undefined,
      reply_count: typeof item.reply_count === 'number' ? item.reply_count : undefined,
      like_count: typeof item.like_count === 'number' ? item.like_count : undefined,
      views: typeof item.views === 'number' ? item.views : undefined,
      tags: parseTopicTags(item.tags),
      pinned: item.pinned === true,
      last_posted_at: typeof item.last_posted_at === 'string' ? item.last_posted_at : undefined,
      created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
      category_id: typeof item.category_id === 'number' ? item.category_id : undefined,
      last_poster_username: typeof item.last_poster_username === 'string'
        ? item.last_poster_username
        : undefined,
      posters: Array.isArray(item.posters)
        ? item.posters.filter(isRecord).map(p => ({
          user_id: typeof p.user_id === 'number' ? p.user_id : -1,
          extras: typeof p.extras === 'string' ? p.extras : undefined,
        }))
        : undefined,
    })
  }
  void categories
  return { topics, users }
}

function parseFeedPagination(raw: unknown, requestPage: number): {
  page: number
  perPage: number
  hasMore: boolean
} {
  if (!isRecord(raw) || !isRecord(raw.topic_list)) {
    return { page: requestPage, perPage: 30, hasMore: false }
  }
  const topicList = raw.topic_list
  const perPage = typeof topicList.per_page === 'number' && topicList.per_page > 0
    ? topicList.per_page
    : 30
  const page = typeof topicList.page === 'number' && topicList.page >= 0
    ? topicList.page
    : requestPage
  const hasMore = typeof topicList.more_topics_url === 'string'
    && topicList.more_topics_url.trim().length > 0
  return { page, perPage, hasMore }
}

function mapTopic(
  topic: DiscourseTopic,
  users: Map<number, string>,
  categories: Map<number, DiscourseCategory>,
  base: string,
): CommunityTopic {
  const category = topic.category_id != null ? categories.get(topic.category_id) : undefined
  const slug = topic.slug.trim() || 'topic'
  return {
    id: topic.id,
    title: topic.title.trim(),
    excerpt: stripHtmlExcerpt(topic.excerpt),
    url: `${base}/t/${slug}/${topic.id}`,
    categoryId: topic.category_id ?? null,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
    authorUsername: resolveAuthorUsername(topic, users),
    postsCount: topic.posts_count ?? 0,
    replyCount: topic.reply_count ?? 0,
    likeCount: topic.like_count ?? 0,
    views: topic.views ?? 0,
    tags: topic.tags ?? [],
    pinned: topic.pinned === true,
    lastPostedAt: topic.last_posted_at ?? null,
    createdAt: topic.created_at ?? null,
  }
}

let categoriesCache: { map: Map<number, DiscourseCategory>; expires: number } | null = null

async function loadCategories(): Promise<Map<number, DiscourseCategory>> {
  const now = Date.now()
  if (categoriesCache && categoriesCache.expires > now) {
    return categoriesCache.map
  }
  try {
    const raw = await fetchDiscourseJson('/categories.json')
    const map = parseCategories(raw)
    categoriesCache = { map, expires: now + CACHE_TTL_MS }
    return map
  } catch {
    return categoriesCache?.map ?? new Map()
  }
}

const feedCache = new Map<string, { payload: CommunityFeedPayload; expires: number }>()

function cacheKey(kind: CommunityFeedKind, page: number): string {
  return `${kind}:${page}`
}

export async function fetchCommunityFeed(
  kind: CommunityFeedKind,
  page = 0,
): Promise<CommunityFeedPayload> {
  const safeKind = normalizeFeedKind(kind)
  const safePage = Number.isFinite(page) ? Math.max(0, Math.min(page, 10)) : 0
  const key = cacheKey(safeKind, safePage)
  const now = Date.now()
  const cached = feedCache.get(key)
  if (cached && cached.expires > now) {
    return cached.payload
  }

  const base = communityBaseUrl()
  try {
    const categories = await loadCategories()
    if (isCategoryFeedKind(safeKind)) {
      const category = findCategoryBySlug(categories, categorySlugForKind(safeKind))
      if (!category?.slug) {
        return {
          success: false,
          kind: safeKind,
          topics: [],
          page: safePage,
          perPage: 30,
          hasMore: false,
          fetchedAt: new Date().toISOString(),
          error: 'community_category_missing',
        }
      }
      const raw = await fetchDiscourseJson(feedPath(safeKind, safePage, category))
      const { topics, users } = parseTopics(raw, categories)
      const mapped = topics.map(t => mapTopic(t, users, categories, base))
      const pagination = parseFeedPagination(raw, safePage)
      const payload: CommunityFeedPayload = {
        success: true,
        kind: safeKind,
        topics: mapped,
        page: pagination.page,
        perPage: pagination.perPage,
        hasMore: pagination.hasMore,
        fetchedAt: new Date().toISOString(),
      }
      feedCache.set(key, { payload, expires: now + CACHE_TTL_MS })
      return payload
    }

    const raw = await fetchDiscourseJson(feedPath(safeKind, safePage))
    const { topics, users } = parseTopics(raw, categories)
    const mapped = topics.map(t => mapTopic(t, users, categories, base))
    const pagination = parseFeedPagination(raw, safePage)
    const payload: CommunityFeedPayload = {
      success: true,
      kind: safeKind,
      topics: mapped,
      page: pagination.page,
      perPage: pagination.perPage,
      hasMore: pagination.hasMore,
      fetchedAt: new Date().toISOString(),
    }
    feedCache.set(key, { payload, expires: now + CACHE_TTL_MS })
    return payload
  } catch {
    if (cached) return cached.payload
    return {
      success: false,
      kind: safeKind,
      topics: [],
      page: safePage,
      perPage: 30,
      hasMore: false,
      fetchedAt: new Date().toISOString(),
      error: 'community_fetch_failed',
    }
  }
}

export function registerCommunityRoutes(app: FastifyInstance): void {
  app.get<{
    Querystring: { kind?: string; page?: string }
  }>('/api/community/feed', async (req, reply) => {
    const kind = normalizeFeedKind(req.query.kind)
    const pageRaw = Number.parseInt(req.query.page ?? '0', 10)
    const page = Number.isFinite(pageRaw) ? pageRaw : 0

    const payload = await fetchCommunityFeed(kind, page)
    if (!payload.success) {
      return reply.code(503).send(payload)
    }
    return payload
  })
}
