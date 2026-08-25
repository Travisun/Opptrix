import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSortOrders,
  compareDefaultProviderOrder,
  computeEffectiveRanks,
  defaultManifestTierPriority,
  derivedProviderDisplaySortKey,
  providerRequiresApiKey,
  RECOMMENDED_PROVIDER_DISPLAY_ORDER,
  sortOrderToEffectivePriority,
  sortProvidersForCatalog,
} from '@opptrix/shared'

function row(partial) {
  return {
    title: partial.providerId,
    sortOrder: null,
    requiresApiKey: true,
    manifestDefaultPriority: 0,
    ...partial,
  }
}

describe('provider-priority-order', () => {
  it('orders recommended stack by manifestDefaultPriority without API-key demotion', () => {
    const tonghuashun = row({
      providerId: 'tonghuashun',
      title: '同花顺',
      requiresApiKey: true,
      manifestDefaultPriority: 120,
    })
    const stockindex = row({
      providerId: 'stockindex',
      title: 'Opptrix量化',
      requiresApiKey: true,
      manifestDefaultPriority: 115,
    })
    const tickflow = row({
      providerId: 'tickflow',
      title: 'TickFlow',
      // 密钥可选 → requiresApiKey=false，不得因此排到 Tushare 后
      requiresApiKey: false,
      manifestDefaultPriority: 110,
    })
    const tushare = row({
      providerId: 'tushare',
      title: 'Tushare',
      requiresApiKey: true,
      manifestDefaultPriority: 105,
    })
    const binance = row({
      providerId: 'binance',
      title: 'Binance',
      requiresApiKey: false,
      manifestDefaultPriority: 100,
    })
    const okx = row({
      providerId: 'okx',
      title: 'OKX',
      requiresApiKey: false,
      manifestDefaultPriority: 90,
    })
    const sorted = sortProvidersForCatalog([
      okx, tushare, binance, tickflow, stockindex, tonghuashun,
    ])
    assert.deepEqual(
      sorted.map(p => p.providerId),
      [...RECOMMENDED_PROVIDER_DISPLAY_ORDER],
    )
  })

  it('interleaves providers without sortOrder using derived recommended keys', () => {
    const tonghuashun = row({
      providerId: 'tonghuashun',
      title: '同花顺',
      sortOrder: 0,
      manifestDefaultPriority: 120,
    })
    const tickflow = row({
      providerId: 'tickflow',
      title: 'TickFlow',
      sortOrder: 20,
      requiresApiKey: false,
      manifestDefaultPriority: 110,
    })
    const tushare = row({
      providerId: 'tushare',
      title: 'Tushare',
      sortOrder: 30,
      manifestDefaultPriority: 105,
    })
    // 新加源无 sortOrder，不得甩到最后
    const stockindex = row({
      providerId: 'stockindex',
      title: 'Opptrix量化',
      sortOrder: null,
      manifestDefaultPriority: 115,
    })
    const sorted = sortProvidersForCatalog([tushare, tickflow, stockindex, tonghuashun])
    assert.deepEqual(sorted.map(p => p.providerId), [
      'tonghuashun',
      'stockindex',
      'tickflow',
      'tushare',
    ])
    assert.equal(derivedProviderDisplaySortKey(stockindex), 10)
  })

  it('puts TickFlow before Tushare even when TickFlow does not require API key', () => {
    const tickflow = row({
      providerId: 'tickflow',
      title: 'TickFlow',
      requiresApiKey: false,
      manifestDefaultPriority: 110,
    })
    const tushare = row({
      providerId: 'tushare',
      title: 'Tushare',
      requiresApiKey: true,
      manifestDefaultPriority: 105,
    })
    assert.ok(compareDefaultProviderOrder(tickflow, tushare) < 0)
  })

  it('respects explicit sortOrder over tier defaults', () => {
    const a = row({
      providerId: 'a',
      title: 'A',
      sortOrder: 20,
      requiresApiKey: false,
      manifestDefaultPriority: 10,
    })
    const b = row({
      providerId: 'b',
      title: 'B',
      sortOrder: 0,
      requiresApiKey: true,
      manifestDefaultPriority: 90,
    })
    const sorted = sortProvidersForCatalog([a, b])
    assert.deepEqual(sorted.map(p => p.providerId), ['b', 'a'])
  })

  it('maps sortOrder to descending effective priority', () => {
    assert.equal(sortOrderToEffectivePriority(0), 10_000)
    assert.equal(sortOrderToEffectivePriority(10), 9_990)
  })

  it('assigns stepped sort orders for drag save and recommended stack', () => {
    assert.deepEqual(assignSortOrders(['x', 'y']), [
      { providerId: 'x', sortOrder: 0 },
      { providerId: 'y', sortOrder: 10 },
    ])
    assert.deepEqual(
      assignSortOrders([...RECOMMENDED_PROVIDER_DISPLAY_ORDER]).map(x => x.providerId),
      [...RECOMMENDED_PROVIDER_DISPLAY_ORDER],
    )
  })

  it('computes effective ranks only for eligible providers', () => {
    const ranks = computeEffectiveRanks([
      { providerId: 'a', priorityEligible: true },
      { providerId: 'b', priorityEligible: false },
      { providerId: 'c', priorityEligible: true },
    ])
    assert.equal(ranks.get('a'), 1)
    assert.equal(ranks.get('b'), undefined)
    assert.equal(ranks.get('c'), 2)
  })

  it('detects required secret fields', () => {
    assert.equal(providerRequiresApiKey([
      { key: 'token', type: 'secret', label: 'Token', required: true },
    ]), true)
    assert.equal(providerRequiresApiKey([
      { key: 'token', type: 'secret', label: 'Token', required: false },
    ]), false)
  })

  it('tiers default manifest priority with Tonghuashun on top without demoting optional-key sources', () => {
    assert.ok(defaultManifestTierPriority('tonghuashun', true, 120)
      > defaultManifestTierPriority('stockindex', true, 115))
    assert.ok(defaultManifestTierPriority('stockindex', true, 115)
      > defaultManifestTierPriority('tickflow', false, 110))
    assert.ok(defaultManifestTierPriority('tickflow', false, 110)
      > defaultManifestTierPriority('tushare', true, 105))
    assert.ok(defaultManifestTierPriority('tushare', true, 105)
      > defaultManifestTierPriority('binance', false, 100))
  })
})
