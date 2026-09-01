import assert from 'node:assert/strict'
import { test } from 'node:test'

test('decideRevalidate skips within TTL', async () => {
  const { decideRevalidate, isCacheFresh, UI_CACHE_TTL_MS } = await import('../packages/shared/dist/ui-cache-policy.js')
  const now = 1_000_000
  assert.equal(
    decideRevalidate({
      cachedAtMs: now - 10_000,
      ttlMs: UI_CACHE_TTL_MS.watchlistQuotes,
      hasDisplayedData: true,
      now,
    }),
    'skip',
  )
  assert.equal(isCacheFresh(now - 10_000, UI_CACHE_TTL_MS.watchlistQuotes, now), true)
})

test('decideRevalidate soft refresh when stale with displayed data', async () => {
  const { decideRevalidate, UI_CACHE_TTL_MS } = await import('../packages/shared/dist/ui-cache-policy.js')
  const now = 1_000_000
  assert.equal(
    decideRevalidate({
      cachedAtMs: now - UI_CACHE_TTL_MS.portfolioSummary - 1,
      ttlMs: UI_CACHE_TTL_MS.portfolioSummary,
      hasDisplayedData: true,
      now,
    }),
    'soft',
  )
})

test('decideRevalidate hard when no displayed data', async () => {
  const { decideRevalidate, UI_CACHE_TTL_MS } = await import('../packages/shared/dist/ui-cache-policy.js')
  assert.equal(
    decideRevalidate({
      cachedAtMs: 0,
      ttlMs: UI_CACHE_TTL_MS.marketDynamicsCn,
      hasDisplayedData: false,
    }),
    'hard',
  )
})

test('decideRevalidate force always hard', async () => {
  const { decideRevalidate, UI_CACHE_TTL_MS } = await import('../packages/shared/dist/ui-cache-policy.js')
  const now = Date.now()
  assert.equal(
    decideRevalidate({
      cachedAtMs: now,
      ttlMs: UI_CACHE_TTL_MS.watchlistQuotes,
      force: true,
      hasDisplayedData: true,
      now,
    }),
    'hard',
  )
})

test('poll interval exceeds TTL for all resources', async () => {
  const { UI_CACHE_TTL_MS, UI_POLL_INTERVAL_MS } = await import('../packages/shared/dist/ui-cache-policy.js')
  for (const key of Object.keys(UI_CACHE_TTL_MS)) {
    assert.ok(
      UI_POLL_INTERVAL_MS[key] > UI_CACHE_TTL_MS[key],
      `${key}: poll must be greater than TTL`,
    )
  }
})

test('news feed TTL follows user refresh_interval_min', async () => {
  const {
    clampNewsRefreshIntervalMin,
    newsFeedPollIntervalMs,
    newsFeedTtlMs,
    NEWS_FEED_REFRESH_INTERVAL_MIN,
  } = await import('../packages/shared/dist/ui-cache-policy.js')

  assert.equal(clampNewsRefreshIntervalMin(undefined), NEWS_FEED_REFRESH_INTERVAL_MIN.default)
  assert.equal(clampNewsRefreshIntervalMin(3), NEWS_FEED_REFRESH_INTERVAL_MIN.min)
  assert.equal(clampNewsRefreshIntervalMin(999), NEWS_FEED_REFRESH_INTERVAL_MIN.max)

  const ttl30 = newsFeedTtlMs(30)
  assert.equal(ttl30, 30 * 60_000)
  assert.ok(newsFeedPollIntervalMs(30) > ttl30)
})
