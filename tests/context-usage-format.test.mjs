import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  formatCacheHitLabel,
  formatContextUsageLabel,
  resolveContextUsagePercent,
} from '../client-ui/src/chat/formatTokenCount.ts'

describe('formatCacheHitLabel', () => {
  it('formats cache hit percent', () => {
    assert.equal(formatCacheHitLabel(72), '缓存约 72%')
    assert.equal(formatCacheHitLabel(0), '缓存约 0%')
    assert.equal(formatCacheHitLabel(150), '缓存约 100%')
    assert.equal(formatCacheHitLabel(-3), '缓存约 0%')
  })
})

describe('formatContextUsageLabel with cache', () => {
  it('context label unchanged', () => {
    assert.equal(formatContextUsageLabel(42), '上下文约 42%')
    assert.equal(formatContextUsageLabel(42, true), '上下文约 42% · 已整理')
  })

  it('resolveContextUsagePercent still works', () => {
    assert.equal(resolveContextUsagePercent({ usagePercent: 55, usedTokens: 1, limitTokens: 100 }), 55)
  })
})
