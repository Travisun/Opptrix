/**
 * 标的搜索仅 OpptrixQuant 在线；无本地名录灌库 / includeLocal。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('online-only instrument search', () => {
  it('instrument-search-unified has no local merge or marketData dependency', () => {
    const src = readFileSync(
      join(root, 'packages/research-hub/src/instrument-search-unified.ts'),
      'utf8',
    )
    assert.doesNotMatch(src, /includeLocal|searchLocalInstruments|marketData/)
    assert.match(src, /searchInstrumentsOnline/)
  })

  it('hub search handler does not call ensureSearchUniverseReady or return universe_prep', () => {
    const src = readFileSync(join(root, 'packages/research-hub/src/hub.ts'), 'utf8')
    const handler = src.slice(
      src.indexOf('searchInstrumentsUnifiedHandler'),
      src.indexOf('searchInstrumentsUnifiedHandler') + 1200,
    )
    assert.doesNotMatch(handler, /ensureSearchUniverseReady/)
    assert.doesNotMatch(handler, /universe_prep/)
    assert.doesNotMatch(handler, /includeLocal/)
  })

  it('local instrument search module removed from market-data', () => {
    const src = readFileSync(join(root, 'packages/market-data/src/index.ts'), 'utf8')
    assert.doesNotMatch(src, /searchLocalInstruments|listLocalInstrumentsSummary|search-universe-ready/)
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
