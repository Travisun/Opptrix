import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findSlashTrigger, skillMatchesSlashQuery } from '../client-ui/src/chat/skillDisplay.ts'

const createWeb = {
  name: 'create-web',
  description: 'Generate a standalone web research report',
  metadata: {
    title: '网页报告',
    summary: '一页可读的投研网页',
  },
}

describe('skillMatchesSlashQuery', () => {
  it('matches hyphenated skill id with underscore query', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'create_web'), true)
  })

  it('matches dotted query against hyphenated id', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'create.web'), true)
  })

  it('still matches exact hyphenated id', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'create-web'), true)
  })

  it('matches compact id without separators', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'createweb'), true)
  })

  it('matches multi-word spaced query (AND tokens)', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'create web'), true)
  })

  it('matches tokens from description (web report)', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'web report'), true)
  })

  it('still matches Chinese title', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, '网页'), true)
  })

  it('rejects unrelated query', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'dcf'), false)
  })
})

describe('findSlashTrigger', () => {
  it('keeps panel open when query contains spaces', () => {
    const text = '/create web'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, 'create web')
    assert.equal(trigger.startIndex, 0)
  })

  it('closes when a second slash appears in query', () => {
    const text = '/create/web'
    assert.equal(findSlashTrigger(text, text.length), null)
  })

  it('still opens for compact english id', () => {
    const text = '/createweb'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, 'createweb')
  })
})
