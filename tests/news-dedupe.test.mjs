import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dedupeArticlesByTitle,
  normalizeArticleTitle,
} from '../packages/news-feed/dist/dedupe.js'

const article = (id, title, subscription_id = 'sub-a') => ({
  id,
  subscription_id,
  title,
  link: `https://example.com/${id}`,
  pub_date: '2024-06-01T08:00:00.000Z',
  source_title: '源',
})

test('normalizeArticleTitle trims and collapses whitespace', () => {
  assert.equal(normalizeArticleTitle('  标题  A  '), '标题 a')
})

test('dedupeArticlesByTitle keeps first per normalized title', () => {
  const input = [
    article('1', '某公司发布年报', 'sub-a'),
    article('2', '另一则新闻', 'sub-b'),
    article('3', '  某公司发布年报  ', 'sub-c'),
    article('4', '另一则新闻', 'sub-d'),
  ]
  const out = dedupeArticlesByTitle(input)
  assert.deepEqual(out.map(a => a.id), ['1', '2'])
})

test('dedupeArticlesByTitle strips leading bracket tags', () => {
  const input = [
    article('1', '【财经】某公司发布年报', 'sub-a'),
    article('2', '某公司发布年报', 'sub-b'),
  ]
  const out = dedupeArticlesByTitle(input)
  assert.equal(out.length, 1)
  assert.equal(out[0].id, '1')
})

test('dedupeArticlesByTitle treats empty titles as unique', () => {
  const input = [
    article('1', '', 'sub-a'),
    article('2', '', 'sub-b'),
  ]
  const out = dedupeArticlesByTitle(input)
  assert.equal(out.length, 2)
})

test('articleContentDedupeKey prefers Twitter status over title', async () => {
  const { articleContentDedupeKey } = await import('../packages/news-feed/dist/dedupe.js')
  const { buildTwitterStatusDedupeKey } = await import('../packages/news-feed/dist/twitter-guid.js')

  const statusId = '1234567890'
  const key = articleContentDedupeKey({
    id: 'a',
    title: '[视频]',
    link: `https://x.com/u/status/${statusId}`,
    guid: '',
  })
  assert.equal(key, buildTwitterStatusDedupeKey(statusId))
})
