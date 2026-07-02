import assert from 'node:assert/strict'
import test from 'node:test'
import { selectRetainedArticles, normalizeNewsSettings } from '../packages/news-feed/dist/retention.js'

function article(id, pubDate) {
  return {
    id,
    subscription_id: 'sub-1',
    title: id,
    link: `https://example.com/${id}`,
    pub_date: pubDate,
    source_title: '源',
  }
}

test('normalizeNewsSettings defaults to 3 years and unlimited count', () => {
  const s = normalizeNewsSettings({ refresh_interval_min: 15 })
  assert.equal(s.retention_years, 3)
  assert.equal(s.max_articles, null)
  assert.equal(s.translation.service_mode, 'offline')
  assert.equal(s.translation.offline_model, '__auto__')
})

test('selectRetainedArticles drops articles older than retention years', () => {
  const now = new Date()
  const recent = new Date(now)
  recent.setMonth(recent.getMonth() - 1)
  const old = new Date(now)
  old.setFullYear(old.getFullYear() - 4)

  const kept = selectRetainedArticles([
    article('new', recent.toISOString()),
    article('old', old.toISOString()),
  ], normalizeNewsSettings({ refresh_interval_min: 15, retention_years: 3, max_articles: null }))

  assert.equal(kept.length, 1)
  assert.equal(kept[0].id, 'new')
})

test('selectRetainedArticles enforces max count by pub_date', () => {
  const kept = selectRetainedArticles([
    article('a', '2024-06-01T00:00:00.000Z'),
    article('b', '2024-05-01T00:00:00.000Z'),
    article('c', '2024-04-01T00:00:00.000Z'),
  ], normalizeNewsSettings({ refresh_interval_min: 15, retention_years: 0, max_articles: 2 }))

  assert.deepEqual(kept.map(a => a.id), ['a', 'b'])
})

test('retention_years 0 keeps all when no max', () => {
  const kept = selectRetainedArticles([
    article('a', '2010-01-01T00:00:00.000Z'),
    article('b', '2024-01-01T00:00:00.000Z'),
  ], normalizeNewsSettings({ refresh_interval_min: 15, retention_years: 0, max_articles: null }))
  assert.equal(kept.length, 2)
})
