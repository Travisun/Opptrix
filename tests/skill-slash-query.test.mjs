import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { skillMatchesSlashQuery } from '../client-ui/src/chat/skillDisplay.ts'

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

  it('still matches Chinese title', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, '网页'), true)
  })

  it('rejects unrelated query', () => {
    assert.equal(skillMatchesSlashQuery(createWeb, 'dcf'), false)
  })
})
