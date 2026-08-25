/**
 * 搜索主路径不再依赖名录预热：统一搜索默认 includeLocal=false，
 * Hub 搜索 handler 不再调用 ensureSearchUniverseReady / 返回 universe_prep。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('search path without universe prep', () => {
  it('instrument-search-unified defaults includeLocal to false', () => {
    const src = readFileSync(
      join(root, 'packages/research-hub/src/instrument-search-unified.ts'),
      'utf8',
    )
    assert.match(src, /includeLocal === true/)
    assert.doesNotMatch(src, /includeLocal !== false/)
  })

  it('hub search handler does not call ensureSearchUniverseReady or return universe_prep', () => {
    const src = readFileSync(join(root, 'packages/research-hub/src/hub.ts'), 'utf8')
    const handler = src.slice(
      src.indexOf('searchInstrumentsUnifiedHandler'),
      src.indexOf('searchInstrumentsUnifiedHandler') + 1200,
    )
    assert.doesNotMatch(handler, /ensureSearchUniverseReady/)
    assert.doesNotMatch(handler, /universe_prep/)
  })

  it('online search is OpptrixQuant-only (no Fuyao/Tickflow orchestration)', () => {
    const src = readFileSync(
      join(root, 'packages/a-stock-layer/src/search/instrument-search.ts'),
      'utf8',
    )
    assert.match(src, /opptrixInstrumentSearch/)
    assert.doesNotMatch(src, /searchFuyao|FuyaoClient|searchTickflow|TickflowClient/)
  })
})
