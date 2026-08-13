import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyArticlesMemoryCap,
  NEWS_ARTICLES_MEMORY_CAP,
} from '../client-ui/src/pages/news/articlesMemoryCap.ts'

test('NEWS_ARTICLES_MEMORY_CAP is within 500–1000', () => {
  assert.ok(NEWS_ARTICLES_MEMORY_CAP >= 500)
  assert.ok(NEWS_ARTICLES_MEMORY_CAP <= 1000)
})

test('applyArticlesMemoryCap keeps list under cap and drops oldest (tail)', () => {
  const input = Array.from({ length: 12 }, (_, i) => ({ id: String(i) }))
  const { articles, capped } = applyArticlesMemoryCap(input, 10)
  assert.equal(capped, true)
  assert.equal(articles.length, 10)
  assert.deepEqual(articles.map(a => a.id), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
})

test('applyArticlesMemoryCap is a no-op under cap', () => {
  const input = [{ id: 'a' }, { id: 'b' }]
  const { articles, capped } = applyArticlesMemoryCap(input, 10)
  assert.equal(capped, false)
  assert.equal(articles.length, 2)
})

test('applyArticlesMemoryCap rejects non-positive cap without truncating', () => {
  const input = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const { articles, capped } = applyArticlesMemoryCap(input, 0)
  assert.equal(capped, false)
  assert.equal(articles.length, 3)
})

test('repeated append simulation never exceeds hard cap', () => {
  let articles = []
  let listCapReached = false
  const pageSize = 20
  const serverTotal = 5000

  for (let offset = 0; offset < serverTotal && !listCapReached; offset += pageSize) {
    const page = Array.from({ length: pageSize }, (_, i) => ({ id: `a-${offset + i}` }))
    const merged = [...articles, ...page]
    const result = applyArticlesMemoryCap(merged, NEWS_ARTICLES_MEMORY_CAP)
    articles = result.articles
    const serverHasMore = offset + pageSize < serverTotal
    listCapReached = result.capped || (articles.length >= NEWS_ARTICLES_MEMORY_CAP && serverHasMore)
  }

  assert.equal(articles.length, NEWS_ARTICLES_MEMORY_CAP)
  assert.equal(listCapReached, true)
})
