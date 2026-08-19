import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isCommunityMetaTopic,
  parseTopicTags,
  resolveTopicDisplayTitle,
} from '../apps/server/dist/community-topic-utils.js'

test('parseTopicTags accepts string tags', () => {
  assert.deepEqual(parseTopicTags(['量化', '策略']), ['量化', '策略'])
})

test('parseTopicTags accepts Discourse tag objects', () => {
  assert.deepEqual(
    parseTopicTags([{ id: 63, name: '自我介绍', slug: '63-tag' }]),
    ['自我介绍'],
  )
})

test('resolveTopicDisplayTitle prefers unicode_title', () => {
  assert.equal(
    resolveTopicDisplayTitle('欢迎来到 Opptrix！:wave:', '欢迎来到 Opptrix！👋'),
    '欢迎来到 Opptrix！👋',
  )
})

test('isCommunityMetaTopic detects category intro topics', () => {
  assert.equal(isCommunityMetaTopic('关于「投研策略」'), true)
  assert.equal(isCommunityMetaTopic('About the Lounge category'), true)
  assert.equal(isCommunityMetaTopic('事件驱动第一步不是预判'), false)
})
