/**
 * UI / Hub 共享缓存 TTL 与刷新决策。
 * Hub 磁盘层 TTL 须与此处常量一致；客户端轮询间隔见 POLL_INTERVAL_MS（TTL + buffer）。
 */

export const UI_CACHE_TTL_MS = {
  marketDynamicsCn: 22_000,
  watchlistQuotes: 60_000,
  portfolioSummary: 22_000,
  /** 默认 refresh_interval_min(15)；客户端应优先用 newsFeedTtlMs() */
  newsFeed: 15 * 60 * 1000,
  /** 市场动态页资讯侧栏 — 与 newsFeed 同 TTL */
  newsFeedInsights: 15 * 60 * 1000,
  /** 社区讨论代理缓存（服务端 2h） */
  communityFeed: 2 * 60 * 60 * 1000,
} as const

/** 客户端轮询间隔 — 略大于 TTL，避免边界重复请求 */
export const UI_POLL_INTERVAL_MS = {
  marketDynamicsCn: 30_000,
  watchlistQuotes: 65_000,
  portfolioSummary: 25_000,
  newsFeed: 16 * 60 * 1000,
  newsFeedInsights: 16 * 60 * 1000,
  communityFeed: 2 * 60 * 60 * 1000 + 5 * 60 * 1000,
} as const

/** 与 packages/news-feed normalizeNewsSettings 一致 */
export const NEWS_FEED_REFRESH_INTERVAL_MIN = {
  default: 15,
  min: 5,
  max: 120,
} as const

export function clampNewsRefreshIntervalMin(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw)
    ? raw
    : NEWS_FEED_REFRESH_INTERVAL_MIN.default
  const floored = Math.floor(n) || NEWS_FEED_REFRESH_INTERVAL_MIN.default
  return Math.max(
    NEWS_FEED_REFRESH_INTERVAL_MIN.min,
    Math.min(NEWS_FEED_REFRESH_INTERVAL_MIN.max, floored),
  )
}

export function newsFeedTtlMs(refreshIntervalMin?: number): number {
  return clampNewsRefreshIntervalMin(refreshIntervalMin) * 60_000
}

export function newsFeedPollIntervalMs(refreshIntervalMin?: number): number {
  return newsFeedTtlMs(refreshIntervalMin) + 60_000
}

export type RevalidateMode = 'skip' | 'soft' | 'hard'

export function isCacheFresh(
  cachedAtMs: number | null | undefined,
  ttlMs: number,
  now = Date.now(),
): boolean {
  if (cachedAtMs == null || !Number.isFinite(cachedAtMs) || cachedAtMs <= 0) return false
  return now - cachedAtMs < ttlMs
}

/**
 * - skip：TTL 内，不发请求
 * - soft：过期但有展示数据 → Hub SWR（返磁盘 + 可选后台刷新）
 * - hard：无展示数据或用户 force
 */
export function decideRevalidate(opts: {
  cachedAtMs: number | null | undefined
  ttlMs: number
  force?: boolean
  hasDisplayedData?: boolean
  now?: number
}): RevalidateMode {
  const now = opts.now ?? Date.now()
  if (opts.force) return 'hard'
  if (isCacheFresh(opts.cachedAtMs, opts.ttlMs, now)) return 'skip'
  return opts.hasDisplayedData ? 'soft' : 'hard'
}

export function parseIsoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

export function resolveFetchedAtMs(
  cachedAtMs: number | null | undefined,
  refreshedAtIso: string | null | undefined,
): number {
  const fromIso = parseIsoToMs(refreshedAtIso)
  const candidates = [cachedAtMs, fromIso].filter(
    (v): v is number => v != null && Number.isFinite(v) && v > 0,
  )
  return candidates.length ? Math.max(...candidates) : 0
}
