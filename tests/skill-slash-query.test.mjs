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

  it('uses last slash as new trigger when typing path-like query', () => {
    const text = '/create/web'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, 'web')
    assert.equal(trigger.startIndex, 7)
  })

  it('still opens for compact english id', () => {
    const text = '/createweb'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, 'createweb')
  })

  it('opens after whitespace-prefixed slash', () => {
    const text = 'hello /选股'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '选股')
    assert.equal(trigger.startIndex, 6)
  })

  it('opens after Chinese text without space before slash', () => {
    const text = '看看茅台/'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '')
    assert.equal(trigger.startIndex, 4)
  })

  it('opens mid-Chinese with query after slash', () => {
    const text = '帮我/选股'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '选股')
    assert.equal(trigger.startIndex, 2)
  })

  it('opens after Chinese mid-query without trailing slash only', () => {
    const text = '看看茅台/选'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '选')
    assert.equal(trigger.startIndex, 4)
  })

  it('opens after latin letters without space', () => {
    const text = 'report/'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '')
    assert.equal(trigger.startIndex, 6)
  })

  it('opens trailing skill after earlier path slash', () => {
    const text = 'foo/bar 然后 /技能'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '技能')
    assert.equal(trigger.startIndex, text.lastIndexOf('/'))
  })

  it('opens trailing skill after earlier http URL', () => {
    const text = '前文 http://x.com 然后 /技能'
    const trigger = findSlashTrigger(text, text.length)
    assert.ok(trigger)
    assert.equal(trigger.query, '技能')
  })

  it('does not open for http:// trailing slash', () => {
    const text = 'http://'
    assert.equal(findSlashTrigger(text, text.length), null)
  })

  it('does not open for https:// trailing slash', () => {
    const text = 'https://'
    assert.equal(findSlashTrigger(text, text.length), null)
  })

  it('does not open for double slash (second slash)', () => {
    const text = 'foo//'
    assert.equal(findSlashTrigger(text, text.length), null)
  })

  it('closes when last valid slash query embeds protocol slashes', () => {
    const text = '/选股http://'
    assert.equal(findSlashTrigger(text, text.length), null)
  })
})
