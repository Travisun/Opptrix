import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  humanizeChatTitle,
} from '@opptrix/shared/chat-title-display'

describe('humanizeChatTitle', () => {
  it('replaces @skill with Chinese title', () => {
    const out = humanizeChatTitle('请运行 @skill:morning-market-brief')
    assert.match(out, /早报/)
    assert.doesNotMatch(out, /@skill:/)
  })

  it('uses lookup for bare instrument codes', () => {
    const lookup = new Map([['CN:STOCK:600519.SH', '贵州茅台']])
    assert.equal(humanizeChatTitle('分析 CN:STOCK:600519.SH', lookup), '分析 贵州茅台')
  })

  it('prefers name in 名称(CODE) when name is readable', () => {
    const lookup = new Map()
    assert.equal(
      humanizeChatTitle('关注 贵州茅台(CN:STOCK:600519.SH)', lookup),
      '关注 贵州茅台',
    )
  })
})
