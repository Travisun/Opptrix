import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WATCHLIST_NEW_ITEM_QUOTE_GRACE_MS,
  isWatchlistItemWithinQuoteGrace,
  shouldSuppressWatchlistQuoteFailure,
  watchlistItemAddedAtMs,
} from '../client-ui/src/market/watchlistQuoteGrace.ts'

test('watchlistItemAddedAtMs parses ISO addedAt', () => {
  const t = '2026-08-26T04:55:00.000Z'
  assert.equal(watchlistItemAddedAtMs({ addedAt: t }), Date.parse(t))
  assert.equal(watchlistItemAddedAtMs({ addedAt: '' }), null)
  assert.equal(watchlistItemAddedAtMs({}), null)
})

test('isWatchlistItemWithinQuoteGrace respects window', () => {
  const now = Date.parse('2026-08-26T05:00:00.000Z')
  const item = { addedAt: '2026-08-26T04:59:50.000Z' }
  assert.equal(isWatchlistItemWithinQuoteGrace(item, now), true)
  const expired = { addedAt: '2026-08-26T04:44:00.000Z' }
  assert.equal(isWatchlistItemWithinQuoteGrace(expired, now), false)
  assert.equal(WATCHLIST_NEW_ITEM_QUOTE_GRACE_MS, 15_000)
})

test('shouldSuppressWatchlistQuoteFailure during grace or loading', () => {
  const item = { addedAt: new Date().toISOString() }
  assert.equal(shouldSuppressWatchlistQuoteFailure(item, { hasPrice: false }), true)
  assert.equal(shouldSuppressWatchlistQuoteFailure(item, { loadingQuotes: true, hasPrice: false }), true)
  assert.equal(shouldSuppressWatchlistQuoteFailure(item, { hasPrice: true }), false)
  const old = { addedAt: '2020-01-01T00:00:00.000Z' }
  assert.equal(shouldSuppressWatchlistQuoteFailure(old, { hasPrice: false }), false)
})
